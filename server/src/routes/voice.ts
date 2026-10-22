import { raw, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { transcriptSchema } from '../contracts/voice';
import { sendError, type ApiErrorCode } from '../lib/api-error';
import { requireHousehold } from '../lib/household';
import { createRateLimiter } from '../lib/rate-limit';
import { createSafeRouter } from '../lib/router';
import pool from '../db/pool';
import { OpenRouterService } from '../services/openrouter.service';
import { EmbeddingService } from '../services/embedding.service';
import { SpeechService } from '../services/speech.service';

const router = createSafeRouter();
router.use(authMiddleware);
router.use(requireHousehold);

const transcribeRateLimiter = createRateLimiter({
  keyPrefix: 'voice-transcribe',
  windowMs: 60_000,
  max: 10,
  message: 'You have reached the temporary transcription limit. Try again in a minute.',
});

const voiceCommandRateLimiter = createRateLimiter({
  keyPrefix: 'voice-command',
  windowMs: 60_000,
  max: 20,
  message: 'You have reached the temporary voice request limit. Try again in a minute.',
});

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/ogg;codecs=opus',
]);

router.get('/config', (_req: AuthRequest, res: Response) => {
  res.json({
    providerConfigured: SpeechService.isConfigured(),
    language: process.env.DEEPGRAM_LANGUAGE || 'en',
  });
});

router.post('/transcribe', transcribeRateLimiter, raw({ type: '*/*', limit: '12mb' }), async (req: AuthRequest, res: Response) => {
  try {
    const mimeType = String(req.headers['content-type'] || 'audio/webm').toLowerCase();
    if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
      sendError(res, 400, 'BAD_REQUEST', 'Unsupported audio format.');
      return;
    }

    const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    const result = await SpeechService.transcribe(audio, mimeType);
    res.json(result);
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const code = (error?.code || 'INTERNAL_ERROR') as ApiErrorCode;
    sendError(res, status, code, error?.message || 'Could not transcribe the audio.');
  }
});

type VoiceStatus = 'success' | 'needs_review' | 'fallback';
type VoiceEnvelope<T extends Record<string, unknown>> = {
  status: VoiceStatus;
  message: string;
  code?: ApiErrorCode | string;
  retryable?: boolean;
  transcript?: string;
} & T;

function sendVoiceEnvelope<T extends Record<string, unknown>>(
  res: Response,
  payload: VoiceEnvelope<T>
) {
  res.json(payload);
}

function classifyVoiceError(err: unknown) {
  const message = String((err as Error | undefined)?.message || '').toLowerCase();

  if (message.includes('not configured') || message.includes('deepgram')) {
    return {
      code: 'PROVIDER_UNAVAILABLE' as const,
      retryable: false,
      message: 'Voice is not configured right now.',
    };
  }

  if (message.includes('openrouter api error') || message.includes('fetch failed')) {
    return {
      code: 'PROVIDER_UNAVAILABLE' as const,
      retryable: true,
      message: 'I could not reach the AI provider. Please try again in a moment.',
    };
  }

  if (message.includes('invalid json') || message.includes('invalid response')) {
    return {
      code: 'INVALID_RESPONSE' as const,
      retryable: true,
      message: 'The AI response was not clear enough. Try again or use the manual option.',
    };
  }

  return {
    code: 'PROCESSING_FAILED' as const,
    retryable: true,
    message: 'I could not process the voice request. Try again or use the manual option.',
  };
}

router.post('/shopping', voiceCommandRateLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'A transcript is required.', parsed.error.flatten());
    return;
  }

  try {
    const result = await OpenRouterService.parseVoiceShopping(parsed.data.transcript);
    const items = (result.items || [])
      .map((item) => ({
        name: String(item.name || '').trim(),
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      }))
      .filter((item) => item.name.length > 0);

    if (items.length === 0) {
      sendVoiceEnvelope(res, {
        status: 'fallback',
        code: 'no_items',
        retryable: false,
        transcript: parsed.data.transcript,
        message: 'I did not detect clear items in your request. Please try again or add them manually.',
        items: [],
      });
      return;
    }

    sendVoiceEnvelope(res, {
      status: 'needs_review',
      code: 'review_required',
      retryable: true,
      transcript: parsed.data.transcript,
      message: result.message || 'I detected these items. Review them before adding.',
      items,
    });
  } catch (err) {
    sendVoiceEnvelope(res, {
      status: 'fallback',
      transcript: parsed.data.transcript,
      items: [],
      ...classifyVoiceError(err),
    });
  }
});

router.post('/recipes', voiceCommandRateLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'A transcript is required.', parsed.error.flatten());
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      sendError(res, 400, 'BAD_REQUEST', 'Missing user household.');
      return;
    }

    const transcriptEmbedding = await EmbeddingService.generate(parsed.data.transcript);
    const dbLimit = parseInt(process.env.VOICE_RECIPE_DB_LIMIT || '10', 10);
    const suggestionLimit = parseInt(process.env.VOICE_RECIPE_SUGGESTION_LIMIT || '3', 10);

    const { rows: recipeRows } = await pool.query(
      `SELECT r.id, r.title, r.instructions, r.prep_time_minutes,
              array_agg(ri.name) as ingredients,
              (r.embedding <=> $2) as distance
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
       WHERE r.household_id = $1
       GROUP BY r.id
       ORDER BY distance ASC
       LIMIT $3`,
      [householdId, JSON.stringify(transcriptEmbedding), dbLimit]
    );

    const existingRecipes = recipeRows.map((recipe: any) => ({
      id: recipe.id,
      title: recipe.title,
      ingredients: recipe.ingredients || [],
      instructions: recipe.instructions,
      prep_time_minutes: recipe.prep_time_minutes,
    }));

    const result = await OpenRouterService.parseVoiceRecipes(
      parsed.data.transcript,
      existingRecipes,
      suggestionLimit
    );

    for (const suggested of result.recipes) {
      const match = existingRecipes.find(
        (recipe: any) => recipe.title.toLowerCase().trim() === suggested.name.toLowerCase().trim()
      );
      if (!match) {
        continue;
      }
      suggested.id = match.id;
      suggested.instructions = match.instructions || suggested.instructions;
      suggested.ingredients = match.ingredients.length > 0 ? match.ingredients : suggested.ingredients;
      suggested.time = match.prep_time_minutes ? `${match.prep_time_minutes} min` : suggested.time;
    }

    if (!result.recipes.length) {
      sendVoiceEnvelope(res, {
        status: 'fallback',
        code: 'no_matches',
        retryable: false,
        transcript: parsed.data.transcript,
        message: 'I found no useful recipes for that request. Try other ingredients or use manual search.',
        recipes: [],
      });
      return;
    }

    sendVoiceEnvelope(res, {
      status: 'needs_review',
      code: 'review_required',
      retryable: true,
      transcript: parsed.data.transcript,
      message: result.message || 'I prepared some options for you to review.',
      recipes: result.recipes,
    });
  } catch (err) {
    sendVoiceEnvelope(res, {
      status: 'fallback',
      transcript: parsed.data.transcript,
      recipes: [],
      ...classifyVoiceError(err),
    });
  }
});

router.post('/recipe-command', voiceCommandRateLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'A transcript is required.', parsed.error.flatten());
    return;
  }

  const { transcript, recipeId } = parsed.data;
  const householdId = req.user?.householdId;

  if (!householdId) {
    sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized.');
    return;
  }

  if (!recipeId) {
    sendError(res, 400, 'BAD_REQUEST', 'Recipe ID is required for this command');
    return;
  }

  try {
    const { rows: recipeRows } = await pool.query(
      `SELECT r.*, array_agg(ri.name) as ingredient_names
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
       WHERE r.id = $1 AND r.household_id = $2
       GROUP BY r.id`,
      [recipeId, householdId]
    );

    if (!recipeRows.length) {
      sendError(res, 404, 'NOT_FOUND', 'Recipe not found.');
      return;
    }

    const currentRecipe = recipeRows[0];
    const result = await OpenRouterService.processRecipeCommand(transcript, {
      title: currentRecipe.title,
      ingredients: currentRecipe.ingredient_names || [],
      instructions: currentRecipe.instructions,
    });

    if (result.modifiedRecipe) {
      try {
        const macros = await OpenRouterService.calculateMacros(
          result.modifiedRecipe.title,
          result.modifiedRecipe.ingredients.map((ingredient) => ingredient.originalText || ingredient.name),
          result.modifiedRecipe.servings || 1
        );
        Object.assign(result.modifiedRecipe, macros);
      } catch {
        // Macro enrichment is opportunistic here.
      }
    }

    sendVoiceEnvelope(res, {
      status: result.modifiedRecipe ? 'needs_review' : 'success',
      code: result.modifiedRecipe ? 'review_required' : undefined,
      retryable: false,
      transcript,
      message: result.message,
      modified: Boolean(result.modifiedRecipe),
      proposedRecipe: result.modifiedRecipe || null,
    });
  } catch (err) {
    sendVoiceEnvelope(res, {
      status: 'fallback',
      transcript,
      modified: false,
      proposedRecipe: null,
      ...classifyVoiceError(err),
    });
  }
});

export default router;

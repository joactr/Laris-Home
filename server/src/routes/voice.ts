import { raw, Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { transcriptSchema } from '../contracts/voice';
import { sendError, type ApiErrorCode } from '../lib/api-error';
import { createRateLimiter } from '../lib/rate-limit';
import pool from '../db/pool';
import { OpenRouterService } from '../services/openrouter.service';
import { EmbeddingService } from '../services/embedding.service';
import { SpeechService } from '../services/speech.service';

const router = Router();
router.use(authMiddleware);

const transcribeRateLimiter = createRateLimiter({
  keyPrefix: 'voice-transcribe',
  windowMs: 60_000,
  max: 10,
  message: 'Has alcanzado el limite temporal de transcripciones. Intentalo de nuevo en un minuto.',
});

const voiceCommandRateLimiter = createRateLimiter({
  keyPrefix: 'voice-command',
  windowMs: 60_000,
  max: 20,
  message: 'Has alcanzado el limite temporal de solicitudes de voz. Intentalo de nuevo en un minuto.',
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
    language: process.env.DEEPGRAM_LANGUAGE || 'es',
  });
});

router.post('/transcribe', transcribeRateLimiter, raw({ type: '*/*', limit: '12mb' }), async (req: AuthRequest, res: Response) => {
  try {
    const mimeType = String(req.headers['content-type'] || 'audio/webm').toLowerCase();
    if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
      sendError(res, 400, 'BAD_REQUEST', 'El formato de audio no es compatible.');
      return;
    }

    const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    const result = await SpeechService.transcribe(audio, mimeType);
    res.json(result);
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const code = (error?.code || 'INTERNAL_ERROR') as ApiErrorCode;
    sendError(res, status, code, error?.message || 'No se pudo transcribir el audio.');
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
      message: 'La funcion de voz no esta configurada ahora mismo.',
    };
  }

  if (message.includes('openrouter api error') || message.includes('fetch failed')) {
    return {
      code: 'PROVIDER_UNAVAILABLE' as const,
      retryable: true,
      message: 'No he podido contactar con el proveedor de IA. Puedes reintentarlo en un momento.',
    };
  }

  if (message.includes('invalid json') || message.includes('invalid response')) {
    return {
      code: 'INVALID_RESPONSE' as const,
      retryable: true,
      message: 'La respuesta de IA no fue lo bastante clara. Intentalo de nuevo o usa la opcion manual.',
    };
  }

  return {
    code: 'PROCESSING_FAILED' as const,
    retryable: true,
    message: 'No he podido procesar la solicitud de voz. Intentalo de nuevo o usa la opcion manual.',
  };
}

router.post('/shopping', voiceCommandRateLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'La transcripcion es obligatoria.', parsed.error.flatten());
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
        message: 'No he detectado articulos claros en tu peticion. Puedes reintentarlo o anadirlos manualmente.',
        items: [],
      });
      return;
    }

    sendVoiceEnvelope(res, {
      status: 'needs_review',
      code: 'review_required',
      retryable: true,
      transcript: parsed.data.transcript,
      message: result.message || 'He detectado estos articulos. Revisalos antes de anadirlos.',
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
    sendError(res, 400, 'VALIDATION_ERROR', 'La transcripcion es obligatoria.', parsed.error.flatten());
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      sendError(res, 400, 'BAD_REQUEST', 'Falta el household del usuario.');
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
        message: 'No he encontrado recetas utiles con esa peticion. Puedes probar con otros ingredientes o usar la busqueda manual.',
        recipes: [],
      });
      return;
    }

    sendVoiceEnvelope(res, {
      status: 'needs_review',
      code: 'review_required',
      retryable: true,
      transcript: parsed.data.transcript,
      message: result.message || 'He preparado algunas opciones para que las revises.',
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
    sendError(res, 400, 'VALIDATION_ERROR', 'La transcripcion es obligatoria.', parsed.error.flatten());
    return;
  }

  const { transcript, recipeId } = parsed.data;
  const householdId = req.user?.householdId;

  if (!householdId) {
    sendError(res, 401, 'UNAUTHORIZED', 'No autorizado.');
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
      sendError(res, 404, 'NOT_FOUND', 'Receta no encontrada.');
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

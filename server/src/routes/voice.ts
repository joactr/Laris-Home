import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { OpenRouterService } from '../services/openrouter.service';
import { EmbeddingService } from '../services/embedding.service';
import pool from '../db/pool';

const router = Router();
router.use(authMiddleware);

router.get('/config', (req: AuthRequest, res: Response) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const language = process.env.DEEPGRAM_LANGUAGE || 'es';
  const endpointing = process.env.DEEPGRAM_ENDPOINTING || '2000';
  
  if (!apiKey) {
    res.status(500).json({ error: 'Deepgram API key not configured' });
    return;
  }
  
  res.json({ apiKey, language, endpointing });
});

const TranscriptSchema = z.object({
  transcript: z.string().min(1),
  recipeId: z.string().optional()
});

type VoiceStatus = 'success' | 'needs_review' | 'fallback';

type VoiceEnvelope<T extends Record<string, unknown>> = {
  status: VoiceStatus;
  message: string;
  code?: string;
  retryable?: boolean;
  transcript?: string;
} & T;

function sendVoiceEnvelope<T extends Record<string, unknown>>(res: Response, payload: VoiceEnvelope<T>) {
  res.json(payload);
}

function classifyVoiceError(err: any) {
  const message = String(err?.message || '').toLowerCase();

  if (message.includes('not configured')) {
    return {
      code: 'provider_unavailable',
      retryable: false,
      message: 'La función de voz no está configurada ahora mismo.',
    };
  }

  if (message.includes('openrouter api error') || message.includes('fetch failed')) {
    return {
      code: 'provider_unavailable',
      retryable: true,
      message: 'No he podido contactar con el proveedor de IA. Puedes reintentarlo en un momento.',
    };
  }

  if (message.includes('invalid json')) {
    return {
      code: 'invalid_response',
      retryable: true,
      message: 'La respuesta de IA no fue lo bastante clara. Inténtalo de nuevo o usa la opción manual.',
    };
  }

  return {
    code: 'processing_failed',
    retryable: true,
    message: 'No he podido procesar la solicitud de voz. Inténtalo de nuevo o usa la opción manual.',
  };
}

router.post('/shopping', async (req: AuthRequest, res: Response) => {
  const parsed = TranscriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
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
        message: 'No he detectado artículos claros en tu petición. Puedes reintentarlo o añadirlos manualmente.',
        items: [],
      });
      return;
    }

    sendVoiceEnvelope(res, {
      status: 'needs_review',
      code: 'review_required',
      retryable: true,
      transcript: parsed.data.transcript,
      message: result.message || 'He detectado estos artículos. Revísalos antes de añadirlos.',
      items,
    });
  } catch (err: any) {
    console.error('Voice Shopping Error:', err);
    sendVoiceEnvelope(res, {
      status: 'fallback',
      transcript: parsed.data.transcript,
      items: [],
      ...classifyVoiceError(err),
    });
  }
});

router.post('/recipes', async (req: AuthRequest, res: Response) => {
  const parsed = TranscriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      res.status(400).json({ error: 'Household ID missing' });
      return;
    }

    // Generate embedding for the user request
    const transcriptEmbedding = await EmbeddingService.generate(parsed.data.transcript);

    // Get configurable limits
    const dbLimit = parseInt(process.env.VOICE_RECIPE_DB_LIMIT || '10');
    const suggestionLimit = parseInt(process.env.VOICE_RECIPE_SUGGESTION_LIMIT || '3');

    // Fetch top relevant recipes using pgvector (cosine distance)
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

    const existingRecipes = recipeRows.map((r: any) => ({
      id: r.id,
      title: r.title,
      ingredients: r.ingredients || [],
      instructions: r.instructions,
      prep_time_minutes: r.prep_time_minutes
    }));

    const result = await OpenRouterService.parseVoiceRecipes(parsed.data.transcript, existingRecipes, suggestionLimit);

    // Cross-match suggested names with existing ones to ensure ID is present
    for (const suggested of result.recipes) {
      const match = existingRecipes.find((r: any) => r.title.toLowerCase().trim() === suggested.name.toLowerCase().trim());
      if (match) {
        suggested.id = match.id;
        // Since LLM already saw the ingredients, we can trust its representation 
        // but if it's an existing recipe, we might want to ensure it has the original DB values
        suggested.instructions = match.instructions || suggested.instructions;
        suggested.ingredients = match.ingredients.length > 0 ? match.ingredients : suggested.ingredients;
        suggested.time = match.prep_time_minutes ? `${match.prep_time_minutes} min` : suggested.time;
      }
    }

    if (!result.recipes?.length) {
      sendVoiceEnvelope(res, {
        status: 'fallback',
        code: 'no_matches',
        retryable: false,
        transcript: parsed.data.transcript,
        message: 'No he encontrado recetas útiles con esa petición. Puedes probar con otros ingredientes o usar la búsqueda manual.',
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
  } catch (err: any) {
    console.error('Voice Recipes Error:', err);
    sendVoiceEnvelope(res, {
      status: 'fallback',
      transcript: parsed.data.transcript,
      recipes: [],
      ...classifyVoiceError(err),
    });
  }
});

router.post('/recipe-command', async (req: AuthRequest, res: Response) => {
  const parsed = TranscriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { transcript, recipeId } = parsed.data;
  const householdId = req.user?.householdId;

  if (!householdId) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  if (!recipeId) {
    res.status(400).json({ error: 'Recipe ID is required for this command' });
    return;
  }

  try {
    // Fetch current recipe
    const { rows: recipeRows } = await pool.query(
      `SELECT r.*, array_agg(ri.name) as ingredient_names
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
       WHERE r.id = $1 AND r.household_id = $2
       GROUP BY r.id`,
      [recipeId, householdId]
    );

    if (recipeRows.length === 0) {
      res.status(404).json({ error: 'Receta no encontrada' });
      return;
    }

    const currentRecipe = recipeRows[0];
    const result = await OpenRouterService.processRecipeCommand(transcript, {
      title: currentRecipe.title,
      ingredients: currentRecipe.ingredient_names || [],
      instructions: currentRecipe.instructions
    });

    if (result.modifiedRecipe) {
      // Recalculate macros for the modified recipe
      try {
        const macros = await OpenRouterService.calculateMacros(
          result.modifiedRecipe.title,
          result.modifiedRecipe.ingredients.map((i: any) => i.originalText || i.name),
          result.modifiedRecipe.servings || 1
        );
        Object.assign(result.modifiedRecipe, macros);
      } catch (e) {
        console.error('Failed to recalculate macros during voice modification:', e);
      }

      // Return the proposed recipe to the frontend for confirmation
      sendVoiceEnvelope(res, {
        status: 'needs_review',
        code: 'review_required',
        retryable: true,
        transcript,
        message: result.message,
        proposedRecipe: result.modifiedRecipe,
        modified: true
      });
    } else {
      sendVoiceEnvelope(res, {
        status: 'success',
        code: 'answered',
        retryable: true,
        transcript,
        message: result.message,
        modified: false
      });
    }
  } catch (err: any) {
    console.error('Voice Recipe Command Error:', err);
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

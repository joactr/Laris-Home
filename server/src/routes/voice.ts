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
  transcript: z.string().min(1)
});

router.post('/shopping', async (req: AuthRequest, res: Response) => {
  const parsed = TranscriptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await OpenRouterService.parseVoiceShopping(parsed.data.transcript);
    res.json(result);
  } catch (err: any) {
    console.error('Voice Shopping Error:', err);
    res.status(500).json({ error: 'Error procesando la solicitud de compras por voz.' });
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

    res.json(result);
  } catch (err: any) {
    console.error('Voice Recipes Error:', err);
    res.status(500).json({ error: 'Error procesando la solicitud de recetas por voz.' });
  }
});

export default router;

import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { OpenRouterService } from '../services/openrouter.service';

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
    const result = await OpenRouterService.parseVoiceRecipes(parsed.data.transcript);
    res.json(result);
  } catch (err: any) {
    console.error('Voice Recipes Error:', err);
    res.status(500).json({ error: 'Error procesando la solicitud de recetas por voz.' });
  }
});

export default router;

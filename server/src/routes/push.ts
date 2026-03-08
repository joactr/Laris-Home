import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getVapidPublicKey, sendPushNotification } from '../services/push.service';

const router = Router();
router.use(authMiddleware);

router.get('/vapid-public-key', (_req, res) => {
  const publicKey = getVapidPublicKey();
  console.log('[Push] VAPID Public Key requested, returning:', publicKey ? 'PRESENT' : 'MISSING');
  res.json({ publicKey });
});

router.post('/test-me', async (req: AuthRequest, res: Response) => {
  console.log(`[Push] Test notification requested by user ${req.user!.id}`);
  await sendPushNotification(req.user!.id, {
    title: 'Test de Notificación',
    body: 'Si recibes esto, el sistema push está funcionando correctamente.',
    url: '/'
  });
  res.json({ ok: true, message: 'Test push attempted' });
});

router.post('/subscribe', async (req: AuthRequest, res: Response) => {
  const { subscription } = req.body;
  const userId = req.user!.id;
  console.log(`[Push] New subscription attempt for user ${userId}`);

  try {
    // Check if subscription already exists for this user to avoid duplicates
    const { rows } = await pool.query(
      'SELECT id FROM push_subscriptions WHERE user_id = $1 AND subscription = $2',
      [userId, JSON.stringify(subscription)]
    );

    if (rows.length === 0) {
      await pool.query(
        'INSERT INTO push_subscriptions (user_id, subscription) VALUES ($1, $2)',
        [userId, JSON.stringify(subscription)]
      );
    }

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

export default router;

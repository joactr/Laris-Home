import { Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendError } from '../lib/api-error';
import { createRateLimiter } from '../lib/rate-limit';
import { createSafeRouter } from '../lib/router';
import { getVapidPublicKey, sendPushNotification } from '../services/push.service';

const router = createSafeRouter();
router.use(authMiddleware);

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

const testRateLimiter = createRateLimiter({
  keyPrefix: 'push-test',
  windowMs: 60_000,
  max: 3,
  message: 'Too many test notifications. Wait a minute.',
});

router.get('/vapid-public-key', (_req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({ publicKey });
});

router.post('/test-me', testRateLimiter, async (req: AuthRequest, res: Response) => {
  await sendPushNotification(req.user!.id, {
    title: 'Notification test',
    body: 'If you receive this, push is working correctly.',
    url: '/'
  });
  res.json({ ok: true, message: 'Test push attempted' });
});

router.post('/subscribe', async (req: AuthRequest, res: Response) => {
  const parsed = SubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Push subscription is not valid.', parsed.error.flatten());
    return;
  }

  const { subscription } = parsed.data;
  const userId = req.user!.id;

  try {
    const { rows } = await pool.query(
      "SELECT id FROM push_subscriptions WHERE user_id = $1 AND subscription->>'endpoint' = $2",
      [userId, subscription.endpoint]
    );

    if (rows.length === 0) {
      await pool.query(
        'INSERT INTO push_subscriptions (user_id, subscription) VALUES ($1, $2)',
        [userId, JSON.stringify(subscription)]
      );
    }

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to save push subscription', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Could not save subscription.');
  }
});

export default router;

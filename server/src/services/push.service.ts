import webpush from 'web-push';
import pool from '../db/pool';

// Generate VAPID keys if not present in environment
// In a real app, these should be in .env
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const contactEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

console.log('[Push] Initializing service with VAPID keys:', {
  publicKey: vapidPublicKey ? 'PRESENT' : 'MISSING',
  privateKey: vapidPrivateKey ? 'PRESENT' : 'MISSING',
  email: contactEmail
});

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    contactEmail,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn('[Push] VAPID keys missing! Service is not fully initialized');
}

export async function sendPushNotification(userId: string, payload: any) {
  console.log(`[Push] Attempting to send notification to user ${userId}:`, payload.title);
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('[Push] VAPID keys missing, cannot send notification');
    return;
  }

  try {
    const { rows: subscriptions } = await pool.query(
      'SELECT subscription FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    console.log(`[Push] Found ${subscriptions.length} subscriptions for user ${userId}`);

    const notifications = subscriptions.map(row => {
      const subscription = row.subscription;
      return webpush.sendNotification(subscription, JSON.stringify(payload))
        .then(() => console.log(`[Push] Successfully sent to a subscription for ${userId}`))
        .catch((err: any) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            // Subscription has expired or is no longer valid
            return pool.query(
              'DELETE FROM push_subscriptions WHERE subscription = $1',
              [JSON.stringify(subscription)]
            );
          }
          console.error('Error sending push notification:', err);
        });
    });

    await Promise.all(notifications);
  } catch (error) {
    console.error('Failed to send push notifications:', error);
  }
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

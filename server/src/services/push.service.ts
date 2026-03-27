import pool from '../db/pool';

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type PushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

type WebPushModule = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (subscription: PushSubscription, payload: string) => Promise<void>;
};

let webpushModule: WebPushModule | null | undefined;

function getWebPush(): WebPushModule | null {
  if (webpushModule !== undefined) {
    return webpushModule;
  }

  try {
    webpushModule = require('web-push') as WebPushModule;
  } catch (error) {
    console.warn('[Push] web-push module is not installed; push delivery is disabled');
    webpushModule = null;
  }

  return webpushModule;
}

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

const webpush = getWebPush();

if (webpush && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    contactEmail,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn('[Push] VAPID keys missing! Service is not fully initialized');
}

export async function sendPushNotification(userId: string, payload: PushPayload) {
  console.log(`[Push] Attempting to send notification to user ${userId}:`, payload.title);
  const push = getWebPush();

  if (!push) {
    console.warn('[Push] web-push unavailable, skipping notification');
    return;
  }

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

    const notifications = subscriptions.map((row: { subscription: PushSubscription }) => {
      const subscription = row.subscription;
      return push.sendNotification(subscription, JSON.stringify(payload))
        .then(() => console.log(`[Push] Successfully sent to a subscription for ${userId}`))
        .catch((err: { statusCode?: number }) => {
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

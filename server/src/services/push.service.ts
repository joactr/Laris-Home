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

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const contactEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

const webpush = getWebPush();

if (webpush && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    contactEmail,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.warn('[Push] Push delivery disabled: missing VAPID configuration');
}

export async function sendPushNotification(userId: string, payload: PushPayload) {
  const push = getWebPush();

  if (!push) {
    return;
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return;
  }

  try {
    const { rows: subscriptions } = await pool.query(
      'SELECT subscription FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    const notifications = subscriptions.map((row: { subscription: PushSubscription }) => {
      const subscription = row.subscription;
      return push.sendNotification(subscription, JSON.stringify(payload))
        .catch((err: { statusCode?: number }) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            return pool.query(
              'DELETE FROM push_subscriptions WHERE subscription = $1',
              [JSON.stringify(subscription)]
            );
          }
          console.error('Push delivery failed', err);
        });
    });

    await Promise.all(notifications);
  } catch (error) {
    console.error('Push delivery failed', error);
  }
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

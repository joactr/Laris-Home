/**
 * Converts a base64 string to a Uint8Array.
 * Needed for web-push subscription.
 */
export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks for notification permission and subscribes to push notifications
 */
export async function subscribeUserToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Get token from Zustand persistent store
    const authData = localStorage.getItem('laris-home-auth');
    const token = authData ? JSON.parse(authData).state?.token : null;

    if (!token) {
        console.warn('No auth token found, cannot subscribe to push');
        return;
    }

    // Get VAPID public key from server
    const keyResponse = await fetch('/api/push/vapid-public-key', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    const { publicKey } = await keyResponse.json();

    if (!publicKey) {
      console.warn('No VAPID public key found');
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // Send subscription to backend
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ subscription })
    });

    console.log('User is subscribed to push notifications');
  } catch (error) {
    console.error('Failed to subscribe user:', error);
  }
}

/**
 * Request permission for notifications
 */
export async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    return false;
}

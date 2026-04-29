import { api } from '../api';
import { useAuthStore } from '../store/auth';

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
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const token = useAuthStore.getState().token;

    if (!token) {
        return;
    }

    const { publicKey } = await api.push.getVapidPublicKey();

    if (!publicKey) {
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await api.push.subscribe(subscription);
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

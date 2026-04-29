import { request } from './client';

export const pushApi = {
    getVapidPublicKey: () => request<{ publicKey: string }>('/push/vapid-public-key'),
    subscribe: (subscription: PushSubscription) =>
        request<{ ok: boolean }>('/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({ subscription }),
        }),
};

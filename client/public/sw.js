const STATIC_CACHE = 'laris-home-static-v12';
const RUNTIME_CACHE = 'laris-home-runtime-v12';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isCacheableAsset(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.protocol.startsWith('chrome-extension')) return false;
  if (url.search.includes('token=')) return false;
  if (url.pathname.startsWith('/@vite/') || url.pathname.includes('react-refresh')) return false;
  return url.origin === self.location.origin;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!isCacheableAsset(request)) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const cache = await caches.open(STATIC_CACHE);
          cache.put('/index.html', response.clone());
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) {
        return cached;
      }

      const response = await fetch(request);
      if (response && response.status === 200 && response.type === 'basic') {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      return cached || Response.error();
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'Laris Home', {
        body: data.body || 'Tienes una nueva notificacion',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url || '/' },
        vibrate: [100, 50, 100],
      })
    );
  } catch (error) {
    console.error('Push error:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data?.url || '/';
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then(() => ('navigate' in client ? client.navigate(url) : undefined));
        }
      }
      return clients.openWindow ? clients.openWindow(url) : undefined;
    })
  );
});

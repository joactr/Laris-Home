const CACHE_NAME = 'laris-home-v9';
const urlsToCache = [
  '/',
  '/index.html',
];

// Install: Cache initial assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Strategy - Network First, Falling back to Cache
self.addEventListener('fetch', (event) => {
  // Never cache API calls, POST requests, or chrome-extension requests
  if (
    event.request.url.includes('/api/') || 
    event.request.method !== 'GET' ||
    event.request.url.startsWith('chrome-extension://') ||
    event.request.url.includes('localhost:5173') ||
    event.request.url.includes('?token=') || // Vite HMR ping
    event.request.url.includes('/@vite/') || // Vite client
    event.request.url.includes('/@react-refresh')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache valid GET responses to our own origin
        if (
          !response || 
          response.status !== 200 || 
          response.type !== 'basic'
        ) {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // Offline or Network Error: Return from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          
          // Navigation fallback to index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return null;
        });
      })
  );
});

// Push: Handle notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Tienes una nueva notificación',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-silhouette.png',
      data: {
        url: data.url || '/'
      },
      vibrate: [100, 50, 100]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Laris Home', options)
    );
  } catch (e) {
    console.error('Push error:', e);
  }
});

// Notification Click: Handle redirect
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data.url;
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then(() => {
            if (url) return client.navigate(url);
          });
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url || '/');
      }
    })
  );
});

const CACHE_NAME = 'alloy-forge-offline-v4';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

// On install, pre-cache the absolute essentials
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(OFFLINE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('ServiceWorker: Clearing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Handle fetch with Stale-While-Revalidate + Cache-First for stable hashing assets
self.addEventListener('fetch', (event) => {
  // We only run on safe HTTP methods (GET) and ignore external APIs or non-http protocols (e.g. chrome-extension)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // If we have a cached version, return it immediately, but update the cache in the background
      if (cachedResponse) {
        // Fetch background update for dynamic caching refreshment
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            /* Handled gracefully - offline status persists */
          });
          
        return cachedResponse;
      }

      // If not in cache, fetch it from network, then cache and return
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // If network fails completely and request is for main document, return index shell
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
    })
  );
});

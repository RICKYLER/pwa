const CACHE_PREFIXES = ['mswdo-pwa-'];

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys().catch(() => []);
      await Promise.all(
        cacheKeys
          .filter((cacheName) => CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix)))
          .map((cacheName) => caches.delete(cacheName).catch(() => false)),
      );

      await self.registration.unregister();
    })(),
  );
});

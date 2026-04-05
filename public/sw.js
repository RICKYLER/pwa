const MAP_TILE_CACHE = 'mswdo-map-tiles-v2';
const MAP_TILE_CACHE_PREFIX = 'mswdo-map-tiles-';
const RUNTIME_CACHES = [MAP_TILE_CACHE];
const WEATHER_TILE_PATH = '/api/weather/map-tile';
const BASE_TILE_HOSTS = new Set([
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'a.tile-cyclosm.openstreetmap.fr',
  'b.tile-cyclosm.openstreetmap.fr',
  'c.tile-cyclosm.openstreetmap.fr',
  'api.thunderforest.com',
  'tile.tracestrack.com',
  'a.tile.openstreetmap.fr',
  'b.tile.openstreetmap.fr',
  'c.tile.openstreetmap.fr',
  'a.tile.opentopomap.org',
  'b.tile.opentopomap.org',
  'c.tile.opentopomap.org',
]);

function shouldHandleMapTile(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  return url.pathname === WEATHER_TILE_PATH || BASE_TILE_HOSTS.has(url.hostname);
}

async function cleanupOutdatedCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(MAP_TILE_CACHE_PREFIX) && !RUNTIME_CACHES.includes(cacheName))
      .map((cacheName) => caches.delete(cacheName)),
  );
}

async function updateMapTileCache(cache, request) {
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    cleanupOutdatedCaches(),
  ]));
});

self.addEventListener('fetch', (event) => {
  if (!shouldHandleMapTile(event.request)) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(MAP_TILE_CACHE);
    const cachedResponse = await cache.match(event.request);
    const networkPromise = updateMapTileCache(cache, event.request).catch(() => null);

    if (cachedResponse) {
      event.waitUntil(networkPromise);
      return cachedResponse;
    }

    const networkResponse = await networkPromise;
    if (networkResponse) {
      return networkResponse;
    }

    return fetch(event.request);
  })());
});

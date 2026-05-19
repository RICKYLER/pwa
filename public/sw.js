const APP_SHELL_CACHE = 'mswdo-app-shell-v1';
const STATIC_ASSET_CACHE = 'mswdo-static-assets-v1';
const MAP_TILE_CACHE = 'mswdo-map-tiles-v2';
const APP_CACHE_PREFIX = 'mswdo-app-shell-';
const STATIC_ASSET_CACHE_PREFIX = 'mswdo-static-assets-';
const MAP_TILE_CACHE_PREFIX = 'mswdo-map-tiles-';
const RUNTIME_CACHES = [APP_SHELL_CACHE, STATIC_ASSET_CACHE, MAP_TILE_CACHE];
const WEATHER_TILE_PATH = '/api/weather/map-tile';
const APP_SHELL_URLS = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon-32x32.png',
  '/apple-icon.png',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/maskable-icon-512.png',
];
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

function shouldHandleNavigation(request) {
  return request.mode === 'navigate';
}

function shouldHandleSameOriginStaticAsset(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  return (
    url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/fonts/')
    || /\.(?:css|js|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname)
  );
}

async function cleanupOutdatedCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => (
        cacheName.startsWith(APP_CACHE_PREFIX)
        || cacheName.startsWith(STATIC_ASSET_CACHE_PREFIX)
        || cacheName.startsWith(MAP_TILE_CACHE_PREFIX)
      ) && !RUNTIME_CACHES.includes(cacheName))
      .map((cacheName) => caches.delete(cacheName)),
  );
}

async function precacheAppShell() {
  const cache = await caches.open(APP_SHELL_CACHE);
  await cache.addAll(APP_SHELL_URLS);
}

async function handleNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch {
    return (
      await cache.match(request)
      || await cache.match('/')
      || await cache.match('/offline')
      || Response.error()
    );
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_ASSET_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

async function updateMapTileCache(cache, request) {
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    precacheAppShell(),
    self.skipWaiting(),
  ]));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    cleanupOutdatedCaches(),
  ]));
});

self.addEventListener('fetch', (event) => {
  if (shouldHandleNavigation(event.request)) {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  if (shouldHandleSameOriginStaticAsset(event.request)) {
    event.respondWith(handleStaticAsset(event.request));
    return;
  }

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

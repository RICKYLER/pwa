const APP_VERSION = 'mswdo-pwa-v1';
const SHELL_CACHE = `${APP_VERSION}-shell`;
const RUNTIME_CACHE = `${APP_VERSION}-runtime`;
const OFFLINE_URL = '/offline';
const SYNC_TAG = 'mswdo-sync-queue';
const DB_NAME = 'mswdo_census';
const DB_VERSION = 3;
const SYNC_QUEUE_STORE = 'sync_queue';
const STORES = [
  'users',
  'households',
  'residents',
  'vulnerability_flags',
  'programs',
  'beneficiaries',
  'inventory_items',
  'inventory_movements',
  'package_templates',
  'distribution_events',
  'distribution_records',
  'incidents',
  'location_master_lists',
  'audit_logs',
  'sync_queue',
];
const PRECACHE_URLS = [
  '/',
  '/login',
  '/dashboard',
  '/households',
  '/inventory',
  '/distribution',
  '/reports',
  '/vulnerability',
  OFFLINE_URL,
  '/manifest.json',
  '/icon.svg',
  '/favicon-32x32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/maskable-icon-512.png',
  '/apple-icon.png',
  '/placeholder-user.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((cacheName) => cacheName !== SHELL_CACHE && cacheName !== RUNTIME_CACHE)
          .map((cacheName) => caches.delete(cacheName)),
      );

      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
      await broadcastSyncStatus();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FLUSH_SYNC_QUEUE') {
    event.waitUntil(flushSyncQueue());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushSyncQueue());
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event));
    return;
  }

  if (isCacheableStaticRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

function isCacheableStaticRequest(request, url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'manifest'
  );
}

async function handleNavigationRequest(event) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const preloadResponse = await event.preloadResponse;
    if (preloadResponse) {
      cache.put(event.request, preloadResponse.clone());
      return preloadResponse;
    }

    const networkResponse = await fetch(event.request);
    if (networkResponse && networkResponse.ok) {
      cache.put(event.request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const shellResponse = await caches.match(OFFLINE_URL);
    if (shellResponse) {
      return shellResponse;
    }

    return new Response('Offline', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return Response.error();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, handler) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = handler(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(storeName) {
  return withStore(storeName, 'readonly', (store) => store.getAll());
}

function getFromStore(storeName, key) {
  return withStore(storeName, 'readonly', (store) => store.get(key));
}

function putInStore(storeName, value) {
  return withStore(storeName, 'readwrite', (store) => store.put(value));
}

function deleteFromStore(storeName, key) {
  return withStore(storeName, 'readwrite', (store) => store.delete(key));
}

function normalizeTimestamp(value) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? '' : timestamp.toISOString();
}

async function flushSyncQueue() {
  const items = await getAllFromStore(SYNC_QUEUE_STORE).catch(() => []);
  if (!Array.isArray(items) || items.length === 0) {
    await broadcastSyncStatus();
    return;
  }

  try {
    const response = await fetch('/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) {
      throw new Error(`Sync backup failed with status ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    const syncedItemIds = new Set(
      Array.isArray(payload?.syncedItems)
        ? payload.syncedItems
            .map((entry) => entry?.id)
            .filter((value) => typeof value === 'string')
        : items.map((item) => item.id),
    );

    for (const item of items) {
      if (!syncedItemIds.has(item.id)) {
        continue;
      }
      await finalizeSyncedItem(item);
    }

    if (Array.isArray(payload?.failedItems) && payload.failedItems.length > 0) {
      await recordDetailedSyncFailures(payload.failedItems);
    }
  } catch (error) {
    await recordSyncFailure(items, error instanceof Error ? error.message : 'Sync backup failed');
  }

  await broadcastSyncStatus();
}

async function finalizeSyncedItem(item) {
  const latest = await getFromStore(SYNC_QUEUE_STORE, item.id);
  if (!latest) {
    return;
  }

  const latestTimestamp = normalizeTimestamp(latest.timestamp);
  const itemTimestamp = normalizeTimestamp(item.timestamp);
  if (latest.operation !== item.operation || latestTimestamp !== itemTimestamp) {
    return;
  }

  if (item.operation !== 'delete') {
    const existingRecord = await getFromStore(item.entity_type, item.entity_id).catch(() => null);
    if (existingRecord && existingRecord.syncStatus === 'pending') {
      await putInStore(item.entity_type, {
        ...existingRecord,
        syncStatus: 'synced',
      });
    }
  }

  await deleteFromStore(SYNC_QUEUE_STORE, item.id);
}

async function recordSyncFailure(items, message) {
  for (const item of items) {
    const latest = await getFromStore(SYNC_QUEUE_STORE, item.id).catch(() => null);
    if (!latest) {
      continue;
    }

    const latestTimestamp = normalizeTimestamp(latest.timestamp);
    const itemTimestamp = normalizeTimestamp(item.timestamp);
    if (latestTimestamp !== itemTimestamp) {
      continue;
    }

    await putInStore(SYNC_QUEUE_STORE, {
      ...latest,
      attempts: typeof latest.attempts === 'number' ? latest.attempts + 1 : 1,
      last_error: message,
    });
  }
}

async function recordDetailedSyncFailures(failedItems) {
  for (const failedItem of failedItems) {
    if (!failedItem || typeof failedItem.id !== 'string') {
      continue;
    }

    const latest = await getFromStore(SYNC_QUEUE_STORE, failedItem.id).catch(() => null);
    if (!latest) {
      continue;
    }

    await putInStore(SYNC_QUEUE_STORE, {
      ...latest,
      attempts: typeof latest.attempts === 'number' ? latest.attempts + 1 : 1,
      last_error: typeof failedItem.error === 'string' ? failedItem.error : 'Sync failed',
    });
  }
}

async function broadcastSyncStatus() {
  const items = await getAllFromStore(SYNC_QUEUE_STORE).catch(() => []);
  const pendingCount = Array.isArray(items) ? items.length : 0;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  clients.forEach((client) => {
    client.postMessage({
      type: 'MSWDO_SYNC_STATUS',
      pendingCount,
    });
  });
}

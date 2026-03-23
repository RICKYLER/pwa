import { db, STORE_NAMES } from './indexeddb';
import type { SyncQueueItem } from './schema';

type SyncApiResponse = {
  syncedItems?: Array<{
    id?: string;
    client_timestamp?: string;
  }>;
  failedItems?: Array<{
    id?: string;
    error?: string;
  }>;
  error?: string;
};

function normalizeTimestamp(value: unknown) {
  const timestamp = new Date(value instanceof Date ? value : String(value ?? ''));
  return Number.isNaN(timestamp.getTime()) ? '' : timestamp.toISOString();
}

async function getQueueItem(id: string) {
  return db.get<SyncQueueItem>(STORE_NAMES.sync_queue, id).catch(() => undefined);
}

async function finalizeSyncedItem(item: SyncQueueItem) {
  const latest = await getQueueItem(item.id);
  if (!latest) {
    return;
  }

  const latestTimestamp = normalizeTimestamp(latest.timestamp);
  const itemTimestamp = normalizeTimestamp(item.timestamp);
  if (latest.operation !== item.operation || latestTimestamp !== itemTimestamp) {
    return;
  }

  if (item.operation !== 'delete') {
    const existingRecord = await db.get<Record<string, unknown>>(item.entity_type, item.entity_id).catch(() => undefined);
    if (existingRecord && existingRecord.syncStatus === 'pending') {
      await db.put(item.entity_type, {
        ...existingRecord,
        syncStatus: 'synced',
      });
    }
  }

  await db.deleteSilently(STORE_NAMES.sync_queue, item.id);
}

async function recordSyncFailure(items: SyncQueueItem[], message: string) {
  for (const item of items) {
    const latest = await getQueueItem(item.id);
    if (!latest) {
      continue;
    }

    const latestTimestamp = normalizeTimestamp(latest.timestamp);
    const itemTimestamp = normalizeTimestamp(item.timestamp);
    if (latestTimestamp !== itemTimestamp) {
      continue;
    }

    await db.put(STORE_NAMES.sync_queue, {
      ...latest,
      attempts: typeof latest.attempts === 'number' ? latest.attempts + 1 : 1,
      last_error: message,
    });
  }
}

async function recordDetailedSyncFailures(failedItems: SyncApiResponse['failedItems']) {
  if (!Array.isArray(failedItems)) {
    return;
  }

  for (const failedItem of failedItems) {
    if (!failedItem || typeof failedItem.id !== 'string') {
      continue;
    }

    const latest = await getQueueItem(failedItem.id);
    if (!latest) {
      continue;
    }

    await db.put(STORE_NAMES.sync_queue, {
      ...latest,
      attempts: typeof latest.attempts === 'number' ? latest.attempts + 1 : 1,
      last_error: typeof failedItem.error === 'string' ? failedItem.error : 'Sync failed',
    });
  }
}

export async function getPendingSyncCount(): Promise<number> {
  try {
    await db.init();
    const items = await db.getAll<SyncQueueItem>(STORE_NAMES.sync_queue);
    return items.length;
  } catch {
    return 0;
  }
}

export async function flushSyncQueueNow(): Promise<number> {
  await db.init();
  const items = await db.getAll<SyncQueueItem>(STORE_NAMES.sync_queue).catch(() => []);
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  try {
    const response = await fetch('/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ items }),
    });

    const payload = await response.json().catch(() => null) as SyncApiResponse | null;
    if (!response.ok) {
      throw new Error(
        typeof payload?.error === 'string'
          ? payload.error
          : `Sync backup failed with status ${response.status}`,
      );
    }

    const syncedItemIds = new Set(
      Array.isArray(payload?.syncedItems)
        ? payload.syncedItems
            .map((entry) => entry?.id)
            .filter((value): value is string => typeof value === 'string')
        : items.map((item) => item.id),
    );

    for (const item of items) {
      if (!syncedItemIds.has(item.id)) {
        continue;
      }

      await finalizeSyncedItem(item);
    }

    await recordDetailedSyncFailures(payload?.failedItems);

    if (syncedItemIds.size > 0 && typeof window !== 'undefined') {
      await import('@/lib/supabase/route-bootstrap')
        .then(({ bootstrapCurrentPathData }) => bootstrapCurrentPathData(true))
        .catch((error) => {
          console.warn('Failed to refresh Supabase data after sync:', error);
        });
    }
  } catch (error) {
    await recordSyncFailure(items, error instanceof Error ? error.message : 'Sync backup failed');
  }

  return getPendingSyncCount();
}

export async function syncMutationNow(queueItemId: string): Promise<void> {
  await flushSyncQueueNow();

  const queuedItem = await getQueueItem(queueItemId);
  if (!queuedItem) {
    return;
  }

  throw new Error(
    queuedItem.last_error
    || 'Failed to save this change to Supabase. Please try again.',
  );
}

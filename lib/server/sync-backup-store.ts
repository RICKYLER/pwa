import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SyncQueueItem, User } from '@/lib/db/schema';
import { resolveWritableFilePath } from '@/lib/server/runtime-storage';

const STORE_PATH = resolveWritableFilePath('MSWDO_SYNC_BACKUP_STORE_PATH', 'field-sync-backup.json');
const DATA_DIR = path.dirname(STORE_PATH);
const HISTORY_LIMIT = 1000;

interface SyncedBackupRecord {
  key: string;
  queue_id: string;
  entity_type: string;
  entity_id: string;
  operation: SyncQueueItem['operation'];
  data: SyncQueueItem['data'];
  client_timestamp: string;
  synced_at: string;
  synced_by: {
    id: string;
    email: string;
    role: User['role'];
  };
}

interface SyncBackupStore {
  updatedAt: string;
  records: Record<string, SyncedBackupRecord>;
  history: SyncedBackupRecord[];
}

let writeLock: Promise<void> = Promise.resolve();

async function ensureStoreFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(STORE_PATH, 'utf8');
  } catch {
    const initialStore: SyncBackupStore = {
      updatedAt: new Date(0).toISOString(),
      records: {},
      history: [],
    };
    await writeFile(STORE_PATH, JSON.stringify(initialStore, null, 2), 'utf8');
  }
}

async function readStore(): Promise<SyncBackupStore> {
  await ensureStoreFile();
  const raw = await readFile(STORE_PATH, 'utf8');
  return JSON.parse(raw) as SyncBackupStore;
}

async function withStoreWrite<T>(updater: (store: SyncBackupStore) => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  const previousLock = writeLock;
  writeLock = previousLock.then(() => nextLock);

  await previousLock;

  try {
    const store = await readStore();
    const result = await updater(store);
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
    return result;
  } finally {
    release();
  }
}

function buildRecord(item: SyncQueueItem, user: User, syncedAt: Date): SyncedBackupRecord {
  return {
    key: `${item.entity_type}:${item.entity_id}`,
    queue_id: item.id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    operation: item.operation,
    data: item.data,
    client_timestamp: new Date(item.timestamp).toISOString(),
    synced_at: syncedAt.toISOString(),
    synced_by: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
}

export async function applySyncedQueueItems(items: SyncQueueItem[], user: User) {
  return withStoreWrite(async (store) => {
    const syncedAt = new Date();
    const appliedRecords = items.map((item) => buildRecord(item, user, syncedAt));

    appliedRecords.forEach((record) => {
      store.records[record.key] = record;
    });

    store.history = [...appliedRecords.reverse(), ...store.history].slice(0, HISTORY_LIMIT);
    store.updatedAt = syncedAt.toISOString();

    return {
      appliedCount: appliedRecords.length,
      syncedItems: appliedRecords.map((record) => ({
        id: record.queue_id,
        client_timestamp: record.client_timestamp,
      })),
      updatedAt: store.updatedAt,
    };
  });
}

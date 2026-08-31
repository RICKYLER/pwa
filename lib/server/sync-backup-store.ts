import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SyncQueueItem, User } from '@/lib/db/schema';
import { resolveWritableFilePath } from '@/lib/server/runtime-storage';
import { decryptJson, deriveFieldEncryptionKey, encryptJson } from '@/lib/security/field-encryption';

const STORE_PATH = resolveWritableFilePath('MSWDO_SYNC_BACKUP_STORE_PATH', 'field-sync-backup.json');
const DATA_DIR = path.dirname(STORE_PATH);
const HISTORY_LIMIT = 1000;

// The backup file stores census payloads (household, resident, vulnerability
// flags) that were synced from the field. Encrypt that payload at rest so the
// file is not readable as plaintext on disk. The passphrase comes from
// MSWDO_BACKUP_ENCRYPTION_KEY; without it the store degrades to plaintext with
// a one-time warning rather than failing field syncs.
const BACKUP_KEY_ENV = 'MSWDO_BACKUP_ENCRYPTION_KEY';
const BACKUP_SALT = 'mswdo-census-backup-v1';

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
let backupKeyPromise: Promise<CryptoKey | null> | null = null;
let warnedAboutPlaintext = false;

async function getBackupEncryptionKey(): Promise<CryptoKey | null> {
  const passphrase = process.env?.[BACKUP_KEY_ENV];
  if (!passphrase) {
    return null;
  }

  if (!backupKeyPromise) {
    backupKeyPromise = deriveFieldEncryptionKey(passphrase, BACKUP_SALT).catch((error) => {
      console.error('Failed to derive backup encryption key:', error);
      return null;
    });
  }

  return backupKeyPromise;
}

function warnOnceAboutPlaintext() {
  if (warnedAboutPlaintext) {
    return;
  }
  warnedAboutPlaintext = true;
  console.warn(
    `${BACKUP_KEY_ENV} is not set. The field-sync backup file will be stored in plaintext. `
    + 'Set the env var to encrypt census payloads at rest.',
  );
}

async function encryptBackupData(data: SyncQueueItem['data']): Promise<SyncQueueItem['data']> {
  const key = await getBackupEncryptionKey();
  if (!key) {
    warnOnceAboutPlaintext();
    return data;
  }

  return (await encryptJson(data ?? null, key)) as unknown as SyncQueueItem['data'];
}

async function decryptBackupData(data: SyncQueueItem['data']): Promise<SyncQueueItem['data']> {
  const key = await getBackupEncryptionKey();
  if (!key || !data || typeof data !== 'object' || !('encrypted' in data) || data.encrypted !== true) {
    return data;
  }

  try {
    return (await decryptJson(data, key)) as SyncQueueItem['data'];
  } catch (error) {
    console.error('Failed to decrypt a synced backup record; leaving it as stored:', error);
    return data;
  }
}

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
  const store = JSON.parse(raw) as SyncBackupStore;

  for (const record of Object.values(store.records ?? {})) {
    record.data = await decryptBackupData(record.data);
  }
  for (const record of store.history ?? []) {
    record.data = await decryptBackupData(record.data);
  }

  return store;
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

async function buildRecord(item: SyncQueueItem, user: User, syncedAt: Date): Promise<SyncedBackupRecord> {
  return {
    key: `${item.entity_type}:${item.entity_id}`,
    queue_id: item.id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    operation: item.operation,
    data: await encryptBackupData(item.data),
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
    const appliedRecords = await Promise.all(items.map((item) => buildRecord(item, user, syncedAt)));

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

import type { SyncQueueItem } from './schema';

const LEGACY_DB_NAME = 'mswdo_census';

export const STORE_NAMES = {
  users: 'users',
  households: 'households',
  residents: 'residents',
  vulnerability_flags: 'vulnerability_flags',
  programs: 'programs',
  beneficiaries: 'beneficiaries',
  inventory_items: 'inventory_items',
  inventory_movements: 'inventory_movements',
  package_templates: 'package_templates',
  distribution_events: 'distribution_events',
  distribution_records: 'distribution_records',
  incidents: 'incidents',
  location_master_lists: 'location_master_lists',
  audit_logs: 'audit_logs',
  sync_queue: 'sync_queue',
} as const;

const SYNC_TRACKED_STORES = new Set<string>([
  STORE_NAMES.households,
  STORE_NAMES.residents,
  STORE_NAMES.vulnerability_flags,
  STORE_NAMES.programs,
  STORE_NAMES.beneficiaries,
  STORE_NAMES.inventory_items,
  STORE_NAMES.inventory_movements,
  STORE_NAMES.package_templates,
  STORE_NAMES.distribution_events,
  STORE_NAMES.distribution_records,
  STORE_NAMES.incidents,
  STORE_NAMES.location_master_lists,
  STORE_NAMES.audit_logs,
]);

const ALL_STORE_NAMES = Object.values(STORE_NAMES);

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value;
}

function normalizeConflictDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return undefined;
}

export class IndexedDBManager {
  private initialized = false;
  private stores = new Map<string, Map<string, Record<string, any>>>();

  private getStore(storeName: string) {
    let store = this.stores.get(storeName);
    if (!store) {
      store = new Map<string, Record<string, any>>();
      this.stores.set(storeName, store);
    }

    return store;
  }

  private buildQueueItemId(storeName: string, entityId: string) {
    return `${storeName}:${entityId}`;
  }

  private buildConflictMetadata(baseRecord?: Record<string, any>) {
    if (!baseRecord) {
      return {};
    }

    const baseUpdatedAt = normalizeConflictDate(baseRecord.updatedAt);
    return {
      ...(baseUpdatedAt ? { __base_updated_at: baseUpdatedAt } : {}),
      ...(typeof baseRecord.recordVersion === 'number'
        ? { __base_record_version: baseRecord.recordVersion }
        : {}),
    };
  }

  private assertOnlineWriteAllowed(storeName: string) {
    if (typeof navigator === 'undefined') {
      return;
    }

    if (storeName === STORE_NAMES.sync_queue || !SYNC_TRACKED_STORES.has(storeName)) {
      return;
    }

    if (navigator.onLine === false) {
      throw new Error('This app is now online-only. Reconnect to the internet and try again.');
    }
  }

  private shouldQueueSyncMutation(storeName: string, data?: Record<string, any>) {
    return (
      storeName !== STORE_NAMES.sync_queue &&
      SYNC_TRACKED_STORES.has(storeName) &&
      Boolean(data?.id) &&
      data?.syncStatus === 'pending'
    );
  }

  private notifySyncQueueChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('mswdo-sync-queue-changed'));
  }

  private async queueSyncMutation(
    storeName: string,
    operation: SyncQueueItem['operation'],
    data: Record<string, any>,
    baseRecord?: Record<string, any>,
  ): Promise<void> {
    if (!this.shouldQueueSyncMutation(storeName, data)) {
      return;
    }

    const queueItem: SyncQueueItem = {
      id: `${storeName}:${data.id}`,
      operation,
      entity_type: storeName,
      entity_id: data.id,
      data: {
        ...data,
        ...this.buildConflictMetadata(baseRecord),
      },
      timestamp: new Date(),
      attempts: 0,
    };

    await this.put(STORE_NAMES.sync_queue, queueItem);
    this.notifySyncQueueChanged();
  }

  private async queueDeleteMutation(
    storeName: string,
    entityId: string,
    baseRecord?: Record<string, any>,
  ): Promise<void> {
    if (storeName === STORE_NAMES.sync_queue || !SYNC_TRACKED_STORES.has(storeName)) {
      return;
    }

    const queueItem: SyncQueueItem = {
      id: `${storeName}:${entityId}`,
      operation: 'delete',
      entity_type: storeName,
      entity_id: entityId,
      data: {
        id: entityId,
        ...this.buildConflictMetadata(baseRecord),
      },
      timestamp: new Date(),
      attempts: 0,
    };

    await this.put(STORE_NAMES.sync_queue, queueItem);
    this.notifySyncQueueChanged();
  }

  private async putSilently<T extends Record<string, any>>(storeName: string, data: T): Promise<T> {
    await this.init();
    this.getStore(storeName).set(String(data.id), cloneValue(data));
    return data;
  }

  private async syncMutationImmediately(
    storeName: string,
    entityId: string,
    rollback: () => Promise<void>,
  ): Promise<void> {
    if (storeName === STORE_NAMES.sync_queue || !SYNC_TRACKED_STORES.has(storeName)) {
      return;
    }

    const queueItemId = this.buildQueueItemId(storeName, entityId);
    const queuedItem = await this.get<SyncQueueItem>(STORE_NAMES.sync_queue, queueItemId).catch(() => undefined);
    if (!queuedItem) {
      return;
    }

    try {
      const { syncMutationNow } = await import('./client-sync');
      await syncMutationNow(queueItemId);
    } catch (error) {
      await rollback().catch((rollbackError) => {
        console.error(`Failed to roll back ${storeName}:${entityId} after Supabase sync failure:`, rollbackError);
      });
      await this.deleteSilently(STORE_NAMES.sync_queue, queueItemId).catch(() => undefined);
      this.notifySyncQueueChanged();
      throw error instanceof Error
        ? error
        : new Error('Failed to save this change to Supabase.');
    }
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    ALL_STORE_NAMES.forEach((storeName) => {
      this.getStore(storeName);
    });

    this.initialized = true;
    console.log('Local IndexedDB disabled. Using in-memory session store backed by Supabase.');
  }

  async add<T extends Record<string, any>>(storeName: string, data: T): Promise<T> {
    this.assertOnlineWriteAllowed(storeName);
    const shouldSyncImmediately = this.shouldQueueSyncMutation(storeName, data);
    await this.init();

    const recordId = String(data.id);
    const store = this.getStore(storeName);
    if (store.has(recordId)) {
      throw new Error(`Record already exists in ${storeName}: ${recordId}`);
    }

    store.set(recordId, cloneValue(data));
    console.log(`Added to ${storeName}:`, data.id);

    try {
      await this.queueSyncMutation(storeName, 'create', data);
    } catch (error) {
      console.error(`Failed to queue create mutation for ${storeName}:`, error);
      store.delete(recordId);
      throw error;
    }

    if (shouldSyncImmediately && typeof data.id === 'string') {
      await this.syncMutationImmediately(storeName, data.id, async () => {
        await this.deleteSilently(storeName, data.id);
      });
    }

    return cloneValue(data);
  }

  async put<T extends Record<string, any>>(storeName: string, data: T): Promise<T> {
    this.assertOnlineWriteAllowed(storeName);
    const shouldSyncImmediately = this.shouldQueueSyncMutation(storeName, data);
    const existingRecord =
      typeof data.id === 'string'
        ? await this.get<T>(storeName, data.id).catch(() => undefined)
        : undefined;
    await this.init();

    this.getStore(storeName).set(String(data.id), cloneValue(data));
    console.log(`Updated ${storeName}:`, data.id);

    try {
      await this.queueSyncMutation(
        storeName,
        'update',
        data,
        existingRecord as Record<string, any> | undefined,
      );
    } catch (error) {
      console.error(`Failed to queue update mutation for ${storeName}:`, error);
      if (existingRecord && typeof data.id === 'string') {
        this.getStore(storeName).set(data.id, cloneValue(existingRecord as Record<string, any>));
      }
      throw error;
    }

    if (shouldSyncImmediately && typeof data.id === 'string') {
      await this.syncMutationImmediately(storeName, data.id, async () => {
        if (existingRecord) {
          await this.putSilently(storeName, existingRecord);
          return;
        }

        await this.deleteSilently(storeName, data.id);
      });
    }

    return cloneValue(data);
  }

  async get<T = any>(storeName: string, key: string): Promise<T | undefined> {
    await this.init();
    const entry = this.getStore(storeName).get(key);
    return entry === undefined ? undefined : cloneValue(entry as T);
  }

  async getAll<T = any>(storeName: string): Promise<T[]> {
    await this.init();
    return Array.from(this.getStore(storeName).values()).map((entry) => cloneValue(entry as T));
  }

  async delete(storeName: string, key: string): Promise<void> {
    this.assertOnlineWriteAllowed(storeName);
    const existingRecord = await this.get<Record<string, any>>(storeName, key).catch(() => undefined);
    await this.init();

    this.getStore(storeName).delete(key);
    console.log(`Deleted from ${storeName}:`, key);

    try {
      await this.queueDeleteMutation(storeName, key, existingRecord);
    } catch (error) {
      console.error(`Failed to queue delete mutation for ${storeName}:`, error);
      if (existingRecord) {
        this.getStore(storeName).set(key, cloneValue(existingRecord));
      }
      throw error;
    }

    if (SYNC_TRACKED_STORES.has(storeName)) {
      await this.syncMutationImmediately(storeName, key, async () => {
        if (!existingRecord) {
          return;
        }

        await this.putSilently(storeName, existingRecord);
      });
    }
  }

  async deleteSilently(storeName: string, key: string): Promise<void> {
    await this.init();
    this.getStore(storeName).delete(key);
  }

  async clear(storeName: string): Promise<void> {
    await this.init();
    this.getStore(storeName).clear();
  }

  async query<T = any>(
    storeName: string,
    filter?: (item: T) => boolean
  ): Promise<T[]> {
    const all = await this.getAll<T>(storeName);
    return filter ? all.filter(filter) : all;
  }
}

export async function clearLegacyLocalDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

// Singleton instance
export const db = new IndexedDBManager();

// Seed initial demo data
export async function seedInitialData() {
  console.log('Local seed data disabled. Supabase is now the only persistent data source.');
}

import { createAuditLog } from '../auth';
import { db, STORE_NAMES } from './indexeddb';
import { runServerMutation } from '@/lib/mutations';
import type {
  DistributedItem,
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  PackageTemplate,
} from './schema';

type InventorySnapshotPayload = {
  inventory_items?: Array<Record<string, unknown>>;
  inventory_movements?: Array<Record<string, unknown>>;
  package_templates?: Array<Record<string, unknown>>;
};

let inventoryBootstrapPromise: Promise<void> | null = null;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  return 0;
}

function normalizeInventoryItem(item: InventoryItem): InventoryItem {
  return {
    ...item,
    item_name: item.item_name.trim(),
    item_code: item.item_code?.trim() || undefined,
    quantity_available: normalizeQuantity(item.quantity_available),
    reorder_level: Math.max(0, normalizeQuantity(item.reorder_level ?? 10)),
    storage_location: item.storage_location?.trim() || undefined,
    expiration_date: item.expiration_date?.trim() || undefined,
    notes: item.notes?.trim() || undefined,
  };
}

function normalizeDistributedItems(items: DistributedItem[] | undefined): DistributedItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      item_id: item.item_id,
      item_name: item.item_name?.trim() || undefined,
      quantity: normalizeQuantity(item.quantity),
      unit: item.unit,
    }))
    .filter((item) => item.item_id && item.quantity > 0);
}

function normalizePackageTemplate(template: PackageTemplate): PackageTemplate {
  return {
    ...template,
    name: template.name.trim(),
    description: template.description?.trim() || undefined,
    items: normalizeDistributedItems(template.items),
    createdAt: template.createdAt instanceof Date ? template.createdAt : new Date(template.createdAt),
    updatedAt: template.updatedAt instanceof Date ? template.updatedAt : new Date(template.updatedAt),
  };
}

function normalizeInventoryMovement(movement: InventoryMovement): InventoryMovement {
  return {
    ...movement,
    quantity: normalizeQuantity(movement.quantity),
    previous_quantity: normalizeQuantity(movement.previous_quantity),
    new_quantity: normalizeQuantity(movement.new_quantity),
    notes: movement.notes?.trim() || undefined,
    timestamp: movement.timestamp instanceof Date ? movement.timestamp : new Date(movement.timestamp),
  };
}

function mapSnapshotInventoryItem(row: Record<string, unknown>): InventoryItem {
  return normalizeInventoryItem({
    id: String(row.id ?? ''),
    item_name: String(row.item_name ?? ''),
    item_code: toOptionalString(row.item_code),
    category: String(row.category ?? 'other') as InventoryItem['category'],
    quantity_available: normalizeQuantity(row.quantity_available),
    unit: String(row.unit ?? 'pcs') as InventoryItem['unit'],
    reorder_level: normalizeQuantity(row.reorder_level ?? 10),
    storage_location: toOptionalString(row.storage_location),
    expiration_date: toOptionalString(row.expiration_date),
    notes: toOptionalString(row.notes),
    syncStatus: 'synced',
  });
}

function mapSnapshotInventoryMovement(row: Record<string, unknown>): InventoryMovement {
  return normalizeInventoryMovement({
    id: String(row.id ?? ''),
    item_id: String(row.item_id ?? ''),
    item_name: String(row.item_name ?? ''),
    type: String(row.type ?? 'stock_in') as InventoryMovement['type'],
    quantity: normalizeQuantity(row.quantity),
    previous_quantity: normalizeQuantity(row.previous_quantity),
    new_quantity: normalizeQuantity(row.new_quantity),
    unit: String(row.unit ?? 'pcs') as InventoryItem['unit'],
    performed_by: toOptionalString(row.performed_by),
    performed_by_name: toOptionalString(row.performed_by_name),
    reference_id: toOptionalString(row.reference_id),
    reference_type: toOptionalString(row.reference_type) as InventoryMovement['reference_type'],
    notes: toOptionalString(row.notes),
    timestamp: row.timestamp instanceof Date ? row.timestamp : new Date(String(row.timestamp ?? '')),
    syncStatus: 'synced',
  });
}

function mapSnapshotPackageTemplate(row: Record<string, unknown>): PackageTemplate {
  return normalizePackageTemplate({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    description: toOptionalString(row.description),
    items: normalizeDistributedItems(
      Array.isArray(row.items) ? (row.items as DistributedItem[]) : [],
    ),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at ?? '')),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at ?? '')),
    syncStatus: 'synced',
  });
}

async function hydrateSyncedRecord<T extends { id: string; syncStatus?: string }>(
  storeName: string,
  record: T,
) {
  if (!record.id) {
    return;
  }

  const existing = await db.get<T>(storeName, record.id).catch(() => undefined);
  if (existing?.syncStatus === 'pending') {
    return;
  }

  await db.put(storeName, record);
}

export async function bootstrapInventoryFromSupabase(force = false): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }

  if (!force && inventoryBootstrapPromise) {
    return inventoryBootstrapPromise;
  }

  inventoryBootstrapPromise = (async () => {
    let shouldCacheResult = false;

    try {
      const response = await fetch('/api/inventory/snapshot', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
        },
      }).catch(() => null);

      if (!response) {
        return;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || response.status === 503) {
          return;
        }

        throw new Error(`Inventory snapshot failed with status ${response.status}`);
      }

      const payload = await response.json().catch(() => null) as InventorySnapshotPayload | null;
      if (!payload) {
        return;
      }

      await db.init();

      await Promise.all(
        (payload.inventory_items ?? [])
          .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
          .map((row) => hydrateSyncedRecord(
            STORE_NAMES.inventory_items,
            mapSnapshotInventoryItem(row),
          )),
      );

      await Promise.all(
        (payload.inventory_movements ?? [])
          .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
          .map((row) => hydrateSyncedRecord(
            STORE_NAMES.inventory_movements,
            mapSnapshotInventoryMovement(row),
          )),
      );

      await Promise.all(
        (payload.package_templates ?? [])
          .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
          .map((row) => hydrateSyncedRecord(
            STORE_NAMES.package_templates,
            mapSnapshotPackageTemplate(row),
          )),
      );

      shouldCacheResult = true;
    } catch (error) {
      console.warn('Inventory snapshot bootstrap failed:', error);
    } finally {
      if (!shouldCacheResult) {
        inventoryBootstrapPromise = null;
      }
    }
  })();

  return inventoryBootstrapPromise;
}

function isExpiringSoon(item: InventoryItem, days = 30): boolean {
  if (!item.expiration_date) return false;
  const expiration = new Date(item.expiration_date);
  if (Number.isNaN(expiration.getTime())) return false;

  const today = new Date();
  const diff = expiration.getTime() - today.getTime();
  const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
}

export function getItemStockState(item: InventoryItem): 'out' | 'low' | 'healthy' {
  if (item.quantity_available <= 0) return 'out';
  if (item.quantity_available <= (item.reorder_level ?? 10)) return 'low';
  return 'healthy';
}

async function applyInventoryTransaction(params: {
  item_id: string;
  type: InventoryMovementType;
  quantity: number;
  next_quantity?: number;
  notes?: string;
  reference_id?: string;
  reference_type?: 'inventory' | 'distribution' | 'manual' | 'transfer';
  performed_by?: string;
  performed_by_name?: string;
}): Promise<InventoryItem> {
  const item = await getInventoryItem(params.item_id);
  if (!item) {
    throw new Error(`Inventory item ${params.item_id} not found`);
  }

  const quantity = normalizeQuantity(params.quantity);
  if (quantity <= 0 && params.type !== 'adjustment') {
    throw new Error('Transaction quantity must be greater than zero');
  }

  const currentRecordVersion =
    typeof (item as InventoryItem & { recordVersion?: unknown }).recordVersion === 'number'
      ? (item as InventoryItem & { recordVersion: number }).recordVersion
      : undefined;

  await runServerMutation({
    action: 'apply_inventory_transaction',
    params: {
      item_id: item.id,
      type: params.type,
      quantity,
      next_quantity:
        typeof params.next_quantity === 'number'
          ? Math.max(0, normalizeQuantity(params.next_quantity))
          : undefined,
      notes: params.notes,
      reference_id: params.reference_id,
      reference_type: params.reference_type,
      expected_record_version: currentRecordVersion,
    },
  });

  await bootstrapInventoryFromSupabase(true);

  const updatedItem = await getInventoryItem(item.id);
  if (!updatedItem) {
    throw new Error('Inventory item updated in Supabase, but it did not rehydrate locally.');
  }

  return updatedItem;
}

/**
 * Get all inventory items
 */
export async function getInventoryItems(filters?: {
  category?: string;
  stockState?: 'out' | 'low' | 'healthy';
  search?: string;
}): Promise<InventoryItem[]> {
  try {
    const all = (await db.getAll<InventoryItem>(STORE_NAMES.inventory_items)).map(normalizeInventoryItem);

    let filtered = all;

    if (filters?.category) {
      filtered = filtered.filter((item) => item.category === filters.category);
    }

    if (filters?.stockState) {
      filtered = filtered.filter((item) => getItemStockState(item) === filters.stockState);
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter((item) =>
        [item.item_name, item.item_code, item.storage_location, item.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }

    return filtered.sort((a, b) => a.item_name.localeCompare(b.item_name));
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    throw error;
  }
}

/**
 * Get inventory item by ID
 */
export async function getInventoryItem(id: string): Promise<InventoryItem | undefined> {
  try {
    const item = await db.get<InventoryItem>(STORE_NAMES.inventory_items, id);
    return item ? normalizeInventoryItem(item) : undefined;
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    throw error;
  }
}

/**
 * Create inventory item
 */
export async function createInventoryItem(
  data: Omit<InventoryItem, 'id' | 'syncStatus'>,
): Promise<InventoryItem> {
  try {
    const item = normalizeInventoryItem({
      ...data,
      id: generateId('inv'),
      syncStatus: 'synced',
    });

    await runServerMutation({
      action: 'create_inventory_item',
      item: {
        id: item.id,
        item_name: item.item_name,
        item_code: item.item_code,
        category: item.category,
        quantity_available: item.quantity_available,
        unit: item.unit,
        reorder_level: item.reorder_level,
        storage_location: item.storage_location,
        expiration_date: item.expiration_date,
        notes: item.notes,
      },
    });

    await bootstrapInventoryFromSupabase(true);

    const createdItem = await getInventoryItem(item.id);
    if (!createdItem) {
      throw new Error('Inventory item was created in Supabase, but it did not rehydrate locally.');
    }

    return createdItem;
  } catch (error) {
    console.error('Error creating inventory item:', error);
    throw error;
  }
}

/**
 * Update inventory item metadata
 */
export async function updateInventoryItem(
  id: string,
  updates: Partial<InventoryItem>,
): Promise<InventoryItem> {
  try {
    await runServerMutation({
      action: 'update_inventory_item',
      itemId: id,
      updates: {
        ...updates,
        item_name: typeof updates.item_name === 'string' ? updates.item_name.trim() : updates.item_name,
        item_code: typeof updates.item_code === 'string' ? (updates.item_code.trim() || null) : updates.item_code,
        storage_location:
          typeof updates.storage_location === 'string'
            ? (updates.storage_location.trim() || null)
            : updates.storage_location,
        expiration_date:
          typeof updates.expiration_date === 'string'
            ? (updates.expiration_date.trim() || null)
            : updates.expiration_date,
        notes: typeof updates.notes === 'string' ? (updates.notes.trim() || null) : updates.notes,
      },
    });

    await bootstrapInventoryFromSupabase(true);

    const updatedItem = await getInventoryItem(id);
    if (!updatedItem) {
      throw new Error('Inventory item was updated in Supabase, but it did not rehydrate locally.');
    }

    return updatedItem;
  } catch (error) {
    console.error('Error updating inventory item:', error);
    throw error;
  }
}

export async function addStock(
  id: string,
  quantity: number,
  notes?: string,
): Promise<InventoryItem> {
  return applyInventoryTransaction({
    item_id: id,
    type: 'stock_in',
    quantity,
    notes,
    reference_id: id,
    reference_type: 'inventory',
  });
}

export async function releaseStock(
  id: string,
  quantity: number,
  options?: {
    type?: Extract<InventoryMovementType, 'stock_out' | 'distribution_release' | 'transfer'>;
    notes?: string;
    reference_id?: string;
    reference_type?: 'inventory' | 'distribution' | 'manual' | 'transfer';
  },
): Promise<InventoryItem> {
  return applyInventoryTransaction({
    item_id: id,
    type: options?.type ?? 'stock_out',
    quantity,
    notes: options?.notes,
    reference_id: options?.reference_id,
    reference_type: options?.reference_type,
  });
}

export async function adjustInventoryCount(
  id: string,
  nextQuantity: number,
  notes?: string,
): Promise<InventoryItem> {
  return applyInventoryTransaction({
    item_id: id,
    type: 'adjustment',
    quantity: Math.abs(nextQuantity),
    next_quantity: nextQuantity,
    notes,
    reference_id: id,
    reference_type: 'manual',
  });
}

/**
 * Reduce inventory quantity
 */
export async function reduceInventoryQuantity(id: string, quantity: number): Promise<InventoryItem> {
  return releaseStock(id, quantity, { type: 'stock_out', reference_id: id, reference_type: 'inventory' });
}

export async function getInventoryMovements(filters?: {
  item_id?: string;
  limit?: number;
}): Promise<InventoryMovement[]> {
  try {
    const all = (await db.getAll<InventoryMovement>(STORE_NAMES.inventory_movements))
      .map(normalizeInventoryMovement)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const filtered = filters?.item_id ? all.filter((entry) => entry.item_id === filters.item_id) : all;
    return typeof filters?.limit === 'number' ? filtered.slice(0, filters.limit) : filtered;
  } catch (error) {
    console.error('Error fetching inventory movements:', error);
    throw error;
  }
}

export async function getLowStockItems(): Promise<InventoryItem[]> {
  try {
    const all = await getInventoryItems();
    return all
      .filter((item) => item.quantity_available > 0 && item.quantity_available <= (item.reorder_level ?? 10))
      .sort((a, b) => a.quantity_available - b.quantity_available);
  } catch (error) {
    console.error('Error getting low stock items:', error);
    throw error;
  }
}

export async function getOutOfStockItems(): Promise<InventoryItem[]> {
  try {
    const all = await getInventoryItems();
    return all.filter((item) => item.quantity_available <= 0);
  } catch (error) {
    console.error('Error getting out of stock items:', error);
    throw error;
  }
}

export async function getExpiringSoonItems(days = 30): Promise<InventoryItem[]> {
  try {
    const all = await getInventoryItems();
    return all.filter((item) => isExpiringSoon(item, days));
  } catch (error) {
    console.error('Error getting expiring soon items:', error);
    throw error;
  }
}

export async function getInventoryStatusSummary() {
  const [items, lowStock, outOfStock, expiringSoon] = await Promise.all([
    getInventoryItems(),
    getLowStockItems(),
    getOutOfStockItems(),
    getExpiringSoonItems(),
  ]);

  return {
    totalItemTypes: items.length,
    totalUnits: items.reduce((sum, item) => sum + item.quantity_available, 0),
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
    expiringSoonCount: expiringSoon.length,
  };
}

export async function getPackageTemplates(): Promise<PackageTemplate[]> {
  try {
    const all = await db.getAll<PackageTemplate>(STORE_NAMES.package_templates);
    return all
      .map(normalizePackageTemplate)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching package templates:', error);
    throw error;
  }
}

export async function createPackageTemplate(data: {
  name: string;
  description?: string;
  items: DistributedItem[];
}): Promise<PackageTemplate> {
  try {
    const template = normalizePackageTemplate({
      id: generateId('pkg'),
      name: data.name,
      description: data.description,
      items: data.items,
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'synced',
    });

    await runServerMutation({
      action: 'create_package_template',
      template: {
        ...template,
        name: template.name.trim(),
        description: template.description?.trim() || undefined,
      },
    });

    await bootstrapInventoryFromSupabase(true);

    const createdTemplate = (await getPackageTemplates()).find((entry) => entry.id === template.id);
    if (!createdTemplate) {
      throw new Error('Package template was created in Supabase, but it did not rehydrate locally.');
    }

    return createdTemplate;
  } catch (error) {
    console.error('Error creating package template:', error);
    throw error;
  }
}

export async function deletePackageTemplate(id: string): Promise<void> {
  try {
    await runServerMutation({
      action: 'delete_package_template',
      templateId: id,
    });
    await bootstrapInventoryFromSupabase(true);
  } catch (error) {
    console.error('Error deleting package template:', error);
    throw error;
  }
}

/**
 * Delete inventory item (soft delete by setting quantity to 0)
 */
export async function deleteInventoryItem(id: string): Promise<void> {
  try {
    await adjustInventoryCount(id, 0, 'Marked as inactive');
    await createAuditLog('DELETE', 'inventory', id, {});
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    throw error;
  }
}

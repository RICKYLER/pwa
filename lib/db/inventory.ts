import { db, STORE_NAMES } from './indexeddb';
import type { InventoryItem } from './schema';
import { createAuditLog } from '../auth';

function generateId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all inventory items
 */
export async function getInventoryItems(filters?: {
  category?: string;
}): Promise<InventoryItem[]> {
  try {
    const all = await db.getAll<InventoryItem>(STORE_NAMES.inventory_items);

    let filtered = all;

    if (filters?.category) {
      filtered = filtered.filter(i => i.category === filters.category);
    }

    return filtered.sort((a, b) => a.item_name.localeCompare(b.item_name));
  } catch (error) {
    console.error('[v0] Error fetching inventory items:', error);
    throw error;
  }
}

/**
 * Get inventory item by ID
 */
export async function getInventoryItem(id: string): Promise<InventoryItem | undefined> {
  try {
    return await db.get<InventoryItem>(STORE_NAMES.inventory_items, id);
  } catch (error) {
    console.error('[v0] Error fetching inventory item:', error);
    throw error;
  }
}

/**
 * Create inventory item
 */
export async function createInventoryItem(
  data: Omit<InventoryItem, 'id' | 'syncStatus'>
): Promise<InventoryItem> {
  try {
    const item: InventoryItem = {
      ...data,
      id: generateId(),
      syncStatus: 'pending',
    };

    await db.add(STORE_NAMES.inventory_items, item);

    await createAuditLog(
      'CREATE',
      'inventory',
      item.id,
      { item_name: data.item_name, category: data.category, quantity: data.quantity_available }
    );

    console.log('[v0] Inventory item created:', item.id);
    return item;
  } catch (error) {
    console.error('[v0] Error creating inventory item:', error);
    throw error;
  }
}

/**
 * Update inventory item
 */
export async function updateInventoryItem(
  id: string,
  updates: Partial<InventoryItem>
): Promise<InventoryItem> {
  try {
    const existing = await getInventoryItem(id);
    if (!existing) {
      throw new Error(`Inventory item ${id} not found`);
    }

    const updated: InventoryItem = {
      ...existing,
      ...updates,
      id,
      syncStatus: 'pending',
    };

    await db.put(STORE_NAMES.inventory_items, updated);

    await createAuditLog(
      'UPDATE',
      'inventory',
      id,
      { changes: updates }
    );

    console.log('[v0] Inventory item updated:', id);
    return updated;
  } catch (error) {
    console.error('[v0] Error updating inventory item:', error);
    throw error;
  }
}

/**
 * Reduce inventory quantity
 */
export async function reduceInventoryQuantity(id: string, quantity: number): Promise<InventoryItem> {
  try {
    const item = await getInventoryItem(id);
    if (!item) {
      throw new Error(`Inventory item ${id} not found`);
    }

    const newQuantity = Math.max(0, item.quantity_available - quantity);
    return updateInventoryItem(id, { quantity_available: newQuantity });
  } catch (error) {
    console.error('[v0] Error reducing inventory:', error);
    throw error;
  }
}

/**
 * Get low stock items (quantity < 10)
 */
export async function getLowStockItems(): Promise<InventoryItem[]> {
  try {
    const all = await getInventoryItems();
    return all.filter(item => item.quantity_available < 10).sort((a, b) => a.quantity_available - b.quantity_available);
  } catch (error) {
    console.error('[v0] Error getting low stock items:', error);
    throw error;
  }
}

/**
 * Delete inventory item (soft delete by setting quantity to 0)
 */
export async function deleteInventoryItem(id: string): Promise<void> {
  try {
    await updateInventoryItem(id, { quantity_available: 0 });

    await createAuditLog(
      'DELETE',
      'inventory',
      id,
      {}
    );

    console.log('[v0] Inventory item deleted:', id);
  } catch (error) {
    console.error('[v0] Error deleting inventory item:', error);
    throw error;
  }
}

import { db, STORE_NAMES } from './indexeddb';
import type { Household, HouseholdStatus } from './schema';
import { createAuditLog } from '../auth';

/**
 * Generate UUID-like ID for households
 */
function generateId(): string {
  return `hh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all households
 */
export async function getHouseholds(filters?: {
  purok_sitio?: string;
  status?: HouseholdStatus;
  search?: string;
  barangay_id?: string;
}): Promise<Household[]> {
  try {
    const all = await db.getAll<Household>(STORE_NAMES.households);

    let filtered = all;

    if (filters?.barangay_id) {
      filtered = filtered.filter(h => h.barangay_id === filters.barangay_id);
    }

    if (filters?.status) {
      filtered = filtered.filter(h => h.status === filters.status);
    }

    if (filters?.purok_sitio) {
      filtered = filtered.filter(h => h.purok_sitio === filters.purok_sitio);
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(h =>
        h.head_name.toLowerCase().includes(search) ||
        h.street_address.toLowerCase().includes(search) ||
        h.id.toLowerCase().includes(search)
      );
    }

    // Sort by creation date (newest first)
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('[v0] Error fetching households:', error);
    throw error;
  }
}

/**
 * Get household by ID
 */
export async function getHousehold(id: string): Promise<Household | undefined> {
  try {
    return await db.get<Household>(STORE_NAMES.households, id);
  } catch (error) {
    console.error('[v0] Error fetching household:', error);
    throw error;
  }
}

/**
 * Get households by purok
 */
export async function getHouseholdsByPurok(purok: string): Promise<Household[]> {
  return getHouseholds({ purok_sitio: purok });
}

/**
 * Create new household
 */
export async function createHousehold(data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<Household> {
  try {
    const household: Household = {
      ...data,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'pending', // Will sync when backend available
    };

    await db.add(STORE_NAMES.households, household);
    
    await createAuditLog(
      'CREATE',
      'household',
      household.id,
      { household_name: data.head_name, purok: data.purok_sitio }
    );

    console.log('[v0] Household created:', household.id);
    return household;
  } catch (error) {
    console.error('[v0] Error creating household:', error);
    throw error;
  }
}

/**
 * Update household
 */
export async function updateHousehold(id: string, updates: Partial<Household>): Promise<Household> {
  try {
    const existing = await getHousehold(id);
    if (!existing) {
      throw new Error(`Household ${id} not found`);
    }

    const updated: Household = {
      ...existing,
      ...updates,
      id, // Don't allow ID change
      createdAt: existing.createdAt, // Don't change creation time
      updatedAt: new Date(),
      syncStatus: 'pending',
    };

    await db.put(STORE_NAMES.households, updated);

    await createAuditLog(
      'UPDATE',
      'household',
      id,
      { changes: updates }
    );

    console.log('[v0] Household updated:', id);
    return updated;
  } catch (error) {
    console.error('[v0] Error updating household:', error);
    throw error;
  }
}

/**
 * Delete household (soft delete - mark as moved out)
 */
export async function deleteHousehold(id: string, reason: 'moved_out' | 'deceased'): Promise<void> {
  try {
    await updateHousehold(id, { status: reason });

    await createAuditLog(
      'DELETE',
      'household',
      id,
      { status: reason }
    );

    console.log('[v0] Household deleted (soft):', id);
  } catch (error) {
    console.error('[v0] Error deleting household:', error);
    throw error;
  }
}

/**
 * Get all puroks (distinct values)
 */
export async function getAllPuroks(barangay_id: string): Promise<string[]> {
  try {
    const households = await getHouseholds({ barangay_id });
    const puroks = new Set(households.map(h => h.purok_sitio));
    return Array.from(puroks).sort();
  } catch (error) {
    console.error('[v0] Error fetching puroks:', error);
    throw error;
  }
}

/**
 * Count households by status
 */
export async function countHouseholdsByStatus(barangay_id: string): Promise<Record<HouseholdStatus, number>> {
  try {
    const households = await getHouseholds({ barangay_id });
    const counts = {
      active: 0,
      moved_out: 0,
      deceased: 0,
    };

    households.forEach(h => {
      counts[h.status]++;
    });

    return counts;
  } catch (error) {
    console.error('[v0] Error counting households:', error);
    throw error;
  }
}

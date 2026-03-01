import { db, STORE_NAMES } from './indexeddb';
import type { Resident, ResidentStatus, VulnerabilityFlags } from './schema';
import { calculateVulnerabilityFlags, updateAgeBasedFlags } from './vulnerability';
import { getHousehold } from './households';
import { createAuditLog } from '../auth';

/**
 * Generate ID for residents
 */
function generateId(): string {
  return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all residents
 */
export async function getResidents(filters?: {
  household_id?: string;
  status?: ResidentStatus;
  search?: string;
}): Promise<Resident[]> {
  try {
    const all = await db.getAll<Resident>(STORE_NAMES.residents);

    let filtered = all;

    if (filters?.household_id) {
      filtered = filtered.filter(r => r.household_id === filters.household_id);
    }

    if (filters?.status) {
      filtered = filtered.filter(r => r.status === filters.status);
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(r =>
        r.full_name.toLowerCase().includes(search) ||
        r.id.toLowerCase().includes(search)
      );
    }

    return filtered.sort((a, b) => a.full_name.localeCompare(b.full_name));
  } catch (error) {
    console.error('Error fetching residents:', error);
    throw error;
  }
}

/**
 * Get resident by ID
 */
export async function getResident(id: string): Promise<Resident | undefined> {
  try {
    return await db.get<Resident>(STORE_NAMES.residents, id);
  } catch (error) {
    console.error('Error fetching resident:', error);
    throw error;
  }
}

/**
 * Get all residents in a household
 */
export async function getResidentsInHousehold(household_id: string): Promise<Resident[]> {
  return getResidents({ household_id });
}

/**
 * Create new resident
 */
export async function createResident(data: Omit<Resident, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<Resident> {
  try {
    const resident: Resident = {
      ...data,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'pending',
    };

    await db.add(STORE_NAMES.residents, resident);

    // Create vulnerability flags
    const household = await getHousehold(data.household_id);
    if (household) {
      const flags = calculateVulnerabilityFlags(resident, household);
      await db.add(STORE_NAMES.vulnerability_flags, {
        id: `vf_${resident.id}`,
        resident_id: resident.id,
        ...flags,
      } as VulnerabilityFlags);

      console.log(`Vulnerability flags created for ${resident.full_name}:`, {
        is_child: flags.is_child,
        is_adult: flags.is_adult,
        is_senior: flags.is_senior,
      });
    }

    await createAuditLog(
      'CREATE',
      'resident',
      resident.id,
      { name: data.full_name, birthdate: data.birthdate }
    );

    console.log('Resident created:', resident.id);
    return resident;
  } catch (error) {
    console.error('Error creating resident:', error);
    throw error;
  }
}

/**
 * Update resident
 */
export async function updateResident(id: string, updates: Partial<Resident>): Promise<Resident> {
  try {
    const existing = await getResident(id);
    if (!existing) {
      throw new Error(`Resident ${id} not found`);
    }

    const updated: Resident = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
      syncStatus: 'pending',
    };

    await db.put(STORE_NAMES.residents, updated);

    // Check if age-based flags need updating (birthday might have passed)
    const household = await getHousehold(updated.household_id);
    if (household) {
      const existingFlags = await db.get<VulnerabilityFlags>(
        STORE_NAMES.vulnerability_flags,
        `vf_${id}`
      );
      
      if (existingFlags) {
        const updated_flags = updateAgeBasedFlags(updated, household, existingFlags);
        if (updated_flags) {
          await db.put(STORE_NAMES.vulnerability_flags, updated_flags);
          console.log('Vulnerability flags updated for resident:', id);
        }
      }
    }

    await createAuditLog(
      'UPDATE',
      'resident',
      id,
      { changes: updates }
    );

    console.log('Resident updated:', id);
    return updated;
  } catch (error) {
    console.error('Error updating resident:', error);
    throw error;
  }
}

/**
 * Delete resident (soft delete)
 */
export async function deleteResident(id: string, reason: 'moved_out' | 'deceased'): Promise<void> {
  try {
    await updateResident(id, { status: reason });

    await createAuditLog(
      'DELETE',
      'resident',
      id,
      { status: reason }
    );

    console.log('Resident deleted (soft):', id);
  } catch (error) {
    console.error('Error deleting resident:', error);
    throw error;
  }
}

/**
 * Get vulnerability flags for resident
 */
export async function getResidentVulnerabilityFlags(resident_id: string): Promise<VulnerabilityFlags | undefined> {
  try {
    return await db.get<VulnerabilityFlags>(
      STORE_NAMES.vulnerability_flags,
      `vf_${resident_id}`
    );
  } catch (error) {
    console.error('Error fetching vulnerability flags:', error);
    throw error;
  }
}

/**
 * Update health-related vulnerability flags
 */
export async function updateHealthFlags(
  resident_id: string,
  updates: {
    is_pregnant?: boolean;
    is_pwd?: boolean;
    pwd_type?: string;
    has_chronic_illness?: boolean;
    chronic_conditions?: string[];
  }
): Promise<VulnerabilityFlags | undefined> {
  try {
    const existing = await getResidentVulnerabilityFlags(resident_id);
    if (!existing) {
      throw new Error(`Vulnerability flags not found for resident ${resident_id}`);
    }

    const updated: VulnerabilityFlags = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
      syncStatus: 'pending',
    };

    await db.put(STORE_NAMES.vulnerability_flags, updated);

    await createAuditLog(
      'UPDATE',
      'resident',
      resident_id,
      { health_updates: updates }
    );

    console.log('Health flags updated for resident:', resident_id);
    return updated;
  } catch (error) {
    console.error('Error updating health flags:', error);
    throw error;
  }
}

/**
 * Get count of residents by vulnerability type
 */
export async function countVulnerableResidents(barangay_id: string): Promise<{
  children: number;
  seniors: number;
  pwd: number;
  pregnant: number;
  chronic: number;
  low_income: number;
}> {
  try {
    const residents = await getResidents({ status: 'active' });
    const allFlags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);

    const counts = {
      children: 0,
      seniors: 0,
      pwd: 0,
      pregnant: 0,
      chronic: 0,
      low_income: 0,
    };

    residents.forEach(resident => {
      const flags = allFlags.find(f => f.resident_id === resident.id);
      if (!flags) return;

      if (flags.is_child) counts.children++;
      if (flags.is_senior) counts.seniors++;
      if (flags.is_pwd) counts.pwd++;
      if (flags.is_pregnant) counts.pregnant++;
      if (flags.has_chronic_illness) counts.chronic++;
      if (flags.is_low_income) counts.low_income++;
    });

    return counts;
  } catch (error) {
    console.error('Error counting vulnerable residents:', error);
    throw error;
  }
}

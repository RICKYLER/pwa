import { db, STORE_NAMES } from './indexeddb';
import type { PWDType, Resident, ResidentStatus, VulnerabilityFlags } from './schema';
import {
  getCurrentVulnerabilityFlagsMapForResidents,
} from './vulnerability';
import { getHousehold, getHouseholds } from './households';
import { createAuditLog } from '../auth';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapAllDataFromSupabase } from '@/lib/supabase/bootstrap';

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
      syncStatus: 'synced',
    };

    await runServerMutation({
      action: 'create_resident',
      resident: {
        id: resident.id,
        household_id: resident.household_id,
        full_name: resident.full_name.trim(),
        birthdate: resident.birthdate,
        gender: resident.gender,
        relationship_to_head: resident.relationship_to_head.trim(),
        status: resident.status,
        civil_status: resident.civil_status,
        occupation: resident.occupation?.trim() || undefined,
        income_level: resident.income_level,
        contact_number: resident.contact_number?.trim() || undefined,
      },
    });

    await bootstrapAllDataFromSupabase(true);

    const createdResident = await getResident(resident.id);
    if (!createdResident) {
      throw new Error('Resident was created in Supabase, but it did not rehydrate locally.');
    }

    console.log('Resident created:', createdResident.id);
    return createdResident;
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

    await runServerMutation({
      action: 'update_resident',
      residentId: id,
      updates: {
        ...updates,
        full_name: typeof updates.full_name === 'string' ? updates.full_name.trim() : updates.full_name,
        relationship_to_head:
          typeof updates.relationship_to_head === 'string'
            ? updates.relationship_to_head.trim()
            : updates.relationship_to_head,
        occupation: typeof updates.occupation === 'string' ? (updates.occupation.trim() || null) : updates.occupation,
        contact_number:
          typeof updates.contact_number === 'string'
            ? (updates.contact_number.trim() || null)
            : updates.contact_number,
      },
    });

    await bootstrapAllDataFromSupabase(true);

    const updatedResident = await getResident(id);
    if (!updatedResident) {
      throw new Error('Resident was updated in Supabase, but it did not rehydrate locally.');
    }

    console.log('Resident updated:', id);
    return updatedResident;
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
    const resident = await getResident(resident_id);
    if (!resident) {
      return undefined;
    }

    const household = await getHousehold(resident.household_id);
    if (!household) {
      return undefined;
    }

    const flagsByResidentId = await getCurrentVulnerabilityFlagsMapForResidents([resident], [household]);
    return flagsByResidentId.get(resident_id);
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
    pwd_type?: PWDType;
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
    const households = await getHouseholds({
      barangay_id,
      status: 'active',
      registration_status: 'approved',
    });
    const householdIds = new Set(households.map((household) => household.id));
    const residents = (await getResidents({ status: 'active' }))
      .filter((resident) => householdIds.has(resident.household_id));
    const currentFlagsByResidentId = await getCurrentVulnerabilityFlagsMapForResidents(residents, households);

    const counts = {
      children: 0,
      seniors: 0,
      pwd: 0,
      pregnant: 0,
      chronic: 0,
      low_income: 0,
    };

    residents.forEach(resident => {
      const flags = currentFlagsByResidentId.get(resident.id);
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

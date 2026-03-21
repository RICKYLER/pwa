import { db, STORE_NAMES } from './indexeddb';
import type {
  Household,
  HouseholdStatus,
  LocationConfidence,
  HouseholdRegistrationStatus,
} from './schema';
import { createAuditLog } from '../auth';
import { getLocationMasterList } from './location-master';
import {
  getHouseholdRegistrationStatus,
  getStoredOrDerivedPinQaStatus,
} from '@/lib/household-registration';

/**
 * Generate UUID-like ID for households
 */
function generateId(): string {
  return `hh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeCoordinate(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

function deriveLocationConfidence(household: Household): LocationConfidence {
  if (household.location_confidence) return household.location_confidence;
  if (typeof household.gps_lat !== 'number' || typeof household.gps_long !== 'number') return 'low';
  if (household.location_verified) return 'high';
  if (household.location_source === 'manual_pin' || household.location_source === 'current_gps') {
    return 'medium';
  }
  return 'medium';
}

export function normalizeHousehold(household: Household): Household {
  const normalizedHousehold = {
    ...household,
    gps_lat: normalizeCoordinate(household.gps_lat),
    gps_long: normalizeCoordinate(household.gps_long),
    location_verified: Boolean(household.location_verified),
    location_verified_at: normalizeDate(household.location_verified_at),
    location_confidence: deriveLocationConfidence(household),
    registration_status: getHouseholdRegistrationStatus(household),
    registration_submitted_at: normalizeDate(household.registration_submitted_at),
    registration_reviewed_at: normalizeDate(household.registration_reviewed_at),
  };

  return {
    ...normalizedHousehold,
    pin_qa_status: getStoredOrDerivedPinQaStatus(normalizedHousehold, [normalizedHousehold]),
  };
}

/**
 * Get all households
 */
export async function getHouseholds(filters?: {
  purok_sitio?: string;
  status?: HouseholdStatus;
  search?: string;
  barangay_id?: string;
  registration_status?: HouseholdRegistrationStatus | 'all';
  applicant_user_id?: string;
}): Promise<Household[]> {
  try {
    const all = (await db.getAll<Household>(STORE_NAMES.households)).map(normalizeHousehold);

    let filtered = all;

    if (filters?.barangay_id) {
      filtered = filtered.filter(h => h.barangay_id === filters.barangay_id);
    }

    if (filters?.applicant_user_id) {
      filtered = filtered.filter((household) => household.applicant_user_id === filters.applicant_user_id);
    }

    if (filters?.status) {
      filtered = filtered.filter(h => h.status === filters.status);
    }

    if (filters?.purok_sitio) {
      filtered = filtered.filter(h => h.purok_sitio === filters.purok_sitio);
    }

    if (filters?.registration_status && filters.registration_status !== 'all') {
      filtered = filtered.filter((household) =>
        getHouseholdRegistrationStatus(household) === filters.registration_status,
      );
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(h =>
        h.head_name.toLowerCase().includes(search) ||
        h.applicant_email?.toLowerCase().includes(search) ||
        h.street_address.toLowerCase().includes(search) ||
        h.purok_sitio.toLowerCase().includes(search) ||
        h.barangay_name?.toLowerCase().includes(search) ||
        h.municipality?.toLowerCase().includes(search) ||
        h.id.toLowerCase().includes(search)
      );
    }

    // Sort by creation date (newest first)
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Error fetching households:', error);
    throw error;
  }
}

/**
 * Get household by ID
 */
export async function getHousehold(id: string): Promise<Household | undefined> {
  try {
    const household = await db.get<Household>(STORE_NAMES.households, id);
    return household ? normalizeHousehold(household) : undefined;
  } catch (error) {
    console.error('Error fetching household:', error);
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
    const household: Household = normalizeHousehold({
      ...data,
      registration_status: data.registration_status ?? 'approved',
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'pending', // Will sync when backend available
    });

    await db.add(STORE_NAMES.households, household);
    
    await createAuditLog(
      'CREATE',
      'household',
      household.id,
      { household_name: data.head_name, purok: data.purok_sitio }
    );

    console.log('Household created:', household.id);
    return household;
  } catch (error) {
    console.error('Error creating household:', error);
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

    const updated: Household = normalizeHousehold({
      ...existing,
      ...updates,
      id, // Don't allow ID change
      createdAt: existing.createdAt, // Don't change creation time
      updatedAt: new Date(),
      syncStatus: 'pending',
    });

    await db.put(STORE_NAMES.households, updated);

    await createAuditLog(
      'UPDATE',
      'household',
      id,
      { changes: updates }
    );

    console.log('Household updated:', id);
    return updated;
  } catch (error) {
    console.error('Error updating household:', error);
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

    console.log('Household deleted (soft):', id);
  } catch (error) {
    console.error('Error deleting household:', error);
    throw error;
  }
}

/**
 * Get all puroks (distinct values)
 */
export async function getAllPuroks(barangay_id: string): Promise<string[]> {
  try {
    const [households, masterList] = await Promise.all([
      getHouseholds({ barangay_id }),
      getLocationMasterList(barangay_id),
    ]);
    const puroks = new Set([
      ...households.map(h => h.purok_sitio),
      ...(masterList?.puroks ?? []),
    ]);
    return Array.from(puroks).sort();
  } catch (error) {
    console.error('Error fetching puroks:', error);
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
    console.error('Error counting households:', error);
    throw error;
  }
}

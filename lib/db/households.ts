import { db, STORE_NAMES } from './indexeddb';
import type {
  DisasterRiskLevel,
  Household,
  HazardType,
  HouseholdStatus,
  LocationConfidence,
  HouseholdRegistrationStatus,
  Resident,
  VulnerabilityFlags,
} from './schema';
import { createAuditLog } from '../auth';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';
import { getLocationMasterList } from './location-master';
import { mapSupabaseRow } from '@/lib/supabase/row-mapper';
import { MABINI_MUNICIPALITY } from '@/lib/barangays';
import { parseHazardTags } from '@/lib/disaster-alerts';
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

function generateResidentBundleId(): string {
  return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

type HouseholdMemberBundleDraft = {
  full_name: string;
  birthdate: string;
  gender: 'M' | 'F';
  relationship_to_head: string;
  civil_status: 'single' | 'married' | 'widowed' | 'separated';
  occupation: string;
  income_level: 'low' | 'middle' | 'high';
  is_pregnant: boolean;
  pregnancy_months?: number | null | '';
  expected_delivery_date?: string;
  is_pwd: boolean;
  is_4ps: boolean;
  is_indigent: boolean;
  pwd_type?: string;
};

type HouseholdHeadProfileDraft = {
  birthdate: string;
  gender: 'M' | 'F';
  civil_status: 'single' | 'married' | 'widowed' | 'separated';
  occupation: string;
  income_level: 'low' | 'middle' | 'high';
  is_pregnant: boolean;
  pregnancy_months?: number | null | '';
  expected_delivery_date?: string;
  is_pwd: boolean;
  is_4ps: boolean;
  is_indigent: boolean;
  pwd_type?: string;
};

type CreateHouseholdBundleMutationPayload = {
  household?: Record<string, unknown>;
  household_id?: string;
  head_profile?: Record<string, unknown>;
  residents?: Record<string, unknown>[];
  vulnerability_flags?: Record<string, unknown>[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    municipality: household.municipality?.trim() || MABINI_MUNICIPALITY,
    gps_lat: normalizeCoordinate(household.gps_lat),
    gps_long: normalizeCoordinate(household.gps_long),
    location_verified: Boolean(household.location_verified),
    location_verified_at: normalizeDate(household.location_verified_at),
    location_confidence: deriveLocationConfidence(household),
    registration_status: getHouseholdRegistrationStatus(household),
    registration_submitted_at: normalizeDate(household.registration_submitted_at),
    registration_reviewed_at: normalizeDate(household.registration_reviewed_at),
    hazard_tags: parseHazardTags(household.hazard_tags),
    disaster_profile_updated_at: normalizeDate(household.disaster_profile_updated_at),
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
  hazard?: HazardType | 'all';
  disaster_risk_level?: DisasterRiskLevel | 'all';
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

    if (filters?.hazard && filters.hazard !== 'all') {
      filtered = filtered.filter((household) => household.hazard_tags?.includes(filters.hazard as HazardType));
    }

    if (filters?.disaster_risk_level && filters.disaster_risk_level !== 'all') {
      filtered = filtered.filter((household) => household.disaster_risk_level === filters.disaster_risk_level);
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
  return createHouseholdBundle(data, []);
}

export async function createHouseholdBundle(
  data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
  members: HouseholdMemberBundleDraft[],
  headProfile?: HouseholdHeadProfileDraft,
): Promise<Household> {
  try {
    const householdId = generateId();
    const household = normalizeHousehold({
      ...data,
      registration_status: data.registration_status ?? 'approved',
      id: householdId,
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'synced' as const,
    });

    const payload = await runServerMutation<CreateHouseholdBundleMutationPayload>({
      action: 'create_household_bundle',
      household: {
        ...household,
        createdAt: undefined,
        updatedAt: undefined,
        syncStatus: undefined,
      },
      head_profile: headProfile
        ? {
          birthdate: headProfile.birthdate,
          gender: headProfile.gender,
          civil_status: headProfile.civil_status,
          occupation: headProfile.occupation.trim() || undefined,
          income_level: headProfile.income_level,
          is_pregnant: Boolean(headProfile.is_pregnant),
          pregnancy_months: headProfile.is_pregnant
            ? (typeof headProfile.pregnancy_months === 'number' ? headProfile.pregnancy_months : undefined)
            : undefined,
          expected_delivery_date: headProfile.is_pregnant ? headProfile.expected_delivery_date || undefined : undefined,
          is_pwd: Boolean(headProfile.is_pwd),
          is_4ps: Boolean(headProfile.is_4ps),
          is_indigent: Boolean(headProfile.is_indigent),
          pwd_type: headProfile.is_pwd ? headProfile.pwd_type || undefined : undefined,
        }
        : undefined,
      members: members.map((member) => ({
        id: generateResidentBundleId(),
        household_id: householdId,
        full_name: member.full_name.trim(),
        birthdate: member.birthdate,
        gender: member.gender,
        relationship_to_head: member.relationship_to_head.trim(),
        civil_status: member.civil_status,
        occupation: member.occupation.trim() || undefined,
        income_level: member.income_level,
        status: 'active',
        is_pregnant: Boolean(member.is_pregnant),
        pregnancy_months: member.is_pregnant
          ? (typeof member.pregnancy_months === 'number' ? member.pregnancy_months : undefined)
          : undefined,
        expected_delivery_date: member.is_pregnant ? member.expected_delivery_date || undefined : undefined,
        is_pwd: Boolean(member.is_pwd),
        is_4ps: Boolean(member.is_4ps),
        is_indigent: Boolean(member.is_indigent),
        pwd_type: member.is_pwd ? member.pwd_type || undefined : undefined,
      })),
    });

    if (isRecord(payload.household)) {
      const createdHousehold = normalizeHousehold(
        mapSupabaseRow('households', payload.household) as Household,
      );
      await db.put(STORE_NAMES.households, createdHousehold);

      if (Array.isArray(payload.residents)) {
        await Promise.all(
          payload.residents
            .filter(isRecord)
            .map((resident) => db.put(
              STORE_NAMES.residents,
              mapSupabaseRow('residents', resident) as Resident,
            )),
        );
      }

      if (Array.isArray(payload.vulnerability_flags)) {
        await Promise.all(
          payload.vulnerability_flags
            .filter(isRecord)
            .map((flags) => db.put(
              STORE_NAMES.vulnerability_flags,
              mapSupabaseRow('vulnerability_flags', flags) as VulnerabilityFlags,
            )),
        );
      }

      void bootstrapCurrentPathData(true).catch((error) => {
        console.warn('Background bootstrap after household creation failed:', error);
      });

      console.log('Household created:', createdHousehold.id);
      return createdHousehold;
    }

    await bootstrapCurrentPathData(true);

    const createdHousehold = await getHousehold(householdId);
    if (!createdHousehold) {
      throw new Error('Household was created in Supabase, but it did not rehydrate locally.');
    }

    console.log('Household created:', createdHousehold.id);
    return createdHousehold;
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
    await runServerMutation({
      action: 'update_household',
      householdId: id,
      updates: {
        ...updates,
        head_name: typeof updates.head_name === 'string' ? updates.head_name.trim() : updates.head_name,
        applicant_email:
          typeof updates.applicant_email === 'string'
            ? (updates.applicant_email.trim() || null)
            : updates.applicant_email,
        barangay_name:
          typeof updates.barangay_name === 'string'
            ? (updates.barangay_name.trim() || null)
            : updates.barangay_name,
        municipality:
          typeof updates.municipality === 'string'
            ? (updates.municipality.trim() || null)
            : updates.municipality,
        purok_sitio: typeof updates.purok_sitio === 'string' ? updates.purok_sitio.trim() : updates.purok_sitio,
        street_address:
          typeof updates.street_address === 'string'
            ? updates.street_address.trim()
            : updates.street_address,
        landmark_directions:
          typeof updates.landmark_directions === 'string'
            ? (updates.landmark_directions.trim() || null)
            : updates.landmark_directions,
        contact_number:
          typeof updates.contact_number === 'string'
            ? (updates.contact_number.trim() || null)
            : updates.contact_number,
        hazard_tags: Array.isArray(updates.hazard_tags) ? updates.hazard_tags : updates.hazard_tags,
        disaster_risk_level:
          typeof updates.disaster_risk_level === 'string'
            ? updates.disaster_risk_level
            : updates.disaster_risk_level,
        evacuation_site:
          typeof updates.evacuation_site === 'string'
            ? (updates.evacuation_site.trim() || null)
            : updates.evacuation_site,
        special_assistance_notes:
          typeof updates.special_assistance_notes === 'string'
            ? (updates.special_assistance_notes.trim() || null)
            : updates.special_assistance_notes,
        disaster_profile_updated_at:
          updates.disaster_profile_updated_at instanceof Date
            ? updates.disaster_profile_updated_at.toISOString()
            : updates.disaster_profile_updated_at,
      },
    });

    await bootstrapCurrentPathData(true);

    const updatedHousehold = await getHousehold(id);
    if (!updatedHousehold) {
      throw new Error('Household was updated in Supabase, but it did not rehydrate locally.');
    }

    console.log('Household updated:', id);
    return updatedHousehold;
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

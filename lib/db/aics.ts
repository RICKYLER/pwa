import { db, STORE_NAMES } from './indexeddb';
import type {
  AicsRecord,
  AicsClientCategory,
  AicsAssistanceType,
  AicsStatus,
  AicsIntakeCategory,
  AicsSector,
} from './schema';

function generateAicsId(): string {
  return `aics_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function generateAicsControlNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `AICS-${year}-${rand}`;
}

export interface AicsQueryFilters {
  query?: string;
  client_category?: AicsClientCategory | 'all';
  assistance_type?: AicsAssistanceType | 'all';
  intake_category?: AicsIntakeCategory | 'all';
  status?: AicsStatus | 'all';
  barangay_id?: string;
  sub_category?: string;
  includeDeleted?: boolean;
}

/**
 * Fetch AICS records from IndexedDB with optional instant search query & filters.
 */
export async function getAicsRecords(filters?: AicsQueryFilters): Promise<AicsRecord[]> {
  try {
    let all = await db.getAll<AicsRecord>(STORE_NAMES.aics_records);

    if (all.length === 0 && typeof window !== 'undefined') {
      try {
        const { bootstrapPathnameData } = await import('@/lib/supabase/route-bootstrap');
        await bootstrapPathnameData('/aics', false);
        all = await db.getAll<AicsRecord>(STORE_NAMES.aics_records);
      } catch (err) {
        console.warn('Failed to auto-bootstrap AICS from Supabase:', err);
      }
    }

    let filtered = all;

    if (!filters?.includeDeleted) {
      filtered = filtered.filter((r) => !r.is_deleted);
    }

    if (filters?.client_category && filters.client_category !== 'all') {
      filtered = filtered.filter((r) => r.client_category === filters.client_category);
    }

    if (filters?.assistance_type && filters.assistance_type !== 'all') {
      filtered = filtered.filter((r) => r.assistance_type === filters.assistance_type);
    }

    if (filters?.intake_category && filters.intake_category !== 'all') {
      filtered = filtered.filter((r) => r.intake_category === filters.intake_category);
    }

    if (filters?.status && filters.status !== 'all') {
      filtered = filtered.filter((r) => r.status === filters.status);
    }

    if (filters?.barangay_id && filters.barangay_id !== 'all') {
      filtered = filtered.filter(
        (r) => r.barangay_id.toLowerCase() === filters.barangay_id?.toLowerCase()
      );
    }

    if (filters?.sub_category && filters.sub_category !== 'all') {
      const targetSub = filters.sub_category.toLowerCase();
      filtered = filtered.filter((r) => r.sub_category.toLowerCase().includes(targetSub));
    }

    if (filters?.query && filters.query.trim()) {
      const q = filters.query.trim().toLowerCase();
      filtered = filtered.filter((r) => {
        return (
          r.control_number.toLowerCase().includes(q) ||
          (r.voucher_number && r.voucher_number.toLowerCase().includes(q)) ||
          r.client_name.toLowerCase().includes(q) ||
          (r.purok_sitio && r.purok_sitio.toLowerCase().includes(q)) ||
          r.sub_category.toLowerCase().includes(q) ||
          r.specific_assistance.toLowerCase().includes(q) ||
          (r.intake_sheet?.problem_presented &&
            r.intake_sheet.problem_presented.toLowerCase().includes(q))
        );
      });
    }

    // Sort newest first
    return filtered.sort((a, b) => {
      const timeA = new Date(a.intake_date || a.createdAt).getTime();
      const timeB = new Date(b.intake_date || b.createdAt).getTime();
      return timeB - timeA;
    });
  } catch (error) {
    console.error('Error fetching AICS records from store:', error);
    return [];
  }
}

/**
 * Fetch a single AICS record by ID
 */
export async function getAicsRecord(id: string): Promise<AicsRecord | undefined> {
  try {
    const record = await db.get<AicsRecord>(STORE_NAMES.aics_records, id);
    if (!record || record.is_deleted) return undefined;
    return record;
  } catch (error) {
    console.error(`Error fetching AICS record ${id}:`, error);
    return undefined;
  }
}

function notifyAicsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mswdo:aics-records-changed'));
  }
}

/**
 * Create a new AICS record
 */
export async function createAicsRecord(
  data: Omit<AicsRecord, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>
): Promise<AicsRecord> {
  const now = new Date().toISOString();
  const record: AicsRecord = {
    ...data,
    id: generateAicsId(),
    control_number: data.control_number || generateAicsControlNumber(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  await db.add(STORE_NAMES.aics_records, record);

  // Directly dispatch Server Mutation to Supabase for instant real-time sync
  if (typeof window !== 'undefined') {
    try {
      const { runServerMutation } = await import('@/lib/mutations');
      await runServerMutation({
        action: 'create_aics_record',
        payload: { record },
      });
      record.syncStatus = 'synced';
      await db.put(STORE_NAMES.aics_records, record);
    } catch (err) {
      console.warn('Failed to sync AICS record to Supabase immediately (offline-queued):', err);
    }
  }

  notifyAicsChanged();
  return record;
}

/**
 * Update an existing AICS record
 */
export async function updateAicsRecord(
  id: string,
  updates: Partial<AicsRecord>
): Promise<AicsRecord> {
  const existing = await db.get<AicsRecord>(STORE_NAMES.aics_records, id);
  if (!existing) {
    throw new Error(`AICS record ${id} not found`);
  }

  const updated: AicsRecord = {
    ...existing,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
  };

  await db.put(STORE_NAMES.aics_records, updated);

  // Directly dispatch Server Mutation to Supabase for instant real-time sync
  if (typeof window !== 'undefined') {
    try {
      const { runServerMutation } = await import('@/lib/mutations');
      await runServerMutation({
        action: 'update_aics_record',
        payload: { id, updates },
      });
      updated.syncStatus = 'synced';
      await db.put(STORE_NAMES.aics_records, updated);
    } catch (err) {
      console.warn('Failed to sync AICS update to Supabase immediately (offline-queued):', err);
    }
  }

  notifyAicsChanged();

  return updated;
}

/**
 * Soft delete an AICS record
 */
export async function deleteAicsRecord(id: string, deletedBy?: string): Promise<boolean> {
  const existing = await db.get<AicsRecord>(STORE_NAMES.aics_records, id);
  if (!existing) return false;

  const now = new Date().toISOString();
  const updated: AicsRecord = {
    ...existing,
    is_deleted: true,
    deleted_at: now,
    deleted_by: deletedBy || 'authorized_user',
    updatedAt: now,
    syncStatus: 'pending',
  };

  await db.put(STORE_NAMES.aics_records, updated);

  // Directly dispatch Server Mutation to Supabase for instant real-time sync
  if (typeof window !== 'undefined') {
    try {
      const { runServerMutation } = await import('@/lib/mutations');
      await runServerMutation({
        action: 'update_aics_record',
        payload: {
          id,
          updates: {
            is_deleted: true,
            deleted_at: updated.deleted_at,
            deleted_by: updated.deleted_by,
          },
        },
      });
    } catch (err) {
      console.warn('Failed to sync AICS deletion to Supabase immediately:', err);
    }
  }

  notifyAicsChanged();
  return true;
}

/**
 * Calculate statistical aggregates for the AICS dashboard overview
 */
export async function getAicsStats(): Promise<{
  totalClients: number;
  totalDisbursed: number;
  medicalCount: number;
  dialysisCancerCount: number;
  fhonaCount: number;
  seniorCount: number;
  pwdCount: number;
  ynspCount: number;
}> {
  const records = await getAicsRecords();
  let totalDisbursed = 0;
  let medicalCount = 0;
  let dialysisCancerCount = 0;
  let fhonaCount = 0;
  let seniorCount = 0;
  let pwdCount = 0;
  let ynspCount = 0;

  for (const r of records) {
    totalDisbursed += Number(r.amount_approved) || 0;
    if (r.assistance_type === 'medical') {
      medicalCount++;
    }
    const sub = (r.sub_category || '').toLowerCase();
    if (sub.includes('dialysis') || sub.includes('cancer')) {
      dialysisCancerCount++;
    }
    if (r.client_category === 'fhona') fhonaCount++;
    else if (r.client_category === 'senior_citizen') seniorCount++;
    else if (r.client_category === 'pwd') pwdCount++;
    else if (r.client_category === 'ynsp') ynspCount++;
  }

  return {
    totalClients: records.length,
    totalDisbursed,
    medicalCount,
    dialysisCancerCount,
    fhonaCount,
    seniorCount,
    pwdCount,
    ynspCount,
  };
}

/**
 * Fetch all AICS records for a specific resident or household,
 * sorted with the most recent assistance first.
 */
export async function getAicsRecordsForResident(options: {
  residentId?: string | null;
  householdId?: string | null;
  clientName?: string | null;
}): Promise<AicsRecord[]> {
  try {
    const all = await getAicsRecords();
    const cleanResidentId = options.residentId?.trim();
    const cleanHouseholdId = options.householdId?.trim();
    const cleanName = options.clientName?.trim().toLowerCase();

    return all.filter((r) => {
      if (r.is_deleted) return false;
      if (cleanResidentId && r.resident_id && r.resident_id === cleanResidentId) return true;
      if (cleanHouseholdId && r.household_id && r.household_id === cleanHouseholdId) return true;
      if (cleanName && r.client_name && r.client_name.trim().toLowerCase() === cleanName) return true;
      return false;
    });
  } catch (error) {
    console.error('Error fetching AICS records for resident:', error);
    return [];
  }
}

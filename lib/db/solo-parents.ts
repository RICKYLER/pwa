import { db, STORE_NAMES } from './indexeddb';
import type {
  SoloParentRecord,
  SoloParentCategory,
  SoloParentStatus,
  VulnerabilityFlags,
} from './schema';

function generateRecordId(): string {
  return `sp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function syncSoloParentVulnerabilityFlag(
  residentId: string,
  isSoloParent: boolean,
  idNumber?: string,
  category?: SoloParentCategory
): Promise<void> {
  try {
    const allFlags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);
    const existing = allFlags.find((f) => f.resident_id === residentId);
    if (existing) {
      const updated: VulnerabilityFlags = {
        ...existing,
        is_solo_parent: isSoloParent,
        solo_parent_id: isSoloParent ? idNumber : undefined,
        solo_parent_category: isSoloParent ? category : undefined,
        updatedAt: new Date(),
        syncStatus: typeof window !== 'undefined' ? 'pending' : 'synced',
      };
      await db.put(STORE_NAMES.vulnerability_flags, updated);
    }
  } catch (err) {
    console.warn('Could not sync vulnerability flags for solo parent:', err);
  }
}

export interface SoloParentQueryFilters {
  query?: string;
  status?: SoloParentStatus;
  category?: SoloParentCategory;
  barangay_id?: string;
  subsidy_only?: boolean;
}

/**
 * Generate official Solo Parent ID Number formatted as SP-YYYY-XXXX
 */
export async function generateSoloParentIdNumber(): Promise<string> {
  try {
    const currentYear = new Date().getFullYear();
    const all = await db.getAll<SoloParentRecord>(STORE_NAMES.solo_parents);
    
    // Filter records for this year
    const yearPrefix = `SP-${currentYear}-`;
    const thisYearRecords = all.filter((r) => r.id_number && r.id_number.startsWith(yearPrefix));
    
    const count = thisYearRecords.length + 1;
    const padded = String(count).padStart(4, '0');
    return `${yearPrefix}${padded}`;
  } catch (error) {
    const currentYear = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `SP-${currentYear}-${rand}`;
  }
}

/**
 * Fetch all Solo Parent records with optional filters
 */
export async function getSoloParents(filters?: SoloParentQueryFilters): Promise<SoloParentRecord[]> {
  try {
    const all = await db.getAll<SoloParentRecord>(STORE_NAMES.solo_parents);
    let result = all;

    if (filters?.status) {
      result = result.filter((item) => item.status === filters.status);
    }

    if (filters?.category) {
      result = result.filter((item) => item.category === filters.category);
    }

    if (filters?.barangay_id && filters.barangay_id !== 'all') {
      result = result.filter(
        (item) => item.barangay_id.toLowerCase() === filters.barangay_id?.toLowerCase()
      );
    }

    if (filters?.subsidy_only) {
      result = result.filter((item) => item.is_minimum_wage_or_below);
    }

    if (filters?.query && filters.query.trim()) {
      const q = filters.query.trim().toLowerCase();
      result = result.filter((item) => {
        return (
          item.id_number?.toLowerCase().includes(q) ||
          item.full_name?.toLowerCase().includes(q) ||
          item.purok_sitio?.toLowerCase().includes(q) ||
          item.notes?.toLowerCase().includes(q) ||
          item.dependents.some((d) => d.full_name.toLowerCase().includes(q))
        );
      });
    }

    // Sort by createdAt desc
    return result.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
  } catch (error) {
    console.error('Error fetching solo parents:', error);
    return [];
  }
}

/**
 * Get a single Solo Parent record by ID
 */
export async function getSoloParentById(id: string): Promise<SoloParentRecord | undefined> {
  try {
    return await db.get<SoloParentRecord>(STORE_NAMES.solo_parents, id);
  } catch (error) {
    console.error(`Error fetching solo parent ${id}:`, error);
    return undefined;
  }
}

/**
 * Get Solo Parent record by resident_id
 */
export async function getSoloParentByResidentId(residentId: string): Promise<SoloParentRecord | undefined> {
  try {
    const all = await db.getAll<SoloParentRecord>(STORE_NAMES.solo_parents);
    return all.find((r) => r.resident_id === residentId);
  } catch (error) {
    console.error(`Error fetching solo parent by residentId ${residentId}:`, error);
    return undefined;
  }
}

/**
 * Register a new Walk-In Solo Parent record and auto-update VulnerabilityFlags
 */
export async function createSoloParent(
  payload: Omit<SoloParentRecord, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>
): Promise<SoloParentRecord> {
  const id = generateRecordId();
  const now = new Date();

  const record: SoloParentRecord = {
    ...payload,
    id,
    createdAt: now,
    updatedAt: now,
    syncStatus: typeof window !== 'undefined' ? 'pending' : 'synced',
  };

  await db.add(STORE_NAMES.solo_parents, record);

  // Auto-flag resident in Vulnerability Flags
  if (record.resident_id) {
    await syncSoloParentVulnerabilityFlag(
      record.resident_id,
      true,
      record.id_number,
      record.category
    );
  }

  return record;
}

/**
 * Update existing Solo Parent record
 */
export async function updateSoloParent(
  id: string,
  updates: Partial<SoloParentRecord>
): Promise<SoloParentRecord> {
  const existing = await getSoloParentById(id);
  if (!existing) {
    throw new Error(`Solo parent record not found: ${id}`);
  }

  const updated: SoloParentRecord = {
    ...existing,
    ...updates,
    updatedAt: new Date(),
    syncStatus: typeof window !== 'undefined' ? 'pending' : 'synced',
  };

  await db.put(STORE_NAMES.solo_parents, updated);

  // If category or id_number changed, sync to flags
  if (existing.resident_id && (updates.category || updates.id_number)) {
    await syncSoloParentVulnerabilityFlag(
      existing.resident_id,
      true,
      updated.id_number,
      updated.category
    );
  }

  return updated;
}

/**
 * Renew Solo Parent ID (extends validity by 1 year from current date or provided date)
 */
export async function renewSoloParent(id: string, renewalDate?: string): Promise<SoloParentRecord> {
  const existing = await getSoloParentById(id);
  if (!existing) {
    throw new Error(`Solo parent record not found: ${id}`);
  }

  const baseDate = renewalDate ? new Date(renewalDate) : new Date();
  const newExpiry = new Date(baseDate);
  newExpiry.setFullYear(newExpiry.getFullYear() + 1);

  const expires_at = newExpiry.toISOString().slice(0, 10);
  const issued_at = baseDate.toISOString().slice(0, 10);

  return await updateSoloParent(id, {
    issued_at,
    expires_at,
    status: 'active',
  });
}

/**
 * Revoke or Terminate Solo Parent status (e.g. Remarried, Reconciled, Dependents aged out, Voluntary)
 * Automatically updates status to 'revoked' and unflags resident from vulnerability flags.
 */
export async function revokeSoloParent(
  id: string,
  reason: string,
  revocationDate?: string
): Promise<SoloParentRecord> {
  const existing = await getSoloParentById(id);
  if (!existing) {
    throw new Error(`Solo parent record not found: ${id}`);
  }

  const today = revocationDate || new Date().toISOString().slice(0, 10);
  const updated = await updateSoloParent(id, {
    status: 'revoked',
    revocation_reason: reason,
    revocation_date: today,
  });

  // Remove the solo_parent flag from active vulnerability pool
  if (existing.resident_id) {
    await syncSoloParentVulnerabilityFlag(existing.resident_id, false);
  }

  return updated;
}

/**
 * Reactivate a previously revoked Solo Parent record
 */
export async function reactivateSoloParent(id: string): Promise<SoloParentRecord> {
  const existing = await getSoloParentById(id);
  if (!existing) {
    throw new Error(`Solo parent record not found: ${id}`);
  }

  const updated = await updateSoloParent(id, {
    status: 'active',
    revocation_reason: undefined,
    revocation_date: undefined,
  });

  if (existing.resident_id) {
    await syncSoloParentVulnerabilityFlag(
      existing.resident_id,
      true,
      existing.id_number,
      existing.category
    );
  }

  return updated;
}

/**
 * Delete Solo Parent record and unflag in vulnerability flags
 */
export async function deleteSoloParent(id: string): Promise<void> {
  const existing = await getSoloParentById(id);
  if (!existing) return;

  await db.delete(STORE_NAMES.solo_parents, id);

  if (existing.resident_id) {
    await syncSoloParentVulnerabilityFlag(existing.resident_id, false);
  }
}


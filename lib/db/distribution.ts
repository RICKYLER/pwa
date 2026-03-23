import { createAuditLog } from '../auth';
import { db, STORE_NAMES } from './indexeddb';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapAllDataFromSupabase } from '@/lib/supabase/bootstrap';
import { getHouseholds } from './households';
import { getInventoryItem } from './inventory';
import { getResidents } from './residents';
import { getCurrentVulnerabilityFlagsMapForResidents } from './vulnerability';
import type {
  DistributedItem,
  DistributionEvent,
  DistributionRecord,
  DistributionTargetGroup,
  DistributionTargetScope,
  Household,
  Resident,
  VulnerabilityFlags,
} from './schema';

function generateId(prefix = 'dist'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function inferTargetConfig(eventName: string): {
  target_scope: DistributionTargetScope;
  target_group: DistributionTargetGroup;
} {
  const value = eventName.toLowerCase();

  if (value.includes('senior')) return { target_scope: 'resident', target_group: 'senior' };
  if (value.includes('pwd')) return { target_scope: 'resident', target_group: 'pwd' };
  if (value.includes('maternal') || value.includes('pregnan')) {
    return { target_scope: 'resident', target_group: 'pregnant' };
  }
  if (value.includes('child') || value.includes('minor')) {
    return { target_scope: 'resident', target_group: 'minor' };
  }
  if (value.includes('low income')) {
    return { target_scope: 'household', target_group: 'low_income' };
  }

  return { target_scope: 'household', target_group: 'all' };
}

function normalizeDistributedItems(items: DistributedItem[] | undefined): DistributedItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      item_id: item.item_id,
      quantity: Number.isFinite(item.quantity) ? item.quantity : Number(item.quantity) || 0,
      item_name: item.item_name?.trim() || undefined,
      unit: item.unit,
    }))
    .filter((item) => item.item_id && item.quantity > 0);
}

function normalizeDistributionEvent(event: DistributionEvent): DistributionEvent {
  const inferred = inferTargetConfig(event.event_name);

  return {
    ...event,
    target_scope: event.target_scope ?? inferred.target_scope,
    target_group: event.target_group ?? inferred.target_group,
    package_items: normalizeDistributedItems(event.package_items),
  };
}

function normalizeDistributionRecord(record: DistributionRecord): DistributionRecord {
  return {
    ...record,
    items_distributed: normalizeDistributedItems(record.items_distributed),
    timestamp: record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp),
  };
}

function matchesTargetGroup(
  resident: Resident,
  flags: VulnerabilityFlags | undefined,
  targetGroup: DistributionTargetGroup,
): boolean {
  switch (targetGroup) {
    case 'all':
      return true;
    case 'senior':
      return Boolean(flags?.is_senior);
    case 'pwd':
      return Boolean(flags?.is_pwd);
    case 'pregnant':
      return Boolean(flags?.is_pregnant);
    case 'minor':
      return Boolean(flags?.is_child);
    case 'low_income':
      return Boolean(flags?.is_low_income || resident.income_level === 'low');
    default:
      return true;
  }
}

function countDistributedUnits(items: DistributedItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Get all distribution events
 */
export async function getDistributionEvents(filters?: {
  status?: 'planned' | 'ongoing' | 'completed';
}): Promise<DistributionEvent[]> {
  try {
    const all = (await db.getAll<DistributionEvent>(STORE_NAMES.distribution_events)).map(normalizeDistributionEvent);

    let filtered = all;

    if (filters?.status) {
      filtered = filtered.filter((event) => event.status === filters.status);
    }

    return filtered.sort(
      (a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime(),
    );
  } catch (error) {
    console.error('Error fetching distribution events:', error);
    throw error;
  }
}

/**
 * Get distribution event by ID
 */
export async function getDistributionEvent(id: string): Promise<DistributionEvent | undefined> {
  try {
    const event = await db.get<DistributionEvent>(STORE_NAMES.distribution_events, id);
    return event ? normalizeDistributionEvent(event) : undefined;
  } catch (error) {
    console.error('Error fetching distribution event:', error);
    throw error;
  }
}

/**
 * Create distribution event
 */
export async function createDistributionEvent(
  data: Omit<DistributionEvent, 'id' | 'syncStatus'>,
  userId: string,
): Promise<DistributionEvent> {
  try {
    const event = normalizeDistributionEvent({
      ...data,
      id: generateId(),
      created_by: userId,
      syncStatus: 'pending',
    });

    await db.add(STORE_NAMES.distribution_events, event);

    await createAuditLog('CREATE', 'distribution', event.id, {
      event_name: data.event_name,
      type: data.type,
      location: data.location,
      target_scope: event.target_scope,
      target_group: event.target_group,
      package_items: event.package_items.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
        item_name: item.item_name,
      })),
    });

    return event;
  } catch (error) {
    console.error('Error creating distribution event:', error);
    throw error;
  }
}

/**
 * Update distribution event
 */
export async function updateDistributionEvent(
  id: string,
  updates: Partial<DistributionEvent>,
): Promise<DistributionEvent> {
  try {
    const existing = await getDistributionEvent(id);
    if (!existing) {
      throw new Error(`Distribution event ${id} not found`);
    }

    const updated = normalizeDistributionEvent({
      ...existing,
      ...updates,
      id,
      syncStatus: 'pending',
    });

    await db.put(STORE_NAMES.distribution_events, updated);

    await createAuditLog('UPDATE', 'distribution', id, { changes: updates });

    return updated;
  } catch (error) {
    console.error('Error updating distribution event:', error);
    throw error;
  }
}

/**
 * Backwards-compatible helper for older code paths.
 */
export async function getEligibleBeneficiaries(eventType: string): Promise<Resident[]> {
  const inferred = inferTargetConfig(eventType);
  return getEligibleResidentsForEvent({
    target_group: inferred.target_group,
  });
}

export async function getEligibleResidentsForEvent(config: {
  target_group: DistributionTargetGroup;
}): Promise<Resident[]> {
  try {
    const residents = await getResidents({ status: 'active' });
    const households = await getHouseholds({ status: 'active', registration_status: 'approved' });
    const flagsMap = await getCurrentVulnerabilityFlagsMapForResidents(residents, households);

    return residents.filter((resident) =>
      matchesTargetGroup(resident, flagsMap.get(resident.id), config.target_group),
    );
  } catch (error) {
    console.error('Error getting eligible residents:', error);
    throw error;
  }
}

export async function getEligibleHouseholdsForEvent(config: {
  target_group: DistributionTargetGroup;
}): Promise<Household[]> {
  try {
    const [households, residents] = await Promise.all([
      getHouseholds({ status: 'active', registration_status: 'approved' }),
      getResidents({ status: 'active' }),
    ]);
    const flagsMap = await getCurrentVulnerabilityFlagsMapForResidents(residents, households);

    if (config.target_group === 'all') {
      return households;
    }

    const householdResidentMap = new Map<string, Resident[]>();
    residents.forEach((resident) => {
      const entry = householdResidentMap.get(resident.household_id) ?? [];
      entry.push(resident);
      householdResidentMap.set(resident.household_id, entry);
    });

    return households.filter((household) => {
      const members = householdResidentMap.get(household.id) ?? [];
      return members.some((resident) =>
        matchesTargetGroup(resident, flagsMap.get(resident.id), config.target_group),
      );
    });
  } catch (error) {
    console.error('Error getting eligible households:', error);
    throw error;
  }
}

/**
 * Record distribution to a beneficiary
 */
export async function recordDistribution(
  data: Omit<DistributionRecord, 'id' | 'timestamp' | 'syncStatus'>,
): Promise<DistributionRecord> {
  try {
    const event = await getDistributionEvent(data.event_id);
    if (!event) {
      throw new Error('Distribution event not found');
    }

    if (event.target_scope === 'household' && !data.household_id) {
      throw new Error('A household is required for this distribution event');
    }

    if (event.target_scope === 'resident' && !data.resident_id) {
      throw new Error('A resident is required for this distribution event');
    }

    const existing = await getDistributionRecords(data.event_id);
    const isDuplicate =
      event.target_scope === 'household'
        ? existing.some((record) => record.household_id === data.household_id)
        : existing.some((record) => record.resident_id === data.resident_id);

    if (isDuplicate) {
      throw new Error(
        event.target_scope === 'household'
          ? 'This household already received from this distribution event'
          : 'This resident already received from this distribution event',
      );
    }

    const record = normalizeDistributionRecord({
      ...data,
      id: generateId(),
      timestamp: new Date(),
      syncStatus: 'pending',
    });

    await db.add(STORE_NAMES.distribution_records, record);

    await createAuditLog('CREATE', 'distribution', record.id, {
      event_id: data.event_id,
      household_id: data.household_id,
      resident_id: data.resident_id,
      beneficiary_name: data.beneficiary_name,
      items_count: data.items_distributed.length,
      units_count: countDistributedUnits(data.items_distributed),
    });

    return record;
  } catch (error) {
    console.error('Error recording distribution:', error);
    throw error;
  }
}

export async function releaseDistributionPackage(params: {
  event_id: string;
  distributor_id: string;
  household_id?: string;
  resident_id?: string;
  received_by_name?: string;
  notes?: string;
}): Promise<DistributionRecord> {
  const event = await getDistributionEvent(params.event_id);
  if (!event) {
    throw new Error('Distribution event not found');
  }

  if (event.package_items.length === 0) {
    throw new Error('This event has no package items configured yet');
  }

  await runServerMutation({
    action: 'release_distribution_package',
    params: {
      event_id: event.id,
      household_id: params.household_id,
      resident_id: params.resident_id,
      received_by_name: params.received_by_name?.trim() || undefined,
      notes: params.notes?.trim() || undefined,
    },
  });

  await bootstrapAllDataFromSupabase(true);

  const records = await getDistributionRecords(event.id);
  const latestRecord = records.find((record) =>
    event.target_scope === 'household'
      ? record.household_id === params.household_id
      : record.resident_id === params.resident_id,
  );

  if (!latestRecord) {
    throw new Error('Distribution was saved in Supabase, but it did not rehydrate locally.');
  }

  return latestRecord;
}

/**
 * Get distribution records for an event
 */
export async function getDistributionRecords(eventId: string): Promise<DistributionRecord[]> {
  try {
    const all = await db.getAll<DistributionRecord>(STORE_NAMES.distribution_records);
    return all
      .map(normalizeDistributionRecord)
      .filter((record) => record.event_id === eventId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    console.error('Error fetching distribution records:', error);
    throw error;
  }
}

/**
 * Get total distributed count for resident in event
 */
export async function getDistributionCount(eventId: string, residentId: string): Promise<number> {
  try {
    const records = await getDistributionRecords(eventId);
    return records.filter((record) => record.resident_id === residentId).length;
  } catch (error) {
    console.error('Error counting distributions:', error);
    throw error;
  }
}

/**
 * Generate distribution report for event
 */
export async function getDistributionReport(eventId: string) {
  try {
    const event = await getDistributionEvent(eventId);
    if (!event) throw new Error('Event not found');

    const records = await getDistributionRecords(eventId);
    const uniqueHouseholds = new Set(records.map((record) => record.household_id).filter(Boolean));
    const uniqueResidents = new Set(records.map((record) => record.resident_id).filter(Boolean));
    const remainingStock = await Promise.all(
      event.package_items.map(async (item) => {
        const inventoryItem = await getInventoryItem(item.item_id);
        return {
          ...item,
          quantity_available: inventoryItem?.quantity_available ?? 0,
        };
      }),
    );

    return {
      event,
      total_beneficiaries: records.length,
      total_households_served: uniqueHouseholds.size,
      total_residents_served: uniqueResidents.size,
      total_items_distributed: records.reduce(
        (sum, record) => sum + countDistributedUnits(record.items_distributed),
        0,
      ),
      total_packages_released: records.length,
      remaining_stock: remainingStock,
      records,
    };
  } catch (error) {
    console.error('Error generating distribution report:', error);
    throw error;
  }
}

/**
 * Delete distribution event and all associated records
 */
export async function deleteDistributionEvent(id: string): Promise<void> {
  try {
    const event = await getDistributionEvent(id);
    if (!event) throw new Error(`Distribution event ${id} not found`);

    await runServerMutation({
      action: 'delete_distribution_event',
      eventId: id,
    });

    await bootstrapAllDataFromSupabase(true);
  } catch (error) {
    console.error('Error deleting distribution event:', error);
    throw error;
  }
}

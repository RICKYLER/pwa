import { db, STORE_NAMES } from './indexeddb';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';
import {
  coerceDistributionTargetScope,
  resolveDistributionAudienceMatches,
} from '@/lib/distribution-audience';
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
    barangay_id: typeof event.barangay_id === 'string' ? event.barangay_id.trim() : '',
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

function countDistributedUnits(items: DistributedItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

async function getScopedHouseholdsAndResidents(barangayId?: string | null) {
  const households = await getHouseholds({
    ...(barangayId ? { barangay_id: barangayId } : {}),
    status: 'active',
    registration_status: 'approved',
  });
  const householdIds = new Set(households.map((household) => household.id));
  const residents = (await getResidents({ status: 'active' }))
    .filter((resident) => householdIds.has(resident.household_id));

  return {
    households,
    residents,
  };
}

export async function getDistributionAudienceStats(config: {
  barangay_id?: string | null;
  target_group: DistributionTargetGroup;
}): Promise<{
  totalHouseholds: number;
  totalResidents: number;
  eligibleHouseholds: number;
  eligibleResidents: number;
}> {
  const { households, residents } = await getScopedHouseholdsAndResidents(config.barangay_id);
  const flagsMap = await getCurrentVulnerabilityFlagsMapForResidents(residents, households);
  const matches = resolveDistributionAudienceMatches({
    households,
    residents,
    flagsByResidentId: flagsMap,
    targetGroup: config.target_group,
  });

  return {
    totalHouseholds: households.length,
    totalResidents: residents.length,
    eligibleHouseholds: matches.eligibleHouseholds.length,
    eligibleResidents: matches.eligibleResidents.length,
  };
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
  data: Omit<DistributionEvent, 'id' | 'syncStatus' | 'created_by' | 'barangay_id'>,
  userId: string,
): Promise<DistributionEvent> {
  try {
    const event = normalizeDistributionEvent({
      ...data,
      id: generateId(),
      barangay_id: '',
      created_by: userId,
      syncStatus: 'synced',
    });
    const normalizedTargetScope = coerceDistributionTargetScope(event.target_scope, event.target_group);

    await runServerMutation({
      action: 'create_distribution_event',
      event: {
        ...event,
        target_scope: normalizedTargetScope,
        event_name: event.event_name.trim(),
        location: event.location.trim(),
        notes: event.notes?.trim() || undefined,
      },
    });

    await bootstrapCurrentPathData(true);

    const createdEvent = await getDistributionEvent(event.id);
    if (!createdEvent) {
      throw new Error('Distribution event was created in Supabase, but it did not rehydrate locally.');
    }

    return createdEvent;
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
    const currentEvent = await getDistributionEvent(id);
    if (!currentEvent) {
      throw new Error('Distribution event not found.');
    }

    const nextTargetGroup = updates.target_group ?? currentEvent.target_group;
    const nextTargetScope = coerceDistributionTargetScope(
      updates.target_scope ?? currentEvent.target_scope,
      nextTargetGroup,
    );
    const shouldPersistTargetConfig = updates.target_group !== undefined
      || updates.target_scope !== undefined
      || nextTargetScope !== currentEvent.target_scope;

    await runServerMutation({
      action: 'update_distribution_event',
      eventId: id,
      updates: {
        ...updates,
        ...(shouldPersistTargetConfig
          ? {
              target_group: nextTargetGroup,
              target_scope: nextTargetScope,
            }
          : {}),
        event_name: typeof updates.event_name === 'string' ? updates.event_name.trim() : updates.event_name,
        location: typeof updates.location === 'string' ? updates.location.trim() : updates.location,
        notes: typeof updates.notes === 'string' ? (updates.notes.trim() || null) : updates.notes,
      },
    });

    await bootstrapCurrentPathData(true);

    const updatedEvent = await getDistributionEvent(id);
    if (!updatedEvent) {
      throw new Error('Distribution event was updated in Supabase, but it did not rehydrate locally.');
    }

    return updatedEvent;
  } catch (error) {
    console.error('Error updating distribution event:', error);
    throw error;
  }
}

/**
 * Backwards-compatible helper for older code paths.
 */
export async function getEligibleBeneficiaries(
  eventType: string,
  barangayId?: string | null,
): Promise<Resident[]> {
  const inferred = inferTargetConfig(eventType);
  return getEligibleResidentsForEvent({
    barangay_id: barangayId,
    target_group: inferred.target_group,
  });
}

export async function getEligibleResidentsForEvent(config: {
  barangay_id?: string | null;
  target_group: DistributionTargetGroup;
}): Promise<Resident[]> {
  try {
    const { households, residents } = await getScopedHouseholdsAndResidents(config.barangay_id);
    const flagsMap = await getCurrentVulnerabilityFlagsMapForResidents(residents, households);
    return resolveDistributionAudienceMatches({
      households,
      residents,
      flagsByResidentId: flagsMap,
      targetGroup: config.target_group,
    }).eligibleResidents;
  } catch (error) {
    console.error('Error getting eligible residents:', error);
    throw error;
  }
}

export async function getEligibleHouseholdsForEvent(config: {
  barangay_id?: string | null;
  target_group: DistributionTargetGroup;
}): Promise<Household[]> {
  try {
    const { households, residents } = await getScopedHouseholdsAndResidents(config.barangay_id);
    const flagsMap = await getCurrentVulnerabilityFlagsMapForResidents(residents, households);
    return resolveDistributionAudienceMatches({
      households,
      residents,
      flagsByResidentId: flagsMap,
      targetGroup: config.target_group,
    }).eligibleHouseholds;
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
    let event = await getDistributionEvent(data.event_id);
    if (!event) {
      throw new Error('Distribution event not found');
    }

    const normalizedTargetScope = coerceDistributionTargetScope(event.target_scope, event.target_group);
    if (normalizedTargetScope !== event.target_scope) {
      event = await updateDistributionEvent(event.id, { target_scope: normalizedTargetScope });
    }

    if (event.target_scope === 'household' && !data.household_id) {
      throw new Error('A household is required for this distribution event');
    }

    if (event.target_scope === 'resident' && !data.resident_id) {
      throw new Error('A resident is required for this distribution event');
    }

    const normalizedRequestedItems = normalizeDistributedItems(data.items_distributed);
    const normalizedEventItems = normalizeDistributedItems(event.package_items);

    const requestSignature = JSON.stringify(
      normalizedRequestedItems.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
      })),
    );
    const eventSignature = JSON.stringify(
      normalizedEventItems.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
      })),
    );

    if (requestSignature && requestSignature !== eventSignature) {
      throw new Error(
        'This app now records distributions from the event package itself. Update the event package items first, then release the package.',
      );
    }

    return await releaseDistributionPackage({
      event_id: data.event_id,
      household_id: data.household_id,
      resident_id: data.resident_id,
      received_by_name: data.received_by_name || data.beneficiary_name,
      notes: data.notes,
    });
  } catch (error) {
    console.error('Error recording distribution:', error);
    throw error;
  }
}

export async function releaseDistributionPackage(params: {
  event_id: string;
  distributor_id?: string;
  household_id?: string;
  resident_id?: string;
  received_by_name?: string;
  notes?: string;
}): Promise<DistributionRecord> {
  let event = await getDistributionEvent(params.event_id);
  if (!event) {
    throw new Error('Distribution event not found');
  }

  const normalizedTargetScope = coerceDistributionTargetScope(event.target_scope, event.target_group);
  if (normalizedTargetScope !== event.target_scope) {
    event = await updateDistributionEvent(event.id, { target_scope: normalizedTargetScope });
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

  await bootstrapCurrentPathData(true);

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

    await bootstrapCurrentPathData(true);
  } catch (error) {
    console.error('Error deleting distribution event:', error);
    throw error;
  }
}

import { db, STORE_NAMES } from './indexeddb';
import type { DistributionEvent, DistributionRecord, Resident, VulnerabilityFlags } from './schema';
import { getResidents } from './residents';
import { createAuditLog } from '../auth';

function generateId(): string {
  return `dist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all distribution events
 */
export async function getDistributionEvents(filters?: {
  status?: 'planned' | 'ongoing' | 'completed';
}): Promise<DistributionEvent[]> {
  try {
    const all = await db.getAll<DistributionEvent>(STORE_NAMES.distribution_events);

    let filtered = all;

    if (filters?.status) {
      filtered = filtered.filter(e => e.status === filters.status);
    }

    return filtered.sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());
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
    return await db.get<DistributionEvent>(STORE_NAMES.distribution_events, id);
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
  userId: string
): Promise<DistributionEvent> {
  try {
    const event: DistributionEvent = {
      ...data,
      id: generateId(),
      created_by: userId,
      syncStatus: 'pending',
    };

    await db.add(STORE_NAMES.distribution_events, event);

    await createAuditLog(
      'CREATE',
      'distribution',
      event.id,
      { event_name: data.event_name, type: data.type, location: data.location }
    );

    console.log('Distribution event created:', event.id);
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
  updates: Partial<DistributionEvent>
): Promise<DistributionEvent> {
  try {
    const existing = await getDistributionEvent(id);
    if (!existing) {
      throw new Error(`Distribution event ${id} not found`);
    }

    const updated: DistributionEvent = {
      ...existing,
      ...updates,
      id,
      syncStatus: 'pending',
    };

    await db.put(STORE_NAMES.distribution_events, updated);

    await createAuditLog(
      'UPDATE',
      'distribution',
      id,
      { changes: updates }
    );

    console.log('Distribution event updated:', id);
    return updated;
  } catch (error) {
    console.error('Error updating distribution event:', error);
    throw error;
  }
}

/**
 * Auto-select eligible beneficiaries based on event type
 */
export async function getEligibleBeneficiaries(
  eventType: string
): Promise<Resident[]> {
  try {
    const residents = await getResidents({ status: 'active' });
    const allFlags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);

    // Filter residents by event type
    const eligible = residents.filter(resident => {
      const flags = allFlags.find(f => f.resident_id === resident.id);
      if (!flags) return false;

      // Match based on event type
      if (eventType === 'Senior Relief') return flags.is_senior;
      if (eventType === 'PWD Assistance') return flags.is_pwd;
      if (eventType === 'Maternal Health') return flags.is_pregnant;
      if (eventType === 'Child Support') return flags.is_child;
      if (eventType === 'Chronic Illness Support') return flags.has_chronic_illness;
      if (eventType === 'General Relief') return flags.is_low_income;

      // Default: all active residents
      return true;
    });

    console.log(`Found ${eligible.length} eligible beneficiaries for ${eventType}`);
    return eligible;
  } catch (error) {
    console.error('Error getting eligible beneficiaries:', error);
    throw error;
  }
}

/**
 * Record distribution to a beneficiary
 */
export async function recordDistribution(
  data: Omit<DistributionRecord, 'id' | 'timestamp' | 'syncStatus'>
): Promise<DistributionRecord> {
  try {
    const record: DistributionRecord = {
      ...data,
      id: generateId(),
      timestamp: new Date(),
      syncStatus: 'pending',
    };

    // Check for duplicates
    const existing = await db.getAll<DistributionRecord>(STORE_NAMES.distribution_records);
    const isDuplicate = existing.some(
      r => r.event_id === data.event_id && r.resident_id === data.resident_id
    );

    if (isDuplicate) {
      throw new Error('This resident already received from this distribution event');
    }

    await db.add(STORE_NAMES.distribution_records, record);

    await createAuditLog(
      'CREATE',
      'distribution',
      record.id,
      { event_id: data.event_id, resident_id: data.resident_id, items_count: data.items_distributed.length }
    );

    console.log('Distribution record created:', record.id);
    return record;
  } catch (error) {
    console.error('Error recording distribution:', error);
    throw error;
  }
}

/**
 * Get distribution records for an event
 */
export async function getDistributionRecords(eventId: string): Promise<DistributionRecord[]> {
  try {
    const all = await db.getAll<DistributionRecord>(STORE_NAMES.distribution_records);
    return all.filter(r => r.event_id === eventId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
    return records.filter(r => r.resident_id === residentId).length;
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

    return {
      event,
      total_beneficiaries: records.length,
      total_items_distributed: records.reduce((sum, r) => sum + r.items_distributed.length, 0),
      records,
    };
  } catch (error) {
    console.error('Error generating distribution report:', error);
    throw error;
  }
}

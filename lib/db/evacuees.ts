'use client';

import type { EvacueeRecord, EvacueeVulnerabilitySummary } from '@/lib/db/schema';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';

export type { EvacueeRecord, EvacueeVulnerabilitySummary };

const STORAGE_KEY = 'mswdo_evacuee_checkin_records';

const SEED_RECORDS: EvacueeRecord[] = [
  {
    id: 'evac_rec_101',
    household_id: 'hh_cuambog_01',
    head_name: 'Danilo Ramos Valdez',
    evacuation_center_id: 'evac_sr_gym',
    evacuation_center_name: 'San Roque Barangay Gym',
    barangay_id: 'cuambog',
    barangay_name: 'Cuambog',
    purok_sitio: 'Purok Paglaum',
    family_members_count: 5,
    contact_number: '09171234567',
    vulnerabilities: {
      infants: 1,
      children: 2,
      seniors: 1,
      pwds: 0,
      pregnant: 0,
    },
    checked_in_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    checked_in_by: 'MDRRMO Responder Team A',
    status: 'sheltered',
    notes: 'Duol sa suba ang balay. Gikuha sa rescue truck.',
  },
  {
    id: 'evac_rec_102',
    household_id: 'hh_cuambog_02',
    head_name: 'Maria Santos Dela Cruz',
    evacuation_center_id: 'evac_sr_gym',
    evacuation_center_name: 'San Roque Barangay Gym',
    barangay_id: 'cuambog',
    barangay_name: 'Cuambog',
    purok_sitio: 'Purok Riverside',
    family_members_count: 4,
    contact_number: '09289876543',
    vulnerabilities: {
      infants: 0,
      children: 1,
      seniors: 0,
      pwds: 1,
      pregnant: 1,
    },
    checked_in_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    checked_in_by: 'Brgy. Cuambog Health Worker',
    status: 'sheltered',
    notes: 'Mabdos 7 months ug PWD (crutches). Gihatagan og priority bed.',
  },
  {
    id: 'evac_rec_103',
    household_id: 'hh_pob_03',
    head_name: 'Eduardo M. Morales',
    evacuation_center_id: 'evac_mabini_central',
    evacuation_center_name: 'Mabini Central Elementary Gym',
    barangay_id: 'poblacion',
    barangay_name: 'Poblacion',
    purok_sitio: 'Purok Maharlika',
    family_members_count: 3,
    contact_number: '09395551234',
    vulnerabilities: {
      infants: 0,
      children: 0,
      seniors: 2,
      pwds: 0,
      pregnant: 0,
    },
    checked_in_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    checked_in_by: 'Camp Manager',
    status: 'sheltered',
  },
];

function loadFromStorage(): EvacueeRecord[] {
  if (typeof window === 'undefined') return SEED_RECORDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_RECORDS));
      return SEED_RECORDS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_RECORDS;
  } catch (err) {
    console.error('Failed to parse evacuee records from storage:', err);
    return SEED_RECORDS;
  }
}

function saveToStorage(records: EvacueeRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('mswdo-evacuees-changed'));

    // Dual-layer persistence: also mirror directly into IndexedDB store
    db.init().then(async () => {
      for (const rec of records) {
        await db.put(STORE_NAMES.evacuee_records, rec).catch(() => {});
      }
    }).catch(() => {});
  } catch (err) {
    console.error('Failed to save evacuee records to storage:', err);
  }
}

export async function getEvacueeRecords(): Promise<EvacueeRecord[]> {
  const local = loadFromStorage();
  if (local && local.length > 0) return local;

  try {
    const fromIdb = await db.getAll<EvacueeRecord>(STORE_NAMES.evacuee_records);
    if (fromIdb && fromIdb.length > 0) {
      saveToStorage(fromIdb);
      return fromIdb;
    }
  } catch {
    // fallback to local
  }
  return local;
}

export async function checkInHouseholdToEvacuationCenter(input: {
  household_id: string;
  head_name: string;
  evacuation_center_id: string;
  evacuation_center_name: string;
  barangay_id: string;
  barangay_name: string;
  purok_sitio: string;
  family_members_count: number;
  contact_number?: string;
  vulnerabilities?: Partial<EvacueeVulnerabilitySummary>;
  checked_in_by?: string;
  notes?: string;
}): Promise<EvacueeRecord> {
  const current = loadFromStorage();

  // Check if this household is already actively sheltered
  const existingActiveIndex = current.findIndex(
    (r) => r.household_id === input.household_id && r.status === 'sheltered',
  );

  const newRecord: EvacueeRecord = {
    id: `evac_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    household_id: input.household_id,
    head_name: input.head_name,
    evacuation_center_id: input.evacuation_center_id,
    evacuation_center_name: input.evacuation_center_name,
    barangay_id: input.barangay_id,
    barangay_name: input.barangay_name,
    purok_sitio: input.purok_sitio,
    family_members_count: Math.max(1, input.family_members_count),
    contact_number: input.contact_number,
    vulnerabilities: {
      infants: input.vulnerabilities?.infants || 0,
      children: input.vulnerabilities?.children || 0,
      seniors: input.vulnerabilities?.seniors || 0,
      pwds: input.vulnerabilities?.pwds || 0,
      pregnant: input.vulnerabilities?.pregnant || 0,
    },
    checked_in_at: new Date().toISOString(),
    checked_in_by: input.checked_in_by || 'MSWDO Desk Officer',
    status: 'sheltered',
    notes: input.notes,
  };

  let updated: EvacueeRecord[];
  if (existingActiveIndex >= 0) {
    // Update center if moved
    updated = [...current];
    updated[existingActiveIndex] = newRecord;
  } else {
    updated = [newRecord, ...current];
  }

  saveToStorage(updated);
  return newRecord;
}

export async function checkOutEvacueeRecord(recordId: string): Promise<void> {
  const current = loadFromStorage();
  const updated = current.map((rec) => {
    if (rec.id === recordId) {
      return {
        ...rec,
        status: 'checked_out' as const,
        checked_out_at: new Date().toISOString(),
      };
    }
    return rec;
  });
  saveToStorage(updated);
}

export async function deleteEvacueeRecord(recordId: string): Promise<void> {
  const current = loadFromStorage();
  const updated = current.filter((rec) => rec.id !== recordId);
  saveToStorage(updated);
  db.deleteSilently(STORE_NAMES.evacuee_records, recordId).catch(() => {});
}

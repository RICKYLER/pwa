import { getCases, addCaseNote, getCaseNotes } from '@/lib/db/cases';
import type { CaseRecord } from '@/lib/db/schema';

export interface CaseScheduleItem {
  id: string;
  case_id: string;
  case_number: string;
  client_name: string;
  event_type: 'conciliation' | 'settlement' | 'home_visit' | 'follow_up' | 'court_hearing';
  title: string;
  date: string; // YYYY-MM-DD
  time_start: string; // e.g. "09:30 AM"
  time_end: string; // e.g. "10:30 AM"
  venue: string; // e.g. "MSWDO Mediation Room (2nd Flr, Municipal Hall)"
  assigned_worker: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  created_at: string;
}

const LOCAL_STORAGE_KEY = 'mswdo_case_schedules_v1';

export const VENUE_OPTIONS = [
  'MSWDO Mediation Room (2nd Flr, Municipal Hall)',
  'Barangay VAWC Desk (Barangay Hall)',
  'Mayor\'s Office Legal Extension Desk',
  'PNP-WCPD Station Conference Room',
  'Municipal Trial Court (MTC Mabini)',
  'Client Residence (Home Visit & Safety Inspection)',
];

export const EVENT_TYPES = [
  { id: 'conciliation', label: 'Conciliation Hearing', color: 'emerald' },
  { id: 'settlement', label: 'Settlement Agreement Signing', color: 'amber' },
  { id: 'home_visit', label: 'Home Visit & Family Inspection', color: 'blue' },
  { id: 'follow_up', label: 'Post-BPO Safety Follow-up', color: 'indigo' },
  { id: 'court_hearing', label: 'Court Appearance & Pre-trial', color: 'purple' },
] as const;

/**
 * Load all schedules from local storage and case notes
 */
export function getStoredSchedules(): CaseScheduleItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse case schedules from localStorage:', err);
    return [];
  }
}

/**
 * Save schedule items to local storage and broadcast
 */
export function saveStoredSchedules(items: CaseScheduleItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('mswdo-case-schedules-changed', { detail: { items } }));
  } catch (err) {
    console.error('Failed to save case schedules:', err);
  }
}

/**
 * Seed initial realistic schedules if none exist, based on active cases
 */
export function seedDefaultSchedulesIfEmpty(cases: CaseRecord[]): CaseScheduleItem[] {
  const existing = getStoredSchedules();
  if (existing.length > 0) return existing;

  if (cases.length === 0) return [];

  const today = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const day0 = formatYMD(today);
  const day1 = formatYMD(new Date(today.getTime() + 1 * 86400000));
  const day2 = formatYMD(new Date(today.getTime() + 2 * 86400000));
  const day4 = formatYMD(new Date(today.getTime() + 4 * 86400000));

  const defaults: CaseScheduleItem[] = [];

  const primaryCase = cases[0];
  if (primaryCase) {
    defaults.push({
      id: `sched_${Date.now()}_1`,
      case_id: primaryCase.id,
      case_number: primaryCase.case_number,
      client_name: primaryCase.victim_name,
      event_type: 'conciliation',
      title: 'Conciliation & Amicable Settlement Session',
      date: day0,
      time_start: '09:30 AM',
      time_end: '10:30 AM',
      venue: 'MSWDO Mediation Room (2nd Flr, Municipal Hall)',
      assigned_worker: primaryCase.assigned_worker_name || 'MSWDO Social Worker',
      status: 'scheduled',
      notes: 'Initial formal mediation session between parties under RA 9262.',
      created_at: new Date().toISOString(),
    });

    defaults.push({
      id: `sched_${Date.now()}_2`,
      case_id: primaryCase.id,
      case_number: primaryCase.case_number,
      client_name: primaryCase.victim_name,
      event_type: 'follow_up',
      title: 'Post-BPO Safety Verification & Return Check-in',
      date: day1,
      time_start: '01:30 PM',
      time_end: '02:30 PM',
      venue: `Barangay ${primaryCase.barangay_id} VAWC Desk`,
      assigned_worker: primaryCase.assigned_worker_name || 'Barangay VAWC Officer',
      status: 'scheduled',
      notes: 'Check compliance with protection order and welfare of minor dependents.',
      created_at: new Date().toISOString(),
    });
  }

  const secondCase = cases[1] || primaryCase;
  if (secondCase) {
    defaults.push({
      id: `sched_${Date.now()}_3`,
      case_id: secondCase.id,
      case_number: secondCase.case_number,
      client_name: secondCase.victim_name,
      event_type: 'settlement',
      title: 'Custody & Child Support Agreement Signing',
      date: day2,
      time_start: '10:00 AM',
      time_end: '11:30 AM',
      venue: 'MSWDO Mediation Room (2nd Flr, Municipal Hall)',
      assigned_worker: secondCase.assigned_worker_name || 'MSWDO Case Manager',
      status: 'scheduled',
      notes: 'Final review and notarization of voluntary monthly child financial support.',
      created_at: new Date().toISOString(),
    });

    defaults.push({
      id: `sched_${Date.now()}_4`,
      case_id: secondCase.id,
      case_number: secondCase.case_number,
      client_name: secondCase.victim_name,
      event_type: 'home_visit',
      title: 'Home Assessment & Living Condition Inspection',
      date: day4,
      time_start: '02:00 PM',
      time_end: '03:30 PM',
      venue: 'Client Residence (Home Visit & Safety Inspection)',
      assigned_worker: secondCase.assigned_worker_name || 'Social Worker II',
      status: 'scheduled',
      notes: 'Inspection for child welfare assessment report.',
      created_at: new Date().toISOString(),
    });
  }

  saveStoredSchedules(defaults);
  return defaults;
}

/**
 * Add a new schedule item and log to case notes
 */
export async function addCaseSchedule(item: Omit<CaseScheduleItem, 'id' | 'created_at'>): Promise<CaseScheduleItem> {
  const newItem: CaseScheduleItem = {
    ...item,
    id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  const current = getStoredSchedules();
  current.push(newItem);
  saveStoredSchedules(current);

  // Also log to case note so it is recorded in the case dossier
  try {
    await addCaseNote(item.case_id, {
      worker_name: item.assigned_worker || 'MSWDO Social Worker',
      date: item.date,
      note: `[SCHEDULED RETURN]: ${item.title} on ${item.date} (${item.time_start} - ${item.time_end}) at ${item.venue}. Notes: ${item.notes || 'None'}`,
      action_taken: `Scheduled ${item.title}`,
      next_follow_up: item.date,
    });
  } catch (err) {
    console.warn('Could not mirror schedule to case notes:', err);
  }

  return newItem;
}

/**
 * Update schedule status
 */
export function updateScheduleStatus(scheduleId: string, status: CaseScheduleItem['status']): void {
  const current = getStoredSchedules();
  const updated = current.map((s) => (s.id === scheduleId ? { ...s, status } : s));
  saveStoredSchedules(updated);
}

/**
 * Delete schedule item
 */
export function deleteCaseSchedule(scheduleId: string): void {
  const current = getStoredSchedules();
  const filtered = current.filter((s) => s.id !== scheduleId);
  saveStoredSchedules(filtered);
}

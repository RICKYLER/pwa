/**
 * AICS Daily Assistance Fund & Budget Tracker
 * Provides real-time daily budget allocation, replenishment/top-ups,
 * automatic deduction as beneficiaries are approved, and hotline caller status.
 */

import { db, STORE_NAMES } from './indexeddb';
import type { AicsRecord } from './schema';

export interface AicsBudgetTopUp {
  id: string;
  amount: number;
  timestamp: string;
  note?: string;
  added_by?: string;
}

export interface AicsFundEntry {
  id: string;
  type: 'initial_allocation' | 'top_up' | 'adjustment';
  amount: number;
  running_total: number;
  timestamp: string;
  date: string;
  notes?: string;
  encoded_by?: string;
}

export interface AicsDailyBudget {
  id: string; // 'aics_budget_YYYY-MM-DD'
  date: string; // 'YYYY-MM-DD'
  allocated_amount: number;
  initial_amount: number;
  top_ups: AicsBudgetTopUp[];
  history?: AicsFundEntry[];
  notes?: string;
  created_by?: string;
  createdAt: string;
  updatedAt: string;
}

export type AicsBudgetHealthStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'depleted'
  | 'not_set';

export interface AicsDailyBudgetSummary {
  date: string;
  hasBudgetSet: boolean;
  allocatedAmount: number;
  disbursedToday: number;
  remainingAmount: number;
  todayBeneficiaryCount: number;
  percentageUsed: number;
  status: AicsBudgetHealthStatus;
  hotlineStatusText: string;
  averageGrantEstimate: number;
  estimatedClientsLeft: number;
}

const LOCAL_STORAGE_PREFIX = 'mswdo_aics_daily_budget_';

/**
 * Returns local YYYY-MM-DD string according to the user's active timezone.
 */
export function getLocalTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatAicsCurrency(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`;
}

function notifyBudgetChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mswdo:aics-budget-changed'));
  }
}

/**
 * Normalizes and extracts complete chronological fund input history.
 * If history array is empty but initial_amount / top_ups exist, automatically backfills.
 */
export function getAicsBudgetFundEntries(budget: AicsDailyBudget | null): AicsFundEntry[] {
  if (!budget) return [];

  if (Array.isArray(budget.history) && budget.history.length > 0) {
    return [...budget.history].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Synthesize history from initial_amount and top_ups for backwards compatibility
  const synthetic: AicsFundEntry[] = [];
  let running = budget.initial_amount || 0;

  if (budget.initial_amount > 0) {
    synthetic.push({
      id: `initial_${budget.date}`,
      type: 'initial_allocation',
      amount: budget.initial_amount,
      running_total: budget.initial_amount,
      timestamp: budget.createdAt || `${budget.date}T08:00:00.000Z`,
      date: budget.date,
      notes: budget.notes || 'Initial Municipal Daily Allocation',
      encoded_by: budget.created_by || 'MSWDO Admin',
    });
  }

  if (Array.isArray(budget.top_ups)) {
    for (const t of budget.top_ups) {
      running += t.amount;
      synthetic.push({
        id: t.id,
        type: 'top_up',
        amount: t.amount,
        running_total: running,
        timestamp: t.timestamp,
        date: budget.date,
        notes: t.note || 'Mid-day Fund Replenishment',
        encoded_by: t.added_by || 'MSWDO Officer',
      });
    }
  }

  return synthetic.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Fetch the AICS budget for a specific date (defaults to today)
 */
export async function getAicsDailyBudget(
  date: string = getLocalTodayDateString()
): Promise<AicsDailyBudget | null> {
  const budgetId = `aics_budget_${date}`;

  // 1. Try IndexedDB
  try {
    const fromDb = await db.get<AicsDailyBudget>(STORE_NAMES.aics_daily_budgets, budgetId);
    if (fromDb) return fromDb;
  } catch (err) {
    // Fall back to localStorage gracefully
  }

  // 2. Try Supabase bootstrap if not yet in local db
  if (typeof window !== 'undefined') {
    try {
      const { bootstrapSupabaseTables } = await import('@/lib/supabase/bootstrap');
      await bootstrapSupabaseTables(['aics_daily_budgets'], { force: true });
      const fromDbAfter = await db.get<AicsDailyBudget>(STORE_NAMES.aics_daily_budgets, budgetId);
      if (fromDbAfter) return fromDbAfter;
    } catch {
      // Fall back
    }
  }

  // 3. Try localStorage fallback
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${date}`);
      if (stored) {
        return JSON.parse(stored) as AicsDailyBudget;
      }
    } catch {
      // Ignore JSON error
    }
  }

  return null;
}

/**
 * Retrieve all recorded daily budgets across history
 */
export async function getAllAicsDailyBudgets(): Promise<AicsDailyBudget[]> {
  const map = new Map<string, AicsDailyBudget>();

  // 1. From IndexedDB
  try {
    const all = await db.getAll<AicsDailyBudget>(STORE_NAMES.aics_daily_budgets);
    for (const b of all) {
      if (b && b.date) {
        map.set(b.date, b);
      }
    }
  } catch {
    // Fall back to localStorage
  }

  // 2. From localStorage
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) {
          const date = key.replace(LOCAL_STORAGE_PREFIX, '');
          if (!map.has(date)) {
            const raw = localStorage.getItem(key);
            if (raw) {
              map.set(date, JSON.parse(raw) as AicsDailyBudget);
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Set or replace the base budget for a specific date.
 */
export async function setAicsDailyBudget(params: {
  amount: number;
  date?: string;
  notes?: string;
  createdBy?: string;
}): Promise<AicsDailyBudget> {
  const date = params.date || getLocalTodayDateString();
  const budgetId = `aics_budget_${date}`;
  const now = new Date().toISOString();

  const existing = await getAicsDailyBudget(date);
  const existingHistory = existing ? getAicsBudgetFundEntries(existing) : [];

  const totalTopUps = existing ? existing.top_ups.reduce((sum, t) => sum + t.amount, 0) : 0;
  const newTotalAllocated = params.amount + totalTopUps;

  const newEntry: AicsFundEntry = {
    id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: existing ? 'adjustment' : 'initial_allocation',
    amount: params.amount,
    running_total: newTotalAllocated,
    timestamp: now,
    date,
    notes: params.notes || (existing ? 'Adjusted Base Daily Allocation' : 'Initial Municipal Daily Allocation'),
    encoded_by: params.createdBy || 'MSWDO Admin',
  };

  const budgetRecord: AicsDailyBudget = {
    id: budgetId,
    date,
    initial_amount: params.amount,
    allocated_amount: newTotalAllocated,
    top_ups: existing ? existing.top_ups : [],
    history: [newEntry, ...existingHistory],
    notes: params.notes || existing?.notes || 'Standard Municipal Daily Allocation',
    created_by: params.createdBy || existing?.created_by || 'MSWDO Admin',
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  // Save to IndexedDB
  try {
    await db.put(STORE_NAMES.aics_daily_budgets, budgetRecord);
  } catch (err) {
    console.warn('Failed to save budget in IndexedDB, using local storage fallback:', err);
  }

  // Always mirror to localStorage for instantaneous offline recall
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${date}`, JSON.stringify(budgetRecord));
    } catch (err) {
      console.warn('Failed to write to localStorage:', err);
    }

    // Direct Realtime Server Mutation to Supabase
    try {
      const { runServerMutation } = await import('@/lib/mutations');
      await runServerMutation({
        action: 'save_aics_daily_budget',
        payload: { budget: budgetRecord },
      });
    } catch (err) {
      console.warn('Failed to sync budget to Supabase immediately (offline-queued):', err);
    }
  }

  notifyBudgetChanged();
  return budgetRecord;
}

/**
 * Top up / replenish funds to today's budget (e.g., +₱20,000 from Treasury)
 */
export async function topUpAicsDailyBudget(params: {
  amount: number;
  date?: string;
  note?: string;
  addedBy?: string;
}): Promise<AicsDailyBudget> {
  const date = params.date || getLocalTodayDateString();
  const now = new Date().toISOString();
  let existing = await getAicsDailyBudget(date);

  if (!existing) {
    return setAicsDailyBudget({
      amount: params.amount,
      date,
      notes: params.note || 'Initial Replenishment',
      createdBy: params.addedBy,
    });
  }

  const existingHistory = getAicsBudgetFundEntries(existing);

  const topUpItem: AicsBudgetTopUp = {
    id: `topup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    amount: params.amount,
    timestamp: now,
    note: params.note || 'Mid-day Fund Replenishment',
    added_by: params.addedBy || 'MSWDO Officer',
  };

  const updatedTopUps = [...existing.top_ups, topUpItem];
  const newAllocated = existing.initial_amount + updatedTopUps.reduce((s, t) => s + t.amount, 0);

  const newEntry: AicsFundEntry = {
    id: topUpItem.id,
    type: 'top_up',
    amount: params.amount,
    running_total: newAllocated,
    timestamp: now,
    date,
    notes: params.note || 'Mid-day Fund Replenishment',
    encoded_by: params.addedBy || 'MSWDO Officer',
  };

  const updatedBudget: AicsDailyBudget = {
    ...existing,
    allocated_amount: newAllocated,
    top_ups: updatedTopUps,
    history: [newEntry, ...existingHistory],
    updatedAt: now,
  };

  try {
    await db.put(STORE_NAMES.aics_daily_budgets, updatedBudget);
  } catch (err) {
    console.warn('Failed to update budget in IndexedDB:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${date}`, JSON.stringify(updatedBudget));
    } catch {
      // Ignore
    }

    // Direct Realtime Server Mutation to Supabase
    try {
      const { runServerMutation } = await import('@/lib/mutations');
      await runServerMutation({
        action: 'save_aics_daily_budget',
        payload: { budget: updatedBudget },
      });
    } catch (err) {
      console.warn('Failed to sync budget top-up to Supabase immediately (offline-queued):', err);
    }
  }

  notifyBudgetChanged();
  return updatedBudget;
}

/**
 * Compute the comprehensive summary for today's budget given the active records.
 */
export function calculateAicsDailyBudgetSummary(
  budget: AicsDailyBudget | null,
  records: AicsRecord[],
  targetDate: string = getLocalTodayDateString()
): AicsDailyBudgetSummary {
  // Filter records processed or logged today
  const todayRecords = records.filter((r) => {
    if (r.is_deleted) return false;
    const intakeDateMatch = r.intake_date && r.intake_date.startsWith(targetDate);
    const createdMatch =
      r.createdAt &&
      typeof r.createdAt === 'string' &&
      r.createdAt.startsWith(targetDate);
    return Boolean(intakeDateMatch || createdMatch);
  });

  const disbursedToday = todayRecords.reduce((sum, r) => sum + (Number(r.amount_approved) || 0), 0);
  const todayBeneficiaryCount = todayRecords.length;

  if (!budget || budget.allocated_amount <= 0) {
    return {
      date: targetDate,
      hasBudgetSet: false,
      allocatedAmount: 0,
      disbursedToday,
      remainingAmount: 0 - disbursedToday,
      todayBeneficiaryCount,
      percentageUsed: 0,
      status: 'not_set',
      hotlineStatusText: `No daily quota set yet. ₱${disbursedToday.toLocaleString()} released across ${todayBeneficiaryCount} client${todayBeneficiaryCount === 1 ? '' : 's'}.`,
      averageGrantEstimate: 3000,
      estimatedClientsLeft: 0,
    };
  }

  const allocated = budget.allocated_amount;
  const remaining = allocated - disbursedToday;
  const percentageUsed = Math.min(100, Math.max(0, Math.round((disbursedToday / allocated) * 100)));

  // Estimate remaining clients can be served based on standard AICS grant (approx ₱3,000)
  const averageGrant = 3000;
  const estimatedClients = Math.max(0, Math.floor(remaining / averageGrant));

  let status: AicsBudgetHealthStatus = 'healthy';
  let hotlineText = '';

  if (remaining <= 0) {
    status = 'depleted';
    hotlineText = `Daily quota reached (${formatAicsCurrency(disbursedToday)} released). Next intake allocation resumes tomorrow.`;
  } else if (remaining < allocated * 0.2) {
    status = 'critical';
    hotlineText = `Funds running critically low (${formatAicsCurrency(remaining)} left). Recommend prioritizing urgent medical or dialysis cases.`;
  } else if (remaining < allocated * 0.4) {
    status = 'warning';
    hotlineText = `Funds running low (${formatAicsCurrency(remaining)} left). Approx ~${estimatedClients} more beneficiaries can be accommodated today.`;
  } else {
    status = 'healthy';
    hotlineText = `Funds available (${formatAicsCurrency(remaining)} remaining). Ready to accommodate approx ~${estimatedClients} walk-in beneficiaries.`;
  }

  return {
    date: targetDate,
    hasBudgetSet: true,
    allocatedAmount: allocated,
    disbursedToday,
    remainingAmount: remaining,
    todayBeneficiaryCount,
    percentageUsed,
    status,
    hotlineStatusText: hotlineText,
    averageGrantEstimate: averageGrant,
    estimatedClientsLeft: estimatedClients,
  };
}

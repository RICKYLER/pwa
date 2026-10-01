'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  PlusCircle,
  Landmark,
  CheckCircle2,
  Clock,
  FileText,
  RotateCcw,
  Sparkles,
  History,
  ShieldCheck,
  User,
  ArrowUpRight,
} from 'lucide-react';
import {
  getAicsDailyBudget,
  setAicsDailyBudget,
  topUpAicsDailyBudget,
  getAllAicsDailyBudgets,
  getAicsBudgetFundEntries,
  getLocalTodayDateString,
  formatAicsCurrency,
  type AicsDailyBudget,
  type AicsDailyBudgetSummary,
  type AicsFundEntry,
} from '@/lib/db/aics-budget';
import { getCurrentUser } from '@/lib/auth';

interface AicsDailyBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: AicsDailyBudgetSummary;
  initialTab?: 'set_base' | 'top_up' | 'history';
  onBudgetUpdated?: () => void;
}

export default function AicsDailyBudgetModal({
  isOpen,
  onClose,
  summary,
  initialTab,
  onBudgetUpdated,
}: AicsDailyBudgetModalProps) {
  const currentUser = getCurrentUser();
  const todayStr = getLocalTodayDateString();

  const [activeTab, setActiveTab] = useState<'set_base' | 'top_up' | 'history'>(
    initialTab || (summary.hasBudgetSet ? 'top_up' : 'set_base')
  );
  const [historyScope, setHistoryScope] = useState<'today' | 'archive'>('today');

  const [baseAmount, setBaseAmount] = useState<string>(
    summary.allocatedAmount > 0 ? String(summary.allocatedAmount) : '50000'
  );
  const [topUpAmount, setTopUpAmount] = useState<string>('15000');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentBudget, setCurrentBudget] = useState<AicsDailyBudget | null>(null);
  const [allBudgets, setAllBudgets] = useState<AicsDailyBudget[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      void Promise.all([
        getAicsDailyBudget(todayStr),
        getAllAicsDailyBudgets(),
      ]).then(([b, all]) => {
        setCurrentBudget(b);
        setAllBudgets(all);
        if (b && b.allocated_amount > 0) {
          setBaseAmount(String(b.initial_amount || b.allocated_amount));
          if (!initialTab) setActiveTab('top_up');
        } else {
          if (!initialTab) setActiveTab('set_base');
          setBaseAmount('50000');
        }
      });
    }
  }, [isOpen, todayStr, summary.allocatedAmount, initialTab]);

  if (!isOpen) return null;

  const parsedBase = Number(baseAmount) || 0;
  const parsedTopUp = Number(topUpAmount) || 0;

  // Projected remaining balance
  const projectedTotal =
    activeTab === 'set_base'
      ? parsedBase + (currentBudget?.top_ups.reduce((s, t) => s + t.amount, 0) || 0)
      : (summary.allocatedAmount || 0) + parsedTopUp;

  const projectedRemaining = projectedTotal - summary.disbursedToday;

  const presetsBase = [20000, 30000, 50000, 75000, 100000];
  const presetsTopUp = [5000, 10000, 15000, 20000, 50000];

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const fundEntries: AicsFundEntry[] = getAicsBudgetFundEntries(currentBudget);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      if (activeTab === 'set_base') {
        if (parsedBase <= 0) {
          alert('Palihug pag-input og balido nga budget amount.');
          setIsSubmitting(false);
          return;
        }
        await setAicsDailyBudget({
          amount: parsedBase,
          date: todayStr,
          notes: note.trim() || 'Daily AICS Assistance Budget Allocation',
          createdBy: currentUser?.name || 'MSWDO Officer',
        });
      } else {
        if (parsedTopUp <= 0) {
          alert('Palihug pag-input og balido nga top-up amount.');
          setIsSubmitting(false);
          return;
        }
        await topUpAicsDailyBudget({
          amount: parsedTopUp,
          date: todayStr,
          note: note.trim() || 'Mid-day Fund Replenishment',
          addedBy: currentUser?.name || 'MSWDO Officer',
        });
      }

      onBudgetUpdated?.();
      onClose();
    } catch (err) {
      console.error('Failed to save budget:', err);
      alert('Naay error pag-save sa budget. Palihug sulayi pag-usab.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header - Government Institutional Style */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center shrink-0">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Municipal Social Welfare & Development
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {formattedDate}
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                AICS Daily Assistance Budget Allocation & Fund History
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Current Status Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Current Fund Balance Today
              </span>
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                  summary.status === 'healthy'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : summary.status === 'warning'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : summary.status === 'critical'
                    ? 'bg-orange-100 text-orange-800 border-orange-200'
                    : summary.status === 'depleted'
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : 'bg-slate-200 text-slate-700 border-slate-300'
                }`}
              >
                {summary.status === 'healthy'
                  ? '● Funds Available'
                  : summary.status === 'warning'
                  ? '⚠ Low Funds'
                  : summary.status === 'critical'
                  ? '🚨 Critically Low'
                  : summary.status === 'depleted'
                  ? '✕ Depleted'
                  : '○ Not Set Yet'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Allocated</span>
                <span className="text-sm font-black text-slate-900 block mt-0.5">
                  {formatAicsCurrency(summary.allocatedAmount)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Disbursed</span>
                <span className="text-sm font-black text-teal-800 block mt-0.5">
                  {formatAicsCurrency(summary.disbursedToday)}
                </span>
                <span className="text-[9px] text-slate-400 block mt-0.5">
                  {summary.todayBeneficiaryCount} client{summary.todayBeneficiaryCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Remaining</span>
                <span
                  className={`text-sm font-black block mt-0.5 ${
                    summary.remainingAmount > 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {formatAicsCurrency(summary.remainingAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex p-1 rounded-2xl bg-slate-100 border border-slate-200 text-xs font-bold gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('set_base')}
              className={`flex-1 py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'set_base'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Set Base Budget</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('top_up')}
              className={`flex-1 py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'top_up'
                  ? 'bg-white text-emerald-800 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
              <span>+ Add Top-Up Funds</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <History className="h-3.5 w-3.5 text-emerald-600" />
              <span>Fund History ({fundEntries.length})</span>
            </button>
          </div>

          {/* =========================================================================
              TAB 1: SET BASE BUDGET
             ========================================================================= */}
          {activeTab === 'set_base' && (
            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-black text-slate-800 uppercase tracking-wide block mb-1">
                  Today's Base Target Allocation (₱)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={baseAmount}
                    onChange={(e) => setBaseAmount(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 font-black text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Quick Select Amount
                </span>
                <div className="flex flex-wrap gap-2">
                  {presetsBase.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBaseAmount(String(val))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        parsedBase === val
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                      }`}
                    >
                      ₱{val.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Source / Official Notes
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Regular Municipal AICS Allocation / General Fund"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Projected Balance */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-emerald-900 tracking-wider block">
                    Projected New Balance Today
                  </span>
                  <span className="text-xs text-slate-600">
                    Total {formatAicsCurrency(projectedTotal)} − Disbursed {formatAicsCurrency(summary.disbursedToday)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-emerald-800 block">
                    {formatAicsCurrency(projectedRemaining)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">Available</span>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 2: ADD TOP-UP FUNDS
             ========================================================================= */}
          {activeTab === 'top_up' && (
            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-black text-slate-800 uppercase tracking-wide block mb-1">
                  Additional Top-Up Amount (₱)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-emerald-600 font-bold text-sm">+₱</span>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-emerald-300 font-black text-lg text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-emerald-50/30"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Nadugangan ang budget karong adlawa (e.g. gikan sa Municipal Treasury o Special Calamity fund).
                </p>
              </div>

              {/* Quick Presets */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Quick Top-Up Presets
                </span>
                <div className="flex flex-wrap gap-2">
                  {presetsTopUp.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTopUpAmount(String(val))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        parsedTopUp === val
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50'
                      }`}
                    >
                      +₱{val.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Source / Official Notes
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Approved General Fund Release / Dialysis Special Quota"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Projected Balance */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-emerald-900 tracking-wider block">
                    Projected New Balance Today
                  </span>
                  <span className="text-xs text-slate-600">
                    Total {formatAicsCurrency(projectedTotal)} − Disbursed {formatAicsCurrency(summary.disbursedToday)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-emerald-800 block">
                    {formatAicsCurrency(projectedRemaining)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">Available</span>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              CHRONOLOGICAL FUND INPUT HISTORY (TODAY'S LEDGER)
              Visible in Tab 1, Tab 2, and as detailed list in Tab 3
             ========================================================================= */}
          {activeTab !== 'history' ? (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-emerald-700" />
                  Recorded Fund Inputs Today ({fundEntries.length})
                </span>
                {fundEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 transition cursor-pointer"
                  >
                    View Full Audit Trail →
                  </button>
                )}
              </div>

              {fundEntries.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 text-slate-500 text-xs text-center border border-dashed border-slate-200">
                  No budget entries recorded yet for today.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {fundEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                            entry.type === 'initial_allocation'
                              ? 'bg-slate-200 text-slate-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {entry.type === 'initial_allocation' ? 'Base Allocation' : 'Top-Up Fund'}
                        </span>

                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-xs">
                              +{formatAicsCurrency(entry.amount)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              (Running total: {formatAicsCurrency(entry.running_total)})
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate" title={entry.notes}>
                            {entry.notes || 'Fund input'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-semibold text-slate-600 block">
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="text-[9px] text-slate-400 block">
                          {entry.encoded_by || 'MSWDO Admin'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* =========================================================================
                TAB 3: FULL FUND AUDIT LEDGER (TODAY & ALL-TIME ARCHIVE)
               ========================================================================= */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    Official Fund Input Ledger & Audit Trail
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Transparent chronological records of all budget allocations, top-ups, and fund releases.
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setHistoryScope('today')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      historyScope === 'today'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Today ({fundEntries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryScope('archive')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      historyScope === 'archive'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Past Days ({allBudgets.length})
                  </button>
                </div>
              </div>

              {historyScope === 'today' ? (
                /* Today's Detailed Table */
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Amount Added</th>
                        <th className="py-2.5 px-3">Running Ceiling</th>
                        <th className="py-2.5 px-3">Source / Notes</th>
                        <th className="py-2.5 px-3">Encoded By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fundEntries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-slate-400">
                            No fund entries recorded yet today.
                          </td>
                        </tr>
                      ) : (
                        fundEntries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                              {new Date(entry.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  entry.type === 'initial_allocation'
                                    ? 'bg-slate-200 text-slate-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {entry.type === 'initial_allocation'
                                  ? 'Base Allocation'
                                  : 'Top-Up Fund'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-black text-emerald-700 whitespace-nowrap">
                              +{formatAicsCurrency(entry.amount)}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                              {formatAicsCurrency(entry.running_total)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate" title={entry.notes}>
                              {entry.notes || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                              {entry.encoded_by || 'MSWDO Officer'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Archive Table for Past Days */
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Initial Base</th>
                        <th className="py-2.5 px-3">Total Top-Ups</th>
                        <th className="py-2.5 px-3">Final Allocation</th>
                        <th className="py-2.5 px-3">Last Updated By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allBudgets.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">
                            No historical budget records found.
                          </td>
                        </tr>
                      ) : (
                        allBudgets.map((b) => {
                          const totalTopUps = b.top_ups?.reduce((s, t) => s + t.amount, 0) || 0;
                          return (
                            <tr key={b.date} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                                {b.date === todayStr ? `${b.date} (Today)` : b.date}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                                {formatAicsCurrency(b.initial_amount || b.allocated_amount)}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-emerald-700 whitespace-nowrap">
                                {totalTopUps > 0 ? `+${formatAicsCurrency(totalTopUps)} (${b.top_ups.length})` : '—'}
                              </td>
                              <td className="py-2.5 px-3 font-black text-slate-900 whitespace-nowrap">
                                {formatAicsCurrency(b.allocated_amount)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                                {b.created_by || 'MSWDO Admin'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition cursor-pointer flex items-center gap-1.5"
          >
            <History className="h-4 w-4" />
            <span>Fund Ledger ({fundEntries.length})</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition cursor-pointer"
            >
              {activeTab === 'history' ? 'Close' : 'Cancel'}
            </button>

            {activeTab !== 'history' && (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? 'Saving...'
                    : activeTab === 'set_base'
                    ? 'Save Daily Budget'
                    : 'Confirm Top-Up'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

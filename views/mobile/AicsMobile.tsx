'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  HeartHandshake,
  Search,
  Plus,
  Printer,
  DollarSign,
  Activity,
  ChevronRight,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { getAicsRecords } from '@/lib/db/aics';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import { getBarangayName } from '@/lib/mabini-barangays';
import { AICS_CLIENT_CATEGORIES } from '@/lib/aics/aics-categories';
import NewAicsIntakeModal from '@/components/aics/NewAicsIntakeModal';
import AicsDetailModal from '@/components/aics/AicsDetailModal';
import {
  getAicsDailyBudget,
  calculateAicsDailyBudgetSummary,
  type AicsDailyBudget,
} from '@/lib/db/aics-budget';
import AicsDailyBudgetHero from '@/components/aics/AicsDailyBudgetHero';
import AicsDailyBudgetModal from '@/components/aics/AicsDailyBudgetModal';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { bootstrapSupabaseTables } from '@/lib/supabase/bootstrap';
import { computeAicsCooldown, type AicsCooldownInfo } from '@/lib/aics/aics-cooldown';
import type { AicsRecord } from '@/lib/db/schema';

export default function AicsMobile() {
  const [records, setRecords] = useState<AicsRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<AicsRecord | null>(null);
  const [dailyBudget, setDailyBudget] = useState<AicsDailyBudget | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetModalTab, setBudgetModalTab] = useState<'set_base' | 'top_up' | 'history'>('top_up');

  async function loadData(forceRefresh = false) {
    if (forceRefresh) {
      setIsLoading(true);
      if (typeof window !== 'undefined') {
        try {
          const { bootstrapPathnameData } = await import('@/lib/supabase/route-bootstrap');
          await bootstrapPathnameData('/aics', true);
        } catch (err) {
          console.warn('Manual AICS mobile refresh bootstrap error:', err);
        }
      }
    }
    try {
      const [data, budget] = await Promise.all([
        getAicsRecords(),
        getAicsDailyBudget(),
      ]);
      setRecords(data);
      setDailyBudget(budget);
    } catch (err) {
      console.error('Failed to load AICS records or budget:', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // 1. Quick initial render from local cache (0ms)
    void loadData();

    // 2. Fresh background bootstrap from Supabase (updates smoothly if new records exist)
    if (typeof window !== 'undefined') {
      void import('@/lib/supabase/route-bootstrap').then(async ({ bootstrapPathnameData }) => {
        try {
          await bootstrapPathnameData('/aics', false);
          await loadData();
        } catch (err) {
          console.warn('Initial AICS mobile background bootstrap failed:', err);
        }
      });
    }

    function handleDataChanged(event: Event) {
      const customEvent = event as CustomEvent<{ table?: string }>;
      if (
        !customEvent.detail?.table ||
        customEvent.detail.table === 'aics_records' ||
        customEvent.detail.table === 'aics_daily_budgets'
      ) {
        void loadData();
      }
    }

    function handleAicsLocalChanged() {
      void loadData();
    }

    function handleBudgetChanged() {
      void getAicsDailyBudget().then(setDailyBudget);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    window.addEventListener('mswdo:aics-records-changed', handleAicsLocalChanged);
    window.addEventListener('mswdo:aics-budget-changed', handleBudgetChanged);

    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
      window.removeEventListener('mswdo:aics-records-changed', handleAicsLocalChanged);
      window.removeEventListener('mswdo:aics-budget-changed', handleBudgetChanged);
    };
  }, []);

  // ── Supabase Realtime: Live multi-device sync for AICS records & daily budgets ──
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('aics-realtime-desk-mobile')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aics_records' },
        async () => {
          try {
            await bootstrapSupabaseTables(['aics_records'], { force: true });
            void loadData(false);
          } catch (err) {
            console.warn('Realtime aics_records refresh failed on mobile:', err);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aics_daily_budgets' },
        async () => {
          try {
            await bootstrapSupabaseTables(['aics_daily_budgets'], { force: true });
            const freshBudget = await getAicsDailyBudget();
            setDailyBudget(freshBudget);
          } catch (err) {
            console.warn('Realtime aics_daily_budgets refresh failed on mobile:', err);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Compute 3-Month Cooldown Map for mobile cards
  const clientCooldownMap = useMemo(() => {
    const map = new Map<string, AicsCooldownInfo>();
    const grouped = new Map<string, AicsRecord[]>();
    for (const r of records) {
      const key = (r.resident_id || r.client_name || '').trim().toLowerCase();
      if (!key) continue;
      const list = grouped.get(key) || [];
      list.push(r);
      grouped.set(key, list);
    }
    for (const [key, list] of grouped.entries()) {
      map.set(key, computeAicsCooldown(list));
    }
    return map;
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedCategoryTab !== 'all' && r.client_category !== selectedCategoryTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = r.client_name.toLowerCase().includes(q);
        const matchesCtrl = r.control_number.toLowerCase().includes(q);
        const matchesVoucher = Boolean(r.voucher_number && r.voucher_number.toLowerCase().includes(q));
        const matchesSub = r.sub_category.toLowerCase().includes(q);
        if (!matchesName && !matchesCtrl && !matchesVoucher && !matchesSub) return false;
      }
      return true;
    });
  }, [records, selectedCategoryTab, searchQuery]);

  const totalDisbursed = useMemo(() => {
    return records.reduce((acc, curr) => acc + (Number(curr.amount_approved) || 0), 0);
  }, [records]);

  const budgetSummary = useMemo(() => {
    return calculateAicsDailyBudgetSummary(dailyBudget, records);
  }, [dailyBudget, records]);

  function handlePrint(record: AicsRecord, e: React.MouseEvent) {
    e.stopPropagation();
    printGeneralIntakeSheet({
      id: record.id,
      case_number: record.control_number,
      case_type: 'other' as any,
      reported_at: record.intake_date,
      victim_name: record.client_name,
      victim_age: record.client_age,
      victim_gender: record.client_gender === 'Male' ? 'M' : 'F',
      victim_contact: record.contact_number,
      barangay_id: record.barangay_id,
      purok_sitio: record.purok_sitio,
      status: 'active' as any,
      case_summary: `${record.specific_assistance} (₱${record.amount_approved.toLocaleString()})`,
      source: 'manual_intake',
      intake_sheet: record.intake_sheet,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-800 rounded-2xl p-4 text-white shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-emerald-300" />
            <h1 className="text-base font-black tracking-tight">AICS Crisis Desk</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition active:scale-95 disabled:opacity-50"
              title="Refresh from Supabase"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-white/20 text-white">
              {records.length} Clients
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/20 text-xs">
          <span className="text-emerald-100">Total Relief Disbursed:</span>
          <span className="text-sm font-black text-white">₱{totalDisbursed.toLocaleString()}</span>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          className="w-full py-2.5 px-3 bg-white text-emerald-900 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
        >
          <Plus className="h-4 w-4 text-emerald-700" />
          New Walk-In Intake
        </button>
      </div>

      {/* Prominent Daily Budget Tracker Hero for Mobile */}
      <AicsDailyBudgetHero
        summary={budgetSummary}
        onOpenBudgetModal={(tab) => {
          if (tab) setBudgetModalTab(tab);
          setIsBudgetModalOpen(true);
        }}
      />

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search client or medical purpose..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white shadow-xs outline-none focus:border-emerald-500"
        />
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs font-bold no-scrollbar">
        {[
          { id: 'all', label: 'All' },
          { id: 'fhona', label: 'FHONA' },
          { id: 'senior_citizen', label: 'Senior' },
          { id: 'pwd', label: 'PWD' },
          { id: 'ynsp', label: 'YNSP' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedCategoryTab(tab.id)}
            className={`py-1.5 px-3 rounded-full whitespace-nowrap transition border ${selectedCategoryTab === tab.id
                ? 'bg-emerald-700 text-white border-emerald-700 font-extrabold shadow-xs'
                : 'bg-white text-slate-600 border-slate-200'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cards List */}
      <div className="space-y-2.5">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading records...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-500">
            No AICS clients found matching filter.
          </div>
        ) : (
          filteredRecords.map((r) => {
            const isDialysisCancer =
              r.sub_category.toLowerCase().includes('dialysis') ||
              r.sub_category.toLowerCase().includes('cancer');

            const clientKey = (r.resident_id || r.client_name || '').trim().toLowerCase();
            const cooldown = clientCooldownMap.get(clientKey);
            const isUnderCooldown = Boolean(cooldown?.isUnderCooldown);

            return (
              <div
                key={r.id}
                onClick={() => setSelectedRecordForDetail(r)}
                className={`p-3.5 bg-white rounded-2xl border shadow-xs space-y-2 active:bg-slate-50 transition cursor-pointer ${
                  isUnderCooldown ? 'border-rose-200/90' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-slate-400">
                        {r.voucher_number || r.control_number} • {r.intake_date}
                      </span>
                      {isUnderCooldown ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                          🔴 {cooldown?.daysRemaining}d Cooldown
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          🟢 Eligible
                        </span>
                      )}
                    </div>
                    <h3
                      className={`text-sm font-black leading-tight mt-0.5 ${
                        isUnderCooldown ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {r.client_name}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {r.client_age} yrs • {getBarangayName(r.barangay_id)}
                    </p>
                  </div>

                  <span className="text-sm font-black text-emerald-800 shrink-0">
                    ₱{r.amount_approved.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-1.5 truncate max-w-[210px]">
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {AICS_CLIENT_CATEGORIES[r.client_category]?.shortLabel || r.client_category}
                    </span>
                    <span
                      className={`text-[10px] font-semibold truncate ${isDialysisCancer ? 'text-rose-700 font-bold' : 'text-slate-600'
                        }`}
                    >
                      {r.sub_category}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handlePrint(r, e)}
                      title="Print GIS Form"
                      className="p-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      <NewAicsIntakeModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={() => loadData()}
      />

      <AicsDetailModal
        record={selectedRecordForDetail}
        isOpen={Boolean(selectedRecordForDetail)}
        onClose={() => setSelectedRecordForDetail(null)}
        onUpdate={(updated) => {
          setSelectedRecordForDetail(updated);
          loadData();
        }}
      />

      <AicsDailyBudgetModal
        isOpen={isBudgetModalOpen}
        initialTab={budgetModalTab}
        onClose={() => setIsBudgetModalOpen(false)}
        summary={budgetSummary}
        onBudgetUpdated={() => void loadData(false)}
      />
    </div>
  );
}

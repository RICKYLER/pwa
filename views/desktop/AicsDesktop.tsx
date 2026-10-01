'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  HeartHandshake,
  Search,
  Plus,
  Printer,
  FileText,
  DollarSign,
  Activity,
  Users,
  Eye,
  Filter,
  CheckCircle2,
  Calendar,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { getAicsRecords, getAicsStats, deleteAicsRecord } from '@/lib/db/aics';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import { getBarangayName, BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import { AICS_CLIENT_CATEGORIES, getAicsCategoryLabel } from '@/lib/aics/aics-categories';
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
import { getCurrentUser } from '@/lib/auth';
import type { AicsRecord, AicsClientCategory } from '@/lib/db/schema';

export default function AicsDesktop() {
  const currentUser = getCurrentUser();

  const [records, setRecords] = useState<AicsRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [selectedMode, setSelectedMode] = useState<string>('all');
  const [selectedBarangay, setSelectedBarangay] = useState<string>('all');
  const [selectedAssistanceType, setSelectedAssistanceType] = useState<string>('all');

  // Modals
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
          console.warn('Manual AICS refresh bootstrap error:', err);
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
    // 1. Initial quick render from local cache (0ms)
    void loadData();

    // 2. Fresh background bootstrap from Supabase (updates smoothly if new records exist)
    if (typeof window !== 'undefined') {
      void import('@/lib/supabase/route-bootstrap').then(async ({ bootstrapPathnameData }) => {
        try {
          await bootstrapPathnameData('/aics', false);
          await loadData();
        } catch (err) {
          console.warn('Initial AICS background bootstrap failed:', err);
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
      .channel('aics-realtime-desk-desktop')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aics_records' },
        async () => {
          try {
            await bootstrapSupabaseTables(['aics_records'], { force: true });
            void loadData(false);
          } catch (err) {
            console.warn('Realtime aics_records refresh failed:', err);
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
            console.warn('Realtime aics_daily_budgets refresh failed:', err);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Category tab
      if (selectedCategoryTab !== 'all' && r.client_category !== selectedCategoryTab) {
        return false;
      }

      // Mode
      if (selectedMode !== 'all' && r.intake_category !== selectedMode) {
        return false;
      }

      // Barangay
      if (selectedBarangay !== 'all' && r.barangay_id.toLowerCase() !== selectedBarangay.toLowerCase()) {
        return false;
      }

      // Assistance Type
      if (selectedAssistanceType !== 'all' && r.assistance_type !== selectedAssistanceType) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = r.client_name.toLowerCase().includes(q);
        const matchesCtrl = r.control_number.toLowerCase().includes(q);
        const matchesSub = r.sub_category.toLowerCase().includes(q);
        const matchesAid = r.specific_assistance.toLowerCase().includes(q);
        const matchesBrgy = getBarangayName(r.barangay_id).toLowerCase().includes(q);
        if (!matchesName && !matchesCtrl && !matchesSub && !matchesAid && !matchesBrgy) {
          return false;
        }
      }

      return true;
    });
  }, [records, selectedCategoryTab, selectedMode, selectedBarangay, selectedAssistanceType, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalDisbursed = 0;
    let dialysisCancer = 0;
    let fhonaCount = 0;
    let seniorCount = 0;
    let pwdCount = 0;
    let ynspCount = 0;

    for (const r of records) {
      totalDisbursed += Number(r.amount_approved) || 0;
      const sub = (r.sub_category || '').toLowerCase();
      if (sub.includes('dialysis') || sub.includes('cancer')) {
        dialysisCancer++;
      }
      if (r.client_category === 'fhona') fhonaCount++;
      else if (r.client_category === 'senior_citizen') seniorCount++;
      else if (r.client_category === 'pwd') pwdCount++;
      else if (r.client_category === 'ynsp') ynspCount++;
    }

    return {
      totalClients: records.length,
      totalDisbursed,
      dialysisCancer,
      fhonaCount,
      seniorCount,
      pwdCount,
      ynspCount,
    };
  }, [records]);

  // Daily budget summary
  const budgetSummary = useMemo(() => {
    return calculateAicsDailyBudgetSummary(dailyBudget, records);
  }, [dailyBudget, records]);

  function handlePrint(record: AicsRecord) {
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

  const categoryTabs = [
    { id: 'all', label: 'All Beneficiaries', count: stats.totalClients },
    { id: 'fhona', label: 'FHONA', count: stats.fhonaCount },
    { id: 'senior_citizen', label: 'Senior Citizens', count: stats.seniorCount },
    { id: 'pwd', label: 'Persons with Disability', count: stats.pwdCount },
    { id: 'ynsp', label: 'Youth (YNSP)', count: stats.ynspCount },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-emerald-950/10 border border-emerald-700/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/25 text-emerald-200 border border-emerald-400/30">
              Crisis Intervention Section
            </span>
            <span className="text-xs text-emerald-200/80">
              Mabini Municipal Social Welfare & Development
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white mt-1 flex items-center gap-2.5">
            <HeartHandshake className="h-7 w-7 text-emerald-300" />
            A.I.C.S. Crisis Assistance Desk
          </h1>
          <p className="text-xs text-emerald-100/80 mt-1 max-w-2xl leading-relaxed">
            Frontline crisis financial aid, emergency medical vouchers (dialysis & cancer), burial relief, and official 2-Page General Intake Sheet (GIS) administration.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={isLoading}
            className="px-4 py-3 rounded-2xl bg-emerald-700/60 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 border border-emerald-500/30 transition cursor-pointer active:scale-95 disabled:opacity-50"
            title="Fetch latest from Supabase"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="px-5 py-3 rounded-2xl bg-white text-emerald-900 hover:bg-emerald-50 font-black text-xs flex items-center gap-2 shadow-lg transition cursor-pointer active:scale-95"
          >
            <Plus className="h-4 w-4 text-emerald-700" />
            New Walk-In Intake
          </button>
        </div>
      </div>

      {/* Prominent Daily Assistance Fund Tracker (Hotline Ready) */}
      <AicsDailyBudgetHero
        summary={budgetSummary}
        onOpenBudgetModal={(tab) => {
          if (tab) setBudgetModalTab(tab);
          setIsBudgetModalOpen(true);
        }}
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Beneficiaries</p>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.totalClients}</p>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1">Logged crisis cases</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Disbursed (₱)</p>
            <span className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-teal-900 mt-2">
            ₱{stats.totalDisbursed.toLocaleString()}
          </p>
          <p className="text-[11px] text-teal-700 font-semibold mt-1">Approved municipal relief</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Dialysis & Cancer Cases</p>
            <span className="p-2 rounded-xl bg-rose-50 text-rose-700">
              <Activity className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-rose-900 mt-2">{stats.dialysisCancer}</p>
          <p className="text-[11px] text-rose-700 font-semibold mt-1">High-priority medical therapy</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Senior & PWD Clients</p>
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-indigo-900 mt-2">
            {stats.seniorCount + stats.pwdCount}
          </p>
          <p className="text-[11px] text-indigo-700 font-semibold mt-1">
            {stats.seniorCount} Seniors • {stats.pwdCount} PWD
          </p>
        </div>
      </div>

      {/* Main Workspace Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Category Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 gap-2 overflow-x-auto text-xs font-bold pt-2">
          {categoryTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategoryTab(tab.id)}
              className={`py-3 px-4 border-b-2 transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                selectedCategoryTab === tab.id
                  ? 'border-emerald-600 text-emerald-800 bg-white font-black shadow-xs rounded-t-xl'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] ${
                  selectedCategoryTab === tab.id
                    ? 'bg-emerald-100 text-emerald-800 font-bold'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-white flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search beneficiary, control #, medical purpose..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-emerald-500 outline-none font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Mode Filter */}
            <select
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
              className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold focus:border-emerald-500 outline-none cursor-pointer"
            >
              <option value="all">All Entry Modes</option>
              <option value="walk_in">Walk-In</option>
              <option value="referred">Referred</option>
              <option value="rescued">Rescued</option>
            </select>

            {/* Assistance Type Filter */}
            <select
              value={selectedAssistanceType}
              onChange={(e) => setSelectedAssistanceType(e.target.value)}
              className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold focus:border-emerald-500 outline-none cursor-pointer"
            >
              <option value="all">All Aid Types</option>
              <option value="medical">Medical</option>
              <option value="burial">Burial</option>
              <option value="educational">Educational</option>
              <option value="food_transportation">Food & Transportation</option>
              <option value="disaster_distress">Disaster Distress</option>
              <option value="other">Other</option>
            </select>

            {/* Barangay Filter */}
            <select
              value={selectedBarangay}
              onChange={(e) => setSelectedBarangay(e.target.value)}
              className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold focus:border-emerald-500 outline-none cursor-pointer"
            >
              <option value="all">All Barangays</option>
              {BARANGAY_REGISTRY.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Loading AICS records...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                <HeartHandshake className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">No AICS crisis records found</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No crisis intake matching your search or filters. Click &ldquo;New Walk-In Intake&rdquo; to process an applicant.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Control # & Date</th>
                  <th className="py-3 px-4">Beneficiary Client</th>
                  <th className="py-3 px-4">Barangay & Purok</th>
                  <th className="py-3 px-4">AICS Category</th>
                  <th className="py-3 px-4">Assistance Purpose</th>
                  <th className="py-3 px-4 text-right">Amount Approved</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r) => {
                  const isDialysisCancer =
                    r.sub_category.toLowerCase().includes('dialysis') ||
                    r.sub_category.toLowerCase().includes('cancer');

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/70 transition cursor-pointer group"
                      onClick={() => setSelectedRecordForDetail(r)}
                    >
                      {/* Control # & Date */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 block group-hover:text-emerald-700 transition">
                          {r.control_number}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-400 font-medium">{r.intake_date}</span>
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase bg-slate-100 text-slate-600">
                            {r.intake_category.replace('_', ' ')}
                          </span>
                        </div>
                      </td>

                      {/* Client */}
                      <td className="py-3 px-4">
                        <span className="font-black text-slate-900 block">{r.client_name}</span>
                        <span className="text-[11px] text-slate-500">
                          {r.client_age} yrs • {r.client_gender}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 block">
                          {getBarangayName(r.barangay_id)}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px] block">
                          {r.purok_sitio || 'Barangay Center'}
                        </span>
                      </td>

                      {/* AICS Category & Sub-Category */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                            r.client_category === 'fhona'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : r.client_category === 'senior_citizen'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : r.client_category === 'pwd'
                              ? 'bg-purple-50 text-purple-800 border-purple-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {AICS_CLIENT_CATEGORIES[r.client_category]?.shortLabel || r.client_category.toUpperCase()}
                        </span>
                        <span
                          className={`block text-[11px] font-semibold mt-0.5 truncate max-w-[160px] ${
                            isDialysisCancer ? 'text-rose-700 font-bold' : 'text-slate-600'
                          }`}
                          title={r.sub_category}
                        >
                          {r.sub_category}
                        </span>
                      </td>

                      {/* Purpose */}
                      <td className="py-3 px-4">
                        <span className="text-xs font-semibold text-slate-800 capitalize block">
                          {r.assistance_type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-slate-500 line-clamp-1 max-w-[180px]">
                          {r.specific_assistance}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-black text-emerald-800 block">
                          ₱{r.amount_approved.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {r.disbursement_type.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Action */}
                      <td
                        className="py-3 px-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedRecordForDetail(r)}
                            title="View Intake Details"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => handlePrint(r)}
                            title="Print Official 2-Page GIS Form"
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800 transition cursor-pointer border border-emerald-200"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      <NewAicsIntakeModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={() => {
          loadData();
        }}
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

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderLock,
  Search,
  Filter,
  Plus,
  Upload,
  Download,
  FileSpreadsheet,
  Shield,
  AlertTriangle,
  User,
  Clock,
  CheckCircle2,
  Lock,
  Eye,
  RefreshCw,
  X,
  FileText,
  MapPin,
  Calendar,
  Printer,
} from 'lucide-react';
import type {
  CaseRecord,
  CaseClassification,
  CaseStatus,
} from '@/lib/db/schema';
import { getCases } from '@/lib/db/cases';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import {
  downloadCaseExcelTemplate,
  downloadCaseCsvTemplate,
} from '@/lib/cases/case-excel-importer';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import CaseNavigationHeader from '@/components/cases/CaseNavigationHeader';
import { cn } from '@/lib/utils';

export type MainCategoryTab =
  | 'all'
  | 'vawc'
  | 'rape'
  | 'acts_of_lasciviousness'
  | 'child_abuse_vac'
  | 'other';

export function getCaseCategoryGroup(c: CaseRecord): MainCategoryTab {
  const t = (c.case_type || '').toLowerCase();
  const gisType = (c.intake_sheet?.case_category_type || '').toLowerCase();

  if (t === 'rape' || gisType === 'rape') return 'rape';
  if (
    t === 'acts_of_lasciviousness' ||
    gisType === 'acts_of_lasciviousness' ||
    c.case_summary?.toLowerCase().includes('lascivious') ||
    c.intake_notes?.toLowerCase().includes('lascivious')
  ) {
    return 'acts_of_lasciviousness';
  }
  if (
    t.startsWith('vawc') ||
    gisType === 'vawc' ||
    t === 'vawc_physical' ||
    t === 'vawc_psychological' ||
    t === 'vawc_economic' ||
    t === 'vawc_sexual'
  ) {
    return 'vawc';
  }
  if (
    t.startsWith('vac') ||
    t === 'cicl' ||
    gisType === 'child_custody' ||
    gisType === 'child_support' ||
    gisType === 'vac_abuse' ||
    gisType === 'vac_neglect'
  ) {
    return 'child_abuse_vac';
  }
  return 'other';
}

export const CATEGORY_TABS: {
  id: MainCategoryTab;
  label: string;
  shortLabel: string;
  badgeColor: string;
  activeColor: string;
}[] = [
    {
      id: 'all',
      label: 'All Categories',
      shortLabel: 'All',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200',
      activeColor: 'bg-slate-900 text-white border-slate-900 shadow-sm',
    },
    {
      id: 'vawc',
      label: 'VAWC (RA 9262)',
      shortLabel: 'VAWC',
      badgeColor: 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100',
      activeColor: 'bg-purple-700 text-white border-purple-700 shadow-md shadow-purple-700/25',
    },
    {
      id: 'rape',
      label: 'Rape / Attempted Rape',
      shortLabel: 'Rape',
      badgeColor: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100',
      activeColor: 'bg-rose-700 text-white border-rose-700 shadow-md shadow-rose-700/25',
    },
    {
      id: 'acts_of_lasciviousness',
      label: 'Acts of Lasciviousness',
      shortLabel: 'Lasciviousness',
      badgeColor: 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100',
      activeColor: 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/25',
    },
    {
      id: 'child_abuse_vac',
      label: 'Child Abuse & Custody (VAC)',
      shortLabel: 'Children / VAC',
      badgeColor: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100',
      activeColor: 'bg-blue-700 text-white border-blue-700 shadow-md shadow-blue-700/25',
    },
    {
      id: 'other',
      label: 'Others / Special Cases',
      shortLabel: 'Others',
      badgeColor: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
      activeColor: 'bg-slate-700 text-white border-slate-700 shadow-sm',
    },
  ];

export default function CasesDesktop() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<MainCategoryTab>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [barangayFilter, setBarangayFilter] = useState<string>('all');

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Success Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setIsLoading(true);
    try {
      const data = await getCases();
      setCases(data);
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<MainCategoryTab, number> = {
      all: cases.length,
      vawc: 0,
      rape: 0,
      acts_of_lasciviousness: 0,
      child_abuse_vac: 0,
      other: 0,
    };
    for (const c of cases) {
      const group = getCaseCategoryGroup(c);
      if (counts[group] !== undefined) {
        counts[group]++;
      } else {
        counts.other++;
      }
    }
    return counts;
  }, [cases]);

  // Filtered Category Tabs for the Category Search bar
  const visibleCategoryTabs = useMemo(() => {
    if (!categorySearchQuery.trim()) return CATEGORY_TABS;
    const q = categorySearchQuery.toLowerCase().trim();
    return CATEGORY_TABS.filter((cat) => {
      if (cat.id === 'all') return true;
      return (
        cat.label.toLowerCase().includes(q) ||
        cat.shortLabel.toLowerCase().includes(q) ||
        cat.id.toLowerCase().includes(q)
      );
    });
  }, [categorySearchQuery]);

  // Filtered cases calculation
  const filteredCases = useMemo(() => {
    let result = cases;

    // 1. Explicit Category tab filter
    if (categoryFilter !== 'all') {
      result = result.filter((c) => getCaseCategoryGroup(c) === categoryFilter);
    }

    // 2. Category Search Query (filters cases directly when typing in Category search)
    if (categorySearchQuery.trim()) {
      const cq = categorySearchQuery.toLowerCase().trim();
      result = result.filter((c) => {
        const catGroup = getCaseCategoryGroup(c);
        const catTab = CATEGORY_TABS.find((t) => t.id === catGroup);
        const caseType = (c.case_type || '').toLowerCase();
        const gisType = (c.intake_sheet?.case_category_type || '').toLowerCase();
        const otherDetail = (c.intake_sheet?.case_category_other || '').toLowerCase();

        return (
          caseType.includes(cq) ||
          gisType.includes(cq) ||
          otherDetail.includes(cq) ||
          (catTab && catTab.label.toLowerCase().includes(cq)) ||
          (catTab && catTab.shortLabel.toLowerCase().includes(cq)) ||
          (catTab && catTab.id.toLowerCase().includes(cq))
        );
      });
    }

    // 3. Status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    // 4. Type filter (dropdown)
    if (typeFilter !== 'all') {
      result = result.filter((c) => c.case_type === typeFilter);
    }

    // 5. Barangay filter
    if (barangayFilter !== 'all') {
      result = result.filter((c) => c.barangay_id.toLowerCase() === barangayFilter.toLowerCase());
    }

    // 6. Main Search Query (also searches category and classification names)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((c) => {
        const catGroup = getCaseCategoryGroup(c);
        const catTab = CATEGORY_TABS.find((t) => t.id === catGroup);
        const matchesCategory =
          (c.case_type && c.case_type.toLowerCase().includes(q)) ||
          (c.intake_sheet?.case_category_type && c.intake_sheet.case_category_type.toLowerCase().includes(q)) ||
          (c.intake_sheet?.case_category_other && c.intake_sheet.case_category_other.toLowerCase().includes(q)) ||
          (catTab && catTab.label.toLowerCase().includes(q)) ||
          (catTab && catTab.shortLabel.toLowerCase().includes(q));

        return (
          matchesCategory ||
          c.case_number.toLowerCase().includes(q) ||
          c.victim_name.toLowerCase().includes(q) ||
          (c.perpetrator_name && c.perpetrator_name.toLowerCase().includes(q)) ||
          (c.assigned_worker_name && c.assigned_worker_name.toLowerCase().includes(q)) ||
          (c.case_summary && c.case_summary.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [cases, searchQuery, categoryFilter, categorySearchQuery, statusFilter, typeFilter, barangayFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = cases.length;
    const active = cases.filter((c) => c.status === 'active').length;
    const bpo = cases.filter((c) => c.status === 'under_bpo_tpo').length;
    const pnpOrCourt = cases.filter(
      (c) => c.status === 'referred_pnp_wcpd' || c.status === 'filed_in_court',
    ).length;
    const resolved = cases.filter((c) => c.status === 'resolved_closed').length;
    return { total, active, bpo, pnpOrCourt, resolved };
  }, [cases]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-900 text-white shadow-xl text-xs font-semibold animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Header with Switcher Tabs */}
      <CaseNavigationHeader
        totalCases={cases.length}
        onNewCase={() => setNewCaseModalOpen(true)}
        onUploadExcel={() => setUploadModalOpen(true)}
        onDownloadTemplate={downloadCaseExcelTemplate}
      />

      {/* Statistics Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Cases</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{stats.total}</span>
            <FolderLock className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Active Cases</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-900">{stats.active}</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Under BPO / TPO</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-indigo-900">{stats.bpo}</span>
            <Shield className="h-4 w-4 text-indigo-600" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Referred to PNP / Court</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-sky-900">{stats.pnpOrCourt}</span>
            <AlertTriangle className="h-4 w-4 text-sky-600" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Resolved / Closed</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-900">{stats.resolved}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Case No., Client Name, Perpetrator, or Category (e.g. Rape, VAWC)..."
              className="w-full pl-10 pr-9 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition bg-slate-50/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Barangay Dropdown */}
          <select
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
            aria-label="Filter by Barangay"
            className="w-full md:w-48 py-2.5 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50/60 text-slate-700 focus:border-amber-500 outline-none capitalize cursor-pointer font-medium"
          >
            <option value="all">All Barangays (11)</option>
            {BARANGAY_REGISTRY.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>

          {/* Classification Dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by Classification"
            className="w-full md:w-56 py-2.5 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50/60 text-slate-700 focus:border-amber-500 outline-none cursor-pointer font-medium"
          >
            <option value="all">All Classifications</option>
            <option value="vawc_physical">VAWC Physical Abuse</option>
            <option value="vawc_psychological">VAWC Psychological</option>
            <option value="vawc_sexual">VAWC Sexual Abuse</option>
            <option value="vawc_economic">VAWC Economic Abuse</option>
            <option value="vac_abuse">VAC Child Abuse</option>
            <option value="vac_neglect">VAC Child Neglect</option>
            <option value="rape">Rape / Attempted Rape</option>
            <option value="cicl">CICL</option>
            <option value="other">Other</option>
          </select>

          <button
            onClick={loadCases}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Refresh List"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>

        {/* Case Category Quick-Filter Tabs with Category Search */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Case Category / Classification:
              </span>
              {(categoryFilter !== 'all' || categorySearchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setCategorySearchQuery('');
                  }}
                  className="text-[11px] text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
                >
                  Reset to All Categories
                </button>
              )}
            </div>

            {/* Quick Category Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder="Search category (e.g. Rape, VAWC)..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/80 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition font-medium"
              />
              {categorySearchQuery && (
                <button
                  type="button"
                  onClick={() => setCategorySearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {visibleCategoryTabs.map((cat) => {
              const count = categoryCounts[cat.id] || 0;
              const isActive = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border cursor-pointer',
                    isActive
                      ? cat.activeColor
                      : `${cat.badgeColor} hover:shadow-xs`,
                  )}
                >
                  <span>{cat.label}</span>
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-full text-[10px] font-black',
                      isActive ? 'bg-white/25 text-white' : 'bg-black/5 text-slate-700',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {visibleCategoryTabs.length === 0 && (
              <div className="py-1 text-xs text-slate-400 italic">
                No category tab matches &ldquo;{categorySearchQuery}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* Status Quick-Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-2">
            Status:
          </span>
          {[
            { id: 'all', label: 'All Cases' },
            { id: 'active', label: 'Active' },
            { id: 'under_bpo_tpo', label: 'Under BPO / TPO' },
            { id: 'referred_pnp_wcpd', label: 'PNP-WCPD' },
            { id: 'filed_in_court', label: 'In Court' },
            { id: 'resolved_closed', label: 'Resolved / Closed' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={cn(
                'px-3 py-1 rounded-lg font-semibold transition',
                statusFilter === s.id
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cases Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">
              {categorySearchQuery.trim()
                ? `Category Search: "${categorySearchQuery}"`
                : categoryFilter === 'all'
                  ? 'All Case Records Directory'
                  : `${CATEGORY_TABS.find((t) => t.id === categoryFilter)?.label || 'Case'} Directory`}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
              {filteredCases.length} {filteredCases.length === 1 ? 'case' : 'cases'}
            </span>
          </div>
          {searchQuery && (
            <p className="text-xs text-slate-500">
              Filtered by: &ldquo;<strong className="text-slate-800">{searchQuery}</strong>&rdquo;
            </p>
          )}
        </div>

        {filteredCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-3">
              <FolderLock className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              {categoryFilter !== 'all'
                ? `No ${CATEGORY_TABS.find((t) => t.id === categoryFilter)?.shortLabel} cases found`
                : 'No cases found'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              {categoryFilter !== 'all'
                ? `There are currently 0 cases recorded under ${CATEGORY_TABS.find((t) => t.id === categoryFilter)?.label}. Select another category or click "New Case Intake".`
                : searchQuery || statusFilter !== 'all' || barangayFilter !== 'all'
                  ? 'No matching cases for the active filter. Try resetting search parameters.'
                  : 'Your case registry is empty. Upload your existing MSWDO Excel logbook or create a new case intake.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {categoryFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  View All Categories ({cases.length})
                </button>
              )}
              <button
                onClick={() => setUploadModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Excel Sheet
              </button>
              <button
                onClick={() => setNewCaseModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                New Intake
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Case Number</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Victim / Client</th>
                  <th className="py-3 px-4">Barangay</th>
                  <th className="py-3 px-4">Alleged Perpetrator</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reported</th>
                  <th className="py-3 px-4">Assigned Worker</th>
                  <th className="py-3 px-4 text-right">Folder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredCases.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className="hover:bg-amber-50/40 transition cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-900 flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                      <span>{c.case_number}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      {(() => {
                        const catGroup = getCaseCategoryGroup(c);
                        const label =
                          c.case_type === 'rape' || c.intake_sheet?.case_category_type === 'rape'
                            ? 'Rape'
                            : c.case_type === 'acts_of_lasciviousness' || c.intake_sheet?.case_category_type === 'acts_of_lasciviousness'
                              ? 'Acts of Lasciviousness'
                              : c.case_type.startsWith('vawc') || c.intake_sheet?.case_category_type === 'vawc'
                                ? c.case_type.replace(/_/g, ' ')
                                : c.intake_sheet?.case_category_type
                                  ? c.intake_sheet.case_category_type.replace(/_/g, ' ')
                                  : c.case_type.replace(/_/g, ' ');

                        return (
                          <div className="space-y-0.5">
                            <span
                              className={cn(
                                'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                                catGroup === 'rape' && 'bg-rose-100 text-rose-800 border border-rose-200',
                                catGroup === 'acts_of_lasciviousness' && 'bg-amber-100 text-amber-900 border border-amber-200',
                                catGroup === 'vawc' && 'bg-purple-100 text-purple-800 border border-purple-200',
                                catGroup === 'child_abuse_vac' && 'bg-blue-100 text-blue-800 border border-blue-200',
                                catGroup === 'other' && 'bg-slate-100 text-slate-800 border border-slate-200',
                              )}
                            >
                              {label}
                            </span>
                            {c.intake_sheet?.case_category_other && (
                              <p className="text-[10px] text-slate-500 italic max-w-[130px] truncate" title={c.intake_sheet.case_category_other}>
                                {c.intake_sheet.case_category_other}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{c.victim_name}</p>
                      {c.victim_age && (
                        <p className="text-[10px] text-slate-400">
                          {c.victim_age} yrs • {c.victim_gender === 'F' ? 'Female' : 'Male'}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 capitalize font-medium text-slate-700">
                      {c.barangay_id}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-800">{c.perpetrator_name || '—'}</p>
                      {c.perpetrator_relationship && (
                        <p className="text-[10px] text-slate-400">({c.perpetrator_relationship})</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize',
                          c.status === 'active' && 'bg-amber-100 text-amber-800',
                          c.status === 'under_bpo_tpo' && 'bg-indigo-100 text-indigo-800',
                          c.status === 'referred_pnp_wcpd' && 'bg-sky-100 text-sky-800',
                          c.status === 'filed_in_court' && 'bg-violet-100 text-violet-800',
                          c.status === 'resolved_closed' && 'bg-emerald-100 text-emerald-800',
                          c.status === 'monitoring' && 'bg-teal-100 text-teal-800',
                        )}
                      >
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {c.reported_at}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 truncate max-w-[120px]">
                      {c.assigned_worker_name || 'MSWDO'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            printGeneralIntakeSheet(c);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-800 font-bold transition shadow-sm border border-amber-200"
                          title="Print 2-Page General Intake Sheet (GIS)"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span className="hidden lg:inline">Print GIS</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCaseId(c.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 group-hover:bg-amber-600 group-hover:text-white text-slate-700 font-bold transition shadow-sm"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Open Folder
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CaseExcelUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={(count) => {
          loadCases();
          showToast(`Successfully imported ${count} cases into MSWDO Case Directory!`);
        }}
      />

      <NewCaseModal
        isOpen={newCaseModalOpen}
        onClose={() => setNewCaseModalOpen(false)}
        onSuccess={(newCase) => {
          loadCases();
          showToast(`New case ${newCase.case_number} recorded successfully!`);
          setSelectedCaseId(newCase.id);
        }}
      />

      <CaseDetailModal
        isOpen={Boolean(selectedCaseId)}
        caseId={selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onCaseUpdated={loadCases}
      />
    </div>
  );
}

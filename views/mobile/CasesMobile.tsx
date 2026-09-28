'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  FolderLock,
  Search,
  Plus,
  FileSpreadsheet,
  Download,
  Filter,
  Shield,
  Clock,
  CheckCircle2,
  Lock,
  RefreshCw,
  X,
  ChevronRight,
  User,
  MapPin,
  Printer,
  BarChart3,
} from 'lucide-react';
import type { CaseRecord } from '@/lib/db/schema';
import { getCases } from '@/lib/db/cases';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import { downloadCaseExcelTemplate } from '@/lib/cases/case-excel-importer';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import { cn } from '@/lib/utils';
import {
  getCaseCategoryGroup,
  MainCategoryTab,
  CATEGORY_TABS,
} from '@/views/desktop/CasesDesktop';

export default function CasesMobile() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MainCategoryTab>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [barangayFilter, setBarangayFilter] = useState('all');

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

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

  const filteredCases = useMemo(() => {
    let result = cases;

    if (categoryFilter !== 'all') {
      result = result.filter((c) => getCaseCategoryGroup(c) === categoryFilter);
    }

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

    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (barangayFilter !== 'all') {
      result = result.filter((c) => c.barangay_id.toLowerCase() === barangayFilter.toLowerCase());
    }

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
          (c.case_summary && c.case_summary.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [cases, searchQuery, categoryFilter, categorySearchQuery, statusFilter, barangayFilter]);

  const activeCount = useMemo(() => cases.filter((c) => c.status === 'active').length, [cases]);
  const bpoCount = useMemo(() => cases.filter((c) => c.status === 'under_bpo_tpo').length, [cases]);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      {/* Mobile Header Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950 to-slate-900 text-white shadow-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <FolderLock className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              MSWDO VAWC Desk
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-300">
            {cases.length} {cases.length === 1 ? 'Case' : 'Cases'}
          </span>
        </div>
        <h1 className="text-lg font-black text-white">Case Management</h1>
        <p className="text-[11px] text-slate-300 leading-tight">
          Confidential digital records for VAWC, VAC & special protection cases.
        </p>

        {/* Quick Action Buttons */}
        <div className="pt-2 flex items-center gap-2">
          <button
            onClick={() => setUploadModalOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-xl bg-amber-600 text-white shadow transition"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Upload Excel
          </button>
          <button
            onClick={() => setNewCaseModalOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-xl bg-white text-slate-900 shadow transition"
          >
            <Plus className="h-3.5 w-3.5 text-amber-600" />
            New Intake
          </button>
        </div>
      </div>

      {/* Switcher Navigation Pill */}
      <div className="flex items-center p-1 rounded-xl bg-slate-200/80 text-xs font-bold">
        <Link
          href="/cases/dashboard"
          className="flex-1 py-1.5 text-center text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 transition"
        >
          <BarChart3 className="h-3.5 w-3.5 text-slate-500" />
          Analytics
        </Link>
        <span className="flex-1 py-1.5 text-center rounded-lg bg-white text-slate-900 shadow-xs flex items-center justify-center gap-1.5">
          <FolderLock className="h-3.5 w-3.5 text-amber-600" />
          Directory ({cases.length})
        </span>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Case No., Name, or Category (e.g. Rape)..."
          className="w-full pl-10 pr-9 py-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-3 text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category Classification Quick-Filter Pills with Category Search */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] px-0.5 gap-2">
          <span className="font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
            Category
          </span>
          <div className="relative flex-1 max-w-[190px]">
            <Search className="absolute left-2 top-2 h-3 w-3 text-slate-400" />
            <input
              type="text"
              value={categorySearchQuery}
              onChange={(e) => setCategorySearchQuery(e.target.value)}
              placeholder="Filter category..."
              className="w-full pl-6 pr-6 py-1 text-[11px] rounded-lg border border-slate-200 bg-white focus:border-amber-500 outline-none"
            />
            {categorySearchQuery && (
              <button
                type="button"
                onClick={() => setCategorySearchQuery('')}
                className="absolute right-1.5 top-1.5 text-slate-400"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {(categoryFilter !== 'all' || categorySearchQuery.trim()) && (
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setCategorySearchQuery('');
              }}
              className="text-amber-700 font-bold hover:underline whitespace-nowrap text-[10px]"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {visibleCategoryTabs.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            const isActive = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition text-[11px] flex items-center gap-1.5 border cursor-pointer',
                  isActive
                    ? cat.activeColor
                    : `${cat.badgeColor} border-slate-200`,
                )}
              >
                <span>{cat.shortLabel}</span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[9px] font-black',
                    isActive ? 'bg-white/30 text-white' : 'bg-black/5 text-slate-700',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {visibleCategoryTabs.length === 0 && (
            <div className="py-1 text-xs text-slate-400 italic">
              No category &ldquo;{categorySearchQuery}&rdquo;
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Status Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {[
          { id: 'all', label: `All Status (${cases.length})` },
          { id: 'active', label: `Active (${activeCount})` },
          { id: 'under_bpo_tpo', label: `BPO (${bpoCount})` },
          { id: 'referred_pnp_wcpd', label: 'PNP-WCPD' },
          { id: 'resolved_closed', label: 'Closed' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            className={cn(
              'px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition text-[11px]',
              statusFilter === s.id
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Cases List */}
      <div className="space-y-2.5">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading cases...</div>
        ) : filteredCases.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200 p-6 space-y-2">
            <FolderLock className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">No cases match your filter</p>
            <p className="text-[11px] text-slate-400">
              {categoryFilter !== 'all'
                ? `No records found in "${CATEGORY_TABS.find((t) => t.id === categoryFilter)?.label || categoryFilter}".`
                : 'Upload existing Excel cases or start a new walk-in case intake.'}
            </p>
            {categoryFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className="mt-2 text-xs font-bold text-amber-700 hover:text-amber-800 underline inline-block"
              >
                View All Categories
              </button>
            )}
          </div>
        ) : (
          filteredCases.map((c) => {
            const catGroup = getCaseCategoryGroup(c);
            return (
              <div
                key={c.id}
                onClick={() => setSelectedCaseId(c.id)}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-amber-400 active:scale-[0.99] transition cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Lock className="h-3 w-3 text-amber-600" />
                    {c.case_number}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                      c.status === 'active' && 'bg-amber-100 text-amber-800',
                      c.status === 'under_bpo_tpo' && 'bg-indigo-100 text-indigo-800',
                      c.status === 'referred_pnp_wcpd' && 'bg-sky-100 text-sky-800',
                      c.status === 'resolved_closed' && 'bg-emerald-100 text-emerald-800',
                    )}
                  >
                    {c.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-900">{c.victim_name}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border',
                        catGroup === 'rape' && 'bg-rose-50 text-rose-800 border-rose-200',
                        catGroup === 'vawc' && 'bg-purple-50 text-purple-800 border-purple-200',
                        catGroup === 'acts_of_lasciviousness' && 'bg-amber-50 text-amber-900 border-amber-200',
                        catGroup === 'child_abuse_vac' && 'bg-blue-50 text-blue-800 border-blue-200',
                        catGroup === 'other' && 'bg-slate-100 text-slate-800 border-slate-200',
                      )}
                    >
                      {c.case_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] text-slate-500">• Brgy. {c.barangay_id}</span>
                  </div>
                  {c.intake_sheet?.case_category_other && (
                    <p className="text-[10px] text-slate-500 italic mt-0.5">
                      Detail: {c.intake_sheet.case_category_other}
                    </p>
                  )}
                </div>

              {c.perpetrator_name && (
                <p className="text-[11px] text-slate-600">
                  <span className="font-semibold">Respondent:</span> {c.perpetrator_name}
                  {c.perpetrator_relationship ? ` (${c.perpetrator_relationship})` : ''}
                </p>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <span>Reported: {c.reported_at}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      printGeneralIntakeSheet(c);
                    }}
                    className="flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 hover:bg-amber-100 transition"
                    title="Print 2-Page General Intake Sheet (GIS)"
                  >
                    <Printer className="h-3 w-3" /> GIS
                  </button>
                  <span className="flex items-center gap-0.5 text-slate-700 font-bold">
                    Folder <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </div>
          );
        })
        )}
      </div>

      {/* Modals */}
      <CaseExcelUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={() => loadCases()}
      />

      <NewCaseModal
        isOpen={newCaseModalOpen}
        onClose={() => setNewCaseModalOpen(false)}
        onSuccess={(c) => {
          loadCases();
          setSelectedCaseId(c.id);
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

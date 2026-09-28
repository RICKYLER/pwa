'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  FolderLock,
  BarChart3,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Plus,
  FileSpreadsheet,
  ChevronRight,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import type { CaseRecord } from '@/lib/db/schema';
import { getCases } from '@/lib/db/cases';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import CaseCategoryDistributionChart from '@/components/cases/CaseCategoryDistributionChart';
import {
  getCaseCategoryGroup,
  MainCategoryTab,
} from '@/views/desktop/CasesDesktop';
import { cn } from '@/lib/utils';

export default function CasesDashboardMobile() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<MainCategoryTab>('all');

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

  // KPIs
  const stats = useMemo(() => {
    const total = cases.length;
    const active = cases.filter((c) => c.status === 'active').length;
    const bpo = cases.filter((c) => c.status === 'under_bpo_tpo').length;
    const pnpOrCourt = cases.filter(
      (c) => c.status === 'referred_pnp_wcpd' || c.status === 'filed_in_court',
    ).length;
    const resolved = cases.filter((c) => c.status === 'resolved_closed').length;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    return { total, active, bpo, pnpOrCourt, resolved, resolutionRate };
  }, [cases]);

  // Top Barangays
  const topBarangays = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of BARANGAY_REGISTRY) map[b.id] = 0;
    for (const c of cases) map[c.barangay_id] = (map[c.barangay_id] || 0) + 1;
    return BARANGAY_REGISTRY.map((b) => ({
      id: b.id,
      name: b.label,
      count: map[b.id] || 0,
    })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [cases]);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      {/* Mobile Header Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 to-amber-950 text-white shadow-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              MSWDO Social Analytics
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-300">
            {cases.length} Total
          </span>
        </div>
        <h1 className="text-lg font-black text-white">Social Work Analytics</h1>
        <p className="text-[11px] text-slate-300 leading-tight">
          Statistical monitoring for VAWC, Child Abuse &amp; confidential cases.
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
        <span className="flex-1 py-1.5 text-center rounded-lg bg-white text-slate-900 shadow-xs flex items-center justify-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-amber-600" />
          Analytics
        </span>
        <Link
          href="/cases"
          className="flex-1 py-1.5 text-center text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 transition"
        >
          <FolderLock className="h-3.5 w-3.5 text-slate-500" />
          Directory ({cases.length})
        </Link>
      </div>

      {/* KPI 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Cases</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{stats.total}</span>
            <FolderLock className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Active Cases</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-900">{stats.active}</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
        </div>

        <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/50 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Under BPO / TPO</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-indigo-900">{stats.bpo}</span>
            <Shield className="h-4 w-4 text-indigo-600" />
          </div>
        </div>

        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Resolved</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-900">{stats.resolved}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Case Category Distribution Chart */}
      <CaseCategoryDistributionChart
        categoryCounts={categoryCounts}
        totalCases={cases.length}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        defaultExpanded={true}
      />

      {/* Top Barangays Card */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-amber-600" />
            <h4 className="text-xs font-bold text-slate-900">Top Barangays by Caseload</h4>
          </div>
          <Link href="/cases" className="text-[11px] font-bold text-amber-700">
            View All →
          </Link>
        </div>

        <div className="space-y-2">
          {topBarangays.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">{b.name}</span>
              <span className="font-mono font-bold text-slate-900">
                {b.count} {b.count === 1 ? 'case' : 'cases'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Jump to Directory Button */}
      <Link
        href="/cases"
        className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
      >
        <FolderLock className="h-4 w-4 text-amber-400" />
        <span>Open Case Records Directory &amp; Intakes</span>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </Link>

      {/* Modals */}
      <CaseExcelUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={loadCases}
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

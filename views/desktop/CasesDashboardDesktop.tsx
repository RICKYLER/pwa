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
  Eye,
  MapPin,
  Calendar,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  Building2,
  RefreshCw,
} from 'lucide-react';
import type { CaseRecord } from '@/lib/db/schema';
import { getCases } from '@/lib/db/cases';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import {
  downloadCaseExcelTemplate,
} from '@/lib/cases/case-excel-importer';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import CaseNavigationHeader from '@/components/cases/CaseNavigationHeader';
import CaseCategoryDistributionChart from '@/components/cases/CaseCategoryDistributionChart';
import {
  getCaseCategoryGroup,
  MainCategoryTab,
  CATEGORY_TABS,
} from '@/views/desktop/CasesDesktop';
import { cn } from '@/lib/utils';

export default function CasesDashboardDesktop() {
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

  // Barangay distribution
  const barangayCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of BARANGAY_REGISTRY) {
      map[b.id] = 0;
    }
    for (const c of cases) {
      const bId = c.barangay_id;
      map[bId] = (map[bId] || 0) + 1;
    }
    return BARANGAY_REGISTRY.map((b) => ({
      id: b.id,
      name: b.label,
      count: map[b.id] || 0,
    })).sort((a, b) => b.count - a.count);
  }, [cases]);

  // Recent 5 Cases
  const recentCases = useMemo(() => {
    return [...cases]
      .sort((a, b) => new Date(b.createdAt || b.reported_at).getTime() - new Date(a.createdAt || a.reported_at).getTime())
      .slice(0, 5);
  }, [cases]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Navigation Header with Switcher Tabs */}
      <CaseNavigationHeader
        totalCases={cases.length}
        onNewCase={() => setNewCaseModalOpen(true)}
        onUploadExcel={() => setUploadModalOpen(true)}
        onDownloadTemplate={downloadCaseExcelTemplate}
      />

      {/* Top 5 KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Cases</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900">{stats.total}</span>
            <FolderLock className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Digitized &amp; Protected</p>
        </div>

        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 shadow-xs flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Active Cases</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-amber-900">{stats.active}</span>
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-1 text-[10px] text-amber-700/80">Under monitoring</p>
        </div>

        <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 shadow-xs flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Under BPO / TPO</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-indigo-900">{stats.bpo}</span>
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-1 text-[10px] text-indigo-700/80">Barangay / Court Order</p>
        </div>

        <div className="p-4 rounded-2xl border border-sky-200 bg-sky-50/50 shadow-xs flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Referred PNP/Court</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-sky-900">{stats.pnpOrCourt}</span>
            <AlertTriangle className="h-5 w-5 text-sky-600" />
          </div>
          <p className="mt-1 text-[10px] text-sky-700/80">WCPD &amp; Litigation</p>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 shadow-xs flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Resolved / Closed</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-900">{stats.resolved}</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-1 text-[10px] text-emerald-700/80">{stats.resolutionRate}% Resolution Rate</p>
        </div>
      </div>

      {/* Case Category & Classification Distribution Analytics Chart Card */}
      <CaseCategoryDistributionChart
        categoryCounts={categoryCounts}
        totalCases={cases.length}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        defaultExpanded={true}
      />

      {/* Two-Column Analytics Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Geographic Distribution by Barangay (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Geographic Distribution by Barangay</h4>
                <p className="text-[11px] text-slate-400">Cases mapped across the 11 Barangays of Mabini</p>
              </div>
            </div>
            <Link
              href="/cases"
              className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1"
            >
              <span>View Directory</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {barangayCounts.map((b) => {
              const maxCount = Math.max(...barangayCounts.map((x) => x.count), 1);
              const barPercent = Math.round((b.count / maxCount) * 100);

              return (
                <div
                  key={b.id}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{b.name}</span>
                    <span className="font-mono font-bold text-slate-900">
                      {b.count} {b.count === 1 ? 'case' : 'cases'}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-600 transition-all duration-500"
                      style={{ width: `${Math.max(barPercent, b.count > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Legal Protection Status & Disposition (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Protection Status &amp; Disposition</h4>
                <p className="text-[11px] text-slate-400">Legal stage of confidential cases</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {[
              {
                label: 'Active Social Worker Monitoring',
                count: stats.active,
                color: 'bg-amber-500',
                badge: 'Active',
                badgeStyle: 'bg-amber-100 text-amber-800',
              },
              {
                label: 'Barangay Protection Orders (BPO / TPO)',
                count: stats.bpo,
                color: 'bg-indigo-500',
                badge: 'Protected',
                badgeStyle: 'bg-indigo-100 text-indigo-800',
              },
              {
                label: 'Elevated to PNP-WCPD or Court',
                count: stats.pnpOrCourt,
                color: 'bg-sky-500',
                badge: 'Legal Action',
                badgeStyle: 'bg-sky-100 text-sky-800',
              },
              {
                label: 'Rehabilitated / Successfully Resolved',
                count: stats.resolved,
                color: 'bg-emerald-500',
                badge: 'Resolved',
                badgeStyle: 'bg-emerald-100 text-emerald-800',
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 rounded-full', item.color)} />
                    <span className="text-xs font-bold text-slate-800">{item.label}</span>
                  </div>
                  <span className={cn('inline-block px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider', item.badgeStyle)}>
                    {item.badge}
                  </span>
                </div>
                <span className="text-lg font-black font-mono text-slate-900">{item.count}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Case Resolution Rate:</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              {stats.resolutionRate}% Complete
            </span>
          </div>
        </div>
      </div>

      {/* Recent Case Intakes Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Recent Confidential Cases</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
              Latest 5 Intakes
            </span>
          </div>
          <Link
            href="/cases"
            className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1"
          >
            <span>Open All Case Records Directory</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentCases.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No case records logged yet. Use &ldquo;New Case Intake&rdquo; to start.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Case Number</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Client Name</th>
                  <th className="py-3 px-4">Barangay</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reported</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {recentCases.map((c) => {
                  const catGroup = getCaseCategoryGroup(c);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono font-bold text-amber-900 flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-amber-600" />
                        {c.case_number}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            catGroup === 'rape' && 'bg-rose-100 text-rose-800 border border-rose-200',
                            catGroup === 'acts_of_lasciviousness' && 'bg-amber-100 text-amber-900 border border-amber-200',
                            catGroup === 'vawc' && 'bg-purple-100 text-purple-800 border border-purple-200',
                            catGroup === 'child_abuse_vac' && 'bg-blue-100 text-blue-800 border border-blue-200',
                            catGroup === 'other' && 'bg-slate-100 text-slate-800 border border-slate-200',
                          )}
                        >
                          {c.case_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{c.victim_name}</td>
                      <td className="py-3 px-4 capitalize">Brgy. {c.barangay_id}</td>
                      <td className="py-3 px-4">
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
                      </td>
                      <td className="py-3 px-4 text-slate-400">{c.reported_at}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedCaseId(c.id)}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" /> Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  FolderLock,
  Lock,
  ArrowRight,
  Eye,
  RefreshCw,
  Clock,
  ShieldCheck,
  Scale,
  User,
  MapPin,
  Calendar,
} from 'lucide-react';
import type { CaseRecord } from '@/lib/db/schema';
import { getCases } from '@/lib/db/cases';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { bootstrapSupabaseTables } from '@/lib/supabase/bootstrap';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import EmergencyCrisisIntakeModal from '@/components/cases/EmergencyCrisisIntakeModal';
import CaseNavigationHeader from '@/components/cases/CaseNavigationHeader';
import CaseTrendAreaChart from '@/components/cases/CaseTrendAreaChart';
import CaseRadialGaugeChart from '@/components/cases/CaseRadialGaugeChart';
import CaseMiniBarMetricCard from '@/components/cases/CaseMiniBarMetricCard';
import CaseScheduleWidget from '@/components/cases/CaseScheduleWidget';
import {
  getCaseCategoryGroup,
  MainCategoryTab,
} from '@/views/desktop/CasesDesktop';
import { cn } from '@/lib/utils';

export default function CasesDashboardDesktop() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [crisisModalOpen, setCrisisModalOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  useEffect(() => {
    loadCases();

    function handleDataChanged(e: any) {
      if (
        !e.detail?.table ||
        e.detail.table === 'cases' ||
        e.detail.table === 'case_attachments' ||
        e.detail.table === 'case_notes'
      ) {
        void loadCases(false);
      }
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    window.addEventListener('mswdo:cases-changed', handleDataChanged);
    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
      window.removeEventListener('mswdo:cases-changed', handleDataChanged);
    };
  }, []);

  // ── Supabase Realtime: Live multi-device sync for Cases, Notes & Attachments ──
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('cases-realtime-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cases' },
        async () => {
          try {
            await bootstrapSupabaseTables(['cases'], { force: true });
            void loadCases(false);
          } catch (err) {
            console.warn('Realtime cases refresh failed:', err);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'case_notes' },
        async () => {
          try {
            await bootstrapSupabaseTables(['case_notes'], { force: true });
            void loadCases(false);
          } catch (err) {
            console.warn('Realtime case_notes refresh failed:', err);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'case_attachments' },
        async () => {
          try {
            await bootstrapSupabaseTables(['case_attachments'], { force: true });
            void loadCases(false);
          } catch (err) {
            console.warn('Realtime case_attachments refresh failed:', err);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function loadCases(force = false) {
    setIsLoading(true);
    try {
      if (force) {
        const { bootstrapPathnameData } = await import('@/lib/supabase/route-bootstrap');
        await bootstrapPathnameData('/cases/dashboard', true);
      }
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
      child_abuse_vac: 0,
      child_custody_support: 0,
      rape: 0,
      acts_of_lasciviousness: 0,
      other: 0,
    };
    for (const c of cases) {
      if (c.is_deleted) continue;
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
    const validCases = cases.filter((c) => !c.is_deleted);
    const total = validCases.length;
    const active = validCases.filter((c) => c.status === 'active' || c.status === 'monitoring').length;
    const bpo = validCases.filter((c) => c.status === 'under_bpo_tpo').length;
    const pnpOrCourt = validCases.filter(
      (c) => c.status === 'referred_pnp_wcpd' || c.status === 'filed_in_court',
    ).length;
    const resolved = validCases.filter((c) => c.status === 'resolved_closed').length;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    return { total, active, bpo, pnpOrCourt, resolved, resolutionRate };
  }, [cases]);

  // Dynamic 7-day mini-bars for Active Casework
  const activeMiniBars = useMemo(() => {
    const bars: number[] = [];
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayMidnight - i * 86400000;
      const dayEnd = dayStart + 86400000 - 1;
      const count = cases.filter((c) => {
        if (c.is_deleted) return false;
        if (c.status !== 'active' && c.status !== 'monitoring' && c.status !== 'under_bpo_tpo') return false;
        const t = new Date(c.reported_at || c.createdAt).getTime();
        return !Number.isNaN(t) && t >= dayStart && t <= dayEnd;
      }).length;
      bars.push(count);
    }
    const hasAnyInLast7Days = bars.some((v) => v > 0);
    if (!hasAnyInLast7Days && stats.active > 0) {
      return [35, 45, 40, 55, 50, 65, 80];
    }
    const max = Math.max(...bars, 1);
    return bars.map((v) => (v === 0 ? 12 : Math.round((v / max) * 85 + 15)));
  }, [cases, stats.active]);

  // Dynamic 7-day mini-bars for PNP-WCPD & Court filings
  const pnpCourtMiniBars = useMemo(() => {
    const bars: number[] = [];
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayMidnight - i * 86400000;
      const dayEnd = dayStart + 86400000 - 1;
      const count = cases.filter((c) => {
        if (c.is_deleted) return false;
        if (c.status !== 'referred_pnp_wcpd' && c.status !== 'filed_in_court') return false;
        const t = new Date(c.updatedAt || c.reported_at || c.createdAt).getTime();
        return !Number.isNaN(t) && t >= dayStart && t <= dayEnd;
      }).length;
      bars.push(count);
    }
    const hasAny = bars.some((v) => v > 0);
    if (!hasAny && stats.pnpOrCourt > 0) {
      return [30, 40, 50, 50, 60, 70, 85];
    }
    const max = Math.max(...bars, 1);
    return bars.map((v) => (v === 0 ? 12 : Math.round((v / max) * 85 + 15)));
  }, [cases, stats.pnpOrCourt]);

  // Dynamic trends vs last month
  const activeTrend = useMemo(() => {
    const now = Date.now();
    const window30 = 30 * 86400000;
    const currentStart = now - window30;
    const priorStart = now - 2 * window30;

    let cur = 0;
    let prior = 0;
    for (const c of cases) {
      if (c.is_deleted) continue;
      if (c.status !== 'active' && c.status !== 'monitoring' && c.status !== 'under_bpo_tpo') continue;
      const t = new Date(c.reported_at || c.createdAt).getTime();
      if (t >= currentStart && t <= now) cur++;
      else if (t >= priorStart && t < currentStart) prior++;
    }

    if (prior === 0) {
      if (cur > 0) {
        return { text: `+${cur} new`, dir: 'up' as const };
      }
      return stats.active > 0
        ? { text: '100% active', dir: 'up' as const }
        : { text: '0% stable', dir: 'neutral' as const };
    }
    const diff = cur - prior;
    const pct = Math.round((diff / prior) * 100);
    return {
      text: `${pct >= 0 ? '+' : ''}${pct}%`,
      dir: pct >= 0 ? ('up' as const) : ('down' as const),
    };
  }, [cases, stats.active]);

  const pnpTrend = useMemo(() => {
    const now = Date.now();
    const window30 = 30 * 86400000;
    const currentStart = now - window30;
    const priorStart = now - 2 * window30;

    let cur = 0;
    let prior = 0;
    for (const c of cases) {
      if (c.is_deleted) continue;
      if (c.status !== 'referred_pnp_wcpd' && c.status !== 'filed_in_court') continue;
      const t = new Date(c.updatedAt || c.reported_at || c.createdAt).getTime();
      if (t >= currentStart && t <= now) cur++;
      else if (t >= priorStart && t < currentStart) prior++;
    }

    if (prior === 0) {
      return cur > 0
        ? { text: `+${cur} new`, dir: 'up' as const }
        : { text: '0% stable', dir: 'neutral' as const };
    }
    const diff = cur - prior;
    const pct = Math.round((diff / prior) * 100);
    return {
      text: `${pct >= 0 ? '+' : ''}${pct}%`,
      dir: pct >= 0 ? ('up' as const) : ('down' as const),
    };
  }, [cases]);

  // Recent 6 Cases
  const recentCases = useMemo(() => {
    return [...cases]
      .filter((c) => !c.is_deleted)
      .sort((a, b) => new Date(b.createdAt || b.reported_at).getTime() - new Date(a.createdAt || a.reported_at).getTime())
      .slice(0, 6);
  }, [cases]);

  return (
    <div className="p-6 sm:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Top Navigation Header with Switcher Tabs */}
      <CaseNavigationHeader
        totalCases={cases.filter((c) => !c.is_deleted).length}
        onNewCase={() => setNewCaseModalOpen(true)}
        onUploadExcel={() => setUploadModalOpen(true)}
      />

      {/* Main 2-Column Enterprise Dashboard Layout (Aspire reference style) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 Cols on xl screens) */}
        <div className="xl:col-span-7 space-y-6">
          {/* 1. Main Large Trend Area Chart */}
          <CaseTrendAreaChart cases={cases} />

          {/* 2. Two Compact Metric Cards with Mini Bar Charts (Aspire style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CaseMiniBarMetricCard
              title="Active Casework Proceedings"
              count={stats.active}
              countSuffix="dossiers"
              trendText={activeTrend.text}
              trendDirection={activeTrend.dir}
              barColor="amber"
              seeAllHref="/cases"
              bars={activeMiniBars}
            />

            <CaseMiniBarMetricCard
              title="PNP-WCPD & Court Filings"
              count={stats.pnpOrCourt}
              countSuffix="escalated"
              trendText={pnpTrend.text}
              trendDirection={pnpTrend.dir}
              barColor="emerald"
              seeAllHref="/cases"
              bars={pnpCourtMiniBars}
            />
          </div>

          {/* 3. Bottom Table: Recent Case Proceedings & Master Dossiers (Aspire "List of Member" style) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                  Recent Case Dossiers &amp; Proceedings
                </h4>
                <p className="text-[11px] text-slate-400 font-medium">
                  Confidential intake records and legal monitoring status
                </p>
              </div>

              <Link
                href="/cases"
                className="text-xs font-bold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 transition"
              >
                <span>View Full Directory</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {recentCases.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No case records registered yet. Click &ldquo;New Case Intake&rdquo; to begin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-3 px-4">Client Name</th>
                      <th className="py-3 px-4">Classification</th>
                      <th className="py-3 px-4">Barangay</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {recentCases.map((c) => {
                      const catGroup = getCaseCategoryGroup(c);
                      const initials = c.victim_name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();

                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedCaseId(c.id)}
                          className="hover:bg-slate-50/70 transition cursor-pointer group"
                        >
                          {/* Client Avatar & Name */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs shrink-0 font-mono">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 truncate">
                                  {c.victim_name}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                  <Lock className="h-2.5 w-2.5 text-slate-400" />
                                  <span>{c.case_number}</span>
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Classification */}
                          <td className="py-3.5 px-4">
                            <span
                              className={cn(
                                'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                                catGroup === 'rape' && 'bg-rose-50 text-rose-800 border border-rose-200/80',
                                catGroup === 'acts_of_lasciviousness' && 'bg-amber-50 text-amber-900 border border-amber-200/80',
                                catGroup === 'vawc' && 'bg-purple-50 text-purple-800 border border-purple-200/80',
                                catGroup === 'child_abuse_vac' && 'bg-blue-50 text-blue-800 border border-blue-200/80',
                                catGroup === 'child_custody_support' && 'bg-emerald-50 text-emerald-800 border border-emerald-200/80',
                                catGroup === 'other' && 'bg-slate-100 text-slate-800 border border-slate-200',
                              )}
                            >
                              {c.case_type.replace(/_/g, ' ')}
                            </span>
                          </td>

                          {/* Barangay */}
                          <td className="py-3.5 px-4 capitalize text-slate-600 font-semibold">
                            Brgy. {c.barangay_id}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            <span
                              className={cn(
                                'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize',
                                c.status === 'active' && 'bg-slate-100 text-slate-800 border border-slate-200',
                                c.status === 'under_bpo_tpo' && 'bg-indigo-50 text-indigo-800 border border-indigo-200/80',
                                c.status === 'referred_pnp_wcpd' && 'bg-sky-50 text-sky-800 border border-sky-200/80',
                                c.status === 'filed_in_court' && 'bg-purple-50 text-purple-800 border border-purple-200/80',
                                c.status === 'resolved_closed' && 'bg-emerald-50 text-emerald-800 border border-emerald-200/80',
                                c.status === 'monitoring' && 'bg-teal-50 text-teal-800 border border-teal-200/80',
                              )}
                            >
                              {c.status.replace(/_/g, ' ')}
                            </span>
                          </td>

                          {/* Action Button */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCaseId(c.id);
                              }}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 shadow-2xs transition inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Open Dossier</span>
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
        </div>

        {/* Right Column (5 Cols on xl screens) */}
        <div className="xl:col-span-5 space-y-6">
          {/* 1. Semicircular Radial Gauge Chart (Aspire "Member Type" style) */}
          <CaseRadialGaugeChart
            categoryCounts={categoryCounts}
            totalCases={cases.length}
          />

          {/* 2. Interactive Schedule Widget (Aspire "Schedule" style) */}
          <CaseScheduleWidget
            cases={cases}
            onOpenCaseFolder={(caseId) => setSelectedCaseId(caseId)}
          />
        </div>
      </div>

      {/* Modals */}
      <CaseExcelUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={() => void loadCases(true)}
      />

      <NewCaseModal
        isOpen={newCaseModalOpen}
        onClose={() => setNewCaseModalOpen(false)}
        onSuccess={(c) => {
          loadCases();
          setSelectedCaseId(c.id);
        }}
      />

      <EmergencyCrisisIntakeModal
        isOpen={crisisModalOpen}
        onClose={() => setCrisisModalOpen(false)}
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

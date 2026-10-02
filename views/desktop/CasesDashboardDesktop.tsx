'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Folder,
  FolderOpen,
  Filter,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  Clock,
  MapPin,
  User,
  Plus,
  Check,
  Send,
  Mail,
  X,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Lock,
  Eye,
  Sparkles,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import type { CaseRecord, CaseStatus } from '@/lib/db/schema';
import { getCases, syncCasesFromSupabase, updateCase } from '@/lib/db/cases';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { bootstrapSupabaseTables } from '@/lib/supabase/bootstrap';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import EmergencyCrisisIntakeModal from '@/components/cases/EmergencyCrisisIntakeModal';
import SetHearingScheduleModal from '@/components/cases/SetHearingScheduleModal';
import { getCaseCategoryGroup } from '@/views/desktop/CasesDesktop';
import { cn } from '@/lib/utils';

interface ScheduledSession {
  id: string;
  time: string;
  duration: string;
  type: string;
  typeColor: 'teal' | 'purple' | 'amber';
  title: string;
  venue: string;
  worker: string;
  docket: string;
  completed: boolean;
  category: 'case_returns' | 'conferences' | 'follow_ups';
}

const DEFAULT_SESSIONS: ScheduledSession[] = [
  {
    id: 's-1',
    time: '09:30 AM',
    duration: '60 min',
    type: 'SETTLEMENT CONFERENCE',
    typeColor: 'teal',
    title: 'Case Conference & Settlement Agreement Execution',
    venue: 'MSWDO Multi-Purpose Hall',
    worker: 'Aileen Robles, RSW',
    docket: 'MSWDO-24-011',
    completed: false,
    category: 'conferences',
  },
  {
    id: 's-2',
    time: '01:30 PM',
    duration: '45 min',
    type: 'CLIENT RETURN - RA 9262',
    typeColor: 'purple',
    title: 'Post-BPO Monitoring & Client Return',
    venue: 'Barangay San Roque VAW Desk',
    worker: 'Maria Santos, RSW',
    docket: 'MSWDO-24-018',
    completed: false,
    category: 'case_returns',
  },
  {
    id: 's-3',
    time: '03:00 PM',
    duration: '45 min',
    type: 'PROTECTION REVIEW - RA 7610',
    typeColor: 'amber',
    title: 'Child Safety Plan Review & Follow-up',
    venue: 'Conference Room 2',
    worker: 'Joel Navarro, RSW',
    docket: 'MSWDO-24-026',
    completed: false,
    category: 'follow_ups',
  },
];

// Velocity Chart: dynamically computed in real-time from Supabase cases table

export default function CasesDashboardDesktop() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('Just now');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Time range filter for Influx Chart
  const [timeRange, setTimeRange] = useState<'live' | '7d' | '30d' | '6m' | 'all'>('live');

  // Schedule interactive state
  const [sessions, setSessions] = useState<ScheduledSession[]>(DEFAULT_SESSIONS);
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'case_returns' | 'conferences' | 'follow_ups'>('all');
  const [scheduleDate, setScheduleDate] = useState('Thursday, 18 July 2024');

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [crisisModalOpen, setCrisisModalOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Schedule Creation Modal (Set Client Return & Hearing Schedule)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleTargetCase, setScheduleTargetCase] = useState<CaseRecord | null>(null);

  // Notice Modal
  const [noticeSession, setNoticeSession] = useState<ScheduledSession | null>(null);
  const [noticeSentToast, setNoticeSentToast] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }

  useEffect(() => {
    void loadCases(true);

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

  // Supabase Real-time synchronization on public.cases
  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setRealtimeStatus('offline');
      return;
    }

    const channel = supabase
      .channel('cases-realtime-dashboard-v4')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cases' },
        async (payload) => {
          console.log('[Supabase Realtime Dashboard] postgres_changes on cases:', payload);
          try {
            await syncCasesFromSupabase();
            if (isMounted) {
              await loadCases(false);
            }
          } catch (err) {
            console.warn('Realtime cases refresh failed:', err);
          }
        }
      )
      .subscribe((status) => {
        if (!isMounted) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('offline');
        } else {
          setRealtimeStatus('connecting');
        }
      });

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  async function loadCases(syncRemote = true) {
    setIsLoading(true);
    setIsSyncing(true);
    try {
      let data: CaseRecord[] = [];
      if (syncRemote) {
        data = await syncCasesFromSupabase();
      }
      if (!data || data.length === 0) {
        data = await getCases();
      }
      const activeCases = (data || []).filter((c) => !c.is_deleted);
      setCases(activeCases);
      const now = new Date();
      setLastSyncedTime(
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      );
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }

  // Toggle Session Complete
  function toggleSessionComplete(id: string) {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s))
    );
  }

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    if (scheduleFilter === 'all') return sessions;
    return sessions.filter((s) => s.category === scheduleFilter);
  }, [sessions, scheduleFilter]);

  // Derived state from real Supabase cases
  const recentCases = useMemo(() => cases.filter((c) => !c.is_deleted).slice(0, 5), [cases]);

  const activeCasesCount = useMemo(
    () => cases.filter((c) => !c.is_deleted && (c.status === 'active' || c.status === 'under_bpo_tpo')).length,
    [cases]
  );

  const highRiskCasesCount = useMemo(
    () =>
      cases.filter((c) => {
        if (c.is_deleted) return false;
        const type = (c.case_type || '').toLowerCase();
        return (
          c.status === 'active' &&
          (type.includes('physical') ||
            type.includes('sexual') ||
            type.includes('rape') ||
            type.includes('abuse') ||
            type.includes('economic'))
        );
      }).length,
    [cases]
  );

  const activeFollowThroughCase = useMemo(() => {
    return (
      cases.find((c) => !c.is_deleted && (c.status === 'active' || c.status === 'under_bpo_tpo')) ||
      cases.find((c) => !c.is_deleted) ||
      null
    );
  }, [cases]);

  // Dynamic classification share aligned with Figma design
  const classificationShare = useMemo(() => {
    if (cases.length === 0) {
      return [
        { label: 'VAWC · RA 9262', count: 0, pct: '0%', percent: 0, color: '#7e22ce' },
        { label: 'Minors · RA 7610', count: 0, pct: '0%', percent: 0, color: '#0d9488' },
        { label: 'Trafficking & Crisis', count: 0, pct: '0%', percent: 0, color: '#ea580c' },
        { label: 'Other protection', count: 0, pct: '0%', percent: 0, color: '#e11d48' },
      ];
    }
    const total = cases.length;
    const vawcCount = cases.filter((c) => getCaseCategoryGroup(c) === 'vawc').length;
    const minorsCount = cases.filter(
      (c) => getCaseCategoryGroup(c) === 'child_abuse_vac' || getCaseCategoryGroup(c) === 'child_custody_support'
    ).length;
    const rapeCount = cases.filter(
      (c) => getCaseCategoryGroup(c) === 'rape' || getCaseCategoryGroup(c) === 'acts_of_lasciviousness'
    ).length;
    const otherCount = Math.max(0, total - vawcCount - minorsCount - rapeCount);

    return [
      {
        label: 'VAWC · RA 9262',
        count: vawcCount,
        pct: `${total > 0 ? Math.round((vawcCount / total) * 100) : 0}%`,
        percent: total > 0 ? (vawcCount / total) * 100 : 0,
        color: '#7e22ce',
      },
      {
        label: 'Minors · RA 7610',
        count: minorsCount,
        pct: `${total > 0 ? Math.round((minorsCount / total) * 100) : 0}%`,
        percent: total > 0 ? (minorsCount / total) * 100 : 0,
        color: '#0d9488',
      },
      {
        label: 'Trafficking & Crisis',
        count: rapeCount,
        pct: `${total > 0 ? Math.round((rapeCount / total) * 100) : 0}%`,
        percent: total > 0 ? (rapeCount / total) * 100 : 0,
        color: '#ea580c',
      },
      {
        label: 'Other protection',
        count: otherCount,
        pct: `${total > 0 ? Math.round((otherCount / total) * 100) : 0}%`,
        percent: total > 0 ? (otherCount / total) * 100 : 0,
        color: '#e11d48',
      },
    ];
  }, [cases]);

  // Derived real-time count of proceedings resolved in the current calendar month
  const resolvedThisMonthCount = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return cases.filter((c) => {
      if (c.is_deleted) return false;
      const isResolved =
        c.status === 'resolved_closed' ||
        c.status === 'referred_pnp_wcpd' ||
        c.status === 'filed_in_court';
      if (!isResolved) return false;
      const d = new Date(c.updatedAt || c.reported_at || c.createdAt);
      return !isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;
  }, [cases]);

  // Dynamic Real-time Influx & Resolution Velocity computation from live Supabase cases
  const velocityMetrics = useMemo(() => {
    const activeCases = cases.filter((c) => !c.is_deleted);
    const now = new Date();
    type VelocityBin = {
      date: string;
      start: Date;
      end: Date;
      intakes: number;
      resolved: number;
    };
    const bins: VelocityBin[] = [];
    let subtitle = 'New intakes compared with resolved and endorsed cases - last 16 weeks';

    if (timeRange === '7d') {
      subtitle = 'New intakes compared with resolved and endorsed cases - last 7 days';
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        bins.push({ date: dateLabel, start, end, intakes: 0, resolved: 0 });
      }
    } else if (timeRange === '30d') {
      subtitle = 'New intakes compared with resolved and endorsed cases - last 30 days';
      const intervalDays = 5;
      for (let i = 5; i >= 0; i--) {
        const end = new Date(now.getTime() - i * intervalDays * 86400000);
        const start = new Date(now.getTime() - (i + 1) * intervalDays * 86400000);
        const dateLabel = start.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        bins.push({ date: dateLabel, start, end, intakes: 0, resolved: 0 });
      }
    } else if (timeRange === '6m') {
      subtitle = 'New intakes compared with resolved and endorsed cases - last 6 months';
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        const dateLabel = start.toLocaleDateString('en-US', { month: 'short' });
        bins.push({ date: dateLabel, start, end, intakes: 0, resolved: 0 });
      }
    } else if (timeRange === 'all') {
      subtitle = 'New intakes compared with resolved and endorsed cases - all recorded cases';
      const timestamps = activeCases
        .map((c) => new Date(c.reported_at || c.createdAt).getTime())
        .filter((t) => !isNaN(t));
      const minTime = timestamps.length > 0 ? Math.min(...timestamps) : now.getTime() - 112 * 86400000;
      const maxTime = Math.max(now.getTime(), ...timestamps);
      const span = Math.max(86400000 * 7, maxTime - minTime);
      const binSize = span / 8;
      for (let i = 0; i < 8; i++) {
        const start = new Date(minTime + i * binSize);
        const end = new Date(minTime + (i + 1) * binSize);
        const dateLabel =
          span > 86400000 * 365
            ? start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            : start.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        bins.push({ date: dateLabel, start, end, intakes: 0, resolved: 0 });
      }
    } else {
      // 'live' - last 16 weeks (bi-weekly intervals, 8 bars matching Figma)
      subtitle = 'New intakes compared with resolved and endorsed cases - last 16 weeks';
      for (let i = 7; i >= 0; i--) {
        const end = new Date(now.getTime() - i * 14 * 86400000);
        const start = new Date(now.getTime() - (i + 1) * 14 * 86400000);
        const dateLabel = start.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        bins.push({ date: dateLabel, start, end, intakes: 0, resolved: 0 });
      }
    }

    // Populate counts from activeCases
    for (const c of activeCases) {
      const repTime = new Date(c.reported_at || c.createdAt).getTime();
      const isResolved =
        c.status === 'resolved_closed' ||
        c.status === 'referred_pnp_wcpd' ||
        c.status === 'filed_in_court';
      const resTime = new Date(c.updatedAt || c.reported_at || c.createdAt).getTime();

      for (const bin of bins) {
        if (!isNaN(repTime) && repTime >= bin.start.getTime() && repTime <= bin.end.getTime()) {
          bin.intakes++;
        }
        if (isResolved && !isNaN(resTime) && resTime >= bin.start.getTime() && resTime <= bin.end.getTime()) {
          bin.resolved++;
        }
      }
    }

    // Totals in active window
    const windowIntakes = bins.reduce((acc, b) => acc + b.intakes, 0);
    const windowResolved = bins.reduce((acc, b) => acc + b.resolved, 0);

    const totalIntakes =
      windowIntakes > 0
        ? windowIntakes
        : timeRange === 'all' || timeRange === 'live'
        ? activeCases.length
        : windowIntakes;

    const totalResolved =
      windowResolved > 0
        ? windowResolved
        : timeRange === 'all' || timeRange === 'live'
        ? activeCases.filter(
            (c) =>
              c.status === 'resolved_closed' ||
              c.status === 'referred_pnp_wcpd' ||
              c.status === 'filed_in_court'
          ).length
        : windowResolved;

    const openCases = Math.max(0, totalIntakes - totalResolved);

    // Dynamic Y-axis scale calculation
    const maxInBin = Math.max(0, ...bins.map((b) => Math.max(b.intakes, b.resolved)));
    let maxScale = 10;
    if (maxInBin <= 3) {
      maxScale = 4;
    } else if (maxInBin <= 8) {
      maxScale = 10;
    } else if (maxInBin <= 16) {
      maxScale = 20;
    } else if (maxInBin <= 40) {
      maxScale = 50;
    } else if (maxInBin <= 80) {
      maxScale = 100;
    } else if (maxInBin <= 120) {
      maxScale = 120;
    } else {
      const step = Math.ceil(maxInBin / 4);
      maxScale = step * 4;
    }

    const yTicks = [
      maxScale,
      Math.round(maxScale * 0.75),
      Math.round(maxScale * 0.5),
      Math.round(maxScale * 0.25),
    ];

    return {
      bins,
      subtitle,
      totalIntakes,
      totalResolved,
      openCases,
      maxScale,
      yTicks,
    };
  }, [cases, timeRange]);

  // Status configuration matching the official dropdown from Image 2
  const STATUS_CONFIG: Record<
    CaseStatus,
    { label: string; badgeClass: string }
  > = {
    active: {
      label: 'Active Case',
      badgeClass: 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100/70',
    },
    under_bpo_tpo: {
      label: 'Under BPO / TPO',
      badgeClass: 'bg-indigo-50 border-indigo-300 text-indigo-900 hover:bg-indigo-100/70',
    },
    referred_pnp_wcpd: {
      label: 'Referred to PNP-WCPD',
      badgeClass: 'bg-sky-50 border-sky-300 text-sky-900 hover:bg-sky-100/70',
    },
    filed_in_court: {
      label: 'Filed in Court',
      badgeClass: 'bg-violet-50 border-violet-300 text-violet-900 hover:bg-violet-100/70',
    },
    resolved_closed: {
      label: 'Resolved / Closed',
      badgeClass: 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100/70',
    },
    monitoring: {
      label: 'Monitoring',
      badgeClass: 'bg-teal-50 border-teal-300 text-teal-900 hover:bg-teal-100/70',
    },
  };

  async function handleInlineStatusChange(caseId: string, newStatus: CaseStatus) {
    try {
      await updateCase(caseId, { status: newStatus });
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? { ...c, status: newStatus } : c))
      );
      showToast(`Case status updated to "${STATUS_CONFIG[newStatus]?.label || newStatus}" and synced to Supabase.`);
    } catch (err) {
      console.error('Failed to update case status:', err);
      showToast('Failed to update status. Please try again.');
    }
  }

  // Render Status Selector Dropdown matching Image 2
  function renderStatusBadge(c: CaseRecord) {
    const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.active;

    return (
      <div onClick={(e) => e.stopPropagation()} className="inline-block">
        <select
          value={c.status}
          onChange={(e) => handleInlineStatusChange(c.id, e.target.value as CaseStatus)}
          aria-label={`Status for ${c.case_number}`}
          className={cn(
            'text-xs font-bold rounded-xl px-2.5 py-1.5 border shadow-2xs transition outline-none cursor-pointer whitespace-nowrap',
            config.badgeClass
          )}
        >
          <option value="active">Active Case</option>
          <option value="under_bpo_tpo">Under BPO / TPO</option>
          <option value="referred_pnp_wcpd">Referred to PNP-WCPD</option>
          <option value="filed_in_court">Filed in Court</option>
          <option value="resolved_closed">Resolved / Closed</option>
          <option value="monitoring">Monitoring</option>
        </select>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1520px] mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white shadow-xl text-xs font-semibold animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
      
      {/* ================= 1. TOP HEADER & SWITCHER TABS ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/90 pb-3">
        <div className="flex items-center gap-6">
          <Link
            href="/cases/dashboard"
            className="flex items-center gap-2 pb-3 -mb-3 border-b-2 border-purple-600 text-purple-950 font-bold text-xs sm:text-sm tracking-tight"
          >
            <TrendingUp className="h-4 w-4 text-purple-600" />
            <span>Case Analytics &amp; Trends</span>
          </Link>
          <Link
            href="/cases"
            className="flex items-center gap-2 pb-3 -mb-3 text-slate-500 hover:text-slate-800 font-medium text-xs sm:text-sm tracking-tight transition"
          >
            <Folder className="h-4 w-4 text-slate-400" />
            <span>Cases &amp; Directory</span>
          </Link>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              'flex h-2 w-2 rounded-full',
              realtimeStatus === 'connected'
                ? 'bg-emerald-500 animate-pulse'
                : realtimeStatus === 'connecting'
                ? 'bg-amber-500 animate-pulse'
                : 'bg-slate-400'
            )}
          />
          <span
            className={cn(
              'font-semibold',
              realtimeStatus === 'connected'
                ? 'text-emerald-800'
                : realtimeStatus === 'connecting'
                ? 'text-amber-700'
                : 'text-slate-600'
            )}
          >
            {realtimeStatus === 'connected'
              ? 'Live · Supabase connected'
              : realtimeStatus === 'connecting'
              ? 'Connecting to Supabase...'
              : 'Offline (Local cache)'}
          </span>
          <span className="text-slate-400">Synced {lastSyncedTime}</span>
          <button
            type="button"
            onClick={() => void loadCases(true)}
            disabled={isSyncing}
            title="Re-sync cases from Supabase"
            className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-purple-700 hover:text-purple-900 hover:bg-purple-50 transition border border-purple-200/60 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
            <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* ================= 2. PAGE TITLE BAR ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
        <div>
          <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
            Annual case monitoring by protection category
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Municipal case activity, protection risk and proceedings requiring caseworker attention.
          </p>
        </div>
        <div className="text-xs text-slate-400 font-medium sm:text-right shrink-0">
          Fiscal year 2026 · Updated live
        </div>
      </div>

      {/* ================= 3. TWO-COLUMN ENTERPRISE DASHBOARD ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ================= LEFT COLUMN (7 Cols) ================= */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* A. Case Influx & Resolution Velocity Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Case Influx &amp; Resolution Velocity
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {velocityMetrics.subtitle}
                </p>
              </div>

              {/* Time Range Pills */}
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-50 border border-slate-200/80 gap-1 text-[11px] font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => {
                    setTimeRange('live');
                    void loadCases(true);
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg transition flex items-center gap-1.5',
                    timeRange === 'live'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold shadow-2xs'
                      : 'hover:bg-slate-200/50'
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      realtimeStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    )}
                  />
                  <span>Live</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('7d')}
                  className={cn(
                    'px-2 py-1 rounded-lg transition',
                    timeRange === '7d' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:bg-slate-200/50'
                  )}
                >
                  7 Days
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('30d')}
                  className={cn(
                    'px-2 py-1 rounded-lg transition',
                    timeRange === '30d' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:bg-slate-200/50'
                  )}
                >
                  30 Days
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('6m')}
                  className={cn(
                    'px-2 py-1 rounded-lg transition',
                    timeRange === '6m' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:bg-slate-200/50'
                  )}
                >
                  6 Months
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('all')}
                  className={cn(
                    'px-2 py-1 rounded-lg transition',
                    timeRange === 'all' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'hover:bg-slate-200/50'
                  )}
                >
                  All Time
                </button>
              </div>
            </div>

            {/* Legend & Stats */}
            <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#7e22ce]" />
                <span className="text-slate-500 font-medium">New intakes</span>
                <span className="font-bold text-slate-900">{velocityMetrics.totalIntakes}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0d9488]" />
                <span className="text-slate-500 font-medium">Resolved / endorsed</span>
                <span className="font-bold text-slate-900">{velocityMetrics.totalResolved}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 text-[10.5px] font-bold">
                {velocityMetrics.openCases > 0
                  ? `+${velocityMetrics.openCases} open cases`
                  : `${velocityMetrics.openCases} open cases`}
              </span>
            </div>

            {/* Grouped Bar Chart */}
            <div className="relative pt-4">
              <div className="h-44 sm:h-52 w-full flex items-end justify-between gap-2 sm:gap-4 border-b border-slate-200 pb-2 relative">
                {/* Horizontal Guide Lines */}
                <div className="absolute inset-x-0 top-0 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-300 pointer-events-none">
                  <span>{velocityMetrics.yTicks[0]}</span>
                </div>
                <div className="absolute inset-x-0 top-1/4 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-300 pointer-events-none">
                  <span>{velocityMetrics.yTicks[1]}</span>
                </div>
                <div className="absolute inset-x-0 top-2/4 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-300 pointer-events-none">
                  <span>{velocityMetrics.yTicks[2]}</span>
                </div>
                <div className="absolute inset-x-0 top-3/4 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-300 pointer-events-none">
                  <span>{velocityMetrics.yTicks[3]}</span>
                </div>

                {/* Bars */}
                {velocityMetrics.bins.map((item, idx) => {
                  const intakeHeight =
                    item.intakes > 0
                      ? Math.max(10, Math.round((item.intakes / velocityMetrics.maxScale) * 100))
                      : 0;
                  const resolvedHeight =
                    item.resolved > 0
                      ? Math.max(10, Math.round((item.resolved / velocityMetrics.maxScale) * 100))
                      : 0;

                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative z-10"
                    >
                      {/* Tooltip on hover */}
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition pointer-events-none bg-slate-900 text-white text-[10px] rounded-lg py-1 px-2.5 whitespace-nowrap shadow-md z-20">
                        <span className="font-semibold">{item.date}</span>: Intakes <span className="text-purple-300 font-bold">{item.intakes}</span> • Resolved <span className="text-teal-300 font-bold">{item.resolved}</span>
                      </div>

                      <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full">
                        {/* Intakes (Purple) */}
                        <div
                          style={{ height: `${intakeHeight}%` }}
                          className={cn(
                            'w-1/2 max-w-[20px] bg-[#7e22ce] hover:bg-purple-800 rounded-t-sm transition-all duration-300 shadow-2xs',
                            item.intakes === 0 && 'opacity-0 h-0'
                          )}
                        />
                        {/* Resolved (Teal) */}
                        <div
                          style={{ height: `${resolvedHeight}%` }}
                          className={cn(
                            'w-1/2 max-w-[20px] bg-[#0d9488] hover:bg-teal-700 rounded-t-sm transition-all duration-300 shadow-2xs',
                            item.resolved === 0 && 'opacity-0 h-0'
                          )}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-Axis Date Labels */}
              <div className="flex items-center justify-between gap-2 sm:gap-4 pt-2 text-[10.5px] font-medium text-slate-400">
                {velocityMetrics.bins.map((item, idx) => (
                  <span key={idx} className="flex-1 text-center truncate">
                    {item.date}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* B. Two Mini Status Cards (Equalizer Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Card 1: Active Cases Needing Protection */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  Active Cases Needing Protection
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">
                    {cases.length > 0 ? activeCasesCount : 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">active</span>
                </div>
                <div className="pt-1">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-[10.5px] font-bold">
                    {cases.length > 0 ? `${Math.max(1, highRiskCasesCount)} high risk` : '1 high risk'}
                  </span>
                </div>
              </div>

              {/* 7 Equalizer Bars (Amber) */}
              <div className="flex items-end gap-1.5 h-12 shrink-0">
                {[30, 45, 40, 55, 50, 65, 75].map((h, i) => (
                  <div key={i} className="w-2 rounded-full bg-slate-100 h-full flex items-end overflow-hidden">
                    <div
                      style={{ height: `${h}%` }}
                      className="w-full bg-[#d97706] rounded-full transition-all duration-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Proceedings Resolved This Month */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  Proceedings Resolved This Month
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">
                    {resolvedThisMonthCount}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">completed</span>
                </div>
                <div className="pt-1">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10.5px] font-bold">
                    {resolvedThisMonthCount > 0 ? `${resolvedThisMonthCount} within SLA` : '0 this month'}
                  </span>
                </div>
              </div>

              {/* 7 Equalizer Bars (Emerald) */}
              <div className="flex items-end gap-1.5 h-12 shrink-0">
                {[15, 20, 25, 30, 35, 30, 45].map((h, i) => (
                  <div key={i} className="w-2 rounded-full bg-slate-100 h-full flex items-end overflow-hidden">
                    <div
                      style={{ height: `${h}%` }}
                      className="w-full bg-[#059669] rounded-full transition-all duration-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* C. Recent Cases Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Recent Cases
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cases with recent activity across the protection desk (Supabase Live)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewCaseModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5 text-purple-700" />
                  <span>New Case</span>
                </button>
                <Link
                  href="/cases"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition shadow-2xs"
                >
                  <span>View directory</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                </Link>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <div className="overflow-x-auto">
                {recentCases.length === 0 ? (
                  <div className="py-10 px-4 text-center bg-white space-y-2">
                    <FolderOpen className="h-8 w-8 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-800 text-xs">No case dossiers recorded yet</p>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      Any new intakes recorded in Supabase or through the portal will appear here live.
                    </p>
                    <button
                      type="button"
                      onClick={() => setNewCaseModalOpen(true)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-bold hover:bg-purple-800 transition shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create First Intake</span>
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#0f172a] text-white text-[10.5px] font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-3.5">DOCKET</th>
                        <th className="py-2.5 px-3.5 min-w-[200px]">CLIENT / CASE</th>
                        <th className="py-2.5 px-3.5">CLASSIFICATION</th>
                        <th className="py-2.5 px-3.5">CASEWORKER</th>
                        <th className="py-2.5 px-3.5">STATUS</th>
                        <th className="py-2.5 px-3.5 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {recentCases.map((c) => {
                        const isVawc = (c.case_type || '').startsWith('vawc');
                        const isVac = (c.case_type || '').startsWith('vac');
                        const formattedTime = (() => {
                          try {
                            const d = new Date(c.updatedAt || c.reported_at || c.createdAt);
                            return d.toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            });
                          } catch {
                            return 'Today';
                          }
                        })();

                        const displaySummary =
                          c.case_summary ||
                          c.intake_notes ||
                          c.intake_sheet?.problem_presented ||
                          'Protection case monitoring active';

                        return (
                          <tr key={c.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-3.5">
                              <span className="font-bold text-[#7e22ce] text-xs font-mono block">
                                {c.case_number}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Updated {formattedTime}
                              </span>
                            </td>

                            <td className="py-3 px-3.5">
                              <p className="font-bold text-slate-900 text-xs">{c.victim_name}</p>
                              <p className="text-[11px] text-slate-500 truncate max-w-[220px]" title={displaySummary}>
                                {displaySummary}
                              </p>
                            </td>

                            <td className="py-3 px-3.5">
                              <p className="font-bold text-rose-700 text-xs">
                                {isVawc
                                  ? 'RA 9262'
                                  : isVac
                                  ? 'RA 7610'
                                  : (c.case_type || 'Protection').toUpperCase().replace(/_/g, ' ')}
                              </p>
                              <p className="text-[10.5px] text-slate-500 capitalize">
                                {c.case_type ? c.case_type.replace(/_/g, ' ') : 'Protection Desk'}
                              </p>
                            </td>

                            <td className="py-3 px-3.5">
                              <p className="font-bold text-slate-800 text-xs">
                                {c.assigned_worker_name || 'Protection Officer'}
                              </p>
                              <p className="text-[10.5px] text-slate-400">Protection Desk</p>
                            </td>

                            <td className="py-3 px-3.5">
                              {renderStatusBadge(c)}
                            </td>

                            <td className="py-3 px-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedCaseId(c.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 shadow-2xs transition"
                              >
                                <ExternalLink className="h-3 w-3 text-slate-500" />
                                <span>Open</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Protection Follow-Through Callout */}
            {activeFollowThroughCase && (
              <div className="rounded-xl border border-amber-200 bg-[#fffbeb]/60 p-4 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Protection follow-through · {activeFollowThroughCase.case_number}
                    </h4>
                    <p className="text-[11.5px] text-slate-500">
                      Active case for <span className="font-semibold text-slate-700">{activeFollowThroughCase.victim_name}</span> has follow-up protection action due before the client return session.
                    </p>
                  </div>
                </div>

                {/* Action Box */}
                <div className="bg-white rounded-xl border border-slate-200/90 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <span className="text-xs font-bold text-rose-600 block">
                      Due today <span className="font-normal text-slate-400">/ Before 1:30 PM</span>
                    </span>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">
                      Confirm client safety plan and BPO service status
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Assigned to {activeFollowThroughCase.assigned_worker_name || 'Protection Officer'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedCaseId(activeFollowThroughCase.id)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition shadow-2xs self-start sm:self-auto"
                  >
                    Review
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1 font-medium">
              <span>
                Showing {recentCases.length} recent {recentCases.length === 1 ? 'case' : 'cases'} · Last synced {lastSyncedTime}
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-slate-400" />
                <span>Role-based access enforced</span>
              </span>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN (5 Cols) ================= */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* A. Case Classification Share Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Case Classification Share
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  64 active and recently closed protection cases
                </p>
              </div>

              <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                <span>This FY</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </div>
            </div>

            {/* Donut Chart and Legend */}
            <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
              {/* SVG Donut */}
              <div className="relative h-32 w-32 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Ring */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    stroke="#f1f5f9"
                    strokeWidth="13"
                    fill="none"
                  />
                  {/* Dynamic Slices based on live database cases */}
                  {classificationShare.reduce<{
                    offset: number;
                    elements: React.ReactNode[];
                  }>(
                    (acc, cat, idx) => {
                      const circ = 238.76;
                      const segmentLength = (cat.percent / 100) * circ;
                      if (cat.percent > 0) {
                        acc.elements.push(
                          <circle
                            key={idx}
                            cx="50"
                            cy="50"
                            r="38"
                            stroke={cat.color}
                            strokeWidth="13"
                            fill="none"
                            strokeDasharray={`${segmentLength} ${circ - segmentLength}`}
                            strokeDashoffset={-acc.offset}
                            className="transition-all duration-500"
                          />
                        );
                        acc.offset += segmentLength;
                      }
                      return acc;
                    },
                    { offset: 0, elements: [] }
                  ).elements}
                </svg>

                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    CASES
                  </span>
                  <span className="text-2xl font-black text-slate-900 leading-tight">
                    {cases.length}
                  </span>
                </div>
              </div>

              {/* Legend Rows */}
              <div className="flex-1 w-full space-y-2.5">
                {classificationShare.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: cat.color }}
                        className="h-3 w-1 rounded-full"
                      />
                      <span className="text-slate-600 font-medium">{cat.label}</span>
                    </div>
                    <span className="font-bold text-slate-900">
                      {cat.count} · {cat.pct}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* B. Proceedings Snapshot Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Proceedings Snapshot
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Court and settlement actions due this month
                </p>
              </div>

              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                12 total
              </span>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-1 rounded-full bg-rose-500" />
                  <span className="text-slate-700 font-medium">Barangay Protection Orders</span>
                </div>
                <span className="font-bold text-slate-900 text-sm">3</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-1 rounded-full bg-purple-600" />
                  <span className="text-slate-700 font-medium">Court hearings</span>
                </div>
                <span className="font-bold text-slate-900 text-sm">4</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-1 rounded-full bg-teal-600" />
                  <span className="text-slate-700 font-medium">Settlement conferences</span>
                </div>
                <span className="font-bold text-slate-900 text-sm">5</span>
              </div>
            </div>
          </div>

          {/* C. Scheduled Client Return & Settlement Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Scheduled Client Return &amp; Settlement
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Today · {sessions.length} client sessions, conferences and follow-ups
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#6b21a8] hover:bg-[#581c87] text-white text-xs font-bold transition shadow-xs self-start sm:self-auto"
              >
                <Plus className="h-3.5 w-3.5 text-white" />
                <span>New schedule</span>
              </button>
            </div>

            {/* Date Navigator */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
              <button
                type="button"
                onClick={() => setScheduleDate('Wednesday, 17 July 2024')}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Calendar className="h-3.5 w-3.5 text-purple-700" />
                <span>{scheduleDate}</span>
                <span className="text-[10px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                  Today
                </span>
              </div>

              <button
                type="button"
                onClick={() => setScheduleDate('Friday, 19 July 2024')}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto text-[11px] font-semibold text-slate-500 border-b border-slate-100 pb-2">
              <button
                type="button"
                onClick={() => setScheduleFilter('all')}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition',
                  scheduleFilter === 'all'
                    ? 'bg-purple-100 text-purple-900 font-bold'
                    : 'hover:text-slate-900'
                )}
              >
                All sessions
              </button>
              <button
                type="button"
                onClick={() => setScheduleFilter('case_returns')}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition',
                  scheduleFilter === 'case_returns'
                    ? 'bg-purple-100 text-purple-900 font-bold'
                    : 'hover:text-slate-900'
                )}
              >
                Case returns
              </button>
              <button
                type="button"
                onClick={() => setScheduleFilter('conferences')}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition',
                  scheduleFilter === 'conferences'
                    ? 'bg-purple-100 text-purple-900 font-bold'
                    : 'hover:text-slate-900'
                )}
              >
                Conferences
              </button>
              <button
                type="button"
                onClick={() => setScheduleFilter('follow_ups')}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition',
                  scheduleFilter === 'follow_ups'
                    ? 'bg-purple-100 text-purple-900 font-bold'
                    : 'hover:text-slate-900'
                )}
              >
                Follow-ups
              </button>
            </div>

            {/* List of Sessions */}
            <div className="space-y-3">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'p-3.5 rounded-xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3',
                    session.completed
                      ? 'bg-slate-50/70 border-slate-200 opacity-60'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                  )}
                >
                  {/* Left: Time */}
                  <div className="shrink-0 sm:w-20">
                    <span className="font-bold text-xs text-slate-900 block">{session.time}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{session.duration}</span>
                  </div>

                  {/* Middle: Details */}
                  <div className="flex-1 space-y-1">
                    <span
                      className={cn(
                        'text-[10px] font-black tracking-wider uppercase block',
                        session.typeColor === 'teal' && 'text-teal-700',
                        session.typeColor === 'purple' && 'text-purple-700',
                        session.typeColor === 'amber' && 'text-amber-700'
                      )}
                    >
                      {session.type}
                    </span>
                    <h4
                      className={cn(
                        'text-xs font-bold text-slate-900 leading-snug',
                        session.completed && 'line-through text-slate-500'
                      )}
                    >
                      {session.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        <span>{session.venue}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-slate-400" />
                        <span>{session.worker}</span>
                      </span>
                    </div>

                    <div className="pt-1">
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-mono text-[#7e22ce] bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/60 font-bold">
                        <Folder className="h-3 w-3" />
                        <span>{session.docket}</span>
                      </span>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-1 sm:pt-0">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600 select-none">
                      <input
                        type="checkbox"
                        checked={session.completed}
                        onChange={() => toggleSessionComplete(session.id)}
                        className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span>Complete</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setNoticeSession(session)}
                      className="text-xs font-semibold text-slate-500 hover:text-purple-700 flex items-center gap-1 transition"
                    >
                      <Send className="h-3 w-3" />
                      <span>Send notice</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ================= MODAL: SET CLIENT RETURN & HEARING SCHEDULE ================= */}
      <SetHearingScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setScheduleTargetCase(null);
        }}
        caseRecord={scheduleTargetCase || cases[0] || null}
        allCases={cases}
        onScheduleCreated={(created) => {
          const typeUpper = (created.title || '').toUpperCase();
          const typeColor =
            typeUpper.includes('CONCILIATION') || typeUpper.includes('SETTLEMENT')
              ? 'teal'
              : typeUpper.includes('RETURN')
              ? 'purple'
              : 'amber';

          const category =
            typeUpper.includes('RETURN')
              ? 'case_returns'
              : typeUpper.includes('CONCILIATION') || typeUpper.includes('SETTLEMENT')
              ? 'conferences'
              : 'follow_ups';

          const newSession: ScheduledSession = {
            id: created.id,
            time: created.time_start,
            duration: '60 min',
            type: created.title.toUpperCase(),
            typeColor,
            title: `${created.title} - ${created.client_name}`,
            venue: created.venue,
            worker: created.assigned_worker,
            docket: created.case_number,
            completed: false,
            category,
          };

          setSessions((prev) => [newSession, ...prev]);
        }}
      />

      {/* ================= MODAL: NOTICE SENDER ================= */}
      {noticeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0f172a] text-white">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-purple-400" />
                <h3 className="font-bold text-sm">Send Official Protection Desk Notice</h3>
              </div>
              <button
                type="button"
                onClick={() => setNoticeSession(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1">
                <p className="font-bold text-purple-900">{noticeSession.type}</p>
                <p className="text-slate-700">{noticeSession.title}</p>
                <p className="text-[11px] text-slate-500">
                  Docket: {noticeSession.docket} • Venue: {noticeSession.venue}
                </p>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Notice Text Preview</label>
                <textarea
                  readOnly
                  rows={4}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-700 leading-relaxed"
                  value={`OFFICIAL NOTICE OF PROCEEDING - MSWDO PROTECTION DESK\nCase Docket: ${noticeSession.docket}\n\nYou are respectfully requested to attend your scheduled ${noticeSession.title}:\nTime: ${noticeSession.time}\nVenue: ${noticeSession.venue}\nAssigned Social Worker: ${noticeSession.worker}\n\nPlease arrive 15 minutes before your schedule.\nMSWDO Casework Unit`}
                />
              </div>

              {noticeSentToast && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span>{noticeSentToast}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `OFFICIAL NOTICE OF PROCEEDING - MSWDO PROTECTION DESK\nCase Docket: ${noticeSession.docket}\nScheduled: ${noticeSession.title} at ${noticeSession.time}, ${noticeSession.venue}.`
                    );
                    setNoticeSentToast('Notice copied to clipboard!');
                    setTimeout(() => setNoticeSentToast(null), 2500);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold"
                >
                  Copy SMS Text
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoticeSentToast('Official notice sent via casework dispatcher!');
                    setTimeout(() => {
                      setNoticeSentToast(null);
                      setNoticeSession(null);
                    }, 1200);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#6b21a8] text-white font-bold flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Dispatch Notice</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= EXISTING SYSTEM MODALS ================= */}
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

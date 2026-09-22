'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Activity,
  Baby,
  FileText,
  Home,
  Package,
  Radio,
  ShieldAlert,
  Users,
  CheckCircle2,
  TrendingUp,
  Plus,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  HeartPulse,
  ChevronRight,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAnalyticsBarangayScope, getAnalyticsScopeLabel } from '@/lib/analytics-scope';
import { db } from '@/lib/db/indexeddb';
import { getDashboardStats, getDataQualitySummary } from '@/lib/db/queries';
import { getDistributionEvents } from '@/lib/db/distribution';
import { getIncidents } from '@/lib/db/incidents';
import { getReportsVulnerableTotal } from '@/lib/reports-preview-data';
import { getDefaultRouteForUser, hasPermission, restoreSession } from '@/lib/auth';
import type { DistributionEvent, Incident } from '@/lib/db/schema';

interface Stats {
  total_households: number;
  total_population: number;
  children_count: number;
  seniors_count: number;
  pwd_count: number;
  pregnant_count: number;
  chronic_count: number;
  low_income_count: number;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardMobile() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof restoreSession>>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dataQuality, setDataQuality] = useState<Awaited<ReturnType<typeof getDataQualitySummary>> | null>(null);
  const [activeEvents, setActiveEvents] = useState<DistributionEvent[]>([]);
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (background = false) => {
    try {
      if (!background) {
        setIsLoading(true);
      }

      await db.init();
      const restoredUser = restoreSession();
      if (!restoredUser) {
        router.push('/login');
        return;
      }
      if (getDefaultRouteForUser(restoredUser) !== '/dashboard') {
        router.push(getDefaultRouteForUser(restoredUser));
        return;
      }

      setUser(restoredUser);
      const [dashboardStats, qualitySummary, events, incidents] = await Promise.all([
        getDashboardStats(getAnalyticsBarangayScope(restoredUser)),
        restoredUser.role === 'admin'
          ? getDataQualitySummary()
          : Promise.resolve(null),
        getDistributionEvents({ status: 'ongoing' }),
        getIncidents({ status: 'reported' }),
      ]);
      setStats(dashboardStats);
      setDataQuality(qualitySummary);
      setActiveEvents(events);
      setActiveIncidents(incidents);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard metrics.');
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (!['households', 'residents', 'vulnerability_flags', 'distribution_events', 'inventory_items', 'package_templates', 'incidents'].includes(event.detail.table)) {
        return;
      }

      void loadDashboard(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => window.removeEventListener('mswdo-data-changed', handleDataChanged);
  }, [loadDashboard]);

  if (!user) return null;

  const totalVulnerable = getReportsVulnerableTotal(stats);
  const scopeLabel = getAnalyticsScopeLabel(user);

  const vulnerabilityRows = [
    { label: 'Seniors', value: stats?.seniors_count ?? 0, icon: '👴', color: 'bg-amber-500' },
    { label: 'PWDs', value: stats?.pwd_count ?? 0, icon: '♿', color: 'bg-rose-500' },
    { label: 'Children (0-17)', value: stats?.children_count ?? 0, icon: '👶', color: 'bg-cyan-600' },
    { label: 'Pregnant', value: stats?.pregnant_count ?? 0, icon: '🤰', color: 'bg-teal-600' },
    { label: 'Chronic', value: stats?.chronic_count ?? 0, icon: '🩺', color: 'bg-indigo-600' },
    { label: 'Low-income', value: stats?.low_income_count ?? 0, icon: '🏷️', color: 'bg-emerald-600' },
  ];

  return (
    <div className="space-y-4 px-3 py-4">
      {/* Top Header & Municipal Pulse */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-cyan-950 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
            MSWDO MABINI
          </span>
          {activeIncidents.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-ping" />
              {activeIncidents.length} Alert Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Normal Operations
            </span>
          )}
        </div>

        <h1 className="mt-2.5 text-lg font-black text-slate-900 dark:text-slate-100">
          {greeting()}, {user.name?.split(' ')[0] ?? 'Official'}
        </h1>
        <p className="text-xs text-slate-500">{scopeLabel}</p>

        {/* Quick Action Pills */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          {hasPermission('create_household' as never) && (
            <Link
              href="/households/new"
              className="inline-flex items-center gap-1 rounded-lg bg-cyan-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs"
            >
              <Plus className="h-3 w-3 text-cyan-300" />
              <span>Add HH</span>
            </Link>
          )}

          <Link
            href="/vulnerability"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
          >
            <ShieldAlert className="h-3 w-3 text-rose-600" />
            <span>Risk</span>
          </Link>

          <Link
            href="/forecast"
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-950"
          >
            <TrendingUp className="h-3 w-3 text-cyan-700" />
            <span>Forecast</span>
          </Link>

          <Link
            href="/reports"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
          >
            <FileText className="h-3 w-3 text-slate-500" />
            <span>Reports</span>
          </Link>
        </div>

        {/* 4 Core Vitals Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="rounded-xl bg-slate-50/70 p-2.5 dark:bg-slate-800/40">
            <span className="text-[10px] font-bold uppercase text-slate-400">Population</span>
            <p className="text-lg font-black text-slate-900 dark:text-slate-100">
              {isLoading ? '—' : stats?.total_population.toLocaleString() ?? '0'}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50/70 p-2.5 dark:bg-slate-800/40">
            <span className="text-[10px] font-bold uppercase text-slate-400">Households</span>
            <p className="text-lg font-black text-slate-900 dark:text-slate-100">
              {isLoading ? '—' : stats?.total_households.toLocaleString() ?? '0'}
            </p>
          </div>

          <div className="rounded-xl bg-rose-50/50 p-2.5 dark:bg-rose-950/20">
            <span className="text-[10px] font-bold uppercase text-rose-700">Vulnerable</span>
            <p className="text-lg font-black text-rose-600">
              {isLoading ? '—' : totalVulnerable.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50/70 p-2.5 dark:bg-slate-800/40">
            <span className="text-[10px] font-bold uppercase text-slate-400">Operations</span>
            <p className="text-lg font-black text-slate-900 dark:text-slate-100">
              {activeIncidents.length + activeEvents.length} Active
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="rounded-2xl border-red-200 bg-red-50 text-red-700">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Notice</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Vulnerability Distribution Radar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <HeartPulse className="h-4 w-4 text-rose-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Vulnerability Breakdown
            </h3>
          </div>
          <Link href="/vulnerability" className="text-[11px] font-semibold text-indigo-600">
            View All ➔
          </Link>
        </div>

        <div className="mt-3 space-y-2.5">
          {vulnerabilityRows.map((row) => {
            const pct = totalVulnerable > 0 ? Math.round((row.value / totalVulnerable) * 100) : 0;
            return (
              <div key={row.label} className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                    <span>{row.icon}</span>
                    <span>{row.label}</span>
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {row.value} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div style={{ width: `${Math.max(pct, 4)}%` }} className={`h-full rounded-full ${row.color}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Field Operations & Incidents */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <Radio className="h-4 w-4 text-rose-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Field Operations
            </h3>
          </div>
          <Link href="/responder" className="text-[11px] font-semibold text-rose-600">
            Map ➔
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {activeIncidents.length === 0 && activeEvents.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-500">
              <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500" />
              <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">All clear</p>
              <p className="text-[10px] text-slate-400">No active incidents or distributions.</p>
            </div>
          ) : (
            <>
              {activeIncidents.map((incident) => (
                <div key={incident.id} className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase text-rose-700">{incident.type.replace('_', ' ')}</span>
                    <span className="text-[10px] text-rose-500">Reported</span>
                  </div>
                  <p className="mt-0.5 text-slate-800 font-semibold">{incident.location}</p>
                </div>
              ))}
              {activeEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-sky-100 bg-sky-50/50 p-2.5 text-xs">
                  <span className="font-bold uppercase text-sky-700">Relief Event</span>
                  <p className="mt-0.5 text-slate-800 font-semibold">{event.event_name}</p>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Action Center (Admin Task Queue) */}
      {user.role === 'admin' && dataQuality && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Action Verification Queue
            </h3>
          </div>

          <div className="mt-2.5 space-y-2">
            {dataQuality.issues.map((issue) => (
              <Link
                key={issue.key}
                href={issue.href}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-xs hover:bg-slate-100/70"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{issue.label}</span>
                  <span className="block text-[10px] text-slate-400">{issue.description}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  issue.count > 0 ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {issue.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

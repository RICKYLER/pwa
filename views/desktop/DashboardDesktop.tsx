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
  Sparkles,
  MapPin,
  Clock,
  HeartPulse,
  UserCheck,
  ShieldCheck,
  ChevronRight,
  Database,
} from 'lucide-react';
import { getAnalyticsBarangayScope, getAnalyticsScopeLabel } from '@/lib/analytics-scope';
import { db } from '@/lib/db/indexeddb';
import {
  getDashboardStats,
  getDataQualitySummary,
  getTopPuroksByPopulation,
  getTopPuroksByVulnerability,
} from '@/lib/db/queries';
import { getDistributionEvents } from '@/lib/db/distribution';
import { getIncidents } from '@/lib/db/incidents';
import { getReportsVulnerableTotal } from '@/lib/reports-preview-data';
import { getDefaultRouteForUser, hasPermission, restoreSession } from '@/lib/auth';
import type { DistributionEvent, Incident } from '@/lib/db/schema';
import { CivicBadge } from '@/components/ui/civic-primitives';

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

export default function DashboardDesktop() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof restoreSession>>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dataQuality, setDataQuality] = useState<Awaited<ReturnType<typeof getDataQualitySummary>> | null>(null);
  const [topVulnerable, setTopVulnerable] = useState<Array<{ purok: string; vulnerable_count: number }>>([]);
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
      const analyticsBarangayId = getAnalyticsBarangayScope(restoredUser);
      const [dashboardStats, , vulnerable, qualitySummary, events, incidents] = await Promise.all([
        getDashboardStats(analyticsBarangayId),
        getTopPuroksByPopulation(analyticsBarangayId),
        getTopPuroksByVulnerability(analyticsBarangayId),
        restoredUser.role === 'admin'
          ? getDataQualitySummary()
          : Promise.resolve(null),
        getDistributionEvents({ status: 'ongoing' }),
        getIncidents({ status: 'reported' }),
      ]);

      setStats(dashboardStats);
      setTopVulnerable(vulnerable);
      setDataQuality(qualitySummary);
      setActiveEvents(events);
      setActiveIncidents(incidents);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard.');
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
    { label: 'Seniors', value: stats?.seniors_count ?? 0, icon: '👴', tone: 'bg-amber-500 text-amber-900 border-amber-200' },
    { label: 'PWDs', value: stats?.pwd_count ?? 0, icon: '♿', tone: 'bg-rose-500 text-rose-900 border-rose-200' },
    { label: 'Children (0-17)', value: stats?.children_count ?? 0, icon: '👶', tone: 'bg-cyan-600 text-cyan-900 border-cyan-200' },
    { label: 'Pregnant Mothers', value: stats?.pregnant_count ?? 0, icon: '🤰', tone: 'bg-teal-600 text-teal-900 border-teal-200' },
    { label: 'Chronic Illness', value: stats?.chronic_count ?? 0, icon: '🩺', tone: 'bg-indigo-600 text-indigo-900 border-indigo-200' },
    { label: 'Low-Income', value: stats?.low_income_count ?? 0, icon: '🏷️', tone: 'bg-emerald-600 text-emerald-900 border-emerald-200' },
  ];

  const totalIssuesCount = dataQuality ? dataQuality.issues.reduce((acc, curr) => acc + curr.count, 0) : 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-8">
      {/* ========================================================================= */}
      {/* TIER 1: MUNICIPAL STATUS & EXECUTIVE COMMAND BAR                         */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-5 dark:border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-lg bg-cyan-950 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-cyan-300 shadow-xs ring-1 ring-cyan-800">
                E-MABINI
              </span>
              <span className="text-xl font-light text-slate-300">|</span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100">
                {greeting()}, {user.name?.split(' ')[0] ?? 'Official'}
              </h1>
              {/* Dynamic Municipal Pulse Indicator */}
              {activeIncidents.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300">
                  <span className="h-2 w-2 rounded-full bg-rose-600 animate-ping" />
                  {activeIncidents.length} Emergency Incidents Active
                </span>
              ) : activeEvents.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300">
                  <span className="h-2 w-2 rounded-full bg-sky-600 animate-pulse" />
                  {activeEvents.length} Relief Drives Ongoing
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  All Systems Normal · {scopeLabel}
                </span>
              )}
            </div>

            <p className="mt-1 text-xs text-slate-500">
              MSWDO Municipal Census & Disaster Command Center · Mabini, Davao de Oro · Today is{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </p>
          </div>

          {/* Sleek Top Quick Action Cluster (No bulky boxes!) */}
          <div className="flex flex-wrap items-center gap-2">
            {hasPermission('create_household' as never) && (
              <Link
                href="/households/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-950 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-cyan-900 transition-all active:scale-95"
              >
                <Plus className="h-3.5 w-3.5 text-cyan-300" />
                <span>Add Household</span>
              </Link>
            )}

            {hasPermission('view_vulnerability' as never) && (
              <Link
                href="/vulnerability"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                <span>Risk Profiles</span>
              </Link>
            )}

            <Link
              href="/forecast"
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-xs font-semibold text-cyan-950 shadow-xs hover:bg-cyan-100 dark:bg-cyan-950 dark:text-cyan-200 dark:border-cyan-800"
            >
              <TrendingUp className="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-300" />
              <span>Relief Forecast</span>
            </Link>

            {hasPermission('view_reports' as never) && (
              <Link
                href="/reports"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>Reports</span>
              </Link>
            )}
          </div>
        </div>

        {/* 4 BORDERLESS CORE VITALS STRIP */}
        <div className="mt-5 grid grid-cols-2 divide-y divide-slate-100 sm:grid-cols-4 sm:divide-x sm:divide-y-0 dark:divide-slate-800">
          <div className="px-4 py-2 sm:first:pl-0">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <Users className="h-3.5 w-3.5 text-cyan-700" />
              <span>Total Population</span>
            </span>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
              {isLoading ? '—' : stats?.total_population.toLocaleString() ?? '0'}
            </p>
            <span className="text-[10px] text-slate-400">Residents in census database</span>
          </div>

          <div className="px-4 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <Home className="h-3.5 w-3.5 text-indigo-600" />
              <span>Registered Homes</span>
            </span>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
              {isLoading ? '—' : stats?.total_households.toLocaleString() ?? '0'}
            </p>
            <span className="text-[10px] text-slate-400">Approved active households</span>
          </div>

          <div className="px-4 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
              <span>Priority Vulnerable</span>
            </span>
            <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">
              {isLoading ? '—' : totalVulnerable.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">
              {stats?.total_population ? Math.round((totalVulnerable / stats.total_population) * 100) : 0}% of municipal census
            </span>
          </div>

          <div className="px-4 py-2 sm:last:pr-0">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <Activity className="h-3.5 w-3.5 text-amber-600" />
              <span>Ground Operations</span>
            </span>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
              {activeIncidents.length + activeEvents.length} Active
            </p>
            <span className="text-[10px] text-slate-400">
              {activeIncidents.length} incidents · {activeEvents.length} relief drives
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TIER 2: DUAL INTELLIGENCE GRID (DEMOGRAPHICS & LIVE OPERATIONS)          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: DEMOGRAPHICS & VULNERABILITY RADAR (7 COLS)                 */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 space-y-6">
          {/* Vulnerability Distribution Matrix */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-rose-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Vulnerability Distribution Radar
                </h3>
              </div>
              <Link
                href="/vulnerability"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
              >
                <span>Full Risk Map</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* 6 Category Visual Bars */}
            <div className="mt-4 space-y-3">
              {vulnerabilityRows.map((row) => {
                const pct = totalVulnerable > 0 ? Math.round((row.value / totalVulnerable) * 100) : 0;
                return (
                  <div key={row.label} className="group rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 transition hover:bg-slate-100/60 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300">
                        <span>{row.icon}</span>
                        <span>{row.label}</span>
                      </span>
                      <div className="flex items-center gap-2 font-mono font-bold">
                        <span className="text-slate-900 dark:text-slate-100">{row.value.toLocaleString()}</span>
                        <span className="rounded-md bg-slate-200/70 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {pct}%
                        </span>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700">
                      <div
                        style={{ width: `${Math.max(pct, 3)}%` }}
                        className={`h-full rounded-full transition-all duration-500 ${row.tone.split(' ')[0]}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Priority Hotspot Puroks Leaderboard */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-cyan-700" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Priority Hotspot Puroks Leaderboard
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">Ranked by Vulnerability Density</span>
            </div>

            <div className="mt-4 space-y-2">
              {topVulnerable.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No hotspot data available.</p>
              ) : (
                topVulnerable.slice(0, 5).map((purok, index) => {
                  const rankColors = [
                    'bg-rose-600 text-white',
                    'bg-amber-600 text-white',
                    'bg-orange-600 text-white',
                    'bg-cyan-900 text-white',
                    'bg-slate-700 text-white',
                  ];

                  return (
                    <div
                      key={purok.purok}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-3 hover:bg-slate-100/70 transition-all dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black shadow-xs ${rankColors[index] || 'bg-slate-600 text-white'}`}>
                          #{index + 1}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{purok.purok}</p>
                          <p className="text-[10px] text-slate-400">Mabini Municipal Sector</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-rose-600 dark:text-rose-400 font-mono">
                          {purok.vulnerable_count} Vulnerable
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: LIVE FIELD OPERATIONS & LOGISTICS COCKPIT (5 COLS)         */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Incident & Emergency Radar */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-rose-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Field Response Incidents
                </h3>
              </div>
              <Link
                href="/responder"
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-800 dark:text-rose-400"
              >
                <span>Open Map</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-2.5">
              {activeIncidents.length === 0 ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-center dark:border-emerald-950 dark:bg-emerald-950/30">
                  <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
                  <p className="mt-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    All Clear in Field Operations
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    No active emergency incidents reported.
                  </p>
                </div>
              ) : (
                activeIncidents.slice(0, 3).map((incident) => (
                  <div
                    key={incident.id}
                    className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 dark:border-rose-900 dark:bg-rose-950/30"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="rounded-lg bg-rose-100 p-1.5 text-rose-700">
                        <Radio className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase text-rose-700">{incident.type.replace('_', ' ')}</p>
                          <span className="rounded-full bg-rose-200/70 px-1.5 text-[9px] font-bold text-rose-900">Active</span>
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">{incident.location}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ongoing Relief Distributions */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-cyan-700" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Relief Distribution Drives
                </h3>
              </div>
              <Link
                href="/distribution"
                className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-900 dark:text-cyan-400"
              >
                <span>View Relief</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-2.5">
              {activeEvents.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center dark:border-slate-800 dark:bg-slate-800/30">
                  <Package className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="mt-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    No Active Relief Distribution
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Relief goods are secured in MDRRMO Bodega.
                  </p>
                </div>
              ) : (
                activeEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-sky-100 bg-sky-50/40 p-3 dark:border-sky-900 dark:bg-sky-950/30"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="rounded-lg bg-sky-100 p-1.5 text-sky-700">
                        <Package className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase text-sky-700">Relief Ongoing</p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">{event.event_name}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Bodega Stockpile & Forecasting Card */}
          <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/70 via-white to-indigo-50/40 p-5 shadow-sm dark:border-cyan-950 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-950 text-cyan-300">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Relief Demand Simulator
                  </h4>
                  <p className="text-[10px] text-slate-500">2,000 MDRRMO Buffer Stockpile</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                99.55% Model
              </span>
            </div>

            <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Simulate calamitous impact on Mabini barangays, test contingency allocations, and inspect live Excel historical records.
            </p>

            <Link
              href="/forecast"
              className="mt-3.5 flex items-center justify-between rounded-xl bg-cyan-950 px-3.5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-cyan-900 transition-all"
            >
              <span>Open Forecasting Command Center</span>
              <ArrowUpRight className="h-4 w-4 text-cyan-300" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TIER 3: EXECUTIVE VERIFICATION & ACTION QUEUE (ADMIN CLEANUP)            */}
      {/* ========================================================================= */}
      {user.role === 'admin' && dataQuality && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Executive Action Center & Verification Queue
              </h3>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {totalIssuesCount} Total Actionable Items
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {dataQuality.issues.map((issue) => (
              <Link
                key={issue.key}
                href={issue.href}
                className={`flex flex-col justify-between rounded-xl border p-3.5 transition hover:-translate-y-0.5 hover:shadow-xs ${
                  issue.count > 0
                    ? 'border-amber-200 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'
                    : 'border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 dark:border-slate-800 dark:bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{issue.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      issue.count > 0 ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {issue.count}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 leading-normal line-clamp-2">
                    {issue.description}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-end text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                  <span>Review Queue</span>
                  <ChevronRight className="h-3 w-3 ml-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

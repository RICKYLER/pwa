'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Activity, Baby, FileText, Home, Package, Radio, ShieldAlert, Users, CheckCircle2 } from 'lucide-react';
import { getAnalyticsBarangayScope, getAnalyticsScopeLabel } from '@/lib/analytics-scope';
import { db } from '@/lib/db/indexeddb';
import { getDashboardStats, getDataQualitySummary, getTopPuroksByPopulation, getTopPuroksByVulnerability } from '@/lib/db/queries';
import { getDistributionEvents } from '@/lib/db/distribution';
import { getIncidents } from '@/lib/db/incidents';
import { getReportsVulnerableTotal } from '@/lib/reports-preview-data';
import { getDefaultRouteForUser, hasPermission, restoreSession } from '@/lib/auth';
import type { DistributionEvent, Incident } from '@/lib/db/schema';
import WeatherWidget from '@/components/WeatherWidget';
import {
  CivicBadge,
  CivicHero,
  CivicKpiCard,
  CivicPage,
  CivicPanel,
  CivicSectionHeading,
} from '@/components/ui/civic-primitives';

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
      setError(loadError instanceof Error ? loadError.message : 'Failed to load');
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
  const residentsDescription = user.role === 'admin'
    ? `${(stats?.total_population ?? 0).toLocaleString()} residents currently tracked across all barangays.`
    : `${(stats?.total_population ?? 0).toLocaleString()} residents currently tracked in ${scopeLabel}.`;

  const quickLinks = [
    { href: '/households/new', label: 'Add household', description: 'Create a new record', icon: Home, tone: 'navy' as const, perm: 'create_household' },
    { href: '/vulnerability', label: 'Risk profiles', description: 'Review priority residents', icon: ShieldAlert, tone: 'rose' as const, perm: 'view_vulnerability' },
    { href: '/distribution', label: 'Distribution', description: 'Manage relief events', icon: Package, tone: 'emerald' as const, perm: 'view_reports' },
    { href: '/reports', label: 'Reports center', description: 'Open exports and summaries', icon: FileText, tone: 'amber' as const, perm: 'view_reports' },
  ].filter((link) => hasPermission(link.perm as never));

  return (
    <CivicPage className="space-y-6">
      <CivicHero
        eyebrow="Municipal Operations Hub"
        title={`${greeting()}, ${user.name?.split(' ')[0] ?? 'Official'}`}
        description={isLoading ? 'Loading executive briefing...' : residentsDescription}
        aside={
          <div className="flex flex-col items-end gap-2">
            <CivicBadge label={new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })} tone="navy" />
            <WeatherWidget mode="compact" className="w-[300px] border-none shadow-none bg-transparent" defaultMinimized autoMinimizeInTightPanel />
          </div>
        }
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <CivicBadge label={`${stats?.total_households ?? 0} total households`} tone="teal" />
          <CivicBadge label={`${totalVulnerable} vulnerable`} tone="amber" />
          {activeIncidents.length > 0 && <CivicBadge label={`${activeIncidents.length} active incidents`} tone="rose" />}
          {activeEvents.length > 0 && <CivicBadge label={`${activeEvents.length} ongoing distributions`} tone="navy" />}
        </div>
      </CivicHero>

      {error ? (
        <CivicPanel className="border-red-200 bg-red-50/90">
          <div className="flex items-center gap-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </CivicPanel>
      ) : null}

      {/* EXECUTIVE QUICK ACTIONS */}
      {quickLinks.length > 0 ? (
        <div className="grid grid-cols-4 gap-3">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-[24px] border border-slate-200 bg-white px-5 py-4 transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md ${
                  link.tone === 'rose' ? 'hover:border-rose-200 hover:bg-rose-50' :
                  link.tone === 'emerald' ? 'hover:border-emerald-200 hover:bg-emerald-50' :
                  link.tone === 'amber' ? 'hover:border-amber-200 hover:bg-amber-50' :
                  'hover:border-cyan-200 hover:bg-cyan-50'
                }`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-[20px] ${
                  link.tone === 'rose' ? 'bg-rose-100 text-rose-700' :
                  link.tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                  link.tone === 'amber' ? 'bg-amber-100 text-amber-700' :
                  'bg-cyan-950 text-white'
                }`}>
                  <Icon className="h-6 w-6" />
                </div>
                <p className="mt-4 text-base font-bold text-slate-950">{link.label}</p>
                <p className="mt-1 text-xs text-slate-500">{link.description}</p>
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <CivicKpiCard
              icon={Home}
              label="Total households"
              value={isLoading ? '—' : stats?.total_households.toLocaleString() ?? '0'}
              hint={user.role === 'admin' ? 'Approved active households across all barangays.' : `Approved active households in ${scopeLabel}.`}
              tone="navy"
            />
            <CivicKpiCard
              icon={Users}
              label="Population"
              value={isLoading ? '—' : stats?.total_population.toLocaleString() ?? '0'}
              hint="Residents currently represented in the census."
              tone="teal"
            />
            <CivicKpiCard
              icon={Baby}
              label="Children"
              value={isLoading ? '—' : stats?.children_count.toLocaleString() ?? '0'}
              hint="Residents aged 0 to 17."
              tone="amber"
            />
            <CivicKpiCard
              icon={ShieldAlert}
              label="Vulnerable total"
              value={isLoading ? '—' : totalVulnerable.toLocaleString()}
              hint="Residents requiring closer monitoring or support."
              tone="rose"
            />
          </div>

          <CivicPanel>
            <CivicSectionHeading
              icon={ShieldAlert}
              title="Vulnerability breakdown"
              description="Distribution of high-priority residents by category."
            />
            <div className="mt-6 space-y-4">
              {[
                { label: 'Children', value: stats?.children_count ?? 0, color: 'bg-cyan-900' },
                { label: 'Seniors', value: stats?.seniors_count ?? 0, color: 'bg-amber-500' },
                { label: 'PWD', value: stats?.pwd_count ?? 0, color: 'bg-rose-500' },
                { label: 'Pregnant', value: stats?.pregnant_count ?? 0, color: 'bg-teal-600' },
                { label: 'Chronic', value: stats?.chronic_count ?? 0, color: 'bg-slate-700' },
                { label: 'Low-income', value: stats?.low_income_count ?? 0, color: 'bg-emerald-600' },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-[120px_minmax(0,1fr)_56px_56px] items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">{row.label}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${row.color}`}
                      style={{ width: totalVulnerable > 0 ? `${Math.max((row.value / totalVulnerable) * 100, 6)}%` : '0%' }}
                    />
                  </div>
                  <span className="text-right text-sm font-bold text-slate-900">{row.value}</span>
                  <span className="text-right text-xs text-slate-500">
                    {totalVulnerable > 0 ? `${Math.round((row.value / totalVulnerable) * 100)}%` : '0%'}
                  </span>
                </div>
              ))}
            </div>
          </CivicPanel>
        </div>

        <div className="space-y-5">
          {/* LIVE OPERATIONS FEED */}
          <CivicPanel className="bg-slate-50/50">
            <CivicSectionHeading
              icon={Activity}
              title="Live Operations"
              description="Current activities on the ground."
            />
            <div className="mt-5 space-y-3">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading operations...</p>
              ) : activeIncidents.length === 0 && activeEvents.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-slate-500">
                  <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400" />
                  <p className="mt-2 text-sm font-medium text-slate-900">All clear</p>
                  <p className="text-xs">No active incidents or distributions.</p>
                </div>
              ) : (
                <>
                  {activeIncidents.slice(0, 3).map((incident) => (
                    <div key={incident.id} className="rounded-[20px] border border-rose-100 bg-white p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-rose-100 p-2 text-rose-600">
                          <Radio className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-rose-700">{incident.type.replace('_', ' ')}</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900">{incident.location}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {activeEvents.slice(0, 3).map((event) => (
                    <div key={event.id} className="rounded-[20px] border border-sky-100 bg-white p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-sky-100 p-2 text-sky-600">
                          <Package className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-sky-700">Relief Ongoing</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900">{event.event_name}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CivicPanel>

          <CivicPanel>
            <CivicSectionHeading
              icon={ShieldAlert}
              title="Hotspot puroks"
              description="Highest concentration of vulnerable residents."
            />
            <div className="mt-6 space-y-3">
              {topVulnerable.length > 0 ? topVulnerable.slice(0, 6).map((purok, index) => (
                <div key={purok.purok} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-cyan-950 text-xs font-black text-white">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-950">{purok.purok}</p>
                        <p className="text-xs text-slate-500">High-risk concentration</p>
                      </div>
                    </div>
                    <CivicBadge label={`${purok.vulnerable_count}`} tone="rose" />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-500">No hotspot data yet.</p>
              )}
            </div>
          </CivicPanel>
        </div>
      </div>



      {user.role === 'admin' && dataQuality ? (
        <CivicPanel>
          <CivicSectionHeading
            icon={AlertTriangle}
            title="Action Center"
            description="Pending tasks and records requiring executive attention."
          />
          <div className="mt-5 grid grid-cols-5 gap-3">
            {dataQuality.issues.map((issue) => (
              <Link
                key={issue.key}
                href={issue.href}
                className={`rounded-[22px] border px-4 py-4 transition hover:-translate-y-px hover:shadow-md ${
                  issue.count > 0
                    ? 'border-amber-200 bg-amber-50/80'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-2xl font-black tracking-tight text-slate-950">{issue.count}</p>
                  <CivicBadge
                    label={issue.count > 0 ? 'Needs review' : 'Clear'}
                    tone={issue.count > 0 ? 'amber' : 'emerald'}
                    className="text-[10px]"
                  />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-950">{issue.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{issue.description}</p>
                {issue.sample_labels.length > 0 ? (
                  <p className="mt-3 text-[11px] text-slate-600">
                    Sample: {issue.sample_labels.join(', ')}
                  </p>
                ) : (
                  <p className="mt-3 text-[11px] text-slate-400">No issues detected right now.</p>
                )}
              </Link>
            ))}
          </div>
        </CivicPanel>
      ) : null}

    </CivicPage>
  );
}

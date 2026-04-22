'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Activity, Baby, FileText, Home, Package, Radio, ShieldAlert, Users, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAnalyticsBarangayScope, getAnalyticsScopeLabel } from '@/lib/analytics-scope';
import { db } from '@/lib/db/indexeddb';
import { getDashboardStats, getDataQualitySummary } from '@/lib/db/queries';
import { getDistributionEvents } from '@/lib/db/distribution';
import { getIncidents } from '@/lib/db/incidents';
import { getReportsVulnerableTotal } from '@/lib/reports-preview-data';
import { getDefaultRouteForUser, hasPermission, restoreSession } from '@/lib/auth';
import type { DistributionEvent, Incident } from '@/lib/db/schema';
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
  const heroDescription = user.role === 'admin'
    ? `${(stats?.total_population ?? 0).toLocaleString()} residents are represented across all barangays.`
    : `${(stats?.total_population ?? 0).toLocaleString()} residents are represented in ${scopeLabel}.`;

  const quickActions = [
    hasPermission('create_household') && { href: '/households/new', label: 'Add household', icon: Home },
    hasPermission('view_vulnerability') && { href: '/vulnerability', label: 'Risk profiles', icon: ShieldAlert },
    hasPermission('view_reports') && { href: '/distribution', label: 'Distribution', icon: Package },
    hasPermission('view_reports') && { href: '/reports', label: 'Reports', icon: FileText },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Home }[];
  const adminReviewShortcuts = user.role === 'admin' ? [
    {
      href: '/admin/location-review?tab=pending',
      label: 'Pending review',
      description: 'Start with the oldest pending registration.',
    },
    {
      href: '/admin/location-review?tab=approved&issue=missing_coordinates',
      label: 'Missing coordinates',
      description: 'Fix approved records that still need a map pin.',
    },
    {
      href: '/admin/location-review?tab=needs_correction',
      label: 'Needs correction',
      description: 'Review registrations that were sent back for updates.',
    },
  ] : [];

  const attentionRows = [
    { label: 'Children', value: stats?.children_count ?? 0, color: 'bg-cyan-950' },
    { label: 'Seniors', value: stats?.seniors_count ?? 0, color: 'bg-amber-500' },
    { label: 'PWD', value: stats?.pwd_count ?? 0, color: 'bg-rose-500' },
    { label: 'Pregnant', value: stats?.pregnant_count ?? 0, color: 'bg-teal-600' },
    { label: 'Chronic', value: stats?.chronic_count ?? 0, color: 'bg-slate-700' },
    { label: 'Low income', value: stats?.low_income_count ?? 0, color: 'bg-emerald-600' },
  ];

  return (
    <CivicPage className="space-y-4 px-4 py-4">
      <CivicHero
        eyebrow="Municipal Operations Hub"
        title={`${greeting()}, ${user.name?.split(' ')[0] ?? 'Official'}`}
        description={isLoading ? 'Loading executive briefing...' : heroDescription}
        className="px-4 py-4 sm:px-5 sm:py-5"
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <CivicBadge label={`${stats?.total_households ?? 0} households`} tone="teal" />
          <CivicBadge label={`${totalVulnerable} vulnerable`} tone="amber" />
          {activeIncidents.length > 0 && <CivicBadge label={`${activeIncidents.length} active incidents`} tone="rose" />}
          {activeEvents.length > 0 && <CivicBadge label={`${activeEvents.length} distributions`} tone="navy" />}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {quickActions.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-[22px] border border-white/70 bg-white/88 px-4 py-4 shadow-[0_16px_42px_-30px_rgba(15,23,42,0.22)] transition hover:border-slate-200 hover:bg-white"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-slate-100 text-slate-800">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-950">{link.label}</p>
              </Link>
            );
          })}
        </div>
      </CivicHero>

      {error ? (
        <Alert className="rounded-[24px] border-red-200 bg-red-50 text-red-700">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unable to refresh the dashboard</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <CivicKpiCard className="rounded-[22px] p-4" icon={Home} label="Households" value={isLoading ? '--' : stats?.total_households ?? 0} tone="navy" />
        <CivicKpiCard className="rounded-[22px] p-4" icon={Users} label="Population" value={isLoading ? '--' : stats?.total_population ?? 0} tone="teal" />
        <CivicKpiCard className="rounded-[22px] p-4" icon={Baby} label="Children" value={isLoading ? '--' : stats?.children_count ?? 0} tone="amber" />
        <CivicKpiCard className="rounded-[22px] p-4" icon={ShieldAlert} label="Vulnerable" value={isLoading ? '--' : totalVulnerable} tone="rose" />
      </div>

      <CivicPanel className="space-y-4 rounded-[24px] p-4 bg-slate-50/50">
        <CivicSectionHeading
          icon={Activity}
          title="Live Operations"
          description="Current field operations."
        />
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading operations...</p>
          ) : activeIncidents.length === 0 && activeEvents.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-slate-500">
              <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400" />
              <p className="mt-2 text-sm font-medium text-slate-900">All clear</p>
            </div>
          ) : (
            <>
              {activeIncidents.slice(0, 3).map((incident) => (
                <div key={incident.id} className="rounded-[20px] border border-rose-100 bg-white p-3 shadow-sm flex items-start gap-3">
                  <div className="rounded-full bg-rose-100 p-2 text-rose-600">
                    <Radio className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">{incident.type.replace('_', ' ')}</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">{incident.location}</p>
                  </div>
                </div>
              ))}
              {activeEvents.slice(0, 3).map((event) => (
                <div key={event.id} className="rounded-[20px] border border-sky-100 bg-white p-3 shadow-sm flex items-start gap-3">
                  <div className="rounded-full bg-sky-100 p-2 text-sky-600">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Relief Ongoing</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">{event.event_name}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </CivicPanel>

      <CivicPanel className="space-y-5 rounded-[24px] p-4">
        <CivicSectionHeading
          icon={ShieldAlert}
          title="Attention today"
          description="The largest monitored groups in the current household census."
        />
        <div className="space-y-3">
          {attentionRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[84px_minmax(0,1fr)_44px] items-center gap-3">
              <span className="text-xs font-medium text-slate-600">{row.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${row.color}`}
                  style={{ width: totalVulnerable > 0 ? `${Math.max((row.value / Math.max(totalVulnerable, 1)) * 100, row.value > 0 ? 8 : 0)}%` : '0%' }}
                />
              </div>
              <span className="text-right text-xs font-bold text-slate-900">{row.value}</span>
            </div>
          ))}
        </div>
      </CivicPanel>

      {user.role === 'admin' && dataQuality ? (
        <CivicPanel className="space-y-4 rounded-[24px] p-4">
          <CivicSectionHeading
            icon={AlertTriangle}
            title="Action Center"
            description="Tasks and records requiring executive attention."
          />
          <div className="space-y-2">
            {adminReviewShortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="block rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <p className="text-sm font-bold text-slate-950">{shortcut.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{shortcut.description}</p>
              </Link>
            ))}
          </div>
          <div className="space-y-2">
            {dataQuality.issues.map((issue) => (
              <Link
                key={issue.key}
                href={issue.href}
                className={`block rounded-[22px] border px-4 py-4 ${
                  issue.count > 0
                    ? 'border-amber-200 bg-amber-50/80'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{issue.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{issue.description}</p>
                  </div>
                  <CivicBadge
                    label={`${issue.count}`}
                    tone={issue.count > 0 ? 'amber' : 'emerald'}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {issue.sample_labels.length > 0 ? `Sample: ${issue.sample_labels.join(', ')}` : 'No issues detected right now.'}
                </p>
              </Link>
            ))}
          </div>
        </CivicPanel>
      ) : null}
    </CivicPage>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Baby, FileText, Home, Package, ShieldAlert, Users } from 'lucide-react';
import { getAnalyticsBarangayScope, getAnalyticsScopeLabel } from '@/lib/analytics-scope';
import { db } from '@/lib/db/indexeddb';
import { getDashboardStats, getTopPuroksByPopulation, getTopPuroksByVulnerability } from '@/lib/db/queries';
import { getDefaultRouteForUser, hasPermission, restoreSession } from '@/lib/auth';
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
  const [topVulnerable, setTopVulnerable] = useState<Array<{ purok: string; vulnerable_count: number }>>([]);
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
      const [dashboardStats, , vulnerable] = await Promise.all([
        getDashboardStats(analyticsBarangayId),
        getTopPuroksByPopulation(analyticsBarangayId),
        getTopPuroksByVulnerability(analyticsBarangayId),
      ]);

      setStats(dashboardStats);
      setTopVulnerable(vulnerable);
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
      if (!['households', 'residents', 'vulnerability_flags'].includes(event.detail.table)) {
        return;
      }

      void loadDashboard(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => window.removeEventListener('mswdo-data-changed', handleDataChanged);
  }, [loadDashboard]);

  if (!user) return null;

  const totalVulnerable = stats
    ? stats.children_count + stats.seniors_count + stats.pwd_count + stats.pregnant_count + stats.chronic_count
    : 0;
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
        eyebrow="Municipal Operations"
        title={`${greeting()}, ${user.name?.split(' ')[0] ?? 'there'}`}
        description={isLoading ? 'Loading municipal census metrics...' : residentsDescription}
        aside={<CivicBadge label={new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })} tone="navy" />}
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <CivicBadge label={`${stats?.total_households ?? 0} households`} tone="teal" />
          <CivicBadge label={`${totalVulnerable} vulnerable`} tone="amber" />
          <CivicBadge label="System online" tone="emerald" />
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

      <div className="grid grid-cols-4 gap-4">
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

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
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

        <CivicPanel>
          <CivicSectionHeading
            icon={ShieldAlert}
            title="Hotspot puroks"
            description="Areas with the highest concentration of vulnerable residents."
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

      {quickLinks.length > 0 ? (
        <CivicPanel>
          <CivicSectionHeading
            icon={FileText}
            title="Quick actions"
            description="Common administrative tasks for the current session."
          />
          <div className="mt-5 grid grid-cols-4 gap-3">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-950">{link.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{link.description}</p>
                </Link>
              );
            })}
          </div>
        </CivicPanel>
      ) : null}
    </CivicPage>
  );
}

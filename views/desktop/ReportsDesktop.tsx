'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock3, Home, ShieldAlert, Users } from 'lucide-react';
import { ReportsLivePreviewCards } from '@/components/reports/ReportsLivePreviewCards';
import { CivicBadge, CivicPanel } from '@/components/ui/civic-primitives';
import { getAnalyticsBarangayScope } from '@/lib/analytics-scope';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDashboardStats, getTopPuroksByHouseholds } from '@/lib/db/queries';

type Stats = Awaited<ReturnType<typeof getDashboardStats>>;

export default function ReportsDesktop() {
  const router = useRouter();
  const user = getCurrentUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [topHouseholdPuroks, setTopHouseholdPuroks] = useState<Array<{ purok: string; households: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadReports = useCallback(async (background = false) => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    try {
      if (!background) {
        setIsLoading(true);
      }

      const analyticsBarangayId = getAnalyticsBarangayScope(user);
      const [nextStats, nextTopHouseholdPuroks] = await Promise.all([
        getDashboardStats(analyticsBarangayId),
        getTopPuroksByHouseholds(analyticsBarangayId, 5),
      ]);

      setStats(nextStats);
      setTopHouseholdPuroks(nextTopHouseholdPuroks);
      setLastUpdatedAt(new Date());
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load report previews.');
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, [router, user]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (!['households', 'residents', 'vulnerability_flags'].includes(event.detail.table)) {
        return;
      }

      void loadReports(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => window.removeEventListener('mswdo-data-changed', handleDataChanged);
  }, [loadReports]);

  if (!user) return null;

  const totalVulnerable = stats
    ? stats.children_count + stats.seniors_count + stats.pwd_count + stats.pregnant_count + stats.chronic_count
    : 0;
  const lastUpdatedLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : (isLoading ? 'Syncing...' : 'Waiting');

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Reports Center</h1>
        <p className="mt-1 text-sm text-slate-500">Minimal live previews for monthly, vulnerability, and census reports.</p>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.3)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CivicBadge label="Realtime previews" tone="navy" />
              <CivicBadge label="PDF exports stay snapshot-based" tone="slate" />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              This page updates only the preview cards when household, resident, or vulnerability data changes.
            </p>
          </div>

          <div className="grid min-w-[420px] grid-cols-4 gap-2">
            {[
              { label: 'Households', value: isLoading ? '—' : (stats?.total_households ?? 0).toLocaleString(), icon: Home },
              { label: 'Population', value: isLoading ? '—' : (stats?.total_population ?? 0).toLocaleString(), icon: Users },
              { label: 'Vulnerable', value: isLoading ? '—' : totalVulnerable.toLocaleString(), icon: ShieldAlert },
              { label: 'Last updated', value: lastUpdatedLabel, icon: Clock3 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{item.label}</span>
                  </div>
                  <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{item.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {error ? (
        <CivicPanel className="border-red-200 bg-red-50/95">
          <div className="flex items-center gap-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </CivicPanel>
      ) : null}

      <ReportsLivePreviewCards stats={stats} topHouseholdPuroks={topHouseholdPuroks} />

      <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.24)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Supported exports</p>
            <p className="mt-1 text-sm text-slate-500">Use any report page to print or generate a clean PDF snapshot.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'PDF', description: 'Print-ready report' },
              { label: 'CSV', description: 'Spreadsheet export' },
              { label: 'Print', description: 'Browser print view' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2"
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-900">{item.label}</span>
                <span className="text-xs text-slate-500">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

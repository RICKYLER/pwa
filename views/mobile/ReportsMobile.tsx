'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock3, Home, ShieldAlert, Users } from 'lucide-react';
import { ReportsLivePreviewCards } from '@/components/reports/ReportsLivePreviewCards';
import { MobilePageHeader } from '@/components/mobile/mobile-primitives';
import { CivicBadge, CivicPage, CivicPanel } from '@/components/ui/civic-primitives';
import { getAnalyticsBarangayScope } from '@/lib/analytics-scope';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDashboardStats, getTopPuroksByHouseholds } from '@/lib/db/queries';

type Stats = Awaited<ReturnType<typeof getDashboardStats>>;

export default function ReportsMobile() {
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
        getTopPuroksByHouseholds(analyticsBarangayId, 4),
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
    <CivicPage className="space-y-4 px-4 py-4">
      <MobilePageHeader
        title="Reports"
        subtitle="Live preview cards for the latest census, vulnerability, and household counts."
      />

      <CivicPanel className="rounded-[24px] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CivicBadge label="Realtime previews" tone="navy" />
          <CivicBadge label="Snapshot exports" tone="slate" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            { label: 'Households', value: isLoading ? '—' : (stats?.total_households ?? 0).toLocaleString(), icon: Home },
            { label: 'Population', value: isLoading ? '—' : (stats?.total_population ?? 0).toLocaleString(), icon: Users },
            { label: 'Vulnerable', value: isLoading ? '—' : totalVulnerable.toLocaleString(), icon: ShieldAlert },
            { label: 'Updated', value: lastUpdatedLabel, icon: Clock3 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <Icon className="h-4 w-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{item.label}</span>
                </div>
                <p className="mt-3 text-lg font-black tracking-tight text-slate-950">{item.value}</p>
              </div>
            );
          })}
        </div>
      </CivicPanel>

      {error ? (
        <CivicPanel className="rounded-[24px] border-red-200 bg-red-50/95 p-4">
          <div className="flex items-center gap-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </CivicPanel>
      ) : null}

      <ReportsLivePreviewCards stats={stats} topHouseholdPuroks={topHouseholdPuroks} compact />

      <CivicPanel className="rounded-[24px] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Export formats</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: 'PDF', description: 'Print-ready' },
            { label: 'CSV', description: 'Spreadsheet' },
            { label: 'Print', description: 'Browser print' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-900">{item.label}</span>
              <span className="text-xs text-slate-500">{item.description}</span>
            </div>
          ))}
        </div>
      </CivicPanel>
    </CivicPage>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, BarChart3, FileText, Home, ShieldAlert, Users } from 'lucide-react';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDashboardStats } from '@/lib/db/queries';
import { CivicBadge, CivicPage, CivicPanel } from '@/components/ui/civic-primitives';
import { MobileListCard, MobilePageHeader } from '@/components/mobile/mobile-primitives';

const REPORTS = [
  {
    title: 'Monthly demographic summary',
    desc: 'Population by age group with household averages.',
    icon: BarChart3,
    href: '/reports/monthly',
    badge: 'Monthly',
    tone: 'navy' as const,
  },
  {
    title: 'Vulnerable groups summary',
    desc: 'Breakdown by children, seniors, PWDs, and more.',
    icon: Users,
    href: '/reports/vulnerable',
    badge: 'Vulnerable',
    tone: 'rose' as const,
  },
  {
    title: 'Household census listing',
    desc: 'Complete masterlist organized by purok or sitio.',
    icon: FileText,
    href: '/reports/households',
    badge: 'Census',
    tone: 'emerald' as const,
  },
];

export default function ReportsMobile() {
  const router = useRouter();
  const user = getCurrentUser();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    const activeUser = user;

    async function load() {
      setIsLoading(true);
      setStats(await getDashboardStats(activeUser.barangay_id));
      setIsLoading(false);
    }

    void load();
  }, [router, user]);

  if (!user) return null;

  const totalVulnerable = stats
    ? stats.children_count + stats.seniors_count + stats.pwd_count + stats.pregnant_count + stats.chronic_count
    : 0;

  return (
    <CivicPage className="space-y-4 px-4 py-4">
      <MobilePageHeader
        title="Reports"
        subtitle="Generate official MSWDO exports without carrying the full desktop report center into mobile."
      />

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Households', value: stats?.total_households ?? 0, icon: Home },
          { label: 'Population', value: stats?.total_population ?? 0, icon: Users },
          { label: 'Vulnerable', value: totalVulnerable, icon: ShieldAlert },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <CivicPanel key={stat.label} className="rounded-[22px] p-3 text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-[16px] bg-slate-100 text-slate-700">
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-lg font-black tracking-tight text-slate-950">{isLoading ? '--' : stat.value}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
            </CivicPanel>
          );
        })}
      </div>

      <div className="space-y-2">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link key={report.href} href={report.href} className="block">
              <MobileListCard
                title={report.title}
                subtitle={report.desc}
                leading={<Icon className="h-5 w-5" />}
                trailing={<ArrowUpRight className="h-4 w-4 text-slate-300" />}
                status={<CivicBadge label={report.badge} tone={report.tone} className="text-[10px]" />}
                meta={(
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>Open report</span>
                    <span className="text-slate-400">PDF, CSV, or print</span>
                  </div>
                )}
              />
            </Link>
          );
        })}
      </div>
    </CivicPage>
  );
}


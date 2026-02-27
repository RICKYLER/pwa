'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDashboardStats, getVulnerableResidents, getHeatmapData } from '@/lib/db/queries';
import { FileText, BarChart3, Users } from 'lucide-react';

export default function ReportsPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    async function loadData() {
      try {
        setIsLoading(true);
        const dashStats = await getDashboardStats(user.barangay_id);
        setStats(dashStats);
      } catch (error) {
        console.error('[v0] Error loading reports:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [user, router]);

  if (!user || isLoading) return null;

  const reports = [
    {
      title: 'Monthly Demographic Summary',
      description: 'Total households, population by age group, births/deaths',
      icon: BarChart3,
      href: '/reports/monthly',
      badge: 'Monthly',
    },
    {
      title: 'Vulnerable Groups Summary',
      description: 'Count per group (children, seniors, PWD, pregnant, etc.)',
      icon: Users,
      href: '/reports/vulnerable',
      badge: 'Vulnerability',
    },
    {
      title: 'Household Listing',
      description: 'All households organized by purok, print-ready',
      icon: FileText,
      href: '/reports/households',
      badge: 'Census',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">Reports Center</h1>
          <p className="text-sm text-muted-foreground">Generate official reports for MSWDO</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Key Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground text-sm mb-1">Total Households</p>
              <p className="text-4xl font-bold text-foreground">{stats.total_households}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground text-sm mb-1">Total Population</p>
              <p className="text-4xl font-bold text-primary">{stats.total_population}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-muted-foreground text-sm mb-1">Vulnerable Groups</p>
              <p className="text-4xl font-bold text-destructive">
                {stats.children_count + stats.seniors_count + stats.pwd_count + stats.pregnant_count + stats.chronic_count}
              </p>
            </div>
          </div>
        )}

        {/* Reports Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {reports.map((report) => {
            const Icon = report.icon;
            return (
              <Link
                key={report.href}
                href={report.href}
                className="bg-card border border-border rounded-lg p-6 hover:shadow-lg hover:border-primary transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <Icon className="w-8 h-8 text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                    {report.badge}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground mb-2">{report.title}</h3>
                <p className="text-sm text-muted-foreground">{report.description}</p>
                <div className="mt-4 text-primary text-sm font-medium group-hover:translate-x-1 transition-transform">
                  Generate Report →
                </div>
              </Link>
            );
          })}
        </div>

        {/* Additional Info */}
        <div className="mt-12 bg-gradient-to-r from-primary/5 to-accent/5 border border-border rounded-lg p-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Export Formats</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="font-medium text-foreground mb-2">PDF</p>
              <p className="text-sm text-muted-foreground">Print-ready reports with official header and footer</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-2">CSV/Excel</p>
              <p className="text-sm text-muted-foreground">Import into Excel or other spreadsheet applications</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDashboardStats, getTopPuroksByPopulation, getTopPuroksByVulnerability } from '@/lib/db/queries';
import { Users, Home, AlertTriangle, Users2, Baby, Accessibility } from 'lucide-react';

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

export default function Dashboard() {
  const router = useRouter();
  const user = getCurrentUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [topPuroks, setTopPuroks] = useState<Array<{ purok: string; population: number }>>([]);
  const [topVulnerable, setTopVulnerable] = useState<Array<{ purok: string; vulnerable_count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check authentication
    if (!user) {
      router.push('/login');
      return;
    }

    // Load dashboard data
    async function loadData() {
      try {
        setIsLoading(true);
        const barangay_id = user.barangay_id;
        
        const [dashStats, purokPop, purokVuln] = await Promise.all([
          getDashboardStats(barangay_id),
          getTopPuroksByPopulation(barangay_id),
          getTopPuroksByVulnerability(barangay_id),
        ]);

        setStats(dashStats);
        setTopPuroks(purokPop);
        setTopVulnerable(purokVuln);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        console.error('[v0] Dashboard error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [user, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground">{user.barangay_id}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user.role.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        ) : stats ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Total Households */}
              <div className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Households</p>
                    <p className="text-3xl font-bold text-foreground">{stats.total_households}</p>
                  </div>
                  <Home className="w-8 h-8 text-primary opacity-50" />
                </div>
              </div>

              {/* Total Population */}
              <div className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Population</p>
                    <p className="text-3xl font-bold text-foreground">{stats.total_population}</p>
                  </div>
                  <Users className="w-8 h-8 text-accent opacity-50" />
                </div>
              </div>

              {/* Children */}
              <div className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Children (0-17)</p>
                    <p className="text-3xl font-bold text-foreground">{stats.children_count}</p>
                  </div>
                  <Baby className="w-8 h-8 text-blue-500 opacity-50" />
                </div>
              </div>

              {/* Seniors */}
              <div className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Seniors (60+)</p>
                    <p className="text-3xl font-bold text-foreground">{stats.seniors_count}</p>
                  </div>
                  <Users2 className="w-8 h-8 text-orange-500 opacity-50" />
                </div>
              </div>
            </div>

            {/* Vulnerability Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Vulnerability Card 1 */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Vulnerability Summary
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Persons with Disabilities</span>
                    <span className="font-semibold text-foreground">{stats.pwd_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pregnant Women</span>
                    <span className="font-semibold text-foreground">{stats.pregnant_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Chronic Illness</span>
                    <span className="font-semibold text-foreground">{stats.chronic_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Low-Income Families</span>
                    <span className="font-semibold text-foreground">{stats.low_income_count}</span>
                  </div>
                </div>
              </div>

              {/* Top Puroks by Population */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Top Puroks by Population</h2>
                <div className="space-y-3">
                  {topPuroks.length > 0 ? (
                    topPuroks.map((purok, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{idx + 1}. {purok.purok}</span>
                        <span className="font-semibold text-foreground">{purok.population}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">No data available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Top Vulnerable Puroks */}
            <div className="bg-card border border-border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-4">Top Puroks by Vulnerability</h2>
              <div className="space-y-3">
                {topVulnerable.length > 0 ? (
                  topVulnerable.map((purok, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm pb-2 border-b border-border last:border-b-0">
                      <span className="text-muted-foreground">{idx + 1}. {purok.purok}</span>
                      <span className="font-semibold text-destructive">{purok.vulnerable_count} vulnerable</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">No vulnerable residents identified</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            {hasPermission('create_household') && (
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-border rounded-lg p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Link
                    href="/households/new"
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-center text-sm font-medium"
                  >
                    Add Household
                  </Link>
                  <Link
                    href="/vulnerability"
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:opacity-90 transition-opacity text-center text-sm font-medium"
                  >
                    View Vulnerable Groups
                  </Link>
                  <Link
                    href="/reports"
                    className="px-4 py-2 bg-accent text-accent-foreground rounded-md hover:opacity-90 transition-opacity text-center text-sm font-medium"
                  >
                    Generate Reports
                  </Link>
                </div>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

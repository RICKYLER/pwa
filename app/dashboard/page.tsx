'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission, restoreSession } from '@/lib/auth';
import { db } from '@/lib/db/indexeddb';
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
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [topPuroks, setTopPuroks] = useState<Array<{ purok: string; population: number }>>([]);
  const [topVulnerable, setTopVulnerable] = useState<Array<{ purok: string; vulnerable_count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Restore session and check authentication
    async function initDashboard() {
      try {
        await db.init();
        const restoredUser = restoreSession();
        
        if (!restoredUser) {
          router.push('/login');
          return;
        }

        setUser(restoredUser);

        // Load dashboard data
        const barangay_id = restoredUser.barangay_id;
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

    initDashboard();
  }, [router]);

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">Barangay {user.barangay_id}</p>
            </div>
            <div className="text-right bg-primary/10 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">{user.role.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm font-medium">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        ) : stats ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              {/* Total Households */}
              <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:border-primary/30 transition-all cursor-default">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Total Households</p>
                    <p className="text-4xl font-bold text-foreground">{stats.total_households}</p>
                    <p className="text-xs text-muted-foreground mt-2">Active households</p>
                  </div>
                  <div className="bg-primary/10 rounded-xl p-3">
                    <Home className="w-8 h-8 text-primary" />
                  </div>
                </div>
              </div>

              {/* Total Population */}
              <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:border-secondary/30 transition-all cursor-default">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Total Population</p>
                    <p className="text-4xl font-bold text-foreground">{stats.total_population}</p>
                    <p className="text-xs text-muted-foreground mt-2">Residents</p>
                  </div>
                  <div className="bg-secondary/10 rounded-xl p-3">
                    <Users className="w-8 h-8 text-secondary" />
                  </div>
                </div>
              </div>

              {/* Children */}
              <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:border-chart-1/30 transition-all cursor-default">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Children (0-17)</p>
                    <p className="text-4xl font-bold text-foreground">{stats.children_count}</p>
                    <p className="text-xs text-muted-foreground mt-2">Youth</p>
                  </div>
                  <div className="bg-blue-100/50 rounded-xl p-3">
                    <Baby className="w-8 h-8 text-chart-1" />
                  </div>
                </div>
              </div>

              {/* Seniors */}
              <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:border-chart-3/30 transition-all cursor-default">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Seniors (60+)</p>
                    <p className="text-4xl font-bold text-foreground">{stats.seniors_count}</p>
                    <p className="text-xs text-muted-foreground mt-2">Elderly</p>
                  </div>
                  <div className="bg-orange-100/50 rounded-xl p-3">
                    <Users2 className="w-8 h-8 text-chart-3" />
                  </div>
                </div>
              </div>
            </div>

            {/* Vulnerability Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Vulnerability Card 1 */}
              <div className="bg-card border border-border rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow">
                <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-3">
                  <div className="bg-destructive/10 rounded-lg p-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                  </div>
                  Vulnerability Summary
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm text-foreground font-medium">Persons with Disabilities</span>
                    <span className="font-bold text-lg text-foreground">{stats.pwd_count}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm text-foreground font-medium">Pregnant Women</span>
                    <span className="font-bold text-lg text-foreground">{stats.pregnant_count}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm text-foreground font-medium">Chronic Illness</span>
                    <span className="font-bold text-lg text-foreground">{stats.chronic_count}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm text-foreground font-medium">Low-Income Families</span>
                    <span className="font-bold text-lg text-foreground">{stats.low_income_count}</span>
                  </div>
                </div>
              </div>

              {/* Top Puroks by Population */}
              <div className="bg-card border border-border rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow">
                <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-3">
                  <div className="bg-secondary/10 rounded-lg p-2">
                    <Home className="w-5 h-5 text-secondary" />
                  </div>
                  Top Puroks by Population
                </h2>
                <div className="space-y-2">
                  {topPuroks.length > 0 ? (
                    topPuroks.map((purok, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-3 hover:bg-muted/50 rounded-lg transition-colors">
                        <span className="text-muted-foreground"><span className="font-bold text-foreground">{idx + 1}.</span> {purok.purok}</span>
                        <span className="font-semibold text-foreground bg-primary/10 px-3 py-1 rounded-full text-xs">{purok.population}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm p-3">No data available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Top Vulnerable Puroks */}
            <div className="bg-card border border-border rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow mb-8">
              <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-3">
                <div className="bg-destructive/10 rounded-lg p-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                Top Puroks by Vulnerability
              </h2>
              <div className="space-y-2">
                {topVulnerable.length > 0 ? (
                  topVulnerable.map((purok, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm p-3 hover:bg-muted/50 rounded-lg transition-colors border-b border-border/50 last:border-b-0">
                      <span className="text-foreground font-medium"><span className="font-bold text-foreground">{idx + 1}.</span> {purok.purok}</span>
                      <span className="font-semibold text-destructive bg-destructive/10 px-3 py-1 rounded-full text-xs">{purok.vulnerable_count} vulnerable</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm p-3">No vulnerable residents identified</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            {hasPermission('create_household') && (
              <div className="bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/20 rounded-2xl p-8">
                <h2 className="text-lg font-bold text-foreground mb-6">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Link
                    href="/households/new"
                    className="px-6 py-3.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold text-center text-sm shadow-md hover:shadow-lg hover:scale-105"
                  >
                    Add Household
                  </Link>
                  <Link
                    href="/vulnerability"
                    className="px-6 py-3.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-all font-semibold text-center text-sm shadow-md hover:shadow-lg hover:scale-105"
                  >
                    View Vulnerable Groups
                  </Link>
                  <Link
                    href="/reports"
                    className="px-6 py-3.5 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-all font-semibold text-center text-sm shadow-md hover:shadow-lg hover:scale-105"
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

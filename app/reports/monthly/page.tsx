'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDashboardStats } from '@/lib/db/queries';
import { ArrowLeft, Download, Printer } from 'lucide-react';

export default function MonthlyReportPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const today = new Date();
  const monthYear = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!user) {
      router.push('/reports');
      return;
    }

    async function loadData() {
      try {
        setIsLoading(true);
        const dashStats = await getDashboardStats(user.barangay_id);
        setStats(dashStats);
      } catch (error) {
        console.error('[v0] Error loading report:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [user, router]);

  if (!user || !stats) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            href="/reports"
            className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Reports
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Monthly Demographic Report</h1>
              <p className="text-sm text-muted-foreground">{monthYear}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity">
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Report Header */}
        <div className="bg-white text-foreground p-8 mb-8 border border-border rounded-lg print:border-0 print:shadow-none">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-1">MSWDO Household Census</h2>
            <p className="text-muted-foreground">Monthly Demographic Report</p>
            <p className="text-sm text-muted-foreground mt-2">{monthYear}</p>
          </div>

          {/* Summary Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">Population Summary</h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-muted-foreground text-sm">Total Households</p>
                <p className="text-3xl font-bold text-primary">{stats.total_households}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Total Population</p>
                <p className="text-3xl font-bold text-foreground">{stats.total_population}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Avg. Household Size</p>
                <p className="text-3xl font-bold text-accent">
                  {stats.total_households > 0 ? (stats.total_population / stats.total_households).toFixed(1) : 0}
                </p>
              </div>
            </div>
          </div>

          {/* Age Distribution */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">Age Distribution</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-blue-700 font-medium mb-2">Children (0-17)</p>
                <p className="text-2xl font-bold text-blue-900">{stats.children_count}</p>
                <p className="text-xs text-blue-600 mt-1">
                  {stats.total_population > 0 ? ((stats.children_count / stats.total_population) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium mb-2">Adults (18-59)</p>
                <p className="text-2xl font-bold">
                  {stats.total_population - stats.children_count - stats.seniors_count}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total_population > 0 ? (((stats.total_population - stats.children_count - stats.seniors_count) / stats.total_population) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-orange-700 font-medium mb-2">Seniors (60+)</p>
                <p className="text-2xl font-bold text-orange-900">{stats.seniors_count}</p>
                <p className="text-xs text-orange-600 mt-1">
                  {stats.total_population > 0 ? ((stats.seniors_count / stats.total_population) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>
          </div>

          {/* Vulnerable Groups */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">Vulnerable Groups</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium text-foreground">Persons with Disabilities</span>
                <span className="text-xl font-bold text-primary">{stats.pwd_count}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium text-foreground">Pregnant Women</span>
                <span className="text-xl font-bold text-primary">{stats.pregnant_count}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium text-foreground">Chronic Illness</span>
                <span className="text-xl font-bold text-primary">{stats.chronic_count}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium text-foreground">Low-Income Families</span>
                <span className="text-xl font-bold text-primary">{stats.low_income_count}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              Report generated on {today.toLocaleDateString()} at {today.toLocaleTimeString()}
            </p>
            <p className="text-xs text-muted-foreground mt-2">MSWDO Household Census Management System</p>
          </div>
        </div>

        {/* Print Styles */}
        <style jsx>{`
          @media print {
            body {
              margin: 0;
              padding: 0;
            }
            main {
              max-width: 100%;
            }
          }
        `}</style>
      </main>
    </div>
  );
}

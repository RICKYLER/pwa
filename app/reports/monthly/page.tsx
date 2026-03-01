'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDashboardStats } from '@/lib/db/queries';
import { ArrowLeft, Download, Printer, Users, Home, Baby, UserCheck, HeartPulse, Accessibility, Wallet, TrendingUp } from 'lucide-react';

export default function MonthlyReportPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const today = new Date();
  const monthYear = today.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const generatedAt = today.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    if (!user) {
      router.push('/reports');
      return;
    }

    const currentUser = user;

    async function loadData() {
      try {
        setIsLoading(true);
        const dashStats = await getDashboardStats(currentUser.barangay_id);
        setStats(dashStats);
      } catch (error) {
        console.error('Error loading report:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [user, router]);

  async function handleExportPDF() {
    if (!stats || !user) return;
    setIsExporting(true);
    try {
      const { exportMonthlyReportPDF } = await import('@/lib/pdf/exportReport');
      exportMonthlyReportPDF(stats, user.barangay_id ?? '');
    } finally {
      setIsExporting(false);
    }
  }

  if (!user || !stats) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Generating report…</p>
      </div>
    </div>
  );

  const adultsCount = stats.total_population - stats.children_count - stats.seniors_count;
  const avgSize = stats.total_households > 0
    ? (stats.total_population / stats.total_households).toFixed(1)
    : '0';

  const ageGroups = [
    { label: 'Children (0–17)', value: stats.children_count, pct: stats.total_population > 0 ? ((stats.children_count / stats.total_population) * 100).toFixed(1) : '0', color: 'from-blue-500 to-indigo-500', bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' },
    { label: 'Adults (18–59)', value: adultsCount, pct: stats.total_population > 0 ? ((adultsCount / stats.total_population) * 100).toFixed(1) : '0', color: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
    { label: 'Seniors (60+)', value: stats.seniors_count, pct: stats.total_population > 0 ? ((stats.seniors_count / stats.total_population) * 100).toFixed(1) : '0', color: 'from-orange-500 to-amber-500', bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500' },
  ];

  const vulnerableGroups = [
    { label: 'Persons w/ Disabilities', value: stats.pwd_count, icon: Accessibility, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Pregnant Women', value: stats.pregnant_count, icon: HeartPulse, color: 'text-pink-600', bg: 'bg-pink-50' },
    { label: 'Chronic Illness', value: stats.chronic_count, icon: HeartPulse, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Low-Income Families', value: stats.low_income_count, icon: Wallet, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 print:bg-white">
      {/* Header — hidden on print */}
      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/reports"
              className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Reports
            </Link>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button
                onClick={handleExportPDF}
                disabled={isExporting || isLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:opacity-90 transition-all shadow-md shadow-indigo-500/25 disabled:opacity-60"
              >
                {isExporting
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Generating…</>
                  : <><Download className="w-4 h-4" />Export PDF</>
                }
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 print:py-0 print:px-0">
        {/* Report Document */}
        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-900/5 overflow-hidden print:rounded-none print:border-0 print:shadow-none">

          {/* Report Hero Header */}
          <div className="relative bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 px-8 py-10 print:bg-indigo-700">
            <div className="absolute inset-0 opacity-10 print:hidden"
              style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
            />
            <div className="relative z-10 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white/90 text-xs font-medium rounded-full mb-4 backdrop-blur-sm">
                <TrendingUp className="w-3.5 h-3.5" />
                Monthly Demographic Report
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">MSWDO Household Census</h1>
              <p className="text-indigo-200 font-medium">{monthYear}</p>
              {user.barangay_id && (
                <p className="text-indigo-300 text-sm mt-1">{user.barangay_id}</p>
              )}
            </div>
          </div>

          <div className="p-8 space-y-8 print:p-6 print:space-y-6">
            {/* Summary KPI Row */}
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Population Summary</h2>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Households', value: stats.total_households, icon: Home, gradient: 'from-indigo-500 to-violet-600', shadow: 'shadow-indigo-500/20' },
                  { label: 'Total Population', value: stats.total_population, icon: Users, gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/20' },
                  { label: 'Avg. Household Size', value: avgSize, icon: UserCheck, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/20' },
                ].map(kpi => {
                  const Icon = kpi.icon;
                  return (
                    <div key={kpi.label} className="relative bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl p-5 text-center">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center mx-auto mb-3 shadow-lg ${kpi.shadow}`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <p className={`text-3xl font-bold bg-gradient-to-r ${kpi.gradient} bg-clip-text text-transparent`}>{kpi.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{kpi.label}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Age Distribution */}
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Age Distribution</h2>
              <div className="space-y-3">
                {ageGroups.map(group => (
                  <div key={group.label} className={`${group.bg} rounded-2xl p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-semibold ${group.text}`}>{group.label}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs ${group.text} opacity-70`}>{group.pct}%</span>
                        <span className={`text-xl font-bold ${group.text}`}>{group.value}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${group.bar} rounded-full transition-all duration-700`}
                        style={{ width: `${group.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Vulnerable Groups */}
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Vulnerable Groups</h2>
              <div className="grid grid-cols-2 gap-3">
                {vulnerableGroups.map(v => {
                  const Icon = v.icon;
                  return (
                    <div key={v.label} className={`${v.bg} rounded-2xl p-4 flex items-center gap-3`}>
                      <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                        <Icon className={`w-4.5 h-4.5 ${v.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 truncate">{v.label}</p>
                        <p className={`text-2xl font-bold ${v.color}`}>{v.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Footer */}
            <div className="pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Baby className="w-3.5 h-3.5" />
                <span>MSWDO Household Census Management System</span>
              </div>
              <span>Generated {generatedAt}</span>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          main { max-width: 100% !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

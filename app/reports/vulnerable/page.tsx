'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDashboardStats, getVulnerableResidents, getTopPuroksByVulnerability } from '@/lib/db/queries';
import {
    ArrowLeft, Download, Printer, Users, Baby, UserCheck,
    HeartPulse, Accessibility, Wallet, ShieldAlert, Loader2,
} from 'lucide-react';

const VULN_TYPES = [
    { key: 'child', label: 'Children (0–17)', icon: Baby, color: 'text-blue-600', bg: 'bg-blue-50', bar: 'bg-blue-500' },
    { key: 'senior', label: 'Senior Citizens (60+)', icon: UserCheck, color: 'text-orange-600', bg: 'bg-orange-50', bar: 'bg-orange-500' },
    { key: 'pwd', label: 'Persons w/ Disabilities', icon: Accessibility, color: 'text-red-600', bg: 'bg-red-50', bar: 'bg-red-500' },
    { key: 'pregnant', label: 'Pregnant Women', icon: HeartPulse, color: 'text-pink-600', bg: 'bg-pink-50', bar: 'bg-pink-500' },
    { key: 'chronic', label: 'Chronic Illness', icon: HeartPulse, color: 'text-purple-600', bg: 'bg-purple-50', bar: 'bg-purple-500' },
    { key: 'low_income', label: 'Low-Income Families', icon: Wallet, color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' },
] as const;

export default function VulnerableReportPage() {
    const router = useRouter();
    const user = getCurrentUser();
    const [stats, setStats] = useState<any>(null);
    const [topPuroks, setTopPuroks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    const today = new Date();
    const monthYear = today.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const generatedAt = today.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    useEffect(() => {
        if (!user) { router.push('/reports'); return; }
        const u = user;
        async function load() {
            setIsLoading(true);
            const [s, puroks] = await Promise.all([
                getDashboardStats(u.barangay_id),
                getTopPuroksByVulnerability(u.barangay_id, 10),
            ]);
            setStats(s);
            setTopPuroks(puroks);
            setIsLoading(false);
        }
        load();
    }, [user, router]);

    async function handleExportPDF() {
        if (!stats || !user) return;
        setIsExporting(true);
        try {
            const { exportVulnerableReportPDF } = await import('@/lib/pdf/exportReport');
            exportVulnerableReportPDF(stats, topPuroks, user.barangay_id ?? '');
        } finally {
            setIsExporting(false);
        }
    }

    if (!user || (!stats && isLoading)) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50/30 flex items-center justify-center">
            <div className="text-center">
                <div className="w-10 h-10 rounded-full border-4 border-rose-200 border-t-rose-600 animate-spin mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Generating report…</p>
            </div>
        </div>
    );

    const totalPop = stats?.total_population ?? 0;
    const counts: Record<string, number> = {
        child: stats?.children_count ?? 0,
        senior: stats?.seniors_count ?? 0,
        pwd: stats?.pwd_count ?? 0,
        pregnant: stats?.pregnant_count ?? 0,
        chronic: stats?.chronic_count ?? 0,
        low_income: stats?.low_income_count ?? 0,
    };
    const totalVuln = Object.values(counts).reduce((a, b) => a + b, 0);


    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50/30 print:bg-white">
            {/* Header */}
            <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl print:hidden">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
                    <Link href="/reports" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm">
                        <ArrowLeft className="w-4 h-4" /> Back to Reports
                    </Link>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3.5 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
                            <Printer className="w-4 h-4" /> Print
                        </button>
                        <button onClick={handleExportPDF} disabled={isExporting || isLoading}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-xl hover:opacity-90 transition-all shadow-md shadow-rose-500/25 disabled:opacity-60">
                            {isExporting
                                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Generating…</>
                                : <><Download className="w-4 h-4" />Export PDF</>}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 print:py-0 print:px-0">
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-900/5 overflow-hidden print:rounded-none print:border-0 print:shadow-none">

                    {/* Hero */}
                    <div className="relative bg-gradient-to-br from-rose-600 via-pink-600 to-rose-700 px-8 py-10">
                        <div className="absolute inset-0 opacity-10 print:hidden"
                            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
                        <div className="relative z-10 text-center">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white/90 text-xs font-medium rounded-full mb-4 backdrop-blur-sm">
                                <ShieldAlert className="w-3.5 h-3.5" /> Vulnerable Groups Report
                            </div>
                            <h1 className="text-3xl font-bold text-white mb-2">Vulnerable Groups Summary</h1>
                            <p className="text-rose-200 font-medium">{monthYear}</p>
                            {user?.barangay_id && <p className="text-rose-300 text-sm mt-1">{user.barangay_id}</p>}
                        </div>
                    </div>

                    <div className="p-8 space-y-8 print:p-6 print:space-y-6">

                        {/* Total Vulnerable KPI */}
                        <section>
                            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Overview</h2>
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Total Population', value: totalPop, gradient: 'from-indigo-500 to-violet-600', icon: Users },
                                    { label: 'Total Vulnerable', value: totalVuln, gradient: 'from-rose-500 to-pink-600', icon: ShieldAlert },
                                    { label: '% Vulnerable', value: totalPop > 0 ? ((totalVuln / totalPop) * 100).toFixed(1) + '%' : '0%', gradient: 'from-amber-500 to-orange-600', icon: Accessibility },
                                ].map(kpi => {
                                    const Icon = kpi.icon;
                                    return (
                                        <div key={kpi.label} className="bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl p-5 text-center">
                                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center mx-auto mb-3 shadow-lg`}>
                                                <Icon className="w-5 h-5 text-white" />
                                            </div>
                                            <p className={`text-3xl font-bold bg-gradient-to-r ${kpi.gradient} bg-clip-text text-transparent`}>{kpi.value}</p>
                                            <p className="text-xs text-slate-500 mt-1">{kpi.label}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Vulnerable by category */}
                        <section>
                            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Breakdown by Category</h2>
                            <div className="space-y-3">
                                {VULN_TYPES.map(v => {
                                    const count = counts[v.key] ?? 0;
                                    const pct = totalPop > 0 ? ((count / totalPop) * 100).toFixed(1) : '0.0';
                                    const Icon = v.icon;
                                    return (
                                        <div key={v.key} className={`${v.bg} rounded-2xl p-4`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Icon className={`w-4 h-4 ${v.color}`} />
                                                    <span className={`text-sm font-semibold ${v.color}`}>{v.label}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`text-xs ${v.color} opacity-70`}>{pct}%</span>
                                                    <span className={`text-xl font-bold ${v.color}`}>{count}</span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                                                <div className={`h-full ${v.bar} rounded-full`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Top Puroks */}
                        {topPuroks.length > 0 && (
                            <section>
                                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Puroks with Highest Vulnerability</h2>
                                <div className="overflow-hidden rounded-2xl border border-slate-200/60">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gradient-to-r from-rose-600 to-pink-600 text-white">
                                                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide">Rank</th>
                                                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide">Purok / Sitio</th>
                                                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide">Vulnerable Count</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {topPuroks.map((p, i) => (
                                                <tr key={p.purok} className={i % 2 === 0 ? 'bg-white' : 'bg-rose-50/40'}>
                                                    <td className="px-4 py-3 font-bold text-rose-600">#{i + 1}</td>
                                                    <td className="px-4 py-3 font-semibold text-slate-800">{p.purok}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-slate-900">{p.vulnerable_count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* Footer */}
                        <div className="pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                            <span>MSWDO Household Census Management System</span>
                            <span>Generated {generatedAt}</span>
                        </div>
                    </div>
                </div>
            </main>

            <style>{`@media print { body { margin: 0; } main { max-width: 100% !important; } .print\\:hidden { display: none !important; } }`}</style>
        </div>
    );
}

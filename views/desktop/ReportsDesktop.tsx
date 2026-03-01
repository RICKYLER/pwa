'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDashboardStats } from '@/lib/db/queries';
import { FileText, BarChart3, Users, Home, ShieldAlert, TrendingUp, ArrowUpRight } from 'lucide-react';

const REPORTS = [
    { title: 'Monthly Demographic Summary', description: 'Population by age group (children, adults, seniors) with household averages and trend data.', icon: BarChart3, href: '/reports/monthly', badge: 'Monthly', gradient: 'from-indigo-500 to-violet-600', badgeBg: 'bg-indigo-50 text-indigo-700' },
    { title: 'Vulnerable Groups Summary', description: 'Breakdown of at-risk residents including children, seniors, PWDs, pregnant women, and low-income families.', icon: Users, href: '/reports/vulnerable', badge: 'Vulnerability', gradient: 'from-rose-500 to-pink-600', badgeBg: 'bg-rose-50 text-rose-700' },
    { title: 'Household Census Listing', description: 'Complete masterlist of registered households organized by purok — ready for printing.', icon: FileText, href: '/reports/households', badge: 'Census', gradient: 'from-emerald-500 to-teal-600', badgeBg: 'bg-emerald-50 text-emerald-700' },
];

export default function ReportsDesktop() {
    const router = useRouter();
    const user = getCurrentUser();
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user || !hasPermission('view_reports')) { router.push('/dashboard'); return; }
        const u = user;
        async function load() { setIsLoading(true); setStats(await getDashboardStats(u.barangay_id)); setIsLoading(false); }
        load();
    }, [user, router]);

    if (!user) return null;
    const totalVulnerable = stats ? stats.children_count + stats.seniors_count + stats.pwd_count + stats.pregnant_count + stats.chronic_count : 0;

    return (
        <div className="p-8 max-w-[1400px] mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Reports Center</h1>
                <p className="text-sm text-slate-500 mt-0.5">Generate and export official MSWDO reports</p>
            </div>

            {/* Hero Banner */}
            <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl shadow-violet-500/20">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-violet-400/30 rounded-full blur-3xl" />
                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/15 border border-white/20 text-xs font-medium rounded-full mb-3 backdrop-blur-sm">
                            <TrendingUp className="w-3.5 h-3.5" />Current Census Snapshot
                        </div>
                        <p className="text-violet-200 text-sm">{new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-8">
                        {[
                            { icon: Home, label: 'Households', value: stats?.total_households ?? 0 },
                            { icon: Users, label: 'Population', value: stats?.total_population ?? 0 },
                            { icon: ShieldAlert, label: 'Vulnerable', value: totalVulnerable },
                        ].map(s => {
                            const Icon = s.icon;
                            return (
                                <div key={s.label} className="text-center">
                                    <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center mx-auto mb-2"><Icon className="w-4.5 h-4.5 text-white" /></div>
                                    <p className="text-4xl font-bold text-white">{isLoading ? '—' : s.value.toLocaleString()}</p>
                                    <p className="text-violet-200 text-xs mt-1">{s.label}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 3-col Report Cards */}
            <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Available Reports</p>
                <div className="grid grid-cols-3 gap-4">
                    {REPORTS.map(r => {
                        const Icon = r.icon;
                        return (
                            <Link key={r.href} href={r.href}
                                className="group bg-white border border-slate-200/60 rounded-2xl p-5 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 transition-all flex flex-col">
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${r.gradient} flex items-center justify-center shadow-lg`}><Icon className="w-5 h-5 text-white" /></div>
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${r.badgeBg}`}>{r.badge}</span>
                                </div>
                                <h3 className="font-bold text-slate-900 mb-2">{r.title}</h3>
                                <p className="text-sm text-slate-500 leading-relaxed flex-1">{r.description}</p>
                                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1 text-sm font-semibold text-slate-400 group-hover:text-violet-600 transition-colors">
                                    Generate report <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Export formats */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Supported Export Formats</p>
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { fmt: 'PDF', desc: 'Print-ready document', badge: 'bg-red-500/20 text-red-300 border-red-500/30' },
                        { fmt: 'CSV', desc: 'Spreadsheet compatible', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
                        { fmt: 'Print', desc: 'Direct browser print', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                    ].map(f => (
                        <div key={f.fmt} className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded border ${f.badge}`}>{f.fmt}</span>
                            <span className="text-xs text-slate-400">{f.desc}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDashboardStats } from '@/lib/db/queries';
import { FileText, BarChart3, Users, Home, ShieldAlert, ArrowUpRight } from 'lucide-react';

const REPORTS = [
    { title: 'Monthly Demographic Summary', desc: 'Population by age group with household averages.', icon: BarChart3, href: '/reports/monthly', badge: 'Monthly', gradient: 'from-indigo-500 to-violet-600', badgeBg: 'bg-indigo-50 text-indigo-700' },
    { title: 'Vulnerable Groups Summary', desc: 'Breakdown by children, seniors, PWDs, and more.', icon: Users, href: '/reports/vulnerable', badge: 'Vulnerable', gradient: 'from-rose-500 to-pink-600', badgeBg: 'bg-rose-50 text-rose-700' },
    { title: 'Household Census Listing', desc: 'Complete masterlist organized by purok/sitio.', icon: FileText, href: '/reports/households', badge: 'Census', gradient: 'from-emerald-500 to-teal-600', badgeBg: 'bg-emerald-50 text-emerald-700' },
];

export default function ReportsMobile() {
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
        <div className="p-4 space-y-4">
            <div>
                <h1 className="text-lg font-bold text-slate-900">Reports Center</h1>
                <p className="text-xs text-slate-400">Generate official MSWDO reports</p>
            </div>

            {/* Compact stats banner */}
            <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg shadow-violet-500/20">
                <div className="absolute -top-8 -right-8 w-28 h-28 bg-violet-400/30 rounded-full blur-2xl" />
                <div className="relative z-10 grid grid-cols-3 gap-3 text-center">
                    {[
                        { icon: Home, label: 'Households', value: stats?.total_households ?? 0 },
                        { icon: Users, label: 'Population', value: stats?.total_population ?? 0 },
                        { icon: ShieldAlert, label: 'Vulnerable', value: totalVulnerable },
                    ].map(s => {
                        const Icon = s.icon;
                        return (
                            <div key={s.label}>
                                <p className="text-2xl font-bold text-white">{isLoading ? '—' : s.value}</p>
                                <p className="text-violet-200 text-[10px] mt-0.5">{s.label}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Report cards */}
            <div className="space-y-2">
                {REPORTS.map(r => {
                    const Icon = r.icon;
                    return (
                        <Link key={r.href} href={r.href}
                            className="group flex items-center gap-3 bg-white border border-slate-200/60 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md transition-all">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${r.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
                                <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-900 text-sm">{r.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5 truncate">{r.desc}</p>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500 flex-shrink-0" />
                        </Link>
                    );
                })}
            </div>

            {/* Export formats */}
            <div className="bg-slate-900 rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Export Formats</p>
                <div className="flex gap-2">
                    {[
                        { fmt: 'PDF', badge: 'bg-red-500/20 text-red-300 border-red-500/30' },
                        { fmt: 'CSV', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
                        { fmt: 'Print', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                    ].map(f => (
                        <span key={f.fmt} className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${f.badge}`}>{f.fmt}</span>
                    ))}
                </div>
            </div>
        </div>
    );
}

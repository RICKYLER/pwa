'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission, restoreSession } from '@/lib/auth';
import { db } from '@/lib/db/indexeddb';
import { getDashboardStats, getTopPuroksByVulnerability } from '@/lib/db/queries';
import { Users, Home, Baby, ShieldAlert, Package, FileText, ChevronRight, AlertTriangle, Activity } from 'lucide-react';

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

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

export default function DashboardMobile() {
    const router = useRouter();
    const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function init() {
            try {
                await db.init();
                const u = restoreSession();
                if (!u) { router.push('/login'); return; }
                setUser(u);
                const s = await getDashboardStats(u.barangay_id);
                setStats(s);
            } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
            finally { setIsLoading(false); }
        }
        init();
    }, [router]);

    if (!user) return null;

    const firstName = user.name?.split(' ')[0] ?? 'there';
    const totalVulnerable = stats
        ? stats.children_count + stats.seniors_count + stats.pwd_count + stats.pregnant_count + stats.chronic_count
        : 0;

    return (
        <div className="p-4 space-y-4">
            {/* Greeting Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 text-white shadow-xl shadow-indigo-500/20">
                <div className="absolute -top-10 -right-10 w-36 h-36 bg-violet-400/30 rounded-full blur-2xl" />
                <div className="relative z-10">
                    <p className="text-indigo-200 text-xs">{greeting()}, {firstName} 👋</p>
                    <h2 className="text-xl font-bold mt-0.5 mb-2">
                        {isLoading ? 'Loading…' : `${(stats?.total_population ?? 0).toLocaleString()} residents`}
                    </h2>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/15 rounded-full text-xs font-medium border border-white/20">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        System online
                    </span>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* KPI Cards — 2 col */}
            {isLoading ? (
                <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-200/60 p-4 animate-pulse h-24">
                            <div className="w-8 h-8 rounded-xl bg-slate-100 mb-2" />
                            <div className="h-6 bg-slate-100 rounded w-1/2 mb-1" />
                            <div className="h-3 bg-slate-100 rounded w-2/3" />
                        </div>
                    ))}
                </div>
            ) : stats ? (
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { label: 'Households', value: stats.total_households, icon: Home, light: 'bg-blue-50 text-blue-600', gradient: 'from-blue-600 to-indigo-600', href: '/households' },
                        { label: 'Population', value: stats.total_population, icon: Users, light: 'bg-emerald-50 text-emerald-600', gradient: 'from-emerald-500 to-teal-600', href: '/households' },
                        { label: 'Children', value: stats.children_count, icon: Baby, light: 'bg-violet-50 text-violet-600', gradient: 'from-violet-500 to-purple-600', href: '/vulnerability' },
                        { label: 'Vulnerable', value: totalVulnerable, icon: ShieldAlert, light: 'bg-rose-50 text-rose-600', gradient: 'from-rose-500 to-pink-600', href: '/vulnerability' },
                    ].map(c => {
                        const Icon = c.icon;
                        return (
                            <Link key={c.label} href={c.href} className="group relative bg-white rounded-2xl border border-slate-200/60 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden">
                                <Icon className="absolute -bottom-1 -right-1 w-14 h-14 text-slate-100" strokeWidth={0.8} />
                                <div className={`w-8 h-8 rounded-xl ${c.light} flex items-center justify-center mb-3`}><Icon className="w-3.5 h-3.5" /></div>
                                <p className={`text-2xl font-bold bg-gradient-to-br ${c.gradient} bg-clip-text text-transparent`}>{c.value.toLocaleString()}</p>
                                <p className="text-xs text-slate-400 mt-0.5 font-medium">{c.label}</p>
                            </Link>
                        );
                    })}
                </div>
            ) : null}

            {/* Quick Actions */}
            {[
                hasPermission('create_household') && { href: '/households/new', label: 'Add Household', icon: Home, color: 'from-blue-600 to-indigo-600' },
                hasPermission('view_vulnerability') && { href: '/vulnerability', label: 'Risk Profiles', icon: ShieldAlert, color: 'from-rose-500 to-pink-600' },
                hasPermission('view_reports') && { href: '/distribution', label: 'Distribution', icon: Package, color: 'from-emerald-500 to-teal-600' },
                hasPermission('view_reports') && { href: '/reports', label: 'Reports', icon: FileText, color: 'from-violet-500 to-purple-600' },
            ].filter(Boolean).length > 0 && (
                    <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Quick Actions</p>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                hasPermission('create_household') && { href: '/households/new', label: 'Add Household', icon: Home, color: 'from-blue-600 to-indigo-600' },
                                hasPermission('view_vulnerability') && { href: '/vulnerability', label: 'Risk Profiles', icon: ShieldAlert, color: 'from-rose-500 to-pink-600' },
                                hasPermission('view_reports') && { href: '/distribution', label: 'Distribution', icon: Package, color: 'from-emerald-500 to-teal-600' },
                                hasPermission('view_reports') && { href: '/reports', label: 'Reports', icon: FileText, color: 'from-violet-500 to-purple-600' },
                            ].filter(Boolean).map((link: any) => {
                                const Icon = link.icon;
                                return (
                                    <Link key={link.href} href={link.href} className="flex items-center gap-2.5 p-3 bg-white border border-slate-200/60 rounded-2xl hover:border-slate-300 hover:shadow-md transition-all">
                                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${link.color} flex items-center justify-center shadow-sm flex-shrink-0`}>
                                            <Icon className="w-4 h-4 text-white" />
                                        </div>
                                        <p className="text-sm font-semibold text-slate-800 leading-tight">{link.label}</p>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}

            {/* Vulnerability Summary */}
            {stats && !isLoading && (
                <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold text-slate-800">Vulnerability Summary</p>
                        <Link href="/vulnerability" className="text-xs text-indigo-500 font-semibold flex items-center gap-0.5">View all <ChevronRight className="w-3 h-3" /></Link>
                    </div>
                    <div className="space-y-2.5">
                        {[
                            { label: 'Children', value: stats.children_count, color: 'bg-blue-500' },
                            { label: 'Seniors', value: stats.seniors_count, color: 'bg-orange-500' },
                            { label: 'PWD', value: stats.pwd_count, color: 'bg-red-500' },
                            { label: 'Pregnant', value: stats.pregnant_count, color: 'bg-pink-500' },
                            { label: 'Chronic', value: stats.chronic_count, color: 'bg-purple-500' },
                        ].map(v => (
                            <div key={v.label} className="flex items-center gap-3">
                                <span className="text-xs text-slate-500 w-16">{v.label}</span>
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${v.color} rounded-full`} style={{ width: totalVulnerable > 0 ? `${((v.value / totalVulnerable) * 100).toFixed(0)}%` : '0%' }} />
                                </div>
                                <span className="text-xs font-bold text-slate-700 w-6 text-right">{v.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

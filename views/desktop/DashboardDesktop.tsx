'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission, restoreSession } from '@/lib/auth';
import { db } from '@/lib/db/indexeddb';
import { getDashboardStats, getTopPuroksByPopulation, getTopPuroksByVulnerability } from '@/lib/db/queries';
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

export default function DashboardDesktop() {
    const router = useRouter();
    const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [topVulnerable, setTopVulnerable] = useState<Array<{ purok: string; vulnerable_count: number }>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function init() {
            try {
                await db.init();
                const u = restoreSession();
                if (!u) { router.push('/login'); return; }
                setUser(u);
                const [s, , vuln] = await Promise.all([
                    getDashboardStats(u.barangay_id),
                    getTopPuroksByPopulation(u.barangay_id),
                    getTopPuroksByVulnerability(u.barangay_id),
                ]);
                setStats(s);
                setTopVulnerable(vuln);
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

    const kpiCards = stats ? [
        { label: 'Total Households', value: stats.total_households, icon: Home, light: 'bg-blue-50 text-blue-600', gradient: 'from-blue-600 to-indigo-600', href: '/households' },
        { label: 'Total Population', value: stats.total_population, icon: Users, light: 'bg-emerald-50 text-emerald-600', gradient: 'from-emerald-500 to-teal-600', href: '/households' },
        { label: 'Children (0–17)', value: stats.children_count, icon: Baby, light: 'bg-violet-50 text-violet-600', gradient: 'from-violet-500 to-purple-600', href: '/vulnerability' },
        { label: 'Vulnerable Total', value: totalVulnerable, icon: ShieldAlert, light: 'bg-rose-50 text-rose-600', gradient: 'from-rose-500 to-pink-600', href: '/vulnerability' },
    ] : [];

    const vulnBreakdown = stats ? [
        { label: 'Children', value: stats.children_count, color: 'bg-blue-500' },
        { label: 'Seniors', value: stats.seniors_count, color: 'bg-orange-500' },
        { label: 'PWD', value: stats.pwd_count, color: 'bg-red-500' },
        { label: 'Pregnant', value: stats.pregnant_count, color: 'bg-pink-500' },
        { label: 'Chronic', value: stats.chronic_count, color: 'bg-purple-500' },
        { label: 'Low-Income', value: stats.low_income_count, color: 'bg-amber-500' },
    ] : [];

    const quickLinks = [
        { href: '/households/new', label: 'Add Household', icon: Home, color: 'from-blue-600 to-indigo-600', perm: 'create_household' },
        { href: '/vulnerability', label: 'Risk Profiles', icon: ShieldAlert, color: 'from-rose-500 to-pink-600', perm: 'view_vulnerability' },
        { href: '/distribution', label: 'Distribution', icon: Package, color: 'from-emerald-500 to-teal-600', perm: 'view_reports' },
        { href: '/reports', label: 'Reports Center', icon: FileText, color: 'from-violet-500 to-purple-600', perm: 'view_reports' },
    ].filter(l => hasPermission(l.perm as any));

    return (
        <div className="p-8 space-y-6 max-w-[1400px] mx-auto">

            {/* Greeting Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-8 text-white shadow-xl shadow-indigo-500/20">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-violet-400/30 rounded-full blur-3xl" />
                <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-indigo-400/20 rounded-full blur-2xl" />
                <div className="relative z-10 flex items-end justify-between">
                    <div>
                        <p className="text-indigo-200 text-sm font-medium">{greeting()}, {firstName} 👋</p>
                        <h2 className="text-3xl font-bold mt-1 mb-3">
                            {isLoading ? 'Loading census…' : `${(stats?.total_population ?? 0).toLocaleString()} residents tracked`}
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 backdrop-blur-sm rounded-full text-xs font-medium border border-white/20">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                System online
                            </span>
                            <span className="text-xs text-indigo-300">
                                {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </div>
                    </div>
                    {stats && (
                        <div className="flex gap-8 text-center">
                            {[
                                { label: 'Households', value: stats.total_households },
                                { label: 'Vulnerable', value: totalVulnerable },
                                { label: 'Children', value: stats.children_count },
                            ].map(s => (
                                <div key={s.label}>
                                    <div className="w-px bg-white/20 absolute" />
                                    <p className="text-4xl font-bold text-white">{s.value}</p>
                                    <p className="text-xs text-indigo-200 mt-1">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
            )}

            {/* KPI — 4 col */}
            {isLoading ? (
                <div className="grid grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-200/60 p-5 animate-pulse h-32">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 mb-4" /><div className="h-8 bg-slate-100 rounded w-1/2 mb-2" /><div className="h-3 bg-slate-100 rounded w-2/3" />
                        </div>
                    ))}
                </div>
            ) : stats ? (
                <div className="grid grid-cols-4 gap-4">
                    {kpiCards.map(c => {
                        const Icon = c.icon;
                        return (
                            <Link key={c.label} href={c.href} className="group relative bg-white rounded-2xl border border-slate-200/60 p-5 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 transition-all overflow-hidden">
                                <Icon className="absolute -bottom-2 -right-2 w-20 h-20 text-slate-100 group-hover:text-slate-200 transition-colors" strokeWidth={0.8} />
                                <div className={`w-9 h-9 rounded-xl ${c.light} flex items-center justify-center mb-4`}><Icon className="w-4.5 h-4.5" /></div>
                                <p className={`text-4xl font-bold bg-gradient-to-br ${c.gradient} bg-clip-text text-transparent`}>{c.value.toLocaleString()}</p>
                                <p className="text-sm text-slate-500 mt-1 font-medium">{c.label}</p>
                                <div className="mt-3 flex items-center gap-1 text-xs text-slate-400 group-hover:text-indigo-500 transition-colors font-medium">View details <ChevronRight className="w-3.5 h-3.5" /></div>
                            </Link>
                        );
                    })}
                </div>
            ) : null}

            {/* Charts + Hotspot */}
            {stats && !isLoading && (
                <div className="grid grid-cols-3 gap-5">
                    {/* Vulnerability breakdown — 2/3 width */}
                    <div className="col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Vulnerability Breakdown</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Distribution by category</p>
                            </div>
                            <Link href="/vulnerability" className="text-xs text-indigo-500 font-semibold hover:text-indigo-700 transition-colors flex items-center gap-0.5">View all <ChevronRight className="w-3.5 h-3.5" /></Link>
                        </div>
                        <div className="space-y-4">
                            {vulnBreakdown.map(v => (
                                <div key={v.label} className="flex items-center gap-4">
                                    <span className="text-sm text-slate-500 w-24">{v.label}</span>
                                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full ${v.color} rounded-full transition-all duration-700`} style={{ width: totalVulnerable > 0 ? `${((v.value / totalVulnerable) * 100).toFixed(0)}%` : '0%' }} />
                                    </div>
                                    <span className="text-sm font-bold text-slate-700 w-8 text-right">{v.value}</span>
                                    <span className="text-xs text-slate-400 w-10 text-right">{totalVulnerable > 0 ? `${((v.value / totalVulnerable) * 100).toFixed(0)}%` : '0%'}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hotspot — 1/3 width */}
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
                        <h3 className="text-base font-bold text-slate-900 mb-1">Hotspot Areas</h3>
                        <p className="text-xs text-slate-400 mb-5">Top puroks by vulnerability</p>
                        {topVulnerable.length > 0 ? (
                            <div className="space-y-3">
                                {topVulnerable.slice(0, 6).map((p, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="w-5 h-5 rounded-lg bg-rose-50 text-rose-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-medium text-slate-700 truncate">{p.purok}</span>
                                                <span className="text-sm font-bold text-rose-600 ml-2">{p.vulnerable_count}</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-rose-400 to-pink-500 rounded-full" style={{ width: `${((p.vulnerable_count / (topVulnerable[0]?.vulnerable_count || 1)) * 100).toFixed(0)}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-28 text-slate-400">
                                <Activity className="w-8 h-8 mb-2 opacity-40" />
                                <p className="text-sm">No data yet</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            {quickLinks.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</p>
                    <div className="grid grid-cols-4 gap-3">
                        {quickLinks.map(l => {
                            const Icon = l.icon;
                            return (
                                <Link key={l.href} href={l.href} className="group flex items-center gap-3 p-4 bg-white border border-slate-200/60 rounded-2xl hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all">
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${l.color} flex items-center justify-center shadow-sm flex-shrink-0`}><Icon className="w-5 h-5 text-white" /></div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">{l.label}</p>
                                        <p className="text-xs text-slate-400 group-hover:text-indigo-500 transition-colors flex items-center gap-0.5 mt-0.5">Open <ChevronRight className="w-3 h-3" /></p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

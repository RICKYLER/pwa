'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import { getResidents } from '@/lib/db/residents';
import type { Household, Resident } from '@/lib/db/schema';
import {
    ArrowLeft, Download, Printer, Home, Users, Search, MapPin, Loader2,
} from 'lucide-react';

interface HouseholdRow {
    household: Household;
    members: Resident[];
}

export default function HouseholdCensusPage() {
    const router = useRouter();
    const user = getCurrentUser();
    const [rows, setRows] = useState<HouseholdRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [search, setSearch] = useState('');

    const today = new Date();
    const generatedAt = today.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const monthYear = today.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

    useEffect(() => {
        if (!user) { router.push('/reports'); return; }
        const u = user;
        async function load() {
            setIsLoading(true);
            const [households, residents] = await Promise.all([
                getHouseholds({ barangay_id: u.barangay_id }),
                getResidents({ status: 'active' }),
            ]);
            const data: HouseholdRow[] = households.map(h => ({
                household: h,
                members: residents.filter(r => r.household_id === h.id),
            }));
            // Sort by purok then head name
            data.sort((a, b) =>
                a.household.purok_sitio.localeCompare(b.household.purok_sitio) ||
                a.household.head_name.localeCompare(b.household.head_name)
            );
            setRows(data);
            setIsLoading(false);
        }
        load();
    }, [user, router]);

    async function handleExportPDF() {
        if (!rows.length || !user) return;
        setIsExporting(true);
        try {
            const { exportCensusReportPDF } = await import('@/lib/pdf/exportReport');
            exportCensusReportPDF(rows, user.barangay_id ?? '');
        } finally {
            setIsExporting(false);
        }
    }

    if (!user) return null;

    // Group by purok
    const grouped = rows.reduce<Record<string, HouseholdRow[]>>((acc, r) => {
        const p = r.household.purok_sitio || 'Unknown';
        if (!acc[p]) acc[p] = [];
        acc[p].push(r);
        return acc;
    }, {});

    const searchLower = search.toLowerCase();
    const filteredGrouped: Record<string, HouseholdRow[]> = Object.fromEntries(
        Object.entries(grouped).map(([purok, items]: [string, HouseholdRow[]]) => [
            purok,
            items.filter((r: HouseholdRow) =>
                !search ||
                r.household.head_name.toLowerCase().includes(searchLower) ||
                r.household.street_address?.toLowerCase().includes(searchLower) ||
                purok.toLowerCase().includes(searchLower)
            ),
        ]).filter(([, items]) => items.length > 0)
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 print:bg-white">
            {/* Header */}
            <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl print:hidden">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
                    <Link href="/reports" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm">
                        <ArrowLeft className="w-4 h-4" /> Back to Reports
                    </Link>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3.5 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
                            <Printer className="w-4 h-4" /> Print
                        </button>
                        <button onClick={handleExportPDF} disabled={isExporting || isLoading || !rows.length}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:opacity-90 transition-all shadow-md shadow-emerald-500/25 disabled:opacity-60">
                            {isExporting
                                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Generating…</>
                                : <><Download className="w-4 h-4" />Export PDF</>}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 print:py-0 print:px-0">
                <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-900/5 overflow-hidden print:rounded-none print:border-0 print:shadow-none">

                    {/* Hero */}
                    <div className="relative bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 px-8 py-10">
                        <div className="absolute inset-0 opacity-10 print:hidden"
                            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
                        <div className="relative z-10 text-center">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white/90 text-xs font-medium rounded-full mb-4 backdrop-blur-sm">
                                <Home className="w-3.5 h-3.5" /> Household Census Listing
                            </div>
                            <h1 className="text-3xl font-bold text-white mb-2">Household Census Masterlist</h1>
                            <p className="text-emerald-200 font-medium">{monthYear}</p>
                            {user?.barangay_id && <p className="text-emerald-300 text-sm mt-1">{user.barangay_id}</p>}
                        </div>
                    </div>

                    <div className="p-8 space-y-6 print:p-6 print:space-y-4">

                        {/* Totals */}
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: 'Total Households', value: rows.length, gradient: 'from-emerald-500 to-teal-600', icon: Home },
                                { label: 'Total Residents', value: rows.reduce((s, r) => s + r.members.length, 0), gradient: 'from-indigo-500 to-violet-600', icon: Users },
                                { label: 'Puroks / Sitios', value: Object.keys(grouped).length, gradient: 'from-amber-500 to-orange-600', icon: MapPin },
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

                        {/* Search */}
                        <div className="relative print:hidden">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Filter by household head name, address, or purok…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                            />
                        </div>

                        {/* Tables by Purok */}
                        {isLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                            </div>
                        ) : Object.entries(filteredGrouped).length === 0 ? (
                            <div className="text-center py-16 text-slate-400">No households found.</div>
                        ) : (
                            Object.entries(filteredGrouped).map(([purok, items]) => (
                                <section key={purok}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                                            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">{purok}</span>
                                        </div>
                                        <span className="text-xs text-slate-400">{items.length} household{items.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="overflow-hidden rounded-2xl border border-slate-200/60">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
                                                    <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide">#</th>
                                                    <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Household Head</th>
                                                    <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Address</th>
                                                    <th className="text-center px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Members</th>
                                                    <th className="text-center px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(items as HouseholdRow[]).map((r: HouseholdRow, i: number) => (
                                                    <tr key={r.household.id} className={i % 2 === 0 ? 'bg-white' : 'bg-emerald-50/30'}>
                                                        <td className="px-4 py-2.5 text-slate-400 text-xs">{i + 1}</td>
                                                        <td className="px-4 py-2.5 font-semibold text-slate-800">{r.household.head_name}</td>
                                                        <td className="px-4 py-2.5 text-slate-500 text-xs">{r.household.street_address || '—'}</td>
                                                        <td className="px-4 py-2.5 text-center font-bold text-emerald-700">{r.members.length}</td>
                                                        <td className="px-4 py-2.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.household.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                {r.household.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            ))
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

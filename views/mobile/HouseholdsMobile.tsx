'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getHouseholds, getAllPuroks } from '@/lib/db/households';
import { getResidentsInHousehold } from '@/lib/db/residents';
import { Household } from '@/lib/db/schema';
import { Plus, Search, Users, Home, ChevronRight, MapPin, Activity, X } from 'lucide-react';
import { formatRegistrationStatusLabel, getHouseholdRegistrationStatus, isHouseholdApproved } from '@/lib/household-registration';
import { hasHouseholdPin } from '@/lib/map-pins';

const STATUS_CFG = {
    active: { label: 'Active', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20' },
    moved_out: { label: 'Moved Out', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-500/20' },
    deceased: { label: 'Deceased', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
};

export default function HouseholdsMobile() {
    const router = useRouter();
    const user = getCurrentUser();
    const [households, setHouseholds] = useState<Household[]>([]);
    const [filtered, setFiltered] = useState<Household[]>([]);
    const [puroks, setPuroks] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [filterPurok, setFilterPurok] = useState('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'moved_out' | 'deceased'>('active');
    const [isLoading, setIsLoading] = useState(true);
    const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

    const loadHouseholdsData = useCallback(async (background = false) => {
        if (!user || !hasPermission('view_households')) { router.push('/dashboard'); return; }
        const u = user;

        if (!background) {
            setIsLoading(true);
        }

        const all = await getHouseholds({ barangay_id: u.barangay_id });
        setHouseholds(all);
        const counts: Record<string, number> = {};
        for (const h of all) counts[h.id] = (await getResidentsInHousehold(h.id)).length;
        setMemberCounts(counts);
        setPuroks(await getAllPuroks(u.barangay_id));

        if (!background) {
            setIsLoading(false);
        }
    }, [user, router]);

    useEffect(() => {
        void loadHouseholdsData();
    }, [loadHouseholdsData]);

    useEffect(() => {
        function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
            if (!['households', 'residents'].includes(event.detail.table)) {
                return;
            }

            void loadHouseholdsData(true);
        }

        window.addEventListener('mswdo-data-changed', handleDataChanged);

        return () => {
            window.removeEventListener('mswdo-data-changed', handleDataChanged);
        };
    }, [loadHouseholdsData]);

    useEffect(() => {
        let r = households;
        if (filterStatus !== 'all') r = r.filter(h => h.status === filterStatus);
        if (filterPurok !== 'all') r = r.filter(h => h.purok_sitio === filterPurok);
        if (search) { const q = search.toLowerCase(); r = r.filter(h => h.head_name.toLowerCase().includes(q) || h.street_address.toLowerCase().includes(q)); }
        setFiltered(r);
    }, [households, search, filterPurok, filterStatus]);

    if (!user) return null;

    const tabs = [
        { key: 'all' as const, label: 'All', count: households.length },
        { key: 'active' as const, label: 'Active', count: households.filter(h => h.status === 'active').length },
        { key: 'moved_out' as const, label: 'Moved', count: households.filter(h => h.status === 'moved_out').length },
    ];
    const pendingCount = households.filter(h => getHouseholdRegistrationStatus(h) === 'pending').length;

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Households</h1>
                    <p className="text-xs text-slate-400">{isLoading ? 'Loading…' : `${households.length} total · ${pendingCount} pending`}</p>
                </div>
                {hasPermission('create_household') && (
                    <Link href="/households/register" className="w-9 h-9 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/25">
                        <Plus className="w-4 h-4 text-white" />
                    </Link>
                )}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Search households…" value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm" />
                {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>

            {/* Status Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setFilterStatus(t.key)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${filterStatus === t.key ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
                        {t.label}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filterStatus === t.key ? 'bg-slate-100' : 'text-slate-400'}`}>{isLoading ? '–' : t.count}</span>
                    </button>
                ))}
            </div>

            {/* List */}
            {isLoading ? (
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-slate-200/60 p-4 animate-pulse flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex-shrink-0" />
                            <div className="flex-1 space-y-2"><div className="h-4 bg-slate-100 rounded w-1/3" /><div className="h-3 bg-slate-100 rounded w-1/2" /></div>
                        </div>
                    ))}
                </div>
            ) : filtered.length > 0 ? (
                <div className="space-y-2">
                    {filtered.map(h => {
                        const cfg = STATUS_CFG[h.status as keyof typeof STATUS_CFG] || STATUS_CFG.active;
                        const registrationStatus = getHouseholdRegistrationStatus(h);
                        return (
                            <Link key={h.id} href={`/households/${h.id}`}
                                className="group flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 hover:border-blue-200 hover:shadow-md transition-all">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-sm">
                                        {h.head_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-slate-900 text-sm truncate">{h.head_name}</p>
                                        <div className="flex items-center gap-2 min-w-0 mt-0.5">
                                            <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                                                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />{h.purok_sitio}
                                            </p>
                                            {!isHouseholdApproved(h) && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200 flex-shrink-0">
                                                    {formatRegistrationStatusLabel(registrationStatus)}
                                                </span>
                                            )}
                                            {hasHouseholdPin(h) && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 flex-shrink-0">
                                                    Pinned
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                    <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
                                        <Users className="w-3 h-3" />{memberCounts[h.id] || 0}
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Activity className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-semibold mb-1">No households found</p>
                    <p className="text-slate-400 text-sm">Try adjusting your filters</p>
                </div>
            )}
        </div>
    );
}

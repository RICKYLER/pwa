'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDistributionEvents } from '@/lib/db/distribution';
import { DistributionEvent } from '@/lib/db/schema';
import { Plus, Calendar, MapPin, Package, ChevronRight } from 'lucide-react';

const STATUS = {
    planned: { label: 'Planned', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    ongoing: { label: 'Ongoing', dot: 'bg-blue-400 animate-pulse', badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    completed: { label: 'Completed', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
};

export default function DistributionMobile() {
    const router = useRouter();
    const user = getCurrentUser();
    const [events, setEvents] = useState<DistributionEvent[]>([]);
    const [filterStatus, setFilterStatus] = useState<'all' | 'planned' | 'ongoing' | 'completed'>('all');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user || !hasPermission('view_reports')) { router.push('/dashboard'); return; }
        async function load() { setIsLoading(true); setEvents(await getDistributionEvents()); setIsLoading(false); }
        load();
    }, [user, router]);

    if (!user) return null;

    const filtered = filterStatus === 'all' ? events : events.filter(e => e.status === filterStatus);
    const counts = { all: events.length, planned: events.filter(e => e.status === 'planned').length, ongoing: events.filter(e => e.status === 'ongoing').length, completed: events.filter(e => e.status === 'completed').length };

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Distribution</h1>
                    <p className="text-xs text-slate-400">{isLoading ? 'Loading…' : `${counts.ongoing} ongoing · ${counts.planned} planned`}</p>
                </div>
                {hasPermission('manage_inventory') && (
                    <Link href="/distribution/new" className="w-9 h-9 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/25">
                        <Plus className="w-4 h-4 text-white" />
                    </Link>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                {(['all', 'planned', 'ongoing', 'completed'] as const).map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${filterStatus === s ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
                        {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                        <span className="ml-1 text-[10px] text-slate-400">{counts[s]}</span>
                    </button>
                ))}
            </div>

            {/* List */}
            {isLoading ? (
                <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-200/60 p-4 animate-pulse h-24" />)}
                </div>
            ) : filtered.length > 0 ? (
                <div className="space-y-2">
                    {filtered.map(event => {
                        const cfg = STATUS[event.status as keyof typeof STATUS] || STATUS.planned;
                        const schedDate = new Date(event.scheduled_date);
                        return (
                            <Link key={event.id} href={`/distribution/${event.id}`}
                                className="group flex items-center gap-3 bg-white border border-slate-200/60 rounded-2xl p-4 hover:border-emerald-200 hover:shadow-md transition-all">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                                    <Package className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-slate-900 text-sm truncate">{event.event_name}</p>
                                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                        <MapPin className="w-3 h-3 flex-shrink-0" />{event.location}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                                        </span>
                                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                            <Calendar className="w-2.5 h-2.5" />{schedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-400 flex-shrink-0" />
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-semibold mb-1">No {filterStatus === 'all' ? '' : filterStatus} events</p>
                    <p className="text-slate-400 text-sm">Create a new distribution event</p>
                </div>
            )}
        </div>
    );
}

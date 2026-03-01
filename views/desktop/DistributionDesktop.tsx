'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDistributionEvents } from '@/lib/db/distribution';
import { DistributionEvent } from '@/lib/db/schema';
import { Plus, Calendar, MapPin, Package, ChevronRight, Clock, CheckCircle2, Truck } from 'lucide-react';

const STATUS_CFG = {
    planned: { label: 'Planned', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', border: 'hover:border-amber-200' },
    ongoing: { label: 'Ongoing', dot: 'bg-blue-400 animate-pulse', badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', border: 'hover:border-blue-200' },
    completed: { label: 'Completed', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', border: 'hover:border-emerald-200' },
};

export default function DistributionDesktop() {
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
        <div className="p-8 max-w-[1400px] mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Distribution Events</h1>
                    <p className="text-sm text-slate-500 mt-0.5">{counts.all} event{counts.all !== 1 ? 's' : ''} · {counts.ongoing} ongoing · {counts.planned} planned</p>
                </div>
                {hasPermission('manage_inventory') && (
                    <Link href="/distribution/new" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-md shadow-emerald-500/25 hover:-translate-y-px">
                        <Plus className="w-4 h-4" />New Event
                    </Link>
                )}
            </div>

            {/* Summary Strip */}
            <div className="grid grid-cols-3 gap-4">
                {([
                    { key: 'planned' as const, label: 'Planned', icon: Clock, light: 'bg-amber-50 text-amber-600', gradient: 'from-amber-500 to-orange-500' },
                    { key: 'ongoing' as const, label: 'Ongoing', icon: Truck, light: 'bg-blue-50 text-blue-600', gradient: 'from-blue-500 to-cyan-600' },
                    { key: 'completed' as const, label: 'Completed', icon: CheckCircle2, light: 'bg-emerald-50 text-emerald-600', gradient: 'from-emerald-500 to-teal-600' },
                ]).map(s => {
                    const Icon = s.icon;
                    return (
                        <button key={s.key} onClick={() => setFilterStatus(filterStatus === s.key ? 'all' : s.key)}
                            className={`bg-white rounded-2xl border p-5 text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${filterStatus === s.key ? 'border-slate-300 shadow-md' : 'border-slate-200/60'}`}>
                            <div className={`inline-flex w-8 h-8 items-center justify-center rounded-xl ${s.light} mb-3`}><Icon className="w-4 h-4" /></div>
                            <p className={`text-3xl font-bold bg-gradient-to-br ${s.gradient} bg-clip-text text-transparent`}>{isLoading ? '—' : counts[s.key]}</p>
                            <p className="text-xs text-slate-400 font-medium mt-1">{s.label}</p>
                        </button>
                    );
                })}
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 bg-white border border-slate-200/60 shadow-sm p-1.5 rounded-xl w-auto inline-flex">
                {(['all', 'planned', 'ongoing', 'completed'] as const).map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)}
                        className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${filterStatus === s ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
                        {s === 'all' ? 'All Events' : s.charAt(0).toUpperCase() + s.slice(1)}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterStatus === s ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>{counts[s]}</span>
                    </button>
                ))}
            </div>

            {/* 3-col Grid */}
            {isLoading ? (
                <div className="grid grid-cols-3 gap-3">
                    {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-200/60 p-5 animate-pulse h-36" />)}
                </div>
            ) : filtered.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                    {filtered.map(event => {
                        const cfg = STATUS_CFG[event.status as keyof typeof STATUS_CFG] || STATUS_CFG.planned;
                        const schedDate = new Date(event.scheduled_date);
                        const isPast = schedDate < new Date() && event.status !== 'completed';
                        return (
                            <Link key={event.id} href={`/distribution/${event.id}`}
                                className={`group block bg-white border border-slate-200/60 rounded-2xl p-5 ${cfg.border} hover:shadow-lg transition-all hover:-translate-y-0.5`}>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0"><Package className="w-5 h-5 text-emerald-600" /></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 text-sm truncate">{event.event_name}</p>
                                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{event.location}</p>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${cfg.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`flex items-center gap-1.5 text-xs ${isPast ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
                                        <Calendar className="w-3.5 h-3.5" />
                                        {schedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        {isPast && <span className="text-amber-500">· overdue</span>}
                                    </span>
                                    <span className="text-xs text-emerald-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">View <ChevronRight className="w-3.5 h-3.5" /></span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-700 font-semibold mb-1">No {filterStatus === 'all' ? '' : filterStatus} events</p>
                    <p className="text-slate-400 text-sm mb-5">Create your first distribution event</p>
                    {hasPermission('manage_inventory') && (
                        <Link href="/distribution/new" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium rounded-xl hover:opacity-90 shadow-md shadow-emerald-500/25">
                            <Plus className="w-4 h-4" />New Event
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}

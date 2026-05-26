'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { deleteDistributionEvent, getDistributionEvents } from '@/lib/db/distribution';
import { getZeroEligibilityDistributionEvents } from '@/lib/db/queries';
import { DistributionEvent } from '@/lib/db/schema';
import { Plus, Calendar, MapPin, Package, ChevronRight, Clock, CheckCircle2, Truck, Trash2, AlertTriangle, X } from 'lucide-react';

const STATUS_CFG = {
    planned: { label: 'Planned', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', border: 'hover:border-amber-200' },
    ongoing: { label: 'Ongoing', dot: 'bg-blue-400 animate-pulse', badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', border: 'hover:border-blue-200' },
    completed: { label: 'Completed', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', border: 'hover:border-emerald-200' },
};

// ─── Confirmation Dialog ──────────────────────────────────────────────────────
interface DeleteDialogProps {
    event: DistributionEvent;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
    isDeleting: boolean;
}

function DeleteDialog({ event, onConfirm, onCancel, isDeleting }: DeleteDialogProps) {
    return (
        // Backdrop
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onCancel}
        >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

            {/* Dialog panel */}
            <div
                className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-900/20 border border-slate-200/60 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Red accent bar at top */}
                <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />

                <div className="p-6">
                    {/* Icon + heading */}
                    <div className="flex items-start gap-4 mb-5">
                        <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-base font-bold text-slate-900">Delete Event?</h2>
                            <p className="text-sm text-slate-500 mt-0.5">
                                This will permanently delete this distribution event and all its records. This cannot be undone.
                            </p>
                        </div>
                        <button
                            onClick={onCancel}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all flex-shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Event summary card */}
                    <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 mb-6">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4.5 h-4.5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{event.event_name}</p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0" />{event.location}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onCancel}
                            disabled={isDeleting}
                            className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isDeleting}
                            className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:opacity-90 transition-all shadow-md shadow-red-500/25 disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {isDeleting ? (
                                <>
                                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    Deleting…
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Yes, Delete
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function DistributionDesktop() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = getCurrentUser();
    const [events, setEvents] = useState<DistributionEvent[]>([]);
    const [zeroMatchEventIds, setZeroMatchEventIds] = useState<Set<string>>(new Set());
    const [filterStatus, setFilterStatus] = useState<'all' | 'planned' | 'ongoing' | 'completed'>('all');
    const [isLoading, setIsLoading] = useState(true);
    // Which event is pending deletion (shows dialog), and whether delete is in progress
    const [pendingDelete, setPendingDelete] = useState<DistributionEvent | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const issueFilter = searchParams.get('issue');
    const isZeroMatchMode = issueFilter === 'zero_matches';

    useEffect(() => {
        if (!user || !hasPermission('view_reports')) { router.push('/dashboard'); return; }
        async function load() {
            if (!user) {
                return;
            }
            setIsLoading(true);
            const [allEvents, zeroMatchEvents] = await Promise.all([
                getDistributionEvents(),
                getZeroEligibilityDistributionEvents(user.role === 'admin' ? undefined : user.barangay_id),
            ]);
            setEvents(allEvents);
            setZeroMatchEventIds(new Set(zeroMatchEvents.map((entry) => entry.event.id)));
            setIsLoading(false);
        }
        load();
    }, [router, user]);

    if (!user) return null;

    const filtered = (filterStatus === 'all' ? events : events.filter(e => e.status === filterStatus))
        .filter((event) => !isZeroMatchMode || zeroMatchEventIds.has(event.id));
    const counts = { all: events.length, planned: events.filter(e => e.status === 'planned').length, ongoing: events.filter(e => e.status === 'ongoing').length, completed: events.filter(e => e.status === 'completed').length };

    async function handleConfirmDelete() {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            await deleteDistributionEvent(pendingDelete.id);
            setEvents(prev => prev.filter(e => e.id !== pendingDelete.id));
            setPendingDelete(null);
        } catch (err) {
            console.error(err);
        } finally {
            setIsDeleting(false);
        }
    }

    const canDelete = hasPermission('manage_inventory');

    return (
        <>
            {/* ── Delete confirmation dialog ─────────────────────────────── */}
            {pendingDelete && (
                <DeleteDialog
                    event={pendingDelete}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setPendingDelete(null)}
                    isDeleting={isDeleting}
                />
            )}

            <div className="p-8 max-w-[1400px] mx-auto space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Distribution Events</h1>
                        <p className="text-sm text-slate-500 mt-0.5">{counts.all} event{counts.all !== 1 ? 's' : ''} · {counts.ongoing} ongoing · {counts.planned} planned</p>
                    </div>
                    {canDelete && (
                        <Link href="/distribution/new" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-md shadow-emerald-500/25 hover:-translate-y-px">
                            <Plus className="w-4 h-4" />New Event
                        </Link>
                    )}
                </div>

                {isZeroMatchMode && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Showing planned and ongoing events that currently have zero eligible matches.
                    </div>
                )}

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
                            const hasZeroMatches = zeroMatchEventIds.has(event.id);
                            return (
                                <div key={event.id} className={`group relative bg-white border border-slate-200/60 rounded-2xl ${cfg.border} hover:shadow-lg transition-all hover:-translate-y-0.5`}>
                                    <Link href={`/distribution/${event.id}`} prefetch={false} className="block p-5">
                                        <div className="flex items-start gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0"><Package className="w-5 h-5 text-emerald-600" /></div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-900 text-sm truncate">{event.event_name}</p>
                                                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{event.location}</p>
                                                {hasZeroMatches ? (
                                                    <p className="mt-1 text-[11px] font-semibold text-amber-700">0 eligible matches right now</p>
                                                ) : null}
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

                                    {/* Delete button — only for users with manage_inventory */}
                                    {canDelete && (
                                        <button
                                            onClick={e => { e.preventDefault(); setPendingDelete(event); }}
                                            title="Delete event"
                                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                        <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-700 font-semibold mb-1">No {filterStatus === 'all' ? '' : filterStatus} events</p>
                        <p className="text-slate-400 text-sm mb-5">Create your first distribution event</p>
                        {canDelete && (
                            <Link href="/distribution/new" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium rounded-xl hover:opacity-90 shadow-md shadow-emerald-500/25">
                                <Plus className="w-4 h-4" />New Event
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

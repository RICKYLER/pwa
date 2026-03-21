'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDistributionEvents, deleteDistributionEvent } from '@/lib/db/distribution';
import { DistributionEvent } from '@/lib/db/schema';
import { Plus, Calendar, MapPin, Package, ChevronRight, Trash2, AlertTriangle, X } from 'lucide-react';

const STATUS = {
    planned: { label: 'Planned', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    ongoing: { label: 'Ongoing', dot: 'bg-blue-400 animate-pulse', badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    completed: { label: 'Completed', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
};

// ─── Confirmation Bottom-sheet / Dialog ───────────────────────────────────────
interface DeleteSheetProps {
    event: DistributionEvent;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
    isDeleting: boolean;
}

function DeleteSheet({ event, onConfirm, onCancel, isDeleting }: DeleteSheetProps) {
    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onCancel}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

            {/* Bottom sheet */}
            <div
                className="relative z-10 bg-white rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>

                {/* Red accent */}
                <div className="mx-4 mt-2 mb-0 h-0.5 rounded-full bg-gradient-to-r from-red-400 to-rose-500 opacity-60" />

                <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                    {/* Heading */}
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-base font-bold text-slate-900">Delete Event?</h2>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                                This will permanently delete this event and all its distribution records. This cannot be undone.
                            </p>
                        </div>
                        <button onClick={onCancel} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Event preview */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 mb-5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{event.event_name}</p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0" />{event.location}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            disabled={isDeleting}
                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
                        >
                            Keep It
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isDeleting}
                            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:opacity-90 transition-all shadow-lg shadow-red-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
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
export default function DistributionMobile() {
    const router = useRouter();
    const user = getCurrentUser();
    const [events, setEvents] = useState<DistributionEvent[]>([]);
    const [filterStatus, setFilterStatus] = useState<'all' | 'planned' | 'ongoing' | 'completed'>('all');
    const [isLoading, setIsLoading] = useState(true);
    const [pendingDelete, setPendingDelete] = useState<DistributionEvent | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!user || !hasPermission('view_reports')) { router.push('/dashboard'); return; }
        async function load() { setIsLoading(true); setEvents(await getDistributionEvents()); setIsLoading(false); }
        load();
    }, [user, router]);

    if (!user) return null;

    const filtered = filterStatus === 'all' ? events : events.filter(e => e.status === filterStatus);
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
            {/* ── Delete confirmation bottom sheet ───────────────────────── */}
            {pendingDelete && (
                <DeleteSheet
                    event={pendingDelete}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setPendingDelete(null)}
                    isDeleting={isDeleting}
                />
            )}

            <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">Distribution</h1>
                        <p className="text-xs text-slate-400">{isLoading ? 'Loading…' : `${counts.ongoing} ongoing · ${counts.planned} planned`}</p>
                    </div>
                    {canDelete && (
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
                            const isPast = schedDate < new Date() && event.status !== 'completed';
                            return (
                                <div key={event.id} className="group relative flex items-center gap-3 bg-white border border-slate-200/60 rounded-2xl p-4 hover:border-emerald-200 hover:shadow-md transition-all">
                                    {/* Card is a link, delete button sits separately */}
                                    <Link href={`/distribution/${event.id}`} className="flex items-center gap-3 flex-1 min-w-0">
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
                                                <span className={`text-[10px] flex items-center gap-1 ${isPast ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                                                    <Calendar className="w-2.5 h-2.5" />{schedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    {isPast && <span>· overdue</span>}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>

                                    {/* Right side: View arrow + delete */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {canDelete && (
                                            <button
                                                onClick={() => setPendingDelete(event)}
                                                title="Delete event"
                                                className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-slate-300" />
                                    </div>
                                </div>
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
        </>
    );
}

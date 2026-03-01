'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { createDistributionEvent } from '@/lib/db/distribution';
import MapLocationPicker from '@/components/MapLocationPicker';
import { ArrowLeft, Package, Calendar, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import type { DistributionType } from '@/lib/db/schema';

const EVENT_TYPES: { value: DistributionType; label: string; desc: string; color: string }[] = [
    { value: 'regular', label: 'Regular', desc: 'Scheduled community distribution', color: 'border-indigo-300 bg-indigo-50 text-indigo-700' },
    { value: 'emergency', label: 'Emergency', desc: 'Urgent response relief', color: 'border-amber-300 bg-amber-50 text-amber-700' },
    { value: 'disaster_relief', label: 'Disaster Relief', desc: 'Post-disaster assistance', color: 'border-red-300 bg-red-50 text-red-700' },
];

const DISTRIBUTION_NAMES = [
    'Senior Relief', 'PWD Assistance', 'Maternal Health', 'Child Support',
    'Chronic Illness Support', 'General Relief', 'Food Pack Distribution',
    'Medical Assistance', 'Livelihood Kit',
];

export default function NewDistributionPage() {
    const router = useRouter();
    const user = getCurrentUser();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const [form, setForm] = useState({
        event_name: '',
        type: 'regular' as DistributionType,
        location: '',         // human-readable address from map
        gps_lat: null as number | null,
        gps_lng: null as number | null,
        scheduled_date: '',
        status: 'planned' as const,
        notes: '',
    });

    useEffect(() => {
        if (!user || !hasPermission('manage_inventory')) {
            router.push('/distribution');
        }
    }, [user, router]);

    function set<K extends keyof typeof form>(field: K, value: typeof form[K]) {
        setForm(f => ({ ...f, [field]: value }));
        setError('');
    }

    /** Called by the MapLocationPicker when the user pins a location */
    function handleLocationChange(address: string, coords: { lat: number; lng: number }) {
        setForm(f => ({ ...f, location: address, gps_lat: coords.lat, gps_lng: coords.lng }));
        setError('');
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;
        if (!form.event_name.trim()) { setError('Event name is required.'); return; }
        if (!form.location.trim()) { setError('Please pin a location on the map.'); return; }
        if (!form.scheduled_date) { setError('Scheduled date is required.'); return; }

        try {
            setIsSubmitting(true);
            await createDistributionEvent({
                event_name: form.event_name.trim(),
                type: form.type,
                location: form.location.trim(),
                gps_lat: form.gps_lat ?? undefined,
                gps_lng: form.gps_lng ?? undefined,
                scheduled_date: form.scheduled_date,
                status: form.status,
                notes: form.notes.trim() || undefined,
                created_by: user.id,
            }, user.id);
            setSuccess(true);
            setTimeout(() => router.push('/distribution'), 1200);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create event.');
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Top bar */}
            <header className="sticky top-0 z-10 bg-white border-b border-slate-200/70 shadow-sm">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
                    <Link
                        href="/distribution"
                        className="p-2 -ml-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                        aria-label="Back to Distribution"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 leading-none">New Distribution Event</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Fill in the details and pin your location</p>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Package className="w-4 h-4 text-emerald-600" />
                    </div>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
                {success ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4 shadow-lg shadow-emerald-100">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        </div>
                        <p className="text-lg font-bold text-slate-900">Event Created!</p>
                        <p className="text-sm text-slate-400 mt-1">Redirecting to Distribution…</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>

                        {/* Event Type */}
                        <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-3">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Event Type</p>
                            <div className="grid grid-cols-3 gap-2">
                                {EVENT_TYPES.map(t => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => set('type', t.value)}
                                        className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${form.type === t.value ? t.color + ' border-current' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'}`}
                                    >
                                        <span className="text-xs font-bold">{t.label}</span>
                                        <span className="text-[10px] mt-0.5 leading-tight opacity-80">{t.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Event Details */}
                        <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-3">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Event Details</p>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                    Event Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    list="event-name-suggestions"
                                    type="text"
                                    placeholder="e.g. General Relief Distribution"
                                    value={form.event_name}
                                    onChange={e => set('event_name', e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                                />
                                <datalist id="event-name-suggestions">
                                    {DISTRIBUTION_NAMES.map(n => <option key={n} value={n} />)}
                                </datalist>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> Scheduled Date <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={form.scheduled_date}
                                        onChange={e => set('scheduled_date', e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Initial Status</label>
                                    <select
                                        value={form.status}
                                        onChange={e => set('status', e.target.value as typeof form.status)}
                                        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none"
                                    >
                                        <option value="planned">Planned</option>
                                        <option value="ongoing">Ongoing</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Map Location Picker */}
                        <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-3">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Location <span className="text-red-400">*</span>
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Search an address or click the map to drop a pin</p>
                            </div>
                            <MapLocationPicker onLocationChange={handleLocationChange} />
                        </div>

                        {/* Notes */}
                        <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-3">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5" /> Notes <span className="font-normal normal-case text-slate-400">(optional)</span>
                            </label>
                            <textarea
                                rows={3}
                                placeholder="Any additional information about this event…"
                                value={form.notes}
                                onChange={e => set('notes', e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all resize-none"
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pb-8">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-emerald-500/25 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
                            >
                                {isSubmitting ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                                ) : (
                                    <><Package className="w-4 h-4" /> Create Event</>
                                )}
                            </button>
                            <Link
                                href="/distribution"
                                className="px-5 py-3 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-all"
                            >
                                Cancel
                            </Link>
                        </div>
                    </form>
                )}
            </main>
        </div>
    );
}

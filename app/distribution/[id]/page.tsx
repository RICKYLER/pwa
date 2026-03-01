'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDistributionEvent, updateDistributionEvent, getDistributionRecords } from '@/lib/db/distribution';
import MapView from '@/components/MapView';
import MapLocationPicker from '@/components/MapLocationPicker';
import type { DistributionEvent, DistributionRecord } from '@/lib/db/schema';
import {
    ArrowLeft, Package, MapPin, Calendar, Clock,
    Truck, Edit2, Save, X, Users, FileText, Loader2,
} from 'lucide-react';

const STATUS_CFG = {
    planned: { label: 'Planned', dot: 'bg-amber-400', badge: 'bg-amber-50   text-amber-700   ring-1 ring-amber-200' },
    ongoing: { label: 'Ongoing', dot: 'bg-blue-400 animate-pulse', badge: 'bg-blue-50   text-blue-700   ring-1 ring-blue-200' },
    completed: { label: 'Completed', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
};

const TYPE_LABELS: Record<string, string> = {
    regular: 'Regular Distribution',
    emergency: 'Emergency Relief',
    disaster_relief: 'Disaster Relief',
};

export default function DistributionDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const user = getCurrentUser();

    const [event, setEvent] = useState<DistributionEvent | null>(null);
    const [records, setRecords] = useState<DistributionRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editStatus, setEditStatus] = useState<DistributionEvent['status']>('planned');
    const [editNotes, setEditNotes] = useState('');
    const [editLocation, setEditLocation] = useState('');
    const [editCoords, setEditCoords] = useState<{ lat: number; lng: number } | null>(null);
    // Resolved map coords — from stored gps or geocoded from address
    const [mapCoords, setMapCoords] = useState<{ lat: number; lng: number } | null>(null);
    const geocodedRef = useRef(false);
    const [mapsReady, setMapsReady] = useState(false);

    // Poll until window.google is available (injected by parent LoadScript)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.google) { setMapsReady(true); return; }
        const id = setInterval(() => {
            if (typeof window !== 'undefined' && window.google) {
                setMapsReady(true);
                clearInterval(id);
            }
        }, 100);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!user || !hasPermission('view_reports')) { router.push('/distribution'); return; }
        load();
    }, [user, router, params.id]);

    async function load() {
        setIsLoading(true);
        try {
            const [ev, recs] = await Promise.all([
                getDistributionEvent(params.id),
                getDistributionRecords(params.id),
            ]);
            if (!ev) { router.push('/distribution'); return; }
            setEvent(ev);
            setRecords(recs);
            setEditStatus(ev.status);
            setEditNotes(ev.notes || '');
            setEditLocation(ev.location || '');
            setEditCoords(
                typeof ev.gps_lat === 'number' && typeof ev.gps_lng === 'number'
                    ? { lat: ev.gps_lat, lng: ev.gps_lng }
                    : null
            );
            // If event already has stored coords, use them immediately
            if (typeof ev.gps_lat === 'number' && typeof ev.gps_lng === 'number') {
                setMapCoords({ lat: ev.gps_lat, lng: ev.gps_lng });
            }
        } finally {
            setIsLoading(false);
        }
    }

    // Geocode the location text when Maps API is ready and we have no stored coords
    useEffect(() => {
        if (!mapsReady || !event || mapCoords || geocodedRef.current) return;
        if (typeof event.gps_lat === 'number' && typeof event.gps_lng === 'number') return;
        geocodedRef.current = true;
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: event.location }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
                const loc = results[0].geometry.location;
                setMapCoords({ lat: loc.lat(), lng: loc.lng() });
            }
        });
    }, [mapsReady, event, mapCoords]);

    async function handleSave() {
        if (!event) return;
        setIsSaving(true);
        try {
            const locationUpdate = editLocation.trim() && editLocation !== event.location
                ? {
                    location: editLocation.trim(),
                    gps_lat: editCoords?.lat,
                    gps_lng: editCoords?.lng,
                }
                : {};
            const updated = await updateDistributionEvent(event.id, {
                status: editStatus,
                notes: editNotes.trim() || undefined,
                ...locationUpdate,
            });
            setEvent(updated);
            // Sync map display with new coords
            if (updated.gps_lat && updated.gps_lng) {
                setMapCoords({ lat: updated.gps_lat, lng: updated.gps_lng });
            } else if (locationUpdate.location) {
                // Geocode updated address if no pin was dropped
                geocodedRef.current = false;
                setMapCoords(null);
            }
            setIsEditing(false);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    }

    if (!user) return null;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50">
                <header className="bg-white border-b border-slate-200/70 shadow-sm h-14 flex items-center px-4">
                    <Link href="/distribution" className="p-2 -ml-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                </header>
                <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
                    {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-slate-200/60 h-28 animate-pulse" />)}
                </div>
            </div>
        );
    }

    if (!event) return null;

    const cfg = STATUS_CFG[event.status] || STATUS_CFG.planned;
    const schedDate = new Date(event.scheduled_date);
    const isPast = schedDate < new Date() && event.status !== 'completed';
    const canManage = hasPermission('manage_inventory');

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-white border-b border-slate-200/70 shadow-sm">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
                    <Link href="/distribution" className="p-2 -ml-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{event.event_name}</p>
                        <p className="text-[11px] text-slate-400">{TYPE_LABELS[event.type] || event.type}</p>
                    </div>
                    {canManage && !isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-all"
                        >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                        </button>
                    )}
                    {isEditing && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditStatus(event.status);
                                    setEditNotes(event.notes || '');
                                    setEditLocation(event.location || '');
                                    setEditCoords(
                                        typeof event.gps_lat === 'number' && typeof event.gps_lng === 'number'
                                            ? { lat: event.gps_lat, lng: event.gps_lng }
                                            : null
                                    );
                                }}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl hover:opacity-90 transition-all disabled:opacity-60"
                            >
                                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 sm:px-6 py-5 space-y-4 pb-10">

                {/* Status + Info card */}
                <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4">
                    {/* Status row */}
                    <div className="flex items-center justify-between">
                        <div>
                            {isEditing ? (
                                <select
                                    value={editStatus}
                                    onChange={e => setEditStatus(e.target.value as DistributionEvent['status'])}
                                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none font-semibold"
                                >
                                    <option value="planned">Planned</option>
                                    <option value="ongoing">Ongoing</option>
                                    <option value="completed">Completed</option>
                                </select>
                            ) : (
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cfg.badge}`}>
                                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}
                                </span>
                            )}
                        </div>
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${isPast ? 'text-amber-600' : 'text-slate-400'}`}>
                            <Calendar className="w-3.5 h-3.5" />
                            {schedDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                            {isPast && <span className="text-amber-500 font-semibold">· overdue</span>}
                        </span>
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Location</p>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editLocation}
                                        onChange={e => setEditLocation(e.target.value)}
                                        placeholder="Address…"
                                        className="w-full mt-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                    />
                                ) : (
                                    <p className="text-sm font-semibold text-slate-800">{event.location}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <Truck className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Type</p>
                                <p className="text-sm font-semibold text-slate-800">{TYPE_LABELS[event.type] || event.type}</p>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    {isEditing ? (
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Notes
                            </label>
                            <textarea
                                rows={3}
                                value={editNotes}
                                onChange={e => setEditNotes(e.target.value)}
                                placeholder="Optional notes…"
                                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
                            />
                        </div>
                    ) : event.notes ? (
                        <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
                            <FileText className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-slate-600 leading-relaxed">{event.notes}</p>
                        </div>
                    ) : null}
                </div>

                {/* Map — edit mode shows picker, view mode shows read-only pin */}
                <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-2.5">
                    <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-emerald-600" />
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                            {isEditing ? 'Update Location' : 'Pinned Location'}
                        </p>
                        {isEditing && <span className="text-[10px] text-slate-400 normal-case font-normal">Search or click map to move pin</span>}
                    </div>
                    {isEditing ? (
                        <MapLocationPicker
                            defaultCenter={mapCoords ?? undefined}
                            defaultAddress={event.location}
                            onLocationChange={(addr, coords) => {
                                setEditLocation(addr);
                                setEditCoords(coords);
                                // Live-preview the new pin
                                setMapCoords(coords);
                            }}
                        />
                    ) : mapCoords ? (
                        <MapView lat={mapCoords.lat} lng={mapCoords.lng} height={240} />
                    ) : (
                        <div className="flex items-center justify-center bg-slate-100 rounded-xl h-[240px]">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        </div>
                    )}
                    <p className="text-[11px] text-slate-400 text-center">
                        {isEditing ? editLocation || event.location : event.location}
                    </p>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                            <Users className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{records.length}</p>
                            <p className="text-xs text-slate-400 font-medium">Beneficiaries</p>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                            <Package className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">
                                {records.reduce((s, r) => s + r.items_distributed.length, 0)}
                            </p>
                            <p className="text-xs text-slate-400 font-medium">Items Given</p>
                        </div>
                    </div>
                </div>

                {/* Distribution records */}
                <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-800">Distribution Records</p>
                        <span className="text-xs text-slate-400">{records.length} record{records.length !== 1 ? 's' : ''}</span>
                    </div>
                    {records.length === 0 ? (
                        <div className="text-center py-12">
                            <Users className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm font-semibold text-slate-500">No records yet</p>
                            <p className="text-xs text-slate-400 mt-0.5">Records appear after beneficiaries receive items</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {records.map(rec => (
                                <div key={rec.id} className="px-5 py-3.5 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">
                                            {rec.received_by_name || 'Resident'}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(rec.timestamp).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <p className="text-sm font-bold text-emerald-600">
                                        {rec.items_distributed.length} item{rec.items_distributed.length !== 1 ? 's' : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

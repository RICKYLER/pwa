'use client';

// The mobile dashboard for field responders.
// It shows what they need in the field: active incidents, a map, which
// households to visit first, and any distribution events they're assigned to.

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { getIncidents, updateIncidentStatus, seedDemoIncidents } from '@/lib/db/incidents';
import { getDistributionEvents } from '@/lib/db/distribution';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { getHouseholds } from '@/lib/db/households';
import type {
    Incident, IncidentStatus, Household,
    Resident, VulnerabilityFlags, DistributionEvent
} from '@/lib/db/schema';
import {
    Zap, MapPin, Navigation, CheckCircle2,
    Users, Calendar, Package, X,
    ShieldAlert, Loader2, RefreshCw
} from 'lucide-react';
import WeatherWidget from '@/components/WeatherWidget';
import ResponderLeafletMap from '@/components/ResponderLeafletMap';
import { openResponderMapLocation } from '@/lib/responder-map-links';

// ─── Types ────────────────────────────────────────────────────────────────────

// A household enriched with its residents, vulnerability flags, and a
// priority score (higher = more urgent, visit first)
interface PriorityHousehold {
    household: Household;
    residents: Resident[];
    flags: VulnerabilityFlags[];
    score: number;
}

// ─── Small helper functions ───────────────────────────────────────────────────

// Tell the user how long ago something happened, in human-friendly terms
function howLongAgo(date: Date): string {
    const minutesPassed = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (minutesPassed < 1) return 'just now';
    if (minutesPassed < 60) return `${minutesPassed}m ago`;
    const hoursPassed = Math.floor(minutesPassed / 60);
    if (hoursPassed < 24) return `${hoursPassed}h ago`;
    return `${Math.floor(hoursPassed / 24)}d ago`;
}

// Open Google Maps with either GPS coordinates or a plain text address
function navigateTo(lat?: number, lng?: number, address?: string) {
    openResponderMapLocation(lat, lng, address);
}

// Calculate how urgent a household is to visit — seniors, PWDs, and pregnant
// women are worth the most points because they need help the most
function getHouseholdPriorityScore(flags: VulnerabilityFlags[]): number {
    let score = 0;
    for (const f of flags) {
        if (f.is_senior) score += 3; // most at risk
        if (f.is_pwd) score += 3;
        if (f.is_pregnant) score += 3;
        if (f.has_chronic_illness) score += 2;
        if (f.is_child) score += 1;
    }
    return score;
}

// Return a short list of vulnerability labels for display (e.g. "Senior", "PWD")
function getVulnerabilityLabels(flags: VulnerabilityFlags[]): string[] {
    const labels: string[] = [];
    if (flags.some(f => f.is_senior)) labels.push('Senior');
    if (flags.some(f => f.is_pwd)) labels.push('PWD');
    if (flags.some(f => f.is_pregnant)) labels.push('Pregnant');
    if (flags.some(f => f.has_chronic_illness)) labels.push('Chronic');
    if (flags.some(f => f.is_child)) labels.push('Child');
    return labels;
}

// What colour and style to use for each incident severity level
function getSeverityStyle(severity: string) {
    const styles = {
        critical: { dotColor: 'bg-red-500', text: 'text-red-600', border: 'border-red-200', badge: 'bg-red-50', pulse: true },
        high: { dotColor: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-200', badge: 'bg-orange-50', pulse: false },
        medium: { dotColor: 'bg-amber-400', text: 'text-amber-600', border: 'border-amber-200', badge: 'bg-amber-50', pulse: false },
        low: { dotColor: 'bg-slate-400', text: 'text-slate-500', border: 'border-slate-200', badge: 'bg-slate-50', pulse: false },
    };
    return styles[severity as keyof typeof styles] ?? styles.low;
}

// An emoji icon for each type of incident — just makes the cards easier to scan at a glance
const incidentEmoji: Record<string, string> = {
    flood: '🌊', fire: '🔥', medical: '🏥',
    landslide: '⛰️', typhoon: '🌀', other: '⚡',
};
// ─── Status Update Bottom Sheet ───────────────────────────────────────────────
// Slides up from the bottom when the user taps "Update" on an incident card.
// Shows all four possible statuses so the responder can pick the right one.

function StatusUpdateSheet({
    incident,
    onSave,
    onClose,
}: {
    incident: Incident;
    onSave: (id: string, newStatus: IncidentStatus) => Promise<void>;
    onClose: () => void;
}) {
    const [saving, setSaving] = useState(false);

    const allStatuses: { value: IncidentStatus; label: string; description: string }[] = [
        { value: 'reported', label: 'Reported', description: 'Newly reported — not yet confirmed' },
        { value: 'verified', label: 'Verified', description: 'Confirmed real — awaiting response' },
        { value: 'responding', label: 'Responding', description: 'Responder on-site or on the way' },
        { value: 'resolved', label: 'Resolved', description: 'Situation is contained and closed' },
    ];

    async function pickStatus(status: IncidentStatus) {
        setSaving(true);
        await onSave(incident.id, status);
        setSaving(false);
        onClose();
    }

    return (
        // Dimmed backdrop — tap it to close without saving
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

            {/* The sheet itself */}
            <div
                className="relative z-10 bg-white rounded-t-3xl shadow-2xl pb-[env(safe-area-inset-bottom)]"
                onClick={e => e.stopPropagation()}
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>

                <div className="px-5 pt-2 pb-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="font-bold text-slate-900 text-base">Update Status</h3>
                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{incident.location}</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Status options */}
                    <div className="space-y-2">
                        {allStatuses.map(s => {
                            const isCurrentStatus = s.value === incident.status;
                            return (
                                <button
                                    key={s.value}
                                    disabled={saving || isCurrentStatus}
                                    onClick={() => pickStatus(s.value)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all ${isCurrentStatus
                                        ? 'border-indigo-200 bg-indigo-50'
                                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50 active:scale-[0.98]'
                                        }`}
                                >
                                    {/* Loading spinner while saving, or a small dot otherwise */}
                                    {saving
                                        ? <Loader2 className="w-4 h-4 animate-spin text-slate-400 flex-shrink-0" />
                                        : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isCurrentStatus ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                                    }
                                    <div className="flex-1">
                                        <p className={`text-sm font-semibold ${isCurrentStatus ? 'text-indigo-700' : 'text-slate-800'}`}>
                                            {s.label}
                                        </p>
                                        <p className="text-xs text-slate-400">{s.description}</p>
                                    </div>
                                    {isCurrentStatus && (
                                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                                            Current
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function AreaMap({ households, incidents }: { households: Household[]; incidents: Incident[] }) {
    return (
        <ResponderLeafletMap
            households={households}
            incidents={incidents}
            containerClassName="h-56 rounded-2xl border border-slate-200 shadow-sm"
            compactWeather
        />
    );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
// Shown while data is being fetched from the database

function SkeletonCards({ count }: { count: number }) {
    return (
        <div className="flex gap-3 px-4 overflow-x-hidden">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="w-60 flex-shrink-0 h-36 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
        </div>
    );
}

function SkeletonRows({ count }: { count: number }) {
    return (
        <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="h-20 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResponderMobile() {
    const router = useRouter();
    const user = getCurrentUser();

    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [priorities, setPriorities] = useState<PriorityHousehold[]>([]);
    const [events, setEvents] = useState<DistributionEvent[]>([]);
    const [mapHouseholds, setMapHouseholds] = useState<Household[]>([]);
    const [loading, setLoading] = useState(true);
    const [sheetIncident, setSheetIncident] = useState<Incident | null>(null);  // which incident's status sheet is open
    const [visited, setVisited] = useState<Set<string>>(new Set());       // households the responder has checked on

    // Only responders and admins can see this page
    useEffect(() => {
        if (!user) { router.push('/login'); return; }
        if (!hasRole(['responder', 'admin'])) { router.push('/dashboard'); return; }
        loadData();
    }, []);

    // Pull everything from the local database in one go
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Seed demo incidents on first run so the page isn't empty
            await seedDemoIncidents(user!.id);

            const [allIncidents, allHouseholds, allResidents, allFlags, ongoingEvents] = await Promise.all([
                getIncidents(),
                getHouseholds({
                    barangay_id: user!.barangay_id,
                    registration_status: 'approved',
                }),
                db.getAll<Resident>(STORE_NAMES.residents),
                db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags),
                getDistributionEvents({ status: 'ongoing' }),
            ]);

            setIncidents(allIncidents);
            setEvents(ongoingEvents);
            setMapHouseholds(
                allHouseholds.filter(
                    h =>
                        h.status === 'active' &&
                        h.gps_lat !== undefined &&
                        h.gps_long !== undefined
                )
            );

            // Build the priority check-in list:
            // For each household, find all of its residents and their flags, then
            // calculate a score. Sort highest score first (most urgent to visit).
            const householdsWithScores: PriorityHousehold[] = allHouseholds
                .filter(h => h.status === 'active')
                .map(h => {
                    const myResidents = allResidents.filter(r => r.household_id === h.id && r.status === 'active');
                    const myFlags = allFlags.filter(f => myResidents.some(r => r.id === f.resident_id));
                    const score = getHouseholdPriorityScore(myFlags);
                    return { household: h, residents: myResidents, flags: myFlags, score };
                })
                .filter(h => h.score > 0)       // only show households that have someone vulnerable
                .sort((a, b) => b.score - a.score); // highest score first

            setPriorities(householdsWithScores);
        } catch (err) {
            console.error('Failed to load responder data:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    // When the user picks a new status from the bottom sheet, update it in the DB and in the list
    async function changeIncidentStatus(id: string, newStatus: IncidentStatus) {
        const updated = await updateIncidentStatus(id, newStatus);
        setIncidents(prev => prev.map(inc => inc.id === id ? updated : inc));
    }

    // Toggle a household as visited / not visited
    function toggleVisited(householdId: string) {
        setVisited(prev => {
            const next = new Set(prev);
            if (next.has(householdId)) {
                next.delete(householdId);
            } else {
                next.add(householdId);
            }
            return next;
        });
    }

    const activeIncidents = incidents.filter(i => i.status !== 'resolved');
    const resolvedCount = incidents.filter(i => i.status === 'resolved').length;

    if (!user) return null;

    return (
        <>
            {/* Status update bottom sheet — only shown when "Update" is tapped */}
            {sheetIncident && (
                <StatusUpdateSheet
                    incident={sheetIncident}
                    onSave={changeIncidentStatus}
                    onClose={() => setSheetIncident(null)}
                />
            )}

            <div className="pb-24 space-y-5">

                {/* ── WHO AM I banner ──────────────────────────────────── */}
                <div className="px-4 pt-4">
                    <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl px-4 py-4 text-white shadow-lg shadow-indigo-500/20">
                        {/* Avatar + name */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center font-bold text-sm">
                                {user.name.charAt(0)}
                            </div>
                            <div>
                                <p className="font-bold text-sm leading-tight">{user.name}</p>
                                <p className="text-[11px] text-indigo-200 capitalize">Field Responder · {user.barangay_id}</p>
                            </div>
                        </div>

                        {/* Status + refresh */}
                        <div className="flex flex-col items-end gap-1.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-400/20 rounded-full text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                Online
                            </span>
                            <button onClick={loadData} className="text-[10px] text-indigo-300 flex items-center gap-0.5 hover:text-white transition-colors">
                                <RefreshCw className="w-3 h-3" />Refresh
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── WEATHER ──────────────────────────────────────────────── */}
                {/* Shows live conditions so the responder can plan around weather */}
                <div className="px-4">
                    <WeatherWidget mode="compact" />
                </div>

                {/* ── ACTIVE INCIDENTS (horizontal scroll) ─────────────── */}
                <div>
                    <div className="flex items-center justify-between px-4 mb-2">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-rose-500" />
                            <h2 className="text-sm font-bold text-slate-900">Active Incidents</h2>
                        </div>
                        <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                            {activeIncidents.length} active
                        </span>
                    </div>

                    {loading ? (
                        <SkeletonCards count={3} />
                    ) : activeIncidents.length === 0 ? (
                        <div className="mx-4 py-8 bg-white rounded-2xl border border-dashed border-slate-300 flex flex-col items-center gap-2">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            <p className="text-sm font-semibold text-slate-600">All clear! No active incidents.</p>
                        </div>
                    ) : (
                        <div className="flex gap-3 px-4 overflow-x-auto pb-1 snap-x snap-mandatory">
                            {activeIncidents.map(inc => {
                                const style = getSeverityStyle(inc.severity);
                                return (
                                    <div
                                        key={inc.id}
                                        className={`w-64 flex-shrink-0 snap-start bg-white border rounded-2xl p-4 shadow-sm ${style.border}`}
                                    >
                                        {/* Incident type + severity badge */}
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xl">{incidentEmoji[inc.type] ?? '⚡'}</span>
                                                <div>
                                                    <p className={`text-[10px] font-bold uppercase ${style.text} flex items-center gap-1`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${style.dotColor} ${style.pulse ? 'animate-pulse' : ''}`} />
                                                        {inc.severity}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-800 capitalize">
                                                        {inc.type.replace('_', ' ')}
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Current status pill */}
                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${inc.status === 'responding' ? 'bg-amber-100 text-amber-700' :
                                                inc.status === 'verified' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-slate-100 text-slate-600'
                                                }`}>
                                                {inc.status}
                                            </span>
                                        </div>

                                        {/* Where + when */}
                                        <p className="text-xs text-slate-500 flex items-start gap-1 mb-0.5 leading-tight">
                                            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                                            {inc.location}
                                        </p>
                                        <p className="text-[10px] text-slate-400 mb-3">{howLongAgo(inc.reported_at)}</p>

                                        {/* Short description */}
                                        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2 mb-3">
                                            {inc.description}
                                        </p>

                                        {/* Action buttons */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setSheetIncident(inc)}
                                                className="flex-1 py-2 rounded-xl text-[11px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all"
                                            >
                                                Update Status
                                            </button>
                                            <button
                                                onClick={() => navigateTo(inc.gps_lat, inc.gps_lng, inc.location)}
                                                className="py-2 px-3 rounded-xl text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-1"
                                            >
                                                <Navigation className="w-3 h-3" />Go
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── AREA MAP ─────────────────────────────────────────── */}
                {!loading && (
                    <div className="px-4">
                        <div className="flex items-center gap-2 mb-2">
                            <MapPin className="w-4 h-4 text-indigo-500" />
                            <h2 className="text-sm font-bold text-slate-900">Area Map</h2>
                            {/* Legend */}
                            <div className="flex items-center gap-3 ml-auto text-[10px] text-slate-400">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />Households
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Incidents
                                </span>
                            </div>
                        </div>
                        <AreaMap
                            households={mapHouseholds}
                            incidents={incidents}
                        />
                    </div>
                )}

                {/* ── PRIORITY CHECK-INS ────────────────────────────────── */}
                {/* Households sorted by how many vulnerable people live there.
                    The responder should visit the top ones first. */}
                <div className="px-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                        <h2 className="text-sm font-bold text-slate-900">Priority Check-ins</h2>
                        <span className="ml-auto text-xs text-slate-400">{priorities.length} households</span>
                    </div>

                    {loading ? (
                        <SkeletonRows count={3} />
                    ) : priorities.length === 0 ? (
                        <div className="py-8 bg-white rounded-2xl border border-dashed border-slate-300 flex flex-col items-center gap-2">
                            <Users className="w-7 h-7 text-slate-300" />
                            <p className="text-sm text-slate-500">No vulnerable households in this area.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {priorities.map((p, rank) => {
                                const labels = getVulnerabilityLabels(p.flags);
                                const alreadyVisited = visited.has(p.household.id);

                                // Top 2 get coloured rank badges; the rest are grey
                                const rankBadgeColor = rank === 0 ? 'bg-red-100 text-red-600'
                                    : rank === 1 ? 'bg-orange-100 text-orange-600'
                                        : 'bg-slate-100 text-slate-500';

                                return (
                                    <div
                                        key={p.household.id}
                                        className={`bg-white border rounded-2xl p-4 transition-all ${alreadyVisited ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200/60'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Rank number */}
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${rankBadgeColor}`}>
                                                {rank + 1}
                                            </div>

                                            {/* Household info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-900 truncate">{p.household.head_name}</p>
                                                <div className="flex items-center gap-2 min-w-0 mt-0.5">
                                                    <p className="text-xs text-slate-400 flex items-center gap-1 truncate min-w-0">
                                                        <MapPin className="w-3 h-3 flex-shrink-0" />
                                                        {p.household.purok_sitio} · {p.household.street_address}
                                                    </p>
                                                    {p.household.gps_lat !== undefined && p.household.gps_long !== undefined && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-300 flex-shrink-0">
                                                            📍 Pinned
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Vulnerability tags */}
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {labels.map(label => (
                                                        <span key={label} className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded-full border border-rose-100">
                                                            {label}
                                                        </span>
                                                    ))}
                                                    <span className="text-[9px] text-slate-400">
                                                        {p.residents.length} {p.residents.length === 1 ? 'resident' : 'residents'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex flex-col items-end gap-2">
                                                <button
                                                    onClick={() => navigateTo(
                                                        p.household.gps_lat,
                                                        p.household.gps_long,
                                                        `${p.household.street_address}, ${p.household.purok_sitio}`
                                                    )}
                                                    className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
                                                    title="Navigate to household"
                                                >
                                                    <Navigation className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => toggleVisited(p.household.id)}
                                                    className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${alreadyVisited
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                        }`}
                                                >
                                                    {alreadyVisited ? '✓ Visited' : 'Check-in'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── TODAY'S DISTRIBUTION EVENTS ──────────────────────── */}
                {/* Only shows if there are ongoing events — otherwise this section is hidden */}
                {events.length > 0 && (
                    <div className="px-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Package className="w-4 h-4 text-emerald-600" />
                            <h2 className="text-sm font-bold text-slate-900">My Assignments</h2>
                        </div>
                        <div className="space-y-2">
                            {events.map(ev => (
                                <div key={ev.id} className="bg-white border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                                        <Package className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900 truncate">{ev.event_name}</p>
                                        <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                                            <MapPin className="w-3 h-3 flex-shrink-0" />{ev.location}
                                        </p>
                                        <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                            <Calendar className="w-2.5 h-2.5" />
                                            {new Date(ev.scheduled_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => navigateTo(ev.gps_lat, ev.gps_lng, ev.location)}
                                        className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                                        title="Navigate to event"
                                    >
                                        <Navigation className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── RESOLVED TODAY ────────────────────────────────────── */}
                {resolvedCount > 0 && (
                    <div className="px-4">
                        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            <p className="text-xs font-semibold text-emerald-700">
                                {resolvedCount} {resolvedCount === 1 ? 'incident' : 'incidents'} resolved today
                            </p>
                        </div>
                    </div>
                )}

            </div>
        </>
    );
}

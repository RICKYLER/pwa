'use client';

// ─── ResponderDesktop ─────────────────────────────────────────────────────────
// Two-column layout:
//  Left (40%): Status header, Incident Command cards, Priority check-in list
//  Right (60%): Full-height Google Map with incident/household pins + detail overlay

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { getIncidents, updateIncidentStatus, seedDemoIncidents } from '@/lib/db/incidents';
import { getDistributionEvents } from '@/lib/db/distribution';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { getHouseholds } from '@/lib/db/households';
import type { Incident, IncidentStatus, Household, Resident, VulnerabilityFlags, DistributionEvent } from '@/lib/db/schema';
import {
    Zap, MapPin, Navigation, CheckCircle2,
    ShieldAlert, Package, Calendar, Loader2, RefreshCw,
    Users, X
} from 'lucide-react';
import WeatherWidget from '@/components/WeatherWidget';
import ResponderLeafletMap from '@/components/ResponderLeafletMap';
import { openResponderMapLocation } from '@/lib/responder-map-links';


const SEVERITY_CFG = {
    critical: { label: 'Critical', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700', ring: 'border-red-200', pulse: true },
    high: { label: 'High', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', ring: 'border-orange-200', pulse: false },
    medium: { label: 'Medium', dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700', ring: 'border-amber-200', pulse: false },
    low: { label: 'Low', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600', ring: 'border-slate-200', pulse: false },
    
} as const;
const STATUS_FLOW: { value: IncidentStatus; label: string; color: string }[] = [
    { value: 'reported', label: 'Reported', color: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
    { value: 'verified', label: 'Verified', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
    { value: 'responding', label: 'Responding', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
    { value: 'resolved', label: 'Resolved', color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
];

const INCIDENT_TYPE_ICONS: Record<string, string> = {
    flood: '🌊', fire: '🔥', medical: '🏥', landslide: '⛰️', typhoon: '🌀', other: '⚡',
};
function openMaps(lat?: number, lng?: number, address?: string) {
    openResponderMapLocation(lat, lng, address);
}

function timeAgo(date: Date): string {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

interface PriorityHousehold {
    household: Household;
    residents: Resident[];
    flags: VulnerabilityFlags[];
    score: number;
}

function vulnTags(flags: VulnerabilityFlags[]): string[] {
    const tags: string[] = [];
    if (flags.some(f => f.is_senior)) tags.push('Senior');
    if (flags.some(f => f.is_pwd)) tags.push('PWD');
    if (flags.some(f => f.is_pregnant)) tags.push('Pregnant');
    if (flags.some(f => f.has_chronic_illness)) tags.push('Chronic');
    if (flags.some(f => f.is_child)) tags.push('Child');
    return tags;
}

function DesktopMap({
    households,
    incidents,
    selectedHousehold,
    onSelectHousehold,
}: {
    households: Household[];
    incidents: Incident[];
    selectedHousehold: Household | null;
    onSelectHousehold: (h: Household | null) => void;
}) {
    return (
        <ResponderLeafletMap
            households={households}
            incidents={incidents}
            selectedHousehold={selectedHousehold}
            onSelectHousehold={onSelectHousehold}
        />
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ResponderDesktop() {
    const router = useRouter();
    const user = getCurrentUser();

    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [priorities, setPriorities] = useState<PriorityHousehold[]>([]);
    const [events, setEvents] = useState<DistributionEvent[]>([]);
    const [mapHouseholds, setMapHouseholds] = useState<Household[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
    const [activeTab, setActiveTab] = useState<'incidents' | 'priorities' | 'events'>('incidents');
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!user) { router.push('/login'); return; }
        if (!hasRole(['responder', 'admin'])) { router.push('/dashboard'); return; }
        load();
    }, [user, router]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            await seedDemoIncidents(user!.id);
            const [incs, households, residents, flags, evts] = await Promise.all([
                getIncidents(),
                getHouseholds({
                    barangay_id: user!.barangay_id,
                    registration_status: 'approved',
                }),
                db.getAll<Resident>(STORE_NAMES.residents),
                db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags),
                getDistributionEvents({ status: 'ongoing' }),
            ]);

            setIncidents(incs);
            setEvents(evts);
            setMapHouseholds(
                households.filter(
                    h =>
                        h.status === 'active' &&
                        h.gps_lat !== undefined &&
                        h.gps_long !== undefined
                )
            );

            const scored: PriorityHousehold[] = households
                .filter(h => h.status === 'active')
                .map(h => {
                    const res = residents.filter(r => r.household_id === h.id && r.status === 'active');
                    const fl = flags.filter(f => res.some(r => r.id === f.resident_id));
                    let score = 0;
                    fl.forEach(f => {
                        if (f.is_senior) score += 3;
                        if (f.is_pwd) score += 3;
                        if (f.is_pregnant) score += 3;
                        if (f.has_chronic_illness) score += 2;
                        if (f.is_child) score += 1;
                    });
                    return { household: h, residents: res, flags: fl, score };
                })
                .filter(p => p.score > 0)
                .sort((a, b) => b.score - a.score);

            setPriorities(scored);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [user]);

    async function handleStatusUpdate(id: string, status: IncidentStatus) {
        setUpdatingId(id);
        try {
            const updated = await updateIncidentStatus(id, status);
            setIncidents(prev => prev.map(i => i.id === id ? updated : i));
        } finally {
            setUpdatingId(null);
        }
    }

    const activeIncidents = incidents.filter(i => i.status !== 'resolved');
    const resolvedCount = incidents.filter(i => i.status === 'resolved').length;

    if (!user) return null;

    const firstName = user.name.split(' ')[0];

    return (
        // h-full fills the desktop shell's main area (which is h-screen overflow-y-auto in AppShell)
        // overflow-hidden here ensures page-level scrolling is disabled — each panel controls its own
        <div className="flex h-full overflow-hidden">
            {/* ── LEFT PANEL (40%) ─────────────────────────────────────── */}
            <div className="w-[420px] flex-shrink-0 bg-white border-r border-slate-200/70 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300 scrollbar-track-transparent">

                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-br from-indigo-600 to-violet-700">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center font-bold text-sm text-white">
                                {user.name.charAt(0)}
                            </div>
                            <div>
                                <p className="font-bold text-white text-sm">{user.name}</p>
                                <p className="text-[11px] text-indigo-200">Field Responder · {user.barangay_id}</p>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-400/20 rounded-full text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />Online
                            </span>
                            <button onClick={load} className="text-[10px] text-indigo-300 flex items-center gap-0.5 hover:text-white transition-colors">
                                <RefreshCw className="w-3 h-3" />Refresh
                            </button>
                        </div>
                    </div>

                    {/* KPI row */}
                    {!loading && (
                        <div className="grid grid-cols-3 gap-2 mt-4">
                            {[
                                { label: 'Active', value: activeIncidents.length, color: 'text-red-300' },
                                { label: 'Priority HH', value: priorities.length, color: 'text-amber-300' },
                                { label: 'Resolved', value: resolvedCount, color: 'text-emerald-300' },
                            ].map(k => (
                                <div key={k.label} className="bg-white/10 rounded-xl px-3 py-2 text-center">
                                    <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                                    <p className="text-[10px] text-indigo-200">{k.label}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Live weather — helps responders plan around conditions in the field */}
                <div className="px-4 py-3 border-b border-slate-100">
                    <WeatherWidget
                        mode="full"
                        defaultMinimized
                        autoMinimizeInTightPanel
                    />
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-slate-100">
                    {([
                        { key: 'incidents', label: 'Incidents', icon: Zap, count: activeIncidents.length },
                        { key: 'priorities', label: 'Check-ins', icon: ShieldAlert, count: priorities.length },
                        { key: 'events', label: 'Events', icon: Package, count: events.length },
                    ] as const).map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.key}
                                onClick={() => setActiveTab(t.key)}
                                className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-semibold transition-all border-b-2 ${activeTab === t.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {t.label}
                                {t.count > 0 && <span className={`text-[9px] font-bold px-1 rounded-full ${activeTab === t.key ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>}
                            </button>
                        );
                    })}
                </div>

                {/* Tab content now scrolls with the full left panel instead of pinning the weather card */}
                <div className="pb-5">

                    {/* ── Tab: Incidents ─────────────────────────── */}
                    {activeTab === 'incidents' && (
                        <div className="p-4 space-y-3">
                            {loading ? (
                                [...Array(3)].map((_, i) => <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />)
                            ) : activeIncidents.length === 0 ? (
                                <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                                    <CheckCircle2 className="w-10 h-10" />
                                    <p className="text-sm font-semibold">No active incidents</p>
                                    <p className="text-xs">All clear in the area</p>
                                </div>
                            ) : activeIncidents.map(inc => {
                                const cfg = SEVERITY_CFG[inc.severity as keyof typeof SEVERITY_CFG] ?? SEVERITY_CFG.low;
                                return (
                                    <div key={inc.id} className={`bg-white border rounded-2xl p-4 shadow-sm ${cfg.ring}`}>
                                        <div className="flex items-start gap-3 mb-3">
                                            <span className="text-2xl flex-shrink-0">{INCIDENT_TYPE_ICONS[inc.type] ?? '⚡'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cfg.badge} flex items-center gap-1`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                                                        {cfg.label}
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-800 capitalize">{inc.type.replace('_', ' ')}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate">
                                                    <MapPin className="w-3 h-3 flex-shrink-0" />{inc.location}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(inc.reported_at)}</p>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-600 leading-relaxed mb-3 line-clamp-2">{inc.description}</p>

                                        {/* Status pipeline */}
                                        <div className="grid grid-cols-4 gap-1 mb-3">
                                            {STATUS_FLOW.map(s => (
                                                <button
                                                    key={s.value}
                                                    disabled={updatingId === inc.id}
                                                    onClick={() => handleStatusUpdate(inc.id, s.value)}
                                                    className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${inc.status === s.value
                                                        ? s.color.split(' ').slice(0, 2).join(' ') + ' ring-1 ring-inset ring-current scale-[1.04]'
                                                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                                                        }`}
                                                >
                                                    {updatingId === inc.id ? '…' : s.label}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => openMaps(inc.gps_lat, inc.gps_lng, inc.location)}
                                            className="w-full py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center gap-1.5 transition-all"
                                        >
                                            <Navigation className="w-3.5 h-3.5" />Navigate to Location
                                        </button>
                                    </div>
                                );
                            })}

                            {resolvedCount > 0 && (
                                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                    <p className="text-xs font-semibold text-emerald-700">{resolvedCount} incident{resolvedCount !== 1 ? 's' : ''} resolved today</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Priority Check-ins ────────────────── */}
                    {activeTab === 'priorities' && (
                        <div className="p-4 space-y-2">
                            {loading ? (
                                [...Array(4)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)
                            ) : priorities.length === 0 ? (
                                <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                                    <Users className="w-10 h-10" />
                                    <p className="text-sm font-semibold">No priority households</p>
                                </div>
                            ) : priorities.map((p, idx) => {
                                const tags = vulnTags(p.flags);
                                const isVisited = visitedIds.has(p.household.id);
                                return (
                                    <div
                                        key={p.household.id}
                                        onClick={() => setSelectedHousehold(p.household)}
                                        className={`bg-white border rounded-2xl p-3.5 cursor-pointer transition-all hover:shadow-md ${isVisited ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200/60 hover:border-slate-300'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 ${idx === 0 ? 'bg-red-100 text-red-600' : idx === 1 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-900 truncate">{p.household.head_name}</p>
                                                <div className="flex items-center gap-2 min-w-0 mt-0.5">
                                                    <p className="text-xs text-slate-400 truncate">{p.household.purok_sitio} · {p.household.street_address}</p>
                                                    {p.household.gps_lat !== undefined && p.household.gps_long !== undefined && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-300 flex-shrink-0">
                                                            📍 Pinned
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {tags.map(t => <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded-full border border-rose-100">{t}</span>)}
                                                    <span className="text-[9px] text-slate-400">{p.residents.length} resident{p.residents.length !== 1 ? 's' : ''}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5">
                                                <button
                                                    onClick={e => { e.stopPropagation(); openMaps(p.household.gps_lat, p.household.gps_long, p.household.street_address); }}
                                                    className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all"
                                                >
                                                    <Navigation className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setVisitedIds(prev => {
                                                            const next = new Set(prev);
                                                            isVisited ? next.delete(p.household.id) : next.add(p.household.id);
                                                            return next;
                                                        });
                                                    }}
                                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-lg transition-all ${isVisited ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                >
                                                    {isVisited ? '✓ Done' : 'Check-in'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Tab: Events ────────────────────────────── */}
                    {activeTab === 'events' && (
                        <div className="p-4 space-y-3">
                            {loading ? (
                                [...Array(2)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)
                            ) : events.length === 0 ? (
                                <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                                    <Package className="w-10 h-10" />
                                    <p className="text-sm font-semibold">No active distribution events</p>
                                </div>
                            ) : events.map(ev => (
                                <div key={ev.id} className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-sm">
                                    <div className="flex items-start gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                                            <Package className="w-4 h-4 text-emerald-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-900">{ev.event_name}</p>
                                            <p className="text-xs text-slate-400 flex items-center gap-1 truncate mt-0.5">
                                                <MapPin className="w-3 h-3 flex-shrink-0" />{ev.location}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                                <Calendar className="w-2.5 h-2.5" />
                                                {new Date(ev.scheduled_date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openMaps(ev.gps_lat, ev.gps_lng, ev.location)}
                                        className="w-full mt-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center gap-1.5 transition-all"
                                    >
                                        <Navigation className="w-3.5 h-3.5" />Navigate to Event
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── RIGHT PANEL — Map (60%) ────────────────────────────── */}
            <div className="flex-1 relative overflow-hidden">
                <DesktopMap
                    households={mapHouseholds}
                    incidents={incidents}
                    selectedHousehold={selectedHousehold}
                    onSelectHousehold={setSelectedHousehold}
                />

                {/* Map legend overlay */}
                <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg border border-slate-200/60 text-xs space-y-1.5">
                    <p className="font-bold text-slate-600 text-[10px] uppercase tracking-wider mb-1">Legend</p>
                    {[
                        { color: 'bg-indigo-500', label: 'Household' },
                        { color: 'bg-red-500', label: 'Critical' },
                        { color: 'bg-orange-500', label: 'High' },
                        { color: 'bg-amber-400', label: 'Medium' },
                    ].map(l => (
                        <div key={l.label} className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${l.color} flex-shrink-0`} />
                            <span className="text-slate-600">{l.label}</span>
                        </div>
                    ))}
                </div>

                {/* Selected household panel */}
                {selectedHousehold && (
                    <div className="absolute top-4 right-4 bg-white rounded-2xl shadow-xl border border-slate-200/60 p-4 w-64">
                        <div className="flex items-start justify-between mb-2">
                            <p className="font-bold text-slate-900 text-sm">{selectedHousehold.head_name}</p>
                            <button onClick={() => setSelectedHousehold(null)} className="text-slate-400 hover:text-slate-700">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{selectedHousehold.purok_sitio} · {selectedHousehold.street_address}
                        </p>
                        {selectedHousehold.contact_number && (
                            <p className="text-xs text-indigo-600 mt-1">📞 {selectedHousehold.contact_number}</p>
                        )}
                        <button
                            onClick={() => openMaps(selectedHousehold.gps_lat, selectedHousehold.gps_long, selectedHousehold.street_address)}
                            className="mt-3 w-full py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center gap-1.5 transition-all"
                        >
                            <Navigation className="w-3.5 h-3.5" />Navigate Here
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

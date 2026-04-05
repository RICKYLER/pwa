'use client';

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { getIncidents, updateIncidentStatus, seedDemoIncidents } from '@/lib/db/incidents';
import { getDistributionEvents } from '@/lib/db/distribution';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { getHouseholds } from '@/lib/db/households';
import type { DistributionEvent, Household, Incident, IncidentStatus, Resident, VulnerabilityFlags } from '@/lib/db/schema';
import { CheckCircle2, Package, Radio, RefreshCw, ShieldAlert, Users, Zap } from 'lucide-react';
import WeatherWidget from '@/components/WeatherWidget';
import ResponderLeafletMap from '@/components/ResponderLeafletMap';
import ResponderMapControlPanel from '@/components/ResponderMapControlPanel';
import ResponderSelectionSummary from '@/components/ResponderSelectionSummary';
import { CivicBadge, CivicChipButton, CivicPanel } from '@/components/ui/civic-primitives';
import { openResponderMapLocation } from '@/lib/responder-map-links';
import { useResponderMapControls } from '@/hooks/useResponderMapControls';

const SEVERITY_CFG = {
  critical: { label: 'Critical', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' },
  high: { label: 'High', dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  medium: { label: 'Medium', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  low: { label: 'Low', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
} as const;

const STATUS_FLOW: { value: IncidentStatus; label: string; color: string }[] = [
  { value: 'reported', label: 'Reported', color: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
  { value: 'verified', label: 'Verified', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { value: 'responding', label: 'Responding', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
  { value: 'resolved', label: 'Resolved', color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
];

const INCIDENT_TYPE_ICONS: Record<string, string> = {
  flood: '🌊',
  fire: '🔥',
  medical: '🏥',
  landslide: '⛰️',
  typhoon: '🌀',
  other: '⚡',
};

interface PriorityHousehold {
  household: Household;
  residents: Resident[];
  flags: VulnerabilityFlags[];
  score: number;
}

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function vulnTags(flags: VulnerabilityFlags[]): string[] {
  const tags: string[] = [];
  if (flags.some((flag) => flag.is_senior)) tags.push('Senior');
  if (flags.some((flag) => flag.is_pwd)) tags.push('PWD');
  if (flags.some((flag) => flag.is_pregnant)) tags.push('Pregnant');
  if (flags.some((flag) => flag.has_chronic_illness)) tags.push('Chronic');
  if (flags.some((flag) => flag.is_child)) tags.push('Child');
  return tags;
}

function navigateToHousehold(household: Household) {
  openResponderMapLocation(household.gps_lat, household.gps_long, household.street_address);
}

function navigateToIncident(incident: Incident) {
  openResponderMapLocation(incident.gps_lat, incident.gps_lng, incident.location);
}

function navigateToEvent(event: DistributionEvent) {
  openResponderMapLocation(event.gps_lat, event.gps_lng, event.location);
}

function activateOnEnterOrSpace(
  event: KeyboardEvent<HTMLDivElement>,
  activate: () => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  activate();
}

export default function ResponderDesktop() {
  const router = useRouter();
  const user = getCurrentUser();
  const mapControls = useResponderMapControls();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [priorities, setPriorities] = useState<PriorityHousehold[]>([]);
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [mapHouseholds, setMapHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [activeTab, setActiveTab] = useState<'incidents' | 'priorities' | 'events'>('incidents');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!hasRole(['responder', 'admin'])) {
      router.push('/dashboard');
      return;
    }

    void load();
  }, [router, user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      await seedDemoIncidents(user.id);
      const [allIncidents, households, residents, flags, ongoingEvents] = await Promise.all([
        getIncidents(),
        getHouseholds({
          barangay_id: user.barangay_id,
          registration_status: 'approved',
        }),
        db.getAll<Resident>(STORE_NAMES.residents),
        db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags),
        getDistributionEvents({ status: 'ongoing' }),
      ]);

      setIncidents(allIncidents);
      setEvents(ongoingEvents);
      setMapHouseholds(
        households.filter(
          (household) =>
            household.status === 'active'
            && household.gps_lat !== undefined
            && household.gps_long !== undefined,
        ),
      );

      const scored: PriorityHousehold[] = households
        .filter((household) => household.status === 'active')
        .map((household) => {
          const residentsInHousehold = residents.filter(
            (resident) => resident.household_id === household.id && resident.status === 'active',
          );
          const householdFlags = flags.filter((flag) => residentsInHousehold.some((resident) => resident.id === flag.resident_id));
          let score = 0;
          householdFlags.forEach((flag) => {
            if (flag.is_senior) score += 3;
            if (flag.is_pwd) score += 3;
            if (flag.is_pregnant) score += 3;
            if (flag.has_chronic_illness) score += 2;
            if (flag.is_child) score += 1;
          });
          return { household, residents: residentsInHousehold, flags: householdFlags, score };
        })
        .filter((priority) => priority.score > 0)
        .sort((a, b) => b.score - a.score);

      setPriorities(scored);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  async function handleStatusUpdate(id: string, status: IncidentStatus) {
    setUpdatingId(id);
    try {
      const updated = await updateIncidentStatus(id, status);
      setIncidents((current) => current.map((incident) => incident.id === id ? updated : incident));
      if (selectedIncident?.id === id) {
        setSelectedIncident(updated);
      }
    } finally {
      setUpdatingId(null);
    }
  }

  if (!user) return null;

  const activeIncidents = incidents.filter((incident) => incident.status !== 'resolved');
  const resolvedCount = incidents.filter((incident) => incident.status === 'resolved').length;

  return (
    <div className="flex h-full min-h-0 gap-5 p-5">
      <aside className="w-[410px] shrink-0 overflow-y-auto pr-1">
        <div className="space-y-4">
          <CivicPanel className="overflow-hidden border-cyan-100 bg-[linear-gradient(135deg,#083344,#164e63)] text-white shadow-[0_28px_60px_-36px_rgba(8,47,73,0.7)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/70">Response Operations</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight">{user.name}</h2>
                <p className="mt-1 text-sm text-cyan-100/80">Field responder for {user.barangay_id}</p>
              </div>
              <button
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { label: 'Active', value: activeIncidents.length },
                { label: 'Priority', value: priorities.length },
                { label: 'Resolved', value: resolvedCount },
              ].map((metric) => (
                <div key={metric.label} className="rounded-[20px] border border-white/10 bg-white/10 px-3 py-3">
                  <p className="text-2xl font-black">{loading ? '—' : metric.value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">{metric.label}</p>
                </div>
              ))}
            </div>
          </CivicPanel>

          <WeatherWidget mode="compact" className="civic-card-shadow" />

          <ResponderMapControlPanel
            activeBaseLayerId={mapControls.activeBaseLayerId}
            activeLayerIds={mapControls.activeLayerIds}
            activeLayerSummary={mapControls.activeLayerSummary}
            allLayersSelected={mapControls.allLayersSelected}
            overlayOpacity={mapControls.overlayOpacity}
            showAdvancedLayers={mapControls.showAdvancedLayers}
            showWeather={mapControls.showWeather}
            weatherOverlayVisible={mapControls.weatherOverlayVisible}
            windLayerSelected={mapControls.windLayerSelected}
            onActiveBaseLayerChange={mapControls.handleActiveBaseLayerChange}
            onOverlayOpacityChange={mapControls.handleOverlayOpacityChange}
            onShowAdvancedLayersChange={mapControls.handleShowAdvancedLayersChange}
            onToggleLayer={mapControls.handleLayerToggle}
            onToggleWeatherVisibility={mapControls.handleWeatherVisibilityToggle}
            onOpenAllLayers={mapControls.handleOpenAllLayers}
            onClearAllLayers={mapControls.handleClearAllLayers}
          />

          <ResponderSelectionSummary
            household={selectedHousehold}
            incident={selectedIncident}
            onClear={() => {
              setSelectedHousehold(null);
              setSelectedIncident(null);
            }}
            onNavigateHousehold={navigateToHousehold}
            onNavigateIncident={navigateToIncident}
          />

          <CivicPanel className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'incidents', label: 'Incidents', count: activeIncidents.length },
                { key: 'priorities', label: 'Check-ins', count: priorities.length },
                { key: 'events', label: 'Events', count: events.length },
              ] as const).map((tab) => (
                <CivicChipButton
                  key={tab.key}
                  active={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${activeTab === tab.key ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {loading ? '—' : tab.count}
                  </span>
                </CivicChipButton>
              ))}
            </div>

            {activeTab === 'incidents' ? (
              <div className="space-y-3">
                {loading ? (
                  [...Array(3)].map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
                  ))
                ) : activeIncidents.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">No active incidents</p>
                    <p className="mt-1 text-sm text-slate-500">The response area is currently clear.</p>
                  </div>
                ) : (
                  activeIncidents.map((incident) => {
                    const cfg = SEVERITY_CFG[incident.severity as keyof typeof SEVERITY_CFG] ?? SEVERITY_CFG.low;
                    const selectIncident = () => {
                      setSelectedIncident(incident);
                      setSelectedHousehold(null);
                    };
                    return (
                      <div
                        key={incident.id}
                        role="button"
                        tabIndex={0}
                        onClick={selectIncident}
                        onKeyDown={(event) => activateOnEnterOrSpace(event, selectIncident)}
                        className={`w-full cursor-pointer rounded-[24px] border bg-white p-4 text-left transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-900/20 ${
                          selectedIncident?.id === incident.id ? 'border-cyan-900/20 shadow-md' : 'border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-2xl">{INCIDENT_TYPE_ICONS[incident.type] ?? '⚡'}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${cfg.badge}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                              <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{incident.type.replaceAll('_', ' ')}</span>
                            </div>
                            <p className="mt-2 text-sm font-bold text-slate-950">{incident.location}</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">{incident.description}</p>
                            <p className="mt-2 text-[11px] font-medium text-slate-400">{timeAgo(incident.reported_at)}</p>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-4 gap-1">
                          {STATUS_FLOW.map((status) => (
                            <button
                              key={status.value}
                              type="button"
                              disabled={updatingId === incident.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleStatusUpdate(incident.id, status.value);
                              }}
                              className={`rounded-xl py-2 text-[10px] font-bold transition ${
                                incident.status === status.value
                                  ? `${status.color} ring-1 ring-inset ring-current`
                                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              {updatingId === incident.id ? '…' : status.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}

            {activeTab === 'priorities' ? (
              <div className="space-y-3">
                {loading ? (
                  [...Array(4)].map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-[24px] bg-slate-100" />
                  ))
                ) : priorities.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">No priority households</p>
                  </div>
                ) : (
                  priorities.map((priority, index) => {
                    const tags = vulnTags(priority.flags);
                    const isVisited = visitedIds.has(priority.household.id);
                    const selectHousehold = () => {
                      setSelectedHousehold(priority.household);
                      setSelectedIncident(null);
                    };
                    return (
                      <div
                        key={priority.household.id}
                        role="button"
                        tabIndex={0}
                        onClick={selectHousehold}
                        onKeyDown={(event) => activateOnEnterOrSpace(event, selectHousehold)}
                        className={`w-full cursor-pointer rounded-[24px] border px-4 py-4 text-left transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-900/20 ${
                          isVisited ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200/80 bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-100 text-xs font-black text-slate-600">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-950">{priority.household.head_name}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{priority.household.purok_sitio} · {priority.household.street_address}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {tags.map((tag) => (
                                <CivicBadge key={tag} label={tag} tone="rose" className="text-[10px]" />
                              ))}
                              <CivicBadge label={`${priority.residents.length} residents`} tone="slate" className="text-[10px]" />
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigateToHousehold(priority.household);
                            }}
                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            Navigate
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setVisitedIds((current) => {
                                const next = new Set(current);
                                if (next.has(priority.household.id)) {
                                  next.delete(priority.household.id);
                                } else {
                                  next.add(priority.household.id);
                                }
                                return next;
                              });
                            }}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                              isVisited ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {isVisited ? 'Checked in' : 'Mark check-in'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}

            {activeTab === 'events' ? (
              <div className="space-y-3">
                {loading ? (
                  [...Array(2)].map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-[24px] bg-slate-100" />
                  ))
                ) : events.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                    <Package className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">No active distribution events</p>
                  </div>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">{event.event_name}</p>
                          <p className="mt-1 text-xs text-slate-500">{event.location}</p>
                          <p className="mt-2 text-[11px] font-medium text-slate-400">
                            {new Date(event.scheduled_date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                        <CivicBadge label="Active" tone="emerald" />
                      </div>
                      <button
                        type="button"
                        onClick={() => navigateToEvent(event)}
                        className="mt-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        Navigate
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </CivicPanel>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="flex h-full min-h-[720px] flex-col gap-4">
          <CivicPanel className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Map workspace</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Clean field map canvas</h2>
              <p className="mt-1 text-sm text-slate-500">Weather, basemap, and selected-item detail now stay in the operations rail.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CivicBadge label={`${mapControls.activeBaseLayer.label} base`} tone="navy" />
              <CivicBadge
                label={mapControls.weatherOverlayVisible ? mapControls.activeLayerSummary : 'Weather hidden'}
                tone={mapControls.weatherOverlayVisible ? 'teal' : 'slate'}
              />
            </div>
          </CivicPanel>

          <div className="min-h-0 flex-1">
            <ResponderLeafletMap
              households={mapHouseholds}
              incidents={incidents}
              selectedHousehold={selectedHousehold}
              onSelectHousehold={(household) => {
                setSelectedHousehold(household);
                if (household) setSelectedIncident(null);
              }}
              selectedIncident={selectedIncident}
              onSelectIncident={(incident) => {
                setSelectedIncident(incident);
                if (incident) setSelectedHousehold(null);
              }}
              activeBaseLayerId={mapControls.activeBaseLayerId}
              activeLayerIds={mapControls.activeLayerIds}
              showWeather={mapControls.showWeather}
              overlayOpacity={mapControls.overlayOpacity}
              refreshVersion={mapControls.mapRefreshVersion}
              containerClassName="h-full"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

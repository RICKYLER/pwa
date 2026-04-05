'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { getIncidents, updateIncidentStatus, seedDemoIncidents } from '@/lib/db/incidents';
import { getDistributionEvents } from '@/lib/db/distribution';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { getHouseholds } from '@/lib/db/households';
import type {
  DistributionEvent,
  Household,
  Incident,
  IncidentStatus,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { CheckCircle2, Layers3, Loader2, Navigation, Package, RefreshCw, ShieldAlert, Users, X, Zap } from 'lucide-react';
import WeatherWidget from '@/components/WeatherWidget';
import ResponderLeafletMap from '@/components/ResponderLeafletMap';
import ResponderMapControlPanel from '@/components/ResponderMapControlPanel';
import ResponderSelectionSummary from '@/components/ResponderSelectionSummary';
import { CivicBadge, CivicChipButton, CivicPanel } from '@/components/ui/civic-primitives';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { openResponderMapLocation } from '@/lib/responder-map-links';
import { useResponderMapControls } from '@/hooks/useResponderMapControls';

interface PriorityHousehold {
  household: Household;
  residents: Resident[];
  flags: VulnerabilityFlags[];
  score: number;
}

function howLongAgo(date: Date): string {
  const minutesPassed = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutesPassed < 1) return 'just now';
  if (minutesPassed < 60) return `${minutesPassed}m ago`;
  const hoursPassed = Math.floor(minutesPassed / 60);
  if (hoursPassed < 24) return `${hoursPassed}h ago`;
  return `${Math.floor(hoursPassed / 24)}d ago`;
}

function getHouseholdPriorityScore(flags: VulnerabilityFlags[]): number {
  let score = 0;
  for (const flag of flags) {
    if (flag.is_senior) score += 3;
    if (flag.is_pwd) score += 3;
    if (flag.is_pregnant) score += 3;
    if (flag.has_chronic_illness) score += 2;
    if (flag.is_child) score += 1;
  }
  return score;
}

function getVulnerabilityLabels(flags: VulnerabilityFlags[]): string[] {
  const labels: string[] = [];
  if (flags.some((flag) => flag.is_senior)) labels.push('Senior');
  if (flags.some((flag) => flag.is_pwd)) labels.push('PWD');
  if (flags.some((flag) => flag.is_pregnant)) labels.push('Pregnant');
  if (flags.some((flag) => flag.has_chronic_illness)) labels.push('Chronic');
  if (flags.some((flag) => flag.is_child)) labels.push('Child');
  return labels;
}

function getSeverityStyle(severity: string) {
  const styles = {
    critical: { text: 'text-red-600', badge: 'bg-red-50 text-red-700 border-red-200' },
    high: { text: 'text-orange-600', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
    medium: { text: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    low: { text: 'text-slate-500', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  };
  return styles[severity as keyof typeof styles] ?? styles.low;
}

const incidentEmoji: Record<string, string> = {
  flood: '🌊',
  fire: '🔥',
  medical: '🏥',
  landslide: '⛰️',
  typhoon: '🌀',
  other: '⚡',
};

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
    { value: 'reported', label: 'Reported', description: 'Newly reported and not yet confirmed.' },
    { value: 'verified', label: 'Verified', description: 'Confirmed and waiting for response.' },
    { value: 'responding', label: 'Responding', description: 'Responder is on the way or on site.' },
    { value: 'resolved', label: 'Resolved', description: 'Incident contained and closed.' },
  ];

  async function pickStatus(status: IncidentStatus) {
    setSaving(true);
    await onSave(incident.id, status);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
      <div
        className="relative z-10 rounded-t-[28px] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <div className="px-5 py-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-950">Update incident status</h3>
              <p className="mt-1 text-xs text-slate-500">{incident.location}</p>
            </div>
            <button onClick={onClose} className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            {allStatuses.map((status) => {
              const isCurrent = status.value === incident.status;
              return (
                <button
                  key={status.value}
                  type="button"
                  disabled={saving || isCurrent}
                  onClick={() => void pickStatus(status.value)}
                  className={`flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition ${
                    isCurrent ? 'border-cyan-900/15 bg-cyan-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <span className={`h-2 w-2 rounded-full ${isCurrent ? 'bg-cyan-900' : 'bg-slate-300'}`} />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${isCurrent ? 'text-cyan-950' : 'text-slate-800'}`}>{status.label}</p>
                    <p className="text-xs text-slate-500">{status.description}</p>
                  </div>
                  {isCurrent ? <CivicBadge label="Current" tone="navy" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResponderMobile() {
  const router = useRouter();
  const user = getCurrentUser();
  const mapControls = useResponderMapControls();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [priorities, setPriorities] = useState<PriorityHousehold[]>([]);
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [mapHouseholds, setMapHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetIncident, setSheetIncident] = useState<Incident | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [mapControlsOpen, setMapControlsOpen] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!hasRole(['responder', 'admin'])) {
      router.push('/dashboard');
      return;
    }

    void loadData();
  }, [router, user]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      await seedDemoIncidents(user.id);

      const [allIncidents, allHouseholds, allResidents, allFlags, ongoingEvents] = await Promise.all([
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
        allHouseholds.filter(
          (household) =>
            household.status === 'active'
            && household.gps_lat !== undefined
            && household.gps_long !== undefined,
        ),
      );

      const householdsWithScores: PriorityHousehold[] = allHouseholds
        .filter((household) => household.status === 'active')
        .map((household) => {
          const residentsInHousehold = allResidents.filter(
            (resident) => resident.household_id === household.id && resident.status === 'active',
          );
          const householdFlags = allFlags.filter((flag) => residentsInHousehold.some((resident) => resident.id === flag.resident_id));
          const score = getHouseholdPriorityScore(householdFlags);
          return { household, residents: residentsInHousehold, flags: householdFlags, score };
        })
        .filter((household) => household.score > 0)
        .sort((a, b) => b.score - a.score);

      setPriorities(householdsWithScores);
    } catch (error) {
      console.error('Failed to load responder data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  async function changeIncidentStatus(id: string, newStatus: IncidentStatus) {
    const updated = await updateIncidentStatus(id, newStatus);
    setIncidents((current) => current.map((incident) => incident.id === id ? updated : incident));
    if (selectedIncident?.id === id) {
      setSelectedIncident(updated);
    }
  }

  function toggleVisited(householdId: string) {
    setVisited((current) => {
      const next = new Set(current);
      if (next.has(householdId)) {
        next.delete(householdId);
      } else {
        next.add(householdId);
      }
      return next;
    });
  }

  if (!user) return null;

  const activeIncidents = incidents.filter((incident) => incident.status !== 'resolved');
  const resolvedCount = incidents.filter((incident) => incident.status === 'resolved').length;

  return (
    <>
      {sheetIncident ? (
        <StatusUpdateSheet
          incident={sheetIncident}
          onSave={changeIncidentStatus}
          onClose={() => setSheetIncident(null)}
        />
      ) : null}

      <Drawer open={mapControlsOpen} onOpenChange={setMapControlsOpen}>
        <DrawerContent className="max-h-[88vh] rounded-t-[28px]">
          <DrawerHeader className="pb-0 text-left">
            <DrawerTitle>Map controls</DrawerTitle>
            <DrawerDescription>Weather overlays and base-map options live here instead of on the map canvas.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-5 pt-3">
            <ResponderMapControlPanel
              compact
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
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={selectionOpen} onOpenChange={setSelectionOpen}>
        <DrawerContent className="max-h-[82vh] rounded-t-[28px]">
          <DrawerHeader className="pb-0 text-left">
            <DrawerTitle>Selected map item</DrawerTitle>
            <DrawerDescription>Household and incident detail opens here after you tap a marker.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-5 pt-3">
            <ResponderSelectionSummary
              compact
              household={selectedHousehold}
              incident={selectedIncident}
              onClear={() => {
                setSelectedHousehold(null);
                setSelectedIncident(null);
                setSelectionOpen(false);
              }}
              onNavigateHousehold={(household) => openResponderMapLocation(household.gps_lat, household.gps_long, household.street_address)}
              onNavigateIncident={(incident) => openResponderMapLocation(incident.gps_lat, incident.gps_lng, incident.location)}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <div className="space-y-5 px-4 pb-24 pt-4">
        <CivicPanel className="overflow-hidden border-cyan-100 bg-[linear-gradient(135deg,#083344,#164e63)] text-white shadow-[0_28px_60px_-36px_rgba(8,47,73,0.7)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Response Operations</p>
              <h2 className="mt-3 text-xl font-black tracking-tight">{user.name}</h2>
              <p className="mt-1 text-sm text-cyan-100/80">Field responder for {user.barangay_id}</p>
            </div>
            <button
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: 'Active', value: activeIncidents.length },
              { label: 'Priority', value: priorities.length },
              { label: 'Resolved', value: resolvedCount },
            ].map((metric) => (
              <div key={metric.label} className="rounded-[18px] border border-white/10 bg-white/10 px-3 py-3">
                <p className="text-xl font-black">{loading ? '—' : metric.value}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/70">{metric.label}</p>
              </div>
            ))}
          </div>
        </CivicPanel>

        <WeatherWidget mode="compact" />

        <CivicPanel className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Map workspace</p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Field map</h2>
              <p className="mt-1 text-sm text-slate-500">Tap markers to open the selection drawer. Controls stay outside the map.</p>
            </div>
            <CivicBadge label={mapControls.activeBaseLayer.label} tone="navy" />
          </div>

          <ResponderLeafletMap
            households={mapHouseholds}
            incidents={incidents}
            selectedHousehold={selectedHousehold}
            onSelectHousehold={(household) => {
              setSelectedHousehold(household);
              if (household) {
                setSelectedIncident(null);
                setSelectionOpen(true);
              }
            }}
            selectedIncident={selectedIncident}
            onSelectIncident={(incident) => {
              setSelectedIncident(incident);
              if (incident) {
                setSelectedHousehold(null);
                setSelectionOpen(true);
              }
            }}
            activeBaseLayerId={mapControls.activeBaseLayerId}
            activeLayerIds={mapControls.activeLayerIds}
            showWeather={mapControls.showWeather}
            overlayOpacity={mapControls.overlayOpacity}
            refreshVersion={mapControls.mapRefreshVersion}
            containerClassName="h-[340px]"
            compactWeather
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMapControlsOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Layers3 className="h-4 w-4" />
              Map controls
            </button>
            <button
              type="button"
              onClick={() => setSelectionOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Navigation className="h-4 w-4" />
              {selectedIncident || selectedHousehold ? 'Selection open' : 'No selection'}
            </button>
          </div>
        </CivicPanel>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-bold text-slate-950">Active incidents</h2>
            </div>
            <CivicBadge label={`${activeIncidents.length} active`} tone="rose" />
          </div>

          {loading ? (
            <div className="flex gap-3 overflow-x-hidden">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-44 w-72 flex-shrink-0 animate-pulse rounded-[24px] bg-slate-100" />
              ))}
            </div>
          ) : activeIncidents.length === 0 ? (
            <CivicPanel className="text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-3 text-sm font-semibold text-slate-950">All clear</p>
              <p className="mt-1 text-sm text-slate-500">No active incidents in the response area.</p>
            </CivicPanel>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {activeIncidents.map((incident) => {
                const style = getSeverityStyle(incident.severity);
                return (
                  <div key={incident.id} className="w-[19rem] flex-shrink-0 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.35)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{incidentEmoji[incident.type] ?? '⚡'}</span>
                        <div>
                          <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${style.text}`}>{incident.severity}</p>
                          <p className="text-sm font-bold text-slate-950">{incident.location}</p>
                        </div>
                      </div>
                      <CivicBadge label={incident.status} tone="navy" />
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-600">{incident.description}</p>
                    <p className="mt-3 text-[11px] font-medium text-slate-400">{howLongAgo(incident.reported_at)}</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIncident(incident);
                          setSelectedHousehold(null);
                          setSelectionOpen(true);
                        }}
                        className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetIncident(incident)}
                        className="flex-1 rounded-full bg-cyan-950 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        onClick={() => openResponderMapLocation(incident.gps_lat, incident.gps_lng, incident.location)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Go
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-500" />
              <h2 className="text-sm font-bold text-slate-950">Priority check-ins</h2>
            </div>
            <CivicBadge label={`${priorities.length} households`} tone="amber" />
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-[24px] bg-slate-100" />
              ))}
            </div>
          ) : priorities.length === 0 ? (
            <CivicPanel className="text-center">
              <Users className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-950">No priority households</p>
            </CivicPanel>
          ) : (
            <div className="space-y-2">
              {priorities.map((priority, index) => {
                const labels = getVulnerabilityLabels(priority.flags);
                const alreadyVisited = visited.has(priority.household.id);

                return (
                  <div
                    key={priority.household.id}
                    className={`rounded-[24px] border px-4 py-4 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.25)] ${
                      alreadyVisited ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200/80 bg-white'
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
                          {labels.map((label) => (
                            <CivicBadge key={label} label={label} tone="rose" className="text-[10px]" />
                          ))}
                          <CivicBadge label={`${priority.residents.length} residents`} tone="slate" className="text-[10px]" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHousehold(priority.household);
                          setSelectedIncident(null);
                          setSelectionOpen(true);
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => openResponderMapLocation(priority.household.gps_lat, priority.household.gps_long, `${priority.household.street_address}, ${priority.household.purok_sitio}`)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Navigate
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleVisited(priority.household.id)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold ${
                          alreadyVisited ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {alreadyVisited ? 'Visited' : 'Check-in'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {events.length > 0 ? (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-950">Assignments</h2>
            </div>
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.25)]">
                  <p className="text-sm font-bold text-slate-950">{event.event_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{event.location}</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openResponderMapLocation(event.gps_lat, event.gps_lng, event.location)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      <Navigation className="mr-1 inline h-3.5 w-3.5" />
                      Navigate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

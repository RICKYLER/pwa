'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Layers3,
  Loader2,
  Navigation,
  Package,
  RefreshCw,
  ShieldAlert,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import WeatherWidget from '@/components/WeatherWidget';
import ResponderLeafletMap from '@/components/ResponderLeafletMap';
import ResponderMapControlPanel from '@/components/ResponderMapControlPanel';
import ResponderSelectionSummary from '@/components/ResponderSelectionSummary';
import { MobileActionBar, MobileListCard, MobilePageHeader } from '@/components/mobile/mobile-primitives';
import { CivicBadge, CivicEmptyState, CivicPage, CivicPanel } from '@/components/ui/civic-primitives';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { getDistributionEvents } from '@/lib/db/distribution';
import { getHouseholds } from '@/lib/db/households';
import { getIncidents, seedDemoIncidents, updateIncidentStatus } from '@/lib/db/incidents';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import type {
  DistributionEvent,
  Household,
  Incident,
  IncidentStatus,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { openResponderMapLocation } from '@/lib/responder-map-links';
import { useResponderMapControls } from '@/hooks/useResponderMapControls';
import {
  getResponderCoverageLabel,
  getResponderMappedHouseholds,
} from '@/lib/responder-households';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

interface PriorityHousehold {
  household: Household;
  residents: Resident[];
  flags: VulnerabilityFlags[];
  score: number;
}

const INCIDENT_TYPE_CODE: Record<string, string> = {
  flood: 'FL',
  fire: 'FR',
  medical: 'MD',
  landslide: 'LS',
  typhoon: 'TY',
  other: 'AL',
};

const INCIDENT_STATUS_OPTIONS: { value: IncidentStatus; label: string; description: string }[] = [
  { value: 'reported', label: 'Reported', description: 'Newly reported and waiting for verification.' },
  { value: 'verified', label: 'Verified', description: 'Confirmed and queued for response.' },
  { value: 'responding', label: 'Responding', description: 'Responder is on the way or already on site.' },
  { value: 'resolved', label: 'Resolved', description: 'Incident is contained and the task is closed.' },
];

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

function getSeverityTone(severity: string) {
  const tones = {
    critical: 'rose',
    high: 'amber',
    medium: 'navy',
    low: 'slate',
  } as const;

  return tones[severity as keyof typeof tones] ?? tones.low;
}

function StatusUpdateSheet({
  incident,
  onSave,
  onClose,
}: {
  incident: Incident | null;
  onSave: (id: string, newStatus: IncidentStatus) => Promise<void>;
  onClose: () => void;
}) {
  const [savingStatus, setSavingStatus] = useState<IncidentStatus | null>(null);

  if (!incident) {
    return null;
  }

  const currentIncident = incident;

  async function pickStatus(status: IncidentStatus) {
    setSavingStatus(status);
    await onSave(currentIncident.id, status);
    setSavingStatus(null);
    onClose();
  }

  return (
    <Drawer open={Boolean(currentIncident)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="max-h-[80vh] rounded-t-[30px] border-slate-200 bg-white">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base font-bold text-slate-950">Update incident status</DrawerTitle>
          <DrawerDescription className="text-sm leading-6 text-slate-500">
            {currentIncident.location}
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-2 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-1">
          {INCIDENT_STATUS_OPTIONS.map((status) => {
            const isCurrent = status.value === currentIncident.status;
            const isSaving = savingStatus === status.value;
            return (
              <button
                key={status.value}
                type="button"
                disabled={Boolean(savingStatus) || isCurrent}
                onClick={() => { void pickStatus(status.value); }}
                className={`flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition ${
                  isCurrent ? 'border-cyan-900/15 bg-cyan-50' : 'border-slate-200 bg-white'
                }`}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : (
                  <span className={`h-2.5 w-2.5 rounded-full ${isCurrent ? 'bg-cyan-950' : 'bg-slate-300'}`} />
                )}
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${isCurrent ? 'text-cyan-950' : 'text-slate-800'}`}>{status.label}</p>
                  <p className="text-xs text-slate-500">{status.description}</p>
                </div>
                {isCurrent ? <CivicBadge label="Current" tone="navy" className="text-[10px]" /> : null}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
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
  const [queueOpen, setQueueOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      await seedDemoIncidents(user.id);

      const [allIncidents, allApprovedHouseholds, allResidents, allFlags, ongoingEvents] = await Promise.all([
        getIncidents(),
        getHouseholds({
          registration_status: 'approved',
        }),
        db.getAll<Resident>(STORE_NAMES.residents),
        db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags),
        getDistributionEvents({ status: 'ongoing' }),
      ]);
      const allHouseholds = getResponderMappedHouseholds(allApprovedHouseholds, user);

      setIncidents(allIncidents);
      setEvents(ongoingEvents);
      setMapHouseholds(allHouseholds);

      const householdsWithScores: PriorityHousehold[] = allHouseholds
        .map((household) => {
          const residentsInHousehold = allResidents.filter(
            (resident) => resident.household_id === household.id && resident.status === 'active',
          );
          const householdFlags = allFlags.filter((flag) => residentsInHousehold.some((resident) => resident.id === flag.resident_id));
          const score = getHouseholdPriorityScore(householdFlags);
          return { household, residents: residentsInHousehold, flags: householdFlags, score };
        })
        .filter((household) => household.score > 0)
        .sort((left, right) => right.score - left.score);

      setPriorities(householdsWithScores);
    } catch (error) {
      console.error('Failed to load responder data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const scheduleLoad = useCallback((delayMs = 0) => {
    if (reloadTimerRef.current !== null) {
      clearTimeout(reloadTimerRef.current);
    }

    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void loadData();
    }, delayMs);
  }, [loadData]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!hasRole(['responder', 'admin'])) {
      router.push('/dashboard');
      return;
    }

    scheduleLoad();
  }, [router, scheduleLoad, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (!['households', 'residents', 'vulnerability_flags', 'incidents', 'distribution_events'].includes(event.detail.table)) {
        return;
      }

      scheduleLoad(event.detail.mode === 'hydrate' ? 140 : 40);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
      if (reloadTimerRef.current !== null) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [scheduleLoad, user]);

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
  const hasSelection = Boolean(selectedHousehold || selectedIncident);

  return (
    <>
      <StatusUpdateSheet incident={sheetIncident} onSave={changeIncidentStatus} onClose={() => setSheetIncident(null)} />

      <Drawer open={mapControlsOpen} onOpenChange={setMapControlsOpen}>
        <DrawerContent className="max-h-[88vh] rounded-t-[30px] border-slate-200 bg-white">
          <DrawerHeader className="pb-0 text-left">
            <DrawerTitle>Map controls</DrawerTitle>
            <DrawerDescription>Weather overlays and base-map controls stay here instead of covering the map.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
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
        <DrawerContent className="max-h-[82vh] rounded-t-[30px] border-slate-200 bg-white">
          <DrawerHeader className="pb-0 text-left">
            <DrawerTitle>Selected map item</DrawerTitle>
            <DrawerDescription>Household and incident detail opens here after you tap a marker.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
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

      <Drawer open={queueOpen} onOpenChange={setQueueOpen}>
        <DrawerContent className="max-h-[84vh] rounded-t-[30px] border-slate-200 bg-white">
          <DrawerHeader className="pb-0 text-left">
            <DrawerTitle>Incident queue</DrawerTitle>
            <DrawerDescription>Triaging incidents lives in a drawer so the map stays primary on mobile.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="h-32 animate-pulse rounded-[24px] bg-slate-100" />
                ))}
              </div>
            ) : activeIncidents.length === 0 ? (
              <CivicEmptyState
                icon={CheckCircle2}
                title="All clear"
                description="No active incidents are waiting in the queue."
              />
            ) : (
              activeIncidents.map((incident) => (
                <MobileListCard
                  key={incident.id}
                  title={incident.location}
                  subtitle={incident.description}
                  leading={<span className="text-[11px] font-bold tracking-[0.12em]">{INCIDENT_TYPE_CODE[incident.type] || 'AL'}</span>}
                  status={(
                    <>
                      <CivicBadge label={incident.status} tone="navy" className="text-[10px]" />
                      <CivicBadge label={incident.severity} tone={getSeverityTone(incident.severity)} className="text-[10px]" />
                    </>
                  )}
                  meta={(
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{howLongAgo(incident.reported_at)}</span>
                      <span>{incident.location}</span>
                    </div>
                  )}
                  actions={(
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedIncident(incident);
                          setSelectedHousehold(null);
                          setQueueOpen(false);
                          setSelectionOpen(true);
                        }}
                        className="h-10 rounded-full border-slate-200 px-4 text-xs font-semibold text-slate-700"
                      >
                        Inspect
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setSheetIncident(incident)}
                        className="h-10 rounded-full px-4 text-xs font-semibold"
                      >
                        Update
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openResponderMapLocation(incident.gps_lat, incident.gps_lng, incident.location)}
                        className="h-10 rounded-full border-slate-200 px-4 text-xs font-semibold text-slate-700"
                      >
                        Go
                      </Button>
                    </>
                  )}
                />
              ))
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={priorityOpen} onOpenChange={setPriorityOpen}>
        <DrawerContent className="max-h-[84vh] rounded-t-[30px] border-slate-200 bg-white">
          <DrawerHeader className="pb-0 text-left">
            <DrawerTitle>Priority check-ins</DrawerTitle>
            <DrawerDescription>Use the queue to inspect high-risk households without pushing the map off-screen.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="h-32 animate-pulse rounded-[24px] bg-slate-100" />
                ))}
              </div>
            ) : priorities.length === 0 ? (
              <CivicEmptyState
                icon={Users}
                title="No priority households"
                description="Vulnerability scoring did not surface any check-ins right now."
              />
            ) : (
              priorities.map((priority, index) => {
                const labels = getVulnerabilityLabels(priority.flags);
                const alreadyVisited = visited.has(priority.household.id);
                const canNavigate = priority.household.gps_lat !== undefined && priority.household.gps_long !== undefined;

                return (
                  <MobileListCard
                    key={priority.household.id}
                    title={priority.household.head_name}
                    subtitle={`${priority.household.purok_sitio} | ${priority.household.street_address}`}
                    leading={<span className="text-sm font-bold">{index + 1}</span>}
                    status={(
                      <>
                        {labels.map((label) => (
                          <CivicBadge key={label} label={label} tone="rose" className="text-[10px]" />
                        ))}
                        <CivicBadge label={`Score ${priority.score}`} tone="amber" className="text-[10px]" />
                        {alreadyVisited ? <CivicBadge label="Visited" tone="emerald" className="text-[10px]" /> : null}
                      </>
                    )}
                    meta={(
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span>{priority.residents.length} residents</span>
                        <span>{canNavigate ? 'Mapped' : 'No map pin'}</span>
                      </div>
                    )}
                    actions={(
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setSelectedHousehold(priority.household);
                            setSelectedIncident(null);
                            setPriorityOpen(false);
                            setSelectionOpen(true);
                          }}
                          className="h-10 rounded-full border-slate-200 px-4 text-xs font-semibold text-slate-700"
                        >
                          Inspect
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!canNavigate}
                          onClick={() => openResponderMapLocation(
                            priority.household.gps_lat,
                            priority.household.gps_long,
                            `${priority.household.street_address}, ${priority.household.purok_sitio}`,
                          )}
                          className="h-10 rounded-full border-slate-200 px-4 text-xs font-semibold text-slate-700"
                        >
                          Navigate
                        </Button>
                        <Button
                          type="button"
                          variant={alreadyVisited ? 'default' : 'outline'}
                          onClick={() => toggleVisited(priority.household.id)}
                          className="h-10 rounded-full px-4 text-xs font-semibold"
                        >
                          {alreadyVisited ? 'Visited' : 'Check-in'}
                        </Button>
                      </>
                    )}
                  />
                );
              })
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <CivicPage className="space-y-4 px-4 py-4 pb-40">
        <MobilePageHeader
          title="Field response"
          subtitle={loading ? 'Loading field operations...' : `${activeIncidents.length} active incidents · ${mapHouseholds.length} verified household pins · ${getResponderCoverageLabel(user)}`}
          primaryAction={(
            <Button
              type="button"
              variant="outline"
              onClick={() => { void loadData(); }}
              className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          )}
        />

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Active', value: activeIncidents.length },
            { label: 'Priority', value: priorities.length },
            { label: 'Resolved', value: resolvedCount },
          ].map((metric) => (
            <CivicPanel key={metric.label} className="rounded-[22px] p-3 text-center">
              <p className="text-lg font-black tracking-tight text-slate-950">{loading ? '--' : metric.value}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{metric.label}</p>
            </CivicPanel>
          ))}
        </div>

        <CivicPanel className="space-y-4 rounded-[26px] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Map workspace</p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Field map</h2>
              <p className="mt-1 text-sm text-slate-500">Only approved and location-verified households appear here. Tap markers to open the selection drawer.</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <CivicBadge label={`${mapHouseholds.length} verified pins`} tone="emerald" className="text-[10px]" />
              <CivicBadge label={mapControls.activeBaseLayer.label} tone="navy" className="text-[10px]" />
            </div>
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
            containerClassName="h-[380px]"
            compactWeather
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMapControlsOpen(true)}
              className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              <Layers3 className="h-4 w-4" />
              Layers
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectionOpen(true)}
              disabled={!hasSelection}
              className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              <Navigation className="h-4 w-4" />
              {hasSelection ? 'Selection' : 'No selection'}
            </Button>
          </div>
        </CivicPanel>

        <WeatherWidget mode="compact" />

        {events.length > 0 ? (
          <CivicPanel className="space-y-3 rounded-[24px] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Assignments</p>
                <h2 className="mt-1 text-base font-bold text-slate-950">Ongoing distribution support</h2>
              </div>
              <CivicBadge label={`${events.length} live`} tone="emerald" className="text-[10px]" />
            </div>
            <div className="space-y-2">
              {events.slice(0, 2).map((event) => (
                <div key={event.id} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-bold text-slate-950">{event.event_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{event.location}</p>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openResponderMapLocation(event.gps_lat, event.gps_lng, event.location)}
                      className="h-10 rounded-full border-slate-200 px-4 text-xs font-semibold text-slate-700"
                    >
                      Navigate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CivicPanel>
        ) : null}
      </CivicPage>

      <MobileActionBar
        primaryAction={(
          <Button type="button" onClick={() => setQueueOpen(true)} className="h-12 w-full rounded-[20px] px-4 text-sm font-semibold">
            <Zap className="h-4 w-4" />
            Incident queue
            <span className="ml-1 text-xs text-primary-foreground/80">{loading ? '--' : activeIncidents.length}</span>
          </Button>
        )}
        secondaryAction={(
          <Button
            type="button"
            variant="outline"
            onClick={() => setPriorityOpen(true)}
            className="h-12 rounded-[20px] border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            <ShieldAlert className="h-4 w-4" />
            {loading ? '--' : priorities.length}
          </Button>
        )}
      />
    </>
  );
}


'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import IncidentImpactPanel, { IncidentImpactSummary } from '@/components/IncidentImpactPanel';
import BarangayResponsePanel from '@/components/BarangayResponsePanel';
import EvacuationCenterPanel from '@/components/EvacuationCenterPanel';
import { MobileActionBar, MobileListCard, MobilePageHeader } from '@/components/mobile/mobile-primitives';
import { CivicBadge, CivicChipButton, CivicEmptyState, CivicPage, CivicPanel } from '@/components/ui/civic-primitives';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { getDisasterAlertRules, getDisasterAlerts } from '@/lib/db/disaster-alerts';
import { getDistributionEvents } from '@/lib/db/distribution';
import { getHouseholds } from '@/lib/db/households';
import { getIncidents, updateIncidentStatus } from '@/lib/db/incidents';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import {
  getEvacuationCenters,
  setEvacuationCenterStatus,
} from '@/lib/db/evacuation-centers';
import { getPurokRiskProfiles } from '@/lib/db/purok-risk-profiles';
import type {
  DisasterAlert,
  DisasterAlertRule,
  DistributionEvent,
  EvacuationCenter,
  EvacuationCenterStatus,
  Household,
  Incident,
  IncidentStatus,
  PurokFloodControlStatus,
  PurokRiskProfile,
  Resident,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import {
  buildFieldResponseZoneMarkers,
  buildPurokRiskProfileMap,
  matchesPurokRiskFilters,
  PUROK_FLOOD_CONTROL_STATUS_LABELS,
} from '@/lib/purok-risk-profiles';
import { openResponderMapLocation } from '@/lib/responder-map-links';
import { useResponderMapControls } from '@/hooks/useResponderMapControls';
import { useBarangayBoundaries } from '@/hooks/useBarangayBoundaries';
import { BARANGAY_OPTIONS, type BarangayId } from '@/lib/barangays';
import {
  assignIncidentBarangay,
  buildBarangayResponseSummary,
} from '@/lib/barangay-response';
import {
  getResponderCoverageLabel,
  getResponderMappedHouseholds,
} from '@/lib/responder-households';
import {
  buildPurokPriorityGroups,
  getVulnerabilityPriorityLabels,
  matchesPurokPriorityFilters,
  type PurokPriorityGroup,
} from '@/lib/responder-priorities';
import { buildIncidentImpactAnalysis, type IncidentImpactAnalysis } from '@/lib/incident-impact';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
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

const PUROK_FLOOD_CONTROL_OPTIONS: PurokFloodControlStatus[] = ['protected', 'partial', 'none', 'unknown'];
type PurokFloodProneFilter = 'all' | 'flood_prone' | 'not_flood_prone';

function howLongAgo(date: Date): string {
  const minutesPassed = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutesPassed < 1) return 'just now';
  if (minutesPassed < 60) return `${minutesPassed}m ago`;
  const hoursPassed = Math.floor(minutesPassed / 60);
  if (hoursPassed < 24) return `${hoursPassed}h ago`;
  return `${Math.floor(hoursPassed / 24)}d ago`;
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
  const [priorityGroups, setPriorityGroups] = useState<PurokPriorityGroup[]>([]);
  const [allResidents, setAllResidents] = useState<Resident[]>([]);
  const [allFlags, setAllFlags] = useState<VulnerabilityFlags[]>([]);
  const [alerts, setAlerts] = useState<DisasterAlert[]>([]);
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [mapHouseholds, setMapHouseholds] = useState<Household[]>([]);
  const [purokRiskProfiles, setPurokRiskProfiles] = useState<PurokRiskProfile[]>([]);
  const [evacuationCenters, setEvacuationCenters] = useState<EvacuationCenter[]>([]);
  const [savingCenterId, setSavingCenterId] = useState<string | null>(null);
  const [alertRules, setAlertRules] = useState<DisasterAlertRule[]>([]);
  const [filterFloodProne, setFilterFloodProne] = useState<PurokFloodProneFilter>('all');
  const [filterFloodControlStatus, setFilterFloodControlStatus] = useState<PurokFloodControlStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [sheetIncident, setSheetIncident] = useState<Incident | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DistributionEvent | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [mapControlsOpen, setMapControlsOpen] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [evacWeatherOpen, setEvacWeatherOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedBarangayId, setSelectedBarangayId] = useState<BarangayId | ''>('');
  const [showBarangayBoundaries, setShowBarangayBoundaries] = useState(true);
  const barangayBoundaryState = useBarangayBoundaries();
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const purokRiskProfileMap = useMemo(
    () => buildPurokRiskProfileMap(purokRiskProfiles),
    [purokRiskProfiles],
  );
  const incidentImpactAnalyses = useMemo(() => new Map<string, IncidentImpactAnalysis>(
    incidents.map((incident) => [incident.id, buildIncidentImpactAnalysis({
      incident,
      households: mapHouseholds,
      residents: allResidents,
      flags: allFlags,
      alerts,
      alertRules,
      purokRiskProfiles,
    })]),
  ), [incidents, mapHouseholds, allResidents, allFlags, alerts, alertRules, purokRiskProfiles]);

  const loadData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [allIncidents, allApprovedHouseholds, allResidents, allFlags, ongoingEvents, profiles, rules, alerts, centers] = await Promise.all([
        getIncidents(),
        getHouseholds({
          registration_status: 'approved',
        }),
        db.getAll<Resident>(STORE_NAMES.residents),
        db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags),
        getDistributionEvents({ status: 'ongoing' }),
        getPurokRiskProfiles(user.role === 'admin' ? undefined : user.barangay_id),
        getDisasterAlertRules(),
        getDisasterAlerts(),
        getEvacuationCenters(user.role === 'admin' ? undefined : user.barangay_id),
      ]);
      const allHouseholds = getResponderMappedHouseholds(allApprovedHouseholds, user);

      setIncidents(allIncidents);
      setEvents(ongoingEvents);
      setMapHouseholds(allHouseholds);
      setPurokRiskProfiles(profiles);
      setEvacuationCenters(centers);
      setAlertRules(rules);
      setAlerts(alerts);
      setAllResidents(allResidents);
      setAllFlags(allFlags);

      setPriorityGroups(buildPurokPriorityGroups({
        households: allHouseholds,
        residents: allResidents,
        flags: allFlags,
        purokRiskProfiles: profiles,
        alertRules: rules,
        alerts,
        incidents: allIncidents,
      }));
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
      if (!['households', 'residents', 'vulnerability_flags', 'incidents', 'distribution_events', 'purok_risk_profiles', 'evacuation_centers', 'disaster_alert_rules', 'disaster_alerts'].includes(event.detail.table)) {
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

  async function handleSetEvacuationCenterStatus(centerId: string, status: EvacuationCenterStatus) {
    setSavingCenterId(centerId);
    try {
      await setEvacuationCenterStatus({ center_id: centerId, status });
    } catch (error) {
      console.error('Failed to update evacuation center status:', error);
    } finally {
      setSavingCenterId(null);
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
  const filteredMapHouseholds = mapHouseholds.filter((household) => matchesPurokRiskFilters(household, purokRiskProfileMap, {
    floodProne: filterFloodProne,
    floodControlStatus: filterFloodControlStatus,
  }));
  const visibleFloodZoneCount = buildFieldResponseZoneMarkers(filteredMapHouseholds, purokRiskProfiles, alertRules).length;
  const filteredPriorityGroups = priorityGroups.filter((group) => matchesPurokPriorityFilters(group, {
    floodProne: filterFloodProne,
    floodControlStatus: filterFloodControlStatus,
  }));
  const filteredPriorityHouseholdCount = filteredPriorityGroups.reduce(
    (total, group) => total + group.householdCount,
    0,
  );
  const mappedEventCount = events.filter((event) => (
    typeof event.gps_lat === 'number' && typeof event.gps_lng === 'number'
  )).length;

  const barangayBoundaries = barangayBoundaryState.boundaries;
  const hasBarangayBoundaries = barangayBoundaries.length > 0;
  const zoneFilteredHouseholds = selectedBarangayId
    ? filteredMapHouseholds.filter((household) => household.barangay_id.trim() === selectedBarangayId)
    : filteredMapHouseholds;
  const zoneFilteredIncidents = selectedBarangayId && hasBarangayBoundaries
    ? incidents.filter(
      (incident) => assignIncidentBarangay(incident, barangayBoundaries) === selectedBarangayId,
    )
    : incidents;
  const selectedBarangaySummary = selectedBarangayId && hasBarangayBoundaries
    ? buildBarangayResponseSummary({
      barangayId: selectedBarangayId,
      boundaries: barangayBoundaries,
      households: mapHouseholds,
      incidents,
      purokRiskProfiles,
    })
    : null;
  const highlightedBarangayId = selectedIncident && hasBarangayBoundaries
    ? assignIncidentBarangay(selectedIncident, barangayBoundaries)
    : null;
  const topPriorityGroup = filteredPriorityGroups[0] ?? null;
  const topPriorityHousehold = topPriorityGroup
    ? topPriorityGroup.households.find((priority) => !visited.has(priority.household.id)) ?? topPriorityGroup.households[0] ?? null
    : null;
  const topPriorityTags = topPriorityHousehold ? getVulnerabilityPriorityLabels(topPriorityHousehold.flags) : [];
  const hasSelection = Boolean(selectedHousehold || selectedIncident || selectedEvent);
  const hasPurokFilters = filterFloodProne !== 'all' || filterFloodControlStatus !== 'all';

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
              event={selectedEvent}
              onClear={() => {
                setSelectedHousehold(null);
                setSelectedIncident(null);
                setSelectedEvent(null);
                setSelectionOpen(false);
              }}
              onNavigateHousehold={(household) => openResponderMapLocation(household.gps_lat, household.gps_long, household.street_address)}
              onNavigateIncident={(incident) => openResponderMapLocation(incident.gps_lat, incident.gps_lng, incident.location)}
              onNavigateEvent={(event) => openResponderMapLocation(event.gps_lat, event.gps_lng, event.location)}
            />
            {selectedIncident ? (
              <IncidentImpactPanel
                compact
                analysis={incidentImpactAnalyses.get(selectedIncident.id) ?? null}
                visitedHouseholdIds={visited}
                onNavigateHousehold={(household) => openResponderMapLocation(household.gps_lat, household.gps_long, household.street_address)}
                onCheckIn={toggleVisited}
              />
            ) : null}
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
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span>{howLongAgo(incident.reported_at)}</span>
                        <span>{incident.location}</span>
                      </div>
                      <IncidentImpactSummary analysis={incidentImpactAnalyses.get(incident.id) ?? null} />
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
                          setSelectedEvent(null);
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
            <DrawerTitle>Purok priority queue</DrawerTitle>
            <DrawerDescription>Start with the highest-risk purok, then visit the households listed under it.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="h-32 animate-pulse rounded-[24px] bg-slate-100" />
                ))}
              </div>
            ) : filteredPriorityGroups.length === 0 ? (
              <CivicEmptyState
                icon={Users}
                title="No priority puroks"
                description="Flood risk, vulnerability, and live alerts did not surface a queue right now."
              />
            ) : (
              <>
              {topPriorityGroup && topPriorityHousehold ? (() => {
                const levelTone = topPriorityGroup.level === 'critical' ? 'rose' : topPriorityGroup.level === 'high' ? 'amber' : topPriorityGroup.level === 'medium' ? 'navy' : 'slate';
                return (
                  <div className="rounded-[24px] border border-cyan-200 bg-cyan-50/70 px-4 py-4 shadow-sm shadow-cyan-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">Recommended first response</p>
                        <h3 className="mt-1 text-base font-black text-slate-950">{topPriorityGroup.purokSitio}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Start with <span className="font-bold text-slate-950">{topPriorityHousehold.household.head_name}</span>
                        </p>
                      </div>
                      <CivicBadge label={topPriorityGroup.level.toUpperCase()} tone={levelTone} className="text-[10px]" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <CivicBadge label={`Score ${topPriorityGroup.score}`} tone="amber" className="text-[10px]" />
                      <CivicBadge label={`${topPriorityGroup.vulnerableResidentCount} vulnerable`} tone="rose" className="text-[10px]" />
                      <CivicBadge label={`${topPriorityGroup.householdCount} households`} tone="slate" className="text-[10px]" />
                      {topPriorityGroup.reasons.slice(0, 3).map((reason) => (
                        <CivicBadge key={reason} label={reason} tone="navy" className="text-[10px]" />
                      ))}
                      {topPriorityTags.slice(0, 3).map((tag) => (
                        <CivicBadge key={tag} label={tag} tone="rose" className="text-[10px]" />
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setSelectedHousehold(topPriorityHousehold.household);
                          setSelectedIncident(null);
                          setSelectedEvent(null);
                          setPriorityOpen(false);
                          setSelectionOpen(true);
                        }}
                        className="h-9 rounded-full px-3 text-xs font-semibold"
                      >
                        Inspect first
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openResponderMapLocation(
                          topPriorityHousehold.household.gps_lat,
                          topPriorityHousehold.household.gps_long,
                          `${topPriorityHousehold.household.street_address}, ${topPriorityHousehold.household.purok_sitio}`,
                        )}
                        className="h-9 rounded-full border-cyan-200 bg-white px-3 text-xs font-semibold text-cyan-900"
                      >
                        Navigate
                      </Button>
                    </div>
                  </div>
                );
              })() : null}

              {filteredPriorityGroups.map((group, index) => {
                const levelTone = group.level === 'critical' ? 'rose' : group.level === 'high' ? 'amber' : group.level === 'medium' ? 'navy' : 'slate';
                const firstHousehold = group.households.find((priority) => !visited.has(priority.household.id)) ?? group.households[0];
                return (
                  <MobileListCard
                    key={group.id}
                    title={`${index + 1}. ${group.purokSitio}`}
                    subtitle={group.barangayLabel}
                    leading={<span className="text-sm font-bold">{index + 1}</span>}
                    status={(
                      <>
                        <CivicBadge label={group.level.toUpperCase()} tone={levelTone} className="text-[10px]" />
                        <CivicBadge label={group.floodProne ? 'Flood-prone purok' : 'Not flood-prone'} tone={group.floodProne ? 'rose' : 'emerald'} className="text-[10px]" />
                        <CivicBadge label={group.floodControlLabel} tone="slate" className="text-[10px]" />
                        <CivicBadge label={`Score ${group.score}`} tone="amber" className="text-[10px]" />
                        {group.reasons.slice(0, 3).map((reason) => (
                          <CivicBadge key={reason} label={reason} tone="navy" className="text-[10px]" />
                        ))}
                      </>
                    )}
                    meta={(
                      <div className="space-y-2 text-xs text-slate-500">
                        <div className="flex items-center justify-between gap-3">
                          <span>{group.householdCount} households</span>
                          <span>{group.vulnerableResidentCount} vulnerable residents</span>
                        </div>
                        {firstHousehold ? (
                          <p className="font-semibold text-cyan-900">Unahon: {firstHousehold.household.head_name}</p>
                        ) : null}
                        {group.defaultEvacuationSite ? <p>Evacuation: {group.defaultEvacuationSite}</p> : null}
                        <div className="space-y-2">
                          {group.households.map((priority, householdIndex) => {
                            const labels = getVulnerabilityPriorityLabels(priority.flags);
                            const alreadyVisited = visited.has(priority.household.id);
                            const canNavigate = priority.household.gps_lat !== undefined && priority.household.gps_long !== undefined;
                            return (
                              <div key={priority.household.id} className={`rounded-2xl border px-3 py-3 ${alreadyVisited ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-slate-950">{householdIndex + 1}. {priority.household.head_name}</p>
                                    <p className="mt-1 truncate text-xs text-slate-500">{priority.household.street_address}</p>
                                  </div>
                                  {alreadyVisited ? <CivicBadge label="Visited" tone="emerald" className="text-[10px]" /> : null}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {labels.map((label) => (
                                    <CivicBadge key={label} label={label} tone="rose" className="text-[10px]" />
                                  ))}
                                  <CivicBadge label={`Score ${priority.score}`} tone="amber" className="text-[10px]" />
                                  <CivicBadge label={canNavigate ? 'Mapped' : 'No map pin'} tone={canNavigate ? 'emerald' : 'slate'} className="text-[10px]" />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedHousehold(priority.household);
                                      setSelectedIncident(null);
                                      setSelectedEvent(null);
                                      setPriorityOpen(false);
                                      setSelectionOpen(true);
                                    }}
                                    className="h-9 rounded-full border-slate-200 px-3 text-xs font-semibold text-slate-700"
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
                                    className="h-9 rounded-full border-slate-200 px-3 text-xs font-semibold text-slate-700"
                                  >
                                    Navigate
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={alreadyVisited ? 'default' : 'outline'}
                                    onClick={() => toggleVisited(priority.household.id)}
                                    className="h-9 rounded-full px-3 text-xs font-semibold"
                                  >
                                    {alreadyVisited ? 'Visited' : 'Check-in'}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  />
                );
              })}
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Evacuation & Logistics Drawer ── */}
      <Drawer open={evacWeatherOpen} onOpenChange={setEvacWeatherOpen}>
        <DrawerContent className="max-h-[88vh] rounded-t-[30px] border-slate-200 bg-white">
          <DrawerHeader className="pb-0 text-left">
            <DrawerTitle>Evacuation & Field Logistics</DrawerTitle>
            <DrawerDescription>Active shelters, weather radar, and ongoing distribution drives.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
            <WeatherWidget mode="compact" />

            <EvacuationCenterPanel
              centers={evacuationCenters}
              savingCenterId={savingCenterId}
              onSetStatus={(centerId, status) => {
                void handleSetEvacuationCenterStatus(centerId, status);
              }}
            />

            {events.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Relief Distribution Drives</h4>
                  <CivicBadge label={`${events.length} active`} tone="emerald" className="text-[10px]" />
                </div>
                <div className="space-y-2">
                  {events.map((event) => (
                    <div key={event.id} className="rounded-xl border border-slate-200/80 bg-white p-3">
                      <p className="text-sm font-bold text-slate-950">{event.event_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{event.location}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openResponderMapLocation(event.gps_lat, event.gps_lng, event.location)}
                        className="mt-2.5 h-8 rounded-full border-slate-200 px-3 text-xs font-semibold text-slate-700"
                      >
                        Navigate
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Purok Targeting Filters Drawer ── */}
      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DrawerContent className="max-h-[80vh] rounded-t-[30px] border-slate-200 bg-white">
          <DrawerHeader className="pb-0 text-left">
            <DrawerTitle>Purok Flood Targeting Filters</DrawerTitle>
            <DrawerDescription>Trim the map markers and queue by flood profile data.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3">
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Flood Exposure</span>
                <select
                  value={filterFloodProne}
                  onChange={(e) => setFilterFloodProne(e.target.value as PurokFloodProneFilter)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="all">All puroks</option>
                  <option value="flood_prone">Flood-prone only</option>
                  <option value="not_flood_prone">Not flood-prone</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Flood Control Status</span>
                <select
                  value={filterFloodControlStatus}
                  onChange={(e) => setFilterFloodControlStatus(e.target.value as PurokFloodControlStatus | 'all')}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  <option value="all">All flood control statuses</option>
                  {PUROK_FLOOD_CONTROL_OPTIONS.map((status) => (
                    <option key={status} value={status}>{PUROK_FLOOD_CONTROL_STATUS_LABELS[status]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFilterFloodProne('all');
                  setFilterFloodControlStatus('all');
                  setFiltersOpen(false);
                }}
                className="flex-1 rounded-xl"
              >
                Reset Filters
              </Button>
              <Button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="flex-1 rounded-xl"
              >
                Apply
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <CivicPage className="space-y-3 px-3.5 py-3 pb-28">
        {/* ── Situational Header Ribbon ── */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-900">Mabini MDRRMO</p>
              <p className="text-[10px] text-slate-500">{user.name} · {getResponderCoverageLabel(user)}</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { void loadData(); }}
            disabled={loading}
            className="h-8 rounded-xl border-slate-200 px-2.5 text-xs font-semibold"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* ── Situational Quick Vitals Strip ── */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            className="rounded-2xl border border-rose-200 bg-rose-50/60 p-2.5 text-center transition active:scale-95"
          >
            <p className="text-base font-black text-rose-800">{loading ? '--' : activeIncidents.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Active Incidents</p>
          </button>

          <button
            type="button"
            onClick={() => setPriorityOpen(true)}
            className="rounded-2xl border border-amber-200 bg-amber-50/60 p-2.5 text-center transition active:scale-95"
          >
            <p className="text-base font-black text-amber-800">{loading ? '--' : filteredPriorityGroups.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Priorities</p>
          </button>

          <button
            type="button"
            onClick={() => setEvacWeatherOpen(true)}
            className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-2.5 text-center transition active:scale-95"
          >
            <p className="text-base font-black text-cyan-800">{loading ? '--' : evacuationCenters.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Evac Centers</p>
          </button>
        </div>

        {/* ── Recommended First Response Banner ── */}
        {topPriorityGroup && topPriorityHousehold ? (() => {
          const levelTone = topPriorityGroup.level === 'critical' ? 'rose' : topPriorityGroup.level === 'high' ? 'amber' : topPriorityGroup.level === 'medium' ? 'navy' : 'slate';
          return (
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-3.5 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Recommended First Response</p>
                  <h3 className="mt-0.5 text-sm font-black text-slate-950">{topPriorityGroup.purokSitio}</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Unahon si <span className="font-bold text-slate-950">{topPriorityHousehold.household.head_name}</span>
                  </p>
                </div>
                <CivicBadge label={topPriorityGroup.level.toUpperCase()} tone={levelTone} className="text-[10px]" />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setSelectedHousehold(topPriorityHousehold.household);
                    setSelectedIncident(null);
                    setSelectedEvent(null);
                    setSelectionOpen(true);
                  }}
                  className="h-8 rounded-full px-3 text-xs font-semibold"
                >
                  Inspect
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openResponderMapLocation(
                    topPriorityHousehold.household.gps_lat,
                    topPriorityHousehold.household.gps_long,
                    `${topPriorityHousehold.household.street_address}, ${topPriorityHousehold.household.purok_sitio}`,
                  )}
                  className="h-8 rounded-full border-cyan-200 bg-white px-3 text-xs font-semibold text-cyan-900"
                >
                  Navigate
                </Button>
              </div>
            </div>
          );
        })() : null}

        {/* ── Tactical Map Section ── */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Field Map</p>
              <CivicBadge label={`${zoneFilteredHouseholds.length} pins`} tone="emerald" className="text-[10px]" />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFiltersOpen(true)}
                className="h-7 rounded-lg border-slate-200 px-2 text-[11px] font-semibold"
              >
                Filters {hasPurokFilters ? '•' : ''}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMapControlsOpen(true)}
                className="h-7 rounded-lg border-slate-200 px-2 text-[11px] font-semibold"
              >
                <Layers3 className="h-3 w-3 mr-1" />
                Layers
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedBarangayId}
              onChange={(event) => setSelectedBarangayId(event.target.value as BarangayId | '')}
              className="h-9 min-w-[130px] flex-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none"
              aria-label="Filter by barangay"
            >
              <option value="">All Barangays</option>
              {BARANGAY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <CivicChipButton
              active={showBarangayBoundaries}
              onClick={() => setShowBarangayBoundaries((v) => !v)}
              className="h-9 text-xs"
            >
              Boundaries
            </CivicChipButton>
          </div>

          <ResponderLeafletMap
            households={zoneFilteredHouseholds}
            incidents={zoneFilteredIncidents}
            events={events}
            purokRiskProfiles={purokRiskProfiles}
            alertRules={alertRules}
            evacuationCenters={evacuationCenters}
            barangayBoundaries={barangayBoundaries}
            selectedBarangayId={selectedBarangayId || null}
            highlightBarangayId={highlightedBarangayId}
            onSelectBarangay={(barangayId) => {
              setSelectedBarangayId(barangayId ?? '');
              if (barangayId) {
                setSelectedHousehold(null);
                setSelectedIncident(null);
                setSelectedEvent(null);
              }
            }}
            boundaryMode={showBarangayBoundaries}
            showBoundaries={showBarangayBoundaries}
            selectedHousehold={selectedHousehold}
            onSelectHousehold={(household) => {
              setSelectedHousehold(household);
              if (household) {
                setSelectedIncident(null);
                setSelectedEvent(null);
                setSelectionOpen(true);
              }
            }}
            selectedIncident={selectedIncident}
            onSelectIncident={(incident) => {
              setSelectedIncident(incident);
              if (incident) {
                setSelectedHousehold(null);
                setSelectedEvent(null);
                setSelectionOpen(true);
              }
            }}
            selectedEvent={selectedEvent}
            onSelectEvent={(event) => {
              setSelectedEvent(event);
              if (event) {
                setSelectedHousehold(null);
                setSelectedIncident(null);
                setSelectionOpen(true);
              }
            }}
            activeBaseLayerId={mapControls.activeBaseLayerId}
            activeLayerIds={mapControls.activeLayerIds}
            showWeather={mapControls.showWeather}
            overlayOpacity={mapControls.overlayOpacity}
            refreshVersion={mapControls.mapRefreshVersion}
            containerClassName="h-[460px] rounded-xl overflow-hidden"
            compactWeather
          />

          {hasSelection && (
            <Button
              type="button"
              onClick={() => setSelectionOpen(true)}
              className="w-full h-10 rounded-xl text-xs font-semibold"
            >
              <Navigation className="h-3.5 w-3.5 mr-1.5" />
              View Selected Item Details
            </Button>
          )}

          {selectedBarangaySummary ? (
            <BarangayResponsePanel
              compact
              summary={selectedBarangaySummary}
              onClose={() => setSelectedBarangayId('')}
            />
          ) : null}
        </div>
      </CivicPage>

      {/* ── Fixed Bottom Tactical Navigation Dock ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-md px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-lg">
        <div className="grid grid-cols-4 gap-1 max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            className="flex flex-col items-center justify-center rounded-xl py-1.5 px-1 text-slate-700 hover:bg-slate-100 transition active:scale-95"
          >
            <Zap className="h-4 w-4 text-rose-600" />
            <span className="mt-0.5 text-[10px] font-bold">Incidents</span>
            <span className="text-[9px] font-semibold text-rose-600">{loading ? '…' : activeIncidents.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setPriorityOpen(true)}
            className="flex flex-col items-center justify-center rounded-xl py-1.5 px-1 text-slate-700 hover:bg-slate-100 transition active:scale-95"
          >
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <span className="mt-0.5 text-[10px] font-bold">Priorities</span>
            <span className="text-[9px] font-semibold text-amber-600">{loading ? '…' : filteredPriorityGroups.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setEvacWeatherOpen(true)}
            className="flex flex-col items-center justify-center rounded-xl py-1.5 px-1 text-slate-700 hover:bg-slate-100 transition active:scale-95"
          >
            <Package className="h-4 w-4 text-cyan-700" />
            <span className="mt-0.5 text-[10px] font-bold">Logistics</span>
            <span className="text-[9px] font-semibold text-cyan-700">{loading ? '…' : evacuationCenters.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setMapControlsOpen(true)}
            className="flex flex-col items-center justify-center rounded-xl py-1.5 px-1 text-slate-700 hover:bg-slate-100 transition active:scale-95"
          >
            <Layers3 className="h-4 w-4 text-slate-600" />
            <span className="mt-0.5 text-[10px] font-bold">Layers</span>
            <span className="text-[9px] font-semibold text-slate-400">Map</span>
          </button>
        </div>
      </div>
    </>
  );
}

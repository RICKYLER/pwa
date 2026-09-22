'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { createIncident, getIncidents, updateIncidentStatus } from '@/lib/db/incidents';
import { getDistributionEvents } from '@/lib/db/distribution';
import { getDisasterAlerts, getDisasterAlertRules } from '@/lib/db/disaster-alerts';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { getHouseholds } from '@/lib/db/households';
import {
  deleteEvacuationCenter,
  getEvacuationCenters,
  saveEvacuationCenters,
  setEvacuationCenterStatus,
} from '@/lib/db/evacuation-centers';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { bootstrapSupabaseTables } from '@/lib/supabase/bootstrap';
import { getPurokRiskProfiles, savePurokRiskProfiles } from '@/lib/db/purok-risk-profiles';
import { getUserNotifications } from '@/lib/db/user-notifications';
import { runServerMutation } from '@/lib/mutations';
import type {
  DisasterAlert,
  DisasterAlertNotificationPayload,
  DisasterAlertRule,
  DistributionEvent,
  EvacuationCenter,
  EvacuationCenterStatus,
  Household,
  Incident,
  IncidentStatus,
  IncidentType,
  PurokFloodControlStatus,
  PurokRiskProfile,
  Resident,
  UserNotification,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { AlertCircle, BellRing, CheckCircle2, CloudRain, Edit2, Layers3, MapPin, Package, Radio, RefreshCw, ShieldAlert, Siren, Users, Wind, X, Zap } from 'lucide-react';
import WeatherWidget from '@/components/WeatherWidget';
import ResponderLeafletMap from '@/components/ResponderLeafletMap';
import ResponderMapControlPanel from '@/components/ResponderMapControlPanel';
import ResponderSelectionSummary from '@/components/ResponderSelectionSummary';
import IncidentImpactPanel, { IncidentImpactSummary } from '@/components/IncidentImpactPanel';
import PriorityAnalytics from '@/components/PriorityAnalytics';
import PurokCategoryRoster from '@/components/PurokCategoryRoster';
import TriggerAnalysis, { isTriggerAnalyzableIncident, TriggerAnalysisDialog, useIncidentScopedGroups } from '@/components/TriggerAnalysis';
import BarangayResponsePanel from '@/components/BarangayResponsePanel';
import EvacuationCenterPanel, { type EvacuationCenterDraft } from '@/components/EvacuationCenterPanel';
import { CivicBadge, CivicChipButton, CivicPanel, CivicSearchInput, CivicSectionHeading } from '@/components/ui/civic-primitives';
import {
  buildFieldResponseZoneMarkers,
  buildPurokRiskProfileMap,
  getPurokRiskProfileForHousehold,
  matchesPurokRiskFilters,
  PUROK_FLOOD_CONTROL_STATUS_LABELS,
  type FieldResponseZoneMarker,
} from '@/lib/purok-risk-profiles';
import {
  buildAffectedAreaLabel,
  buildDisasterAlertNotificationPayloadFromAlert,
  HAZARD_LABELS,
  parseDisasterAlertNotification,
} from '@/lib/disaster-alerts';
import { BARANGAY_OPTIONS, getBarangayLabel, type BarangayId } from '@/lib/barangays';
import { useBarangayBoundaries } from '@/hooks/useBarangayBoundaries';
import {
  assignIncidentBarangay,
  buildBarangayResponseSummary,
} from '@/lib/barangay-response';
import { buildAlertDerivedIncidentDraft } from '@/lib/incident-alerts';
import { openResponderMapLocation } from '@/lib/responder-map-links';
import { useResponderMapControls } from '@/hooks/useResponderMapControls';
import {
  getResponderCoverageLabel,
  getResponderMappedHouseholds,
} from '@/lib/responder-households';
import { fetchJsonWithCache } from '@/lib/client-fetch-cache';
import type { FieldResponseWeatherPayload } from '@/lib/weather';
import {
  buildPurokPriorityGroups,
  getVulnerabilityPriorityLabels,
  matchesPurokPriorityFilters,
  type PurokPriorityGroup,
} from '@/lib/responder-priorities';
import { buildIncidentImpactAnalysis, type IncidentImpactAnalysis } from '@/lib/incident-impact';
import {
  DISTRIBUTION_CATEGORY_KEYS,
  DISTRIBUTION_CATEGORY_LABELS,
  DISTRIBUTION_CATEGORY_TONES,
  type DistributionCategory,
} from '@/lib/distribution-audience';

type PriorityCategoryFilter = 'all' | DistributionCategory;

const PRIORITY_CATEGORY_FILTERS: PriorityCategoryFilter[] = ['all', ...DISTRIBUTION_CATEGORY_KEYS];

function formatCategoryCountLabel(category: DistributionCategory, count: number) {
  const label = DISTRIBUTION_CATEGORY_LABELS[category];
  const plural = count !== 1 && category !== 'pwd' && category !== 'low_income' ? 's' : '';
  return `${count} ${label}${plural}`;
}

function PurokCategoryBadges({ group }: { group: PurokPriorityGroup }) {
  const present = DISTRIBUTION_CATEGORY_KEYS.filter((key) => group.categoryCounts[key] > 0);
  if (present.length === 0) return null;

  return (
    <>
      {present.map((key) => (
        <CivicBadge
          key={key}
          label={formatCategoryCountLabel(key, group.categoryCounts[key])}
          tone={DISTRIBUTION_CATEGORY_TONES[key]}
          className="text-[10px]"
        />
      ))}
    </>
  );
}

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

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

const PUROK_FLOOD_CONTROL_OPTIONS: PurokFloodControlStatus[] = ['protected', 'partial', 'none', 'unknown'];
type PurokFloodProneFilter = 'all' | 'flood_prone' | 'not_flood_prone';

interface AlertIncidentSuggestion {
  id: string;
  payload: DisasterAlertNotificationPayload;
  notification: UserNotification;
  alert?: DisasterAlert;
  linkedIncident?: Incident;
  locationLabel: string;
  gps_lat?: number;
  gps_lng?: number;
}

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
  const [priorityGroups, setPriorityGroups] = useState<PurokPriorityGroup[]>([]);
  const [allResidents, setAllResidents] = useState<Resident[]>([]);
  const [allFlags, setAllFlags] = useState<VulnerabilityFlags[]>([]);
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [mapHouseholds, setMapHouseholds] = useState<Household[]>([]);
  const [purokRiskProfiles, setPurokRiskProfiles] = useState<PurokRiskProfile[]>([]);
  const [evacuationCenters, setEvacuationCenters] = useState<EvacuationCenter[]>([]);
  const [savingCenterId, setSavingCenterId] = useState<string | null>(null);
  const [alertRules, setAlertRules] = useState<DisasterAlertRule[]>([]);
  const [alerts, setAlerts] = useState<DisasterAlert[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [liveWeather, setLiveWeather] = useState<FieldResponseWeatherPayload | null>(null);
  const [filterFloodProne, setFilterFloodProne] = useState<PurokFloodProneFilter>('all');
  const [filterFloodControlStatus, setFilterFloodControlStatus] = useState<PurokFloodControlStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<PriorityCategoryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DistributionEvent | null>(null);
  const [selectedZone, setSelectedZone] = useState<FieldResponseZoneMarker | null>(null);
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [selectedBarangayId, setSelectedBarangayId] = useState<BarangayId | ''>('');
  const [riskLevelFilter, setRiskLevelFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<'all' | IncidentType>('all');
  const [showBarangayBoundaries, setShowBarangayBoundaries] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const barangayBoundaryState = useBarangayBoundaries();
  const [tacticalTab, setTacticalTab] = useState<'incidents' | 'priorities' | 'logistics' | 'telemetry'>('incidents');
  const [incidentSubTab, setIncidentSubTab] = useState<'active' | 'suggestions'>('active');
  const [layersMenuOpen, setLayersMenuOpen] = useState(false);
  const [activeTab, _setActiveTab] = useState<'incidents' | 'suggestions' | 'priorities' | 'events' | 'zones'>('incidents');
  const setActiveTab = (tab: 'incidents' | 'suggestions' | 'priorities' | 'events' | 'zones') => {
    _setActiveTab(tab);
    if (tab === 'incidents') {
      setTacticalTab('incidents');
      setIncidentSubTab('active');
    } else if (tab === 'suggestions') {
      setTacticalTab('incidents');
      setIncidentSubTab('suggestions');
    } else if (tab === 'priorities') {
      setTacticalTab('priorities');
    } else if (tab === 'events') {
      setTacticalTab('logistics');
    } else if (tab === 'zones') {
      setTacticalTab('telemetry');
    }
  };
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [creatingFromAlertId, setCreatingFromAlertId] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [pingZones, setPingZones] = useState<Set<string>>(new Set());
  const [pingModal, setPingModal] = useState<{ purok: PurokRiskProfile; householdCount: number } | null>(null);
  const [updatingPurokStatus, setUpdatingPurokStatus] = useState<string | null>(null);
  const [isSendingPing, setIsSendingPing] = useState(false);
  const [suggestionModal, setSuggestionModal] = useState<AlertIncidentSuggestion | null>(null);
  const [editingPurokId, setEditingPurokId] = useState<string | null>(null);
  const [purokEditForm, setPurokEditForm] = useState<{
    default_evacuation_site: string;
    warning_notes: string;
    flood_control_notes: string;
  } | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertEvaluationRef = useRef(false);
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

  // Derive the primary trigger location from the first enabled rule for this user's barangay
  const activeRule = useMemo(() => {
    return alertRules
      .filter((rule) => rule.enabled && (!user || rule.barangay_id === user.barangay_id))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
  }, [alertRules, user]);
  const activeRuleId = activeRule?.id ?? null;
  const activeRuleLat = activeRule?.trigger_lat ?? null;
  const activeRuleLng = activeRule?.trigger_lng ?? null;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      if (!alertEvaluationRef.current) {
        alertEvaluationRef.current = true;
        try {
          await runServerMutation({
            action: 'run_disaster_alert_evaluation',
          });
          await bootstrapSupabaseTables(
            ['disaster_alerts', 'user_notifications', 'disaster_alert_rules'],
            { force: true },
          );
        } catch (error) {
          console.warn('Automatic disaster alert evaluation did not complete on responder load:', error);
        }
      }

      const [allIncidents, allHouseholds, residents, flags, ongoingEvents, profiles, rules, latestAlerts, latestNotifications, centers] = await Promise.all([
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
        getUserNotifications(),
        getEvacuationCenters(user.role === 'admin' ? undefined : user.barangay_id),
      ]);
      const households = getResponderMappedHouseholds(allHouseholds, user);

      setIncidents(allIncidents);
      setEvents(ongoingEvents);
      setMapHouseholds(households);
      setPurokRiskProfiles(profiles);
      setEvacuationCenters(centers);
      setAlertRules(rules);
      setAlerts(latestAlerts);
      setNotifications(latestNotifications);
      setAllResidents(residents);
      setAllFlags(flags);

      setPriorityGroups(buildPurokPriorityGroups({
        households,
        residents,
        flags,
        purokRiskProfiles: profiles,
        alertRules: rules,
        alerts: latestAlerts,
        incidents: allIncidents,
      }));
    } catch (error) {
      console.error(error);
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
      void load();
    }, delayMs);
  }, [load]);

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
      if (![
        'households',
        'residents',
        'vulnerability_flags',
        'incidents',
        'distribution_events',
        'purok_risk_profiles',
        'evacuation_centers',
        'disaster_alert_rules',
        'disaster_alerts',
        'user_notifications',
      ].includes(event.detail.table)) {
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

  // ── Supabase Realtime: sync purok_risk_profiles across tabs/devices ──────
  useEffect(() => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('responder-purok-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purok_risk_profiles' },
        async () => {
          try {
            await bootstrapSupabaseTables(['purok_risk_profiles'], { force: true });
            window.dispatchEvent(new CustomEvent('mswdo-data-changed', {
              detail: { source: 'supabase', table: 'purok_risk_profiles', mode: 'change' },
            }));
          } catch (err) {
            console.warn('Realtime purok_risk_profiles refresh failed:', err);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'evacuation_centers' },
        async () => {
          try {
            await bootstrapSupabaseTables(['evacuation_centers'], { force: true });
            window.dispatchEvent(new CustomEvent('mswdo-data-changed', {
              detail: { source: 'supabase', table: 'evacuation_centers', mode: 'change' },
            }));
          } catch (err) {
            console.warn('Realtime evacuation_centers refresh failed:', err);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const handleSetEvacuationCenterStatus = useCallback(async (centerId: string, status: EvacuationCenterStatus) => {
    setSavingCenterId(centerId);
    try {
      await setEvacuationCenterStatus({ center_id: centerId, status });
    } catch (error) {
      console.error('Failed to update evacuation center status:', error);
    } finally {
      setSavingCenterId(null);
    }
  }, []);

  const handleDeleteEvacuationCenter = useCallback(async (centerId: string) => {
    setSavingCenterId(centerId);
    try {
      await deleteEvacuationCenter({ center_id: centerId });
    } catch (error) {
      console.error('Failed to delete evacuation center:', error);
    } finally {
      setSavingCenterId(null);
    }
  }, []);

  const handleSaveEvacuationCenters = useCallback(async (drafts: EvacuationCenterDraft[]) => {
    try {
      await saveEvacuationCenters({
        centers: drafts.map((draft) => ({
          barangay_id: draft.barangay_id,
          name: draft.name,
          gps_lat: draft.gps_lat,
          gps_lng: draft.gps_lng,
          capacity: draft.capacity,
          notes: draft.notes,
        })),
      });
    } catch (error) {
      console.error('Failed to save evacuation centers:', error);
    }
  }, []);


  // When the activeRule changes, fetch live weather for the same trigger point
  useEffect(() => {
    if (activeRuleLat === null || activeRuleLng === null) return;

    let cancelled = false;

    async function fetchLiveWeather() {
      try {
        const params = new URLSearchParams({
          lat: String(activeRuleLat),
          lng: String(activeRuleLng),
        });
        const payload = await fetchJsonWithCache<FieldResponseWeatherPayload>(
          `/api/weather?${params.toString()}`,
          { ttlMs: 15 * 60 * 1000 },
        );
        if (!cancelled) setLiveWeather(payload);
      } catch {
        // WeatherWidget will handle its own error state
      }
    }

    void fetchLiveWeather();
    return () => { cancelled = true; };
  }, [activeRuleId, activeRuleLat, activeRuleLng]);

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

  const handlePurokStatusUpdate = async (profile: PurokRiskProfile, newStatus: PurokFloodControlStatus) => {
    try {
      setUpdatingPurokStatus(profile.purok_sitio);
      await savePurokRiskProfiles({
        barangay_id: profile.barangay_id,
        profiles: [{ ...profile, flood_control_status: newStatus }],
      });
      setPurokRiskProfiles((current) =>
        current.map((p) => (p.purok_sitio === profile.purok_sitio ? { ...p, flood_control_status: newStatus } : p))
      );
    } catch (err) {
      console.error('Failed to update purok flood control status:', err);
    } finally {
      setUpdatingPurokStatus(null);
    }
  };

  const handlePurokFloodProneToggle = async (profile: PurokRiskProfile) => {
    try {
      setUpdatingPurokStatus(profile.purok_sitio + '-toggle');
      const newStatus = !profile.flood_prone;
      await savePurokRiskProfiles({
        barangay_id: profile.barangay_id,
        profiles: [{ ...profile, flood_prone: newStatus }],
      });
      setPurokRiskProfiles((current) =>
        current.map((p) => (p.purok_sitio === profile.purok_sitio ? { ...p, flood_prone: newStatus } : p))
      );
    } catch (err) {
      console.error('Failed to toggle purok flood prone status:', err);
    } finally {
      setUpdatingPurokStatus(null);
    }
  };

  const startEditingPurok = (profile: PurokRiskProfile) => {
    setEditingPurokId(profile.purok_sitio);
    setPurokEditForm({
      default_evacuation_site: profile.default_evacuation_site ?? '',
      warning_notes: profile.warning_notes ?? '',
      flood_control_notes: profile.flood_control_notes ?? '',
    });
  };

  const handleSavePurokEdits = async (profile: PurokRiskProfile) => {
    if (!purokEditForm) {
      return;
    }

    try {
      setUpdatingPurokStatus(profile.purok_sitio + '-edit');
      const updatedProfile: PurokRiskProfile = {
        ...profile,
        default_evacuation_site: purokEditForm.default_evacuation_site.trim() || undefined,
        warning_notes: purokEditForm.warning_notes.trim() || undefined,
        flood_control_notes: purokEditForm.flood_control_notes.trim() || undefined,
      };

      await savePurokRiskProfiles({
        barangay_id: profile.barangay_id,
        profiles: [updatedProfile],
      });

      setPurokRiskProfiles((current) =>
        current.map((entry) => (
          entry.purok_sitio === profile.purok_sitio ? updatedProfile : entry
        )),
      );
      setEditingPurokId(null);
      setPurokEditForm(null);
    } catch (err) {
      console.error('Failed to save purok notes:', err);
    } finally {
      setUpdatingPurokStatus(null);
    }
  };

  const alertRuleMap = useMemo(
    () => new Map(alertRules.map((rule) => [rule.id, rule])),
    [alertRules],
  );
  const alertMap = useMemo(
    () => new Map(alerts.map((alert) => [alert.id, alert])),
    [alerts],
  );

  const alertSuggestions = useMemo<AlertIncidentSuggestion[]>(() => {
    const latestResponderNotifications = new Map<string, UserNotification>();

    notifications.forEach((notification) => {
      const payload = parseDisasterAlertNotification(notification);
      if (!payload?.alert_id) {
        return;
      }

      const existing = latestResponderNotifications.get(payload.alert_id);
      if (!existing || new Date(notification.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        latestResponderNotifications.set(payload.alert_id, notification);
      }
    });

    const suggestions: AlertIncidentSuggestion[] = [];
    const seenAlertIds = new Set<string>();

    alerts
      .filter((alert) => alert.notify_responders)
      .forEach((alert) => {
        const notification = latestResponderNotifications.get(alert.id);
        const profile = alert.purok_sitio
          ? getPurokRiskProfileForHousehold({
            barangay_id: alert.barangay_id,
            purok_sitio: alert.purok_sitio,
          }, purokRiskProfileMap)
          : undefined;
        const payload = notification
          ? parseDisasterAlertNotification(notification)
          : buildDisasterAlertNotificationPayloadFromAlert({
            alert,
            purokRiskProfile: profile,
          });
        if (!payload) {
          return;
        }

        const linkedIncident = incidents.find((incident) => (
          incident.source_alert_id === payload.alert_id
          && incident.status !== 'resolved'
        ));
        const areaHousehold = mapHouseholds.find((household) => (
          household.purok_sitio === payload.purok_sitio
          && household.barangay_id === payload.barangay_id
          && typeof household.gps_lat === 'number'
          && typeof household.gps_long === 'number'
        ));
        const triggerRule = alertRuleMap.get(payload.rule_id);
        const syntheticNotification: UserNotification = {
          id: `derived-alert-notification-${alert.id}`,
          user_id: user?.id ?? 'system',
          alert_id: alert.id,
          type: 'disaster_alert',
          title: alert.title,
          body: alert.message,
          payload,
          createdAt: alert.issued_at,
          updatedAt: alert.updatedAt,
        };

        suggestions.push({
          id: payload.alert_id,
          payload,
          notification: notification ?? syntheticNotification,
          alert,
          linkedIncident,
          locationLabel: buildAffectedAreaLabel(payload) || payload.title,
          gps_lat: areaHousehold?.gps_lat ?? triggerRule?.trigger_lat,
          gps_lng: areaHousehold?.gps_long ?? triggerRule?.trigger_lng,
        });
        seenAlertIds.add(payload.alert_id);
      });

    Array.from(latestResponderNotifications.values()).forEach((notification) => {
      const payload = parseDisasterAlertNotification(notification);
      if (!payload) {
        return;
      }
      if (seenAlertIds.has(payload.alert_id)) {
        return;
      }

      const linkedIncident = incidents.find((incident) => (
        incident.source_alert_id === payload.alert_id
        && incident.status !== 'resolved'
      ));
      const areaHousehold = mapHouseholds.find((household) => (
        household.purok_sitio === payload.purok_sitio
        && household.barangay_id === payload.barangay_id
        && typeof household.gps_lat === 'number'
        && typeof household.gps_long === 'number'
      ));
      const triggerRule = alertRuleMap.get(payload.rule_id);

      suggestions.push({
        id: payload.alert_id,
        payload,
        notification,
        alert: alertMap.get(payload.alert_id),
        linkedIncident,
        locationLabel: buildAffectedAreaLabel(payload) || payload.title,
        gps_lat: areaHousehold?.gps_lat ?? triggerRule?.trigger_lat,
        gps_lng: areaHousehold?.gps_long ?? triggerRule?.trigger_lng,
      });
    });

    return suggestions.sort((left, right) => {
        if (Boolean(left.linkedIncident) !== Boolean(right.linkedIncident)) {
          return left.linkedIncident ? 1 : -1;
        }

        return new Date(right.payload.issued_at).getTime() - new Date(left.payload.issued_at).getTime();
      });
  }, [alertMap, alertRuleMap, alerts, incidents, mapHouseholds, notifications, purokRiskProfileMap, user?.id]);

  async function handleCreateIncidentFromAlert(suggestion: AlertIncidentSuggestion) {
    if (!user || creatingFromAlertId) {
      return;
    }

    setCreatingFromAlertId(suggestion.id);
    try {
      const created = await createIncident(buildAlertDerivedIncidentDraft({
        payload: suggestion.payload,
        reportedBy: user.id,
        gps_lat: suggestion.gps_lat,
        gps_lng: suggestion.gps_lng,
      }));

      setIncidents((current) => [created, ...current.filter((incident) => incident.id !== created.id)]);
      setSelectedIncident(created);
      setSelectedHousehold(null);
      setSelectedEvent(null);
      setSelectedZone(null);
      setActiveTab('incidents');
      setSuggestionModal(null);
      await load();
    } catch (error) {
      console.error('Failed to create incident from alert:', error);
    } finally {
      setCreatingFromAlertId(null);
    }
  }


  // Hook-order safe block: everything here must run before the `!user` early
  // return below, so the trigger-analysis hooks never become conditional.
  const filteredPriorityGroups = useMemo(
    () => priorityGroups.filter((group) => matchesPurokPriorityFilters(group, {
      floodProne: filterFloodProne,
      floodControlStatus: filterFloodControlStatus,
      category: categoryFilter,
    })),
    [priorityGroups, filterFloodProne, filterFloodControlStatus, categoryFilter],
  );
  const incidentScopedGroups = useIncidentScopedGroups(
    isTriggerAnalyzableIncident(selectedIncident) ? selectedIncident : null,
    filteredPriorityGroups,
  );
  // A trigger zone's scope is its purok (when the alert rule or flood profile
  // names one) or its whole barangay — matched by id, not text matching.
  const zoneScopedGroups = useMemo(
    () => selectedZone
      ? filteredPriorityGroups
        .filter((group) => group.barangayId === selectedZone.barangayId
          && (!selectedZone.purokSitio || group.purokSitio === selectedZone.purokSitio))
        .sort((left, right) => right.score - left.score)
      : [],
    [selectedZone, filteredPriorityGroups],
  );
  const zoneTrigger = useMemo(() => {
    if (!selectedZone) return null;
    const barangayLabel = getBarangayLabel(selectedZone.barangayId as BarangayId) ?? selectedZone.barangayId;
    const zoneAlerts = alerts.filter((alert) => alert.hazard === selectedZone.hazard
      && (!alert.barangay_id || alert.barangay_id.trim() === selectedZone.barangayId));
    return {
      type: selectedZone.hazard,
      severity: zoneAlerts.length > 0 ? 'warning' : 'monitoring',
      status: zoneAlerts.length > 0 ? 'alerting' : 'armed',
      location: selectedZone.purokSitio
        ? `${selectedZone.purokSitio}, ${barangayLabel}`
        : barangayLabel,
      description: selectedZone.source === 'alert_rule'
        ? `Automatic ${selectedZone.hazard} alert trigger zone${selectedZone.purokSitio ? ` covering ${selectedZone.purokSitio}` : ' covering the whole barangay'}, selected from the field map. ${zoneAlerts.length > 0 ? `${zoneAlerts.length} active ${selectedZone.hazard} alert${zoneAlerts.length > 1 ? 's' : ''} for this area.` : 'No active alerts for this area right now — the trigger is armed and monitoring weather thresholds.'}`
        : `Flood-prone purok zone${selectedZone.floodControlStatus ? ` (${PUROK_FLOOD_CONTROL_STATUS_LABELS[selectedZone.floodControlStatus].toLowerCase()})` : ''}, selected from the field map.${selectedZone.warningNotes ? ` ${selectedZone.warningNotes}` : ''}`,
    };
  }, [selectedZone, alerts]);

  // The trigger the map dialog narrates: a selected trigger zone wins, then a
  // selected flood-related incident pin. Plain derivation (no hooks).
  const activeTriggerDialog = selectedZone && zoneTrigger
    ? {
        title: `Trigger zone — ${zoneTrigger.location}`,
        trigger: zoneTrigger,
        scopedGroups: zoneScopedGroups,
      }
    : isTriggerAnalyzableIncident(selectedIncident)
      ? {
          title: `Trigger — ${selectedIncident.location}`,
          trigger: {
            type: selectedIncident.type,
            severity: selectedIncident.severity,
            status: selectedIncident.status,
            location: selectedIncident.location,
            description: selectedIncident.description,
          },
          scopedGroups: incidentScopedGroups,
        }
      : null;

  if (!user) return null;

  const activeIncidents = incidents.filter((incident) => incident.status !== 'resolved');
  const resolvedCount = incidents.filter((incident) => incident.status === 'resolved').length;
  const actionableAlertSuggestionCount = alertSuggestions.filter((suggestion) => !suggestion.linkedIncident).length
    || alertRules.filter((r) => r.enabled).length;
  const filteredMapHouseholds = mapHouseholds.filter((household) => matchesPurokRiskFilters(household, purokRiskProfileMap, {
    floodProne: filterFloodProne,
    floodControlStatus: filterFloodControlStatus,
  }));
  const visibleFloodZoneCount = buildFieldResponseZoneMarkers(filteredMapHouseholds, purokRiskProfiles, alertRules).length;
  const filteredPriorityHouseholdCount = filteredPriorityGroups.reduce(
    (total, group) => total + group.householdCount,
    0,
  );
  const mappedEventCount = events.filter((event) => (
    typeof event.gps_lat === 'number' && typeof event.gps_lng === 'number'
  )).length;

  const barangayBoundaries = barangayBoundaryState.boundaries;
  const hasBarangayBoundaries = barangayBoundaries.length > 0;
  const filteredMapHouseholdsByZone = filteredMapHouseholds.filter((household) => {
    if (selectedBarangayId && household.barangay_id.trim() !== selectedBarangayId) return false;
    if (riskLevelFilter !== 'all' && (household.disaster_risk_level ?? 'low') !== riskLevelFilter) return false;
    return true;
  });
  const filteredMapIncidents = incidents.filter((incident) => {
    if (incidentTypeFilter !== 'all' && incident.type !== incidentTypeFilter) return false;
    if (selectedBarangayId && hasBarangayBoundaries) {
      return assignIncidentBarangay(incident, barangayBoundaries) === selectedBarangayId;
    }
    return true;
  });
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

  type MapSearchResult = {
    kind: 'barangay' | 'household' | 'incident';
    id: string;
    label: string;
    sublabel: string;
    barangayId?: BarangayId;
  };
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const mapSearchResults: MapSearchResult[] = normalizedSearchQuery.length < 2
    ? []
    : [
      ...BARANGAY_OPTIONS
        .filter((option) => option.label.toLowerCase().includes(normalizedSearchQuery))
        .map((option) => ({
          kind: 'barangay' as const,
          id: option.id,
          label: option.label,
          sublabel: 'Barangay boundary',
          barangayId: option.id,
        })),
      ...mapHouseholds
        .filter((household) => (
          household.head_name.toLowerCase().includes(normalizedSearchQuery)
          || household.purok_sitio.toLowerCase().includes(normalizedSearchQuery)
        ))
        .slice(0, 4)
        .map((household) => ({
          kind: 'household' as const,
          id: household.id,
          label: household.head_name,
          sublabel: `${household.barangay_name ?? household.barangay_id} · ${household.purok_sitio}`,
        })),
      ...incidents
        .filter((incident) => (
          incident.location.toLowerCase().includes(normalizedSearchQuery)
          || incident.type.includes(normalizedSearchQuery)
        ))
        .slice(0, 4)
        .map((incident) => ({
          kind: 'incident' as const,
          id: incident.id,
          label: `${incident.type.charAt(0).toUpperCase()}${incident.type.slice(1)} incident`,
          sublabel: incident.location,
        })),
    ].slice(0, 10);
  const topPriorityGroup = filteredPriorityGroups[0] ?? null;
  const topPriorityHousehold = topPriorityGroup
    ? topPriorityGroup.households.find((priority) => !visitedIds.has(priority.household.id)) ?? topPriorityGroup.households[0] ?? null
    : null;
  const topPriorityTags = topPriorityHousehold ? getVulnerabilityPriorityLabels(topPriorityHousehold.flags) : [];
  const hasPurokFilters = filterFloodProne !== 'all' || filterFloodControlStatus !== 'all' || categoryFilter !== 'all';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3.5 bg-slate-100/70">
      {/* ── 1. TOP SITUATIONAL TELEMETRY RIBBON ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-xs shrink-0">
        {/* Left: Operational Beacon & Responder Profile */}
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                Mabini MDRRMO Field Operations
              </span>
              <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-[10px] font-bold text-cyan-800">
                {user.name} ({getResponderCoverageLabel(user)})
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Live GIS Triage Console · GeoRisk PSA Boundary Sync Active
            </p>
          </div>
        </div>

        {/* Center: Situational Vitals */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Incidents */}
          <button
            type="button"
            onClick={() => { setTacticalTab('incidents'); setIncidentSubTab('active'); }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              tacticalTab === 'incidents'
                ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-300 shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Siren className="h-3.5 w-3.5 text-rose-600" />
            <span>{activeIncidents.length} Active Incidents</span>
          </button>

          {/* Priority Queue */}
          <button
            type="button"
            onClick={() => setTacticalTab('priorities')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              tacticalTab === 'priorities'
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Users className="h-3.5 w-3.5 text-amber-600" />
            <span>{filteredPriorityGroups.length} Priority Puroks</span>
          </button>

          {/* Evacuation Centers */}
          <button
            type="button"
            onClick={() => setTacticalTab('logistics')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              tacticalTab === 'logistics'
                ? 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-300 shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-cyan-700" />
            <span>{evacuationCenters.length} Evac Centers</span>
          </button>

          {/* Weather Telemetry */}
          <button
            type="button"
            onClick={() => setTacticalTab('telemetry')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              tacticalTab === 'telemetry'
                ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-300 shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <CloudRain className="h-3.5 w-3.5 text-sky-600" />
            <span>
              {liveWeather?.current.rainChance != null
                ? `${Math.round(liveWeather.current.rainChance ?? 0)}% Rain · ${Math.round(liveWeather.current.windGust ?? 0)} kph`
                : 'Weather Radar'}
            </span>
          </button>
        </div>

        {/* Right: Refresh action */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── 2. MAIN 2-COLUMN TACTICAL WORKSPACE ── */}
      <div className="flex min-h-0 flex-1 gap-3.5">
        {/* ── LEFT TACTICAL COMMAND DOCK ── */}
        <aside className="w-[440px] shrink-0 flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          {/* Tactical Tab Navigation Bar */}
          <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50/80 p-1.5 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setTacticalTab('incidents')}
              className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition ${
                tacticalTab === 'incidents'
                  ? 'bg-white font-bold text-rose-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-1">
                <Siren className="h-3.5 w-3.5" />
                <span className="text-[11px]">Incidents</span>
              </div>
              <span className={`mt-0.5 text-[10px] font-semibold ${activeIncidents.length > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {activeIncidents.length} active
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTacticalTab('priorities')}
              className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition ${
                tacticalTab === 'priorities'
                  ? 'bg-white font-bold text-amber-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <span className="text-[11px]">Priorities</span>
              </div>
              <span className="mt-0.5 text-[10px] font-semibold text-amber-600">
                {filteredPriorityGroups.length} queued
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTacticalTab('logistics')}
              className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition ${
                tacticalTab === 'logistics'
                  ? 'bg-white font-bold text-cyan-800 shadow-xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />
                <span className="text-[11px]">Logistics</span>
              </div>
              <span className="mt-0.5 text-[10px] font-semibold text-cyan-700">
                {evacuationCenters.length} centers
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTacticalTab('telemetry')}
              className={`flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition ${
                tacticalTab === 'telemetry'
                  ? 'bg-white font-bold text-sky-800 shadow-xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-1">
                <CloudRain className="h-3.5 w-3.5" />
                <span className="text-[11px]">Telemetry</span>
              </div>
              <span className="mt-0.5 text-[10px] font-semibold text-sky-600">
                Radar & Ping
              </span>
            </button>
          </div>

          {/* Scrollable Tab Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ──────── TAB 1: INCIDENTS & DISPATCH ──────── */}
            {tacticalTab === 'incidents' && (
              <div className="space-y-4">
                {/* Sub-tab pills */}
                <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setIncidentSubTab('active')}
                    className={`flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition ${
                      incidentSubTab === 'active'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Active Incidents ({activeIncidents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncidentSubTab('suggestions')}
                    className={`flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition ${
                      incidentSubTab === 'suggestions'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Alert Suggestions ({actionableAlertSuggestionCount})
                  </button>
                </div>

                {incidentSubTab === 'active' ? (
                  loading ? (
                    [...Array(3)].map((_, index) => (
                      <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
                    ))
                  ) : activeIncidents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                      <p className="mt-3 text-sm font-bold text-slate-900">No active incidents</p>
                      <p className="mt-1 text-xs text-slate-500">The response area is currently clear and secure.</p>
                    </div>
                  ) : (
                    activeIncidents.map((incident) => {
                      const cfg = SEVERITY_CFG[incident.severity as keyof typeof SEVERITY_CFG] ?? SEVERITY_CFG.low;
                      const isSelected = selectedIncident?.id === incident.id;
                      const selectIncident = () => {
                        setSelectedIncident(incident);
                        setSelectedHousehold(null);
                        setSelectedEvent(null);
                        setSelectedZone(null);
                      };
                      return (
                        <div
                          key={incident.id}
                          role="button"
                          tabIndex={0}
                          onClick={selectIncident}
                          onKeyDown={(event) => activateOnEnterOrSpace(event, selectIncident)}
                          className={`w-full cursor-pointer rounded-2xl border bg-white p-4 text-left transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-900/20 ${
                            isSelected ? 'border-rose-400 shadow-md ring-2 ring-rose-200' : 'border-slate-200/90'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                              {INCIDENT_TYPE_ICONS[incident.type] ?? '⚡'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${cfg.badge}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                  {cfg.label}
                                </span>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  {incident.type.replaceAll('_', ' ')}
                                </span>
                              </div>
                              <p className="mt-1.5 text-sm font-bold text-slate-950">{incident.location}</p>
                              <p className="mt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">{incident.description}</p>
                              <IncidentImpactSummary analysis={incidentImpactAnalyses.get(incident.id) ?? null} />
                              
                              {incident.source === 'alert' && incident.context_snapshot ? (
                                <div className="mt-2.5 rounded-xl border border-cyan-100 bg-cyan-50/70 p-2.5 text-[11px] leading-relaxed text-cyan-950">
                                  <p className="font-bold uppercase tracking-wider text-cyan-800 text-[10px]">Alert Context</p>
                                  <p className="mt-0.5 font-medium">
                                    {incident.context_snapshot.alert_title || incident.context_snapshot.trigger_reason || 'Alert-derived incident'}
                                  </p>
                                </div>
                              ) : null}
                              <p className="mt-2 text-[10px] font-medium text-slate-400">{timeAgo(incident.reported_at)}</p>
                            </div>
                          </div>

                          {/* Status transition row */}
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
                                className={`rounded-xl py-1.5 text-[10px] font-bold transition ${
                                  incident.status === status.value
                                    ? `${status.color} ring-1 ring-inset ring-current`
                                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                }`}
                              >
                                {updatingId === incident.id ? '…' : status.label}
                              </button>
                            ))}
                          </div>

                          {isTriggerAnalyzableIncident(incident) ? (
                            <div className="mt-2.5">
                              <TriggerAnalysis
                                incident={incident}
                                groups={filteredPriorityGroups}
                                incidents={incidents}
                                alerts={alerts}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )
                ) : (
                  /* Alert Suggestions Feed */
                  alertSuggestions.length > 0 ? (
                    alertSuggestions.map((suggestion) => {
                      const alreadyLinked = Boolean(suggestion.linkedIncident);
                      return (
                        <div
                          key={suggestion.id}
                          className={`rounded-2xl border p-4 transition ${
                            alreadyLinked ? 'border-slate-200 bg-slate-50/70' : 'border-cyan-200 bg-cyan-50/40 shadow-xs'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-xl">
                              <Siren className="h-5 w-5 text-cyan-800" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <CivicBadge label={HAZARD_LABELS[suggestion.payload.hazard]} tone="teal" className="text-[10px]" />
                                <CivicBadge
                                  label={suggestion.payload.severity === 'warning' ? 'Warning' : 'Advisory'}
                                  tone={suggestion.payload.severity === 'warning' ? 'rose' : 'amber'}
                                  className="text-[10px]"
                                />
                                {alreadyLinked ? (
                                  <CivicBadge label="Incident linked" tone="slate" className="text-[10px]" />
                                ) : null}
                              </div>
                              <p className="mt-1.5 text-sm font-bold text-slate-950">{suggestion.locationLabel}</p>
                              <p className="mt-1 text-xs text-slate-600">{suggestion.payload.trigger_reason}</p>
                              <p className="mt-2 text-[10px] font-medium text-slate-400">{timeAgo(new Date(suggestion.payload.issued_at))}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={alreadyLinked || creatingFromAlertId === suggestion.id}
                              onClick={() => setSuggestionModal(suggestion)}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                alreadyLinked
                                  ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                                  : 'bg-cyan-900 text-white hover:bg-cyan-800'
                              }`}
                            >
                              {creatingFromAlertId === suggestion.id ? 'Creating incident...' : 'Create incident from alert'}
                            </button>
                            {alreadyLinked ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedIncident(suggestion.linkedIncident ?? null);
                                  setSelectedHousehold(null);
                                  setSelectedEvent(null);
                                  setIncidentSubTab('active');
                                }}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                              >
                                View linked incident
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : alertRules.filter((r) => r.enabled).length > 0 ? (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Monitoring — standby</p>
                        <p className="mt-1 text-xs text-slate-500">Weather is within normal thresholds. Rules below are actively watching.</p>
                      </div>
                      {alertRules.filter((r) => r.enabled).map((rule) => {
                        const barangayLabel = BARANGAY_OPTIONS.find((b) => b.id === rule.barangay_id)?.label ?? rule.barangay_id;
                        const locationLabel = rule.purok_sitio ? `${barangayLabel} · ${rule.purok_sitio}` : barangayLabel;
                        return (
                          <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-base">
                                {INCIDENT_TYPE_ICONS[rule.hazard] ?? '⚡'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <CivicBadge label={HAZARD_LABELS[rule.hazard]} tone="teal" className="text-[10px]" />
                                  <CivicBadge label="Standby" tone="slate" className="text-[10px]" />
                                </div>
                                <p className="mt-1 text-sm font-bold text-slate-950">{locationLabel}</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">Cooldown {rule.cooldown_minutes}m · ({rule.trigger_lat.toFixed(4)}, {rule.trigger_lng.toFixed(4)})</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                      <Siren className="mx-auto h-7 w-7 text-slate-400" />
                      <p className="mt-2 text-sm font-semibold text-slate-800">No alert rules configured</p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* ──────── TAB 2: PRIORITY QUEUE & TRIAGE ──────── */}
            {tacticalTab === 'priorities' && (
              <div className="space-y-4">
                {/* Recommended First Response Banner */}
                {topPriorityGroup && topPriorityHousehold ? (() => {
                  const levelTone = topPriorityGroup.level === 'critical' ? 'rose' : topPriorityGroup.level === 'high' ? 'amber' : topPriorityGroup.level === 'medium' ? 'navy' : 'slate';
                  return (
                    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 shadow-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Recommended First Response</p>
                          <h4 className="mt-1 text-base font-black text-slate-950">{topPriorityGroup.purokSitio}</h4>
                          <p className="mt-1 text-xs text-slate-600">
                            Unahon si <span className="font-bold text-slate-950">{topPriorityHousehold.household.head_name}</span>
                          </p>
                        </div>
                        <CivicBadge label={topPriorityGroup.level.toUpperCase()} tone={levelTone} className="text-[10px]" />
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        <CivicBadge label={`Score ${topPriorityGroup.score}`} tone="amber" className="text-[10px]" />
                        <CivicBadge label={`${topPriorityGroup.vulnerableResidentCount} vulnerable`} tone="rose" className="text-[10px]" />
                        <CivicBadge label={`${topPriorityGroup.householdCount} households`} tone="slate" className="text-[10px]" />
                        {topPriorityGroup.reasons.slice(0, 3).map((reason) => (
                          <CivicBadge key={reason} label={reason} tone="navy" className="text-[10px]" />
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedHousehold(topPriorityHousehold.household);
                            setSelectedIncident(null);
                            setSelectedEvent(null);
                          }}
                          className="rounded-full bg-cyan-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-900"
                        >
                          Inspect Household
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateToHousehold(topPriorityHousehold.household)}
                          className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-50"
                        >
                          Navigate
                        </button>
                      </div>
                    </div>
                  );
                })() : null}

                {/* Purok Targeting Filters */}
                <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Triage Filters</span>
                    {hasPurokFilters ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterFloodProne('all');
                          setFilterFloodControlStatus('all');
                          setCategoryFilter('all');
                        }}
                        className="text-[11px] font-semibold text-cyan-900 hover:underline"
                      >
                        Reset filters
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={filterFloodProne}
                      onChange={(e) => setFilterFloodProne(e.target.value as PurokFloodProneFilter)}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-cyan-900"
                    >
                      <option value="all">All flood exposure</option>
                      <option value="flood_prone">Flood-prone only</option>
                      <option value="not_flood_prone">Not flood-prone</option>
                    </select>

                    <select
                      value={filterFloodControlStatus}
                      onChange={(e) => setFilterFloodControlStatus(e.target.value as PurokFloodControlStatus | 'all')}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-cyan-900"
                    >
                      <option value="all">All flood control</option>
                      {PUROK_FLOOD_CONTROL_OPTIONS.map((status) => (
                        <option key={status} value={status}>{PUROK_FLOOD_CONTROL_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Demographic Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {PRIORITY_CATEGORY_FILTERS.map((key) => {
                      const count = key === 'all'
                        ? priorityGroups.length
                        : priorityGroups.filter((group) => group.categoryCounts[key] > 0).length;
                      return (
                        <CivicChipButton
                          key={key}
                          active={categoryFilter === key}
                          onClick={() => setCategoryFilter(key)}
                          className="text-[11px] py-1 px-2.5"
                        >
                          {key === 'all' ? 'All' : DISTRIBUTION_CATEGORY_LABELS[key]}
                          <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[9px] ${
                            categoryFilter === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {count}
                          </span>
                        </CivicChipButton>
                      );
                    })}
                  </div>
                </div>

                {/* Priority Puroks Queue */}
                <PriorityAnalytics
                  groups={filteredPriorityGroups}
                  incidents={incidents}
                  alerts={alerts}
                />

                {filteredPriorityGroups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                    <Users className="mx-auto h-7 w-7 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-800">No priority puroks matching filters</p>
                  </div>
                ) : (
                  filteredPriorityGroups.map((group, index) => {
                    const levelTone = group.level === 'critical' ? 'rose' : group.level === 'high' ? 'amber' : group.level === 'medium' ? 'navy' : 'slate';
                    const firstHousehold = group.households.find((priority) => !visitedIds.has(priority.household.id)) ?? group.households[0];
                    if (!firstHousehold) return null;
                    const priority = firstHousehold;
                    const isVisited = visitedIds.has(priority.household.id);
                    const selectPurok = () => {
                      if (!firstHousehold) return;
                      setSelectedHousehold(firstHousehold.household);
                      setSelectedIncident(null);
                      setSelectedEvent(null);
                    };
                    return (
                      <div
                        key={group.id}
                        role="button"
                        tabIndex={0}
                        onClick={selectPurok}
                        onKeyDown={(event) => activateOnEnterOrSpace(event, selectPurok)}
                        className="w-full cursor-pointer rounded-2xl border border-slate-200/90 bg-white p-4 text-left transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus:outline-none"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-700">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-950">{group.purokSitio}</p>
                                <p className="truncate text-xs text-slate-500">{group.barangayLabel}</p>
                                <p className="mt-0.5 truncate text-xs font-semibold text-cyan-900">Unahon: {firstHousehold.household.head_name}</p>
                              </div>
                              <CivicBadge label={group.level.toUpperCase()} tone={levelTone} className="text-[10px]" />
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <CivicBadge label={group.floodProne ? 'Flood-prone' : 'Not flood-prone'} tone={group.floodProne ? 'rose' : 'emerald'} className="text-[10px]" />
                              <CivicBadge label={group.floodControlLabel} tone="slate" className="text-[10px]" />
                              <CivicBadge label={`${group.householdCount} hh`} tone="slate" className="text-[10px]" />
                              <CivicBadge label={`${group.vulnerableResidentCount} vuln`} tone="rose" className="text-[10px]" />
                              <CivicBadge label={`Score ${group.score}`} tone="amber" className="text-[10px]" />
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
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
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
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              isVisited ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isVisited ? 'Checked in ✓' : 'Mark check-in'}
                          </button>
                        </div>

                        {group.households.length > 0 ? (
                          <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Households in priority order</p>
                            {group.households.slice(0, 3).map((queuedHousehold, householdIndex) => {
                              const queuedTags = getVulnerabilityPriorityLabels(queuedHousehold.flags);
                              const queuedVisited = visitedIds.has(queuedHousehold.household.id);
                              return (
                                <button
                                  key={queuedHousehold.household.id}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedHousehold(queuedHousehold.household);
                                    setSelectedIncident(null);
                                    setSelectedEvent(null);
                                  }}
                                  className={`w-full rounded-xl border px-2.5 py-2 text-left transition hover:border-slate-300 ${
                                    queuedVisited ? 'border-emerald-200 bg-emerald-50' : 'border-white bg-white'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-xs font-bold text-slate-900">
                                      {householdIndex + 1}. {queuedHousehold.household.head_name}
                                    </span>
                                    {queuedVisited ? <CivicBadge label="Visited" tone="emerald" className="text-[9px]" /> : null}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {queuedTags.slice(0, 2).map((tag) => (
                                      <CivicBadge key={tag} label={tag} tone="rose" className="text-[9px]" />
                                    ))}
                                    <CivicBadge label={`Score ${queuedHousehold.score}`} tone="amber" className="text-[9px]" />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        <PurokCategoryRoster
                          group={group}
                          residents={allResidents}
                          flags={allFlags}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ──────── TAB 3: EVACUATION & LOGISTICS ──────── */}
            {tacticalTab === 'logistics' && (
              <div className="space-y-4">
                {/* Evacuation Centers Panel */}
                <EvacuationCenterPanel
                  centers={evacuationCenters}
                  canManageRegistry={user?.role === 'admin'}
                  savingCenterId={savingCenterId}
                  onSetStatus={(centerId, status) => {
                    void handleSetEvacuationCenterStatus(centerId, status);
                  }}
                  onSaveCenters={handleSaveEvacuationCenters}
                  onDeleteCenter={(centerId) => {
                    void handleDeleteEvacuationCenter(centerId);
                  }}
                />

                {/* Distribution Events section */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Field Logistics</p>
                      <h4 className="text-sm font-bold text-slate-950">Active Distribution Events</h4>
                    </div>
                    <CivicBadge label={`${events.length} active`} tone="emerald" className="text-[10px]" />
                  </div>

                  {events.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3 text-center">No ongoing distribution drives currently active.</p>
                  ) : (
                    events.map((event) => (
                      <div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{event.event_name}</p>
                            <p className="text-xs text-slate-500">{event.location}</p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {new Date(event.scheduled_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigateToEvent(event)}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Navigate
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ──────── TAB 4: TELEMETRY & EARLY WARNING ──────── */}
            {tacticalTab === 'telemetry' && (
              <div className="space-y-4">
                {/* Weather Widget */}
                <WeatherWidget
                  mode="compact"
                  className="civic-card-shadow"
                  lat={activeRule?.trigger_lat}
                  lng={activeRule?.trigger_lng}
                />

                {/* Auto-Alert Trigger Status Monitor */}
                {activeRule && (
                  <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Threshold Monitor</p>
                      <h4 className="mt-0.5 text-sm font-bold text-slate-950">Live Weather Triggers</h4>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Rule: <span className="font-semibold">{activeRule.hazard.replaceAll('_', ' ')}</span> at{' '}
                        {activeRule.trigger_lat.toFixed(3)}, {activeRule.trigger_lng.toFixed(3)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          icon: CloudRain,
                          label: 'Rain Chance',
                          current: liveWeather?.current.rainChance ?? null,
                          threshold: activeRule.min_rain_chance ?? null,
                          format: (v: number) => `${Math.round(v)}%`,
                        },
                        {
                          icon: CloudRain,
                          label: 'Rain Intensity',
                          current: liveWeather?.current.rainIntensity ?? null,
                          threshold: activeRule.min_rain_intensity_mm_per_hr ?? null,
                          format: (v: number) => `${v.toFixed(1)} mm/h`,
                        },
                        {
                          icon: CloudRain,
                          label: 'Next-Hour Rain',
                          current: liveWeather?.current.nextHourPrecipitationPeak ?? null,
                          threshold: activeRule.min_next_hour_precip_mm ?? null,
                          format: (v: number) => `${v.toFixed(1)} mm`,
                        },
                        {
                          icon: Wind,
                          label: 'Wind Gust',
                          current: liveWeather?.current.windGust ?? null,
                          threshold: activeRule.min_wind_gust_kph ?? null,
                          format: (v: number) => `${Math.round(v)} kph`,
                        },
                      ].map((metric) => {
                        const willTrigger = metric.threshold !== null && metric.current !== null && metric.current >= metric.threshold;
                        const hasData = metric.current !== null;
                        const tone = willTrigger
                          ? 'border-rose-200 bg-rose-50 text-rose-800'
                          : hasData
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-500';
                        return (
                          <div key={metric.label} className={`rounded-xl border p-2.5 ${tone}`}>
                            <div className="flex items-center gap-1 text-[10px] font-bold uppercase opacity-75">
                              <metric.icon className="h-3 w-3" />
                              {metric.label}
                            </div>
                            <p className="mt-1 text-sm font-black">
                              {hasData ? metric.format(metric.current!) : 'No data'}
                            </p>
                            {metric.threshold !== null && (
                              <p className="text-[9px] opacity-70">
                                Trigger: ≥ {metric.format(metric.threshold)}
                              </p>
                            )}
                            {willTrigger && (
                              <p className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-rose-700">
                                <AlertCircle className="h-2.5 w-2.5" /> Met
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {liveWeather && liveWeather.alerts.length > 0 && (() => {
                      const lead = liveWeather.alerts[0];
                      const isWarning = lead.severity === 'warning';
                      return (
                        <div className={`rounded-xl border p-2.5 ${
                          isWarning ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'
                        }`}>
                          <div className="flex items-start gap-2">
                            <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${isWarning ? 'text-rose-600' : 'text-amber-600'}`} />
                            <div>
                              <p className={`text-xs font-semibold ${isWarning ? 'text-rose-800' : 'text-amber-800'}`}>{lead.title}</p>
                              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{lead.detail}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Purok Flood Risk Profiles & Emergency Ping */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Zones & Pings</p>
                      <h4 className="text-sm font-bold text-slate-950">Purok Risk Profiles</h4>
                    </div>
                    <CivicBadge label={`${purokRiskProfiles.length} zones`} tone="navy" className="text-[10px]" />
                  </div>

                  <div className="space-y-3">
                    {purokRiskProfiles.map((profile) => {
                      const houseCount = mapHouseholds.filter(
                        (h) => h.purok_sitio === profile.purok_sitio && h.barangay_id === profile.barangay_id
                      ).length;
                      const hasPinged = pingZones.has(profile.purok_sitio);
                      const isAtRisk = profile.flood_prone;

                      return (
                        <div
                          key={profile.purok_sitio}
                          className={`rounded-xl border p-3 transition ${
                            isAtRisk ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-slate-950">{profile.purok_sitio}</p>
                              <p className="text-xs text-slate-500">
                                {PUROK_FLOOD_CONTROL_STATUS_LABELS[profile.flood_control_status]} · {houseCount} households
                              </p>
                            </div>

                            <select
                              value={profile.flood_control_status}
                              disabled={updatingPurokStatus === profile.purok_sitio}
                              onChange={(e) => handlePurokStatusUpdate(profile, e.target.value as PurokFloodControlStatus)}
                              className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 outline-none focus:border-cyan-900"
                            >
                              {PUROK_FLOOD_CONTROL_OPTIONS.map((s) => (
                                <option key={s} value={s}>{PUROK_FLOOD_CONTROL_STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={houseCount === 0 || !profile.flood_prone}
                              onClick={() => setPingModal({ purok: profile, householdCount: houseCount })}
                              className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold transition ${
                                hasPinged
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : isAtRisk
                                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                                    : 'bg-cyan-950 text-white hover:bg-cyan-900'
                              } disabled:cursor-not-allowed disabled:opacity-40`}
                            >
                              <BellRing className="h-3 w-3" />
                              {hasPinged ? 'Pinged' : 'Send Ping'}
                            </button>

                            <button
                              type="button"
                              disabled={updatingPurokStatus === profile.purok_sitio + '-toggle'}
                              onClick={() => handlePurokFloodProneToggle(profile)}
                              className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[10px] font-bold transition ${
                                profile.flood_prone
                                  ? 'border-amber-200 bg-amber-100 text-amber-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {profile.flood_prone ? 'Prone ✓' : 'Mark Prone'}
                            </button>

                            <button
                              type="button"
                              onClick={() => startEditingPurok(profile)}
                              className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                            >
                              <Edit2 className="h-2.5 w-2.5" />
                              Notes
                            </button>
                          </div>

                          {/* Inline edit form */}
                          {editingPurokId === profile.purok_sitio && purokEditForm && (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                              <label className="block text-[10px] font-bold text-slate-700">Evacuation Site</label>
                              <input
                                type="text"
                                value={purokEditForm.default_evacuation_site}
                                onChange={(e) => setPurokEditForm({ ...purokEditForm, default_evacuation_site: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                                placeholder="e.g. Barangay Gym"
                              />
                              <label className="block text-[10px] font-bold text-slate-700">Warning Notes</label>
                              <input
                                type="text"
                                value={purokEditForm.warning_notes}
                                onChange={(e) => setPurokEditForm({ ...purokEditForm, warning_notes: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                                placeholder="e.g. Bridge overflow risk"
                              />
                              <div className="flex gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleSavePurokEdits(profile)}
                                  className="rounded-lg bg-cyan-950 px-3 py-1 text-[10px] font-bold text-white hover:bg-cyan-900"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingPurokId(null); setPurokEditForm(null); }}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold text-slate-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── RIGHT MAP WORKSPACE ── */}
        <section className="min-w-0 flex-1 flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden relative">
          {/* Top Map Filter & Command Bar */}
          <div className="border-b border-slate-200/90 bg-slate-50/70 p-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <CivicSearchInput
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search household, purok, or incident…"
                  className="w-full"
                />

                {mapSearchResults.length > 0 && (
                  <div className="absolute top-11 left-0 z-40 w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    {mapSearchResults.map((result) => (
                      <button
                        key={`${result.kind}-${result.id}`}
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          if (result.kind === 'barangay') {
                            setSelectedBarangayId(result.barangayId ?? '');
                            setSelectedHousehold(null);
                            setSelectedIncident(null);
                            setSelectedEvent(null);
                          } else if (result.kind === 'household') {
                            const household = mapHouseholds.find((item) => item.id === result.id) ?? null;
                            setSelectedHousehold(household);
                            setSelectedIncident(null);
                            setSelectedEvent(null);
                          } else if (result.kind === 'incident') {
                            const incident = incidents.find((item) => item.id === result.id) ?? null;
                            setSelectedIncident(incident);
                            setSelectedHousehold(null);
                            setSelectedEvent(null);
                          }
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2 text-left hover:bg-slate-50 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">{result.label}</p>
                          <p className="truncate text-[10px] text-slate-500">{result.sublabel}</p>
                        </div>
                        <CivicBadge
                          label={result.kind}
                          tone={result.kind === 'incident' ? 'rose' : result.kind === 'household' ? 'emerald' : 'navy'}
                          className="text-[9px]"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Barangay Filter */}
              <select
                value={selectedBarangayId}
                onChange={(event) => setSelectedBarangayId(event.target.value as BarangayId | '')}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-cyan-800"
              >
                <option value="">All Barangays</option>
                {BARANGAY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>

              {/* Risk Level Filter */}
              <select
                value={riskLevelFilter}
                onChange={(event) => setRiskLevelFilter(event.target.value as 'all' | 'low' | 'medium' | 'high')}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-cyan-800"
              >
                <option value="all">All Risk Levels</option>
                <option value="high">High Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="low">Low Risk</option>
              </select>

              {/* Incident Type Filter */}
              <select
                value={incidentTypeFilter}
                onChange={(event) => setIncidentTypeFilter(event.target.value as 'all' | IncidentType)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-cyan-800"
              >
                <option value="all">All Incident Types</option>
                <option value="flood">Flood</option>
                <option value="fire">Fire</option>
                <option value="medical">Medical</option>
                <option value="landslide">Landslide</option>
                <option value="typhoon">Typhoon</option>
                <option value="other">Other</option>
              </select>

              {/* Barangay Boundaries Toggle */}
              <CivicChipButton
                active={showBarangayBoundaries}
                onClick={() => setShowBarangayBoundaries((v) => !v)}
                className="h-10 text-xs"
              >
                Boundaries
              </CivicChipButton>

              {/* Floating Layers & Radar Button */}
              <button
                type="button"
                onClick={() => setLayersMenuOpen((open) => !open)}
                className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border text-xs font-bold transition ${
                  layersMenuOpen
                    ? 'border-cyan-800 bg-cyan-950 text-white shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Layers3 className="h-4 w-4" />
                Layers & Radar
              </button>
            </div>
          </div>

          {/* Floating Layers & Radar Popover */}
          {layersMenuOpen && (
            <div className="absolute top-16 right-4 z-40 w-80 max-h-[75vh] overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl p-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900">Map Layers & Radar</span>
                <button
                  type="button"
                  onClick={() => setLayersMenuOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
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
          )}

          {/* Interactive Leaflet Map */}
          <div className="min-h-0 flex-1 relative">
            <ResponderLeafletMap
              households={filteredMapHouseholdsByZone}
              incidents={filteredMapIncidents}
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
                  setSelectedZone(null);
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
                  setSelectedZone(null);
                }
              }}
              selectedIncident={selectedIncident}
              onSelectIncident={(incident) => {
                setSelectedIncident(incident);
                if (incident) {
                  setSelectedHousehold(null);
                  setSelectedEvent(null);
                  setSelectedZone(null);
                  if (isTriggerAnalyzableIncident(incident)) {
                    setTriggerDialogOpen(true);
                  }
                }
              }}
              selectedEvent={selectedEvent}
              onSelectEvent={(event) => {
                setSelectedEvent(event);
                if (event) {
                  setSelectedHousehold(null);
                  setSelectedIncident(null);
                  setSelectedZone(null);
                }
              }}
              onSelectZone={(zone) => {
                setSelectedZone(zone);
                if (zone) {
                  setSelectedHousehold(null);
                  setSelectedIncident(null);
                  setSelectedEvent(null);
                  setTriggerDialogOpen(true);
                }
              }}
              activeBaseLayerId={mapControls.activeBaseLayerId}
              activeLayerIds={mapControls.activeLayerIds}
              showWeather={mapControls.showWeather}
              overlayOpacity={mapControls.overlayOpacity}
              refreshVersion={mapControls.mapRefreshVersion}
              containerClassName="h-full"
            />

            {/* Floating Selection Inspector Dock */}
            {(selectedHousehold || selectedIncident || selectedEvent || selectedZone || selectedBarangaySummary) && (
              <div className="absolute bottom-4 left-4 right-4 z-30 max-w-xl mx-auto rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl p-4 transition-all">
                {selectedBarangaySummary ? (
                  <BarangayResponsePanel
                    summary={selectedBarangaySummary}
                    onClose={() => setSelectedBarangayId('')}
                  />
                ) : (
                  <ResponderSelectionSummary
                    household={selectedHousehold}
                    incident={selectedIncident}
                    event={selectedEvent}
                    onClear={() => {
                      setSelectedHousehold(null);
                      setSelectedIncident(null);
                      setSelectedEvent(null);
                      setSelectedZone(null);
                    }}
                    onNavigateHousehold={navigateToHousehold}
                    onNavigateIncident={navigateToIncident}
                    onNavigateEvent={navigateToEvent}
                  />
                )}

                {selectedIncident && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <IncidentImpactPanel
                      analysis={incidentImpactAnalyses.get(selectedIncident.id) ?? null}
                      visitedHouseholdIds={visitedIds}
                      onNavigateHousehold={navigateToHousehold}
                      onCheckIn={(householdId) => {
                        setVisitedIds((current) => {
                          const next = new Set(current);
                          if (next.has(householdId)) next.delete(householdId);
                          else next.add(householdId);
                          return next;
                        });
                      }}
                    />
                  </div>
                )}

                {selectedZone && (
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-slate-600">
                      Selected zone: <span className="font-bold">{zoneTrigger?.location}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setTriggerDialogOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cyan-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-900"
                    >
                      <Zap className="h-3 w-3" />
                      Open Trigger Analysis
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Trigger Analysis Dialog ── */}
      {activeTriggerDialog && (
        <TriggerAnalysisDialog
          open={triggerDialogOpen}
          onOpenChange={setTriggerDialogOpen}
          title={activeTriggerDialog.title}
          trigger={activeTriggerDialog.trigger}
          scopedGroups={activeTriggerDialog.scopedGroups}
          incidents={incidents}
          alerts={alerts}
          onNavigateHousehold={navigateToHousehold}
        />
      )}

      {/* ── Alert-to-Incident Modal ── */}
      {suggestionModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={() => {
            if (!creatingFromAlertId) {
              setSuggestionModal(null);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-t-[32px] bg-white p-6 shadow-2xl sm:rounded-[32px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-cyan-100">
                <Siren className="h-6 w-6 text-cyan-700" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-700">Alert to Incident</p>
                <h3 className="mt-0.5 text-xl font-black text-slate-950">Create responder case</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Confirm this alert should become an operational incident.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap gap-2">
                <CivicBadge
                  label={HAZARD_LABELS[suggestionModal.payload.hazard]}
                  tone={suggestionModal.payload.severity === 'warning' ? 'rose' : 'amber'}
                />
                <CivicBadge
                  label={suggestionModal.payload.severity === 'warning' ? 'High severity' : 'Medium severity'}
                  tone="slate"
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Location</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{suggestionModal.locationLabel}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Trigger reason</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{suggestionModal.payload.trigger_reason}</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={Boolean(creatingFromAlertId)}
                onClick={() => setSuggestionModal(null)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(creatingFromAlertId)}
                onClick={() => void handleCreateIncidentFromAlert(suggestionModal)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-900 py-3 text-sm font-bold text-white shadow-sm shadow-cyan-200 transition hover:bg-cyan-800 disabled:opacity-60"
              >
                {creatingFromAlertId === suggestionModal.id ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating incident...
                  </>
                ) : (
                  <>
                    <Siren className="h-4 w-4" />
                    Confirm and create
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Emergency Ping Modal ── */}
      {pingModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={() => setPingModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-[32px] bg-white p-6 shadow-2xl sm:rounded-[32px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-rose-100">
                <BellRing className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">Emergency Ping</p>
                <h3 className="mt-0.5 text-xl font-black text-slate-950">{pingModal.purok.purok_sitio}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Sending location ping to <span className="font-bold text-slate-900">{pingModal.householdCount} households</span>.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Alert preview</p>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                <span className="font-bold">[MSWDO FIELD PING]</span> Responders are monitoring{' '}
                <span className="font-semibold">{pingModal.purok.purok_sitio}</span> due to flood risk.
                {pingModal.purok.warning_notes ? ` ${pingModal.purok.warning_notes}` : ' Please stay alert and avoid low-lying areas.'}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPingModal(null)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSendingPing}
                onClick={async () => {
                  setIsSendingPing(true);
                  await new Promise((resolve) => setTimeout(resolve, 1400));
                  setPingZones((current) => new Set([...current, pingModal.purok.purok_sitio]));
                  setPingModal(null);
                  setIsSendingPing(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3 text-sm font-bold text-white shadow-sm shadow-rose-200 hover:bg-rose-700 disabled:opacity-60 transition"
              >
                {isSendingPing ? 'Sending…' : 'Send Ping Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
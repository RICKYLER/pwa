'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { createIncident, getIncidents, updateIncidentStatus } from '@/lib/db/incidents';
import { getDistributionEvents } from '@/lib/db/distribution';
import { getDisasterAlerts, getDisasterAlertRules } from '@/lib/db/disaster-alerts';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { getHouseholds } from '@/lib/db/households';
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
  Household,
  Incident,
  IncidentStatus,
  PurokFloodControlStatus,
  PurokRiskProfile,
  Resident,
  UserNotification,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { AlertCircle, BellRing, CheckCircle2, CloudRain, Edit2, MapPin, Package, Radio, RefreshCw, ShieldAlert, Siren, Users, Wind, Zap } from 'lucide-react';
import WeatherWidget from '@/components/WeatherWidget';
import ResponderLeafletMap from '@/components/ResponderLeafletMap';
import ResponderMapControlPanel from '@/components/ResponderMapControlPanel';
import ResponderSelectionSummary from '@/components/ResponderSelectionSummary';
import { CivicBadge, CivicChipButton, CivicPanel } from '@/components/ui/civic-primitives';
import {
  buildFieldResponseZoneMarkers,
  buildPurokRiskProfileMap,
  getPurokRiskProfileForHousehold,
  matchesPurokRiskFilters,
  PUROK_FLOOD_CONTROL_STATUS_LABELS,
} from '@/lib/purok-risk-profiles';
import {
  buildAffectedAreaLabel,
  buildDisasterAlertNotificationPayloadFromAlert,
  HAZARD_LABELS,
  parseDisasterAlertNotification,
} from '@/lib/disaster-alerts';
import { BARANGAY_OPTIONS } from '@/lib/barangays';
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
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [mapHouseholds, setMapHouseholds] = useState<Household[]>([]);
  const [purokRiskProfiles, setPurokRiskProfiles] = useState<PurokRiskProfile[]>([]);
  const [alertRules, setAlertRules] = useState<DisasterAlertRule[]>([]);
  const [alerts, setAlerts] = useState<DisasterAlert[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [liveWeather, setLiveWeather] = useState<FieldResponseWeatherPayload | null>(null);
  const [filterFloodProne, setFilterFloodProne] = useState<PurokFloodProneFilter>('all');
  const [filterFloodControlStatus, setFilterFloodControlStatus] = useState<PurokFloodControlStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DistributionEvent | null>(null);
  const [activeTab, setActiveTab] = useState<'incidents' | 'suggestions' | 'priorities' | 'events' | 'zones'>('incidents');
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

      const [allIncidents, allHouseholds, residents, flags, ongoingEvents, profiles, rules, latestAlerts, latestNotifications] = await Promise.all([
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
      ]);
      const households = getResponderMappedHouseholds(allHouseholds, user);

      setIncidents(allIncidents);
      setEvents(ongoingEvents);
      setMapHouseholds(households);
      setPurokRiskProfiles(profiles);
      setAlertRules(rules);
      setAlerts(latestAlerts);
      setNotifications(latestNotifications);

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);


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
      setActiveTab('incidents');
      setSuggestionModal(null);
      await load();
    } catch (error) {
      console.error('Failed to create incident from alert:', error);
    } finally {
      setCreatingFromAlertId(null);
    }
  }


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
  const topPriorityGroup = filteredPriorityGroups[0] ?? null;
  const topPriorityHousehold = topPriorityGroup
    ? topPriorityGroup.households.find((priority) => !visitedIds.has(priority.household.id)) ?? topPriorityGroup.households[0] ?? null
    : null;
  const topPriorityTags = topPriorityHousehold ? getVulnerabilityPriorityLabels(topPriorityHousehold.flags) : [];
  const hasPurokFilters = filterFloodProne !== 'all' || filterFloodControlStatus !== 'all';

  return (
    <div className="flex h-full min-h-0 gap-5 p-5">
      <aside className="w-[410px] shrink-0 overflow-y-auto pr-1">
        <div className="space-y-4">
          <CivicPanel className="overflow-hidden border-cyan-100 bg-[linear-gradient(135deg,#083344,#164e63)] text-white shadow-[0_28px_60px_-36px_rgba(8,47,73,0.7)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/70">Response Operations</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight">{user.name}</h2>
                <p className="mt-1 text-sm text-cyan-100/80">{getResponderCoverageLabel(user)}</p>
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
                { label: 'Priority', value: filteredPriorityGroups.length },
                { label: 'Resolved', value: resolvedCount },
              ].map((metric) => (
                <div key={metric.label} className="rounded-[20px] border border-white/10 bg-white/10 px-3 py-3">
                  <p className="text-2xl font-black">{loading ? '—' : metric.value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">{metric.label}</p>
                </div>
              ))}
            </div>
          </CivicPanel>

          {topPriorityGroup && topPriorityHousehold ? (() => {
            const levelTone = topPriorityGroup.level === 'critical' ? 'rose' : topPriorityGroup.level === 'high' ? 'amber' : topPriorityGroup.level === 'medium' ? 'navy' : 'slate';
            return (
              <CivicPanel className="space-y-3 border-cyan-200 bg-cyan-50/80">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">Recommended first response</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">{topPriorityGroup.purokSitio}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Unahon si <span className="font-bold text-slate-950">{topPriorityHousehold.household.head_name}</span>
                    </p>
                  </div>
                  <CivicBadge label={topPriorityGroup.level.toUpperCase()} tone={levelTone} className="text-[10px]" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <CivicBadge label={`Score ${topPriorityGroup.score}`} tone="amber" className="text-[10px]" />
                  <CivicBadge label={`${topPriorityGroup.vulnerableResidentCount} vulnerable`} tone="rose" className="text-[10px]" />
                  {topPriorityGroup.reasons.slice(0, 3).map((reason) => (
                    <CivicBadge key={reason} label={reason} tone="navy" className="text-[10px]" />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHousehold(topPriorityHousehold.household);
                      setSelectedIncident(null);
                      setSelectedEvent(null);
                      setActiveTab('priorities');
                    }}
                    className="rounded-full bg-cyan-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-900"
                  >
                    View priority
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToHousehold(topPriorityHousehold.household)}
                    className="rounded-full border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-50"
                  >
                    Navigate
                  </button>
                </div>
              </CivicPanel>
            );
          })() : null}

          <WeatherWidget
            mode="compact"
            className="civic-card-shadow"
            lat={activeRule?.trigger_lat}
            lng={activeRule?.trigger_lng}
          />

          {/* Auto-Alert Trigger Status — mirrors the Alerts page weather preview */}
          {activeRule && (
            <CivicPanel className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Auto-Alert Monitor</p>
                <h3 className="mt-1 text-base font-black tracking-tight text-slate-950">Live trigger status</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Matches the <span className="font-semibold">{activeRule.hazard.replaceAll('_', ' ')}</span> rule at
                  {' '}<span className="font-medium text-slate-700">{activeRule.trigger_lat.toFixed(4)}, {activeRule.trigger_lng.toFixed(4)}</span>.
                </p>
              </div>

              {/* Threshold vs Current grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    icon: CloudRain,
                    label: 'Rain Chance',
                    current: liveWeather?.current.rainChance ?? null,
                    threshold: activeRule.min_rain_chance ?? null,
                    unit: '%',
                    format: (v: number) => `${Math.round(v)}%`,
                  },
                  {
                    icon: CloudRain,
                    label: 'Rain Intensity',
                    current: liveWeather?.current.rainIntensity ?? null,
                    threshold: activeRule.min_rain_intensity_mm_per_hr ?? null,
                    unit: 'mm/hr',
                    format: (v: number) => `${v.toFixed(1)} mm/hr`,
                  },
                  {
                    icon: CloudRain,
                    label: 'Next-Hour Rain',
                    current: liveWeather?.current.nextHourPrecipitationPeak ?? null,
                    threshold: activeRule.min_next_hour_precip_mm ?? null,
                    unit: 'mm',
                    format: (v: number) => `${v.toFixed(1)} mm`,
                  },
                  {
                    icon: Wind,
                    label: 'Wind Gust',
                    current: liveWeather?.current.windGust ?? null,
                    threshold: activeRule.min_wind_gust_kph ?? null,
                    unit: 'kph',
                    format: (v: number) => `${Math.round(v)} kph`,
                  },
                ].map((metric) => {
                  const Icon = metric.icon;
                  const willTrigger = metric.threshold !== null && metric.current !== null && metric.current >= metric.threshold;
                  const hasData = metric.current !== null;
                  const tone = willTrigger
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : hasData
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-500';
                  return (
                    <div key={metric.label} className={`rounded-[20px] border px-3 py-3 ${tone}`}>
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                        <Icon className="h-3 w-3" />
                        {metric.label}
                      </div>
                      <p className="mt-1.5 text-base font-black">
                        {hasData ? metric.format(metric.current!) : 'No data'}
                      </p>
                      {metric.threshold !== null && (
                        <p className="mt-0.5 text-[10px] opacity-60">
                          Triggers at ≥ {metric.format(metric.threshold)}
                        </p>
                      )}
                      {willTrigger && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-rose-700">
                          <AlertCircle className="h-3 w-3" /> Threshold met
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Lead weather alert from same data source */}
              {liveWeather && liveWeather.alerts.length > 0 && (() => {
                const lead = liveWeather.alerts[0];
                const isWarning = lead.severity === 'warning';
                return (
                  <div className={`rounded-[18px] border px-3 py-3 ${
                    isWarning ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'
                  }`}>
                    <div className="flex items-start gap-2">
                      <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${isWarning ? 'text-rose-600' : 'text-amber-600'}`} />
                      <div>
                        <p className={`text-xs font-semibold ${isWarning ? 'text-rose-800' : 'text-amber-800'}`}>{lead.title}</p>
                        <p className="mt-0.5 text-[11px] leading-5 text-slate-600">{lead.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CivicPanel>
          )}

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
            event={selectedEvent}
            onClear={() => {
              setSelectedHousehold(null);
              setSelectedIncident(null);
              setSelectedEvent(null);
            }}
            onNavigateHousehold={navigateToHousehold}
            onNavigateIncident={navigateToIncident}
            onNavigateEvent={navigateToEvent}
          />

          <CivicPanel className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Purok Filters</p>
                <h3 className="mt-1 text-base font-black tracking-tight text-slate-950">Flood profile filters</h3>
                <p className="mt-1 text-sm text-slate-500">Map pins and priority check-ins update using the official purok flood profile.</p>
              </div>
              {hasPurokFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setFilterFloodProne('all');
                    setFilterFloodControlStatus('all');
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Flood-prone purok</span>
                <select
                  value={filterFloodProne}
                  onChange={(event) => setFilterFloodProne(event.target.value as PurokFloodProneFilter)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
                >
                  <option value="all">All puroks</option>
                  <option value="flood_prone">Flood-prone only</option>
                  <option value="not_flood_prone">Not flood-prone</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Flood control</span>
                <select
                  value={filterFloodControlStatus}
                  onChange={(event) => setFilterFloodControlStatus(event.target.value as PurokFloodControlStatus | 'all')}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
                >
                  <option value="all">All flood control statuses</option>
                  {PUROK_FLOOD_CONTROL_OPTIONS.map((status) => (
                    <option key={status} value={status}>{PUROK_FLOOD_CONTROL_STATUS_LABELS[status]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <CivicBadge label={`${filteredMapHouseholds.length} mapped households`} tone="emerald" />
              <CivicBadge label={`${filteredPriorityGroups.length} priority puroks`} tone="amber" />
              <CivicBadge label={`${filteredPriorityHouseholdCount} households queued`} tone="slate" />
              {filterFloodProne !== 'all' ? (
                <CivicBadge label={filterFloodProne === 'flood_prone' ? 'Flood-prone puroks' : 'Not flood-prone'} tone="rose" />
              ) : null}
              {filterFloodControlStatus !== 'all' ? (
                <CivicBadge label={PUROK_FLOOD_CONTROL_STATUS_LABELS[filterFloodControlStatus]} tone="slate" />
              ) : null}
            </div>
          </CivicPanel>

          <CivicPanel className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'incidents', label: 'Incidents', count: activeIncidents.length },
                { key: 'suggestions', label: 'Alert Suggestions', count: actionableAlertSuggestionCount },
                { key: 'priorities', label: 'Priority Queue', count: filteredPriorityGroups.length },
                { key: 'events', label: 'Events', count: events.length },
                { key: 'zones', label: 'Flood Zones', count: purokRiskProfiles.length },
              ] as const).map((tab) => (
                <CivicChipButton
                  key={tab.key}
                  active={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    tab.key === 'zones' && tab.count > 0
                      ? activeTab === tab.key
                        ? 'bg-rose-500/20 text-rose-200'
                        : 'bg-rose-100 text-rose-600'
                      : activeTab === tab.key
                        ? 'bg-white/12 text-white'
                        : 'bg-slate-100 text-slate-500'
                  }`}>
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
                      setSelectedEvent(null);
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
                            {incident.source === 'alert' && incident.context_snapshot ? (
                              <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2.5 text-[11px] leading-5 text-cyan-900">
                                <p className="font-bold uppercase tracking-[0.18em] text-cyan-700">Alert Context</p>
                                <p className="mt-1">
                                  {incident.context_snapshot.alert_title || incident.context_snapshot.trigger_reason || 'Alert-derived incident'}
                                </p>
                                {incident.context_snapshot.weather_summary ? (
                                  <p className="mt-1 text-cyan-800">Weather: {incident.context_snapshot.weather_summary}</p>
                                ) : null}
                                {incident.context_snapshot.flood_control_status ? (
                                  <p className="mt-1 text-cyan-800">
                                    Flood control: {PUROK_FLOOD_CONTROL_STATUS_LABELS[incident.context_snapshot.flood_control_status]}
                                  </p>
                                ) : null}
                                {incident.context_snapshot.default_evacuation_site ? (
                                  <p className="mt-1 text-cyan-800">
                                    Evacuation: {incident.context_snapshot.default_evacuation_site}
                                  </p>
                                ) : null}
                                {incident.context_snapshot.warning_notes ? (
                                  <p className="mt-1 text-cyan-800">{incident.context_snapshot.warning_notes}</p>
                                ) : null}
                              </div>
                            ) : null}
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

            {activeTab === 'suggestions' ? (
              <div className="space-y-3">
                {loading ? (
                  [...Array(3)].map((_, index) => (
                    <div key={index} className="h-32 animate-pulse rounded-[24px] bg-slate-100" />
                  ))
                ) : alertSuggestions.length > 0 ? (
                  alertSuggestions.map((suggestion) => {
                    const alreadyLinked = Boolean(suggestion.linkedIncident);
                    return (
                      <div
                        key={suggestion.id}
                        className={`rounded-[24px] border p-4 ${
                          alreadyLinked
                            ? 'border-slate-200 bg-slate-50/80'
                            : 'border-cyan-200/80 bg-white shadow-sm shadow-cyan-100/40'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-lg">
                            {INCIDENT_TYPE_ICONS[suggestion.payload.hazard] ?? '⚡'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <CivicBadge
                                label={`${HAZARD_LABELS[suggestion.payload.hazard]} ${suggestion.payload.severity}`}
                                tone={suggestion.payload.severity === 'warning' ? 'rose' : 'amber'}
                              />
                              <CivicBadge
                                label={alreadyLinked ? 'Linked to active incident' : 'Ready for confirmation'}
                                tone={alreadyLinked ? 'slate' : 'emerald'}
                              />
                            </div>
                            <p className="mt-2 text-sm font-bold text-slate-950">{suggestion.locationLabel}</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">{suggestion.payload.trigger_reason}</p>
                            {suggestion.payload.weather_summary ? (
                              <p className="mt-1 text-xs text-slate-500">Weather: {suggestion.payload.weather_summary}</p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {suggestion.payload.flood_control_status ? (
                                <CivicBadge
                                  label={PUROK_FLOOD_CONTROL_STATUS_LABELS[suggestion.payload.flood_control_status]}
                                  tone="slate"
                                  className="text-[10px]"
                                />
                              ) : null}
                              {suggestion.payload.default_evacuation_site ? (
                                <CivicBadge
                                  label={`Evacuation: ${suggestion.payload.default_evacuation_site}`}
                                  tone="emerald"
                                  className="text-[10px]"
                                />
                              ) : null}
                            </div>
                            <p className="mt-2 text-[11px] font-medium text-slate-400">{timeAgo(new Date(suggestion.payload.issued_at))}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={alreadyLinked || creatingFromAlertId === suggestion.id}
                            onClick={() => setSuggestionModal(suggestion)}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
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
                                setActiveTab('incidents');
                              }}
                              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                            >
                              View linked incident
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : alertRules.filter((r) => r.enabled).length > 0 ? (
                  /* Option D: show standby monitoring cards for each enabled rule */
                  <>
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Monitoring — no alert yet</p>
                      <p className="mt-1 text-xs text-slate-500">Weather hasn&apos;t crossed any threshold. Rules below are actively watching.</p>
                    </div>
                    {alertRules
                      .filter((r) => r.enabled)
                      .map((rule) => {
                        const barangayLabel = BARANGAY_OPTIONS.find((b) => b.id === rule.barangay_id)?.label ?? rule.barangay_id;
                        const locationLabel = rule.purok_sitio ? `${barangayLabel} · ${rule.purok_sitio}` : barangayLabel;
                        const lastTriggeredAgo = rule.last_triggered_at
                          ? timeAgo(new Date(rule.last_triggered_at))
                          : null;
                        return (
                          <div
                            key={rule.id}
                            className="rounded-[24px] border border-slate-200 bg-white p-4"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-lg">
                                {INCIDENT_TYPE_ICONS[rule.hazard] ?? '⚡'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <CivicBadge label={HAZARD_LABELS[rule.hazard]} tone="teal" />
                                  <CivicBadge label="Standby — no alert" tone="slate" />
                                </div>
                                <p className="mt-2 text-sm font-bold text-slate-950">{locationLabel}</p>
                                <p className="mt-1 text-xs text-slate-400">
                                  Cooldown {rule.cooldown_minutes} min
                                  {lastTriggeredAgo ? ` · Last triggered ${lastTriggeredAgo}` : ' · Never triggered'}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-400">
                                  Trigger point {rule.trigger_lat.toFixed(4)}, {rule.trigger_lng.toFixed(4)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                    <Siren className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">No alert rules configured</p>
                    <p className="mt-1 text-sm text-slate-500">Ask an admin to create automatic alert rules in the Alerts page.</p>
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === 'priorities' ? (
              <div className="space-y-3">
                {loading ? (
                  [...Array(4)].map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-[24px] bg-slate-100" />
                  ))
                ) : filteredPriorityGroups.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">No priority puroks</p>
                    <p className="mt-1 text-xs text-slate-500">Flood risk, vulnerability, and live alerts did not surface a queue right now.</p>
                  </div>
                ) : (
                  <>
                  {topPriorityGroup && topPriorityHousehold ? (() => {
                    const levelTone = topPriorityGroup.level === 'critical' ? 'rose' : topPriorityGroup.level === 'high' ? 'amber' : topPriorityGroup.level === 'medium' ? 'navy' : 'slate';
                    return (
                      <div className="rounded-[24px] border border-cyan-200 bg-cyan-50/60 px-4 py-4 shadow-sm shadow-cyan-100/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">Recommended first response</p>
                            <h4 className="mt-1 text-base font-black text-slate-950">{topPriorityGroup.purokSitio}</h4>
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
                          {topPriorityGroup.reasons.slice(0, 4).map((reason) => (
                            <CivicBadge key={reason} label={reason} tone="navy" className="text-[10px]" />
                          ))}
                          {topPriorityTags.slice(0, 4).map((tag) => (
                            <CivicBadge key={tag} label={tag} tone="rose" className="text-[10px]" />
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
                            className="rounded-full bg-cyan-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-900"
                          >
                            Inspect first household
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateToHousehold(topPriorityHousehold.household)}
                            className="rounded-full border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-50"
                          >
                            Navigate
                          </button>
                        </div>
                      </div>
                    );
                  })() : null}

                  {filteredPriorityGroups.map((group, index) => {
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
                        className="w-full cursor-pointer rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 text-left transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-900/20"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-100 text-xs font-black text-slate-600">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-950">{group.purokSitio}</p>
                                <p className="mt-1 truncate text-xs text-slate-500">{group.barangayLabel}</p>
                                <p className="mt-1 truncate text-xs font-semibold text-cyan-900">Unahon: {firstHousehold.household.head_name}</p>
                              </div>
                              <CivicBadge label={group.level.toUpperCase()} tone={levelTone} className="text-[10px]" />
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <CivicBadge label={group.floodProne ? 'Flood-prone purok' : 'Not flood-prone'} tone={group.floodProne ? 'rose' : 'emerald'} className="text-[10px]" />
                              <CivicBadge label={group.floodControlLabel} tone="slate" className="text-[10px]" />
                              <CivicBadge label={`${group.householdCount} households`} tone="slate" className="text-[10px]" />
                              <CivicBadge label={`${group.vulnerableResidentCount} vulnerable`} tone="rose" className="text-[10px]" />
                              <CivicBadge label={`Score ${group.score}`} tone="amber" className="text-[10px]" />
                              {group.reasons.slice(0, 4).map((reason) => (
                                <CivicBadge key={reason} label={reason} tone="navy" className="text-[10px]" />
                              ))}
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
                        {group.households.length > 0 ? (
                          <div className="mt-3 space-y-2 rounded-[18px] border border-slate-100 bg-slate-50/70 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Households to visit first</p>
                            {group.households.map((queuedHousehold, householdIndex) => {
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
                                  className={`w-full rounded-2xl border px-3 py-3 text-left transition hover:border-slate-300 ${
                                    queuedVisited ? 'border-emerald-200 bg-emerald-50' : 'border-white bg-white'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-black text-slate-500">
                                      {householdIndex + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-bold text-slate-950">{queuedHousehold.household.head_name}</span>
                                      <span className="mt-1 block truncate text-xs text-slate-500">{queuedHousehold.household.street_address}</span>
                                      <span className="mt-2 flex flex-wrap gap-1">
                                        {queuedTags.map((tag) => (
                                          <CivicBadge key={tag} label={tag} tone="rose" className="text-[10px]" />
                                        ))}
                                        <CivicBadge label={`Score ${queuedHousehold.score}`} tone="amber" className="text-[10px]" />
                                        {queuedVisited ? <CivicBadge label="Visited" tone="emerald" className="text-[10px]" /> : null}
                                      </span>
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  </>
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
                  events.map((event) => {
                    const selectEvent = () => {
                      setSelectedEvent(event);
                      setSelectedHousehold(null);
                      setSelectedIncident(null);
                    };
                    return (
                    <div
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={selectEvent}
                      onKeyDown={(keyboardEvent) => activateOnEnterOrSpace(keyboardEvent, selectEvent)}
                      className={`cursor-pointer rounded-[24px] border bg-white px-4 py-4 transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-900/20 ${
                        selectedEvent?.id === event.id ? 'border-violet-300 shadow-md' : 'border-slate-200/80'
                      }`}
                    >
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
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          navigateToEvent(event);
                        }}
                        className="mt-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        Navigate
                      </button>
                    </div>
                    );
                  })
                )}
              </div>
            ) : null}

            {activeTab === 'zones' ? (
              <div className="space-y-3">
                {loading ? (
                  [...Array(3)].map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
                  ))
                ) : purokRiskProfiles.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                    <ShieldAlert className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">No puroks configured</p>
                    <p className="mt-1 text-xs text-slate-500">Wait for puroks to be seeded or load households first.</p>
                  </div>
                ) : (
                  purokRiskProfiles
                    .sort((a, b) => {
                      if (a.flood_prone !== b.flood_prone) return a.flood_prone ? -1 : 1;
                      return a.purok_sitio.localeCompare(b.purok_sitio, undefined, { numeric: true });
                    })
                    .map((profile) => {
                      const houseCount = mapHouseholds.filter(
                        (h) => h.purok_sitio === profile.purok_sitio && h.status === 'active'
                      ).length;
                      const hasPinged = pingZones.has(profile.purok_sitio);
                      const isAtRisk = profile.flood_prone && liveWeather && (
                        (activeRule?.min_rain_chance !== undefined && (liveWeather.current.rainChance ?? 0) >= activeRule.min_rain_chance) ||
                        (activeRule?.min_wind_gust_kph !== undefined && (liveWeather.current.windGust ?? 0) >= activeRule.min_wind_gust_kph)
                      );
                      // Weather-based flood control suggestion
                      const rainIntensity = liveWeather?.current.rainIntensity ?? 0;
                      const rainChance = liveWeather?.current.rainChance ?? 0;
                      const weatherSuggestsRisk = profile.flood_prone && (rainIntensity >= 4 || rainChance >= 60);

                      return (
                        <div
                          key={profile.purok_sitio}
                          className={`rounded-[24px] border p-4 transition ${
                            isAtRisk
                              ? 'border-rose-300 bg-rose-50/80 shadow-sm shadow-rose-100'
                              : profile.flood_prone
                                ? 'border-amber-200/60 bg-amber-50/30'
                                : 'border-slate-200/80 bg-white'
                          }`}
                        >
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-sm font-black text-slate-950">{profile.purok_sitio}</p>
                                {isAtRisk && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                    <AlertCircle className="h-2.5 w-2.5" /> At risk
                                  </span>
                                )}
                                {weatherSuggestsRisk && !isAtRisk && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                    <CloudRain className="h-2.5 w-2.5" /> Rain detected
                                  </span>
                                )}
                                {hasPinged && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    <BellRing className="h-2.5 w-2.5" /> Pinged
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {PUROK_FLOOD_CONTROL_STATUS_LABELS[profile.flood_control_status]} · <span className="font-semibold text-slate-700">{houseCount} households</span>
                              </p>
                            </div>

                            {/* Flood control select — compact */}
                            <select
                              value={profile.flood_control_status}
                              disabled={updatingPurokStatus === profile.purok_sitio}
                              onChange={(e) => handlePurokStatusUpdate(profile, e.target.value as PurokFloodControlStatus)}
                              className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-cyan-900 disabled:opacity-60"
                            >
                              {PUROK_FLOOD_CONTROL_OPTIONS.map((s) => (
                                <option key={s} value={s}>{PUROK_FLOOD_CONTROL_STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </div>

                          {/* Warning notes */}
                          {profile.warning_notes && (
                            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800">
                              {profile.warning_notes}
                            </p>
                          )}

                          {/* Action row */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={houseCount === 0 || !profile.flood_prone}
                              onClick={() => setPingModal({ purok: profile, householdCount: houseCount })}
                              title={!profile.flood_prone ? 'Mark purok as flood-prone to enable ping' : undefined}
                              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold transition ${
                                hasPinged
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : isAtRisk
                                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                                    : 'bg-cyan-950 text-white hover:bg-cyan-900'
                              } disabled:cursor-not-allowed disabled:opacity-40`}
                            >
                              <BellRing className="h-3 w-3" />
                              {hasPinged ? 'Ping again' : 'Send Ping'}
                            </button>

                            <button
                              type="button"
                              disabled={updatingPurokStatus === profile.purok_sitio + '-toggle'}
                              onClick={() => handlePurokFloodProneToggle(profile)}
                              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition ${
                                profile.flood_prone
                                  ? 'border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-200'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              } disabled:opacity-60`}
                            >
                              <ShieldAlert className="h-3 w-3" />
                              {updatingPurokStatus === profile.purok_sitio + '-toggle'
                                ? '...'
                                : profile.flood_prone ? 'Flood-prone ✓' : 'Mark Prone'}
                            </button>

                            <button
                              type="button"
                              onClick={() => startEditingPurok(profile)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
                            >
                              <Edit2 className="h-3 w-3" />
                              Notes
                            </button>

                            {profile.default_evacuation_site && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-medium text-slate-500">
                                <MapPin className="h-3 w-3" />
                                {profile.default_evacuation_site}
                              </span>
                            )}
                          </div>

                          {/* Edit notes panel */}
                          {editingPurokId === profile.purok_sitio && purokEditForm ? (
                            <div className="mt-4 rounded-2xl bg-slate-50 p-4 border border-slate-100">
                              <div className="space-y-3">
                                <div>
                                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Default Evacuation Site</label>
                                  <input
                                    type="text"
                                    value={purokEditForm.default_evacuation_site}
                                    onChange={(e) => setPurokEditForm({ ...purokEditForm, default_evacuation_site: e.target.value })}
                                    className="w-full rounded-xl border-slate-200 px-3 py-2 text-sm focus:border-cyan-900 focus:ring-cyan-900"
                                    placeholder="e.g. Barangay Hall"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Warning Notes</label>
                                  <textarea
                                    value={purokEditForm.warning_notes}
                                    onChange={(e) => setPurokEditForm({ ...purokEditForm, warning_notes: e.target.value })}
                                    className="w-full rounded-xl border-slate-200 px-3 py-2 text-sm focus:border-cyan-900 focus:ring-cyan-900"
                                    rows={2}
                                    placeholder="e.g. Bridge overflow, avoid low crossing"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-bold text-slate-700">Flood Control Notes</label>
                                  <textarea
                                    value={purokEditForm.flood_control_notes}
                                    onChange={(e) => setPurokEditForm({ ...purokEditForm, flood_control_notes: e.target.value })}
                                    className="w-full rounded-xl border-slate-200 px-3 py-2 text-sm focus:border-cyan-900 focus:ring-cyan-900"
                                    rows={2}
                                    placeholder="e.g. Drainage cleared on May 1st"
                                  />
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSavePurokEdits(profile)}
                                    disabled={updatingPurokStatus === profile.purok_sitio + '-edit'}
                                    className="rounded-lg bg-cyan-950 px-4 py-2 text-[11px] font-bold text-white hover:bg-cyan-900 disabled:opacity-50"
                                  >
                                    {updatingPurokStatus === profile.purok_sitio + '-edit' ? 'Saving...' : 'Save Notes'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPurokId(null);
                                      setPurokEditForm(null);
                                    }}
                                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                )}
              </div>
            ) : null}
          </CivicPanel>
        </div>
      </aside>

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
                  Confirm this alert should become an operational incident. The record will stay linked to the original alert.
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
                  label={suggestionModal.payload.severity === 'warning' ? 'Suggested high severity' : 'Suggested medium severity'}
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
              {suggestionModal.payload.weather_summary ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Weather summary</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{suggestionModal.payload.weather_summary}</p>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Flood control</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {suggestionModal.payload.flood_control_status
                      ? PUROK_FLOOD_CONTROL_STATUS_LABELS[suggestionModal.payload.flood_control_status]
                      : 'No flood-control snapshot'}
                  </p>
                  {suggestionModal.payload.flood_control_notes ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">{suggestionModal.payload.flood_control_notes}</p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Evacuation / note</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {suggestionModal.payload.default_evacuation_site
                      ?? suggestionModal.payload.evacuation_site
                      ?? 'No evacuation site snapshot'}
                  </p>
                  {suggestionModal.payload.warning_notes ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">{suggestionModal.payload.warning_notes}</p>
                  ) : null}
                </div>
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
                    Confirm and create incident
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ping Confirmation Modal ─────────────────────────────── */}
      {pingModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={() => setPingModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-[32px] bg-white p-6 shadow-2xl sm:rounded-[32px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-rose-100">
                <BellRing className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-600">Emergency Ping</p>
                <h3 className="mt-0.5 text-xl font-black text-slate-950">{pingModal.purok.purok_sitio}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Sending location ping to{' '}
                  <span className="font-bold text-slate-900">{pingModal.householdCount} households</span> in this zone.
                </p>
              </div>
            </div>

            {/* Message preview */}
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Alert preview</p>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                <span className="font-bold">[MSWDO FIELD PING]</span> Responders are monitoring{' '}
                <span className="font-semibold">{pingModal.purok.purok_sitio}</span> due to flood risk.
                {pingModal.purok.warning_notes
                  ? ` ${pingModal.purok.warning_notes}`
                  : ' Please stay alert and avoid low-lying areas.'}
                {pingModal.purok.default_evacuation_site
                  ? ` Evacuation: ${pingModal.purok.default_evacuation_site}.`
                  : ''}
              </p>
            </div>

            {/* Live weather context if available */}
            {liveWeather && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                  <CloudRain className="h-3 w-3" />
                  Rain {Math.round(liveWeather.current.rainChance ?? 0)}%
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  <Wind className="h-3 w-3" />
                  Gusts {Math.round(liveWeather.current.windGust ?? 0)} kph
                </span>
              </div>
            )}

            {/* Actions */}
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
                  // Simulate send delay (replace with real SMS/push API call)
                  await new Promise((resolve) => setTimeout(resolve, 1400));
                  setPingZones((current) => new Set([...current, pingModal.purok.purok_sitio]));
                  setPingModal(null);
                  setIsSendingPing(false);
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3 text-sm font-bold text-white shadow-sm shadow-rose-200 hover:bg-rose-700 disabled:opacity-60 transition"
              >
                {isSendingPing ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <BellRing className="h-4 w-4" />
                    Send Ping Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="min-w-0 flex-1">
        <div className="flex h-full min-h-[720px] flex-col gap-4">
          <CivicPanel className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Map workspace</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Clean field map canvas</h2>
              <p className="mt-1 text-sm text-slate-500">Weather, basemap, and selected-item detail now stay in the operations rail.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CivicBadge label={`${filteredMapHouseholds.length} verified household pins`} tone="emerald" />
              <CivicBadge label={`${mappedEventCount} event pins`} tone="navy" />
              <CivicBadge label={`${visibleFloodZoneCount} response zones`} tone="amber" />
              <CivicBadge label={`${mapControls.activeBaseLayer.label} base`} tone="navy" />
              <CivicBadge
                label={mapControls.weatherOverlayVisible ? mapControls.activeLayerSummary : 'Weather hidden'}
                tone={mapControls.weatherOverlayVisible ? 'teal' : 'slate'}
              />
            </div>
          </CivicPanel>

          <div className="min-h-0 flex-1">
            <ResponderLeafletMap
              households={filteredMapHouseholds}
              incidents={incidents}
              events={events}
              purokRiskProfiles={purokRiskProfiles}
              alertRules={alertRules}
              selectedHousehold={selectedHousehold}
              onSelectHousehold={(household) => {
                setSelectedHousehold(household);
                if (household) {
                  setSelectedIncident(null);
                  setSelectedEvent(null);
                }
              }}
              selectedIncident={selectedIncident}
              onSelectIncident={(incident) => {
                setSelectedIncident(incident);
                if (incident) {
                  setSelectedHousehold(null);
                  setSelectedEvent(null);
                }
              }}
              selectedEvent={selectedEvent}
              onSelectEvent={(event) => {
                setSelectedEvent(event);
                if (event) {
                  setSelectedHousehold(null);
                  setSelectedIncident(null);
                }
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

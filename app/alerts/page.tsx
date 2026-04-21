'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CloudRain,
  Loader2,
  MapPin,
  Megaphone,
  PlayCircle,
  RefreshCw,
  Save,
  ShieldAlert,
  Wind,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import AppShell from '@/components/AppShell';
import { LocationPicker } from '@/components/LocationPicker';
import {
  CivicBadge,
  CivicEmptyState,
  CivicHero,
  CivicKpiCard,
  CivicPage,
  CivicPanel,
  CivicSectionHeading,
} from '@/components/ui/civic-primitives';
import {
  getDefaultRouteForUser,
  getCurrentUser,
} from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import {
  createDisasterAlertRule,
  getDisasterAlertRules,
  getDisasterAlerts,
  runDisasterAlertEvaluationNow,
  updateDisasterAlertRule,
} from '@/lib/db/disaster-alerts';
import { getLocationMasterList } from '@/lib/db/location-master';
import {
  getUserNotifications,
  markUserNotificationRead,
} from '@/lib/db/user-notifications';
import type {
  DisasterAlert,
  DisasterAlertRule,
  HazardType,
  Household,
  PurokFloodControlStatus,
  PurokRiskProfile,
  UserNotification,
} from '@/lib/db/schema';
import {
  BARANGAY_OPTIONS,
  MABINI_MUNICIPALITY,
} from '@/lib/barangays';
import {
  buildAffectedAreaLabel,
  DISASTER_ALERT_SEVERITY_LABELS,
  DISASTER_ALERT_TRIGGER_SOURCE_LABELS,
  HAZARD_LABELS,
  parseDisasterAlertNotification,
} from '@/lib/disaster-alerts';
import { PUROK_FLOOD_CONTROL_STATUS_LABELS } from '@/lib/purok-risk-profiles';
import { getAutomaticDisasterAlertThresholds } from '@/lib/disaster-alert-evaluation';
import type { FieldResponseWeatherPayload } from '@/lib/weather';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

const AUTOMATIC_RULE_HAZARDS: HazardType[] = ['flood', 'typhoon', 'landslide'];

type RuleCreateInput = Parameters<typeof createDisasterAlertRule>[0];
type RuleUpdateInput = Parameters<typeof updateDisasterAlertRule>[1];

type RuleFormState = {
  barangay_id: string;
  purok_sitio: string;
  hazard: HazardType;
  trigger_lat?: number;
  trigger_lng?: number;
  enabled: boolean;
  notify_responders: boolean;
  official_keywords: string;
  cooldown_minutes: string;
};

function createEmptyRuleForm(): RuleFormState {
  return {
    barangay_id: BARANGAY_OPTIONS[0]?.id ?? 'anitapan',
    purok_sitio: '',
    hazard: 'flood',
    trigger_lat: undefined,
    trigger_lng: undefined,
    enabled: true,
    notify_responders: true,
    official_keywords: '',
    cooldown_minutes: '180',
  };
}

function formatDateTime(value?: Date | string) {
  if (!value) {
    return 'Just now';
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatMetric(value: number | null | undefined, suffix: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return `${Number(value.toFixed(1))}${suffix}`;
}

function formatMetricOrFallback(value: number | null | undefined, suffix: string) {
  return formatMetric(value, suffix) ?? 'No data';
}

function buildAutomaticThresholdLabels(hazard: HazardType) {
  const thresholds = getAutomaticDisasterAlertThresholds(hazard);

  return [
    thresholds.minRainChance !== null ? `Rain chance >= ${formatMetric(thresholds.minRainChance, '%')}` : null,
    thresholds.minRainIntensity !== null ? `Rain intensity >= ${formatMetric(thresholds.minRainIntensity, ' mm/hr')}` : null,
    thresholds.minNextHourPrecip !== null ? `Next-hour rain >= ${formatMetric(thresholds.minNextHourPrecip, ' mm')}` : null,
    thresholds.minWindGust !== null ? `Wind gust >= ${formatMetric(thresholds.minWindGust, ' kph')}` : null,
  ].filter((value): value is string => Boolean(value));
}

function toOptionalTrimmedString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapRuleToForm(rule: DisasterAlertRule): RuleFormState {
  return {
    barangay_id: rule.barangay_id,
    purok_sitio: rule.purok_sitio ?? '',
    hazard: rule.hazard,
    trigger_lat: rule.trigger_lat,
    trigger_lng: rule.trigger_lng,
    enabled: rule.enabled,
    notify_responders: rule.notify_responders,
    official_keywords: (rule.official_keywords ?? []).join(', '),
    cooldown_minutes: rule.cooldown_minutes.toString(),
  };
}

function buildRuleInput(
  form: RuleFormState,
  coordinates: { trigger_lat: number; trigger_lng: number },
): RuleCreateInput & RuleUpdateInput {
  return {
    municipality: MABINI_MUNICIPALITY,
    barangay_id: form.barangay_id,
    purok_sitio: toOptionalTrimmedString(form.purok_sitio),
    hazard: form.hazard,
    trigger_lat: coordinates.trigger_lat,
    trigger_lng: coordinates.trigger_lng,
    enabled: form.enabled,
    notify_responders: form.notify_responders,
    official_keywords: form.official_keywords
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    min_rain_chance: undefined,
    min_rain_intensity_mm_per_hr: undefined,
    min_next_hour_precip_mm: undefined,
    min_wind_gust_kph: undefined,
    cooldown_minutes: toOptionalNumber(form.cooldown_minutes) ?? 180,
  };
}

export default function AlertsPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [rules, setRules] = useState<DisasterAlertRule[]>([]);
  const [alerts, setAlerts] = useState<DisasterAlert[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(createEmptyRuleForm);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [isRunningEvaluation, setIsRunningEvaluation] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [purokOptions, setPurokOptions] = useState<string[]>([]);
  const [lastRunSummary, setLastRunSummary] = useState<{
    evaluated_at?: string;
    emitted_count?: number;
    suppressed_count?: number;
    rule_count?: number;
  } | null>(null);
  const [weatherPreview, setWeatherPreview] = useState<FieldResponseWeatherPayload | null>(null);
  const [weatherPreviewError, setWeatherPreviewError] = useState<string | null>(null);
  const [isWeatherPreviewLoading, setIsWeatherPreviewLoading] = useState(false);
  const [weatherPreviewRefreshToken, setWeatherPreviewRefreshToken] = useState(0);
  const [households, setHouseholds] = useState<Household[]>([]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!['admin', 'responder'].includes(user.role)) {
      router.push(getDefaultRouteForUser(user));
      return;
    }

    const currentUser = user;
    let cancelled = false;

    async function loadData() {
      try {
        if (!cancelled) {
          setIsLoading(true);
        }

        const [nextRules, nextAlerts, nextNotifications, nextHouseholds] = await Promise.all([
          currentUser.role === 'admin' ? getDisasterAlertRules() : Promise.resolve([]),
          getDisasterAlerts(),
          getUserNotifications(),
          getHouseholds(),
        ]);

        if (!cancelled) {
          setRules(nextRules);
          setAlerts(nextAlerts);
          setNotifications(nextNotifications.filter((notification) => notification.type === 'disaster_alert'));
          setHouseholds(nextHouseholds);
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to load disaster alert data.',
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (!['disaster_alert_rules', 'disaster_alerts', 'user_notifications', 'location_master_lists'].includes(event.detail.table)) {
        return;
      }

      void loadData();
    }

    void loadData();
    window.addEventListener('mswdo-data-changed', handleDataChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [router, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadPurokOptions() {
      try {
        const masterList = await getLocationMasterList(ruleForm.barangay_id);
        if (!cancelled) {
          const loadedPuroks = masterList?.puroks ?? [];
          setPurokOptions(loadedPuroks);
        }
      } catch {
        if (!cancelled) {
          setPurokOptions([]);
        }
      }
    }

    void loadPurokOptions();

    return () => {
      cancelled = true;
    };
  }, [ruleForm.barangay_id]);

  const notificationByAlertId = useMemo(() => {
    const map = new Map<string, UserNotification>();

    notifications.forEach((notification) => {
      const payload = parseDisasterAlertNotification(notification);
      if (!payload?.alert_id) {
        return;
      }

      if (!map.has(payload.alert_id)) {
        map.set(payload.alert_id, notification);
      }
    });

    return map;
  }, [notifications]);

  const unreadAlertCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  );
  const hasTriggerPoint = ruleForm.trigger_lat !== undefined && ruleForm.trigger_lng !== undefined;
  const automaticThresholdLabels = useMemo(
    () => buildAutomaticThresholdLabels(ruleForm.hazard),
    [ruleForm.hazard],
  );

  useEffect(() => {
    const triggerLat = ruleForm.trigger_lat;
    const triggerLng = ruleForm.trigger_lng;
    const requestUrl = triggerLat !== undefined && triggerLng !== undefined
      ? `/api/weather?lat=${encodeURIComponent(triggerLat.toString())}&lng=${encodeURIComponent(triggerLng.toString())}`
      : '/api/weather';
    const controller = new AbortController();
    let cancelled = false;

    async function loadWeatherPreview() {
      try {
        setIsWeatherPreviewLoading(true);
        setWeatherPreviewError(null);

        const response = await fetch(requestUrl, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null) as
          | ({ error?: string } & Partial<FieldResponseWeatherPayload>)
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || `Failed to sample field response weather (${response.status}).`);
        }

        if (!cancelled) {
          setWeatherPreview(payload as FieldResponseWeatherPayload);
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setWeatherPreview(null);
        setWeatherPreviewError(
          error instanceof Error
            ? error.message
            : 'Failed to load the field response weather sample.',
        );
      } finally {
        if (!cancelled) {
          setIsWeatherPreviewLoading(false);
        }
      }
    }

    void loadWeatherPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ruleForm.trigger_lat, ruleForm.trigger_lng, weatherPreviewRefreshToken]);

  async function refreshData() {
    if (!user || !['admin', 'responder'].includes(user.role)) {
      return;
    }

    const currentUser = user;
    const [nextRules, nextAlerts, nextNotifications, nextHouseholds] = await Promise.all([
      currentUser.role === 'admin' ? getDisasterAlertRules() : Promise.resolve([]),
      getDisasterAlerts(),
      getUserNotifications(),
      getHouseholds(),
    ]);

    setRules(nextRules);
    setAlerts(nextAlerts);
    setNotifications(nextNotifications.filter((notification) => notification.type === 'disaster_alert'));
    setHouseholds(nextHouseholds);
  }

  function resetRuleForm() {
    setEditingRuleId(null);
    setRuleForm(createEmptyRuleForm());
  }

  async function handleRuleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ruleForm.trigger_lat === undefined || ruleForm.trigger_lng === undefined) {
      setFeedback({ type: 'error', message: 'Pick a trigger location on the map before saving the rule.' });
      return;
    }

    try {
      setIsSavingRule(true);
      setFeedback(null);
      const triggerLat: number = ruleForm.trigger_lat;
      const triggerLng: number = ruleForm.trigger_lng;
      const coordinates = {
        trigger_lat: triggerLat,
        trigger_lng: triggerLng,
      };
      const ruleInput = buildRuleInput(ruleForm, coordinates);

      if (editingRuleId) {
        await updateDisasterAlertRule(editingRuleId, ruleInput);
        setFeedback({ type: 'success', message: 'Disaster alert rule updated.' });
      } else {
        await createDisasterAlertRule(ruleInput);
        setFeedback({ type: 'success', message: 'Disaster alert rule created.' });
      }

      resetRuleForm();
      await refreshData();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save the disaster alert rule.',
      });
    } finally {
      setIsSavingRule(false);
    }
  }

  async function handleRunEvaluation() {
    try {
      setIsRunningEvaluation(true);
      setFeedback(null);
      const result = await runDisasterAlertEvaluationNow() as {
        evaluated_at?: string;
        emitted_count?: number;
        suppressed_count?: number;
        rule_count?: number;
      };
      setLastRunSummary(result);
      setFeedback({
        type: 'success',
        message: `Evaluation complete. ${result.emitted_count ?? 0} alert(s) emitted.`,
      });
      await refreshData();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to run automatic disaster alert evaluation.',
      });
    } finally {
      setIsRunningEvaluation(false);
    }
  }

  async function handleMarkRead(notification: UserNotification) {
    try {
      setMarkingNotificationId(notification.id);
      const updated = await markUserNotificationRead(notification.id);
      setNotifications((current) => current.map((entry) => (
        entry.id === updated.id ? updated : entry
      )));
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to mark alert copy as read.',
      });
    } finally {
      setMarkingNotificationId(null);
    }
  }

  if (!user || !['admin', 'responder'].includes(user.role)) {
    return null;
  }

  return (
    <AppShell title="Alerts">
      <CivicPage className="space-y-6">
        <CivicHero
          eyebrow="Mabini Automatic Alerts"
          title="Disaster Alerts"
          description="Automatic, Mabini-only household disaster alerts powered by weather checks every five minutes. Households receive the alert first, and responder copy stays optional per rule."
          aside={<CivicBadge label={MABINI_MUNICIPALITY} tone="teal" />}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CivicKpiCard label="Sent Alerts" value={alerts.length} hint="Automatic alert history stored for Mabini only." icon={ShieldAlert} tone="navy" />
          <CivicKpiCard label="Unread Copies" value={unreadAlertCount} hint="Responder and admin awareness copies still use the inbox read state." icon={Bell} tone={unreadAlertCount > 0 ? 'amber' : 'emerald'} />
          <CivicKpiCard label="Active Rules" value={rules.filter((rule) => rule.enabled).length} hint="Only admins can manage automatic rule settings." icon={MapPin} tone="teal" />
          <CivicKpiCard label="Responder Copy" value={rules.filter((rule) => rule.notify_responders).length} hint="Households still receive alerts even if this is off." icon={Bell} tone="slate" />
        </div>

        {feedback ? (
          <div className={`rounded-[24px] border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}>
            {feedback.message}
          </div>
        ) : null}

        {user.role === 'admin' ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <CivicPanel className="sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <CivicSectionHeading
                  icon={MapPin}
                  title={editingRuleId ? 'Edit Automatic Rule' : 'New Automatic Rule'}
                  description="Each rule is scoped to one Mabini barangay, with an optional purok and automatic field-response weather triggers."
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetRuleForm();
                      setFeedback(null);
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    New rule
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleRunEvaluation(); }}
                    disabled={isRunningEvaluation}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-cyan-950 px-4 text-sm font-semibold text-white hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRunningEvaluation ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    {isRunningEvaluation ? 'Running...' : 'Run evaluation now'}
                  </button>
                </div>
              </div>

              {lastRunSummary ? (
                <div className="mt-5 rounded-[24px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
                  <p className="font-semibold">Latest test run</p>
                  <p className="mt-1">
                    {lastRunSummary.emitted_count ?? 0} emitted, {lastRunSummary.suppressed_count ?? 0} suppressed across {lastRunSummary.rule_count ?? 0} rule(s) at {formatDateTime(lastRunSummary.evaluated_at)}.
                  </p>
                </div>
              ) : null}

              <form onSubmit={handleRuleSubmit} className="mt-6 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Municipality</label>
                    <input
                      value={MABINI_MUNICIPALITY}
                      readOnly
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Barangay</label>
                    <select
                      value={ruleForm.barangay_id}
                      onChange={(event) => setRuleForm((current) => ({ ...current, barangay_id: event.target.value }))}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
                    >
                      {BARANGAY_OPTIONS.map((barangay) => (
                        <option key={barangay.id} value={barangay.id}>{barangay.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Purok / Sitio</label>
                    <input
                      list="alert-rule-purok-options"
                      value={ruleForm.purok_sitio}
                      onChange={(event) => setRuleForm((current) => ({ ...current, purok_sitio: event.target.value }))}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
                      placeholder="Optional scoped purok"
                    />
                    <datalist id="alert-rule-purok-options">
                      {purokOptions.map((purok) => (
                        <option key={purok} value={purok} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Hazard</label>
                    <select
                      value={ruleForm.hazard}
                      onChange={(event) => setRuleForm((current) => ({ ...current, hazard: event.target.value as HazardType }))}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
                    >
                      {AUTOMATIC_RULE_HAZARDS.map((hazard) => (
                        <option key={hazard} value={hazard}>{HAZARD_LABELS[hazard]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Official alert keywords</label>
                    <input
                      value={ruleForm.official_keywords}
                      onChange={(event) => setRuleForm((current) => ({ ...current, official_keywords: event.target.value }))}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
                      placeholder="Comma-separated keywords, e.g. flood, heavy rain, gale"
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-cyan-200 bg-cyan-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-cyan-950">Automatic field response trigger</p>
                      <p className="mt-1 text-xs leading-5 text-cyan-900">
                        This rule reads the same rain, next-hour precipitation, wind, and advisory details shown in Field Response.
                        You no longer need to type rain thresholds manually.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWeatherPreviewRefreshToken((current) => current + 1)}
                      disabled={isWeatherPreviewLoading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-cyan-200 bg-white px-4 text-sm font-semibold text-cyan-950 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${isWeatherPreviewLoading ? 'animate-spin' : ''}`} />
                      Refresh sample
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <CivicBadge label={`${HAZARD_LABELS[ruleForm.hazard]} auto trigger`} tone="teal" />
                    {automaticThresholdLabels.map((label) => (
                      <CivicBadge key={label} label={label} tone="slate" />
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Cooldown minutes</label>
                      <input
                        type="number"
                        min="30"
                        step="1"
                        value={ruleForm.cooldown_minutes}
                        onChange={(event) => setRuleForm((current) => ({ ...current, cooldown_minutes: event.target.value }))}
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
                      />
                    </div>

                    <div className="rounded-[22px] border border-cyan-100 bg-white px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <CloudRain className="h-4 w-4 text-cyan-900" />
                        Rain chance
                      </div>
                      <p className="mt-3 text-lg font-black tracking-tight text-slate-950">
                        {weatherPreview ? formatMetricOrFallback(weatherPreview.current.rainChance, '%') : 'No data'}
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-cyan-100 bg-white px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <CloudRain className="h-4 w-4 text-cyan-900" />
                        Rain intensity
                      </div>
                      <p className="mt-3 text-lg font-black tracking-tight text-slate-950">
                        {weatherPreview ? formatMetricOrFallback(weatherPreview.current.rainIntensity, ' mm/hr') : 'No data'}
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-cyan-100 bg-white px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <CloudRain className="h-4 w-4 text-cyan-900" />
                        Next-hour rain
                      </div>
                      <p className="mt-3 text-lg font-black tracking-tight text-slate-950">
                        {weatherPreview ? formatMetricOrFallback(weatherPreview.current.nextHourPrecipitationPeak, ' mm') : 'No data'}
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-cyan-100 bg-white px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <Wind className="h-4 w-4 text-cyan-900" />
                        Wind gust
                      </div>
                      <p className="mt-3 text-lg font-black tracking-tight text-slate-950">
                        {weatherPreview ? formatMetricOrFallback(weatherPreview.current.windGust, ' kph') : 'No data'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[22px] border border-cyan-100 bg-white px-4 py-3 text-sm text-slate-700">
                    {isWeatherPreviewLoading ? (
                      <p>Loading live Field Response weather sample...</p>
                    ) : weatherPreviewError ? (
                      <p className="text-rose-700">{weatherPreviewError}</p>
                    ) : weatherPreview ? (
                      <>
                        <p className="font-semibold text-slate-950">{weatherPreview.summary || 'Live field response sample loaded.'}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Sample updated {formatDateTime(weatherPreview.generatedAt)} for {weatherPreview.location.name || (hasTriggerPoint ? 'selected trigger point' : 'the shared Field Response point')}.
                        </p>
                        {!hasTriggerPoint ? (
                          <p className="mt-2 text-xs text-cyan-900">
                            Showing the shared Field Response weather sample. Pick a trigger map point below to lock this rule to a specific barangay location.
                          </p>
                        ) : null}
                        {weatherPreview.alerts.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {weatherPreview.alerts.slice(0, 4).map((alert) => (
                              <CivicBadge
                                key={`${alert.source}-${alert.title}`}
                                label={alert.title}
                                tone={alert.source === 'official' ? 'amber' : 'teal'}
                              />
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p>No field response sample loaded yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Trigger map point</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Pick the weather sampling point used for this Mabini alert rule.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-white px-2.5 py-1">
                        Lat: {ruleForm.trigger_lat?.toFixed(5) ?? 'Not set'}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1">
                        Lng: {ruleForm.trigger_lng?.toFixed(5) ?? 'Not set'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <LocationPicker
                      lat={ruleForm.trigger_lat}
                      lng={ruleForm.trigger_lng}
                      defaultAddress={`${MABINI_MUNICIPALITY}, Davao de Oro`}
                      onChange={(lat, lng) => setRuleForm((current) => ({
                        ...current,
                        trigger_lat: lat,
                        trigger_lng: lng,
                      }))}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={ruleForm.enabled}
                      onChange={(event) => setRuleForm((current) => ({ ...current, enabled: event.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">Rule enabled</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Disabled rules stay saved but are skipped by the 5-minute evaluator.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={ruleForm.notify_responders}
                      onChange={(event) => setRuleForm((current) => ({ ...current, notify_responders: event.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">Notify responders and admins</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Optional awareness copy only. Households still receive the alert even when this is off.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={isSavingRule}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-cyan-950 px-5 text-sm font-semibold text-white hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSavingRule ? 'Saving...' : editingRuleId ? 'Update rule' : 'Save rule'}
                  </button>
                  {editingRuleId ? (
                    <button
                      type="button"
                      onClick={resetRuleForm}
                      className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>
            </CivicPanel>

            <CivicPanel className="sm:p-6">
              <CivicSectionHeading
                icon={Bell}
                title="Saved Rules"
                description="Rule editing is admin-only and permanently scoped to Mabini, Davao de Oro."
              />

              {isLoading ? (
                <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                  <p className="mt-3">Loading automatic rules...</p>
                </div>
              ) : rules.length > 0 ? (
                <div className="mt-6 space-y-3">
                  {rules.map((rule) => (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => {
                        setEditingRuleId(rule.id);
                        setRuleForm(mapRuleToForm(rule));
                        setFeedback(null);
                      }}
                      className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                        editingRuleId === rule.id
                          ? 'border-cyan-300 bg-cyan-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {HAZARD_LABELS[rule.hazard]} · {BARANGAY_OPTIONS.find((barangay) => barangay.id === rule.barangay_id)?.label ?? rule.barangay_id}
                          {rule.purok_sitio ? ` · ${rule.purok_sitio}` : ''}
                        </p>
                        <CivicBadge label={rule.enabled ? 'Enabled' : 'Disabled'} tone={rule.enabled ? 'emerald' : 'slate'} />
                        <CivicBadge label={rule.notify_responders ? 'Responder copy on' : 'Responder copy off'} tone={rule.notify_responders ? 'amber' : 'slate'} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Trigger point {rule.trigger_lat.toFixed(5)}, {rule.trigger_lng.toFixed(5)} · Cooldown {rule.cooldown_minutes} minutes
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <CivicBadge label="Automatic field response feed" tone="teal" />
                        {buildAutomaticThresholdLabels(rule.hazard).map((label) => (
                          <CivicBadge key={`${rule.id}-${label}`} label={label} tone="slate" />
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Last triggered {rule.last_triggered_at ? formatDateTime(rule.last_triggered_at) : 'Never'}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <CivicEmptyState
                    icon={MapPin}
                    title="No rules yet"
                    description="Create the first Mabini automatic alert rule to start evaluating live Field Response weather."
                  />
                </div>
              )}
            </CivicPanel>
          </div>
        ) : null}

        <CivicPanel className="sm:p-6">
          <CivicSectionHeading
            icon={ShieldAlert}
            title="Sent Alert History"
            description="Automatic alert records show the affected Mabini area, trigger basis, weather summary, and how many households were reachable in-app."
          />

          {isLoading ? (
            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
              <p className="mt-3">Loading sent alerts...</p>
            </div>
          ) : alerts.length > 0 ? (
            <div className="mt-6 space-y-4">
              {alerts.map((alert) => {
                const notification = notificationByAlertId.get(alert.id);
                const alertPayload = notification ? parseDisasterAlertNotification(notification) : null;
                const affectedArea = buildAffectedAreaLabel({
                  barangay_id: alert.barangay_id,
                  purok_sitio: alert.purok_sitio,
                  municipality: alert.municipality,
                });

                return (
                  <div key={alert.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.2)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-bold text-slate-950">{alert.title}</h2>
                          <CivicBadge label={HAZARD_LABELS[alert.hazard]} tone="teal" />
                          <CivicBadge label={DISASTER_ALERT_SEVERITY_LABELS[alert.severity]} tone={alert.severity === 'warning' ? 'rose' : 'amber'} />
                          <CivicBadge label={DISASTER_ALERT_TRIGGER_SOURCE_LABELS[alert.trigger_source]} tone="slate" />
                          <CivicBadge label={alert.notify_responders ? 'Responder copy on' : 'Responder copy off'} tone={alert.notify_responders ? 'amber' : 'slate'} />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{alert.message}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <CivicBadge label={affectedArea || 'Mabini, Davao de Oro'} tone="slate" />
                          <CivicBadge label={`Issued ${formatDateTime(alert.issued_at)}`} tone="slate" />
                          <CivicBadge label={`${alert.reachable_household_count} reachable`} tone="emerald" />
                          <CivicBadge label={`${alert.unreachable_household_count} unreachable`} tone={alert.unreachable_household_count > 0 ? 'amber' : 'slate'} />
                          {notification ? (
                            <CivicBadge label={notification.read_at ? 'Awareness copy read' : 'Awareness copy unread'} tone={notification.read_at ? 'emerald' : 'amber'} />
                          ) : (
                            <CivicBadge label="No inbox copy for this account" tone="slate" />
                          )}
                        </div>
                      </div>

                      {notification && !notification.read_at ? (
                        <button
                          type="button"
                          onClick={() => { void handleMarkRead(notification); }}
                          disabled={markingNotificationId === notification.id}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {markingNotificationId === notification.id ? 'Saving...' : 'Mark read'}
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-3 lg:grid-cols-3">
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Trigger Reason</p>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{alert.trigger_reason}</p>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Weather Summary</p>
                        <p className="mt-3 text-sm font-semibold text-slate-900">{alert.weather_snapshot.summary || 'No summary recorded'}</p>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Weather Metrics</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {formatMetric(alert.weather_snapshot.rain_chance, '%') ? (
                            <CivicBadge label={`Rain chance ${formatMetric(alert.weather_snapshot.rain_chance, '%')}`} tone="slate" />
                          ) : null}
                          {formatMetric(alert.weather_snapshot.rain_intensity_mm_per_hr, ' mm/hr') ? (
                            <CivicBadge label={`Rain intensity ${formatMetric(alert.weather_snapshot.rain_intensity_mm_per_hr, ' mm/hr')}`} tone="slate" />
                          ) : null}
                          {formatMetric(alert.weather_snapshot.next_hour_precip_mm, ' mm') ? (
                            <CivicBadge label={`Next hour ${formatMetric(alert.weather_snapshot.next_hour_precip_mm, ' mm')}`} tone="slate" />
                          ) : null}
                          {formatMetric(alert.weather_snapshot.wind_gust_kph, ' kph') ? (
                            <CivicBadge label={`Wind gust ${formatMetric(alert.weather_snapshot.wind_gust_kph, ' kph')}`} tone="slate" />
                          ) : null}
                          {!formatMetric(alert.weather_snapshot.rain_chance, '%')
                          && !formatMetric(alert.weather_snapshot.rain_intensity_mm_per_hr, ' mm/hr')
                          && !formatMetric(alert.weather_snapshot.next_hour_precip_mm, ' mm')
                          && !formatMetric(alert.weather_snapshot.wind_gust_kph, ' kph') ? (
                            <span className="text-sm text-slate-500">No weather metrics recorded.</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {alert.weather_snapshot.official_alert_titles?.length > 0 ? (
                      <div className="mt-4 rounded-[22px] border border-cyan-200 bg-cyan-50 px-4 py-3">
                        <p className="text-sm font-semibold text-cyan-950">Matched official advisories</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {alert.weather_snapshot.official_alert_titles.map((title) => (
                            <CivicBadge key={title} label={title} tone="teal" />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {alertPayload?.evacuation_site?.trim()
                    || alertPayload?.special_assistance_notes?.trim()
                    || alertPayload?.flood_control_status
                    || alertPayload?.default_evacuation_site?.trim()
                    || alertPayload?.warning_notes?.trim() ? (
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {alertPayload?.evacuation_site?.trim() ? (
                          <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            <p className="font-semibold">Evacuation site</p>
                            <p className="mt-1">{alertPayload.evacuation_site.trim()}</p>
                          </div>
                        ) : null}
                        {alertPayload?.default_evacuation_site?.trim() ? (
                          <div className="rounded-[22px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
                            <p className="font-semibold">Default purok evacuation site</p>
                            <p className="mt-1">{alertPayload.default_evacuation_site.trim()}</p>
                          </div>
                        ) : null}
                        {alertPayload?.flood_control_status ? (
                          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p className="font-semibold text-slate-900">Flood control status</p>
                            <p className="mt-1">{PUROK_FLOOD_CONTROL_STATUS_LABELS[alertPayload.flood_control_status]}</p>
                            {alertPayload.flood_control_notes?.trim() ? (
                              <p className="mt-2 text-slate-600">{alertPayload.flood_control_notes.trim()}</p>
                            ) : null}
                          </div>
                        ) : null}
                        {alertPayload?.warning_notes?.trim() ? (
                          <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                            <p className="font-semibold">Purok warning notes</p>
                            <p className="mt-1">{alertPayload.warning_notes.trim()}</p>
                          </div>
                        ) : null}
                        {alertPayload?.special_assistance_notes?.trim() ? (
                          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            <p className="font-semibold">Special assistance notes</p>
                            <p className="mt-1">{alertPayload.special_assistance_notes.trim()}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6">
              <CivicEmptyState
                icon={ShieldAlert}
                title="No automatic alerts sent yet"
                description="Saved Mabini rules will start filling this history after the evaluation route emits the first alert."
              />
            </div>
          )}
        </CivicPanel>

      </CivicPage>
    </AppShell>
  );
}

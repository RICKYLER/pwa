'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CloudRain,
  Flame,
  Info,
  Layers,
  Loader2,
  MapPin,
  Megaphone,
  PlayCircle,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Wind,
  X,
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
  CivicPage,
} from '@/components/ui/civic-primitives';
import {
  getDefaultRouteForUser,
  getCurrentUser,
} from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import {
  createDisasterAlertRule,
  deleteDisasterAlertRule,
  getDisasterAlertRules,
  getDisasterAlerts,
  runDisasterAlertEvaluationNow,
  updateDisasterAlertRule,
} from '@/lib/db/disaster-alerts';
import { PurokSelectField } from '@/components/forms/PurokSelectField';
import {
  getUserNotifications,
  markUserNotificationRead,
} from '@/lib/db/user-notifications';
import type {
  DisasterAlert,
  DisasterAlertRule,
  HazardType,
  Household,
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

function formatRoundedMetricOrFallback(value: number | null | undefined, suffix: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'No data';
  }

  return `${Math.round(value)}${suffix}`;
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
  const [activeTab, setActiveTab] = useState<'broadcasts' | 'rules'>('broadcasts');
  const [searchFilter, setSearchFilter] = useState('');

  // Rule configuration modal state
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(createEmptyRuleForm);
  const [isSavingRule, setIsSavingRule] = useState(false);

  const [isRunningEvaluation, setIsRunningEvaluation] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<DisasterAlertRule | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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

        const payload = (await response.json().catch(() => null)) as
          | ({ error?: string } & Partial<FieldResponseWeatherPayload>)
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || `Failed to refresh field response weather (${response.status}).`);
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
            : 'Failed to load live field response weather.',
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
    setIsRuleModalOpen(false);
  }

  function openCreateRule() {
    resetRuleForm();
    setIsRuleModalOpen(true);
    setFeedback(null);
  }

  function openEditRule(rule: DisasterAlertRule) {
    setEditingRuleId(rule.id);
    setRuleForm(mapRuleToForm(rule));
    setIsRuleModalOpen(true);
    setFeedback(null);
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
      const result = (await runDisasterAlertEvaluationNow()) as {
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
      setNotifications((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to mark alert copy as read.',
      });
    } finally {
      setMarkingNotificationId(null);
    }
  }

  async function handleDeleteRule(rule: DisasterAlertRule) {
    try {
      setIsDeletingRule(true);
      setFeedback(null);
      await deleteDisasterAlertRule(rule.id);
      setConfirmDeleteRule(null);
      if (editingRuleId === rule.id) {
        resetRuleForm();
      }
      setFeedback({ type: 'success', message: 'Alert rule deleted.' });
      await refreshData();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete the alert rule.',
      });
    } finally {
      setIsDeletingRule(false);
    }
  }

  if (!user || !['admin', 'responder'].includes(user.role)) {
    return null;
  }

  const enabledRulesCount = rules.filter((r) => r.enabled).length;
  const responderNotifCount = rules.filter((r) => r.notify_responders).length;

  // Filtered alerts
  const filteredAlerts = alerts.filter((alert) => {
    if (!searchFilter) return true;
    const query = searchFilter.toLowerCase().trim();
    return (
      alert.title.toLowerCase().includes(query) ||
      alert.message.toLowerCase().includes(query) ||
      alert.barangay_id.toLowerCase().includes(query) ||
      (alert.purok_sitio && alert.purok_sitio.toLowerCase().includes(query)) ||
      alert.hazard.toLowerCase().includes(query)
    );
  });

  // Filtered rules
  const filteredRules = rules.filter((rule) => {
    if (!searchFilter) return true;
    const query = searchFilter.toLowerCase().trim();
    const barangayLabel = BARANGAY_OPTIONS.find((b) => b.id === rule.barangay_id)?.label ?? rule.barangay_id;
    return (
      barangayLabel.toLowerCase().includes(query) ||
      (rule.purok_sitio && rule.purok_sitio.toLowerCase().includes(query)) ||
      rule.hazard.toLowerCase().includes(query)
    );
  });

  return (
    <AppShell title="Alerts">
      <CivicPage className="space-y-6">
        {/* ── Top EOC Command Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-900 border border-cyan-200/60">
                <Radio className="h-3.5 w-3.5 text-cyan-700 animate-pulse" />
                Mabini MDRRMO • Early Warning Console
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                5-Min Weather Polling Active
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Disaster Alerts
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Automatic municipal disaster warning broadcast system powered by live PAGASA and field telemetry.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Evaluation Trigger Button */}
            <button
              type="button"
              onClick={() => { void handleRunEvaluation(); }}
              disabled={isRunningEvaluation}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunningEvaluation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 text-cyan-300" />
              )}
              {isRunningEvaluation ? 'Checking live telemetry...' : 'Check alerts now'}
            </button>
          </div>
        </div>

        {/* ── Executive Telemetry & Vitals Strip ── */}
        <div className="grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-y-0 sm:divide-x divide-slate-200/80 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
          {/* Total Broadcasts */}
          <button
            type="button"
            onClick={() => setActiveTab('broadcasts')}
            className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
              activeTab === 'broadcasts' ? 'bg-cyan-50/60 ring-1 ring-cyan-600' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-2 text-slate-500">
              <Megaphone className="h-4 w-4 text-cyan-900" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Dispatched Alerts</span>
            </div>
            <span className="mt-2 text-2xl font-black tracking-tight text-slate-950 font-mono">
              {isLoading ? '—' : alerts.length}
            </span>
            <span className="mt-0.5 text-[11px] text-cyan-900 font-semibold">
              Emergency broadcasts issued
            </span>
          </button>

          {/* Active Rules Coverage */}
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
              activeTab === 'rules' ? 'bg-emerald-50/60 ring-1 ring-emerald-500' : 'hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center gap-2 text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Active Rule Coverage</span>
            </div>
            <span className="mt-2 text-2xl font-black tracking-tight text-emerald-950 font-mono">
              {isLoading ? '—' : `${enabledRulesCount} / ${rules.length}`}
            </span>
            <span className="mt-0.5 text-[11px] text-emerald-700">
              {enabledRulesCount === rules.length ? '100% monitoring active' : 'Some rules paused'}
            </span>
          </button>

          {/* Reachable Households */}
          <div className="flex flex-col items-start p-3.5 text-left rounded-xl">
            <div className="flex items-center gap-2 text-slate-500">
              <Users className="h-4 w-4 text-cyan-700" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Registered Households</span>
            </div>
            <span className="mt-2 text-2xl font-black tracking-tight text-slate-950 font-mono">
              {isLoading ? '—' : households.length}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-500">
              Targeted in emergency radius
            </span>
          </div>

          {/* Responder Awareness */}
          <div className="flex flex-col items-start p-3.5 text-left rounded-xl">
            <div className="flex items-center gap-2 text-slate-500">
              <Bell className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Responder Copies</span>
            </div>
            <span className="mt-2 text-2xl font-black tracking-tight text-slate-950 font-mono">
              {isLoading ? '—' : responderNotifCount}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-500">
              Rules notify field staff
            </span>
          </div>
        </div>

        {/* ── Feedback Message Banner ── */}
        {feedback ? (
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* ── Latest Live Evaluation Report (if triggered) ── */}
        {lastRunSummary ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-5 py-3.5 text-sm text-cyan-950 shadow-sm">
            <div className="flex items-center gap-3">
              <Radio className="h-5 w-5 text-cyan-700 animate-pulse shrink-0" />
              <div>
                <p className="font-bold">Telemetry Evaluation Result</p>
                <p className="text-xs text-cyan-900 mt-0.5">
                  {lastRunSummary.emitted_count ?? 0} alert(s) emitted, {lastRunSummary.suppressed_count ?? 0} suppressed across {lastRunSummary.rule_count ?? 0} rule(s) at {formatDateTime(lastRunSummary.evaluated_at)}.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-cyan-900 border border-cyan-200">
              Status: Verified
            </span>
          </div>
        ) : null}

        {/* ── Tabbed Console Controls: [Dispatched Broadcasts] vs [Monitoring Rules] ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
          {/* Main Tab Switcher */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setActiveTab('broadcasts'); setSearchFilter(''); }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                activeTab === 'broadcasts'
                  ? 'bg-cyan-950 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              <Megaphone className="h-4 w-4" />
              <span>Dispatched Broadcasts</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-mono ${
                activeTab === 'broadcasts' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {alerts.length}
              </span>
            </button>

            {user.role === 'admin' ? (
              <button
                type="button"
                onClick={() => { setActiveTab('rules'); setSearchFilter(''); }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  activeTab === 'rules'
                    ? 'bg-cyan-950 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>Monitoring Rules</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-mono ${
                  activeTab === 'rules' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {rules.length}
                </span>
              </button>
            ) : null}
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-3">
            {/* Quick Search */}
            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={activeTab === 'broadcasts' ? 'Filter dispatched alerts...' : 'Filter rules by barangay...'}
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-800 outline-none focus:border-cyan-900"
              />
              {searchFilter ? (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {/* If on Rules tab, show "+ New Rule" CTA */}
            {activeTab === 'rules' && user.role === 'admin' ? (
              <button
                type="button"
                onClick={openCreateRule}
                className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-950 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-cyan-900 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                New Rule
              </button>
            ) : null}
          </div>
        </div>

        {/* ── TAB 1: Dispatched Broadcasts Feed ── */}
        {activeTab === 'broadcasts' ? (
          isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : filteredAlerts.length > 0 ? (
            <div className="space-y-4">
              {filteredAlerts.map((alert) => {
                const notification = notificationByAlertId.get(alert.id);
                const alertPayload = notification ? parseDisasterAlertNotification(notification) : null;
                const affectedArea = buildAffectedAreaLabel({
                  barangay_id: alert.barangay_id,
                  purok_sitio: alert.purok_sitio,
                  municipality: alert.municipality,
                });

                return (
                  <div
                    key={alert.id}
                    className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-cyan-800 hover:shadow-md"
                  >
                    {/* Severity Border Accent Line */}
                    <div
                      className={`absolute top-0 left-0 right-0 h-1 ${
                        alert.severity === 'warning' ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                    />

                    {/* Header Row */}
                    <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                              alert.severity === 'warning'
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                alert.severity === 'warning' ? 'bg-rose-600 animate-pulse' : 'bg-amber-500'
                              }`}
                            />
                            {DISASTER_ALERT_SEVERITY_LABELS[alert.severity]}
                          </span>

                          <span className="rounded-md bg-cyan-50 px-2.5 py-0.5 text-xs font-bold text-cyan-900 border border-cyan-200">
                            {HAZARD_LABELS[alert.hazard]}
                          </span>

                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Source: {DISASTER_ALERT_TRIGGER_SOURCE_LABELS[alert.trigger_source]}
                          </span>

                          <span className="text-xs font-semibold text-slate-400">
                            • Issued {formatDateTime(alert.issued_at)}
                          </span>
                        </div>

                        <h2 className="mt-2 text-lg font-black tracking-tight text-slate-950">
                          {alert.title}
                        </h2>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          <MapPin className="mr-1 inline h-3.5 w-3.5 text-rose-500" />
                          Target Area: <span className="text-slate-900">{affectedArea || 'Mabini, Davao de Oro'}</span>
                        </p>
                      </div>

                      {/* Reachable Status / Awareness Copy */}
                      <div className="flex items-center gap-2">
                        {notification && !notification.read_at ? (
                          <button
                            type="button"
                            onClick={() => { void handleMarkRead(notification); }}
                            disabled={markingNotificationId === notification.id}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100 transition"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" />
                            {markingNotificationId === notification.id ? 'Marking...' : 'Mark awareness read'}
                          </button>
                        ) : notification?.read_at ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Awareness copy read
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Alert Message Box */}
                    <div className="mt-3.5 rounded-xl bg-slate-50/80 p-3.5 text-sm leading-relaxed text-slate-700 border border-slate-100">
                      {alert.message}
                    </div>

                    {/* Household Reachability Bar */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cyan-50/60 p-3 border border-cyan-100 text-xs">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-cyan-900" />
                        <span className="font-bold text-cyan-950">
                          Delivery Reach: {alert.reachable_household_count} household(s) notified
                        </span>
                        {alert.unreachable_household_count > 0 ? (
                          <span className="text-amber-800 font-medium">
                            ({alert.unreachable_household_count} unreachable without app account)
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[11px] font-mono text-cyan-800">
                        Trigger: {alert.trigger_reason}
                      </span>
                    </div>

                    {/* Live Weather Metrics Telemetry Snapshot */}
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase">
                          <CloudRain className="h-3.5 w-3.5 text-cyan-600" />
                          Rain Chance
                        </div>
                        <p className="mt-1 font-mono font-bold text-slate-900">
                          {formatMetric(alert.weather_snapshot.rain_chance, '%') ?? 'No data'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase">
                          <CloudRain className="h-3.5 w-3.5 text-cyan-600" />
                          Rain Intensity
                        </div>
                        <p className="mt-1 font-mono font-bold text-slate-900">
                          {formatMetric(alert.weather_snapshot.rain_intensity_mm_per_hr, ' mm/hr') ?? 'No data'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase">
                          <CloudRain className="h-3.5 w-3.5 text-cyan-600" />
                          Next-Hour Peak
                        </div>
                        <p className="mt-1 font-mono font-bold text-slate-900">
                          {formatMetric(alert.weather_snapshot.next_hour_precip_mm, ' mm') ?? 'No data'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase">
                          <Wind className="h-3.5 w-3.5 text-cyan-600" />
                          Wind Gust
                        </div>
                        <p className="mt-1 font-mono font-bold text-slate-900">
                          {formatMetric(alert.weather_snapshot.wind_gust_kph, ' kph') ?? 'No data'}
                        </p>
                      </div>
                    </div>

                    {/* Evacuation site details if present */}
                    {alertPayload?.evacuation_site?.trim() || alertPayload?.default_evacuation_site?.trim() ? (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 border border-emerald-200">
                        <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                        <span>
                          Designated Evacuation: <strong>{alertPayload.evacuation_site || alertPayload.default_evacuation_site}</strong>
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <CivicEmptyState
              icon={ShieldAlert}
              title="No dispatched alerts match"
              description={searchFilter ? 'No broadcasted alerts match your search query.' : 'No disaster alerts have been emitted yet. The 5-minute engine continues evaluating live telemetry.'}
            />
          )
        ) : null}

        {/* ── TAB 2: Monitoring Rules Directory ── */}
        {activeTab === 'rules' && user.role === 'admin' ? (
          isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : filteredRules.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRules.map((rule) => {
                const barangayLabel = BARANGAY_OPTIONS.find((b) => b.id === rule.barangay_id)?.label ?? rule.barangay_id;

                return (
                  <div
                    key={rule.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-cyan-800 hover:shadow-md"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-cyan-50 px-2.5 py-0.5 text-xs font-bold text-cyan-900 border border-cyan-200">
                            {HAZARD_LABELS[rule.hazard]}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                              rule.enabled
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {rule.enabled ? 'Enabled' : 'Paused'}
                          </span>
                        </div>

                        {rule.notify_responders ? (
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 border border-amber-200">
                            Responder Copy ON
                          </span>
                        ) : null}
                      </div>

                      {/* Location Title */}
                      <h3 className="mt-3 text-base font-bold text-slate-900">
                        {barangayLabel}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {rule.purok_sitio ? `Purok: ${rule.purok_sitio}` : 'Whole Barangay Scope'}
                      </p>

                      {/* Telemetry info */}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>Cooldown: <strong className="text-slate-700 font-mono">{rule.cooldown_minutes} min</strong></span>
                        <span>•</span>
                        <span>Last Triggered: <strong className="text-slate-700">{rule.last_triggered_at ? formatDateTime(rule.last_triggered_at) : 'Never'}</strong></span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-xs font-mono text-slate-400">
                        ID: #{rule.id.slice(0, 8)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditRule(rule)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 hover:border-cyan-900 hover:text-cyan-950 transition"
                        >
                          Edit Rule
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRule(rule)}
                          className="rounded-lg border border-rose-200 bg-white p-1 text-rose-600 hover:bg-rose-50 transition"
                          title="Delete Rule"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <CivicEmptyState
              icon={MapPin}
              title="No rules found"
              description="No automatic disaster rules match your current filter."
            />
          )
        ) : null}

        {/* ── Slide-Over / Dialog for Rule Configuration (On-Demand Modal) ── */}
        <Dialog open={isRuleModalOpen} onOpenChange={(open) => { if (!open) resetRuleForm(); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogTitle className="text-xl font-black text-slate-950">
              {editingRuleId ? 'Edit Automatic Disaster Rule' : 'New Automatic Disaster Rule'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Configure automatic weather telemetry thresholds and map trigger coordinates for Mabini households.
            </DialogDescription>

            <form onSubmit={handleRuleSubmit} className="space-y-4 mt-2">
              {/* Section 1: Location */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">① Location Scope</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Municipality</label>
                    <input
                      value={MABINI_MUNICIPALITY}
                      readOnly
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs text-slate-500 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Barangay</label>
                    <select
                      value={ruleForm.barangay_id}
                      onChange={(e) => setRuleForm((curr) => ({ ...curr, barangay_id: e.target.value }))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-cyan-900"
                    >
                      {BARANGAY_OPTIONS.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Purok / Sitio <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <PurokSelectField
                      id="alert-rule-purok-select"
                      barangayId={ruleForm.barangay_id}
                      value={ruleForm.purok_sitio}
                      onChange={(val) => setRuleForm((curr) => ({ ...curr, purok_sitio: val }))}
                      allowEmpty
                      emptyLabel="All puroks (whole barangay)"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-cyan-900"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Hazard Type */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">② Hazard Type</p>
                <div className="flex flex-wrap gap-2">
                  {AUTOMATIC_RULE_HAZARDS.map((hazard) => (
                    <button
                      key={hazard}
                      type="button"
                      onClick={() => setRuleForm((curr) => ({ ...curr, hazard }))}
                      className={`inline-flex h-9 items-center justify-center rounded-xl border px-3.5 text-xs font-bold transition ${
                        ruleForm.hazard === hazard
                          ? 'border-cyan-900 bg-cyan-950 text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {HAZARD_LABELS[hazard]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Official Keywords */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">③ Official Keywords</p>
                <input
                  value={ruleForm.official_keywords}
                  onChange={(e) => setRuleForm((curr) => ({ ...curr, official_keywords: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-cyan-900"
                  placeholder="e.g. flood, heavy rain, gale (comma separated)"
                />
              </div>

              {/* Section 4: Live Telemetry Sampling Preview */}
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-cyan-950">Field Response Telemetry</p>
                    <p className="text-[11px] text-cyan-900">Live weather threshold preview for {HAZARD_LABELS[ruleForm.hazard]}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWeatherPreviewRefreshToken((c) => c + 1)}
                    disabled={isWeatherPreviewLoading}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-white px-2.5 py-1 text-xs font-bold text-cyan-950 hover:bg-cyan-100"
                  >
                    <RefreshCw className={`h-3 w-3 ${isWeatherPreviewLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg bg-white p-2 border border-cyan-100">
                    <span className="text-[10px] text-slate-400 block">Rain Chance</span>
                    <strong className="font-mono text-slate-900">
                      {weatherPreview ? formatMetricOrFallback(weatherPreview.current.rainChance, '%') : 'No data'}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-cyan-100">
                    <span className="text-[10px] text-slate-400 block">Intensity</span>
                    <strong className="font-mono text-slate-900">
                      {weatherPreview ? formatMetricOrFallback(weatherPreview.current.rainIntensity, ' mm/hr') : 'No data'}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-cyan-100">
                    <span className="text-[10px] text-slate-400 block">Next Hour</span>
                    <strong className="font-mono text-slate-900">
                      {weatherPreview ? formatMetricOrFallback(weatherPreview.current.nextHourPrecipitationPeak, ' mm') : 'No data'}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-cyan-100">
                    <span className="text-[10px] text-slate-400 block">Wind</span>
                    <strong className="font-mono text-slate-900">
                      {weatherPreview ? formatRoundedMetricOrFallback(weatherPreview.current.windSpeed, ' kph') : 'No data'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Section 5: Trigger Map Point */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">④ Trigger Map Point</p>
                <LocationPicker
                  lat={ruleForm.trigger_lat}
                  lng={ruleForm.trigger_lng}
                  defaultAddress={`${MABINI_MUNICIPALITY}, Davao de Oro`}
                  onChange={(lat, lng) => setRuleForm((curr) => ({
                    ...curr,
                    trigger_lat: lat,
                    trigger_lng: lng,
                  }))}
                />
              </div>

              {/* Section 6: Settings */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Cooldown (minutes)</label>
                  <input
                    type="number"
                    min="30"
                    step="1"
                    value={ruleForm.cooldown_minutes}
                    onChange={(e) => setRuleForm((curr) => ({ ...curr, cooldown_minutes: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-cyan-900"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={ruleForm.enabled}
                      onChange={(e) => setRuleForm((curr) => ({ ...curr, enabled: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>Rule Enabled (active in 5-min evaluator)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={ruleForm.notify_responders}
                      onChange={(e) => setRuleForm((curr) => ({ ...curr, notify_responders: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>Notify Responders and Admins</span>
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <DialogFooter className="gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={resetRuleForm}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRule}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-950 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-cyan-900 disabled:opacity-60"
                >
                  {isSavingRule ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isSavingRule ? 'Saving...' : editingRuleId ? 'Update Rule' : 'Save Rule'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Confirm Delete Dialog ── */}
        <Dialog open={confirmDeleteRule !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteRule(null); }}>
          <DialogContent>
            <DialogTitle>Delete alert rule?</DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              {confirmDeleteRule ? (
                <>
                  This will permanently delete the <strong>{HAZARD_LABELS[confirmDeleteRule.hazard]}</strong> rule for{' '}
                  <strong>{BARANGAY_OPTIONS.find((b) => b.id === confirmDeleteRule.barangay_id)?.label ?? confirmDeleteRule.barangay_id}</strong>
                  {confirmDeleteRule.purok_sitio ? ` · ${confirmDeleteRule.purok_sitio}` : ''}.
                  It will no longer be evaluated. Past broadcast history will be kept.
                </>
              ) : null}
            </DialogDescription>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setConfirmDeleteRule(null)}
                disabled={isDeletingRule}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (confirmDeleteRule) void handleDeleteRule(confirmDeleteRule); }}
                disabled={isDeletingRule}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {isDeletingRule ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {isDeletingRule ? 'Deleting...' : 'Delete Rule'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CivicPage>
    </AppShell>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle2, Clock3, FileText, MapPin, ShieldAlert } from 'lucide-react';
import { PurokFloodProfileCard } from '@/components/PurokFloodProfileCard';
import ResidentShell from '@/components/resident/ResidentShell';
import { getDefaultRouteForUser, getCurrentUser, isResidentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import { getPurokRiskProfile } from '@/lib/db/purok-risk-profiles';
import { getDisasterAlertRules } from '@/lib/db/disaster-alerts';
import { getUserNotifications } from '@/lib/db/user-notifications';
import type { DisasterAlertRule, DistributionStatus, Household, PurokRiskProfile, UserNotification } from '@/lib/db/schema';
import { buildRegistrationTimeline, formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';
import { PUROK_FLOOD_CONTROL_STATUS_LABELS } from '@/lib/purok-risk-profiles';
import { fetchJsonWithCache } from '@/lib/client-fetch-cache';
import type { FieldResponseWeatherPayload } from '@/lib/weather';
import WeatherWidget from '@/components/WeatherWidget';
import { CivicBadge, CivicPanel, CivicSectionHeading } from '@/components/ui/civic-primitives';
import {
  buildAffectedAreaLabel,
  DISASTER_ALERT_SEVERITY_LABELS,
  HAZARD_LABELS,
  parseDisasterAlertNotification,
} from '@/lib/disaster-alerts';
import {
  DISTRIBUTION_NOTIFICATION_STATUS_LABELS,
  parseDistributionEventNotification,
} from '@/lib/distribution-notifications';
import { resolveResidentActiveApprovedHousehold } from '@/lib/resident-households';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

function formatDate(value?: Date): string {
  if (!value) {
    return 'Waiting for review';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const STATUS_BADGE_TONES: Record<DistributionStatus, 'amber' | 'navy' | 'emerald'> = {
  planned: 'amber',
  ongoing: 'navy',
  completed: 'emerald',
};

export default function ResidentPortalPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [records, setRecords] = useState<Household[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [purokRiskProfile, setPurokRiskProfile] = useState<PurokRiskProfile | null>(null);
  const [alertRules, setAlertRules] = useState<DisasterAlertRule[]>([]);
  const [liveWeather, setLiveWeather] = useState<FieldResponseWeatherPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!isResidentUser(user)) {
      router.push(getDefaultRouteForUser(user));
      return;
    }

    const residentUser = user;
    let cancelled = false;

    async function loadRecords() {
      try {
        setIsLoading(true);
        const [households, inboxItems, rules] = await Promise.all([
          getHouseholds({ applicant_user_id: residentUser.id }),
          getUserNotifications(),
          getDisasterAlertRules(),
        ]);
        const activeHousehold = resolveResidentActiveApprovedHousehold(households);
        const profile = activeHousehold
          ? await getPurokRiskProfile(activeHousehold.barangay_id, activeHousehold.purok_sitio)
          : null;
        if (!cancelled) {
          setRecords(households);
          setNotifications(inboxItems);
          setPurokRiskProfile(profile ?? null);
          setAlertRules(rules);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadRecords();
    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (
        event.detail.table !== 'households'
        && event.detail.table !== 'user_notifications'
        && event.detail.table !== 'purok_risk_profiles'
        && event.detail.table !== 'disaster_alert_rules'
      ) {
        return;
      }

      void loadRecords();
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [router, user]);

  const pendingCount = useMemo(() => (
    records.filter((record) => getHouseholdRegistrationStatus(record) === 'pending').length
  ), [records]);
  const activeHousehold = useMemo(
    () => resolveResidentActiveApprovedHousehold(records),
    [records],
  );
  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  );

  const activeRule = useMemo(() => {
    return alertRules
      .filter((rule) => rule.enabled && (!activeHousehold || rule.barangay_id === activeHousehold.barangay_id))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
  }, [alertRules, activeHousehold]);

  useEffect(() => {
    let cancelled = false;

    async function fetchLiveWeather() {
      try {
        const params = new URLSearchParams();
        if (activeHousehold?.gps_lat !== undefined && activeHousehold?.gps_long !== undefined) {
          params.set('lat', String(activeHousehold.gps_lat));
          params.set('lng', String(activeHousehold.gps_long));
        } else if (activeRule) {
          params.set('lat', String(activeRule.trigger_lat));
          params.set('lng', String(activeRule.trigger_lng));
        }
        
        const payload = await fetchJsonWithCache<FieldResponseWeatherPayload>(
          `/api/weather?${params.toString()}`,
          { ttlMs: 15 * 60 * 1000 },
        );
        if (!cancelled) setLiveWeather(payload);
      } catch {
        // Handle silently
      }
    }

    void fetchLiveWeather();
    return () => { cancelled = true; };
  }, [activeHousehold?.gps_lat, activeHousehold?.gps_long, activeRule]);

  if (!user || !isResidentUser(user)) {
    return null;
  }

  return (
    <ResidentShell
      title="Resident Portal"
      subtitle={
        activeHousehold
          ? 'Your latest approved household is active. Review your members and keep the household record up to date.'
          : 'Create a household registration and track its approval progress.'
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'My Registrations', value: records.length, icon: FileText, tone: 'bg-cyan-950 text-white' },
          { label: 'Pending Review', value: pendingCount, icon: Clock3, tone: 'bg-amber-500 text-white' },
          { label: 'Approved', value: records.filter((record) => getHouseholdRegistrationStatus(record) === 'approved').length, icon: CheckCircle2, tone: 'bg-emerald-600 text-white' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.24)]">
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${card.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-900">{card.value}</p>
              <p className="mt-1 text-sm text-slate-500">{card.label}</p>
            </div>
          );
        })}
      </div>

      {activeHousehold ? (
        <div className="mt-6 rounded-[28px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.24)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Your household is approved and active.</p>
              <p className="mt-1 text-emerald-800">
                Open your household page to review members, address details, and add new household members.
              </p>
            </div>
            <Link
              href="/resident/household"
              className="inline-flex items-center gap-2 rounded-full bg-cyan-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-900"
            >
              <FileText className="h-4 w-4" />
              Open My Household
            </Link>
          </div>
        </div>
      ) : null}

      {activeHousehold && purokRiskProfile ? (() => {
        const isAtRisk = liveWeather && (
          (activeRule?.min_rain_chance !== undefined && (liveWeather.current.rainChance ?? 0) >= activeRule.min_rain_chance) ||
          (activeRule?.min_wind_gust_kph !== undefined && (liveWeather.current.windGust ?? 0) >= activeRule.min_wind_gust_kph)
        );
        const hasWarning = liveWeather?.alerts.some(a => a.severity === 'warning');

        return (
          <div className="mt-6 space-y-4">
            {/* Live Weather & Local Disaster Monitor */}
            <CivicPanel className="p-0 overflow-hidden border-none shadow-[0_18px_46px_-36px_rgba(15,23,42,0.24)]">
              <div className={`px-5 py-4 ${isAtRisk || hasWarning ? 'bg-rose-600' : 'bg-cyan-950'}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                    <ShieldAlert className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Local Disaster Monitor</h3>
                    <p className="text-xs text-white/80">
                      {isAtRisk || hasWarning ? 'High Risk Alert Active' : 'Normal Conditions for ' + activeHousehold.purok_sitio}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-[20px] bg-white/10 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">Responder Status Update</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    Flood Control: {PUROK_FLOOD_CONTROL_STATUS_LABELS[purokRiskProfile.flood_control_status] || 'Unknown'}
                  </p>
                  {purokRiskProfile.warning_notes && (
                    <p className="mt-2 text-xs leading-relaxed text-white/90">
                      &quot;{purokRiskProfile.warning_notes}&quot;
                    </p>
                  )}
                </div>
              </div>
              
              <div className="bg-white p-5">
                {isAtRisk && (
                  <div className="mb-5 rounded-[20px] border border-rose-200 bg-rose-50 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-rose-900">Immediate Risk Detected</h4>
                        <p className="mt-1 text-xs leading-5 text-rose-700">
                          Weather thresholds for your area have been met. Your purok ({activeHousehold.purok_sitio}) is highly susceptible to flooding.
                          {purokRiskProfile.default_evacuation_site && (
                            <span className="block mt-2 font-bold bg-white/50 px-2 py-1 rounded inline-block">
                              Evacuation Site: {purokRiskProfile.default_evacuation_site}
                            </span>
                          )}
                        </p>
                        {purokRiskProfile.warning_notes && (
                          <p className="mt-2 text-[11px] font-semibold text-rose-800 uppercase tracking-wide">
                            Note: {purokRiskProfile.warning_notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                <WeatherWidget
                  mode="compact"
                  className="shadow-none border border-slate-100 rounded-[20px]"
                  lat={activeHousehold.gps_lat ?? activeRule?.trigger_lat}
                  lng={activeHousehold.gps_long ?? activeRule?.trigger_lng}
                />
              </div>
            </CivicPanel>
          </div>
        );
      })() : null}

      <CivicPanel className="mt-6 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <CivicSectionHeading
            icon={Bell}
            title="Latest notices and alerts"
            description="Live distribution updates and weather-triggered household alerts for your resident account appear here."
          />
          <Link
            href="/resident/notifications"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <Bell className="h-4 w-4" />
            Open Notifications
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <CivicBadge label={`${notifications.length} total notice${notifications.length === 1 ? '' : 's'}`} tone="slate" />
          <CivicBadge label={`${unreadNotificationCount} unread`} tone={unreadNotificationCount > 0 ? 'amber' : 'emerald'} />
        </div>

        {notifications.length > 0 ? (
          <div className="mt-5 space-y-3">
            {notifications.slice(0, 2).map((notification) => {
              const distributionPayload = parseDistributionEventNotification(notification);
              const disasterPayload = parseDisasterAlertNotification(notification);
              const affectedArea = disasterPayload
                ? buildAffectedAreaLabel({
                  barangay_id: disasterPayload.barangay_id,
                  purok_sitio: disasterPayload.purok_sitio,
                  municipality: disasterPayload.municipality,
                })
                : '';

              return (
                <div
                  key={notification.id}
                  className={`rounded-[24px] border px-4 py-4 ${
                    notification.read_at
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-cyan-200 bg-cyan-50/70'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                    <CivicBadge label={notification.read_at ? 'Read' : 'Unread'} tone={notification.read_at ? 'emerald' : 'amber'} />
                    {distributionPayload ? (
                      <CivicBadge
                        label={DISTRIBUTION_NOTIFICATION_STATUS_LABELS[distributionPayload.status]}
                        tone={STATUS_BADGE_TONES[distributionPayload.status]}
                      />
                    ) : null}
                    {disasterPayload ? (
                      <>
                        <CivicBadge label={HAZARD_LABELS[disasterPayload.hazard]} tone="teal" />
                        <CivicBadge
                          label={DISASTER_ALERT_SEVERITY_LABELS[disasterPayload.severity]}
                          tone={disasterPayload.severity === 'warning' ? 'rose' : 'amber'}
                        />
                      </>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{notification.body}</p>
                  {distributionPayload?.notes?.trim() ? (
                    <p className="mt-2 text-xs font-medium text-amber-800">Note: {distributionPayload.notes.trim()}</p>
                  ) : null}
                  {disasterPayload ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-1 font-medium text-slate-700">
                        {affectedArea || 'Mabini, Davao de Oro'}
                      </span>
                      {disasterPayload.evacuation_site?.trim() ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
                          Evacuate to {disasterPayload.evacuation_site.trim()}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No barangay notices or disaster alerts yet.
          </div>
        )}
      </CivicPanel>

      <CivicPanel className="mt-6 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <CivicSectionHeading
            icon={FileText}
            title="My registration records"
            description={
              activeHousehold
                ? 'Your approved household is ready. Older submissions stay here for reference.'
                : 'Every record you submit appears here with its current review status.'
            }
          />
          <Link
            href={activeHousehold ? '/resident/household' : '/households/register'}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-900"
          >
            <FileText className="h-4 w-4" />
            {activeHousehold ? 'Open My Household' : 'New Registration'}
          </Link>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
            Loading your registrations...
          </div>
        ) : records.length > 0 ? (
          <div className="mt-6 space-y-4">
            {records.map((record) => {
              const timeline = buildRegistrationTimeline(record);
              return (
                <div key={record.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{record.head_name}</h3>
                        <CivicBadge label={formatRegistrationStatusLabel(getHouseholdRegistrationStatus(record))} tone="amber" />
                        {activeHousehold?.id === record.id ? (
                          <CivicBadge label="Active household" tone="emerald" />
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {record.street_address}, {record.purok_sitio}, {record.barangay_name}, {record.municipality}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(record.registration_submitted_at || record.createdAt)}</p>
                    </div>
                    <Link
                      href={`/households/register/status?id=${record.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      View Status
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    {timeline.map((step) => (
                      <div
                        key={step.key}
                        className={`rounded-[22px] border px-3 py-3 text-sm ${
                          step.state === 'done'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : step.state === 'current'
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                              : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {step.label}
                      </div>
                    ))}
                  </div>

                  {record.registration_review_notes?.trim() && (
                    <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{record.registration_review_notes.trim()}</span>
                      </div>
                    </div>
                  )}

                  {typeof record.gps_lat === 'number' && typeof record.gps_long === 'number' && (
                    <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {record.gps_lat.toFixed(5)}, {record.gps_long.toFixed(5)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-4 text-base font-semibold text-slate-900">No registration submitted yet</p>
            <p className="mt-2 text-sm text-slate-500">
              Start a new household registration, use your location or pin the map, then wait for admin approval.
            </p>
            <Link
              href={activeHousehold ? '/resident/household' : '/households/register'}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-cyan-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-900"
            >
              <FileText className="h-4 w-4" />
              {activeHousehold ? 'Open My Household' : 'Start Registration'}
            </Link>
          </div>
        )}
      </CivicPanel>
    </ResidentShell>
  );
}

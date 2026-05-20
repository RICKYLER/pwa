'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Loader2,
  MapPin,
  ShieldAlert,
  Users2,
} from 'lucide-react';
import { PurokFloodProfileCard } from '@/components/PurokFloodProfileCard';
import ResidentShell from '@/components/resident/ResidentShell';
import {
  CivicBadge,
  CivicEmptyState,
  CivicKpiCard,
  CivicPanel,
  CivicSectionHeading,
} from '@/components/ui/civic-primitives';
import { getDefaultRouteForUser, getCurrentUser, isResidentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import { getPurokRiskProfile } from '@/lib/db/purok-risk-profiles';
import {
  getUserNotifications,
  isFallbackUserNotificationId,
  markUserNotificationRead,
  markUserNotificationReadLocally,
} from '@/lib/db/user-notifications';
import type {
  DistributionStatus,
  Household,
  PurokRiskProfile,
  UserNotification,
} from '@/lib/db/schema';
import {
  buildAffectedAreaLabel,
  DISASTER_ALERT_SEVERITY_LABELS,
  DISASTER_ALERT_TRIGGER_SOURCE_LABELS,
  formatDisasterAlertTriggerCoordinates,
  HAZARD_LABELS,
  parseDisasterAlertNotification,
} from '@/lib/disaster-alerts';
import { PUROK_FLOOD_CONTROL_STATUS_LABELS } from '@/lib/purok-risk-profiles';
import {
  DISTRIBUTION_NOTIFICATION_SCOPE_LABELS,
  DISTRIBUTION_NOTIFICATION_STATUS_LABELS,
  DISTRIBUTION_NOTIFICATION_TYPE_LABELS,
  getDistributionNotificationAudienceLabel,
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

const STATUS_BADGE_TONES: Record<DistributionStatus, 'amber' | 'navy' | 'emerald'> = {
  planned: 'amber',
  ongoing: 'navy',
  completed: 'emerald',
};

function formatDateTime(value?: Date) {
  if (!value) {
    return 'Just now';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatSchedule(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'full',
  }).format(parsed);
}

function formatPayloadDateTime(value?: string) {
  if (!value) {
    return 'Just now';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return formatDateTime(parsed);
}

export default function ResidentNotificationsPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [activeHousehold, setActiveHousehold] = useState<Household | null>(null);
  const [purokRiskProfile, setPurokRiskProfile] = useState<PurokRiskProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

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

    async function loadNotifications() {
      try {
        if (!cancelled) {
          setIsLoading(true);
        }

        const [nextNotifications, households] = await Promise.all([
          getUserNotifications(),
          getHouseholds({ applicant_user_id: residentUser.id }),
        ]);
        const nextActiveHousehold = resolveResidentActiveApprovedHousehold(households);
        const nextPurokRiskProfile = nextActiveHousehold
          ? await getPurokRiskProfile(nextActiveHousehold.barangay_id, nextActiveHousehold.purok_sitio)
          : null;
        if (!cancelled) {
          setNotifications(nextNotifications);
          setActiveHousehold(nextActiveHousehold ?? null);
          setPurokRiskProfile(nextPurokRiskProfile ?? null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (event.detail.table !== 'user_notifications' && event.detail.table !== 'purok_risk_profiles' && event.detail.table !== 'households') {
        return;
      }

      void loadNotifications();
    }

    void loadNotifications();
    window.addEventListener('mswdo-data-changed', handleDataChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [router, user]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  );

  async function handleToggle(notification: UserNotification) {
    const nextExpandedId = expandedId === notification.id ? null : notification.id;
    setExpandedId(nextExpandedId);

    if (!nextExpandedId || notification.read_at || markingId === notification.id) {
      return;
    }

    try {
      setMarkingId(notification.id);
      const updated = isFallbackUserNotificationId(notification.id)
        ? await markUserNotificationReadLocally(notification)
        : await markUserNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } finally {
      setMarkingId(null);
    }
  }

  if (!user || !isResidentUser(user)) {
    return null;
  }

  return (
    <ResidentShell
      title="Notifications"
      subtitle="Review your latest disaster alerts and distribution notices from the barangay."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CivicKpiCard
          label="Inbox Items"
          value={notifications.length}
          hint="Resident notices include both distribution updates and automatic disaster alerts."
          icon={Inbox}
          tone="navy"
        />
        <CivicKpiCard
          label="Unread Notices"
          value={unreadCount}
          hint="Opening a notice marks it as read right away."
          icon={Bell}
          tone={unreadCount > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {activeHousehold ? (
        <div className="mt-6">
          <PurokFloodProfileCard
            household={activeHousehold}
            profile={purokRiskProfile}
            description="Your current purok flood profile stays visible here while you review alert history."
          />
        </div>
      ) : null}

      <CivicPanel className="mt-6 sm:p-6">
        <CivicSectionHeading
          icon={Bell}
          title="Resident inbox"
          description="Each inbox item shows the latest distribution update or weather-triggered alert, including the affected area and any evacuation guidance."
        />

        {isLoading ? (
          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
            <p className="mt-3">Loading your notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="mt-6">
            <CivicEmptyState
              icon={Inbox}
              title="No notifications yet"
              description="New barangay distribution events will appear here as soon as staff create them."
            />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {notifications.map((notification) => {
              const distributionPayload = parseDistributionEventNotification(notification);
              const disasterPayload = parseDisasterAlertNotification(notification);
              const isUnread = !notification.read_at;
              const isExpanded = expandedId === notification.id;
              const isMarkingRead = markingId === notification.id;
              const affectedArea = disasterPayload
                ? buildAffectedAreaLabel({
                  barangay_id: disasterPayload.barangay_id,
                  purok_sitio: disasterPayload.purok_sitio,
                  municipality: disasterPayload.municipality,
                })
                : '';
              const triggerCoordinates = disasterPayload
                ? formatDisasterAlertTriggerCoordinates(disasterPayload)
                : '';

              return (
                <div
                  key={notification.id}
                  className={`overflow-hidden rounded-[28px] border transition ${
                    isUnread
                      ? 'border-cyan-200 bg-cyan-50/70 shadow-[0_18px_50px_-40px_rgba(8,47,73,0.55)]'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void handleToggle(notification);
                    }}
                    className="w-full px-5 py-5 text-left sm:px-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-bold text-slate-950">{notification.title}</h2>
                          <CivicBadge
                            label={isUnread ? 'Unread' : 'Read'}
                            tone={isUnread ? 'amber' : 'emerald'}
                          />
                          {isMarkingRead ? <CivicBadge label="Saving..." tone="slate" /> : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{notification.body}</p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {distributionPayload ? (
                            <>
                              <CivicBadge
                                label={getDistributionNotificationAudienceLabel(distributionPayload.target_scope, distributionPayload.target_group)}
                                tone="teal"
                              />
                              <CivicBadge label={DISTRIBUTION_NOTIFICATION_TYPE_LABELS[distributionPayload.type]} tone="slate" />
                              <CivicBadge
                                label={DISTRIBUTION_NOTIFICATION_STATUS_LABELS[distributionPayload.status]}
                                tone={STATUS_BADGE_TONES[distributionPayload.status]}
                              />
                            </>
                          ) : null}
                          {disasterPayload ? (
                            <>
                              <CivicBadge label={HAZARD_LABELS[disasterPayload.hazard]} tone="teal" />
                              <CivicBadge
                                label={DISASTER_ALERT_SEVERITY_LABELS[disasterPayload.severity]}
                                tone={disasterPayload.severity === 'warning' ? 'rose' : 'amber'}
                              />
                              <CivicBadge
                                label={DISASTER_ALERT_TRIGGER_SOURCE_LABELS[disasterPayload.trigger_source]}
                                tone="slate"
                              />
                            </>
                          ) : null}
                          <CivicBadge label={`Received ${formatDateTime(notification.createdAt)}`} tone="slate" />
                        </div>
                      </div>

                      <ChevronRight
                        className={`mt-1 h-5 w-5 flex-shrink-0 text-slate-400 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {isExpanded && distributionPayload ? (
                    <div className="border-t border-slate-200/80 bg-white/80 px-5 py-5 sm:px-6">
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <CivicBadge
                          label={`Current status: ${DISTRIBUTION_NOTIFICATION_STATUS_LABELS[distributionPayload.status]}`}
                          tone={STATUS_BADGE_TONES[distributionPayload.status]}
                        />
                        <CivicBadge label={`Latest update ${formatDateTime(notification.updatedAt)}`} tone="slate" />
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <CalendarDays className="h-4 w-4" />
                            Schedule
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">
                            {formatSchedule(distributionPayload.scheduled_date)}
                          </p>
                        </div>

                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <Users2 className="h-4 w-4" />
                            Audience
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">
                            {getDistributionNotificationAudienceLabel(distributionPayload.target_scope, distributionPayload.target_group)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {DISTRIBUTION_NOTIFICATION_SCOPE_LABELS[distributionPayload.target_scope]} based event
                          </p>
                        </div>

                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <MapPin className="h-4 w-4" />
                            Location
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">{distributionPayload.location}</p>
                        </div>
                      </div>

                      {distributionPayload.notes?.trim() ? (
                        <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                          <p className="font-semibold">Additional notes</p>
                          <p className="mt-1">{distributionPayload.notes.trim()}</p>
                        </div>
                      ) : null}

                      {!isUnread ? (
                        <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Read {formatDateTime(notification.read_at)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {isExpanded && disasterPayload ? (
                    <div className="border-t border-slate-200/80 bg-white/80 px-5 py-5 sm:px-6">
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <CivicBadge
                          label={`${DISASTER_ALERT_SEVERITY_LABELS[disasterPayload.severity]} alert`}
                          tone={disasterPayload.severity === 'warning' ? 'rose' : 'amber'}
                        />
                        <CivicBadge
                          label={DISASTER_ALERT_TRIGGER_SOURCE_LABELS[disasterPayload.trigger_source]}
                          tone="slate"
                        />
                        <CivicBadge label={`Issued ${formatPayloadDateTime(disasterPayload.issued_at)}`} tone="slate" />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <ShieldAlert className="h-4 w-4" />
                            Hazard
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">{HAZARD_LABELS[disasterPayload.hazard]}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {DISASTER_ALERT_SEVERITY_LABELS[disasterPayload.severity]} level
                          </p>
                        </div>

                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <MapPin className="h-4 w-4" />
                            Affected Area
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">{affectedArea || 'Mabini, Davao de Oro'}</p>
                        </div>

                        {triggerCoordinates ? (
                          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              <MapPin className="h-4 w-4" />
                              Trigger Pin
                            </div>
                            <p className="mt-3 text-sm font-semibold text-slate-900">{triggerCoordinates}</p>
                          </div>
                        ) : null}

                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <CalendarDays className="h-4 w-4" />
                            Trigger Basis
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">{disasterPayload.trigger_reason}</p>
                        </div>
                      </div>

                      {disasterPayload.weather_summary?.trim() ? (
                        <div className="mt-4 rounded-[22px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-950">
                          <p className="font-semibold">Weather summary</p>
                          <p className="mt-1">{disasterPayload.weather_summary.trim()}</p>
                        </div>
                      ) : null}

                      {disasterPayload.evacuation_site?.trim() ? (
                        <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                          <p className="font-semibold">Evacuation site</p>
                          <p className="mt-1">{disasterPayload.evacuation_site.trim()}</p>
                        </div>
                      ) : null}

                      {disasterPayload.flood_control_status ? (
                        <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                          <p className="font-semibold text-slate-900">Flood control status</p>
                          <p className="mt-1">{PUROK_FLOOD_CONTROL_STATUS_LABELS[disasterPayload.flood_control_status]}</p>
                          {disasterPayload.flood_control_notes?.trim() ? (
                            <p className="mt-2 text-slate-600">{disasterPayload.flood_control_notes.trim()}</p>
                          ) : null}
                        </div>
                      ) : null}

                      {disasterPayload.default_evacuation_site?.trim() ? (
                        <div className="mt-4 rounded-[22px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-950">
                          <p className="font-semibold">Default purok evacuation site</p>
                          <p className="mt-1">{disasterPayload.default_evacuation_site.trim()}</p>
                        </div>
                      ) : null}

                      {disasterPayload.warning_notes?.trim() ? (
                        <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                          <p className="font-semibold">Purok warning notes</p>
                          <p className="mt-1">{disasterPayload.warning_notes.trim()}</p>
                        </div>
                      ) : null}

                      {disasterPayload.special_assistance_notes?.trim() ? (
                        <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                          <p className="font-semibold">Special assistance notes</p>
                          <p className="mt-1">{disasterPayload.special_assistance_notes.trim()}</p>
                        </div>
                      ) : null}

                      {!isUnread ? (
                        <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Read {formatDateTime(notification.read_at)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CivicPanel>
    </ResidentShell>
  );
}

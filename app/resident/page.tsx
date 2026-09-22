'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  CloudRain,
  FilePlus2,
  FileText,
  IdCard,
  LogOut,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  PhoneCall,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  SunMedium,
  TentTree,
  Users,
  X,
} from 'lucide-react';
import ResidentShell from '@/components/resident/ResidentShell';
import ResidentProfileModal from '@/components/resident/ResidentProfileModal';
import ResidentMasterQrModal from '@/components/ResidentMasterQrModal';
import ResidentEvacScannerModal from '@/components/resident/ResidentEvacScannerModal';
import { getEvacueeRecords, checkOutEvacueeRecord, type EvacueeRecord } from '@/lib/db/evacuees';
import { getDefaultRouteForUser, getCurrentUser, isResidentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import { getPurokRiskProfile } from '@/lib/db/purok-risk-profiles';
import { getResidents } from '@/lib/db/residents';
import { getDisasterAlertRules } from '@/lib/db/disaster-alerts';
import { getUserNotifications } from '@/lib/db/user-notifications';
import { getDistributionRecordsForHousehold } from '@/lib/db/distribution';
import type {
  DisasterAlertRule,
  DistributionRecord,
  DistributionStatus,
  Household,
  PurokRiskProfile,
  Resident,
  UserNotification,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { buildRegistrationTimeline, formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';
import {
  matchesHouseholdAlertScope,
  mergePurokRiskProfileWithAlertFallback,
  PUROK_FLOOD_CONTROL_STATUS_LABELS,
} from '@/lib/purok-risk-profiles';
import { fetchJsonWithCache } from '@/lib/client-fetch-cache';
import type { FieldResponseWeatherPayload } from '@/lib/weather';
import WeatherWidget from '@/components/WeatherWidget';
import DistributionNotificationQr from '@/components/resident/DistributionNotificationQr';
import { CivicBadge, CivicPanel } from '@/components/ui/civic-primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  buildAffectedAreaLabel,
  DISASTER_ALERT_SEVERITY_LABELS,
  HAZARD_LABELS,
  parseDisasterAlertNotification,
} from '@/lib/disaster-alerts';
import {
  DISTRIBUTION_NOTIFICATION_STATUS_LABELS,
  getDistributionNotificationAudienceLabel,
  parseDistributionEventNotification,
} from '@/lib/distribution-notifications';
import { evaluateHouseholdDistributionEligibility } from '@/lib/distribution-claims';
import { resolveResidentActiveApprovedHousehold } from '@/lib/resident-households';
import { getCurrentVulnerabilityFlagsMapForResidents } from '@/lib/db/vulnerability';
import { bootstrapPathnameData } from '@/lib/supabase/route-bootstrap';

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

function formatScheduleDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
  }).format(parsed);
}

function formatPurok(purok?: string | null): string {
  if (!purok) return '';
  const trimmed = purok.trim();
  if (/^purok\b/i.test(trimmed)) {
    return trimmed;
  }
  return `Purok ${trimmed}`;
}

const STATUS_BADGE_TONES: Record<DistributionStatus, 'amber' | 'navy' | 'emerald'> = {
  planned: 'amber',
  ongoing: 'navy',
  completed: 'emerald',
};

interface EmergencyHotline {
  id: string;
  name: string;
  agency: string;
  description: string;
  phone: string;
  altPhone?: string;
  tag: string;
}

const EMERGENCY_HOTLINES: EmergencyHotline[] = [
  {
    id: 'mdrrmo',
    name: 'MDRRMO Rescue Mabini',
    agency: 'Disaster Risk Reduction Office',
    description: 'Disaster rescue, baha, emergency ambulance, ug kalamidad.',
    phone: '09123456789',
    altPhone: '(084) 817-0000',
    tag: '24/7 Hotline',
  },
  {
    id: 'barangay',
    name: 'Barangay Hall',
    agency: 'Lokal nga Barangay Desk',
    description: 'Tanod quick response, kapitan desk, ug lokal nga evacuation assistance.',
    phone: '09491112233',
    tag: 'Barangay Desk',
  },
  {
    id: 'police',
    name: 'Mabini Municipal Police Station (MPS)',
    agency: 'Philippine National Police',
    description: 'Kaluwasan, kahapsay ug kalinaw, ug emergency dispatch.',
    phone: '09985987254',
    altPhone: '(084) 817-0123',
    tag: 'PNP Mabini',
  },
  {
    id: 'bfp',
    name: 'Bureau of Fire Protection (BFP Mabini)',
    agency: 'Fire & Rescue Station',
    description: 'Sunog, search and rescue, ug hazardous area assessment.',
    phone: '09304129988',
    altPhone: '(084) 817-0111',
    tag: 'BFP Station',
  },
  {
    id: 'rhu',
    name: 'Mabini Rural Health Unit (RHU Clinic)',
    agency: 'Municipal Health Office',
    description: 'First aid, emerhensya medikal, ug medikasyon sa evacuation.',
    phone: '09276543210',
    tag: 'Health Clinic',
  },
];

interface SelectedDistributionModalState {
  eventId: string;
  title: string;
  location: string;
  schedule: string;
  audienceLabel: string;
  matchedResidentNames: string[];
  claimedRecord: DistributionRecord | null;
}

export default function ResidentPortalPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [records, setRecords] = useState<Household[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [purokRiskProfile, setPurokRiskProfile] = useState<PurokRiskProfile | null>(null);
  const [alertRules, setAlertRules] = useState<DisasterAlertRule[]>([]);
  const [liveWeather, setLiveWeather] = useState<FieldResponseWeatherPayload | null>(null);
  const [activeHouseholdResidents, setActiveHouseholdResidents] = useState<Resident[]>([]);
  const [flagsByResidentId, setFlagsByResidentId] = useState<Map<string, VulnerabilityFlags>>(new Map());
  const [claimedRecordsByEventId, setClaimedRecordsByEventId] = useState<Map<string, DistributionRecord>>(new Map());
  const [showRegistrationPrompt, setShowRegistrationPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Modals and UI Toggles
  const [selectedDistributionEvent, setSelectedDistributionEvent] = useState<SelectedDistributionModalState | null>(null);
  const [showHotlinesModal, setShowHotlinesModal] = useState(false);
  const [showWeatherDetails, setShowWeatherDetails] = useState(false);
  const [showRegistrationHistory, setShowRegistrationHistory] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMasterQrModal, setShowMasterQrModal] = useState(false);
  const [showEvacScannerModal, setShowEvacScannerModal] = useState(false);
  const [activeEvacRecord, setActiveEvacRecord] = useState<EvacueeRecord | null>(null);

  const noticesSectionRef = useRef<HTMLDivElement>(null);

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

    async function loadRecords(isRetry = false) {
      try {
        setIsLoading(true);
        let [households, inboxItems, rules] = await Promise.all([
          getHouseholds({
            applicant_user_id: residentUser.id,
            applicant_email: residentUser.email,
          }),
          getUserNotifications(),
          getDisasterAlertRules(),
        ]);

        if (households.length === 0 && !isRetry) {
          await bootstrapPathnameData('/resident', true).catch(() => null);
          [households] = await Promise.all([
            getHouseholds({
              applicant_user_id: residentUser.id,
              applicant_email: residentUser.email,
            }),
          ]);
        }

        const activeHousehold = resolveResidentActiveApprovedHousehold(households);
        const nextResidents = activeHousehold
          ? await getResidents({ household_id: activeHousehold.id, status: 'active' })
          : [];
        const nextFlags = activeHousehold
          ? await getCurrentVulnerabilityFlagsMapForResidents(nextResidents, [activeHousehold])
          : new Map<string, VulnerabilityFlags>();
        const profile = activeHousehold
          ? await getPurokRiskProfile(activeHousehold.barangay_id, activeHousehold.purok_sitio)
          : null;

        // Fetch household claim history for distribution events
        const distributionRecords = activeHousehold
          ? await getDistributionRecordsForHousehold(activeHousehold.id)
          : [];
        const claimedMap = new Map<string, DistributionRecord>();
        for (const record of distributionRecords) {
          if (record.event_id) {
            claimedMap.set(record.event_id, record);
          }
        }

        if (!cancelled) {
          setRecords(households);
          setNotifications(inboxItems);
          setPurokRiskProfile(profile ?? null);
          setAlertRules(rules);
          setActiveHouseholdResidents(nextResidents);
          setFlagsByResidentId(nextFlags);
          setClaimedRecordsByEventId(claimedMap);
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
        event.detail.table !== 'households' &&
        event.detail.table !== 'user_notifications' &&
        event.detail.table !== 'purok_risk_profiles' &&
        event.detail.table !== 'disaster_alert_rules' &&
        event.detail.table !== 'residents' &&
        event.detail.table !== 'vulnerability_flags' &&
        event.detail.table !== 'distribution_records'
      ) {
        return;
      }

      void loadRecords(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [router, user]);

  const pendingCount = useMemo(
    () => records.filter((record) => getHouseholdRegistrationStatus(record) === 'pending').length,
    [records],
  );
  const activeHousehold = useMemo(
    () => resolveResidentActiveApprovedHousehold(records),
    [records],
  );
  const shouldShowRegistrationOnboarding = !isLoading && records.length === 0 && !activeHousehold;

  // Load active evacuation shelter status for the current resident household
  useEffect(() => {
    if (!activeHousehold?.id) {
      setActiveEvacRecord(null);
      return;
    }

    let isMounted = true;
    async function loadShelterStatus() {
      try {
        const evacRecords = await getEvacueeRecords();
        if (isMounted) {
          const current = evacRecords.find(
            (r) => r.household_id === activeHousehold?.id && r.status === 'sheltered',
          );
          setActiveEvacRecord(current || null);
        }
      } catch (err) {
        console.error('Failed to load evacuee record:', err);
      }
    }

    void loadShelterStatus();

    function handleEvacueesChanged() {
      void loadShelterStatus();
    }
    window.addEventListener('mswdo-evacuees-changed', handleEvacueesChanged);
    return () => {
      isMounted = false;
      window.removeEventListener('mswdo-evacuees-changed', handleEvacueesChanged);
    };
  }, [activeHousehold?.id]);

  async function handleSelfCheckOut() {
    if (!activeEvacRecord) return;
    if (
      !confirm(
        `Kumpirmahon ba nimo nga nakapauli na kamo gikan sa ${activeEvacRecord.evacuation_center_name}?`,
      )
    ) {
      return;
    }
    try {
      await checkOutEvacueeRecord(activeEvacRecord.id);
      setActiveEvacRecord(null);
    } catch (err) {
      console.error('Failed to checkout evacuee record:', err);
    }
  }

  useEffect(() => {
    if (!user || !isResidentUser(user)) {
      return undefined;
    }

    if (!shouldShowRegistrationOnboarding) {
      setShowRegistrationPrompt(false);
      return undefined;
    }

    const storageKey = `resident-registration-prompt:${user.id}`;
    if (window.sessionStorage.getItem(storageKey) === 'seen') {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      setShowRegistrationPrompt(true);
      window.sessionStorage.setItem(storageKey, 'seen');
    });

    return () => window.cancelAnimationFrame(frame);
  }, [shouldShowRegistrationOnboarding, user]);

  const visibleNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      const distributionPayload = parseDistributionEventNotification(notification);
      if (!distributionPayload) {
        return true;
      }

      const eligibility = evaluateHouseholdDistributionEligibility({
        household: activeHousehold,
        notification: distributionPayload,
        residents: activeHouseholdResidents,
        flagsByResidentId,
      });

      return eligibility.eligible;
    });
  }, [activeHousehold, activeHouseholdResidents, flagsByResidentId, notifications]);

  const householdVulnerabilities = useMemo(() => {
    let seniors = 0;
    let infants = 0;
    let pwds = 0;
    let pregnant = 0;
    for (const r of activeHouseholdResidents) {
      const flags = flagsByResidentId.get(r.id);
      if (flags?.is_senior) seniors++;
      if (flags?.is_infant) infants++;
      if (flags?.is_pwd) pwds++;
      if (flags?.is_pregnant) pregnant++;
    }
    return { seniors, infants, pwds, pregnant };
  }, [activeHouseholdResidents, flagsByResidentId]);

  const unreadNotificationCount = useMemo(
    () => visibleNotifications.filter((notification) => !notification.read_at).length,
    [visibleNotifications],
  );

  // Filter food pack releases where this household is strictly eligible
  const eligibleFoodPackReleases = useMemo(() => {
    if (!activeHousehold) return [];

    return visibleNotifications
      .map((notification) => {
        const payload = parseDistributionEventNotification(notification);
        if (!payload) return null;

        const eligibility = evaluateHouseholdDistributionEligibility({
          household: activeHousehold,
          notification: payload,
          residents: activeHouseholdResidents,
          flagsByResidentId,
        });

        if (!eligibility.eligible) return null;

        const claimedRecord = claimedRecordsByEventId.get(payload.event_id) ?? null;
        return {
          notification,
          payload,
          eligibility,
          claimedRecord,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [activeHousehold, visibleNotifications, activeHouseholdResidents, flagsByResidentId, claimedRecordsByEventId]);

  const unclaimedEligibleCount = useMemo(() => {
    return eligibleFoodPackReleases.filter(
      (item) => !item.claimedRecord && item.payload.status !== 'completed',
    ).length;
  }, [eligibleFoodPackReleases]);

  const activeRule = useMemo(() => {
    return alertRules
      .filter((rule) => rule.enabled && (!activeHousehold || rule.barangay_id === activeHousehold.barangay_id))
      .sort((left, right) => {
        const leftExact = activeHousehold && left.purok_sitio && matchesHouseholdAlertScope(activeHousehold, left) ? 1 : 0;
        const rightExact = activeHousehold && right.purok_sitio && matchesHouseholdAlertScope(activeHousehold, right) ? 1 : 0;
        return rightExact - leftExact || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })[0] ?? null;
  }, [alertRules, activeHousehold]);

  const latestHouseholdAlert = useMemo(() => {
    if (!activeHousehold) {
      return null;
    }

    return notifications
      .map((notification) => parseDisasterAlertNotification(notification))
      .filter((payload): payload is NonNullable<ReturnType<typeof parseDisasterAlertNotification>> => Boolean(payload))
      .filter((payload) => matchesHouseholdAlertScope(activeHousehold, payload))
      .sort((left, right) => new Date(right.issued_at).getTime() - new Date(left.issued_at).getTime())[0] ?? null;
  }, [activeHousehold, notifications]);

  const resolvedPurokRiskProfile = useMemo(
    () =>
      activeHousehold
        ? mergePurokRiskProfileWithAlertFallback({
          household: activeHousehold,
          profile: purokRiskProfile,
          notification: latestHouseholdAlert,
        })
        : null,
    [activeHousehold, purokRiskProfile, latestHouseholdAlert],
  );

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
        // Handled silently
      }
    }

    void fetchLiveWeather();
    return () => {
      cancelled = true;
    };
  }, [activeHousehold?.gps_lat, activeHousehold?.gps_long, activeRule]);

  const isAtRisk = Boolean(
    liveWeather &&
    ((activeRule?.min_rain_chance !== undefined && (liveWeather.current.rainChance ?? 0) >= activeRule.min_rain_chance) ||
      (activeRule?.min_wind_gust_kph !== undefined && (liveWeather.current.windGust ?? 0) >= activeRule.min_wind_gust_kph)),
  );
  const hasWarning =
    liveWeather?.alerts.some((a) => a.severity === 'warning') || latestHouseholdAlert?.severity === 'warning';

  if (!user || !isResidentUser(user)) {
    return null;
  }

  const formattedPurokName = formatPurok(activeHousehold?.purok_sitio);

  return (
    <ResidentShell
      title="Portal sa Residente"
      subtitle={
        activeHousehold
          ? `Maayong adlaw! Naka-link ang inyong aktibong panimalay sa ${formattedPurokName}, Mabini.`
          : 'Paghimo og rehistrasyon sa panimalay aron masubay ang inyong mga serbisyo ug ayuda gikan sa MSWDO.'
      }
    >
      {/* Onboarding Banner for first-time unverified residents */}
      {shouldShowRegistrationOnboarding ? (
        <div className="mb-6 overflow-hidden rounded-[32px] border-2 border-cyan-200 bg-[linear-gradient(135deg,#ecfeff,#ffffff_55%,#f0fdfa)] p-6 shadow-[0_22px_58px_-38px_rgba(8,47,73,0.35)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-cyan-950 text-white shadow-md">
                <FilePlus2 className="h-8 w-8 text-cyan-300" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-800">Unang Lakang Alang sa Pamilya</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  Irehistro ang Inyong Panimalay Karon
                </h2>
                <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
                  Wala pa kay narehistrong panimalay sa Mabini. Irehistro ang inyong pamilya aron maapil sa opisyal nga
                  listahan sa MSWDO alang sa ayuda, relief goods, ug disaster response.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                  <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 shadow-sm">
                    1. Isulat ang mga sakop sa pamilya
                  </span>
                  <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 shadow-sm">
                    2. Isumite alang sa review
                  </span>
                  <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 shadow-sm">
                    3. Makadawat og pahibalo sa food pack release
                  </span>
                </div>
              </div>
            </div>
            <Link
              href="/households/register"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-cyan-950 px-8 text-base font-bold text-white shadow-lg transition hover:bg-cyan-900"
            >
              Irehistro Na Karon
              <ArrowRight className="h-5 w-5 text-cyan-300" />
            </Link>
          </div>
        </div>
      ) : null}

      {/* 1. CITIZEN HOUSEHOLD IDENTITY CARD (No fake static QR code; strictly profile & release indicator) */}
      {activeHousehold ? (
        <div className="relative overflow-hidden rounded-[32px] border-2 border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/40 to-teal-50/60 p-6 shadow-[0_24px_54px_-32px_rgba(6,78,59,0.25)] sm:p-8">
          {/* Decorative Glow */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-200/30 blur-3xl" />

          <div className="relative z-10">
            {/* Top Seal & Official Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200/60 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-800">
                  Republika sa Pilipinas · Munisipyo sa Mabini · DSWD / MSWDO
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100/80 px-3.5 py-1 text-xs font-bold text-emerald-900 shadow-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                Opisyal nga Rehistrado (Active Household)
              </div>
            </div>

            {/* Head Name & Address */}
            <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-700">Maayong adlaw sa inyong pamilya,</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(true)}
                    className="group flex items-center gap-2.5 text-left transition hover:opacity-95 active:scale-[0.99]"
                    title="Pislita aron ablihan ang Imong Opisyal nga Profile ug Digital ID Pass"
                  >
                    <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl group-hover:text-emerald-950 group-hover:underline underline-offset-4 decoration-emerald-500/50">
                      {activeHousehold.head_name}
                    </h1>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white/95 px-3 py-1 text-xs font-bold text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 active:scale-95"
                    title="Tan-awa ang Profile & Digital ID Pass"
                  >
                    <IdCard className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Tan-awa ang Profile & ID</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMasterQrModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-teal-400 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-900 shadow-sm transition hover:border-teal-500 hover:bg-teal-100 active:scale-95"
                    title="Ablihi ang Master Evac QR Pass (Offline-ready)"
                  >
                    <QrCode className="h-3.5 w-3.5 text-teal-700" />
                    <span>Akong Evac QR Pass (Offline)</span>
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1 text-slate-800 shadow-sm">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                    {formattedPurokName}, Brgy. {activeHousehold.barangay_name || 'Cuambog'}, Mabini
                  </span>
                  <Link
                    href="/resident/household"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1 text-slate-800 shadow-sm transition hover:text-emerald-900 hover:bg-emerald-50"
                  >
                    <Users className="h-4 w-4 text-cyan-700" />
                    {activeHouseholdResidents.length || 1} ka Miyembro sa Balay
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-mono font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 active:scale-95"
                    title="Pislita aron ablihan ang Household Profile"
                  >
                    ID: HH-{activeHousehold.id.slice(0, 8).toUpperCase()}
                  </button>
                </div>
              </div>

              {/* Action Buttons: View Household & Food Pack Release Status */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {unclaimedEligibleCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Open the first active eligible release QR directly
                      const firstUnclaimed = eligibleFoodPackReleases.find(
                        (r) => !r.claimedRecord && r.payload.status !== 'completed',
                      );
                      if (firstUnclaimed) {
                        setSelectedDistributionEvent({
                          eventId: firstUnclaimed.payload.event_id,
                          title: firstUnclaimed.notification.title,
                          location: firstUnclaimed.payload.location,
                          schedule: firstUnclaimed.payload.scheduled_date,
                          audienceLabel: getDistributionNotificationAudienceLabel(
                            firstUnclaimed.payload.target_scope,
                            firstUnclaimed.payload.target_group,
                          ),
                          matchedResidentNames: firstUnclaimed.eligibility.matchedResidents.map((r) => r.full_name),
                          claimedRecord: firstUnclaimed.claimedRecord,
                        });
                      } else {
                        noticesSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className="group relative flex w-full sm:w-auto items-center gap-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 px-5 py-3 text-white shadow-lg shadow-emerald-950/20 transition-all duration-200 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-600 hover:shadow-xl hover:shadow-emerald-950/30 hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 border border-white/25 shadow-inner backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
                      <QrCode className="h-5 w-5 text-white" />
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400 ring-2 ring-emerald-700" />
                      </span>
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-sm">
                          <Package className="h-3 w-3" />
                          {unclaimedEligibleCount} Food Pack Release
                        </span>
                        <span className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-200">
                          Apil Ka!
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-extrabold leading-snug text-white">
                        Pislita aron ablihan ang Event QR Code
                      </div>
                    </div>
                    <div className="ml-auto hidden pl-2 sm:block">
                      <ArrowRight className="h-4 w-4 text-emerald-200 transition-transform duration-200 group-hover:translate-x-1" />
                    </div>
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/80 bg-white/90 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Walay pending nga food pack release karong adlawa</span>
                  </div>
                )}

                <Link
                  href="/resident/household"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl border-2 border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-950 active:scale-[0.99]"
                >
                  <Users className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>Tan-awa ang Pamilya</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 1.5 EVACUATION SHELTER STATUS & SELF CHECK-IN CARD */}
      {activeHousehold && (
        <div className="mt-4">
          {activeEvacRecord ? (
            /* Sheltered Banner */
            <div className="overflow-hidden rounded-[28px] border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                    <TentTree className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Naka-check-in sa Evacuation Center
                    </span>
                    <h3 className="text-base font-black text-slate-950 mt-0.5">
                      {activeEvacRecord.evacuation_center_name}
                    </h3>
                    <p className="text-xs text-slate-600">
                      Luwas nga nagpasilong ang inyong panimalay ({activeEvacRecord.family_members_count} ka sakop).
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMasterQrModal(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 py-2.5 text-xs font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50 active:scale-95"
                  >
                    <QrCode className="h-4 w-4 text-emerald-700" />
                    <span>Akong Evac QR Pass</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSelfCheckOut()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 active:scale-95"
                  >
                    <LogOut className="h-4 w-4 text-slate-500" />
                    <span>I-check Out (Nakapauli na)</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Not Sheltered: Self Check-in Banner & Offline QR Pass */
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-emerald-300/70 bg-gradient-to-br from-emerald-50/90 via-teal-50/50 to-white p-4.5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
                  <TentTree className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-slate-950">Naa ba kamo karon sa Evacuation Center?</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800">
                      Offline Ready
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Ipakita ang inyong <strong>Master QR Pass</strong> bisan walay internet, o i-scan ang <strong>QR Poster sa Entrance</strong>.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMasterQrModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-emerald-600 bg-white px-4 py-2.5 text-xs font-black text-emerald-900 shadow-sm transition hover:bg-emerald-50 active:scale-95"
                  title="Ablihi ang QR code nga pwede i-screenshot o i-save sa gallery bisan walay signal"
                >
                  <QrCode className="h-4 w-4 text-emerald-700" />
                  <span>Akong Evac QR Pass (Offline)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowEvacScannerModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-2.5 text-xs font-black text-white shadow-md transition hover:from-emerald-700 hover:to-teal-800 active:scale-95"
                >
                  <Camera className="h-4 w-4 text-emerald-200" />
                  <span>I-scan ang Evac Center QR</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. KALINAW SA HUNAHUNA (Clear Community Safety & Flood Monitor Banner) */}
      {activeHousehold ? (
        <div className="mt-6">
          {isAtRisk || hasWarning ? (
            /* Emergency / Warning Active State */
            <div className="overflow-hidden rounded-[30px] border-2 border-rose-400 bg-gradient-to-br from-rose-50 via-amber-50 to-orange-50 p-6 shadow-[0_20px_50px_-28px_rgba(225,29,72,0.4)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-md animate-bounce">
                    <AlertTriangle className="h-8 w-8" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-white">
                      <Siren className="h-3.5 w-3.5" />
                      Pahimangno sa Baha / Kusog nga Ulan!
                    </div>
                    <h2 className="mt-2 text-2xl font-black text-rose-950 sm:text-3xl">
                      Mag-amping ang {formattedPurokName}!
                    </h2>
                    <p className="mt-1.5 text-base font-semibold leading-relaxed text-rose-900">
                      Adunay detected nga kusog nga ulan o peligro sa pagbaha sa inyong lugar. Palihog mag-andam sa
                      inyong pamilya ug bantayi ang palibot.
                    </p>

                    <div className="mt-3.5 flex flex-wrap gap-2.5">
                      <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white/90 px-3.5 py-2 text-sm font-bold text-rose-950 shadow-sm">
                        <span>🏃 Inyong Dangpanan (Evacuation Site):</span>
                        <span className="rounded-md bg-rose-100 px-2 py-0.5 text-rose-800">
                          {resolvedPurokRiskProfile?.default_evacuation_site || 'San Roque Barangay Gym'}
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white/90 px-3.5 py-2 text-sm font-medium text-rose-900 shadow-sm">
                        🎒 I-andam ang emergency go-bag (tubig, suga, tambal, importanteng dokumento)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowHotlinesModal(true)}
                    className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-6 text-sm font-black text-white shadow-lg transition hover:bg-rose-700"
                  >
                    <PhoneCall className="h-5 w-5" />
                    Tawag sa Rescue (MDRRMO)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWeatherDetails(!showWeatherDetails)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-300 bg-white/80 px-4 text-xs font-bold text-rose-900 transition hover:bg-white"
                  >
                    <CloudRain className="h-4 w-4 text-rose-600" />
                    {showWeatherDetails ? 'Tagoa ang Weather' : 'Tan-awa ang Weather Report'}
                  </button>
                </div>
              </div>

              {showWeatherDetails ? (
                <div className="mt-5 border-t border-rose-200/80 pt-5">
                  <WeatherWidget
                    mode="compact"
                    className="shadow-none border border-rose-200 bg-white rounded-2xl"
                    lat={activeHousehold.gps_lat ?? activeRule?.trigger_lat}
                    lng={activeHousehold.gps_long ?? activeRule?.trigger_lng}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            /* Normal Calm Soothing State */
            <div className="overflow-hidden rounded-[30px] border-2 border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-cyan-50/70 p-6 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.2)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                    <ShieldCheck className="h-8 w-8" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800">
                      <Sparkles className="h-3 w-3 text-emerald-600" />
                      Kalinaw sa Hunahuna · Status sa Komunidad
                    </div>
                    <h2 className="mt-1.5 text-2xl font-black text-slate-950 sm:text-3xl">
                      Luwas ug Kalma ang {formattedPurokName}
                    </h2>
                    <p className="mt-1 text-base leading-relaxed text-slate-600">
                      Walay aktibong advisory sa baha o kusog nga ulan karong orasa sa inyong barangay. Luwas ang inyong
                      panimalay ug kasilinganan.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                        📍 Dangpanan kon magkinahanglan:
                        <strong className="text-emerald-900">
                          {resolvedPurokRiskProfile?.default_evacuation_site || 'San Roque Barangay Gym'}
                        </strong>
                      </span>
                      {liveWeather ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                          <SunMedium className="h-4 w-4 text-amber-500" />
                          {Math.round(liveWeather.current.temperature ?? 28)}°C ·{' '}
                          {liveWeather.current.weatherLabel || 'Hayag ang panahon'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWeatherDetails(!showWeatherDetails)}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-white px-5 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
                  >
                    <SunMedium className="h-4 w-4 text-amber-500" />
                    {showWeatherDetails ? 'Tagoa ang Panahon' : 'Tan-awa ang Panahon'}
                    {showWeatherDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {showWeatherDetails ? (
                <div className="mt-5 border-t border-emerald-200 pt-5">
                  <WeatherWidget
                    mode="compact"
                    className="shadow-none border border-emerald-100 bg-white rounded-2xl"
                    lat={activeHousehold.gps_lat ?? activeRule?.trigger_lat}
                    lng={activeHousehold.gps_long ?? activeRule?.trigger_lng}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* 3. 4 KA DAGKO UG SAYON PISLITON NGA TOUCH TILES (SENIOR TOUCH TARGETS) */}
      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Mga Pangunang Serbisyo</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Tile 1: Akong Pamilya */}
          <Link
            href="/resident/household"
            className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.12)] transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-lg"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white">
                  <Users className="h-7 w-7" />
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                  {activeHouseholdResidents.length || 1} Miyembro
                </span>
              </div>
              <h4 className="mt-4 text-xl font-black tracking-tight text-slate-950">Akong Pamilya</h4>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                Tan-awa ang mga rehistradong sakop sa panimalay (Seniors, Kabataan, PWD).
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:text-indigo-700">
              Bukasang talaan <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
            </div>
          </Link>

          {/* Tile 2: Ayuda & Relief Updates */}
          <button
            type="button"
            onClick={() => {
              noticesSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border-2 border-slate-200 bg-white p-5 text-left shadow-[0_16px_40px_-24px_rgba(15,23,42,0.12)] transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white">
                  <Package className="h-7 w-7" />
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  {unclaimedEligibleCount > 0 ? `${unclaimedEligibleCount} Kuhaonon` : 'Updated'}
                </span>
              </div>
              <h4 className="mt-4 text-xl font-black tracking-tight text-slate-950">Ayuda & Relief</h4>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                Iskedyul sa pag-apod-apod og bugas, food packs, ug hinabang sa inyong purok.
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 group-hover:text-emerald-700">
              Tan-awa ang ayuda <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
            </div>
          </button>

          {/* Tile 3: 1-Tap Emergency Hotlines */}
          <button
            type="button"
            onClick={() => setShowHotlinesModal(true)}
            className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border-2 border-rose-200 bg-gradient-to-br from-rose-50/50 to-white p-5 text-left shadow-[0_16px_40px_-24px_rgba(225,29,72,0.2)] transition hover:-translate-y-1 hover:border-rose-400 hover:shadow-lg"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition group-hover:scale-110 group-hover:bg-rose-600 group-hover:text-white">
                  <PhoneCall className="h-7 w-7" />
                </div>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">
                  24/7 Hotline
                </span>
              </div>
              <h4 className="mt-4 text-xl font-black tracking-tight text-slate-950">Tawag sa Emergency</h4>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                Direktang tawag sa MDRRMO Rescue, Barangay Hall, Pulis, ug Bombero.
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-rose-600 group-hover:text-rose-700">
              Buksan ang mga numero <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
            </div>
          </button>

          {/* Tile 4: Mga Pahibalo sa Barangay */}
          <Link
            href="/resident/notifications"
            className="group relative flex flex-col justify-between overflow-hidden rounded-[28px] border-2 border-slate-200 bg-white p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.12)] transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-lg"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 transition group-hover:scale-110 group-hover:bg-cyan-950 group-hover:text-white">
                  <Bell className="h-7 w-7" />
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${unreadNotificationCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                    }`}
                >
                  {unreadNotificationCount > 0 ? `${unreadNotificationCount} Bag-o` : `${visibleNotifications.length} Total`}
                </span>
              </div>
              <h4 className="mt-4 text-xl font-black tracking-tight text-slate-950">Mga Pahibalo</h4>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                Opisyal nga mga anunsyo ug abiso gikan sa MSWDO ug LGU Mabini.
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-cyan-800 group-hover:text-cyan-950">
              Basaha ang inbox <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* 4. PINAKABAG-ONG AYUDA UG PAHIBALO SA BARANGAY */}
      <div ref={noticesSectionRef} className="mt-8">
        <CivicPanel className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950 text-white">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-950">Ayuda & Food Pack Releases sa Inyong Purok</h3>
                  <p className="text-xs text-slate-500">
                    Mo-generate lamang og talagsaong (unique) QR code kon opisyal nga naapil ang inyong panimalay.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/resident/notifications"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Tan-awa ang Inbox ({visibleNotifications.length})
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {visibleNotifications.length > 0 ? (
            <div className="mt-5 space-y-4">
              {visibleNotifications.slice(0, 4).map((notification) => {
                const distributionPayload = parseDistributionEventNotification(notification);
                const disasterPayload = parseDisasterAlertNotification(notification);
                const isDistribution = Boolean(distributionPayload);

                // Check eligibility for distribution
                const eligibility = distributionPayload && activeHousehold
                  ? evaluateHouseholdDistributionEligibility({
                    household: activeHousehold,
                    notification: distributionPayload,
                    residents: activeHouseholdResidents,
                    flagsByResidentId,
                  })
                  : null;

                const isEligible = Boolean(eligibility?.eligible);
                const claimedRecord = distributionPayload
                  ? claimedRecordsByEventId.get(distributionPayload.event_id) ?? null
                  : null;

                const audienceLabel = distributionPayload
                  ? getDistributionNotificationAudienceLabel(
                    distributionPayload.target_scope,
                    distributionPayload.target_group,
                  )
                  : '';

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
                    className={`rounded-[26px] border-2 p-5 transition ${isDistribution
                        ? isEligible
                          ? claimedRecord
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : 'border-teal-300 bg-teal-50/50 shadow-sm'
                          : 'border-slate-200 bg-slate-50/60'
                        : notification.read_at
                          ? 'border-slate-200 bg-slate-50/60'
                          : 'border-rose-200 bg-rose-50/40'
                      }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-bold text-slate-950">{notification.title}</h4>
                          {isDistribution && distributionPayload ? (
                            <>
                              <CivicBadge
                                label={DISTRIBUTION_NOTIFICATION_STATUS_LABELS[distributionPayload.status]}
                                tone={claimedRecord ? 'emerald' : STATUS_BADGE_TONES[distributionPayload.status]}
                              />
                              {claimedRecord ? (
                                <CivicBadge label="✓ Nakuha Na" tone="emerald" />
                              ) : isEligible ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                                  Apil Ka
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                  Dili Apil
                                </span>
                              )}
                            </>
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

                        <p className="mt-2 text-sm leading-relaxed text-slate-700">{notification.body}</p>

                        {isDistribution && distributionPayload ? (
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                            <span>📅 Petsa: <strong>{formatScheduleDate(distributionPayload.scheduled_date)}</strong></span>
                            <span>📍 Lugar: <strong>{distributionPayload.location}</strong></span>
                            <span>👥 Target: <strong>{audienceLabel}</strong></span>
                          </div>
                        ) : null}

                        {disasterPayload?.evacuation_site?.trim() ? (
                          <div className="mt-2 text-xs font-bold text-emerald-800">
                            🏃 Dangpanan: {disasterPayload.evacuation_site.trim()}
                          </div>
                        ) : null}
                      </div>

                      {/* Unique Food Pack Release QR Code Trigger: STRICTLY when eligible! */}
                      {isDistribution && distributionPayload && activeHousehold ? (
                        <div className="shrink-0 pt-1 sm:pt-0">
                          {claimedRecord ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-2 text-xs font-bold text-emerald-900">
                              <PackageCheck className="h-4 w-4 text-emerald-700" />
                              Nakuha na ni {claimedRecord.received_by_name || activeHousehold.head_name}
                            </div>
                          ) : isEligible ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDistributionEvent({
                                  eventId: distributionPayload.event_id,
                                  title: notification.title,
                                  location: distributionPayload.location,
                                  schedule: distributionPayload.scheduled_date,
                                  audienceLabel,
                                  matchedResidentNames:
                                    eligibility?.matchedResidents.map((r) => r.full_name) || [activeHousehold.head_name],
                                  claimedRecord: null,
                                });
                              }}
                              className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-black text-white shadow-md transition hover:bg-emerald-800 active:scale-95"
                            >
                              <QrCode className="h-4 w-4" />
                              Ablihi ang Release QR Code
                            </button>
                          ) : (
                            <span className="inline-block text-xs font-medium text-slate-400 italic">
                              Wala maapil niini nga release
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-base font-bold text-slate-700">Walay bag-ong food pack release o pahibalo</p>
              <p className="mt-1 text-xs text-slate-500">
                Mo-update kini kung magpagula ang MSWDO og bag-ong hinabang o ayuda alang sa inyong purok.
              </p>
            </div>
          )}
        </CivicPanel>
      </div>

      {/* 5. MY REGISTRATION RECORDS (Clean, Reassuring, Foldable) */}
      <div className="mt-8">
        <CivicPanel className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-950">Opisyal nga Talaan sa Panimalay</h3>
              <p className="text-xs text-slate-500">
                {activeHousehold
                  ? 'Aprobado ug aktibo ang inyong rekord sa panimalay. Makita diri ang kasaysayan sa rehistrasyon.'
                  : 'Masubay dinhi ang status sa inyong gisumite nga rehistrasyon sa panimalay.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {activeHousehold ? (
                <button
                  type="button"
                  onClick={() => setShowRegistrationHistory(!showRegistrationHistory)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {showRegistrationHistory ? 'Tagoa ang Kasaysayan' : 'Tan-awa ang Kasaysayan'}
                  {showRegistrationHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <Link
                  href="/households/register"
                  className="inline-flex items-center gap-2 rounded-full bg-cyan-950 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-cyan-900"
                >
                  <FilePlus2 className="h-4 w-4 text-cyan-300" />
                  Bag-ong Rehistro
                </Link>
              )}
            </div>
          </div>

          {/* Pending registration indicator if household is not yet approved */}
          {!activeHousehold && records.length > 0 ? (
            <div className="mt-5 space-y-4">
              {records.map((record) => {
                const timeline = buildRegistrationTimeline(record);
                return (
                  <div key={record.id} className="rounded-[26px] border-2 border-amber-200 bg-amber-50/50 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-lg font-bold text-slate-950">{record.head_name}</h4>
                          <CivicBadge
                            label={formatRegistrationStatusLabel(getHouseholdRegistrationStatus(record))}
                            tone="amber"
                          />
                        </div>
                        <p className="mt-1.5 text-sm text-slate-600">
                          {record.street_address}, {formatPurok(record.purok_sitio)}, {record.barangay_name}, {record.municipality}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Gisumite kaniadtong {formatDate(record.registration_submitted_at || record.createdAt)}
                        </p>
                      </div>
                      <Link
                        href={`/households/register/status?id=${record.id}`}
                        className="inline-flex items-center gap-2 rounded-full bg-cyan-950 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-900"
                      >
                        Tan-awa ang Status
                      </Link>
                    </div>

                    <div className="mt-5 grid gap-2.5 sm:grid-cols-4">
                      {timeline.map((step) => (
                        <div
                          key={step.key}
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${step.state === 'done'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                              : step.state === 'current'
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                                : 'border-slate-200 bg-white text-slate-500'
                            }`}
                        >
                          {step.label}
                        </div>
                      ))}
                    </div>

                    {record.registration_review_notes?.trim() && (
                      <div className="mt-4 rounded-xl border border-amber-300 bg-white p-3.5 text-xs text-amber-900">
                        <strong>Mubo nga Pahibalo gikan sa Reviewer:</strong> {record.registration_review_notes.trim()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Approved Household summary / foldable history */}
          {activeHousehold && (
            <div className="mt-5">
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-emerald-950">{activeHousehold.head_name} (Aktibo)</h4>
                      <p className="text-xs text-emerald-800">
                        {formattedPurokName}, {activeHousehold.barangay_name || 'Cuambog'}, {activeHousehold.municipality}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/resident/household"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-50"
                  >
                    <Users className="h-3.5 w-3.5 text-emerald-600" />
                    Bukasang Talaan sa Pamilya
                  </Link>
                </div>
              </div>

              {showRegistrationHistory && records.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mga miaging submisyon:</p>
                  {records.map((record) => (
                    <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{record.head_name}</span>
                        <CivicBadge
                          label={formatRegistrationStatusLabel(getHouseholdRegistrationStatus(record))}
                          tone={getHouseholdRegistrationStatus(record) === 'approved' ? 'emerald' : 'amber'}
                        />
                      </div>
                      <p className="mt-1 text-slate-500">
                        {record.street_address}, {formatPurok(record.purok_sitio)} · Submitted {formatDate(record.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CivicPanel>
      </div>

      {/* 6. MODAL DIALOG: 🎟️ UNIQUE EVENT RELEASE QR CODE (Generated ONLY for this specific food pack release) */}
      <Dialog
        open={Boolean(selectedDistributionEvent)}
        onOpenChange={(open) => {
          if (!open) setSelectedDistributionEvent(null);
        }}
      >
        <DialogContent className="max-w-lg rounded-[32px] border-slate-200 bg-white p-0 shadow-2xl overflow-hidden">
          {selectedDistributionEvent && activeHousehold ? (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-cyan-950 px-6 py-6 text-white text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 p-1.5 shadow-inner">
                  <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
                </div>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">
                  Opisyal nga Food Pack Release QR Code
                </p>
                <DialogTitle className="mt-1 text-xl font-black text-white">
                  {selectedDistributionEvent.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-emerald-100 mt-1">
                  Kini nga QR code talagsaon (unique) alang lamang niining maong distribusyon sa food packs.
                </DialogDescription>
              </div>

              {/* Event Details & Unique QR Generator */}
              <div className="p-6">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-1.5 mb-2">
                  <p>
                    <span className="text-slate-500">Ulo sa Panimalay:</span>{' '}
                    <strong className="text-slate-900">{activeHousehold.head_name}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Lugar sa Pag-claim:</span>{' '}
                    <strong className="text-slate-900">{selectedDistributionEvent.location}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Target Audience:</span>{' '}
                    <strong className="text-emerald-800">{selectedDistributionEvent.audienceLabel}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">Iskedyul:</span>{' '}
                    <strong className="text-slate-900">{formatScheduleDate(selectedDistributionEvent.schedule)}</strong>
                  </p>
                </div>

                {/* The actual cryptographic unique QR code from /api/distribution/qr */}
                <DistributionNotificationQr
                  eventId={selectedDistributionEvent.eventId}
                  householdHeadName={activeHousehold.head_name}
                  audienceLabel={selectedDistributionEvent.audienceLabel}
                  matchedResidentNames={selectedDistributionEvent.matchedResidentNames}
                  claimedRelease={
                    selectedDistributionEvent.claimedRecord
                      ? {
                        receivedByName:
                          selectedDistributionEvent.claimedRecord.received_by_name ||
                          selectedDistributionEvent.claimedRecord.beneficiary_name,
                        claimedAt: selectedDistributionEvent.claimedRecord.timestamp,
                      }
                      : null
                  }
                />

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setSelectedDistributionEvent(null)}
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Isira / Close
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 7. MODAL DIALOG: 📞 1-TAP EMERGENCY HOTLINES MODAL */}
      <Dialog open={showHotlinesModal} onOpenChange={setShowHotlinesModal}>
        <DialogContent className="max-w-lg rounded-[32px] border-slate-200 bg-white p-0 shadow-[0_28px_80px_-38px_rgba(225,29,72,0.4)] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white shadow-sm">
                <PhoneCall className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-rose-200">24/7 Libreng Tawag</p>
                <DialogTitle className="text-xl font-black text-white">
                  Mabini Emergency Hotlines
                </DialogTitle>
              </div>
            </div>
            <DialogDescription className="mt-2 text-xs text-rose-100">
              Pislita ang berdeng buton nga <strong>&quot;Tawag Karon&quot;</strong> aron direktang motawag gikan sa inyong cellphone.
            </DialogDescription>
          </div>

          {/* Hotline Contact List */}
          <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-3">
            {EMERGENCY_HOTLINES.map((hotline) => (
              <div
                key={hotline.id}
                className="flex flex-col gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-slate-950">{hotline.name}</h4>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {hotline.tag}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{hotline.description}</p>
                  <p className="mt-1 text-sm font-mono font-bold text-slate-800">
                    {hotline.phone} {hotline.altPhone ? `· ${hotline.altPhone}` : ''}
                  </p>
                </div>

                <a
                  href={`tel:${hotline.phone}`}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-md transition hover:bg-emerald-700 active:scale-95"
                >
                  <Phone className="h-4 w-4" />
                  Tawag Karon
                </a>
              </div>
            ))}
          </div>

          <DialogFooter className="border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={() => setShowHotlinesModal(false)}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 sm:w-auto sm:px-6"
            >
              Isira / Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. RESIDENT PROFILE & OFFICIAL DIGITAL ID PASS MODAL */}
      <ResidentProfileModal
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
        household={activeHousehold}
        resident={
          activeHouseholdResidents.find((r) => r.relationship_to_head?.toLowerCase() === 'head') ||
          activeHouseholdResidents[0] ||
          null
        }
        flags={
          activeHouseholdResidents[0]
            ? flagsByResidentId.get(activeHouseholdResidents[0].id) || null
            : null
        }
        purokRiskProfile={purokRiskProfile}
      />

      {/* 8. RESIDENT EVACUATION CENTER POSTER SCANNER MODAL */}
      <ResidentEvacScannerModal
        open={showEvacScannerModal}
        onOpenChange={setShowEvacScannerModal}
        household={activeHousehold}
        onCheckInSuccess={(rec) => {
          setActiveEvacRecord(rec);
        }}
      />

      {/* 9. RESIDENT MASTER EVAC QR PASS (OFFLINE READY) */}
      <ResidentMasterQrModal
        open={showMasterQrModal}
        onOpenChange={setShowMasterQrModal}
        household={activeHousehold}
        familyMembersCount={activeHouseholdResidents.length || 1}
        vulnerabilities={householdVulnerabilities}
      />
    </ResidentShell>
  );
}

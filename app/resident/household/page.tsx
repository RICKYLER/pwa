'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Home,
  Mail,
  MapPin,
  Phone,
  Plus,
  QrCode,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import ResidentShell from '@/components/resident/ResidentShell';
import { PurokFloodProfileCard } from '@/components/PurokFloodProfileCard';
import { CivicBadge, CivicKpiCard, CivicPanel, CivicSectionHeading } from '@/components/ui/civic-primitives';
import { cn } from '@/lib/utils';
import {
  useResidentLanguage,
  getCivilStatusTranslation,
  getGenderTranslation,
  getIncomeLevelTranslation,
  getRelationshipTranslation,
  getPwdTypeTranslation,
  type ResidentLanguage,
} from '@/lib/i18n/resident-language';
import { getCurrentUser, getDefaultRouteForUser, isResidentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import { getPurokRiskProfile } from '@/lib/db/purok-risk-profiles';
import { getUserNotifications } from '@/lib/db/user-notifications';
import {
  createResident,
  getResidentsInHousehold,
  updateHealthFlags,
} from '@/lib/db/residents';
import type {
  CivilStatus,
  Gender,
  Household,
  IncomeLevel,
  PWDType,
  Resident,
  PurokRiskProfile,
  UserNotification,
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';
import { joinNameParts } from '@/lib/name-parts';
import { resolveResidentActiveApprovedHousehold } from '@/lib/resident-households';
import { parseDisasterAlertNotification } from '@/lib/disaster-alerts';
import { matchesHouseholdAlertScope, mergePurokRiskProfileWithAlertFallback } from '@/lib/purok-risk-profiles';
import {
  calculateAge,
  getPregnancyProgress,
  getCurrentVulnerabilityFlagsMapForResidents,
} from '@/lib/db/vulnerability';

declare global {
  interface WindowEventMap {
    'mswdo-data-changed': CustomEvent<{
      source: 'supabase';
      table: string;
      mode: 'hydrate' | 'change';
    }>;
  }
}

const CIVIL_STATUSES: CivilStatus[] = ['single', 'married', 'widowed', 'separated'];
const INCOME_LEVELS: IncomeLevel[] = ['low', 'middle', 'high'];
const PWD_TYPE_LABELS: Record<PWDType, string> = {
  physical: 'Physical',
  visual: 'Visual',
  hearing: 'Hearing',
  intellectual: 'Intellectual',
  psychosocial: 'Psychosocial',
};
const RELATIONSHIP_OPTIONS = [
  'Child',
  'Mother',
  'Father',
  'Spouse',
  'Brother',
  'Sister',
  'Grandmother',
  'Grandfather',
  'Parent',
  'Relative',
] as const;

type MemberBadgeTone = 'slate' | 'teal' | 'emerald' | 'amber' | 'rose' | 'navy';

type MemberFormState = {
  first_name: string;
  middle_name: string;
  last_name: string;
  birthdate: string;
  gender: Gender;
  relationship_to_head: string;
  civil_status: CivilStatus;
  occupation: string;
  income_level: IncomeLevel;
  contact_number: string;
  is_pregnant: boolean;
  pregnancy_months: number | '';
  expected_delivery_date: string;
  is_pwd: boolean;
  pwd_type: PWDType | '';
};

const EMPTY_MEMBER_FORM: MemberFormState = {
  first_name: '',
  middle_name: '',
  last_name: '',
  birthdate: '',
  gender: 'M',
  relationship_to_head: '',
  civil_status: 'single',
  occupation: '',
  income_level: 'middle',
  contact_number: '',
  is_pregnant: false,
  pregnancy_months: '',
  expected_delivery_date: '',
  is_pwd: false,
  pwd_type: '',
};

function formatSentenceCase(value?: string) {
  if (!value) {
    return 'Not provided';
  }

  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatRelationshipLabel(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function buildMemberBadges(member: Resident, flags?: VulnerabilityFlags, lang: ResidentLanguage = 'ceb') {
  const age = calculateAge(member.birthdate);
  const badges: Array<{ label: string; tone: MemberBadgeTone }> = [
    { label: `${age} ${lang === 'ceb' ? 'ka tuig' : 'yrs'}`, tone: 'slate' },
    { label: member.gender === 'F' ? (lang === 'ceb' ? 'Babaye' : 'Female') : (lang === 'ceb' ? 'Lalaki' : 'Male'), tone: 'teal' },
  ];

  if (age < 18) {
    if (age < 2) {
      badges.push({ label: lang === 'ceb' ? 'Masuso' : 'Infant', tone: 'rose' });
    }
    badges.push({ label: lang === 'ceb' ? 'Menor de Edad' : 'Minor', tone: 'amber' });
  } else if (age >= 60) {
    badges.push({ label: 'Senior', tone: 'amber' });
  }

  if (flags?.is_pregnant) {
    badges.push({ label: lang === 'ceb' ? 'Mabdos' : 'Pregnant', tone: 'rose' });
    if (typeof flags.pregnancy_months === 'number') {
      badges.push({
        label: `${flags.pregnancy_months} ${lang === 'ceb' ? 'ka bulan' : 'months'}`,
        tone: 'rose',
      });
    }
  }

  if (flags?.is_pwd) {
    badges.push({
      label: flags.pwd_type ? `PWD - ${getPwdTypeTranslation(flags.pwd_type, lang)}` : 'PWD',
      tone: 'navy',
    });
  }

  if (flags?.is_low_income) {
    badges.push({ label: lang === 'ceb' ? 'Ubos og kita' : 'Low income', tone: 'emerald' });
  }

  if (flags?.is_4ps) {
    badges.push({ label: '4Ps', tone: 'emerald' });
  }

  if (flags?.is_indigent) {
    badges.push({ label: lang === 'ceb' ? 'Pobre / Indigent' : 'Indigent', tone: 'navy' });
  }

  return badges;
}

function formatDate(value?: Date): string {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function ResidentHouseholdPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const { t, lang } = useResidentLanguage();
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Resident[]>([]);
  const [memberFlagsByResidentId, setMemberFlagsByResidentId] = useState<Map<string, VulnerabilityFlags>>(new Map());
  const [purokRiskProfile, setPurokRiskProfile] = useState<PurokRiskProfile | null>(null);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<MemberFormState>(EMPTY_MEMBER_FORM);

  function updateFormField<K extends keyof MemberFormState>(key: K, value: MemberFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
    if (memberError) {
      setMemberError('');
    }
  }

  const loadData = useCallback(async (currentUser: NonNullable<typeof user>) => {
    const [households, inboxItems] = await Promise.all([
      getHouseholds({
        applicant_user_id: currentUser.id,
        applicant_email: currentUser.email,
      }),
      getUserNotifications(),
    ]);
    const activeHousehold = resolveResidentActiveApprovedHousehold(households);

    if (!activeHousehold) {
      setHousehold(null);
      setMembers([]);
      setMemberFlagsByResidentId(new Map());
      setPurokRiskProfile(null);
      setNotifications(inboxItems);
      router.replace('/households/register');
      return;
    }

    const residentList = await getResidentsInHousehold(activeHousehold.id);
    const activeResidents = residentList.filter((resident) => resident.status === 'active');
    const flagsMap = await getCurrentVulnerabilityFlagsMapForResidents(activeResidents, [activeHousehold]);
    const profile = await getPurokRiskProfile(activeHousehold.barangay_id, activeHousehold.purok_sitio);
    setHousehold(activeHousehold);
    setMembers(activeResidents);
    setMemberFlagsByResidentId(flagsMap);
    setPurokRiskProfile(profile ?? null);
    setNotifications(inboxItems);
  }, [router]);

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

    async function initialize() {
      try {
        setIsLoading(true);
        await loadData(residentUser);
      } catch (error) {
        console.error('Failed to load resident household:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void initialize();

    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (
        event.detail.table !== 'households'
        && event.detail.table !== 'residents'
        && event.detail.table !== 'vulnerability_flags'
        && event.detail.table !== 'purok_risk_profiles'
        && event.detail.table !== 'user_notifications'
      ) {
        return;
      }

      void initialize();
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [loadData, router, user]);

  const memberSummary = useMemo(() => {
    return {
      total: members.length,
      children: members.filter((member) => calculateAge(member.birthdate) < 18).length,
      seniors: members.filter((member) => calculateAge(member.birthdate) >= 60).length,
    };
  }, [members]);

  const latestHouseholdAlert = useMemo(() => {
    if (!household) {
      return null;
    }

    return notifications
      .map((notification) => parseDisasterAlertNotification(notification))
      .filter((payload): payload is NonNullable<ReturnType<typeof parseDisasterAlertNotification>> => Boolean(payload))
      .filter((payload) => matchesHouseholdAlertScope(household, payload))
      .sort((left, right) => new Date(right.issued_at).getTime() - new Date(left.issued_at).getTime())[0] ?? null;
  }, [household, notifications]);

  const resolvedPurokRiskProfile = useMemo(
    () => (
      household
        ? mergePurokRiskProfileWithAlertFallback({
          household,
          profile: purokRiskProfile,
          notification: latestHouseholdAlert,
        })
        : null
    ),
    [household, purokRiskProfile, latestHouseholdAlert],
  );

  const draftBadges = useMemo(() => {
    const labels: Array<{ label: string; tone: MemberBadgeTone }> = [];
    const age = form.birthdate ? calculateAge(form.birthdate) : null;
    const pregnancyProgress = getPregnancyProgress(
      typeof form.pregnancy_months === 'number' ? form.pregnancy_months : null,
    );

    if (age !== null) {
      if (age < 18) {
        labels.push({ label: 'Minor', tone: 'amber' });
      } else if (age >= 60) {
        labels.push({ label: 'Senior', tone: 'amber' });
      }
    }

    if (form.is_pregnant) {
      labels.push({ label: 'Pregnant', tone: 'rose' });
      if (typeof form.pregnancy_months === 'number') {
        labels.push({ label: `${form.pregnancy_months} months`, tone: 'rose' });
        if (pregnancyProgress) {
          labels.push({ label: pregnancyProgress.trimesterLabel, tone: 'rose' });
        }
      }
    }

    if (form.is_pwd) {
      labels.push({
        label: form.pwd_type ? `PWD - ${PWD_TYPE_LABELS[form.pwd_type]}` : 'PWD',
        tone: 'navy',
      });
    }

    if (form.income_level === 'low') {
      labels.push({ label: 'Low income', tone: 'emerald' });
    }

    return labels;
  }, [form.birthdate, form.income_level, form.is_pregnant, form.pregnancy_months, form.is_pwd, form.pwd_type]);

  const memberPregnancyProgress = getPregnancyProgress(
    typeof form.pregnancy_months === 'number' ? form.pregnancy_months : null,
  );

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!household) {
      return;
    }

    const errors: Record<string, string> = {};

    if (!form.first_name.trim()) {
      errors.first_name = t('firstNameRequired');
    }

    if (!form.last_name.trim()) {
      errors.last_name = t('lastNameRequired');
    }

    if (!form.birthdate) {
      errors.birthdate = t('birthdateRequired');
    }

    if (!form.relationship_to_head.trim()) {
      errors.relationship_to_head = t('relationshipRequired');
    }

    if (form.is_pregnant && form.gender !== 'F') {
      errors.gender = t('pregnantFemaleRequired');
    }

    if (form.is_pregnant) {
      const months = Number(form.pregnancy_months);
      if (!Number.isFinite(months) || months < 1 || months > 9) {
        errors.pregnancy_months = t('pregnancyMonthsRequired');
      }
      if (!form.expected_delivery_date) {
        errors.expected_delivery_date = t('eddRequired');
      }
    }

    if (form.is_pwd && !form.pwd_type) {
      errors.pwd_type = t('pwdTypeRequired');
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setMemberError(t('formErrorSummary'));
      const firstInvalidKey = Object.keys(errors)[0];
      const element = document.querySelector(`[name="${firstInvalidKey}"]`) as HTMLElement | null;
      element?.focus();
      return;
    }

    setFieldErrors({});
    setMemberError('');
    setIsSubmitting(true);

    try {
      const createdResident = await createResident({
        household_id: household.id,
        full_name: joinNameParts(form.first_name, form.middle_name, form.last_name),
        birthdate: form.birthdate,
        gender: form.gender,
        relationship_to_head: formatRelationshipLabel(form.relationship_to_head),
        status: 'active',
        civil_status: form.civil_status,
        occupation: form.occupation.trim() || undefined,
        income_level: form.income_level,
        contact_number: form.contact_number.trim() || undefined,
      });

      if (form.is_pregnant || form.is_pwd) {
        await updateHealthFlags(createdResident.id, {
          is_pregnant: form.is_pregnant,
          pregnancy_months: form.is_pregnant && typeof form.pregnancy_months === 'number' ? form.pregnancy_months : undefined,
          expected_delivery_date: form.is_pregnant ? form.expected_delivery_date || undefined : undefined,
          is_pwd: form.is_pwd,
          pwd_type: form.is_pwd && form.pwd_type ? form.pwd_type : undefined,
        });
      }

      setForm(EMPTY_MEMBER_FORM);
      setShowAddMember(false);
      if (user && isResidentUser(user)) {
        await loadData(user);
      }
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : 'Failed to add member.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user || !isResidentUser(user)) {
    return null;
  }

  return (
    <ResidentShell
      title={lang === 'ceb' ? 'Akong Panimalay' : 'My Household'}
      subtitle={
        lang === 'ceb'
          ? 'Tan-awa ang imong naaprobahan nga panimalay ug idugang ang mga sakop kon dunay kausaban.'
          : 'Review your approved household and add members when your family record changes.'
      }
    >
      {isLoading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center shadow-[0_18px_46px_-36px_rgba(15,23,42,0.24)]">
          <Clock3 className="mx-auto h-8 w-8 animate-pulse text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">
            {lang === 'ceb' ? 'Gikuha ang impormasyon sa imong panimalay...' : 'Loading your approved household...'}
          </p>
        </div>
      ) : household ? (
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* ========================================================= */}
          {/* LEFT SIDEBAR: Digital ID Card, Quick Stats & Risk Profile  */}
          {/* ========================================================= */}
          <div className="space-y-6 lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24">
            {/* Holographic Government Citizen Card */}
            <div className="relative overflow-hidden rounded-[28px] border border-cyan-800/40 bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-950 p-6 text-white shadow-xl">
              {/* Background decorative glow */}
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-teal-500/10 blur-2xl" />

              {/* Header Badge Row */}
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-cyan-300 shadow-xs">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">Mabini MSWDO</p>
                    <p className="text-[9px] text-slate-400">Citizen Household Registry</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {lang === 'ceb' ? 'Naaprobahan' : 'Approved'}
                </span>
              </div>

              {/* Head Profile */}
              <div className="mt-5 flex items-start gap-3.5">
                <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-black text-white shadow-md">
                  {household.head_name ? household.head_name.slice(0, 2).toUpperCase() : 'HH'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {lang === 'ceb' ? 'Pangulo sa Panimalay' : 'Head of Household'}
                  </p>
                  <h2 className="mt-0.5 truncate text-lg font-black tracking-tight text-white">
                    {household.head_name}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
                    <Mail className="h-3 w-3 text-cyan-400 shrink-0" />
                    <span className="truncate">{household.applicant_email || user.email}</span>
                  </p>
                </div>
              </div>

              {/* Address Box */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm space-y-2 text-xs text-slate-200">
                <p className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    {household.street_address}, {household.purok_sitio}, {household.barangay_name}, {household.municipality}
                  </span>
                </p>
                {household.contact_number && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span>{household.contact_number}</span>
                  </p>
                )}
              </div>

              {/* Quick Action Button for Digital Pass */}
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('mswdo-open-resident-profile'));
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/30 py-2.5 text-xs font-bold transition active:scale-[0.98]"
              >
                <QrCode className="h-4 w-4" />
                <span>{lang === 'ceb' ? 'Ablihi ang Digital ID Pass & QR' : 'Open Digital ID Pass & QR'}</span>
              </button>
            </div>

            {/* Vital Statistics Bento Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'ceb' ? 'Mga Sakop' : 'Members'}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">{memberSummary.total}</span>
                  <span className="text-xs text-slate-500">{lang === 'ceb' ? 'aktibo' : 'active'}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {memberSummary.children} {lang === 'ceb' ? 'bata' : 'children'} · {memberSummary.seniors} {lang === 'ceb' ? 'senior' : 'seniors'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'ceb' ? 'Rebyu' : 'Status'}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-sm font-black text-emerald-700">
                    {household.registration_reviewed_at
                      ? (lang === 'ceb' ? 'Naaprobahan' : 'Approved')
                      : (lang === 'ceb' ? 'Nakatala' : 'On file')}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {formatDate(household.registration_reviewed_at || household.updatedAt)}
                </p>
              </div>
            </div>

            {/* Purok Environmental Risk Profile */}
            <PurokFloodProfileCard household={household} profile={resolvedPurokRiskProfile} />

            {/* MSWDO Admin Review Notes */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs text-xs text-slate-600">
              <p className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                {lang === 'ceb' ? 'Pahibalo gikan sa MSWDO' : 'MSWDO Admin Note'}
              </p>
              <p className="mt-2 leading-relaxed text-slate-700">
                {household.registration_review_notes?.trim()
                  ? household.registration_review_notes.trim()
                  : (lang === 'ceb' ? 'Walay review note gikan sa admin.' : 'No admin review note was attached to this approved household.')}
              </p>
            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: Members Header, Form, and Member Cards Grid  */}
          {/* ========================================================= */}
          <div className="space-y-6 lg:col-span-7 xl:col-span-8">
            {/* Top Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-950 text-white shadow-xs">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    {t('householdMembersTitle')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {members.length} {lang === 'ceb' ? 'ka sakop ang nakatala sa imong panimalay' : 'registered members in this household'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAddMember((value) => !value);
                  setMemberError('');
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-950 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-cyan-900 active:scale-95"
              >
                {showAddMember ? (
                  <>
                    <X className="h-4 w-4" />
                    <span>{t('closeForm')}</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>{t('addMember')}</span>
                  </>
                )}
              </button>
            </div>

            {/* ADD MEMBER FORM (When opened) */}
            {showAddMember && (
              <form
                onSubmit={handleAddMember}
                noValidate
                className="rounded-3xl border border-cyan-200 bg-white p-5 sm:p-7 shadow-sm transition-all"
              >
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        {lang === 'ceb' ? 'Idugang ang Sakop sa Panimalay' : 'Add New Family Member'}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {lang === 'ceb'
                          ? 'Ibutang ang impormasyon sa dugang miyembro sa imong pamilya.'
                          : 'Provide the personal and health details for the new household member.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddMember(false)}
                      className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {Object.keys(fieldErrors).length > 0 && (
                  <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 shadow-xs">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600" />
                    <span>{t('formErrorSummary')}</span>
                  </div>
                )}

                {/* Section 1: Pangalan (Name) */}
                <div className="mt-5 space-y-4">
                  <p className="text-[11px] font-black uppercase tracking-wider text-cyan-900">
                    1. {lang === 'ceb' ? 'Pangalan ug Adlawng Natawhan' : 'Personal Information'}
                  </p>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label
                        className={cn(
                          'text-xs font-semibold uppercase tracking-wide transition-colors',
                          fieldErrors.first_name ? 'text-rose-600 font-bold' : 'text-slate-500'
                        )}
                      >
                        {t('firstName')} *
                      </label>
                      <input
                        name="first_name"
                        type="text"
                        value={form.first_name}
                        onChange={(event) => updateFormField('first_name', event.target.value)}
                        className={cn(
                          'mt-1 h-11 w-full rounded-2xl border px-4 text-sm outline-none transition',
                          fieldErrors.first_name
                            ? 'border-rose-500 bg-rose-50/40 text-rose-950 ring-4 ring-rose-500/10 focus:border-rose-600 focus:ring-rose-500/20'
                            : 'border-slate-200 bg-slate-50/50 text-slate-800 focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10'
                        )}
                        placeholder={t('firstNamePlaceholder')}
                      />
                      {fieldErrors.first_name && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          {fieldErrors.first_name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('middleName')}
                      </label>
                      <input
                        name="middle_name"
                        type="text"
                        value={form.middle_name}
                        onChange={(event) => updateFormField('middle_name', event.target.value)}
                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10"
                        placeholder={t('middleNamePlaceholder')}
                      />
                    </div>

                    <div>
                      <label
                        className={cn(
                          'text-xs font-semibold uppercase tracking-wide transition-colors',
                          fieldErrors.last_name ? 'text-rose-600 font-bold' : 'text-slate-500'
                        )}
                      >
                        {t('lastName')} *
                      </label>
                      <input
                        name="last_name"
                        type="text"
                        value={form.last_name}
                        onChange={(event) => updateFormField('last_name', event.target.value)}
                        className={cn(
                          'mt-1 h-11 w-full rounded-2xl border px-4 text-sm outline-none transition',
                          fieldErrors.last_name
                            ? 'border-rose-500 bg-rose-50/40 text-rose-950 ring-4 ring-rose-500/10 focus:border-rose-600 focus:ring-rose-500/20'
                            : 'border-slate-200 bg-slate-50/50 text-slate-800 focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10'
                        )}
                        placeholder={t('lastNamePlaceholder')}
                      />
                      {fieldErrors.last_name && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          {fieldErrors.last_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        className={cn(
                          'text-xs font-semibold uppercase tracking-wide transition-colors',
                          fieldErrors.birthdate ? 'text-rose-600 font-bold' : 'text-slate-500'
                        )}
                      >
                        {t('birthdate')} *
                      </label>
                      <input
                        name="birthdate"
                        type="date"
                        value={form.birthdate}
                        onChange={(event) => updateFormField('birthdate', event.target.value)}
                        className={cn(
                          'mt-1 h-11 w-full rounded-2xl border px-4 text-sm outline-none transition',
                          fieldErrors.birthdate
                            ? 'border-rose-500 bg-rose-50/40 text-rose-950 ring-4 ring-rose-500/10 focus:border-rose-600 focus:ring-rose-500/20'
                            : 'border-slate-200 bg-slate-50/50 text-slate-800 focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10'
                        )}
                      />
                      {fieldErrors.birthdate && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          {fieldErrors.birthdate}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        className={cn(
                          'text-xs font-semibold uppercase tracking-wide transition-colors',
                          fieldErrors.gender ? 'text-rose-600 font-bold' : 'text-slate-500'
                        )}
                      >
                        {t('gender')}
                      </label>
                      <select
                        name="gender"
                        value={form.gender}
                        onChange={(event) => updateFormField('gender', event.target.value as Gender)}
                        className={cn(
                          'mt-1 h-11 w-full rounded-2xl border px-4 text-sm outline-none transition',
                          fieldErrors.gender
                            ? 'border-rose-500 bg-rose-50/40 text-rose-950 ring-4 ring-rose-500/10 focus:border-rose-600 focus:ring-rose-500/20'
                            : 'border-slate-200 bg-slate-50/50 text-slate-800 focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10'
                        )}
                      >
                        <option value="M">{getGenderTranslation('M', lang)}</option>
                        <option value="F">{getGenderTranslation('F', lang)}</option>
                      </select>
                      {fieldErrors.gender && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          {fieldErrors.gender}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 2: Relasyon ug Panginabuhian (Relationship & Role) */}
                <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
                  <p className="text-[11px] font-black uppercase tracking-wider text-cyan-900">
                    2. {lang === 'ceb' ? 'Relasyon ug Kahimtang sa Panimalay' : 'Household Role & Civil Status'}
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        className={cn(
                          'text-xs font-semibold uppercase tracking-wide transition-colors',
                          fieldErrors.relationship_to_head ? 'text-rose-600 font-bold' : 'text-slate-500'
                        )}
                      >
                        {t('relationshipToHead')} *
                      </label>
                      <input
                        name="relationship_to_head"
                        type="text"
                        list="resident-relationship-options"
                        value={form.relationship_to_head}
                        onChange={(event) => updateFormField('relationship_to_head', event.target.value)}
                        className={cn(
                          'mt-1 h-11 w-full rounded-2xl border px-4 text-sm outline-none transition',
                          fieldErrors.relationship_to_head
                            ? 'border-rose-500 bg-rose-50/40 text-rose-950 ring-4 ring-rose-500/10 focus:border-rose-600 focus:ring-rose-500/20'
                            : 'border-slate-200 bg-slate-50/50 text-slate-800 focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10'
                        )}
                        placeholder={t('relationshipPlaceholder')}
                      />
                      <datalist id="resident-relationship-options">
                        {RELATIONSHIP_OPTIONS.map((relationship) => (
                          <option key={relationship} value={relationship}>
                            {getRelationshipTranslation(relationship, lang)}
                          </option>
                        ))}
                      </datalist>
                      {fieldErrors.relationship_to_head && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          {fieldErrors.relationship_to_head}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('civilStatus')}</label>
                      <select
                        name="civil_status"
                        value={form.civil_status}
                        onChange={(event) => updateFormField('civil_status', event.target.value as CivilStatus)}
                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10"
                      >
                        {CIVIL_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {getCivilStatusTranslation(status, lang)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('contactNumber')}</label>
                      <input
                        name="contact_number"
                        type="tel"
                        value={form.contact_number}
                        onChange={(event) => updateFormField('contact_number', event.target.value)}
                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10"
                        placeholder="09xxxxxxxxx"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('incomeLevel')}</label>
                      <select
                        name="income_level"
                        value={form.income_level}
                        onChange={(event) => updateFormField('income_level', event.target.value as IncomeLevel)}
                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10"
                      >
                        {INCOME_LEVELS.map((incomeLevel) => (
                          <option key={incomeLevel} value={incomeLevel}>
                            {getIncomeLevelTranslation(incomeLevel, lang)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('occupation')}</label>
                      <input
                        name="occupation"
                        type="text"
                        value={form.occupation}
                        onChange={(event) => updateFormField('occupation', event.target.value)}
                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10"
                        placeholder={t('occupationPlaceholder')}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Panglawas ug Priority Tags */}
                <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black uppercase tracking-wider text-cyan-900">
                      3. {t('healthPriorityTags')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {draftBadges.length > 0 ? (
                        draftBadges.map((badge) => (
                          <CivicBadge key={badge.label} label={badge.label} tone={badge.tone} />
                        ))
                      ) : (
                        <CivicBadge label={t('noPriorityTagYet')} tone="slate" />
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Pregnancy Card */}
                    <div
                      className={cn(
                        'rounded-2xl border p-4 transition-all',
                        form.is_pregnant
                          ? 'border-rose-300 bg-rose-50/40 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50'
                      )}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.is_pregnant}
                          onChange={(event) => {
                            updateFormField('is_pregnant', event.target.checked);
                            if (!event.target.checked) {
                              updateFormField('pregnancy_months', '');
                              updateFormField('expected_delivery_date', '');
                            }
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />
                        <span>
                          <span className="block text-sm font-bold text-slate-900">{t('pregnantMember')}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {t('pregnantMemberDesc')}
                          </span>
                        </span>
                      </label>

                      {form.is_pregnant && (
                        <div className="mt-4 space-y-3 border-t border-rose-200/60 pt-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label
                                className={cn(
                                  'text-xs font-semibold uppercase tracking-wide transition-colors',
                                  fieldErrors.pregnancy_months ? 'text-rose-600 font-bold' : 'text-slate-600'
                                )}
                              >
                                {t('pregnancyMonths')} (1–9)
                              </label>
                              <input
                                name="pregnancy_months"
                                type="number"
                                min={1}
                                max={9}
                                value={form.pregnancy_months}
                                onChange={(event) =>
                                  updateFormField(
                                    'pregnancy_months',
                                    event.target.value ? Number(event.target.value) : ''
                                  )
                                }
                                className={cn(
                                  'mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none transition',
                                  fieldErrors.pregnancy_months
                                    ? 'border-rose-500 bg-rose-50/40 text-rose-950 ring-4 ring-rose-500/10'
                                    : 'border-slate-200 bg-white text-slate-800 focus:border-rose-500'
                                )}
                                placeholder="6"
                              />
                              {fieldErrors.pregnancy_months && (
                                <p className="mt-1 text-xs font-semibold text-rose-600">
                                  {fieldErrors.pregnancy_months}
                                </p>
                              )}
                            </div>

                            <div>
                              <label
                                className={cn(
                                  'text-xs font-semibold uppercase tracking-wide transition-colors',
                                  fieldErrors.expected_delivery_date ? 'text-rose-600 font-bold' : 'text-slate-600'
                                )}
                              >
                                {t('expectedDeliveryDate')}
                              </label>
                              <input
                                name="expected_delivery_date"
                                type="date"
                                value={form.expected_delivery_date}
                                onChange={(event) =>
                                  updateFormField('expected_delivery_date', event.target.value)
                                }
                                className={cn(
                                  'mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none transition',
                                  fieldErrors.expected_delivery_date
                                    ? 'border-rose-500 bg-rose-50/40 text-rose-950 ring-4 ring-rose-500/10'
                                    : 'border-slate-200 bg-white text-slate-800 focus:border-rose-500'
                                )}
                              />
                              {fieldErrors.expected_delivery_date && (
                                <p className="mt-1 text-xs font-semibold text-rose-600">
                                  {fieldErrors.expected_delivery_date}
                                </p>
                              )}
                            </div>
                          </div>

                          {memberPregnancyProgress && typeof form.pregnancy_months === 'number' && (
                            <div className="rounded-xl border border-rose-200 bg-rose-100/60 p-2.5 text-xs text-rose-900">
                              <p className="font-bold">
                                {form.pregnancy_months} {lang === 'ceb' ? 'ka bulan nga mabdos' : 'months pregnant'} · {memberPregnancyProgress.trimesterLabel}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* PWD Card */}
                    <div
                      className={cn(
                        'rounded-2xl border p-4 transition-all',
                        form.is_pwd
                          ? 'border-indigo-300 bg-indigo-50/40 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50'
                      )}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.is_pwd}
                          onChange={(event) => {
                            updateFormField('is_pwd', event.target.checked);
                            if (!event.target.checked) {
                              updateFormField('pwd_type', '');
                            }
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>
                          <span className="block text-sm font-bold text-slate-900">{t('pwdMember')}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {t('pwdMemberDesc')}
                          </span>
                        </span>
                      </label>

                      {form.is_pwd && (
                        <div className="mt-4 space-y-3 border-t border-indigo-200/60 pt-3">
                          <label
                            className={cn(
                              'text-xs font-semibold uppercase tracking-wide transition-colors',
                              fieldErrors.pwd_type ? 'text-rose-600 font-bold' : 'text-slate-600'
                            )}
                          >
                            {t('pwdType')} *
                          </label>
                          <select
                            name="pwd_type"
                            value={form.pwd_type}
                            onChange={(event) =>
                              updateFormField('pwd_type', event.target.value as PWDType | '')
                            }
                            className={cn(
                              'mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none transition',
                              fieldErrors.pwd_type
                                ? 'border-rose-500 bg-rose-50/40 text-rose-950 ring-4 ring-rose-500/10'
                                : 'border-slate-200 bg-white text-slate-800 focus:border-indigo-500'
                            )}
                          >
                            <option value="">
                              {lang === 'ceb' ? 'Pilia ang matang sa PWD' : 'Select PWD type'}
                            </option>
                            {Object.entries(PWD_TYPE_LABELS).map(([value]) => (
                              <option key={value} value={value}>
                                {getPwdTypeTranslation(value, lang)}
                              </option>
                            ))}
                          </select>
                          {fieldErrors.pwd_type && (
                            <p className="mt-1 text-xs font-semibold text-rose-600">
                              {fieldErrors.pwd_type}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {memberError && (
                  <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {memberError}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-2xl bg-cyan-950 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-cyan-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 transition"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{isSubmitting ? t('submittingMember') : t('submitMemberReview')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMember(false);
                      setForm(EMPTY_MEMBER_FORM);
                      setFieldErrors({});
                      setMemberError('');
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </form>
            )}

            {/* MEMBER CARDS LIST / GRID */}
            {members.length > 0 ? (
              <div className="grid gap-3.5">
                {members.map((member) => {
                  const flags = memberFlagsByResidentId.get(member.id);
                  const badges = buildMemberBadges(member, flags, lang);
                  const isHead = member.full_name === household.head_name || member.relationship_to_head?.toLowerCase() === 'head';

                  return (
                    <div
                      key={member.id}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all hover:border-cyan-400 hover:shadow-md"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          <div
                            className={cn(
                              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-black shadow-xs',
                              member.gender === 'F'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-cyan-50 text-cyan-900 border border-cyan-200'
                            )}
                          >
                            {member.full_name ? member.full_name.slice(0, 2).toUpperCase() : 'RP'}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-black text-slate-900">
                                {member.full_name}
                              </h3>
                              {isHead && (
                                <span className="rounded-full bg-cyan-950 px-2.5 py-0.5 text-[10px] font-bold text-white">
                                  {lang === 'ceb' ? 'Pangulo' : 'Head'}
                                </span>
                              )}
                              {member.verification_status === 'pending' ? (
                                <CivicBadge label={lang === 'ceb' ? 'Ginasusi pa' : 'Pending Verification'} tone="amber" />
                              ) : (
                                <CivicBadge label={lang === 'ceb' ? 'Beripikado' : 'Verified'} tone="emerald" />
                              )}
                            </div>

                            <p className="mt-1 text-xs font-semibold text-cyan-900">
                              {getRelationshipTranslation(member.relationship_to_head || 'Other', lang)}
                            </p>

                            {/* Micro-chips metadata */}
                            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                {calculateAge(member.birthdate)} {lang === 'ceb' ? 'ka tuig' : 'yrs'} ({getGenderTranslation(member.gender, lang)})
                              </span>
                              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                {getCivilStatusTranslation(member.civil_status || '', lang)}
                              </span>
                              {member.occupation && (
                                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                  💼 {member.occupation}
                                </span>
                              )}
                              {member.income_level && (
                                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                  💰 {getIncomeLevelTranslation(member.income_level || '', lang)}
                                </span>
                              )}
                            </div>

                            {member.contact_number && (
                              <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-slate-400" />
                                <span>{member.contact_number}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Priority / Health Badges on the right */}
                        <div className="flex flex-wrap gap-1.5 sm:max-w-[220px] justify-end">
                          {badges.map((badge) => (
                            <CivicBadge key={`${member.id}-${badge.label}`} label={badge.label} tone={badge.tone} />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-xs">
                <Users className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-4 text-base font-bold text-slate-900">{t('noMembersYet')}</p>
                <p className="mt-2 text-xs text-slate-500 max-w-sm mx-auto">
                  {lang === 'ceb'
                    ? 'Gamita ang Dugang Miyembro nga buton aron maapil ang tanang sakop sa panimalay.'
                    : 'Use the add member button above to attach each active household member to your record.'}
                </p>
              </div>
            )}

            <div className="pt-2">
              <Link
                href="/resident"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
              >
                ← {lang === 'ceb' ? 'Balik sa Resident Portal' : 'Back to Resident Portal'}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </ResidentShell>
  );
}

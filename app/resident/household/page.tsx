'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock3,
  Home,
  MapPin,
  Plus,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import ResidentShell from '@/components/resident/ResidentShell';
import { PurokFloodProfileCard } from '@/components/PurokFloodProfileCard';
import {
  CivicBadge,
  CivicKpiCard,
  CivicPanel,
  CivicSectionHeading,
} from '@/components/ui/civic-primitives';
import { getCurrentUser, getDefaultRouteForUser, isResidentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';
import { getPurokRiskProfile } from '@/lib/db/purok-risk-profiles';
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
  VulnerabilityFlags,
} from '@/lib/db/schema';
import { formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';
import { resolveResidentActiveApprovedHousehold } from '@/lib/resident-households';
import {
  calculateAge,
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
  full_name: string;
  birthdate: string;
  gender: Gender;
  relationship_to_head: string;
  civil_status: CivilStatus;
  occupation: string;
  income_level: IncomeLevel;
  contact_number: string;
  is_pregnant: boolean;
  is_pwd: boolean;
  pwd_type: PWDType | '';
};

const EMPTY_MEMBER_FORM: MemberFormState = {
  full_name: '',
  birthdate: '',
  gender: 'M',
  relationship_to_head: '',
  civil_status: 'single',
  occupation: '',
  income_level: 'middle',
  contact_number: '',
  is_pregnant: false,
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

function buildMemberBadges(member: Resident, flags?: VulnerabilityFlags) {
  const age = calculateAge(member.birthdate);
  const badges: Array<{ label: string; tone: MemberBadgeTone }> = [
    { label: `${age} yrs`, tone: 'slate' },
    { label: member.gender === 'F' ? 'Female' : 'Male', tone: 'teal' },
  ];

  if (age < 18) {
    badges.push({ label: 'Minor', tone: 'amber' });
  } else if (age >= 60) {
    badges.push({ label: 'Senior', tone: 'amber' });
  }

  if (flags?.is_pregnant) {
    badges.push({ label: 'Pregnant', tone: 'rose' });
  }

  if (flags?.is_pwd) {
    badges.push({
      label: flags.pwd_type ? `PWD - ${PWD_TYPE_LABELS[flags.pwd_type]}` : 'PWD',
      tone: 'navy',
    });
  }

  if (flags?.is_low_income) {
    badges.push({ label: 'Low income', tone: 'emerald' });
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
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Resident[]>([]);
  const [memberFlagsByResidentId, setMemberFlagsByResidentId] = useState<Map<string, VulnerabilityFlags>>(new Map());
  const [purokRiskProfile, setPurokRiskProfile] = useState<PurokRiskProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [form, setForm] = useState<MemberFormState>(EMPTY_MEMBER_FORM);

  async function loadData(currentUser: NonNullable<typeof user>) {
    const households = await getHouseholds({ applicant_user_id: currentUser.id });
    const activeHousehold = resolveResidentActiveApprovedHousehold(households);

    if (!activeHousehold) {
      setHousehold(null);
      setMembers([]);
      setMemberFlagsByResidentId(new Map());
      setPurokRiskProfile(null);
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
  }

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
  }, [router, user]);

  const memberSummary = useMemo(() => {
    return {
      total: members.length,
      children: members.filter((member) => calculateAge(member.birthdate) < 18).length,
      seniors: members.filter((member) => calculateAge(member.birthdate) >= 60).length,
    };
  }, [members]);

  const draftBadges = useMemo(() => {
    const labels: Array<{ label: string; tone: MemberBadgeTone }> = [];
    const age = form.birthdate ? calculateAge(form.birthdate) : null;

    if (age !== null) {
      if (age < 18) {
        labels.push({ label: 'Minor', tone: 'amber' });
      } else if (age >= 60) {
        labels.push({ label: 'Senior', tone: 'amber' });
      }
    }

    if (form.is_pregnant) {
      labels.push({ label: 'Pregnant', tone: 'rose' });
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
  }, [form.birthdate, form.income_level, form.is_pregnant, form.is_pwd, form.pwd_type]);

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!household) {
      return;
    }

    if (!form.full_name.trim() || !form.birthdate || !form.relationship_to_head.trim()) {
      setMemberError('Enter the member name, birthdate, and relationship to head.');
      return;
    }

    if (form.is_pregnant && form.gender !== 'F') {
      setMemberError('Pregnant members must use Female gender for reporting accuracy.');
      return;
    }

    if (form.is_pwd && !form.pwd_type) {
      setMemberError('Select the PWD type so this member is counted correctly in reports.');
      return;
    }

    setMemberError('');
    setIsSubmitting(true);

    try {
      const createdResident = await createResident({
        household_id: household.id,
        full_name: form.full_name.trim(),
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
      title="My Household"
      subtitle="Review your approved household and add members when your family record changes."
    >
      {isLoading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center shadow-[0_18px_46px_-36px_rgba(15,23,42,0.24)]">
          <Clock3 className="mx-auto h-8 w-8 animate-pulse text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">Loading your approved household...</p>
        </div>
      ) : household ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <CivicKpiCard
              label="Household Status"
              value={formatRegistrationStatusLabel(getHouseholdRegistrationStatus(household))}
              hint="Only your latest approved active household appears here."
              icon={ShieldCheck}
              tone="emerald"
            />
            <CivicKpiCard
              label="Active Members"
              value={memberSummary.total}
              hint={`${memberSummary.children} children and ${memberSummary.seniors} seniors currently listed.`}
              icon={Users}
              tone="navy"
            />
            <CivicKpiCard
              label="Reviewed"
              value={household.registration_reviewed_at ? 'Approved' : 'On file'}
              hint={formatDate(household.registration_reviewed_at || household.updatedAt)}
              icon={CheckCircle2}
              tone="teal"
            />
          </div>

          <CivicPanel className="mt-6 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <CivicSectionHeading
                icon={Home}
                title={household.head_name}
                description="This is the household record currently active for your resident portal."
              />
              <div className="flex flex-wrap gap-2">
                <CivicBadge label="Approved" tone="emerald" />
                <CivicBadge label="Active household" tone="navy" />
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Address</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                    <span>
                      {household.street_address}, {household.purok_sitio}, {household.barangay_name}, {household.municipality}
                    </span>
                  </p>
                  <p><span className="font-semibold text-slate-900">Contact:</span> {household.contact_number || 'Not provided'}</p>
                  <p><span className="font-semibold text-slate-900">Submitted:</span> {formatDate(household.registration_submitted_at || household.createdAt)}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Household notes</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-semibold text-slate-900">Applicant email:</span> {household.applicant_email || user.email}</p>
                  <p><span className="font-semibold text-slate-900">Reviewed:</span> {formatDate(household.registration_reviewed_at || household.updatedAt)}</p>
                  <p className="text-slate-600">
                    {household.registration_review_notes?.trim()
                      ? household.registration_review_notes.trim()
                      : 'No admin review note was attached to this approved household.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
              Your registration is already approved, so this page replaces the new registration flow. Add members here whenever your household list changes.
            </div>

            <div className="mt-5">
              <PurokFloodProfileCard household={household} profile={purokRiskProfile} />
            </div>
          </CivicPanel>

          <CivicPanel className="mt-6 sm:p-6">
            <CivicSectionHeading
              icon={Users}
              title="Household members"
              description="These active resident records are attached to your approved household."
              action={(
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMember((value) => !value);
                    setMemberError('');
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-cyan-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-900"
                >
                  <Plus className="h-4 w-4" />
                  {showAddMember ? 'Close Form' : 'Add Member'}
                </button>
              )}
            />

            {showAddMember ? (
              <form onSubmit={handleAddMember} className="mt-6 rounded-[24px] border border-cyan-200 bg-cyan-50/70 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</label>
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                      placeholder="Enter the member's full name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Birthdate</label>
                    <input
                      type="date"
                      value={form.birthdate}
                      onChange={(event) => setForm((current) => ({ ...current, birthdate: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
                    <select
                      value={form.gender}
                      onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value as Gender }))}
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Relationship to Head</label>
                    <input
                      type="text"
                      list="resident-relationship-options"
                      value={form.relationship_to_head}
                      onChange={(event) => setForm((current) => ({ ...current, relationship_to_head: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                      placeholder="Spouse, Son, Daughter, Parent"
                    />
                    <datalist id="resident-relationship-options">
                      {RELATIONSHIP_OPTIONS.map((relationship) => (
                        <option key={relationship} value={relationship} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Civil Status</label>
                    <select
                      value={form.civil_status}
                      onChange={(event) => setForm((current) => ({ ...current, civil_status: event.target.value as CivilStatus }))}
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                    >
                      {CIVIL_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact Number</label>
                    <input
                      type="tel"
                      value={form.contact_number}
                      onChange={(event) => setForm((current) => ({ ...current, contact_number: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                      placeholder="09xxxxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Income Level</label>
                    <select
                      value={form.income_level}
                      onChange={(event) => setForm((current) => ({ ...current, income_level: event.target.value as IncomeLevel }))}
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                    >
                      {INCOME_LEVELS.map((incomeLevel) => (
                        <option key={incomeLevel} value={incomeLevel}>
                          {incomeLevel.charAt(0).toUpperCase() + incomeLevel.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Occupation</label>
                    <input
                      type="text"
                      value={form.occupation}
                      onChange={(event) => setForm((current) => ({ ...current, occupation: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                      placeholder="Occupation or role in the household"
                    />
                  </div>
                  <div className="md:col-span-2 rounded-[20px] border border-cyan-200 bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Health and priority tags</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Mark PWD or pregnancy so this member appears correctly in vulnerability and distribution lists.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {draftBadges.length > 0 ? (
                          draftBadges.map((badge) => (
                            <CivicBadge key={badge.label} label={badge.label} tone={badge.tone} />
                          ))
                        ) : (
                          <CivicBadge label="No priority tag yet" tone="slate" />
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={form.is_pregnant}
                          onChange={(event) => setForm((current) => ({ ...current, is_pregnant: event.target.checked }))}
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">Pregnant member</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            Include this member in maternal health and responder priority reports.
                          </span>
                        </span>
                      </label>

                      <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={form.is_pwd}
                            onChange={(event) => setForm((current) => ({
                              ...current,
                              is_pwd: event.target.checked,
                              pwd_type: event.target.checked ? current.pwd_type : '',
                            }))}
                            className="mt-1 h-4 w-4 rounded border-slate-300"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-slate-900">PWD member</span>
                            <span className="mt-1 block text-xs text-slate-500">
                              Mark persons with disability so they are counted in household vulnerability data.
                            </span>
                          </span>
                        </label>

                        {form.is_pwd ? (
                          <div className="mt-3">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">PWD Type</label>
                            <select
                              value={form.pwd_type}
                              onChange={(event) => setForm((current) => ({ ...current, pwd_type: event.target.value as PWDType | '' }))}
                              className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-cyan-800 focus:ring-4 focus:ring-cyan-900/10"
                            >
                              <option value="">Select PWD type</option>
                              {Object.entries(PWD_TYPE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {memberError ? (
                  <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {memberError}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-full bg-cyan-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    {isSubmitting ? 'Saving Member...' : 'Save Member'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMember(false);
                      setForm(EMPTY_MEMBER_FORM);
                      setMemberError('');
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {members.length > 0 ? (
              <div className="mt-6 space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    {(() => {
                      const flags = memberFlagsByResidentId.get(member.id);
                      const badges = buildMemberBadges(member, flags);

                      return (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-950 text-white">
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{member.full_name}</p>
                            {badges.map((badge) => (
                              <CivicBadge key={`${member.id}-${badge.label}`} label={badge.label} tone={badge.tone} />
                            ))}
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{member.relationship_to_head || 'Household member'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Civil status: {formatSentenceCase(member.civil_status)}
                            {member.occupation ? ` · Occupation: ${member.occupation}` : ''}
                            {member.income_level ? ` · Income: ${formatSentenceCase(member.income_level)}` : ''}
                          </p>
                          {member.contact_number ? (
                            <p className="mt-1 text-xs text-slate-500">Contact: {member.contact_number}</p>
                          ) : null}
                        </div>
                      </div>
                      <CivicBadge label="Active" tone="emerald" />
                    </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
                <Users className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-4 text-base font-semibold text-slate-900">No members added yet</p>
                <p className="mt-2 text-sm text-slate-500">
                  Use the add member form to attach each active household member to your approved record.
                </p>
              </div>
            )}
          </CivicPanel>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/resident"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to Portal
            </Link>
          </div>
        </>
      ) : null}
    </ResidentShell>
  );
}

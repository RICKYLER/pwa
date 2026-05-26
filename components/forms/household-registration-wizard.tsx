'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  Plus,
  Phone,
  Search,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { LocationPicker } from '@/components/LocationPicker';
import type { MemberDraft } from '@/components/forms/household-form';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAllPuroks } from '@/lib/db/households';
import { getLocationMasterList } from '@/lib/db/location-master';
import { resolveLocationFromCoordinates } from '@/lib/geocoding';
import {
  mergePurokOptions,
  normalizeBarangayName,
  normalizeMunicipalityName,
  normalizePurokSitio,
} from '@/lib/geocoding';
import { calculateAge, getPregnancyProgress } from '@/lib/db/vulnerability';
import type { Household, LocationConfidence, LocationSource, PWDType } from '@/lib/db/schema';

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MUNICIPALITY = process.env.NEXT_PUBLIC_DEFAULT_MUNICIPALITY?.trim() || '';

interface RegistrationWizardProps {
  barangayId: string;
  initialValues?: Partial<RegistrationFormState>;
  lockApplicantEmail?: boolean;
  onSubmit: (
    data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
    members: MemberDraft[],
    headProfile: HeadProfileDraft,
  ) => Promise<string>;
}

export interface HeadProfileDraft {
  birthdate: string;
  gender: 'M' | 'F';
  civil_status: MemberDraft['civil_status'];
  occupation: string;
  income_level: MemberDraft['income_level'];
  is_pregnant: boolean;
  pregnancy_months?: number | '';
  expected_delivery_date?: string;
  is_pwd: boolean;
  is_4ps: boolean;
  is_indigent: boolean;
  pwd_type?: PWDType | '';
}

interface RegistrationFormState {
  head_name: string;
  head_birthdate: string;
  head_gender: 'M' | 'F';
  head_civil_status: MemberDraft['civil_status'];
  head_occupation: string;
  head_income_level: MemberDraft['income_level'];
  head_is_pregnant: boolean;
  head_pregnancy_months?: number | '';
  head_expected_delivery_date?: string;
  head_is_pwd: boolean;
  head_is_4ps: boolean;
  head_is_indigent: boolean;
  head_pwd_type?: PWDType | '';
  contact_number: string;
  applicant_email: string;
  municipality: string;
  barangay_name: string;
  purok_sitio: string;
  street_address: string;
  landmark_directions: string;
  supporting_document_name?: string;
  supporting_document_type?: string;
  supporting_document_data?: string;
  gps_lat?: number;
  gps_long?: number;
  location_source?: LocationSource;
  location_confidence?: LocationConfidence;
}

const STEP_LABELS = [
  { id: 1, label: 'Personal Information', hint: 'Basic profile, address, and members' },
  { id: 2, label: 'Location Verification', hint: 'Pin and confirm the map location' },
  { id: 3, label: 'Review and Submit', hint: 'Check details before sending' },
];

const OFFICE_REQUIREMENTS = [
  'Bring a valid government-issued ID.',
  'Bring a photocopy of the ID.',
  'Bring any supporting documents required by MSWDO.',
  'Go to the MSWDO office for final verification and approval.',
];

const EMPTY_FORM: RegistrationFormState = {
  head_name: '',
  head_birthdate: '',
  head_gender: 'M',
  head_civil_status: 'single',
  head_occupation: '',
  head_income_level: 'low',
  head_is_pregnant: false,
  head_pregnancy_months: '',
  head_expected_delivery_date: '',
  head_is_pwd: false,
  head_is_4ps: false,
  head_is_indigent: false,
  head_pwd_type: '',
  contact_number: '',
  applicant_email: '',
  municipality: DEFAULT_MUNICIPALITY,
  barangay_name: '',
  purok_sitio: '',
  street_address: '',
  landmark_directions: '',
};

const EMPTY_MEMBER: MemberDraft = {
  full_name: '',
  birthdate: '',
  gender: 'M',
  relationship_to_head: '',
  civil_status: 'single',
  occupation: '',
  income_level: 'low',
  is_pregnant: false,
  pregnancy_months: '',
  expected_delivery_date: '',
  is_pwd: false,
  is_4ps: false,
  is_indigent: false,
  pwd_type: '',
};

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
];

function formatCoordinate(value?: number): string {
  return typeof value === 'number' ? value.toFixed(6) : 'Not captured yet';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected document.'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read the selected document.'));
    };
    reader.readAsDataURL(file);
  });
}

function isEmailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function safeText(value?: string): string {
  return typeof value === 'string' ? value : '';
}

function buildRegistrationFormState(
  initialValues?: Partial<RegistrationFormState>,
): RegistrationFormState {
  return {
    ...EMPTY_FORM,
    head_name: safeText(initialValues?.head_name),
    head_birthdate: safeText(initialValues?.head_birthdate),
    head_gender: initialValues?.head_gender === 'F' ? 'F' : 'M',
    head_civil_status: initialValues?.head_civil_status ?? EMPTY_FORM.head_civil_status,
    head_occupation: safeText(initialValues?.head_occupation),
    head_income_level: initialValues?.head_income_level ?? EMPTY_FORM.head_income_level,
    head_is_pregnant: Boolean(initialValues?.head_is_pregnant),
    head_pregnancy_months:
      typeof initialValues?.head_pregnancy_months === 'number'
        ? initialValues.head_pregnancy_months
        : EMPTY_FORM.head_pregnancy_months,
    head_expected_delivery_date: safeText(initialValues?.head_expected_delivery_date),
    head_is_pwd: Boolean(initialValues?.head_is_pwd),
    head_is_4ps: Boolean(initialValues?.head_is_4ps),
    head_is_indigent: Boolean(initialValues?.head_is_indigent),
    head_pwd_type: initialValues?.head_pwd_type ?? EMPTY_FORM.head_pwd_type,
    contact_number: safeText(initialValues?.contact_number),
    applicant_email: safeText(initialValues?.applicant_email),
    municipality: safeText(initialValues?.municipality) || EMPTY_FORM.municipality,
    barangay_name: safeText(initialValues?.barangay_name),
    purok_sitio: safeText(initialValues?.purok_sitio),
    street_address: safeText(initialValues?.street_address),
    landmark_directions: safeText(initialValues?.landmark_directions),
    supporting_document_name: safeText(initialValues?.supporting_document_name) || undefined,
    supporting_document_type: safeText(initialValues?.supporting_document_type) || undefined,
    supporting_document_data: safeText(initialValues?.supporting_document_data) || undefined,
    gps_lat: initialValues?.gps_lat,
    gps_long: initialValues?.gps_long,
    location_source: initialValues?.location_source,
    location_confidence: initialValues?.location_confidence,
  };
}

function getMemberAgeCategory(birthdate: string): 'child' | 'adult' | 'senior' | null {
  if (!birthdate) return null;
  const age = calculateAge(birthdate);
  if (age < 18) return 'child';
  if (age >= 60) return 'senior';
  return 'adult';
}

function isInfantBirthdate(birthdate: string): boolean {
  if (!birthdate) return false;
  const age = calculateAge(birthdate);
  return age >= 0 && age < 2;
}

function formatRelationshipLabel(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getMemberTags(member: MemberDraft): string[] {
  const tags: string[] = [];
  const ageCategory = getMemberAgeCategory(member.birthdate);

  if (isInfantBirthdate(member.birthdate)) tags.push('Infant');
  if (ageCategory === 'child') tags.push('Minor');
  if (ageCategory === 'senior') tags.push('Senior');
  if (member.is_pregnant) tags.push('Pregnant');
  if (member.is_pregnant && typeof member.pregnancy_months === 'number') tags.push(`${member.pregnancy_months} months`);
  if (member.is_pwd) {
    tags.push(member.pwd_type ? `PWD - ${PWD_TYPE_LABELS[member.pwd_type]}` : 'PWD');
  }
  if (member.is_4ps) tags.push('4Ps');
  if (member.is_indigent) tags.push('Indigent');

  return tags;
}

function buildHeadProfileDraft(form: RegistrationFormState): HeadProfileDraft {
  return {
    birthdate: form.head_birthdate,
    gender: form.head_gender,
    civil_status: form.head_civil_status,
    occupation: form.head_occupation,
    income_level: form.head_income_level,
    is_pregnant: form.head_is_pregnant,
    pregnancy_months: form.head_pregnancy_months,
    expected_delivery_date: form.head_expected_delivery_date,
    is_pwd: form.head_is_pwd,
    is_4ps: form.head_is_4ps,
    is_indigent: form.head_is_indigent,
    pwd_type: form.head_pwd_type,
  };
}

function getHeadProfileTags(form: RegistrationFormState): string[] {
  return getMemberTags({
    full_name: form.head_name,
    birthdate: form.head_birthdate,
    gender: form.head_gender,
    relationship_to_head: 'Self',
    civil_status: form.head_civil_status,
    occupation: form.head_occupation,
    income_level: form.head_income_level,
    is_pregnant: form.head_is_pregnant,
    pregnancy_months: form.head_pregnancy_months,
    expected_delivery_date: form.head_expected_delivery_date,
    is_pwd: form.head_is_pwd,
    is_4ps: form.head_is_4ps,
    is_indigent: form.head_is_indigent,
    pwd_type: form.head_pwd_type,
  });
}

export function HouseholdRegistrationWizard({
  barangayId,
  initialValues,
  lockApplicantEmail = false,
  onSubmit,
}: RegistrationWizardProps) {
  const router = useRouter();
  const { isLoaded: mapsReady } = useGoogleMaps();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RegistrationFormState>(() => buildRegistrationFormState(initialValues));
  const [masterListLocked, setMasterListLocked] = useState(false);
  const [purokOptions, setPurokOptions] = useState<string[]>([]);
  const [locationMode, setLocationMode] = useState<'current' | 'manual'>('manual');
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberDraft, setMemberDraft] = useState<MemberDraft>({ ...EMPTY_MEMBER });
  const [memberError, setMemberError] = useState('');
  const [showRequirementsDialog, setShowRequirementsDialog] = useState(false);
  const [requirementsAcknowledged, setRequirementsAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAddressMaster() {
      try {
        const [puroks, masterList] = await Promise.all([
          getAllPuroks(barangayId),
          getLocationMasterList(barangayId),
        ]);

        if (cancelled) {
          return;
        }

        setPurokOptions(mergePurokOptions([...(masterList?.puroks ?? []), ...puroks]));
        setMasterListLocked(Boolean(masterList?.municipality || masterList?.barangay_name));
        setForm((current) => ({
          ...current,
          municipality: masterList?.municipality || current.municipality,
          barangay_name: masterList?.barangay_name || current.barangay_name,
          purok_sitio: current.purok_sitio,
        }));
      } catch {
        if (!cancelled) {
          setPurokOptions([]);
          setMasterListLocked(false);
        }
      }
    }

    void loadAddressMaster();

    return () => {
      cancelled = true;
    };
  }, [barangayId]);

  const addressSummary = useMemo(() => {
    return [
      safeText(form.street_address).trim(),
      safeText(form.purok_sitio).trim(),
      safeText(form.barangay_name).trim(),
      safeText(form.municipality).trim(),
    ].filter(Boolean).join(', ');
  }, [form]);

  const headDraftAge = form.head_birthdate ? calculateAge(form.head_birthdate) : null;
  const headDraftAgeCategory = getMemberAgeCategory(form.head_birthdate);
  const headDraftTags = useMemo(() => getHeadProfileTags(form), [form]);
  const headPregnancyProgress = getPregnancyProgress(
    typeof form.head_pregnancy_months === 'number' ? form.head_pregnancy_months : null,
  );

  const canContinueFromStepOne = useMemo(() => {
    return Boolean(
      safeText(form.head_name).trim()
      && form.head_birthdate
      && safeText(form.contact_number).trim()
      && safeText(form.applicant_email).trim()
      && isEmailValid(safeText(form.applicant_email))
      && safeText(form.street_address).trim()
      && safeText(form.purok_sitio).trim()
      && safeText(form.barangay_name).trim()
      && safeText(form.municipality).trim(),
    );
  }, [form]);

  const canContinueFromStepTwo = useMemo(() => {
    return Boolean(
      form.gps_lat !== undefined
      && form.gps_long !== undefined
      && locationConfirmed,
    );
  }, [form.gps_lat, form.gps_long, locationConfirmed]);

  const memberDraftAge = memberDraft.birthdate ? calculateAge(memberDraft.birthdate) : null;
  const memberDraftAgeCategory = getMemberAgeCategory(memberDraft.birthdate);
  const memberPregnancyProgress = getPregnancyProgress(
    typeof memberDraft.pregnancy_months === 'number' ? memberDraft.pregnancy_months : null,
  );
  const memberSummary = useMemo(() => (
    members.reduce(
      (summary, member) => {
        const ageCategory = getMemberAgeCategory(member.birthdate);
        if (isInfantBirthdate(member.birthdate)) summary.infants++;
        if (ageCategory === 'child') summary.children++;
        if (ageCategory === 'senior') summary.seniors++;
        if (member.is_pregnant) summary.pregnant++;
        if (member.is_pwd) summary.pwd++;
        if (member.is_4ps) summary.fourPs++;
        if (member.is_indigent) summary.indigent++;
        return summary;
      },
      {
        infants: 0,
        children: 0,
        seniors: 0,
        pregnant: 0,
        pwd: 0,
        fourPs: 0,
        indigent: 0,
      },
    )
  ), [members]);

  function updateForm<K extends keyof RegistrationFormState>(
    key: K,
    value: RegistrationFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyResolvedLocation(
    coords: { lat: number; lng: number },
    source: LocationSource,
    confidence: LocationConfidence,
    details?: Awaited<ReturnType<typeof resolveLocationFromCoordinates>> | null,
  ) {
    setForm((current) => ({
      ...current,
      gps_lat: coords.lat,
      gps_long: coords.lng,
      location_source: source,
      location_confidence: confidence,
      street_address: details?.streetAddress || details?.displayName || current.street_address,
      barangay_name: masterListLocked ? current.barangay_name : details?.barangayName || current.barangay_name,
      municipality: masterListLocked ? current.municipality : details?.municipality || current.municipality,
      purok_sitio: details?.purokSitio || current.purok_sitio,
    }));
    setLocationConfirmed(false);
    setError('');
  }

  async function handleUseCurrentLocation() {
    setLocationMode('current');
    setError('');

    if (!navigator.geolocation) {
      setError('This browser does not support geolocation.');
      return;
    }

    if (!mapsReady) {
      setError('Google Maps is still loading. Please wait a moment and try again.');
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const details = await resolveLocationFromCoordinates(coords.lat, coords.lng);
          applyResolvedLocation(coords, 'current_gps', 'medium', details);
        } catch (locateError) {
          setError(locateError instanceof Error ? locateError.message : 'Could not use your current location.');
        } finally {
          setIsLocating(false);
        }
      },
      (geoError) => {
        setError(`Could not use your current location: ${geoError.message}`);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setDocumentError('');

    if (!file) {
      setForm((current) => ({
        ...current,
        supporting_document_name: undefined,
        supporting_document_type: undefined,
        supporting_document_data: undefined,
      }));
      return;
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      setDocumentError('Supporting documents must be 2 MB or smaller for offline storage.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((current) => ({
        ...current,
        supporting_document_name: file.name,
        supporting_document_type: file.type || 'application/octet-stream',
        supporting_document_data: dataUrl,
      }));
    } catch (fileError) {
      setDocumentError(fileError instanceof Error ? fileError.message : 'Could not read the selected file.');
    }
  }

  function handleAddMember() {
    setMemberError('');

    if (!memberDraft.full_name.trim()) {
      setMemberError('Enter the household member name.');
      return;
    }

    if (!memberDraft.birthdate) {
      setMemberError('Select the member birthdate.');
      return;
    }

    if (!memberDraft.relationship_to_head.trim()) {
      setMemberError('Enter the relationship to the household head.');
      return;
    }

    if (memberDraft.is_pregnant && memberDraft.gender !== 'F') {
      setMemberError('Pregnant members must use Female gender for reporting accuracy.');
      return;
    }

    if (memberDraft.is_pregnant) {
      const months = Number(memberDraft.pregnancy_months);
      if (!Number.isFinite(months) || months < 1 || months > 9) {
        setMemberError('Enter the pregnancy month from 1 to 9.');
        return;
      }
      if (!memberDraft.expected_delivery_date) {
        setMemberError('Enter the expected date of delivery (EDD) for pregnant members.');
        return;
      }
    }

    if (memberDraft.is_pwd && !memberDraft.pwd_type) {
      setMemberError('Select the PWD type so the member is counted correctly.');
      return;
    }

    setMembers((current) => [
      ...current,
      {
        ...memberDraft,
        full_name: memberDraft.full_name.trim(),
        relationship_to_head: formatRelationshipLabel(memberDraft.relationship_to_head),
        occupation: memberDraft.occupation.trim(),
      },
    ]);
    setMemberDraft({ ...EMPTY_MEMBER });
    setShowMemberForm(false);
  }

  function handleRemoveMember(index: number) {
    setMembers((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function goNext() {
    setError('');

    if (step === 1 && form.head_is_pregnant && form.head_gender !== 'F') {
      setError('Pregnant household heads must use Female gender for reporting accuracy.');
      return;
    }

    if (step === 1 && form.head_is_pregnant) {
      const months = Number(form.head_pregnancy_months);
      if (!Number.isFinite(months) || months < 1 || months > 9) {
        setError('Enter the household head pregnancy month from 1 to 9.');
        return;
      }
      if (!form.head_expected_delivery_date) {
        setError('Enter the household head expected date of delivery (EDD).');
        return;
      }
    }

    if (step === 1 && form.head_is_pwd && !form.head_pwd_type) {
      setError('Select the household head PWD type so the record is counted correctly.');
      return;
    }

    if (step === 1 && !canContinueFromStepOne) {
      setError('Complete the required personal information and address fields first.');
      return;
    }

    if (step === 2 && !canContinueFromStepTwo) {
      setError('Capture and confirm the map location before continuing.');
      return;
    }

    setStep((current) => Math.min(current + 1, 3));
  }

  function goBack() {
    setError('');
    setStep((current) => Math.max(current - 1, 1));
  }

  function openRequirementsDialog() {
    setRequirementsAcknowledged(false);
    setShowRequirementsDialog(true);
  }

  async function submitRegistration() {
    if (!canContinueFromStepOne || !canContinueFromStepTwo) {
      setError('Review the form and confirm the location before submitting.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const recordId = await onSubmit({
        head_name: form.head_name.trim(),
        applicant_email: form.applicant_email.trim(),
        barangay_id: barangayId,
        barangay_name: normalizeBarangayName(form.barangay_name),
        municipality: normalizeMunicipalityName(form.municipality),
        purok_sitio: normalizePurokSitio(form.purok_sitio),
        street_address: form.street_address.trim(),
        landmark_directions: form.landmark_directions.trim(),
        contact_number: form.contact_number.trim(),
        supporting_document_name: form.supporting_document_name,
        supporting_document_type: form.supporting_document_type,
        supporting_document_data: form.supporting_document_data,
        status: 'active',
        gps_lat: form.gps_lat,
        gps_long: form.gps_long,
        location_source: form.location_source ?? (locationMode === 'current' ? 'current_gps' : 'manual_pin'),
        location_confidence: form.location_confidence ?? 'medium',
        location_verified: false,
        location_verified_at: undefined,
        location_verified_by: undefined,
        registration_status: 'pending',
        registration_submitted_at: new Date(),
        registration_reviewed_at: undefined,
        registration_reviewed_by: undefined,
        registration_review_notes: '',
        pin_qa_status: 'needs_verification',
        pin_qa_notes: '',
      }, members, buildHeadProfileDraft(form));

      setShowRequirementsDialog(false);
      router.push(`/households/register/status?id=${recordId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit this registration.');
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step < 3) {
      goNext();
      return;
    }

    openRequirementsDialog();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          {STEP_LABELS.map((item) => {
            const active = step === item.id;
            const complete = step > item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id <= step) {
                    setStep(item.id);
                  }
                }}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  active
                    ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                    : complete
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : complete
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-slate-500'
                    }`}
                  >
                    {complete ? <CheckCircle2 className="h-4 w-4" /> : item.id}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Personal Information</h2>
              <p className="mt-1 text-sm text-slate-500">
                Ask only for the essentials before the location step.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              <Clock3 className="h-3.5 w-3.5" />
              Saves as pending until admin approval
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Full name *</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={form.head_name}
                  onChange={(event) => updateForm('head_name', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="Enter the applicant or household head name"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Contact number *</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={form.contact_number}
                  onChange={(event) => updateForm('contact_number', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="09xxxxxxxxx"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Email address *</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={form.applicant_email}
                  onChange={(event) => updateForm('applicant_email', event.target.value)}
                  disabled={lockApplicantEmail}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="name@example.com"
                />
              </div>
              {form.applicant_email.trim() && !isEmailValid(form.applicant_email) && (
                <p className="mt-2 text-xs text-red-600">Enter a valid email address.</p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Birthdate *</label>
              <input
                type="date"
                value={form.head_birthdate}
                onChange={(event) => updateForm('head_birthdate', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {headDraftAge !== null && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                    Age {headDraftAge}
                  </span>
                )}
                {isInfantBirthdate(form.head_birthdate) && (
                  <span className="rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-semibold text-pink-700">
                    Infant
                  </span>
                )}
                {headDraftAgeCategory === 'child' && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    Minor
                  </span>
                )}
                {headDraftAgeCategory === 'senior' && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Senior
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Gender</label>
              <select
                value={form.head_gender}
                onChange={(event) => updateForm('head_gender', event.target.value as 'M' | 'F')}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Civil status</label>
              <select
                value={form.head_civil_status}
                onChange={(event) => updateForm('head_civil_status', event.target.value as MemberDraft['civil_status'])}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="widowed">Widowed</option>
                <option value="separated">Separated</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Occupation</label>
              <input
                type="text"
                value={form.head_occupation}
                onChange={(event) => updateForm('head_occupation', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="Farmer, vendor, student"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Income level</label>
              <select
                value={form.head_income_level}
                onChange={(event) => updateForm('head_income_level', event.target.value as MemberDraft['income_level'])}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="low">Low</option>
                <option value="middle">Middle</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Household head profile</p>
                  <p className="mt-1 text-xs text-slate-500">
                    The household head also becomes the main resident record automatically after approval.
                  </p>
                </div>
                {headDraftTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {headDraftTags.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.head_is_pregnant}
                    onChange={(event) => {
                      updateForm('head_is_pregnant', event.target.checked);
                      if (!event.target.checked) {
                        updateForm('head_pregnancy_months', '');
                        updateForm('head_expected_delivery_date', '');
                      }
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-semibold text-slate-900">Pregnant household head</span>
                    <span className="mt-1 block text-xs text-slate-500">Include the household head in maternal health and priority response reports.</span>
                  </span>
                </label>

                {form.head_is_pregnant && (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Pregnancy month *</label>
                        <input
                          type="number"
                          min={1}
                          max={9}
                          value={form.head_pregnancy_months ?? ''}
                          onChange={(event) => updateForm('head_pregnancy_months', event.target.value ? Number(event.target.value) : '')}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          placeholder="e.g. 6"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Expected date of delivery (EDD) *</label>
                        <input
                          type="date"
                          value={form.head_expected_delivery_date || ''}
                          onChange={(event) => updateForm('head_expected_delivery_date', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {form.head_is_pregnant && headPregnancyProgress && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900 md:col-span-2">
                    <p className="font-semibold">
                      {form.head_pregnancy_months} month{form.head_pregnancy_months === 1 ? '' : 's'} pregnant
                    </p>
                    <p className="mt-1 text-xs text-rose-700">
                      {headPregnancyProgress.trimesterLabel}
                      {' · '}
                      {headPregnancyProgress.monthsRemaining === 0
                        ? 'Full-term month reached, monitor closely for delivery and maternal care.'
                        : `About ${headPregnancyProgress.monthsRemaining} month${headPregnancyProgress.monthsRemaining === 1 ? '' : 's'} left before the usual 9-month full term.`}
                    </p>
                    {form.head_expected_delivery_date ? (
                      <p className="mt-1 text-xs text-rose-700">
                        Expected date of delivery (EDD): {form.head_expected_delivery_date}
                      </p>
                    ) : null}
                  </div>
                )}

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.head_is_4ps}
                    onChange={(event) => updateForm('head_is_4ps', event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-semibold text-slate-900">4Ps beneficiary</span>
                    <span className="mt-1 block text-xs text-slate-500">Mark if the household head is covered by the Pantawid Pamilyang Pilipino Program.</span>
                  </span>
                </label>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.head_is_pwd}
                      onChange={(event) => updateForm('head_is_pwd', event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">PWD household head</span>
                      <span className="mt-1 block text-xs text-slate-500">Mark persons with disability so the main household record is counted correctly.</span>
                    </span>
                  </label>

                  {form.head_is_pwd && (
                    <div className="mt-3">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">PWD type *</label>
                      <select
                        value={form.head_pwd_type || ''}
                        onChange={(event) => updateForm('head_pwd_type', event.target.value as PWDType | '')}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      >
                        <option value="">Select PWD type</option>
                        {Object.entries(PWD_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.head_is_indigent}
                    onChange={(event) => updateForm('head_is_indigent', event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <span className="block font-semibold text-slate-900">Indigent household head</span>
                    <span className="mt-1 block text-xs text-slate-500">Use this for household heads needing financial assistance and welfare support.</span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Municipality / City *</label>
              <input
                type="text"
                value={form.municipality}
                onChange={(event) => updateForm('municipality', event.target.value)}
                onBlur={(event) => updateForm('municipality', normalizeMunicipalityName(event.target.value))}
                readOnly={masterListLocked}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="e.g., Mabini"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Barangay *</label>
              <input
                type="text"
                value={form.barangay_name}
                onChange={(event) => updateForm('barangay_name', event.target.value)}
                onBlur={(event) => updateForm('barangay_name', normalizeBarangayName(event.target.value))}
                readOnly={masterListLocked}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="e.g., Barangay 1"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Purok / Sitio *</label>
              <input
                type="text"
                list="registration-purok-options"
                value={form.purok_sitio}
                onChange={(event) => updateForm('purok_sitio', event.target.value)}
                onBlur={(event) => updateForm('purok_sitio', normalizePurokSitio(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="Type the purok or sitio"
              />
              <datalist id="registration-purok-options">
                {purokOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <p className="mt-2 text-xs text-slate-500">
                Type a new purok if it is not listed. Saved puroks will appear in suggestions.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Address *</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-400" />
                <textarea
                  rows={3}
                  value={form.street_address}
                  onChange={(event) => updateForm('street_address', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="House number, street, landmark, or nearby place"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Supporting document</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50">
                <Upload className="h-4 w-4 text-indigo-500" />
                <span className="font-medium">
                  {form.supporting_document_name || 'Upload supporting document if needed'}
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) => { void handleDocumentChange(event); }}
                  className="hidden"
                />
              </label>
              {documentError && <p className="mt-2 text-xs text-red-600">{documentError}</p>}
              {form.supporting_document_name && !documentError && (
                <p className="mt-2 text-xs text-slate-500">Stored for admin review: {form.supporting_document_name}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-600" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Household Members</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Add the other people living in this household so admin can review the full family record.
                      </p>
                    </div>
                  </div>
                  {!showMemberForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMemberForm(true);
                        setMemberError('');
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Plus className="h-4 w-4" />
                      Add Member
                    </button>
                  )}
                </div>

                {members.length > 0 && (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                      {[
                        { label: 'Members', value: members.length },
                        { label: 'Infants', value: memberSummary.infants },
                        { label: 'Children', value: memberSummary.children },
                        { label: 'Seniors', value: memberSummary.seniors },
                        { label: 'PWD / Pregnant', value: memberSummary.pwd + memberSummary.pregnant },
                        { label: '4Ps / Indigent', value: memberSummary.fourPs + memberSummary.indigent },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                          <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {members.map((member, index) => (
                        <div
                          key={`${member.full_name}-${member.birthdate}-${index}`}
                          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">{member.full_name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {member.relationship_to_head}
                              {member.birthdate ? ` · Age ${calculateAge(member.birthdate)}` : ''}
                              {' · '}
                              {member.gender === 'F' ? 'Female' : 'Male'}
                              {member.occupation.trim() ? ` · ${member.occupation.trim()}` : ''}
                            </p>
                            {getMemberTags(member).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {getMemberTags(member).map((label) => (
                                  <span
                                    key={label}
                                    className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(index)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showMemberForm ? (
                  <div className="mt-4 space-y-4 rounded-2xl border border-indigo-200 bg-white p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">New household member</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Add each family member one by one. These will be included in the pending admin review.
                      </p>
                    </div>

                    {memberError && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                        {memberError}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Full name *</label>
                        <input
                          type="text"
                          value={memberDraft.full_name}
                          onChange={(event) => setMemberDraft((current) => ({ ...current, full_name: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          placeholder="e.g., Maria Dela Cruz"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Birthdate *</label>
                        <input
                          type="date"
                          value={memberDraft.birthdate}
                          onChange={(event) => setMemberDraft((current) => ({ ...current, birthdate: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {memberDraftAge !== null && (
                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                              Age {memberDraftAge}
                            </span>
                          )}
                          {memberDraftAgeCategory === 'child' && (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                              Minor
                            </span>
                          )}
                          {isInfantBirthdate(memberDraft.birthdate) && (
                            <span className="rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-semibold text-pink-700">
                              Infant
                            </span>
                          )}
                          {memberDraftAgeCategory === 'senior' && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                              Senior
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
                        <select
                          value={memberDraft.gender}
                          onChange={(event) => setMemberDraft((current) => ({ ...current, gender: event.target.value as 'M' | 'F' }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        >
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Relationship to head *</label>
                        <input
                          type="text"
                          list="resident-registration-member-relationship-options"
                          value={memberDraft.relationship_to_head}
                          onChange={(event) => setMemberDraft((current) => ({ ...current, relationship_to_head: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          placeholder="Spouse, Child, Parent"
                        />
                        <datalist id="resident-registration-member-relationship-options">
                          {RELATIONSHIP_OPTIONS.map((option) => (
                            <option key={option} value={option} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Civil status</label>
                        <select
                          value={memberDraft.civil_status}
                          onChange={(event) => setMemberDraft((current) => ({
                            ...current,
                            civil_status: event.target.value as MemberDraft['civil_status'],
                          }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        >
                          <option value="single">Single</option>
                          <option value="married">Married</option>
                          <option value="widowed">Widowed</option>
                          <option value="separated">Separated</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Occupation</label>
                        <input
                          type="text"
                          value={memberDraft.occupation}
                          onChange={(event) => setMemberDraft((current) => ({ ...current, occupation: event.target.value }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          placeholder="Farmer, Student, Vendor"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Income level</label>
                        <select
                          value={memberDraft.income_level}
                          onChange={(event) => setMemberDraft((current) => ({
                            ...current,
                            income_level: event.target.value as MemberDraft['income_level'],
                          }))}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        >
                          <option value="low">Low</option>
                          <option value="middle">Middle</option>
                          <option value="high">High</option>
                        </select>
                      </div>

                      <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vulnerability tracking</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Infant, Minor, and Senior tags are automatic from the birthdate. Mark Pregnant, PWD, 4Ps, and Indigent so the review team sees them immediately.
                        </p>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={memberDraft.is_pregnant}
                              onChange={(event) => setMemberDraft((current) => ({
                                ...current,
                                is_pregnant: event.target.checked,
                                pregnancy_months: event.target.checked ? current.pregnancy_months : '',
                                expected_delivery_date: event.target.checked ? current.expected_delivery_date : '',
                              }))}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300"
                            />
                            <span>
                              <span className="block font-semibold text-slate-900">Pregnant member</span>
                              <span className="mt-1 block text-xs text-slate-500">Include this member in maternal health and priority response reports.</span>
                            </span>
                          </label>

                          {memberDraft.is_pregnant && (
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Pregnancy month *</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={9}
                                    value={memberDraft.pregnancy_months ?? ''}
                                    onChange={(event) => setMemberDraft((current) => ({
                                      ...current,
                                      pregnancy_months: event.target.value ? Number(event.target.value) : '',
                                    }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                    placeholder="e.g. 6"
                                  />
                                </div>
                                <div>
                                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Expected date of delivery (EDD) *</label>
                                  <input
                                    type="date"
                                    value={memberDraft.expected_delivery_date || ''}
                                    onChange={(event) => setMemberDraft((current) => ({
                                      ...current,
                                      expected_delivery_date: event.target.value,
                                    }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {memberDraft.is_pregnant && memberPregnancyProgress && (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900 md:col-span-2">
                              <p className="font-semibold">
                                {memberDraft.pregnancy_months} month{memberDraft.pregnancy_months === 1 ? '' : 's'} pregnant
                              </p>
                              <p className="mt-1 text-xs text-rose-700">
                                {memberPregnancyProgress.trimesterLabel}
                                {' · '}
                                {memberPregnancyProgress.monthsRemaining === 0
                                  ? 'Full-term month reached, monitor closely for delivery and maternal care.'
                                  : `About ${memberPregnancyProgress.monthsRemaining} month${memberPregnancyProgress.monthsRemaining === 1 ? '' : 's'} left before the usual 9-month full term.`}
                              </p>
                              {memberDraft.expected_delivery_date ? (
                                <p className="mt-1 text-xs text-rose-700">
                                  Expected date of delivery (EDD): {memberDraft.expected_delivery_date}
                                </p>
                              ) : null}
                            </div>
                          )}

                          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={memberDraft.is_4ps}
                              onChange={(event) => setMemberDraft((current) => ({ ...current, is_4ps: event.target.checked }))}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300"
                            />
                            <span>
                              <span className="block font-semibold text-slate-900">4Ps beneficiary</span>
                              <span className="mt-1 block text-xs text-slate-500">Mark members covered by the Pantawid Pamilyang Pilipino Program.</span>
                            </span>
                          </label>

                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <label className="flex items-start gap-3 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={memberDraft.is_pwd}
                                onChange={(event) => setMemberDraft((current) => ({
                                  ...current,
                                  is_pwd: event.target.checked,
                                  pwd_type: event.target.checked ? current.pwd_type : '',
                                }))}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                              />
                              <span>
                                <span className="block font-semibold text-slate-900">PWD member</span>
                                <span className="mt-1 block text-xs text-slate-500">Mark persons with disability so they appear correctly in vulnerability counts.</span>
                              </span>
                            </label>

                            {memberDraft.is_pwd && (
                              <div className="mt-3">
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">PWD type *</label>
                                <select
                                  value={memberDraft.pwd_type || ''}
                                  onChange={(event) => setMemberDraft((current) => ({
                                    ...current,
                                    pwd_type: event.target.value as PWDType | '',
                                  }))}
                                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                >
                                  <option value="">Select PWD type</option>
                                  {Object.entries(PWD_TYPE_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={memberDraft.is_indigent}
                              onChange={(event) => setMemberDraft((current) => ({ ...current, is_indigent: event.target.checked }))}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300"
                            />
                            <span>
                              <span className="block font-semibold text-slate-900">Indigent member</span>
                              <span className="mt-1 block text-xs text-slate-500">Use this for members needing financial assistance and priority welfare support.</span>
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleAddMember}
                        className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        <Plus className="h-4 w-4" />
                        Add to member list
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMemberForm(false);
                          setMemberDraft({ ...EMPTY_MEMBER });
                          setMemberError('');
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  members.length === 0 && (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                      <Users className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-700">No household members added yet</p>
                      <p className="mt-1 text-xs text-slate-500">
                        You can still submit without members, but adding them helps admin review the full household.
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Location Verification</h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose how to capture the location, then confirm the final map pin.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              <Search className="h-3.5 w-3.5" />
              Admin will still review this pin
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => { void handleUseCurrentLocation(); }}
              disabled={isLocating}
              className={`rounded-3xl border px-5 py-5 text-left transition ${
                locationMode === 'current'
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50 hover:border-emerald-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  {isLocating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900">Use My Current Location</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Capture GPS from this device and prefill the nearby address when available.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setLocationMode('manual')}
              className={`rounded-3xl border px-5 py-5 text-left transition ${
                locationMode === 'manual'
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-slate-200 bg-slate-50 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900">Enter Location Manually</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Search, click, or refine the marker directly on the map preview below.
                  </p>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <LocationPicker
              lat={form.gps_lat}
              lng={form.gps_long}
              defaultAddress={addressSummary}
              searchContext={{
                municipality: form.municipality,
                barangayName: form.barangay_name,
                purokSitio: form.purok_sitio,
              }}
              height="320px"
              onChange={(lat, lng, details) => {
                if (lat === undefined || lng === undefined) {
                  setForm((current) => ({
                    ...current,
                    gps_lat: undefined,
                    gps_long: undefined,
                    location_source: undefined,
                    location_confidence: undefined,
                  }));
                  setLocationConfirmed(false);
                  return;
                }

                applyResolvedLocation(
                  { lat, lng },
                  locationMode === 'current' ? 'current_gps' : 'manual_pin',
                  locationMode === 'current' ? 'medium' : 'high',
                  details,
                );
              }}
            />

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Map Preview</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {addressSummary || 'Capture the location to show the address summary.'}
                </p>
                {form.landmark_directions.trim() && (
                  <p className="mt-2 text-xs text-slate-500">Directions: {form.landmark_directions.trim()}</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coordinates</p>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <p>Latitude: <span className="font-semibold text-slate-900">{formatCoordinate(form.gps_lat)}</span></p>
                  <p>Longitude: <span className="font-semibold text-slate-900">{formatCoordinate(form.gps_long)}</span></p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Confirm the final marker before continuing to admin review.
              </p>
              <button
                type="button"
                onClick={() => setLocationConfirmed(true)}
                disabled={form.gps_lat === undefined || form.gps_long === undefined}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm My Location
              </button>
            </div>

            {locationConfirmed && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Location confirmed. This registration will now go to admin location review and approval.
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Review and Submit</h2>
              <p className="mt-1 text-sm text-slate-500">
                Check the summary below before sending it to the admin approval queue.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              <Clock3 className="h-3.5 w-3.5" />
              Status after submit: Pending Review
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Personal info summary</p>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">Full name:</span> {form.head_name}</p>
                <p><span className="font-semibold text-slate-900">Birthdate:</span> {form.head_birthdate || 'Not provided'}</p>
                <p><span className="font-semibold text-slate-900">Gender:</span> {form.head_gender === 'F' ? 'Female' : 'Male'}</p>
                <p><span className="font-semibold text-slate-900">Civil status:</span> {form.head_civil_status}</p>
                <p><span className="font-semibold text-slate-900">Occupation:</span> {form.head_occupation || 'Not provided'}</p>
                <p><span className="font-semibold text-slate-900">Income level:</span> {form.head_income_level}</p>
                <p><span className="font-semibold text-slate-900">Contact:</span> {form.contact_number}</p>
                <p><span className="font-semibold text-slate-900">Email:</span> {form.applicant_email}</p>
                {form.head_is_pregnant && typeof form.head_pregnancy_months === 'number' && (
                  <p>
                    <span className="font-semibold text-slate-900">Pregnancy tracking:</span>{' '}
                    {form.head_pregnancy_months} months pregnant
                    {form.head_expected_delivery_date ? ` · EDD ${form.head_expected_delivery_date}` : ''}
                  </p>
                )}
                {form.supporting_document_name && (
                  <p><span className="font-semibold text-slate-900">Document:</span> {form.supporting_document_name}</p>
                )}
              </div>
              {headDraftTags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {headDraftTags.map((label) => (
                    <span key={label} className="rounded-full bg-white px-3 py-1 font-medium text-slate-600">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Address summary</p>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">Municipality:</span> {form.municipality}</p>
                <p><span className="font-semibold text-slate-900">Barangay:</span> {form.barangay_name}</p>
                <p><span className="font-semibold text-slate-900">Purok / Sitio:</span> {form.purok_sitio}</p>
                <p><span className="font-semibold text-slate-900">Address:</span> {form.street_address}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Household members</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {members.length === 0 ? 'No extra members added' : `${members.length} member${members.length === 1 ? '' : 's'} included for review`}
                  </p>
                </div>
                {members.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600">Infants: {memberSummary.infants}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600">Children: {memberSummary.children}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600">Seniors: {memberSummary.seniors}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600">Pregnant: {memberSummary.pregnant}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600">PWD: {memberSummary.pwd}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600">4Ps: {memberSummary.fourPs}</span>
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600">Indigent: {memberSummary.indigent}</span>
                  </div>
                )}
              </div>

              {members.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {members.map((member, index) => (
                    <div
                      key={`${member.full_name}-${member.birthdate}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <p className="text-sm font-semibold text-slate-900">{member.full_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {member.relationship_to_head}
                        {member.birthdate ? ` · Age ${calculateAge(member.birthdate)}` : ''}
                        {' · '}
                        {member.gender === 'F' ? 'Female' : 'Male'}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Civil status: {member.civil_status}
                        {member.occupation.trim() ? ` · Occupation: ${member.occupation.trim()}` : ''}
                        {' · '}
                        Income: {member.income_level}
                      </p>
                      {member.is_pregnant && typeof member.pregnancy_months === 'number' ? (
                        <p className="mt-2 text-xs text-rose-700">
                          Pregnancy tracking: {member.pregnancy_months} months pregnant
                          {member.expected_delivery_date ? ` · EDD ${member.expected_delivery_date}` : ''}
                        </p>
                      ) : null}
                      {getMemberTags(member).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {getMemberTags(member).map((label) => (
                            <span
                              key={label}
                              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  Only the household head will be submitted in this registration.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Map / location summary</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{addressSummary}</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                  {form.location_source === 'current_gps' ? 'Current Location' : 'Manual Pin'}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <LocationPicker
                  readonly
                  height="260px"
                  lat={form.gps_lat}
                  lng={form.gps_long}
                />
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Location details</p>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    <p><span className="font-semibold text-slate-900">Latitude:</span> {formatCoordinate(form.gps_lat)}</p>
                    <p><span className="font-semibold text-slate-900">Longitude:</span> {formatCoordinate(form.gps_long)}</p>
                    <p><span className="font-semibold text-slate-900">Confidence:</span> {(form.location_confidence || 'medium').toUpperCase()}</p>
                    <p><span className="font-semibold text-slate-900">Next status:</span> Pending Review</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50/70 px-5 py-4">
            <p className="text-sm font-semibold text-indigo-900">After you submit</p>
            <div className="mt-3 grid gap-2 text-sm text-indigo-800 sm:grid-cols-4">
              <div className="rounded-2xl bg-white px-3 py-3">Submitted</div>
              <div className="rounded-2xl bg-white px-3 py-3">Location Review</div>
              <div className="rounded-2xl bg-white px-3 py-3">Admin Approval</div>
              <div className="rounded-2xl bg-white px-3 py-3">Approved / Rejected</div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-amber-900">Before final approval, visit the MSWDO office</p>
                <p className="mt-1 text-sm text-amber-800">
                  Bring the required documents so staff can verify your submission.
                </p>
              </div>
              <button
                type="button"
                onClick={openRequirementsDialog}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100/60"
              >
                <FileText className="h-4 w-4" />
                View Requirements
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-amber-900 sm:grid-cols-2">
              {OFFICE_REQUIREMENTS.slice(0, 2).map((item) => (
                <div key={item} className="rounded-2xl bg-white px-3 py-3">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 1 || isSubmitting}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Continue
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={openRequirementsDialog}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
          </button>
        )}
      </div>

      <Dialog
        open={showRequirementsDialog}
        onOpenChange={(open) => {
          setShowRequirementsDialog(open);
          if (!open) {
            setRequirementsAcknowledged(false);
          }
        }}
      >
        <DialogContent className="max-w-xl rounded-3xl border-slate-200 p-0 overflow-hidden">
          <div className="bg-amber-50 px-6 py-5">
            <DialogHeader className="text-left">
              <DialogTitle className="text-xl text-slate-900">MSWDO Office Requirements</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">
                Before your registration can be finalized, please go to the MSWDO office and bring the following:
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-3">
              {OFFICE_REQUIREMENTS.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <input
                type="checkbox"
                checked={requirementsAcknowledged}
                onChange={(event) => setRequirementsAcknowledged(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                I understand that I must visit the MSWDO office and bring these requirements for verification.
              </span>
            </label>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4 sm:justify-between">
            <button
              type="button"
              onClick={() => setShowRequirementsDialog(false)}
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => { void submitRegistration(); }}
              disabled={!requirementsAcknowledged || isSubmitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {isSubmitting ? 'Submitting...' : 'I Understand, Submit Now'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

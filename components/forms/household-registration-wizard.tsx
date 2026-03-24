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
  Phone,
  Search,
  Upload,
  User,
} from 'lucide-react';
import { LocationPicker } from '@/components/LocationPicker';
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
import type { Household, LocationConfidence, LocationSource } from '@/lib/db/schema';

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MUNICIPALITY = process.env.NEXT_PUBLIC_DEFAULT_MUNICIPALITY?.trim() || '';

interface RegistrationWizardProps {
  barangayId: string;
  initialValues?: Partial<RegistrationFormState>;
  lockApplicantEmail?: boolean;
  onSubmit: (
    data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
  ) => Promise<string>;
}

interface RegistrationFormState {
  head_name: string;
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
  { id: 1, label: 'Personal Information', hint: 'Basic profile and address' },
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
  contact_number: '',
  applicant_email: '',
  municipality: DEFAULT_MUNICIPALITY,
  barangay_name: '',
  purok_sitio: '',
  street_address: '',
  landmark_directions: '',
};

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

export function HouseholdRegistrationWizard({
  barangayId,
  initialValues,
  lockApplicantEmail = false,
  onSubmit,
}: RegistrationWizardProps) {
  const router = useRouter();
  const { isLoaded: mapsReady } = useGoogleMaps();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RegistrationFormState>({
    ...EMPTY_FORM,
    ...initialValues,
  });
  const [masterListLocked, setMasterListLocked] = useState(false);
  const [purokOptions, setPurokOptions] = useState<string[]>([]);
  const [locationMode, setLocationMode] = useState<'current' | 'manual'>('manual');
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [documentError, setDocumentError] = useState('');
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
          purok_sitio: current.purok_sitio || masterList?.puroks?.[0] || current.purok_sitio,
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
      form.street_address.trim(),
      form.purok_sitio.trim(),
      form.barangay_name.trim(),
      form.municipality.trim(),
    ].filter(Boolean).join(', ');
  }, [form]);

  const canContinueFromStepOne = useMemo(() => {
    return Boolean(
      form.head_name.trim()
      && form.contact_number.trim()
      && form.applicant_email.trim()
      && isEmailValid(form.applicant_email)
      && form.street_address.trim()
      && form.purok_sitio.trim()
      && form.barangay_name.trim()
      && form.municipality.trim(),
    );
  }, [form]);

  const canContinueFromStepTwo = useMemo(() => {
    return Boolean(
      form.gps_lat !== undefined
      && form.gps_long !== undefined
      && locationConfirmed,
    );
  }, [form.gps_lat, form.gps_long, locationConfirmed]);

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

  function goNext() {
    setError('');

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
      });

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
                placeholder="e.g., Purok 3"
              />
              <datalist id="registration-purok-options">
                {purokOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
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
                <p><span className="font-semibold text-slate-900">Contact:</span> {form.contact_number}</p>
                <p><span className="font-semibold text-slate-900">Email:</span> {form.applicant_email}</p>
                {form.supporting_document_name && (
                  <p><span className="font-semibold text-slate-900">Document:</span> {form.supporting_document_name}</p>
                )}
              </div>
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

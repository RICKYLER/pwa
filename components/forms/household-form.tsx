'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Household, PWDType } from '@/lib/db/schema';
import type { AddressValidationSummary } from '@/lib/address-validation';
import { Autocomplete } from '@react-google-maps/api';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Home,
  Loader2,
  MapPinned,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { LocationPicker } from '@/components/LocationPicker';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { getCurrentUser } from '@/lib/auth';
import { getAllPuroks } from '@/lib/db/households';
import { getLocationMasterList } from '@/lib/db/location-master';
import { DEFAULT_BARANGAY_CENTER } from '@/lib/map-pins';
import {
  buildDefaultSearchBounds,
  buildHouseholdAddressPreview,
  buildHouseholdGeocodingAddress,
  buildResponderLocationText,
  formatBarangayName,
  getPlacePinDetails,
  mergePurokOptions,
  normalizeBarangayName,
  normalizeMunicipalityName,
  normalizePurokSitio,
  searchLocation,
} from '@/lib/geocoding';

// Partial resident data collected before the household ID is known
export interface MemberDraft {
  full_name: string;
  birthdate: string;
  gender: 'M' | 'F';
  relationship_to_head: string;
  civil_status: 'single' | 'married' | 'widowed' | 'separated';
  occupation: string;
  income_level: 'low' | 'middle' | 'high';
  is_pregnant: boolean;
  is_pwd: boolean;
  pwd_type?: PWDType | '';
}

interface HouseholdFormProps {
  initialData?: Household;
  onSubmit: (
    data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
    members: MemberDraft[]
  ) => Promise<void>;
  isLoading?: boolean;
}

const EMPTY_MEMBER: MemberDraft = {
  full_name: '',
  birthdate: '',
  gender: 'M',
  relationship_to_head: '',
  civil_status: 'single',
  occupation: '',
  income_level: 'low',
  is_pregnant: false,
  is_pwd: false,
  pwd_type: '',
};

const DEFAULT_MUNICIPALITY = process.env.NEXT_PUBLIC_DEFAULT_MUNICIPALITY?.trim() || '';
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

function validationTone(status: AddressValidationSummary['status']) {
  switch (status) {
    case 'accepted':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'review':
    case 'unsupported':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    default:
      return 'border-rose-200 bg-rose-50 text-rose-900';
  }
}

function componentLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function calculateAge(birthdate: string): number {
  if (!birthdate) return 0;
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getAgeCategory(birthdate: string): 'child' | 'adult' | 'senior' | null {
  if (!birthdate) return null;
  const age = calculateAge(birthdate);
  if (age < 18) return 'child';
  if (age >= 60) return 'senior';
  return 'adult';
}

function getMemberVulnerabilityLabels(member: MemberDraft): string[] {
  const labels: string[] = [];
  const ageCategory = getAgeCategory(member.birthdate);

  if (ageCategory === 'child') labels.push('Minor');
  if (ageCategory === 'senior') labels.push('Senior');
  if (member.is_pregnant) labels.push('Pregnant');
  if (member.is_pwd) {
    labels.push(member.pwd_type ? `PWD - ${PWD_TYPE_LABELS[member.pwd_type]}` : 'PWD');
  }

  return labels;
}

function getRelationshipSummaryKey(value: string):
  | 'child'
  | 'mother'
  | 'father'
  | 'spouse'
  | 'sibling'
  | 'grandparent'
  | 'other' {
  const normalized = value.trim().toLowerCase();

  if (['child', 'son', 'daughter'].includes(normalized)) return 'child';
  if (['mother', 'mom', 'mama', 'nanay'].includes(normalized)) return 'mother';
  if (['father', 'dad', 'papa', 'tatay'].includes(normalized)) return 'father';
  if (['spouse', 'wife', 'husband', 'partner'].includes(normalized)) return 'spouse';
  if (['brother', 'sister', 'sibling'].includes(normalized)) return 'sibling';
  if (['grandmother', 'grandfather', 'grandparent', 'lola', 'lolo'].includes(normalized)) return 'grandparent';

  return 'other';
}

function formatRelationshipLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';

  const summaryKey = getRelationshipSummaryKey(normalized);
  if (summaryKey === 'child') return 'Child';
  if (summaryKey === 'mother') return 'Mother';
  if (summaryKey === 'father') return 'Father';
  if (summaryKey === 'spouse') return 'Spouse';
  if (summaryKey === 'sibling') {
    if (normalized.toLowerCase() === 'brother') return 'Brother';
    if (normalized.toLowerCase() === 'sister') return 'Sister';
    return 'Sibling';
  }
  if (summaryKey === 'grandparent') {
    if (normalized.toLowerCase() === 'grandmother' || normalized.toLowerCase() === 'lola') return 'Grandmother';
    if (normalized.toLowerCase() === 'grandfather' || normalized.toLowerCase() === 'lolo') return 'Grandfather';
    return 'Grandparent';
  }

  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function HouseholdForm({ initialData, onSubmit, isLoading = false }: HouseholdFormProps) {
  const { isLoaded: mapsReady } = useGoogleMaps();
  const currentUser = getCurrentUser();
  const addressAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [formData, setFormData] = useState({
    head_name: initialData?.head_name || '',
    barangay_id: initialData?.barangay_id || 'barangay-1',
    barangay_name: initialData?.barangay_name || formatBarangayName(initialData?.barangay_id || 'barangay-1'),
    municipality: initialData?.municipality || DEFAULT_MUNICIPALITY,
    purok_sitio: initialData?.purok_sitio ? normalizePurokSitio(initialData.purok_sitio) : '',
    street_address: initialData?.street_address || '',
    landmark_directions: initialData?.landmark_directions || '',
    contact_number: initialData?.contact_number || '',
    status: (initialData?.status || 'active') as Household['status'],
    gps_lat: initialData?.gps_lat ?? undefined,
    gps_long: initialData?.gps_long ?? undefined,
    location_source: initialData?.location_source,
    location_confidence: initialData?.location_confidence,
    location_verified: initialData?.location_verified ?? false,
    location_verified_at: initialData?.location_verified_at,
    location_verified_by: initialData?.location_verified_by,
  });

  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberDraft, setMemberDraft] = useState<MemberDraft>({ ...EMPTY_MEMBER });
  const [memberError, setMemberError] = useState('');
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [locationSuccess, setLocationSuccess] = useState('');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [matchedAddress, setMatchedAddress] = useState('');
  const [addressValidation, setAddressValidation] = useState<AddressValidationSummary | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [lastValidatedAddress, setLastValidatedAddress] = useState('');
  const [purokOptions, setPurokOptions] = useState<string[]>([]);
  const [masterListLocked, setMasterListLocked] = useState(false);
  const [manualPinRequired, setManualPinRequired] = useState(false);
  const [manualPinConfirmed, setManualPinConfirmed] = useState(
    initialData?.location_source === 'manual_pin' ? Boolean(initialData.location_verified) : false,
  );
  const [pinSource, setPinSource] = useState<Household['location_source'] | null>(
    initialData?.location_source
      || (initialData?.gps_lat !== undefined && initialData?.gps_long !== undefined ? 'manual_pin' : null),
  );
  const [lastPinnedAddress, setLastPinnedAddress] = useState(
    initialData ? buildHouseholdGeocodingAddress(initialData) : '',
  );

  const addressLookup = buildHouseholdGeocodingAddress(formData);
  const addressPreview = buildHouseholdAddressPreview(formData);
  const addressValidationSignature = [
    formData.street_address,
    formData.purok_sitio,
    formData.barangay_name,
    formData.municipality,
  ]
    .map((value) => value.trim())
    .join('|');
  const responderLocationText = buildResponderLocationText({
    streetAddress: formData.street_address,
    purokSitio: formData.purok_sitio,
    barangayName: formData.barangay_name,
    municipality: formData.municipality,
  });
  const verifiedPurokOptions = mergePurokOptions(purokOptions);
  const requiresManualVerification = pinSource === 'manual_pin';
  const memberDraftAge = memberDraft.birthdate ? calculateAge(memberDraft.birthdate) : null;
  const memberDraftAgeCategory = getAgeCategory(memberDraft.birthdate);
  const memberSummary = members.reduce(
    (summary, member) => {
      const ageCategory = getAgeCategory(member.birthdate);

      if (ageCategory === 'child') summary.child++;
      if (ageCategory === 'senior') summary.senior++;
      if (member.is_pregnant) summary.pregnant++;
      if (member.is_pwd) summary.pwd++;

      return summary;
    },
    { child: 0, senior: 0, pregnant: 0, pwd: 0 },
  );
  const relationshipSummary = members.reduce(
    (summary, member) => {
      summary[getRelationshipSummaryKey(member.relationship_to_head)]++;
      return summary;
    },
    {
      child: 0,
      mother: 0,
      father: 0,
      spouse: 0,
      sibling: 0,
      grandparent: 0,
      other: 0,
    },
  );
  const relationshipCards = [
    { key: 'child', label: 'Child', count: relationshipSummary.child },
    { key: 'mother', label: 'Mother', count: relationshipSummary.mother },
    { key: 'father', label: 'Father', count: relationshipSummary.father },
    { key: 'spouse', label: 'Spouse', count: relationshipSummary.spouse },
    ...(relationshipSummary.sibling > 0
      ? [{ key: 'sibling', label: 'Sibling', count: relationshipSummary.sibling }]
      : []),
    ...(relationshipSummary.grandparent > 0
      ? [{ key: 'grandparent', label: 'Grandparent', count: relationshipSummary.grandparent }]
      : []),
    ...(relationshipSummary.other > 0
      ? [{ key: 'other', label: 'Other Relative', count: relationshipSummary.other }]
      : []),
  ];

  useEffect(() => {
    let cancelled = false;

    async function loadAddressMaster() {
      try {
        const [values, masterList] = await Promise.all([
          getAllPuroks(formData.barangay_id),
          getLocationMasterList(formData.barangay_id),
        ]);
        if (!cancelled) {
          setPurokOptions(mergePurokOptions([...(masterList?.puroks ?? []), ...values]));
          setMasterListLocked(Boolean(masterList?.municipality || masterList?.barangay_name));

          if (masterList) {
            setFormData((prev) => ({
              ...prev,
              municipality: masterList.municipality || prev.municipality,
              barangay_name: masterList.barangay_name || prev.barangay_name,
              purok_sitio: prev.purok_sitio,
            }));
          }
        }
      } catch {
        if (!cancelled) {
          setPurokOptions(mergePurokOptions([]));
          setMasterListLocked(false);
        }
      }
    }

    void loadAddressMaster();

    return () => {
      cancelled = true;
    };
  }, [formData.barangay_id]);

  useEffect(() => {
    if (pinSource !== 'address_search' || !lastPinnedAddress || addressLookup === lastPinnedAddress) {
      return;
    }

    setFormData((prev) => ({ ...prev, gps_lat: undefined, gps_long: undefined }));
    setPinSource(null);
    setLastPinnedAddress('');
    setMatchedAddress('');
    setLocationError('Address changed. Pin the updated address again or move the marker manually.');
  }, [addressLookup, lastPinnedAddress, pinSource]);

  useEffect(() => {
    if (!addressValidation) return;
    if (addressValidationSignature === lastValidatedAddress) return;
    setAddressValidation(null);
  }, [addressValidation, addressValidationSignature, lastValidatedAddress]);

  function handleAddressAutocomplete() {
    const place = addressAutocompleteRef.current?.getPlace();
    if (!place) return;

    const pin = getPlacePinDetails(place);
    const nextStreetAddress = pin?.streetAddress || formData.street_address;

    setLocationError('');
    setLocationSuccess('');
    setManualPinRequired(false);
    setManualPinConfirmed(false);
    setMatchedAddress(pin?.formattedAddress || place.formatted_address || place.name || '');
    setFormData((prev) => ({
      ...prev,
      street_address: nextStreetAddress,
      barangay_name: masterListLocked ? prev.barangay_name : pin?.barangayName || prev.barangay_name,
      municipality: masterListLocked ? prev.municipality : pin?.municipality || prev.municipality,
      purok_sitio: pin?.purokSitio || prev.purok_sitio,
      gps_lat: pin?.lat ?? prev.gps_lat,
      gps_long: pin?.lng ?? prev.gps_long,
      location_source: pin ? 'address_search' : prev.location_source,
      location_confidence: pin ? 'medium' : prev.location_confidence,
      location_verified: false,
      location_verified_at: undefined,
      location_verified_by: undefined,
    }));

    if (pin) {
      const nextLookup = buildHouseholdGeocodingAddress({
        ...formData,
        street_address: nextStreetAddress,
        barangay_name: pin.barangayName || formData.barangay_name,
        municipality: pin.municipality || formData.municipality,
        purok_sitio: pin.purokSitio || formData.purok_sitio,
      });
      setPinSource('address_search');
      setLastPinnedAddress(nextLookup);
    }
  }

  async function resolveAddressToPin() {
    setLocationError('');
    setLocationSuccess('');

    if (
      !formData.street_address.trim() ||
      !formData.purok_sitio.trim() ||
      !formData.barangay_name.trim() ||
      !formData.municipality.trim()
    ) {
      setLocationError('Complete the municipality, barangay, purok/sitio, and street fields first before pinning.');
      return null;
    }

    if (!mapsReady) {
      setLocationError('Google Maps is still loading. Please wait a moment, then try again.');
      return null;
    }

    setIsResolvingAddress(true);
    try {
      const geocoded = await searchLocation(formData.street_address, {
        context: {
          municipality: formData.municipality,
          barangayName: formData.barangay_name,
          purokSitio: formData.purok_sitio,
        },
        bounds: buildDefaultSearchBounds(),
        locationBias:
          formData.gps_lat !== undefined && formData.gps_long !== undefined
            ? { lat: formData.gps_lat, lng: formData.gps_long }
            : DEFAULT_BARANGAY_CENTER,
        radiusMeters: 20000,
        region: 'ph',
      });

      if (!geocoded) {
        setManualPinRequired(true);
        setLocationError('Google could not locate this address. Manual pin is now required before you can save this household.');
        return null;
      }

      setFormData((prev) => ({
        ...prev,
        street_address: geocoded.streetAddress || prev.street_address,
        barangay_name: masterListLocked ? prev.barangay_name : geocoded.barangayName || prev.barangay_name,
        municipality: masterListLocked ? prev.municipality : geocoded.municipality || prev.municipality,
        purok_sitio: geocoded.purokSitio || prev.purok_sitio,
        gps_lat: geocoded.lat,
        gps_long: geocoded.lng,
        location_source: 'address_search',
        location_confidence: 'medium',
        location_verified: false,
        location_verified_at: undefined,
        location_verified_by: undefined,
      }));
      setManualPinRequired(false);
      setManualPinConfirmed(false);
      setPinSource('address_search');
      setLastPinnedAddress(addressLookup);
      setMatchedAddress(geocoded.formattedAddress);
      setLocationSuccess('Address located successfully. The household pin is ready to save.');

      return geocoded;
    } finally {
      setIsResolvingAddress(false);
    }
  }

  async function validateTypedAddress() {
    setAddressValidation(null);

    if (
      !formData.street_address.trim()
      || !formData.purok_sitio.trim()
      || !formData.barangay_name.trim()
      || !formData.municipality.trim()
    ) {
      setAddressValidation({
        supported: false,
        source: 'coverage_check',
        status: 'fix',
        title: 'Complete the address first',
        message: 'Fill in the municipality, barangay, purok/sitio, and street fields before using the Address Validation API.',
        regionCode: 'PH',
        missingComponentTypes: [],
        unconfirmedComponentTypes: [],
        unresolvedTokens: [],
      });
      return;
    }

    setIsValidatingAddress(true);

    try {
      const response = await fetch('/api/address/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: {
            regionCode: 'PH',
            locality: formData.municipality,
            administrativeArea: formData.barangay_name,
            addressLines: [
              formData.street_address,
              formData.purok_sitio,
              formData.barangay_name,
            ].filter(Boolean),
          },
        }),
      });

      const payload = (await response.json()) as AddressValidationSummary | { error?: string };

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : `HTTP ${response.status}`);
      }

      if ('status' in payload) {
        setAddressValidation(payload);
        setLastValidatedAddress(addressValidationSignature);

        if (payload.formattedAddress) {
          setMatchedAddress(payload.formattedAddress);
        }

        if (payload.geocode && payload.supported) {
          setFormData((prev) => ({
            ...prev,
            gps_lat: prev.gps_lat ?? payload.geocode?.lat,
            gps_long: prev.gps_long ?? payload.geocode?.lng,
          }));
        }
      }
    } catch (err) {
      setAddressValidation({
        supported: false,
        source: 'coverage_check',
        status: 'error',
        title: 'Address validation failed',
        message: err instanceof Error ? err.message : 'Could not validate this address.',
        regionCode: 'PH',
        missingComponentTypes: [],
        unconfirmedComponentTypes: [],
        unresolvedTokens: [],
      });
    } finally {
      setIsValidatingAddress(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...formData };

      if (manualPinRequired && (payload.gps_lat === undefined || payload.gps_long === undefined)) {
        throw new Error('Manual pin required: Google could not locate the address. Please drop a pin on the map before saving.');
      }

      if (requiresManualVerification && !manualPinConfirmed) {
        throw new Error('Please confirm that the manual pin matches the real household location before saving.');
      }

      if (payload.gps_lat === undefined || payload.gps_long === undefined) {
        const geocoded = await resolveAddressToPin();

        if (!geocoded) {
          throw new Error('Unable to pin this household from the typed address. Please place the household pin manually on the map before saving.');
        }

        payload.gps_lat = geocoded.lat;
        payload.gps_long = geocoded.lng;
      }

      payload.location_source = pinSource || payload.location_source || 'address_search';
      payload.location_confidence = payload.location_verified
        ? 'high'
        : payload.location_source === 'manual_pin'
          ? 'high'
          : payload.gps_lat !== undefined && payload.gps_long !== undefined
            ? 'medium'
            : 'low';
      payload.location_verified = requiresManualVerification ? manualPinConfirmed : Boolean(payload.location_verified);
      payload.location_verified_at = payload.location_verified
        ? (payload.location_verified_at instanceof Date ? payload.location_verified_at : new Date())
        : undefined;
      payload.location_verified_by = payload.location_verified
        ? (payload.location_verified_by || currentUser?.id)
        : undefined;

      await onSubmit(payload, members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save household');
    }
  }

  function handleAddMember() {
    setMemberError('');
    if (!memberDraft.full_name.trim()) {
      setMemberError('Full name is required');
      return;
    }
    if (!memberDraft.birthdate) {
      setMemberError('Birthdate is required');
      return;
    }
    if (!memberDraft.relationship_to_head.trim()) {
      setMemberError('Relationship to head is required');
      return;
    }
    if (memberDraft.is_pregnant && memberDraft.gender !== 'F') {
      setMemberError('Pregnant members must use Female gender for reporting accuracy.');
      return;
    }
    if (memberDraft.is_pwd && !memberDraft.pwd_type) {
      setMemberError('Select the PWD type so this member is counted correctly in reports.');
      return;
    }
    setMembers((prev) => [
      ...prev,
      {
        ...memberDraft,
        relationship_to_head: formatRelationshipLabel(memberDraft.relationship_to_head),
      },
    ]);
    setMemberDraft({ ...EMPTY_MEMBER });
    setShowMemberForm(false);
  }

  function handleRemoveMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* ── Household Info ── */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 pb-2 border-b border-border">
          Household Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Head Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Household Head Name *
            </label>
            <input
              type="text"
              required
              value={formData.head_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, head_name: e.target.value }))}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Juan Dela Cruz"
              disabled={isLoading}
            />
          </div>

          <div className="md:col-span-2">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Address Details</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fill this out clearly so the household record, reports, and map pin all use the same professional address format.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                    <MapPinned className="h-3.5 w-3.5" />
                    Map-ready format
                  </span>
                  <button
                    type="button"
                    onClick={() => { void validateTypedAddress(); }}
                    disabled={isLoading || isValidatingAddress}
                    className="inline-flex items-center gap-1 rounded-full border border-input bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {isValidatingAddress ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {isValidatingAddress ? 'Checking API...' : 'Address Validation API'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Municipality / City *
                  </label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      required
                      value={formData.municipality}
                      onChange={(e) => {
                        setMatchedAddress('');
                        setFormData((prev) => ({ ...prev, municipality: e.target.value }));
                      }}
                      onBlur={(e) => {
                        const normalized = normalizeMunicipalityName(e.target.value);
                        setFormData((prev) => ({ ...prev, municipality: normalized }));
                      }}
                      className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., Mabini"
                      disabled={isLoading || masterListLocked}
                      readOnly={masterListLocked}
                    />
                  </div>
                  {masterListLocked && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Controlled by the admin master list for this barangay.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Barangay *
                  </label>
                  <div className="relative">
                    <Home className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      required
                      value={formData.barangay_name}
                      onChange={(e) => {
                        setMatchedAddress('');
                        setFormData((prev) => ({ ...prev, barangay_name: e.target.value }));
                      }}
                      onBlur={(e) => {
                        const normalized = normalizeBarangayName(e.target.value);
                        setFormData((prev) => ({ ...prev, barangay_name: normalized }));
                      }}
                      className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., Barangay 1"
                      disabled={isLoading || masterListLocked}
                      readOnly={masterListLocked}
                    />
                  </div>
                  {masterListLocked && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Controlled by the admin master list for this barangay.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Purok / Sitio *
                  </label>
                  <input
                    type="text"
                    list="household-purok-options"
                    required
                    value={formData.purok_sitio}
                    onChange={(e) => {
                      setMatchedAddress('');
                      setFormData((prev) => ({ ...prev, purok_sitio: e.target.value }));
                    }}
                    onBlur={(e) => {
                      const normalized = normalizePurokSitio(e.target.value);
                      setFormData((prev) => ({ ...prev, purok_sitio: normalized }));
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Type the purok or sitio"
                    disabled={isLoading}
                  />
                  <datalist id="household-purok-options">
                    {verifiedPurokOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Type a new purok if it is not listed. Saved puroks will appear in suggestions.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    House No. / Street / Landmark *
                  </label>
                  {mapsReady ? (
                    <Autocomplete
                      onLoad={(autocomplete) => {
                        addressAutocompleteRef.current = autocomplete;
                      }}
                      onPlaceChanged={handleAddressAutocomplete}
                      options={{
                        bounds: buildDefaultSearchBounds(),
                        componentRestrictions: { country: 'ph' },
                        fields: ['address_components', 'formatted_address', 'geometry', 'name', 'place_id'],
                      }}
                    >
                      <input
                        type="text"
                        required
                        value={formData.street_address}
                        onChange={(e) => {
                          setMatchedAddress('');
                          setFormData((prev) => ({ ...prev, street_address: e.target.value }));
                        }}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="e.g., Purok 4, near chapel, House 12"
                        disabled={isLoading}
                      />
                    </Autocomplete>
                  ) : (
                    <input
                      type="text"
                      required
                      value={formData.street_address}
                      onChange={(e) => {
                        setMatchedAddress('');
                        setFormData((prev) => ({ ...prev, street_address: e.target.value }));
                      }}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., House 12, near chapel"
                      disabled={isLoading}
                    />
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add a house number or landmark, then choose a Google suggestion if one appears.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Landmark / Directions
                  </label>
                  <textarea
                    rows={3}
                    value={formData.landmark_directions}
                    onChange={(e) => setFormData((prev) => ({ ...prev, landmark_directions: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Atbang sa covered court, 2nd house after the chapel, corner lot with blue gate"
                    disabled={isLoading}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add responder-friendly directions for houses that are hard to find from the road alone.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-background/80 px-3 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Responder-friendly location text
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {responderLocationText || 'Complete the municipality, barangay, purok, and street fields so responders can read the saved location clearly.'}
                </p>
                {formData.landmark_directions.trim() && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Directions: {formData.landmark_directions.trim()}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Map search uses: {addressPreview || 'Waiting for address details'}
                </p>
              </div>

              {addressValidation && (
                <div className={`mt-4 rounded-lg border px-3 py-3 ${validationTone(addressValidation.status)}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                        Address Validation API
                      </p>
                      <p className="mt-1 text-sm font-semibold">{addressValidation.title}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 font-medium">
                        Region {addressValidation.regionCode}
                      </span>
                      <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 font-medium">
                        {addressValidation.source === 'google_address_validation' ? 'Google validation' : 'Coverage check'}
                      </span>
                      {addressValidation.possibleNextAction && (
                        <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 font-medium">
                          {addressValidation.possibleNextAction}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-sm">{addressValidation.message}</p>

                  {addressValidation.formattedAddress && (
                    <div className="mt-3 rounded-md border border-current/15 bg-white/70 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                        Google formatted address
                      </p>
                      <p className="mt-1 text-sm">{addressValidation.formattedAddress}</p>
                    </div>
                  )}

                  {(addressValidation.missingComponentTypes.length > 0
                    || addressValidation.unconfirmedComponentTypes.length > 0
                    || addressValidation.unresolvedTokens.length > 0) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      {addressValidation.missingComponentTypes.length > 0 && (
                        <div className="rounded-md border border-current/15 bg-white/70 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                            Missing
                          </p>
                          <p className="mt-1 text-xs">
                            {addressValidation.missingComponentTypes.map(componentLabel).join(', ')}
                          </p>
                        </div>
                      )}
                      {addressValidation.unconfirmedComponentTypes.length > 0 && (
                        <div className="rounded-md border border-current/15 bg-white/70 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                            Unconfirmed
                          </p>
                          <p className="mt-1 text-xs">
                            {addressValidation.unconfirmedComponentTypes.map(componentLabel).join(', ')}
                          </p>
                        </div>
                      )}
                      {addressValidation.unresolvedTokens.length > 0 && (
                        <div className="rounded-md border border-current/15 bg-white/70 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">
                            Unresolved tokens
                          </p>
                          <p className="mt-1 text-xs">
                            {addressValidation.unresolvedTokens.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {addressValidation.source === 'google_address_validation' && (
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      {addressValidation.validationGranularity && (
                        <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1">
                          Validation: {addressValidation.validationGranularity}
                        </span>
                      )}
                      {addressValidation.geocodeGranularity && (
                        <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1">
                          Geocode: {addressValidation.geocodeGranularity}
                        </span>
                      )}
                      {typeof addressValidation.addressComplete === 'boolean' && (
                        <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1">
                          Complete: {addressValidation.addressComplete ? 'Yes' : 'No'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contact Number */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Contact Number
            </label>
            <input
              type="tel"
              value={formData.contact_number}
              onChange={(e) => setFormData((prev) => ({ ...prev, contact_number: e.target.value }))}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., 09171234567"
              disabled={isLoading}
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as Household['status'] }))}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            >
              <option value="active">Active</option>
              <option value="moved_out">Moved Out</option>
              <option value="deceased">Deceased</option>
            </select>
          </div>

          {/* GPS Pin Picker */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-2">
              Household Location Pin
            </label>
            <p className="text-xs text-muted-foreground mb-3">
              The system can pin this household from the typed address, or you can adjust it manually for a more exact Field Response map marker.
            </p>
            {manualPinRequired && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Manual pin required
                </div>
                <p className="mt-1">
                  Google could not locate the typed address. Drop a pin on the map and the form will update the address fields from that location when available.
                </p>
              </div>
            )}
            {matchedAddress && (
              <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Google matched this nearby location
                </div>
                <p className="mt-1">{matchedAddress}</p>
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { void resolveAddressToPin(); }}
                disabled={isLoading || isResolvingAddress}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {isResolvingAddress ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                {isResolvingAddress ? 'Pinning Address...' : 'Pin From Address'}
              </button>
              {(formData.gps_lat !== undefined && formData.gps_long !== undefined) && (
                <span className="text-xs text-emerald-700">
                  Ready for Field Response map pin
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Autocomplete plus map pin gives the best result
              </span>
            </div>
            <LocationPicker
              lat={formData.gps_lat}
              lng={formData.gps_long}
              defaultAddress={matchedAddress || addressPreview}
              searchContext={{
                municipality: formData.municipality,
                barangayName: formData.barangay_name,
                purokSitio: formData.purok_sitio,
              }}
              onChange={(lat, lng, details) => {
                setLocationError('');
                setLocationSuccess('');
                if (lat === undefined || lng === undefined) {
                  setMatchedAddress('');
                  setManualPinConfirmed(false);
                  setFormData((prev) => ({
                    ...prev,
                    gps_lat: undefined,
                    gps_long: undefined,
                    location_source: undefined,
                    location_confidence: 'low',
                    location_verified: false,
                    location_verified_at: undefined,
                    location_verified_by: undefined,
                  }));
                  setPinSource(null);
                  setLastPinnedAddress('');
                  if (manualPinRequired) {
                    setLocationError('Manual pin is required because Google could not locate the address. Please drop a pin on the map.');
                  }
                  return;
                }

                setMatchedAddress(details?.formattedAddress || '');
                let nextAddress = addressLookup;
                setFormData((prev) => {
                  const next = {
                    ...prev,
                    gps_lat: lat,
                    gps_long: lng,
                    street_address: details?.streetAddress || details?.displayName || prev.street_address,
                    barangay_name: masterListLocked ? prev.barangay_name : details?.barangayName || prev.barangay_name,
                    municipality: masterListLocked ? prev.municipality : details?.municipality || prev.municipality,
                    purok_sitio: details?.purokSitio || prev.purok_sitio,
                    location_source: 'manual_pin' as const,
                    location_confidence: 'high' as const,
                    location_verified: false,
                    location_verified_at: undefined,
                    location_verified_by: undefined,
                  };
                  nextAddress = buildHouseholdGeocodingAddress(next);
                  return next;
                });
                setLastPinnedAddress(nextAddress);
                setManualPinRequired(false);
                setManualPinConfirmed(false);
                setPinSource('manual_pin');
                setLocationSuccess(
                  details
                    ? 'Manual pin saved. The form updated the address fields from the pinned location where Google provided details.'
                    : 'Manual pin saved. You can now submit this household.',
                );
              }}
            />
            {requiresManualVerification && formData.gps_lat !== undefined && formData.gps_long !== undefined && (
              <label className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <input
                  type="checkbox"
                  checked={manualPinConfirmed}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setManualPinConfirmed(checked);
                    setFormData((prev) => ({
                      ...prev,
                      location_verified: checked,
                      location_verified_at: checked ? new Date() : undefined,
                      location_verified_by: checked ? currentUser?.id : undefined,
                    }));
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  disabled={isLoading}
                />
                <span>
                  I confirm this manual pin is the real household location.
                  This sets the record as manually verified for responder use.
                </span>
              </label>
            )}
            {locationError && (
              <p className="mt-2 text-xs text-destructive">{locationError}</p>
            )}
            {locationSuccess && !locationError && (
              <p className="mt-2 text-xs text-emerald-700">{locationSuccess}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Household Members ── */}
      <div>
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Household Members
            {members.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-primary text-primary-foreground font-bold">
                {members.length}
              </span>
            )}
          </h2>
          {!showMemberForm && (
            <button
              type="button"
              onClick={() => { setShowMemberForm(true); setMemberError(''); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              disabled={isLoading}
            >
              <Plus className="w-4 h-4" />
              Add Member
            </button>
          )}
        </div>

        {members.length > 0 && (
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {relationshipCards.map((card) => (
                <div key={card.key} className="rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{card.count}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
              <p className="text-xs text-muted-foreground">
                These cards now count the member relationship to the household head. Vulnerability details like
                Minor, Senior, Pregnant, and PWD still stay on each member badge below.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                  Minor 0-17: {memberSummary.child}
                </span>
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                  Senior 60+: {memberSummary.senior}
                </span>
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                  Pregnant: {memberSummary.pregnant}
                </span>
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                  PWD: {memberSummary.pwd}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Member Entry Form */}
        {showMemberForm && (
          <div className="mb-4 p-4 bg-accent/5 border border-accent/20 rounded-lg space-y-3">
            <p className="text-sm font-medium text-foreground">New Member</p>

            {memberError && (
              <p className="text-xs text-destructive">{memberError}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Maria Dela Cruz"
                  value={memberDraft.full_name}
                  onChange={(e) => setMemberDraft({ ...memberDraft, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Birthdate *</label>
                <input
                  type="date"
                  value={memberDraft.birthdate}
                  onChange={(e) => setMemberDraft({ ...memberDraft, birthdate: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {memberDraftAge !== null && (
                    <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                      Age {memberDraftAge}
                    </span>
                  )}
                  {memberDraftAgeCategory === 'child' && (
                    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                      Auto-detected Child
                    </span>
                  )}
                  {memberDraftAgeCategory === 'senior' && (
                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-900">
                      Auto-detected Senior
                    </span>
                  )}
                  {memberDraftAgeCategory === 'adult' && (
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      Adult
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Gender</label>
                <select
                  value={memberDraft.gender}
                  onChange={(e) => setMemberDraft({ ...memberDraft, gender: e.target.value as 'M' | 'F' })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Relationship to Head *</label>
                <input
                  type="text"
                  list="member-relationship-options"
                  placeholder="e.g., Spouse, Child, Parent"
                  value={memberDraft.relationship_to_head}
                  onChange={(e) => setMemberDraft({ ...memberDraft, relationship_to_head: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <datalist id="member-relationship-options">
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Civil Status</label>
                <select
                  value={memberDraft.civil_status}
                  onChange={(e) => setMemberDraft({ ...memberDraft, civil_status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="widowed">Widowed</option>
                  <option value="separated">Separated</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Occupation</label>
                <input
                  type="text"
                  placeholder="e.g., Farmer, Student"
                  value={memberDraft.occupation}
                  onChange={(e) => setMemberDraft({ ...memberDraft, occupation: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Income Level</label>
                <select
                  value={memberDraft.income_level}
                  onChange={(e) => setMemberDraft({ ...memberDraft, income_level: e.target.value as any })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="low">Low</option>
                  <option value="middle">Middle</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="md:col-span-2 rounded-lg border border-border bg-background/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Vulnerability Tracking</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Child and Senior are counted automatically from the birthdate. Record Pregnant and PWD here so the household appears correctly in reports and response lists.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {getMemberVulnerabilityLabels(memberDraft).length > 0 ? (
                      getMemberVulnerabilityLabels(memberDraft).map((label) => (
                        <span
                          key={label}
                          className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        No vulnerability tag yet
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-3">
                    <input
                      type="checkbox"
                      checked={memberDraft.is_pregnant}
                      onChange={(e) => setMemberDraft((prev) => ({ ...prev, is_pregnant: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">Pregnant member</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Include this member in maternal health and responder priority reports.
                      </span>
                    </span>
                  </label>

                  <div className="rounded-md border border-border bg-card px-3 py-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={memberDraft.is_pwd}
                        onChange={(e) =>
                          setMemberDraft((prev) => ({
                            ...prev,
                            is_pwd: e.target.checked,
                            pwd_type: e.target.checked ? prev.pwd_type : '',
                          }))}
                        className="mt-0.5 h-4 w-4 rounded border-input"
                      />
                      <span>
                        <span className="block text-sm font-medium text-foreground">PWD member</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Mark persons with disability so they are counted in household vulnerability data.
                        </span>
                      </span>
                    </label>

                    {memberDraft.is_pwd && (
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">PWD Type *</label>
                        <select
                          value={memberDraft.pwd_type || ''}
                          onChange={(e) => setMemberDraft((prev) => ({ ...prev, pwd_type: e.target.value as PWDType | '' }))}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleAddMember}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:opacity-90 transition-opacity"
              >
                Add to List
              </button>
              <button
                type="button"
                onClick={() => { setShowMemberForm(false); setMemberDraft({ ...EMPTY_MEMBER }); setMemberError(''); }}
                className="px-4 py-2 border border-border text-foreground text-sm rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Members Preview List */}
        {members.length > 0 ? (
          <div className="space-y-2">
            {members.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 bg-card border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelationshipLabel(m.relationship_to_head)}
                      {m.birthdate && ` · Age ${calculateAge(m.birthdate)}`}
                      {' · '}
                      {m.gender === 'M' ? 'Male' : 'Female'}
                    </p>
                    {getMemberVulnerabilityLabels(m).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {getMemberVulnerabilityLabels(m).map((label) => (
                          <span
                            key={label}
                            className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMember(i)}
                  className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors group"
                  title="Remove member"
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground group-hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          !showMemberForm && (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <User className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">No members added yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Add Member" to add household members</p>
            </div>
          )
        )}
      </div>

      {/* ── Submit ── */}
      <div className="flex gap-4 pt-2">
        <button
          type="submit"
          disabled={
            isLoading
            || (manualPinRequired && (formData.gps_lat === undefined || formData.gps_long === undefined))
            || (requiresManualVerification && !manualPinConfirmed)
          }
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
        >
          {isLoading
            ? 'Saving...'
            : manualPinRequired && (formData.gps_lat === undefined || formData.gps_long === undefined)
              ? 'Drop Manual Pin To Continue'
              : requiresManualVerification && !manualPinConfirmed
                ? 'Confirm Manual Pin To Continue'
              : `Save Household${members.length > 0 ? ` & ${members.length} Member${members.length > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>
    </form>
  );
}

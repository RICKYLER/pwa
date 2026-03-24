'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GoogleMap, InfoWindow, Marker } from '@react-google-maps/api';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleX,
  Clock3,
  FileText,
  Home,
  Loader2,
  Mail,
  MapPinned,
  Phone,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { getCurrentUser } from '@/lib/auth';
import { getHouseholds, updateHousehold } from '@/lib/db/households';
import { getLocationMasterList, saveLocationMasterList } from '@/lib/db/location-master';
import type {
  Household,
  HouseholdRegistrationStatus,
  LocationConfidence,
  PinQaStatus,
} from '@/lib/db/schema';
import {
  derivePinQaStatus,
  formatPinQaStatusLabel,
  formatRegistrationStatusLabel,
  getDuplicatePinMatches,
  getHouseholdRegistrationStatus,
  getStoredOrDerivedPinQaStatus,
  HOUSEHOLD_REGISTRATION_STATUSES,
  isHouseholdApproved,
  PIN_QA_STATUSES,
} from '@/lib/household-registration';
import { mergePurokOptions, normalizePurokSitio } from '@/lib/geocoding';
import {
  DEFAULT_BARANGAY_CENTER,
  focusMapOnPinnedHouseholds,
  hasHouseholdPin,
} from '@/lib/map-pins';

const CONFIDENCE_OPTIONS: LocationConfidence[] = ['high', 'medium', 'low'];
const REVIEW_TABS: HouseholdRegistrationStatus[] = HOUSEHOLD_REGISTRATION_STATUSES;

interface ToastState {
  type: 'success' | 'error';
  msg: string;
}

interface ReviewDraftState {
  landmark_directions: string;
  location_confidence: LocationConfidence;
  location_verified: boolean;
  registration_review_notes: string;
  pin_qa_status: PinQaStatus;
  pin_qa_notes: string;
}

function getConfidenceColor(confidence?: LocationConfidence, verified?: boolean): string {
  if (verified) return '#10b981';
  if (confidence === 'high') return '#2563eb';
  if (confidence === 'medium') return '#f59e0b';
  return '#ef4444';
}

function getStatusTone(status: HouseholdRegistrationStatus): string {
  switch (status) {
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'rejected':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'needs_correction':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
}

function getPinQaTone(status: PinQaStatus): string {
  switch (status) {
    case 'valid':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'duplicate':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200';
  }
}

function getReviewMarkerIcon(
  household: Household,
  selected: boolean,
  pinQaStatus: PinQaStatus,
): google.maps.Symbol {
  const fillColor = pinQaStatus === 'valid'
    ? '#10b981'
    : pinQaStatus === 'duplicate'
      ? '#ef4444'
      : getConfidenceColor(household.location_confidence, household.location_verified);

  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: selected ? 11 : 9,
    fillColor,
    fillOpacity: 1,
    strokeWeight: selected ? 3 : 2.5,
    strokeColor: '#ffffff',
  };
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

function buildInitialReviewDraft(
  household: Household,
  households: Household[],
): ReviewDraftState {
  return {
    landmark_directions: household.landmark_directions || '',
    location_confidence: household.location_confidence || 'medium',
    location_verified: Boolean(household.location_verified),
    registration_review_notes: household.registration_review_notes || '',
    pin_qa_status: getStoredOrDerivedPinQaStatus(household, households),
    pin_qa_notes: household.pin_qa_notes || '',
  };
}

export default function AdminLocationReviewPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const { isLoaded } = useGoogleMaps();

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingMaster, setIsSavingMaster] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<HouseholdRegistrationStatus>('pending');
  const [pinQaFilter, setPinQaFilter] = useState<PinQaStatus | 'all'>('all');
  const [newPurok, setNewPurok] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [masterForm, setMasterForm] = useState({
    municipality: '',
    barangay_name: '',
    puroks: [] as string[],
  });
  const [reviewDraft, setReviewDraft] = useState<ReviewDraftState>({
    landmark_directions: '',
    location_confidence: 'medium',
    location_verified: false,
    registration_review_notes: '',
    pin_qa_status: 'needs_verification',
    pin_qa_notes: '',
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!map) return;

    const selectedHousehold = households.find((household) => household.id === selectedId) || null;
    if (selectedHousehold && hasHouseholdPin(selectedHousehold)) {
      map.panTo({ lat: selectedHousehold.gps_lat, lng: selectedHousehold.gps_long });
      map.setZoom(18);
      return;
    }

    focusMapOnPinnedHouseholds(map, households, DEFAULT_BARANGAY_CENTER);
  }, [households, map, selectedId]);

  const filteredHouseholds = useMemo(() => {
    return households
      .filter((household) => getHouseholdRegistrationStatus(household) === activeTab)
      .filter((household) => {
        const pinQaStatus = getStoredOrDerivedPinQaStatus(household, households);
        if (pinQaFilter !== 'all' && pinQaStatus !== pinQaFilter) {
          return false;
        }

        if (!search.trim()) {
          return true;
        }

        const query = search.toLowerCase();
        return [
          household.head_name,
          household.applicant_email,
          household.contact_number,
          household.street_address,
          household.purok_sitio,
          household.barangay_name,
          household.municipality,
          household.landmark_directions,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const leftSubmitted = new Date(left.registration_submitted_at || left.createdAt).getTime();
        const rightSubmitted = new Date(right.registration_submitted_at || right.createdAt).getTime();
        return rightSubmitted - leftSubmitted;
      });
  }, [activeTab, households, pinQaFilter, search]);

  useEffect(() => {
    if (filteredHouseholds.some((household) => household.id === selectedId)) {
      return;
    }

    setSelectedId(filteredHouseholds[0]?.id || null);
  }, [filteredHouseholds, selectedId]);

  const selectedHousehold = households.find((household) => household.id === selectedId) || null;

  useEffect(() => {
    if (!selectedHousehold) return;
    setReviewDraft(buildInitialReviewDraft(selectedHousehold, households));
  }, [households, selectedHousehold]);

  const selectedDuplicateMatches = useMemo(() => {
    if (!selectedHousehold) return [];

    const matchIds = getDuplicatePinMatches(selectedHousehold, households);
    return matchIds
      .map((id) => households.find((household) => household.id === id))
      .filter(Boolean) as Household[];
  }, [households, selectedHousehold]);

  const canApprove = Boolean(
    selectedHousehold
    && hasHouseholdPin(selectedHousehold)
    && reviewDraft.location_verified
    && reviewDraft.pin_qa_status === 'valid',
  );

  const approvedMasterList = useMemo(() => {
    return households
      .filter((household) => isHouseholdApproved(household))
      .sort((left, right) => {
        const leftReviewed = new Date(left.registration_reviewed_at || left.updatedAt).getTime();
        const rightReviewed = new Date(right.registration_reviewed_at || right.updatedAt).getTime();
        return rightReviewed - leftReviewed;
      });
  }, [households]);

  const showToast = useCallback((type: ToastState['type'], msg: string) => {
    setToast({ type, msg });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (background = false) => {
    if (!user) return;

    if (!background) {
      setIsLoading(true);
    }

    try {
      const [records, masterList] = await Promise.all([
        getHouseholds({ barangay_id: user.barangay_id }),
        getLocationMasterList(user.barangay_id),
      ]);

      setHouseholds(records);
      setSelectedId((current) => current || records.find((household) => getHouseholdRegistrationStatus(household) === 'pending')?.id || records[0]?.id || null);
      setMasterForm({
        municipality: masterList?.municipality || records[0]?.municipality || '',
        barangay_name: masterList?.barangay_name || records[0]?.barangay_name || '',
        puroks: mergePurokOptions([
          ...(masterList?.puroks ?? []),
          ...records.map((household) => household.purok_sitio),
        ]),
      });
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to load registration review data.');
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, [showToast, user]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    void load();
  }, [load, router, user]);

  async function handleSaveMasterList() {
    if (!user) return;
    setIsSavingMaster(true);
    try {
      const saved = await saveLocationMasterList({
        barangay_id: user.barangay_id,
        municipality: masterForm.municipality,
        barangay_name: masterForm.barangay_name,
        puroks: masterForm.puroks,
      });
      setMasterForm({
        municipality: saved.municipality,
        barangay_name: saved.barangay_name,
        puroks: saved.puroks,
      });
      showToast('success', 'Master list updated.');
    } catch (error) {
      console.error(error);
      showToast('error', 'Could not save the master list.');
    } finally {
      setIsSavingMaster(false);
    }
  }

  function handleAddPurok() {
    const normalized = normalizePurokSitio(newPurok);
    if (!normalized) return;

    setMasterForm((current) => ({
      ...current,
      puroks: mergePurokOptions([...current.puroks, normalized]),
    }));
    setNewPurok('');
  }

  async function persistReview(nextStatus?: HouseholdRegistrationStatus) {
    if (!user || !selectedHousehold) return;

    setIsSavingReview(true);
    try {
      const updated = await updateHousehold(selectedHousehold.id, {
        landmark_directions: reviewDraft.landmark_directions.trim(),
        location_confidence: reviewDraft.location_confidence,
        location_verified: reviewDraft.location_verified,
        location_verified_at: reviewDraft.location_verified ? new Date() : undefined,
        location_verified_by: reviewDraft.location_verified ? user.id : undefined,
        registration_status: nextStatus ?? getHouseholdRegistrationStatus(selectedHousehold),
        registration_reviewed_at: nextStatus ? new Date() : selectedHousehold.registration_reviewed_at,
        registration_reviewed_by: nextStatus ? user.id : selectedHousehold.registration_reviewed_by,
        registration_review_notes: reviewDraft.registration_review_notes.trim(),
        pin_qa_status: reviewDraft.pin_qa_status,
        pin_qa_notes: reviewDraft.pin_qa_notes.trim(),
      });

      setHouseholds((current) => current.map((household) => (
        household.id === updated.id ? updated : household
      )));

      if (nextStatus) {
        showToast('success', `${formatRegistrationStatusLabel(nextStatus)} saved.`);
      } else {
        showToast('success', 'Review notes saved.');
      }
    } catch (error) {
      console.error(error);
      showToast('error', 'Could not save this review.');
    } finally {
      setIsSavingReview(false);
    }
  }

  async function handleApprove() {
    if (!selectedHousehold) return;

    if (!hasHouseholdPin(selectedHousehold)) {
      showToast('error', 'A map pin is required before approval.');
      return;
    }

    if (!reviewDraft.location_verified) {
      showToast('error', 'Mark the location as verified before approval.');
      return;
    }

    if (reviewDraft.pin_qa_status !== 'valid') {
      showToast('error', 'Set Map Pin QA to Valid before approval.');
      return;
    }

    await persistReview('approved');
  }

  useEffect(() => {
    function handleDataChanged(event: Event) {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (!detail || !['households', 'location_master_lists'].includes(detail.table || '')) {
        return;
      }

      void load(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);

    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [load]);

  const stats = {
    pending: households.filter((household) => getHouseholdRegistrationStatus(household) === 'pending').length,
    approved: households.filter((household) => getHouseholdRegistrationStatus(household) === 'approved').length,
    rejected: households.filter((household) => getHouseholdRegistrationStatus(household) === 'rejected').length,
    needsCorrection: households.filter((household) => getHouseholdRegistrationStatus(household) === 'needs_correction').length,
  };

  return (
    <AppShell title="Location Review">
      <div className="mx-auto max-w-[1520px] space-y-6 p-4 sm:p-6 lg:p-8">
        {toast && (
          <div className={`fixed right-5 top-5 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-2xl ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            <span>{toast.msg}</span>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Registration Approval and Map QA</h1>
            <p className="mt-1 text-sm text-slate-500">
              Review pending registrations, verify map pins, and maintain the approved master list.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Pending', value: stats.pending },
              { label: 'Approved', value: stats.approved },
              { label: 'Rejected', value: stats.rejected },
              { label: 'Needs Correction', value: stats.needsCorrection },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{isLoading ? '—' : item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Master List Setup</h2>
              <p className="mt-1 text-sm text-slate-500">
                Set the official municipality, barangay, and purok names used during registration.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSaveMasterList()}
              disabled={isSavingMaster}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {isSavingMaster ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Master List
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1.5fr]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Municipality / City</label>
              <input
                type="text"
                value={masterForm.municipality}
                onChange={(event) => setMasterForm((current) => ({ ...current, municipality: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="e.g., Mabini"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Barangay</label>
              <input
                type="text"
                value={masterForm.barangay_name}
                onChange={(event) => setMasterForm((current) => ({ ...current, barangay_name: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="e.g., Barangay 1"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Purok / Sitio</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPurok}
                  onChange={(event) => setNewPurok(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddPurok();
                    }
                  }}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="Add Purok or Sitio"
                />
                <button
                  type="button"
                  onClick={handleAddPurok}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {masterForm.puroks.map((purok) => (
                  <span
                    key={purok}
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                  >
                    {purok}
                    <button
                      type="button"
                      onClick={() => setMasterForm((current) => ({
                        ...current,
                        puroks: current.puroks.filter((value) => value !== purok),
                      }))}
                      className="text-indigo-500 hover:text-indigo-700"
                      aria-label={`Remove ${purok}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {REVIEW_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {formatRegistrationStatusLabel(tab)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full bg-transparent py-2.5 text-sm text-slate-900 outline-none"
                  placeholder="Search applicant, address, or contact"
                />
              </div>
              <div className="mt-3">
                <select
                  value={pinQaFilter}
                  onChange={(event) => setPinQaFilter(event.target.value as PinQaStatus | 'all')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="all">All Map Pin QA</option>
                  {PIN_QA_STATUSES.map((status) => (
                    <option key={status} value={status}>{formatPinQaStatusLabel(status)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-4">
                <h2 className="text-base font-semibold text-slate-900">{formatRegistrationStatusLabel(activeTab)} Queue</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {filteredHouseholds.length} registration{filteredHouseholds.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="max-h-[820px] space-y-2 overflow-y-auto p-3">
                {filteredHouseholds.map((household) => {
                  const active = household.id === selectedId;
                  const pinQaStatus = getStoredOrDerivedPinQaStatus(household, households);
                  return (
                    <button
                      key={household.id}
                      type="button"
                      onClick={() => setSelectedId(household.id)}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition-all ${
                        active
                          ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{household.head_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {household.street_address || 'No street address'} · {household.purok_sitio || 'No purok'}
                          </p>
                        </div>
                        <span
                          className="inline-flex h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: getConfidenceColor(household.location_confidence, household.location_verified) }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        <span className={`rounded-full border px-2 py-1 font-medium ${getStatusTone(getHouseholdRegistrationStatus(household))}`}>
                          {formatRegistrationStatusLabel(getHouseholdRegistrationStatus(household))}
                        </span>
                        <span className={`rounded-full border px-2 py-1 font-medium ${getPinQaTone(pinQaStatus)}`}>
                          {formatPinQaStatusLabel(pinQaStatus)}
                        </span>
                        {household.supporting_document_name && (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 font-medium text-slate-600">
                            Document
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {!isLoading && filteredHouseholds.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    No registrations match the current filters.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">Admin Review Map</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Green pins are ready, amber pins need verification, and red pins are flagged as duplicates.
                </p>
              </div>
              <div className="h-[440px]">
                {!isLoaded ? (
                  <div className="flex h-full items-center justify-center bg-slate-100">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={DEFAULT_BARANGAY_CENTER}
                    zoom={14}
                    onLoad={(loadedMap) => setMap(loadedMap)}
                    onUnmount={() => setMap(null)}
                    options={{
                      disableDefaultUI: false,
                      zoomControl: true,
                      mapTypeControl: false,
                      streetViewControl: false,
                      fullscreenControl: true,
                      gestureHandling: 'greedy',
                      styles: [
                        { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
                        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
                        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
                        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                      ],
                    }}
                  >
                    {filteredHouseholds.filter(hasHouseholdPin).map((household) => (
                      <Marker
                        key={household.id}
                        position={{ lat: household.gps_lat, lng: household.gps_long }}
                        icon={getReviewMarkerIcon(
                          household,
                          selectedId === household.id,
                          getStoredOrDerivedPinQaStatus(household, households),
                        )}
                        onClick={() => setSelectedId(household.id)}
                        title={household.head_name}
                      />
                    ))}

                    {selectedHousehold && hasHouseholdPin(selectedHousehold) && (
                      <InfoWindow
                        position={{ lat: selectedHousehold.gps_lat, lng: selectedHousehold.gps_long }}
                        onCloseClick={() => setSelectedId(null)}
                      >
                        <div className="min-w-[220px] text-sm text-slate-800">
                          <p className="font-bold">{selectedHousehold.head_name}</p>
                          <p className="mt-1 text-xs text-slate-500">{selectedHousehold.street_address}</p>
                          <p className="text-xs text-slate-500">{selectedHousehold.purok_sitio}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatRegistrationStatusLabel(getHouseholdRegistrationStatus(selectedHousehold))}
                          </p>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              {selectedHousehold ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <MapPinned className="h-4 w-4 text-indigo-600" />
                        <h2 className="text-base font-semibold text-slate-900">{selectedHousehold.head_name}</h2>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedHousehold.street_address || 'No street address'} · {selectedHousehold.purok_sitio}
                      </p>
                    </div>
                    <Link
                      href={`/households/${selectedHousehold.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open record
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Submitted</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(selectedHousehold.registration_submitted_at || selectedHousehold.createdAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Applicant Email</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{selectedHousehold.applicant_email || 'Not provided'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Contact Number</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{selectedHousehold.contact_number || 'Not provided'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatRegistrationStatusLabel(getHouseholdRegistrationStatus(selectedHousehold))}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-indigo-600" />
                          <h3 className="text-sm font-semibold text-slate-900">Supporting Document</h3>
                        </div>
                        {selectedHousehold.supporting_document_data ? (
                          selectedHousehold.supporting_document_type?.startsWith('image/') ? (
                            <div className="mt-4 space-y-3">
                              <img
                                src={selectedHousehold.supporting_document_data}
                                alt={selectedHousehold.supporting_document_name || 'Supporting document'}
                                className="max-h-64 w-full rounded-2xl border border-slate-200 object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => window.open(selectedHousehold.supporting_document_data, '_blank')}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                              >
                                Open document
                                <ArrowUpRight className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                              <p className="text-sm font-semibold text-slate-900">{selectedHousehold.supporting_document_name || 'Attached file'}</p>
                              <button
                                type="button"
                                onClick={() => window.open(selectedHousehold.supporting_document_data, '_blank')}
                                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Open document
                                <ArrowUpRight className="h-4 w-4" />
                              </button>
                            </div>
                          )
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                            No supporting document uploaded.
                          </div>
                        )}
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2">
                          <Home className="h-4 w-4 text-indigo-600" />
                          <h3 className="text-sm font-semibold text-slate-900">Applicant Summary</h3>
                        </div>
                        <div className="mt-4 space-y-3 text-sm text-slate-700">
                          <p>{selectedHousehold.street_address}</p>
                          <p>{selectedHousehold.purok_sitio}, {selectedHousehold.barangay_name}</p>
                          <p>{selectedHousehold.municipality}</p>
                          {selectedHousehold.contact_number && (
                            <p className="inline-flex items-center gap-2">
                              <Phone className="h-4 w-4 text-slate-400" />
                              {selectedHousehold.contact_number}
                            </p>
                          )}
                          {selectedHousehold.applicant_email && (
                            <p className="inline-flex items-center gap-2">
                              <Mail className="h-4 w-4 text-slate-400" />
                              {selectedHousehold.applicant_email}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Landmark / Directions</label>
                        <textarea
                          rows={4}
                          value={reviewDraft.landmark_directions}
                          onChange={(event) => setReviewDraft((current) => ({
                            ...current,
                            landmark_directions: event.target.value,
                          }))}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          placeholder="Add responder-friendly guidance for this household."
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Location Confidence</label>
                          <select
                            value={reviewDraft.location_confidence}
                            onChange={(event) => setReviewDraft((current) => ({
                              ...current,
                              location_confidence: event.target.value as LocationConfidence,
                            }))}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          >
                            {CONFIDENCE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option.toUpperCase()}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">Map Pin QA</label>
                          <select
                            value={reviewDraft.pin_qa_status}
                            onChange={(event) => setReviewDraft((current) => ({
                              ...current,
                              pin_qa_status: event.target.value as PinQaStatus,
                            }))}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          >
                            {PIN_QA_STATUSES.map((status) => (
                              <option key={status} value={status}>{formatPinQaStatusLabel(status)}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={reviewDraft.location_verified}
                          onChange={(event) => setReviewDraft((current) => ({
                            ...current,
                            location_verified: event.target.checked,
                            pin_qa_status: event.target.checked
                              ? derivePinQaStatus(selectedHousehold, households)
                              : 'needs_verification',
                          }))}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Mark this location as verified
                      </label>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Map Pin QA Notes</label>
                        <textarea
                          rows={3}
                          value={reviewDraft.pin_qa_notes}
                          onChange={(event) => setReviewDraft((current) => ({
                            ...current,
                            pin_qa_notes: event.target.value,
                          }))}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          placeholder="Document duplicate findings, warnings, or manual verification notes."
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Admin Review Notes</label>
                        <textarea
                          rows={4}
                          value={reviewDraft.registration_review_notes}
                          onChange={(event) => setReviewDraft((current) => ({
                            ...current,
                            registration_review_notes: event.target.value,
                          }))}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          placeholder="Add approval notes, rejection reason, or requested correction details."
                        />
                      </div>
                    </div>
                  </div>

                  {selectedDuplicateMatches.length > 0 && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      Duplicate map pin warning. Nearby records:
                      {' '}
                      {selectedDuplicateMatches.map((household) => household.head_name).join(', ')}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void persistReview()}
                      disabled={isSavingReview}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {isSavingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Review
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApprove()}
                      disabled={isSavingReview || !canApprove}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void persistReview('needs_correction')}
                      disabled={isSavingReview}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Request Update
                    </button>
                    <button
                      type="button"
                      onClick={() => void persistReview('rejected')}
                      disabled={isSavingReview}
                      className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      <CircleX className="h-4 w-4" />
                      Reject
                    </button>
                    {selectedHousehold.gps_lat !== undefined && selectedHousehold.gps_long !== undefined && (
                      <button
                        type="button"
                        onClick={() => window.open(`https://maps.google.com/?q=${selectedHousehold.gps_lat},${selectedHousehold.gps_long}`, '_blank')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Target className="h-4 w-4" />
                        Open in Google Maps
                      </button>
                    )}
                  </div>

                  {!canApprove && (
                    <p className="text-xs text-slate-500">
                      Approval requires a saved map pin, a verified location, and Map Pin QA marked as Valid.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
                  <Home className="mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-700">Select a registration to review</p>
                  <p className="mt-1 text-sm text-slate-500">Pick a record from the queue or click a pin on the map.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Approved Master List</h2>
              <p className="mt-1 text-sm text-slate-500">
                Only approved registrations appear here for downstream reports and operations.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Clock3 className="h-3.5 w-3.5" />
              {approvedMasterList.length} approved record{approvedMasterList.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Map Pin</th>
                  <th className="px-3 py-3">Address</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Approval Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {approvedMasterList.map((household) => {
                  const pinQaStatus = getStoredOrDerivedPinQaStatus(household, households);
                  return (
                    <tr key={household.id}>
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">{household.id}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{household.head_name}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getPinQaTone(pinQaStatus)}`}>
                          {formatPinQaStatusLabel(pinQaStatus)}
                        </span>
                      </td>
                      <td className="px-3 py-3">{household.street_address}, {household.purok_sitio}</td>
                      <td className="px-3 py-3">
                        {hasHouseholdPin(household)
                          ? `${household.gps_lat.toFixed(5)}, ${household.gps_long.toFixed(5)}`
                          : 'No map pin'}
                      </td>
                      <td className="px-3 py-3">{formatRegistrationStatusLabel(getHouseholdRegistrationStatus(household))}</td>
                      <td className="px-3 py-3">{formatDate(household.registration_reviewed_at)}</td>
                    </tr>
                  );
                })}
                {approvedMasterList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">
                      No approved registrations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

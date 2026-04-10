'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  FileText,
  Loader2,
  MapPin,
  Package,
  Save,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { getAnalyticsBarangayScope, getAnalyticsScopeLabel } from '@/lib/analytics-scope';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import MapLocationPicker from '@/components/MapLocationPicker';
import MapView from '@/components/MapView';
import {
  coerceDistributionTargetScope,
  isResidentOnlyTargetGroup,
} from '@/lib/distribution-audience';
import {
  getDistributionAudienceStats,
  getDistributionEvent,
  getDistributionRecords,
  getEligibleHouseholdsForEvent,
  getEligibleResidentsForEvent,
  releaseDistributionPackage,
  updateDistributionEvent,
} from '@/lib/db/distribution';
import { getHouseholds } from '@/lib/db/households';
import { getInventoryItems } from '@/lib/db/inventory';
import type {
  DistributedItem,
  DistributionEvent,
  DistributionRecord,
  DistributionTargetGroup,
  DistributionTargetScope,
  Household,
  InventoryItem,
  Resident,
} from '@/lib/db/schema';

const STATUS_CFG = {
  planned: {
    label: 'Planned',
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  ongoing: {
    label: 'Ongoing',
    dot: 'bg-blue-400 animate-pulse',
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  },
  completed: {
    label: 'Completed',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
};

const TYPE_LABELS: Record<string, string> = {
  regular: 'Regular Distribution',
  emergency: 'Emergency Relief',
  disaster_relief: 'Disaster Relief',
};

const SCOPE_LABELS: Record<DistributionTargetScope, string> = {
  household: 'Household-based release',
  resident: 'Resident-based release',
};

const TARGET_GROUP_LABELS: Record<DistributionTargetGroup, string> = {
  all: 'All',
  senior: 'Senior',
  pwd: 'PWD',
  pregnant: 'Pregnant',
  minor: 'Minor',
  low_income: 'Low Income',
};

const TARGET_SCOPE_OPTIONS: Array<{
  value: DistributionTargetScope;
  label: string;
  description: string;
}> = [
  {
    value: 'household',
    label: 'Household release',
    description: 'Release one package to each qualifying household.',
  },
  {
    value: 'resident',
    label: 'Resident release',
    description: 'Release one package per matched resident.',
  },
];

const TARGET_GROUP_OPTIONS: Array<{
  value: DistributionTargetGroup;
  label: string;
  description: string;
}> = [
  { value: 'all', label: 'All', description: 'No vulnerability filter.' },
  { value: 'senior', label: 'Senior', description: 'Residents aged 60 and above.' },
  { value: 'pwd', label: 'PWD', description: 'Residents marked as persons with disability.' },
  { value: 'pregnant', label: 'Pregnant', description: 'Residents marked as pregnant.' },
  { value: 'minor', label: 'Minor', description: 'Residents aged 0 to 17.' },
  { value: 'low_income', label: 'Low Income', description: 'Income-priority residents or households.' },
];

function sumDistributedUnits(items: DistributedItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export default function DistributionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const user = getCurrentUser();

  const [event, setEvent] = useState<DistributionEvent | null>(null);
  const [records, setRecords] = useState<DistributionRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [eligibleHouseholds, setEligibleHouseholds] = useState<Household[]>([]);
  const [eligibleResidents, setEligibleResidents] = useState<Resident[]>([]);
  const [matchedResidentsForHouseholds, setMatchedResidentsForHouseholds] = useState<Resident[]>([]);
  const [audienceStats, setAudienceStats] = useState<{
    totalHouseholds: number;
    totalResidents: number;
    eligibleHouseholds: number;
    eligibleResidents: number;
  } | null>(null);
  const [allHouseholds, setAllHouseholds] = useState<Household[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState('');
  const [releaseSuccess, setReleaseSuccess] = useState('');
  const [releaseSearch, setReleaseSearch] = useState('');
  const [selectedHouseholdId, setSelectedHouseholdId] = useState('');
  const [selectedResidentId, setSelectedResidentId] = useState('');
  const [receivedByName, setReceivedByName] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isQuickUpdating, setIsQuickUpdating] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const [editStatus, setEditStatus] = useState<DistributionEvent['status']>('planned');
  const [editTargetScope, setEditTargetScope] = useState<DistributionTargetScope>('household');
  const [editTargetGroup, setEditTargetGroup] = useState<DistributionTargetGroup>('all');
  const [editNotes, setEditNotes] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCoords, setEditCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCoords, setMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const geocodedRef = useRef(false);
  const latestLoadRequestIdRef = useRef(0);
  const [mapsReady, setMapsReady] = useState(false);

  const deferredSearch = useDeferredValue(releaseSearch.trim().toLowerCase());
  const audienceBarangayScope = useMemo(
    () => getAnalyticsBarangayScope(user),
    [user],
  );
  const audienceScopeLabel = useMemo(
    () => getAnalyticsScopeLabel(user),
    [user],
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && window.google) {
      setMapsReady(true);
      return;
    }

    const id = setInterval(() => {
      if (typeof window !== 'undefined' && window.google) {
        setMapsReady(true);
        clearInterval(id);
      }
    }, 100);

    return () => clearInterval(id);
  }, []);

  const load = useCallback(async (background = false) => {
    const requestId = ++latestLoadRequestIdRef.current;

    if (!background) {
      setIsLoading(true);
    }

    try {
      let distributionEvent = await getDistributionEvent(params.id);
      if (!distributionEvent) {
        router.push('/distribution');
        return;
      }

      const normalizedTargetScope = coerceDistributionTargetScope(
        distributionEvent.target_scope,
        distributionEvent.target_group,
      );
      if (normalizedTargetScope !== distributionEvent.target_scope) {
        try {
          distributionEvent = await updateDistributionEvent(distributionEvent.id, {
            target_scope: normalizedTargetScope,
          });
        } catch (repairError) {
          console.error('Failed to repair distribution target scope:', repairError);
          distributionEvent = {
            ...distributionEvent,
            target_scope: normalizedTargetScope,
          };
        }
      }

      const audienceBarangayId = user?.role === 'admin'
        ? undefined
        : audienceBarangayScope ?? distributionEvent.barangay_id;

      const [distributionRecords, stockItems, households, nextAudienceStats] = await Promise.all([
        getDistributionRecords(distributionEvent.id),
        getInventoryItems(),
        getHouseholds({ status: 'active', registration_status: 'approved' }),
        getDistributionAudienceStats({
          barangay_id: audienceBarangayId,
          target_group: distributionEvent.target_group,
        }),
      ]);

      const [householdTargets, residentTargets, householdMatchResidents] = await Promise.all([
        distributionEvent.target_scope === 'household'
          ? getEligibleHouseholdsForEvent({
              barangay_id: audienceBarangayId,
              target_group: distributionEvent.target_group,
            })
          : Promise.resolve([]),
        distributionEvent.target_scope === 'resident'
          ? getEligibleResidentsForEvent({
              barangay_id: audienceBarangayId,
              target_group: distributionEvent.target_group,
            })
          : Promise.resolve([]),
        distributionEvent.target_scope === 'household' && distributionEvent.target_group !== 'all'
          ? getEligibleResidentsForEvent({
              barangay_id: audienceBarangayId,
              target_group: distributionEvent.target_group,
            })
          : Promise.resolve([]),
      ]);

      if (requestId !== latestLoadRequestIdRef.current) {
        return;
      }

      setEvent(distributionEvent);
      setRecords(distributionRecords);
      setInventoryItems(stockItems);
      setAllHouseholds(households);
      setAudienceStats(nextAudienceStats);
      setEligibleHouseholds(householdTargets);
      setEligibleResidents(residentTargets);
      setMatchedResidentsForHouseholds(householdMatchResidents);
      setEditStatus(distributionEvent.status);
      setEditTargetScope(distributionEvent.target_scope);
      setEditTargetGroup(distributionEvent.target_group);
      setEditNotes(distributionEvent.notes || '');
      setEditLocation(distributionEvent.location || '');
      setEditCoords(
        typeof distributionEvent.gps_lat === 'number' && typeof distributionEvent.gps_lng === 'number'
          ? { lat: distributionEvent.gps_lat, lng: distributionEvent.gps_lng }
          : null,
      );

      if (
        typeof distributionEvent.gps_lat === 'number' &&
        typeof distributionEvent.gps_lng === 'number'
      ) {
        setMapCoords({ lat: distributionEvent.gps_lat, lng: distributionEvent.gps_lng });
      } else {
        setMapCoords(null);
      }
    } catch (loadError) {
      console.error(loadError);
    } finally {
      if (!background && requestId === latestLoadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [audienceBarangayScope, params.id, router, user]);

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/distribution');
      return;
    }

    void load();
  }, [load, router, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    function handleDataChanged(event: CustomEvent<{ table: string }>) {
      if (!['households', 'residents', 'vulnerability_flags', 'distribution_events', 'distribution_records', 'inventory_items'].includes(event.detail.table)) {
        return;
      }

      void load(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged as EventListener);
    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged as EventListener);
    };
  }, [load, user]);

  useEffect(() => {
    if (!mapsReady || !event || mapCoords || geocodedRef.current) return;
    if (typeof event.gps_lat === 'number' && typeof event.gps_lng === 'number') return;

    geocodedRef.current = true;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: event.location }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location;
        setMapCoords({ lat: loc.lat(), lng: loc.lng() });
      }
    });
  }, [mapsReady, event, mapCoords]);

  const householdsById = useMemo(
    () => new Map(allHouseholds.map((household) => [household.id, household])),
    [allHouseholds],
  );

  const servedHouseholdIds = useMemo(
    () => new Set(records.map((record) => record.household_id).filter(Boolean) as string[]),
    [records],
  );
  const servedResidentIds = useMemo(
    () => new Set(records.map((record) => record.resident_id).filter(Boolean) as string[]),
    [records],
  );

  const packageStock = useMemo(() => {
    if (!event) return [];

    return event.package_items.map((packageItem) => {
      const stock = inventoryItems.find((item) => item.id === packageItem.item_id);
      const available = stock?.quantity_available ?? 0;

      return {
        ...packageItem,
        available,
        remainingPackages:
          packageItem.quantity > 0 ? Math.floor(available / packageItem.quantity) : 0,
        lowStock: available < packageItem.quantity,
      };
    });
  }, [event, inventoryItems]);

  const remainingPackageReleases =
    packageStock.length > 0 ? Math.min(...packageStock.map((item) => item.remainingPackages)) : 0;

  const filteredHouseholds = useMemo(() => {
    if (!deferredSearch) return eligibleHouseholds;

    return eligibleHouseholds.filter((household) => {
      const matchedResidents = matchedResidentsForHouseholds
        .filter((resident) => resident.household_id === household.id)
        .map((resident) => `${resident.full_name} ${resident.relationship_to_head}`);
      const haystack = [
        household.head_name,
        household.purok_sitio,
        household.street_address,
        household.barangay_name,
        household.municipality,
        ...matchedResidents,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(deferredSearch);
    });
  }, [eligibleHouseholds, deferredSearch, matchedResidentsForHouseholds]);

  const filteredResidents = useMemo(() => {
    if (!deferredSearch) return eligibleResidents;

    return eligibleResidents.filter((resident) => {
      const household = householdsById.get(resident.household_id);
      const haystack = [
        resident.full_name,
        resident.relationship_to_head,
        household?.head_name,
        household?.purok_sitio,
        household?.street_address,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(deferredSearch);
    });
  }, [eligibleResidents, householdsById, deferredSearch]);

  const selectedHousehold = useMemo(() => {
    if (!event) return null;
    if (event.target_scope === 'household') {
      return eligibleHouseholds.find((household) => household.id === selectedHouseholdId) ?? null;
    }

    const resident = eligibleResidents.find((value) => value.id === selectedResidentId) ?? null;
    return resident ? householdsById.get(resident.household_id) ?? null : null;
  }, [event, eligibleHouseholds, eligibleResidents, householdsById, selectedHouseholdId, selectedResidentId]);

  const selectedResident = useMemo(() => {
    if (event?.target_scope !== 'resident') return null;
    return eligibleResidents.find((resident) => resident.id === selectedResidentId) ?? null;
  }, [event?.target_scope, eligibleResidents, selectedResidentId]);

  const matchedResidentsByHouseholdId = useMemo(() => {
    const entries = new Map<string, Resident[]>();

    matchedResidentsForHouseholds.forEach((resident) => {
      const current = entries.get(resident.household_id) ?? [];
      current.push(resident);
      entries.set(resident.household_id, current);
    });

    return entries;
  }, [matchedResidentsForHouseholds]);

  useEffect(() => {
    const defaultReceiver =
      event?.target_scope === 'household'
        ? selectedHousehold?.head_name || ''
        : selectedResident?.full_name || '';

    setReceivedByName(defaultReceiver);
    setReleaseNotes('');
    setReleaseError('');
  }, [event?.target_scope, selectedHousehold?.id, selectedResident?.id]);

  async function handleSave() {
    if (!event) return;
    setIsSaving(true);

    try {
      const locationUpdate =
        editLocation.trim() && editLocation !== event.location
          ? {
              location: editLocation.trim(),
              gps_lat: editCoords?.lat,
              gps_lng: editCoords?.lng,
            }
          : {};

      const updated = await updateDistributionEvent(event.id, {
        status: editStatus,
        target_scope: editTargetScope,
        target_group: editTargetGroup,
        notes: editNotes.trim() || undefined,
        ...locationUpdate,
      });

      setEvent(updated);
      setIsEditing(false);
      setEditTargetScope(updated.target_scope);
      setEditTargetGroup(updated.target_group);

      if (updated.gps_lat && updated.gps_lng) {
        setMapCoords({ lat: updated.gps_lat, lng: updated.gps_lng });
      } else if (locationUpdate.location) {
        geocodedRef.current = false;
        setMapCoords(null);
      }

      await load(true);
    } catch (saveError) {
      console.error(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQuickStatus(nextStatus: DistributionEvent['status']) {
    if (!event) return;

    try {
      setIsQuickUpdating(true);
      const updated = await updateDistributionEvent(event.id, { status: nextStatus });
      setEvent(updated);
      setEditStatus(updated.status);
    } finally {
      setIsQuickUpdating(false);
    }
  }

  async function handleRelease() {
    if (!user || !event) return;

    try {
      setIsReleasing(true);
      setReleaseError('');
      setReleaseSuccess('');

      const record = await releaseDistributionPackage({
        event_id: event.id,
        distributor_id: user.id,
        household_id: event.target_scope === 'household' ? selectedHousehold?.id : undefined,
        resident_id: event.target_scope === 'resident' ? selectedResident?.id : undefined,
        received_by_name: receivedByName.trim() || undefined,
        notes: releaseNotes.trim() || undefined,
      });

      let latestEvent = event;
      if (event.status === 'planned') {
        latestEvent = await updateDistributionEvent(event.id, { status: 'ongoing' });
        setEvent(latestEvent);
        setEditStatus(latestEvent.status);
      }

      setRecords((current) => [record, ...current]);
      setInventoryItems(await getInventoryItems());
      setReleaseSearch('');
      setSelectedHouseholdId('');
      setSelectedResidentId('');
      setReleaseNotes('');
      setReleaseSuccess(
        `Package released to ${record.received_by_name || record.beneficiary_name || 'beneficiary'}.`,
      );
    } catch (releaseFailure) {
      setReleaseError(
        releaseFailure instanceof Error ? releaseFailure.message : 'Failed to release package.',
      );
    } finally {
      setIsReleasing(false);
    }
  }

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="flex h-14 items-center border-b border-slate-200/70 bg-white px-4 shadow-sm">
          <Link
            href="/distribution"
            className="-ml-2 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </header>
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          {[...Array(4)].map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-slate-200/60 bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!event) return null;

  const cfg = STATUS_CFG[event.status] || STATUS_CFG.planned;
  const schedDate = new Date(event.scheduled_date);
  const isPast = schedDate < new Date() && event.status !== 'completed';
  const canManage = hasPermission('manage_inventory');
  const totalUnitsReleased = records.reduce(
    (sum, record) => sum + sumDistributedUnits(record.items_distributed),
    0,
  );
  const selectedAlreadyServed =
    event.target_scope === 'household'
      ? Boolean(selectedHousehold && servedHouseholdIds.has(selectedHousehold.id))
      : Boolean(selectedResident && servedResidentIds.has(selectedResident.id));
  const hasLowPackageStock = packageStock.some((item) => item.lowStock);
  const audienceMatchCount =
    event.target_scope === 'household'
      ? event.target_group === 'all'
        ? audienceStats?.eligibleHouseholds ?? eligibleHouseholds.length
        : audienceStats?.eligibleResidents ?? matchedResidentsForHouseholds.length
      : audienceStats?.eligibleResidents ?? eligibleResidents.length;
  const audienceMatchLabel =
    event.target_scope === 'household'
      ? event.target_group === 'all'
        ? 'Eligible Households'
        : `${TARGET_GROUP_LABELS[event.target_group]} Matches`
      : event.target_group === 'all'
        ? 'Eligible Residents'
        : `${TARGET_GROUP_LABELS[event.target_group]} Matches`;
  const audienceMatchSupport =
    event.target_scope === 'household'
      ? event.target_group === 'all'
        ? `${audienceStats?.totalResidents ?? eligibleResidents.length} resident${(audienceStats?.totalResidents ?? eligibleResidents.length) !== 1 ? 's' : ''} covered across ${audienceScopeLabel}`
        : `${audienceStats?.eligibleHouseholds ?? eligibleHouseholds.length} matched household${(audienceStats?.eligibleHouseholds ?? eligibleHouseholds.length) !== 1 ? 's' : ''}`
      : `${audienceStats?.eligibleHouseholds ?? eligibleHouseholds.length} household${(audienceStats?.eligibleHouseholds ?? eligibleHouseholds.length) !== 1 ? 's' : ''} covered across ${audienceScopeLabel}`;
  const targetCountLabel =
    event.target_scope === 'household'
      ? event.target_group === 'all'
        ? `${eligibleHouseholds.length} eligible household${eligibleHouseholds.length !== 1 ? 's' : ''}`
        : `${eligibleHouseholds.length} household${eligibleHouseholds.length !== 1 ? 's' : ''} · ${matchedResidentsForHouseholds.length} ${TARGET_GROUP_LABELS[event.target_group].toLowerCase()} match${matchedResidentsForHouseholds.length !== 1 ? 'es' : ''}`
      : event.target_group === 'all'
        ? `${eligibleResidents.length} eligible resident${eligibleResidents.length !== 1 ? 's' : ''}`
        : `${eligibleResidents.length} ${TARGET_GROUP_LABELS[event.target_group].toLowerCase()} resident${eligibleResidents.length !== 1 ? 's' : ''}`;
  const releaseDisabled =
    !canManage ||
    event.status === 'completed' ||
    event.package_items.length === 0 ||
    hasLowPackageStock ||
    selectedAlreadyServed ||
    (event.target_scope === 'household' ? !selectedHousehold : !selectedResident);

  async function handleExportPdf() {
    if (!event || !user) {
      return;
    }

    setIsExportingPdf(true);

    try {
      const { exportDistributionReportPDF } = await import('@/lib/pdf/exportDistributionReport');
      exportDistributionReportPDF({
        event,
        records,
        packageStock,
        summary: {
          householdsServed: servedHouseholdIds.size,
          residentsServed: servedResidentIds.size,
          totalUnitsReleased,
          fullPackagesLeft: remainingPackageReleases,
          audienceMatchCount,
          audienceMatchLabel,
          audienceMatchSupport,
          scopeLabel: audienceScopeLabel,
          generatedBy: user.name,
        },
      });
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/distribution"
            className="-ml-2 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{event.event_name}</p>
            <p className="text-[11px] text-slate-400">
              {TYPE_LABELS[event.type] || event.type} · {SCOPE_LABELS[event.target_scope]} ·{' '}
              {TARGET_GROUP_LABELS[event.target_group]}
            </p>
          </div>

          {canManage && event.status !== 'completed' && records.length > 0 ? (
            <button
              type="button"
              onClick={() => handleQuickStatus('completed')}
              disabled={isQuickUpdating}
              className="hidden items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60 sm:inline-flex"
            >
              {isQuickUpdating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Mark Completed
            </button>
          ) : null}

          {canManage && !isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : null}

          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditStatus(event.status);
                  setEditTargetScope(event.target_scope);
                  setEditTargetGroup(event.target_group);
                  setEditNotes(event.notes || '');
                  setEditLocation(event.location || '');
                  setEditCoords(
                    typeof event.gps_lat === 'number' && typeof event.gps_lng === 'number'
                      ? { lat: event.gps_lat, lng: event.gps_lng }
                      : null,
                  );
                }}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-1.5 text-xs font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5 pb-10 sm:px-6">
        <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {isEditing ? (
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as DistributionEvent['status'])}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="planned">Planned</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${cfg.badge}`}
                >
                  <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
                <Users className="h-3.5 w-3.5" />
                {SCOPE_LABELS[event.target_scope]}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                {TARGET_GROUP_LABELS[event.target_group]}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 ${
                  isPast ? 'font-semibold text-amber-600' : 'text-slate-400'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                {schedDate.toLocaleDateString('en-PH', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {isPast ? <span className="text-amber-500">· overdue</span> : null}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div className="flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Location
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="Address…"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                ) : (
                  <p className="text-sm font-semibold text-slate-800">{event.location}</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div className="flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Event Type
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {TYPE_LABELS[event.type] || event.type}
                </p>
              </div>
            </div>
          </div>

          {isEditing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Target Scope
                </label>
                <select
                  value={editTargetScope}
                  onChange={(e) => {
                    const nextScope = e.target.value as DistributionTargetScope;
                    if (nextScope === 'household' && isResidentOnlyTargetGroup(editTargetGroup)) {
                      return;
                    }

                    setEditTargetScope(nextScope);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {TARGET_SCOPE_OPTIONS.map((scope) => (
                    <option
                      key={scope.value}
                      value={scope.value}
                      disabled={scope.value === 'household' && isResidentOnlyTargetGroup(editTargetGroup)}
                    >
                      {scope.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  {TARGET_SCOPE_OPTIONS.find((scope) => scope.value === editTargetScope)?.description}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Target Group
                </label>
                <select
                  value={editTargetGroup}
                  onChange={(e) => {
                    const nextGroup = e.target.value as DistributionTargetGroup;
                    setEditTargetGroup(nextGroup);

                    if (isResidentOnlyTargetGroup(nextGroup)) {
                      setEditTargetScope('resident');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {TARGET_GROUP_OPTIONS.map((group) => (
                    <option key={group.value} value={group.value}>
                      {group.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  {TARGET_GROUP_OPTIONS.find((group) => group.value === editTargetGroup)?.description}
                </p>
              </div>
            </div>
          ) : null}

          {isEditing ? (
            <div>
              <label className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <FileText className="h-3 w-3" />
                Notes
              </label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Optional notes…"
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          ) : event.notes ? (
            <div className="flex items-start gap-2 border-t border-slate-100 pt-1">
              <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <p className="text-sm leading-relaxed text-slate-600">{event.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="space-y-2.5 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  {isEditing ? 'Update Location' : 'Pinned Location'}
                </p>
                {isEditing ? (
                  <span className="text-[10px] font-normal normal-case text-slate-400">
                    Search or click map to move the pin
                  </span>
                ) : null}
              </div>

              {isEditing ? (
                <MapLocationPicker
                  defaultCenter={mapCoords ?? undefined}
                  defaultAddress={event.location}
                  onLocationChange={(address, coords) => {
                    setEditLocation(address);
                    setEditCoords(coords);
                    setMapCoords(coords);
                  }}
                />
              ) : mapCoords ? (
                <MapView lat={mapCoords.lat} lng={mapCoords.lng} height={280} />
              ) : (
                <div className="flex h-[280px] items-center justify-center rounded-xl bg-slate-100">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              )}

              <p className="text-center text-[11px] text-slate-400">
                {isEditing ? editLocation || event.location : event.location}
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">Package Items</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    This bundle is released every time the encoder clicks Release.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  {event.package_items.length} line
                  {event.package_items.length !== 1 ? 's' : ''}
                </span>
              </div>

              {event.package_items.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No package items configured yet. Edit the event or create a new one with package
                  items before starting distribution.
                </div>
              ) : (
                <div className="space-y-2">
                  {packageStock.map((item) => (
                    <div
                      key={item.item_id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.item_name || 'Package Item'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Per release: {item.quantity} {item.unit}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-bold ${
                            item.lowStock ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {item.available} {item.unit}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {item.remainingPackages} full package
                          {item.remainingPackages !== 1 ? 's' : ''} left
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{servedHouseholdIds.size}</p>
                  <p className="text-xs font-medium text-slate-400">Households Served</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <UserRound className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{servedResidentIds.size}</p>
                  <p className="text-xs font-medium text-slate-400">Residents Served</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Package className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{totalUnitsReleased}</p>
                  <p className="text-xs font-medium text-slate-400">Units Released</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <ShieldCheck className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{remainingPackageReleases}</p>
                  <p className="text-xs font-medium text-slate-400">Full Packages Left</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm sm:col-span-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                  <ShieldCheck className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{audienceMatchCount}</p>
                  <p className="text-xs font-medium text-slate-400">{audienceMatchLabel}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{audienceMatchSupport}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">Distribution Proper</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Search the target, confirm the receiver, then release the configured package.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  {targetCountLabel}
                </span>
              </div>

              {event.status === 'completed' ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  This event is already completed. Distribution release is locked.
                </div>
              ) : null}

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={releaseSearch}
                  onChange={(e) => setReleaseSearch(e.target.value)}
                  placeholder={
                    event.target_scope === 'household'
                      ? 'Search head name, purok, or address'
                      : 'Search resident, relationship, or household'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {event.target_scope === 'household'
                  ? filteredHouseholds.map((household) => {
                      const matchedResidents = matchedResidentsByHouseholdId.get(household.id) ?? [];
                      const selected = selectedHouseholdId === household.id;
                      const served = servedHouseholdIds.has(household.id);

                      return (
                        <button
                          key={household.id}
                          type="button"
                          onClick={() => setSelectedHouseholdId(household.id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                            selected
                              ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                              : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {household.head_name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {household.purok_sitio} · {household.street_address}
                              </p>
                              {event.target_group !== 'all' && matchedResidents.length > 0 ? (
                                <p className="mt-1 text-[11px] text-emerald-700">
                                  {matchedResidents.length} {TARGET_GROUP_LABELS[event.target_group].toLowerCase()}
                                  {matchedResidents.length !== 1 ? 's' : ''}:{' '}
                                  {matchedResidents
                                    .slice(0, 2)
                                    .map((resident) => resident.full_name)
                                    .join(', ')}
                                  {matchedResidents.length > 2 ? ` +${matchedResidents.length - 2} more` : ''}
                                </p>
                              ) : null}
                            </div>
                            {served ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                                Served
                              </span>
                            ) : (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                                Ready
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  : filteredResidents.map((resident) => {
                      const household = householdsById.get(resident.household_id);
                      const selected = selectedResidentId === resident.id;
                      const served = servedResidentIds.has(resident.id);

                      return (
                        <button
                          key={resident.id}
                          type="button"
                          onClick={() => setSelectedResidentId(resident.id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                            selected
                              ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                              : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {resident.full_name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {resident.relationship_to_head} · {household?.head_name || 'Household'}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {household?.purok_sitio} · {household?.street_address}
                              </p>
                            </div>
                            {served ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                                Served
                              </span>
                            ) : (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                                Ready
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
              </div>

              {event.target_scope === 'household' && selectedHousehold ? (
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedHousehold.head_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {selectedHousehold.purok_sitio} · {selectedHousehold.street_address}
                      </p>
                      {event.target_group !== 'all' && (matchedResidentsByHouseholdId.get(selectedHousehold.id)?.length ?? 0) > 0 ? (
                        <p className="mt-1 text-[11px] text-emerald-700">
                          {(matchedResidentsByHouseholdId.get(selectedHousehold.id) ?? [])
                            .map((resident) => resident.full_name)
                            .join(', ')}
                        </p>
                      ) : null}
                    </div>
                    {selectedAlreadyServed ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                        Already served
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                        Received By
                      </label>
                      <input
                        type="text"
                        value={receivedByName}
                        onChange={(e) => setReceivedByName(e.target.value)}
                        className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                        Release Notes
                      </label>
                      <input
                        type="text"
                        value={releaseNotes}
                        onChange={(e) => setReleaseNotes(e.target.value)}
                        placeholder="Optional notes"
                        className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {event.target_scope === 'resident' && selectedResident ? (
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedResident.full_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {selectedResident.relationship_to_head} ·{' '}
                        {selectedHousehold?.head_name || 'Household'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {selectedHousehold?.purok_sitio} · {selectedHousehold?.street_address}
                      </p>
                    </div>
                    {selectedAlreadyServed ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                        Already served
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                        Received By
                      </label>
                      <input
                        type="text"
                        value={receivedByName}
                        onChange={(e) => setReceivedByName(e.target.value)}
                        className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                        Release Notes
                      </label>
                      <input
                        type="text"
                        value={releaseNotes}
                        onChange={(e) => setReleaseNotes(e.target.value)}
                        placeholder="Optional notes"
                        className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {releaseError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {releaseError}
                </div>
              ) : null}

              {releaseSuccess ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {releaseSuccess}
                </div>
              ) : null}

              {event.target_scope === 'household' && event.target_group !== 'all' && eligibleHouseholds.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No qualifying {TARGET_GROUP_LABELS[event.target_group].toLowerCase()} households were found yet for this event. Check the audience setting or the household member birthdates and flags.
                </div>
              ) : null}

              {event.target_scope === 'resident' && eligibleResidents.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No qualifying residents were found yet for this event. Check the audience setting or the resident vulnerability data first.
                </div>
              ) : null}

              {hasLowPackageStock ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Some package items are below the required per-release quantity. Restock first
                  before releasing more packages.
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleRelease}
                disabled={releaseDisabled || isReleasing}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isReleasing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Releasing Package…
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4" />
                    Release Package
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div>
              <p className="text-sm font-bold text-slate-800">Distribution Records</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Beneficiary list, released package contents, and timestamps.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExportingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download PDF
              </button>
              <span className="text-xs text-slate-400">
                {records.length} record{records.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">No records yet</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Records appear after beneficiaries receive items.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {records.map((record) => (
                <div key={record.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {record.beneficiary_name || record.received_by_name || 'Beneficiary'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Received by {record.received_by_name || record.beneficiary_name || 'beneficiary'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600">
                        {sumDistributedUnits(record.items_distributed)} unit
                        {sumDistributedUnits(record.items_distributed) !== 1 ? 's' : ''}
                      </p>
                      <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {new Date(record.timestamp).toLocaleString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {record.items_distributed.map((item, index) => (
                      <span
                        key={`${record.id}_${item.item_id}_${index}`}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                      >
                        {item.item_name || 'Item'} · {item.quantity} {item.unit}
                      </span>
                    ))}
                  </div>

                  {record.notes ? (
                    <p className="text-xs text-slate-500">Notes: {record.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
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
import { coerceDistributionTargetScope } from '@/lib/distribution-audience';
import {
  getDistributionAudienceContext,
  getDistributionEvent,
  getDistributionRecords,
  releaseDistributionPackage,
  updateDistributionEvent,
} from '@/lib/db/distribution';
import {
  buildDistributionInventorySummary,
  buildDistributionSelectionPreview,
  buildDistributionServedSummary,
  type DistributionEligibilitySummary,
} from '@/lib/distribution-insights';
import { getPendingSyncCount } from '@/lib/db/client-sync';
import { getHouseholds } from '@/lib/db/households';
import { getInventoryItems } from '@/lib/db/inventory';
import { getLastSupabaseBootstrapCompletedAt } from '@/lib/supabase/bootstrap';
import type {
  DistributedItem,
  DistributionEvent,
  DistributionRecord,
  DistributionTargetGroup,
  DistributionTargetScope,
  Household,
  InventoryItem,
  Resident,
  VulnerabilityFlags,
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

const DISTRIBUTION_BOOTSTRAP_TABLES = [
  'households',
  'residents',
  'vulnerability_flags',
  'distribution_events',
  'distribution_records',
  'inventory_items',
] as const;

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
  const [flagsByResidentId, setFlagsByResidentId] = useState<Map<string, VulnerabilityFlags>>(new Map());
  const [eligibilitySummary, setEligibilitySummary] = useState<DistributionEligibilitySummary | null>(null);
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
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastBootstrapAt, setLastBootstrapAt] = useState<number | null>(null);

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
  const refreshOperationalFreshness = useCallback(async () => {
    setPendingSyncCount(await getPendingSyncCount());
    setLastBootstrapAt(getLastSupabaseBootstrapCompletedAt([...DISTRIBUTION_BOOTSTRAP_TABLES]));
  }, []);

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

      const [distributionRecords, stockItems, households, audienceContext] = await Promise.all([
        getDistributionRecords(distributionEvent.id),
        getInventoryItems(),
        getHouseholds({ status: 'active', registration_status: 'approved' }),
        getDistributionAudienceContext({
          barangay_id: audienceBarangayId,
          target_group: distributionEvent.target_group,
          target_scope: distributionEvent.target_scope,
          scope_label: audienceScopeLabel,
        }),
      ]);

      if (requestId !== latestLoadRequestIdRef.current) {
        return;
      }

      setEvent(distributionEvent);
      setRecords(distributionRecords);
      setInventoryItems(stockItems);
      setAllHouseholds(households);
      setEligibilitySummary(audienceContext.eligibility_summary);
      setFlagsByResidentId(audienceContext.flagsByResidentId);
      setEligibleHouseholds(audienceContext.matches.eligibleHouseholds);
      setEligibleResidents(audienceContext.matches.eligibleResidents);
      setMatchedResidentsForHouseholds(
        Array.from(audienceContext.matches.matchedResidentsByHouseholdId.values()).flat(),
      );
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

      await refreshOperationalFreshness();
    } catch (loadError) {
      console.error(loadError);
    } finally {
      if (!background && requestId === latestLoadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [audienceBarangayScope, audienceScopeLabel, params.id, refreshOperationalFreshness, router, user]);

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

    function handleSyncQueueChanged() {
      void refreshOperationalFreshness();
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged as EventListener);
    window.addEventListener('mswdo-sync-queue-changed', handleSyncQueueChanged);
    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged as EventListener);
      window.removeEventListener('mswdo-sync-queue-changed', handleSyncQueueChanged);
    };
  }, [load, refreshOperationalFreshness, user]);

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
  const inventorySummary = useMemo(
    () => buildDistributionInventorySummary(event?.package_items ?? [], inventoryItems),
    [event?.package_items, inventoryItems],
  );
  const servedSummary = useMemo(
    () => buildDistributionServedSummary(records),
    [records],
  );

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
  const selectionPreview = useMemo(() => {
    if (!event) {
      return null;
    }

    return buildDistributionSelectionPreview({
      event,
      selectedHousehold,
      selectedResident,
      matchedResidentsByHouseholdId,
      flagsByResidentId,
      inventorySummary,
      servedHouseholdIds,
      servedResidentIds,
      eligibleHouseholds,
      eligibleResidents,
    });
  }, [
    eligibleHouseholds,
    eligibleResidents,
    event,
    flagsByResidentId,
    inventorySummary,
    matchedResidentsByHouseholdId,
    selectedHousehold,
    selectedResident,
    servedHouseholdIds,
    servedResidentIds,
  ]);
  const staleDataWarning = useMemo(() => {
    if (pendingSyncCount > 0) {
      return `${pendingSyncCount} local change${pendingSyncCount === 1 ? ' is' : 's are'} still waiting to sync. Release totals may refresh again after sync completes.`;
    }

    if (!lastBootstrapAt) {
      return 'Waiting for the latest Supabase refresh. Audience and stock numbers may still update.';
    }

    return null;
  }, [lastBootstrapAt, pendingSyncCount]);

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
      await refreshOperationalFreshness();
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
  const selectedAlreadyServed =
    event.target_scope === 'household'
      ? Boolean(selectedHousehold && servedHouseholdIds.has(selectedHousehold.id))
      : Boolean(selectedResident && servedResidentIds.has(selectedResident.id));
  const audienceMatchCount = event.target_scope === 'household'
    ? event.target_group === 'all'
      ? (eligibilitySummary?.eligible_households ?? eligibleHouseholds.length)
      : (eligibilitySummary?.eligible_residents ?? matchedResidentsForHouseholds.length)
    : (eligibilitySummary?.eligible_residents ?? eligibleResidents.length);
  const audienceMatchLabel = eligibilitySummary?.match_label ?? (
    event.target_scope === 'household'
      ? event.target_group === 'all'
        ? 'Eligible Households'
        : `${TARGET_GROUP_LABELS[event.target_group]} Matches`
      : event.target_group === 'all'
        ? 'Eligible Residents'
        : `${TARGET_GROUP_LABELS[event.target_group]} Matches`
  );
  const audienceMatchSupport = eligibilitySummary?.match_support
    ?? `${eligibleHouseholds.length} qualifying household${eligibleHouseholds.length === 1 ? '' : 's'} across ${audienceScopeLabel}.`;
  const targetCountLabel = eligibilitySummary?.target_count_label ?? (
    event.target_scope === 'household'
      ? `${eligibleHouseholds.length} eligible household${eligibleHouseholds.length === 1 ? '' : 's'}`
      : `${eligibleResidents.length} eligible resident${eligibleResidents.length === 1 ? '' : 's'}`
  );
  const releaseDisabled =
    !canManage ||
    event.status === 'completed' ||
    event.package_items.length === 0 ||
    (event.target_scope === 'household' ? !selectedHousehold : !selectedResident) ||
    Boolean(selectionPreview && selectionPreview.errors.length > 0);

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
        packageStock: inventorySummary.lines.map((line) => ({
          item_id: line.item_id,
          item_name: line.item_name,
          unit: line.unit,
          quantity: line.quantity,
          available: line.available,
          remainingPackages: line.remainingPackages,
          lowStock: line.isBlocking || line.isLowStock,
        })),
        summary: {
          householdsServed: servedSummary.households_served,
          residentsServed: servedSummary.residents_served,
          totalUnitsReleased: servedSummary.units_released,
          fullPackagesLeft: inventorySummary.available_packages,
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
                    setEditTargetScope(nextScope);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {TARGET_SCOPE_OPTIONS.map((scope) => (
                    <option key={scope.value} value={scope.value}>
                      {scope.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  {editTargetScope === 'household'
                    ? 'Release one package to each household that has at least one matching member.'
                    : TARGET_SCOPE_OPTIONS.find((scope) => scope.value === editTargetScope)?.description}
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
                <div className="space-y-3">
                  {inventorySummary.lines.map((item) => (
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
                            item.isBlocking ? 'text-rose-600' : item.isLowStock ? 'text-amber-600' : 'text-emerald-600'
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

                  {inventorySummary.blocking_items.length > 0 ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      Restock required before release: {inventorySummary.blocking_items.map((item) => item.item_name).join(', ')}.
                    </div>
                  ) : null}

                  {inventorySummary.low_stock_items.length > 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Low stock warning: {inventorySummary.low_stock_items.map((item) => item.item_name).join(', ')} will be near reorder level after release.
                    </div>
                  ) : null}
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
                  <p className="text-2xl font-bold text-slate-900">{servedSummary.households_served}</p>
                  <p className="text-xs font-medium text-slate-400">Households Served</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <UserRound className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{servedSummary.residents_served}</p>
                  <p className="text-xs font-medium text-slate-400">Residents Served</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Package className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{servedSummary.units_released}</p>
                  <p className="text-xs font-medium text-slate-400">Units Released</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <ShieldCheck className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{inventorySummary.available_packages}</p>
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

              {selectionPreview ? (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Release Preview
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {selectionPreview.heading}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{selectionPreview.support}</p>
                    </div>
                    {selectedAlreadyServed ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                        Already served
                      </span>
                    ) : null}
                  </div>

                  {selectionPreview.qualification ? (
                    <div className="rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm text-slate-700">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        Why this target qualifies
                      </p>
                      <p className="mt-1 leading-6">{selectionPreview.qualification}</p>
                    </div>
                  ) : null}

                  {staleDataWarning ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <div>
                          <p>{staleDataWarning}</p>
                          {lastBootstrapAt ? (
                            <p className="mt-1 text-[11px] text-amber-700/80">
                              Last refresh: {new Date(lastBootstrapAt).toLocaleString('en-PH', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {selectionPreview.packagePreview.map((line) => (
                      <div
                        key={line.item_id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{line.item_name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Deduct {line.per_release} {line.unit} on release
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${line.is_blocking ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {line.stock_after_release} {line.unit}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            after release · {line.packages_left_after_release} package
                            {line.packages_left_after_release === 1 ? '' : 's'} left
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectionPreview.warnings.map((warning) => (
                    <div
                      key={warning}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800"
                    >
                      {warning}
                    </div>
                  ))}

                  {selectionPreview.errors.map((previewError) => (
                    <div
                      key={previewError}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700"
                    >
                      {previewError}
                    </div>
                  ))}
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

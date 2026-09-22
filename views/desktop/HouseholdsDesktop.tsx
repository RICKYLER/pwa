'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Cake,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  Home,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getAllPuroks, getHouseholds } from '@/lib/db/households';
import { getPurokRiskProfiles } from '@/lib/db/purok-risk-profiles';
import { getResidentsInHousehold } from '@/lib/db/residents';
import { isBirthdayThisMonth } from '@/lib/db/vulnerability';
import type { DisasterRiskLevel, HazardType, Household, PurokFloodControlStatus, PurokRiskProfile } from '@/lib/db/schema';
import { getHouseholdRegistrationStatus } from '@/lib/household-registration';
import { hasHouseholdPin } from '@/lib/map-pins';
import {
  DISASTER_RISK_LEVEL_LABELS,
  HAZARD_LABELS,
  parseHazardTags,
} from '@/lib/disaster-alerts';
import {
  buildPurokRiskProfileMap,
  getPurokRiskProfileForHousehold,
  matchesPurokRiskFilters,
  PUROK_FLOOD_CONTROL_STATUS_LABELS,
} from '@/lib/purok-risk-profiles';
import {
  CivicChipButton,
  CivicEmptyState,
  CivicPage,
} from '@/components/ui/civic-primitives';

const STATUS_CFG = {
  active: { label: 'Active', tone: 'emerald' as const, dot: 'bg-emerald-500' },
  moved_out: { label: 'Moved out', tone: 'amber' as const, dot: 'bg-amber-500' },
  deceased: { label: 'Deceased', tone: 'slate' as const, dot: 'bg-slate-400' },
};

const HAZARD_FILTER_OPTIONS: HazardType[] = [
  'flood',
  'typhoon',
  'landslide',
  'storm_surge',
  'fire',
  'earthquake',
];

const DISASTER_RISK_OPTIONS: DisasterRiskLevel[] = ['low', 'medium', 'high'];
const PUROK_FLOOD_CONTROL_OPTIONS: PurokFloodControlStatus[] = ['protected', 'partial', 'none', 'unknown'];
type PurokFloodProneFilter = 'all' | 'flood_prone' | 'not_flood_prone';

export default function HouseholdsDesktop() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getCurrentUser();

  const [households, setHouseholds] = useState<Household[]>([]);
  const [puroks, setPuroks] = useState<string[]>([]);
  const [purokRiskProfiles, setPurokRiskProfiles] = useState<PurokRiskProfile[]>([]);
  const [search, setSearch] = useState('');
  const [filterPurok, setFilterPurok] = useState('all');
  const [filterBarangay, setFilterBarangay] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'moved_out' | 'deceased' | 'pending'>('active');
  const [filterHazard, setFilterHazard] = useState<HazardType | 'all'>('all');
  const [filterRiskLevel, setFilterRiskLevel] = useState<DisasterRiskLevel | 'all'>('all');
  const [filterFloodProne, setFilterFloodProne] = useState<PurokFloodProneFilter>('all');
  const [filterFloodControlStatus, setFilterFloodControlStatus] = useState<PurokFloodControlStatus | 'all'>('all');
  const [filterUnverifiedOnly, setFilterUnverifiedOnly] = useState(false);
  const [filterBirthdayThisMonth, setFilterBirthdayThisMonth] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [activeMemberCount, setActiveMemberCount] = useState(0);
  const [hasUnverifiedMembers, setHasUnverifiedMembers] = useState<Record<string, boolean>>({});
  const [birthdayMembers, setBirthdayMembers] = useState<Record<string, string[]>>({});

  const issueFilter = searchParams.get('issue');
  const isMissingLocationMode = issueFilter === 'missing_location';

  const purokRiskProfileMap = useMemo(
    () => buildPurokRiskProfileMap(purokRiskProfiles),
    [purokRiskProfiles],
  );

  const barangays = useMemo<{ id: string; label: string }[]>(() => {
    const byId = new Map<string, string>();
    households.forEach((household) => {
      if (!household.barangay_id) return;
      if (!byId.has(household.barangay_id)) {
        byId.set(household.barangay_id, household.barangay_name || household.barangay_id);
      }
    });
    return [...byId.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [households]);

  const loadHouseholdsData = useCallback(async (background = false) => {
    if (!user || !hasPermission('view_households')) {
      router.push('/dashboard');
      return;
    }

    if (!background) {
      setIsLoading(true);
    }

    const [allHouseholds, profiles] = await Promise.all([
      user.role === 'admin'
        ? getHouseholds()
        : getHouseholds({ barangay_id: user.barangay_id }),
      getPurokRiskProfiles(user.role === 'admin' ? undefined : user.barangay_id),
    ]);

    setHouseholds(allHouseholds);
    setPurokRiskProfiles(profiles);

    const counts: Record<string, number> = {};
    const unverified: Record<string, boolean> = {};
    const birthdays: Record<string, string[]> = {};
    let activeMemberTotal = 0;

    for (const household of allHouseholds) {
      const hhResidents = await getResidentsInHousehold(household.id);
      counts[household.id] = hhResidents.length;
      activeMemberTotal += hhResidents.filter((resident) => resident.status === 'active').length;
      unverified[household.id] = hhResidents.some((r) => r.verification_status === 'pending');
      birthdays[household.id] = hhResidents
        .filter((resident) => resident.status === 'active' && isBirthdayThisMonth(resident.birthdate))
        .map((resident) => resident.full_name);
    }

    setMemberCounts(counts);
    setActiveMemberCount(activeMemberTotal);
    setHasUnverifiedMembers(unverified);
    setBirthdayMembers(birthdays);
    setPuroks(
      user.role === 'admin'
        ? [...new Set(allHouseholds.map((household) => household.purok_sitio).filter(Boolean))].sort()
        : await getAllPuroks(user.barangay_id),
    );

    if (!background) {
      setIsLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHouseholdsData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadHouseholdsData]);

  useEffect(() => {
    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (!['households', 'residents', 'purok_risk_profiles'].includes(event.detail.table)) {
        return;
      }

      void loadHouseholdsData(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => window.removeEventListener('mswdo-data-changed', handleDataChanged);
  }, [loadHouseholdsData]);

  const filtered = useMemo(() => {
    let result = households;

    if (isMissingLocationMode) {
      result = result.filter(
        (household) =>
          household.status === 'active' &&
          getHouseholdRegistrationStatus(household) === 'approved' &&
          !hasHouseholdPin(household),
      );
    }

    if (filterStatus !== 'all') {
      if (filterStatus === 'pending') {
        result = result.filter((household) => getHouseholdRegistrationStatus(household) === 'pending');
      } else {
        result = result.filter((household) => household.status === filterStatus);
      }
    }

    if (filterPurok !== 'all') result = result.filter((household) => household.purok_sitio === filterPurok);
    if (filterBarangay !== 'all') result = result.filter((household) => household.barangay_id === filterBarangay);
    if (filterHazard !== 'all') {
      result = result.filter((household) => parseHazardTags(household.hazard_tags).includes(filterHazard));
    }
    if (filterRiskLevel !== 'all') {
      result = result.filter((household) => household.disaster_risk_level === filterRiskLevel);
    }

    result = result.filter((household) =>
      matchesPurokRiskFilters(household, purokRiskProfileMap, {
        floodProne: filterFloodProne,
        floodControlStatus: filterFloodControlStatus,
      }),
    );

    if (filterUnverifiedOnly) {
      result = result.filter((household) => hasUnverifiedMembers[household.id]);
    }
    if (filterBirthdayThisMonth) {
      result = result.filter((household) => (birthdayMembers[household.id]?.length ?? 0) > 0);
    }

    if (search) {
      const query = search.toLowerCase().trim();
      result = result.filter(
        (household) =>
          household.head_name.toLowerCase().includes(query) ||
          household.street_address.toLowerCase().includes(query) ||
          household.purok_sitio.toLowerCase().includes(query) ||
          household.id.toLowerCase().includes(query),
      );
    }

    return result;
  }, [
    birthdayMembers,
    filterBarangay,
    filterBirthdayThisMonth,
    filterFloodControlStatus,
    filterFloodProne,
    filterHazard,
    filterPurok,
    filterRiskLevel,
    filterStatus,
    filterUnverifiedOnly,
    hasUnverifiedMembers,
    households,
    isMissingLocationMode,
    purokRiskProfileMap,
    search,
  ]);

  if (!user) return null;

  const activeCount = households.filter((h) => h.status === 'active').length;
  const movedCount = households.filter((h) => h.status === 'moved_out').length;
  const pendingCount = households.filter((h) => getHouseholdRegistrationStatus(h) === 'pending').length;
  const unverifiedCount = Object.values(hasUnverifiedMembers).filter(Boolean).length;
  const birthdayHouseholdCount = Object.values(birthdayMembers).filter((names) => names.length > 0).length;
  const deceasedCount = households.filter((h) => h.status === 'deceased').length;
  const pinnedCount = households.filter((h) => hasHouseholdPin(h)).length;
  const pinRate = households.length > 0 ? Math.round((pinnedCount / households.length) * 100) : 0;

  const hasAdvancedFilters =
    filterHazard !== 'all' ||
    filterRiskLevel !== 'all' ||
    filterFloodProne !== 'all' ||
    filterFloodControlStatus !== 'all';

  const hasAnyFilter =
    Boolean(search) ||
    filterPurok !== 'all' ||
    filterBarangay !== 'all' ||
    filterStatus !== 'active' ||
    hasAdvancedFilters ||
    filterUnverifiedOnly ||
    filterBirthdayThisMonth ||
    isMissingLocationMode;

  const clearAllFilters = () => {
    setSearch('');
    setFilterPurok('all');
    setFilterBarangay('all');
    setFilterStatus('active');
    setFilterHazard('all');
    setFilterRiskLevel('all');
    setFilterFloodProne('all');
    setFilterFloodControlStatus('all');
    setFilterUnverifiedOnly(false);
    setFilterBirthdayThisMonth(false);
  };

  return (
    <CivicPage className="space-y-6">
      {/* ── Top Executive Header & Action Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-900 border border-cyan-200/60">
              <Sparkles className="h-3.5 w-3.5 text-cyan-600" />
              Census & Demographics Registry
            </span>
            {pendingCount > 0 ? (
              <Link
                href="/admin/location-review?tab=pending"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200 transition hover:bg-amber-100"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                {pendingCount} Pending Review
              </Link>
            ) : null}
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Households</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isLoading
              ? 'Loading municipal household records...'
              : user.role === 'admin'
                ? `${households.length} total households registered across all barangays of Mabini.`
                : `${households.length} total households registered in ${user.barangay_id}.`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasPermission('create_household') ? (
            <Link
              href="/households/register"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-900 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Register Household
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── Missing Location Quality Notice ── */}
      {isMissingLocationMode ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">Data Quality Filter: Missing GPS Coordinates</p>
              <p className="text-xs text-amber-800">
                Showing approved active households that still need a verified geographic pin on the map.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user.role === 'admin' ? (
              <Link
                href="/admin/location-review?tab=approved&issue=missing_coordinates"
                className="text-xs font-bold text-amber-900 underline underline-offset-4 hover:text-amber-950"
              >
                Open Review Queue
              </Link>
            ) : null}
            <Link
              href="/households"
              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-amber-900 border border-amber-200 hover:bg-amber-100"
            >
              Show All Records
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── Executive Vitals Strip (Replaces the 5 bulky cards) ── */}
      <div className="grid grid-cols-2 divide-y sm:grid-cols-5 sm:divide-y-0 sm:divide-x divide-slate-200/80 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
        {/* Total Households */}
        <button
          type="button"
          onClick={() => setFilterStatus('all')}
          className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
            filterStatus === 'all' && !filterUnverifiedOnly ? 'bg-slate-50 ring-1 ring-cyan-600' : 'hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500">
            <Home className="h-4 w-4 text-cyan-900" />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Census</span>
          </div>
          <span className="mt-2 text-2xl font-black tracking-tight text-slate-950 font-mono">
            {isLoading ? '—' : households.length}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-500">
            {activeCount} active ({households.length > 0 ? Math.round((activeCount / households.length) * 100) : 0}%)
          </span>
        </button>

        {/* Active Residents */}
        <button
          type="button"
          onClick={() => setFilterStatus('active')}
          className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
            filterStatus === 'active' && !filterUnverifiedOnly ? 'bg-emerald-50/50 ring-1 ring-emerald-500' : 'hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500">
            <Users className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Active Members</span>
          </div>
          <span className="mt-2 text-2xl font-black tracking-tight text-emerald-950 font-mono">
            {isLoading ? '—' : activeMemberCount.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[11px] text-emerald-700">
            ~{households.length > 0 ? (activeMemberCount / Math.max(1, households.length)).toFixed(1) : 0} / household
          </span>
        </button>

        {/* Pending Review */}
        <button
          type="button"
          onClick={() => setFilterStatus('pending')}
          className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
            filterStatus === 'pending' ? 'bg-amber-50/60 ring-1 ring-amber-500' : 'hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500">
            <div className={`h-2.5 w-2.5 rounded-full ${pendingCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`} />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Pending Review</span>
          </div>
          <span className={`mt-2 text-2xl font-black tracking-tight font-mono ${pendingCount > 0 ? 'text-amber-900' : 'text-slate-950'}`}>
            {isLoading ? '—' : pendingCount}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-500">
            {pendingCount > 0 ? 'Action required' : 'All approved'}
          </span>
        </button>

        {/* Unverified Members */}
        <button
          type="button"
          onClick={() => setFilterUnverifiedOnly(!filterUnverifiedOnly)}
          className={`flex flex-col items-start p-3.5 text-left transition-all rounded-xl ${
            filterUnverifiedOnly ? 'bg-rose-50/60 ring-1 ring-rose-500' : 'hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-500">
            <AlertTriangle className={`h-4 w-4 ${unverifiedCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Unverified Members</span>
          </div>
          <span className={`mt-2 text-2xl font-black tracking-tight font-mono ${unverifiedCount > 0 ? 'text-rose-950' : 'text-slate-950'}`}>
            {isLoading ? '—' : unverifiedCount}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-500">
            {unverifiedCount > 0 ? `${unverifiedCount} households flagged` : 'Zero unverified'}
          </span>
        </button>

        {/* GPS Geotagged Rate */}
        <div className="flex flex-col items-start p-3.5 text-left rounded-xl">
          <div className="flex items-center gap-2 text-slate-500">
            <MapPin className="h-4 w-4 text-cyan-700" />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">GPS Coverage</span>
          </div>
          <span className="mt-2 text-2xl font-black tracking-tight text-slate-950 font-mono">
            {isLoading ? '—' : `${pinRate}%`}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-500">
            {pinnedCount} of {households.length} mapped
          </span>
        </div>
      </div>

      {/* ── Unified Smart Filter & View Controls Bar ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3.5">
        {/* Top Controls Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by head name, street address, purok, or ID..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-9 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-cyan-900 focus:bg-white focus:ring-1 focus:ring-cyan-900"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Barangay Dropdown (if admin / multiple) */}
          {barangays.length > 1 ? (
            <select
              value={filterBarangay}
              onChange={(e) => setFilterBarangay(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-xs font-semibold text-slate-700 outline-none transition hover:bg-white focus:border-cyan-900 focus:bg-white"
            >
              <option value="all">All Barangays ({barangays.length})</option>
              {barangays.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          ) : null}

          {/* Purok Dropdown */}
          {puroks.length > 0 ? (
            <select
              value={filterPurok}
              onChange={(e) => setFilterPurok(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-xs font-semibold text-slate-700 outline-none transition hover:bg-white focus:border-cyan-900 focus:bg-white"
            >
              <option value="all">All Puroks</option>
              {puroks.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : null}

          {/* More Filters Toggle */}
          <button
            type="button"
            onClick={() => setShowMoreFilters(!showMoreFilters)}
            className={`inline-flex items-center gap-2 h-10 rounded-xl border px-3.5 text-xs font-semibold transition ${
              hasAdvancedFilters || showMoreFilters
                ? 'border-cyan-300 bg-cyan-50/80 text-cyan-950 font-bold'
                : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-white'
            }`}
          >
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <span>Risk & Hazard Filters</span>
            {hasAdvancedFilters ? (
              <span className="flex h-2 w-2 rounded-full bg-cyan-600" />
            ) : null}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* View Mode Switcher (Cards vs Table) */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              title="Cards View"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Registry Table View"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* Expandable Advanced Filters Drawer */}
        {showMoreFilters ? (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 sm:grid-cols-4 animate-in fade-in-50 duration-150">
            {/* Hazards */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Hazard Tag</label>
              <select
                value={filterHazard}
                onChange={(e) => setFilterHazard(e.target.value as HazardType | 'all')}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-cyan-900"
              >
                <option value="all">All Hazards</option>
                {HAZARD_FILTER_OPTIONS.map((h) => (
                  <option key={h} value={h}>{HAZARD_LABELS[h]}</option>
                ))}
              </select>
            </div>

            {/* Disaster Risk Level */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Disaster Risk</label>
              <select
                value={filterRiskLevel}
                onChange={(e) => setFilterRiskLevel(e.target.value as DisasterRiskLevel | 'all')}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-cyan-900"
              >
                <option value="all">All Risk Levels</option>
                {DISASTER_RISK_OPTIONS.map((r) => (
                  <option key={r} value={r}>{DISASTER_RISK_LEVEL_LABELS[r]}</option>
                ))}
              </select>
            </div>

            {/* Flood-Prone Flag */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Purok Flood Profile</label>
              <select
                value={filterFloodProne}
                onChange={(e) => setFilterFloodProne(e.target.value as PurokFloodProneFilter)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-cyan-900"
              >
                <option value="all">All Flood Profiles</option>
                <option value="flood_prone">🌊 Flood-Prone Only</option>
                <option value="not_flood_prone">🛡️ Not Flood-Prone</option>
              </select>
            </div>

            {/* Flood Control Status */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Flood Control</label>
              <select
                value={filterFloodControlStatus}
                onChange={(e) => setFilterFloodControlStatus(e.target.value as PurokFloodControlStatus | 'all')}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-cyan-900"
              >
                <option value="all">All Flood Controls</option>
                {PUROK_FLOOD_CONTROL_OPTIONS.map((s) => (
                  <option key={s} value={s}>{PUROK_FLOOD_CONTROL_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {/* Bottom Quick Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'all' as const, label: 'All Records', count: households.length },
              { key: 'active' as const, label: 'Active', count: activeCount },
              { key: 'pending' as const, label: 'Pending Review', count: pendingCount },
              { key: 'moved_out' as const, label: 'Moved out', count: movedCount },
              { key: 'deceased' as const, label: 'Deceased', count: deceasedCount },
            ].map((tab) => (
              <CivicChipButton
                key={tab.key}
                active={filterStatus === tab.key}
                onClick={() => setFilterStatus(tab.key)}
              >
                {tab.label}
                <span
                  className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono ${
                    filterStatus === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isLoading ? '—' : tab.count}
                </span>
              </CivicChipButton>
            ))}

            <CivicChipButton
              active={filterUnverifiedOnly}
              onClick={() => setFilterUnverifiedOnly(!filterUnverifiedOnly)}
            >
              <AlertTriangle className="h-3 w-3 mr-1 text-rose-500" />
              Unverified
              <span
                className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono ${
                  filterUnverifiedOnly ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {isLoading ? '—' : unverifiedCount}
              </span>
            </CivicChipButton>

            <CivicChipButton
              active={filterBirthdayThisMonth}
              onClick={() => setFilterBirthdayThisMonth(!filterBirthdayThisMonth)}
            >
              <Cake className="h-3 w-3 mr-1 text-teal-600" />
              Birthdays
              <span
                className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono ${
                  filterBirthdayThisMonth ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'
                }`}
              >
                {isLoading ? '—' : birthdayHouseholdCount}
              </span>
            </CivicChipButton>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">
              Showing <strong className="text-slate-900">{filtered.length}</strong> of {households.length}
            </span>
            {hasAnyFilter ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 underline underline-offset-2"
              >
                <X className="h-3 w-3" />
                Reset
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Content View (Cards or Master Table) ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        viewMode === 'cards' ? (
          /* ── View Mode A: Modern Dossier Cards ── */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((household) => {
              const status = STATUS_CFG[household.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.active;
              const registrationStatus = getHouseholdRegistrationStatus(household);
              const householdHazards = parseHazardTags(household.hazard_tags);
              const purokRiskProfile = getPurokRiskProfileForHousehold(household, purokRiskProfileMap);
              const residentCount = memberCounts[household.id] || 0;
              const isPinned = hasHouseholdPin(household);
              const hasUnverified = hasUnverifiedMembers[household.id];
              const bdays = birthdayMembers[household.id] || [];

              const locationPrimary = user.role === 'admin'
                ? `${household.purok_sitio || 'Purok —'} · ${household.barangay_name || household.barangay_id || 'Mabini'}`
                : `${household.purok_sitio || 'Purok —'}`;

              return (
                <Link
                  key={household.id}
                  href={`/households/${household.id}`}
                  className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-800 hover:shadow-md"
                >
                  {/* Card Header: Avatar, Name, Household ID & Primary Status Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {/* Monogram Avatar */}
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-sm font-black text-slate-800 border border-slate-200/60 shadow-inner group-hover:from-cyan-900 group-hover:to-cyan-950 group-hover:text-white transition-colors">
                          {household.head_name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-bold text-slate-900 group-hover:text-cyan-950 transition-colors">
                            {household.head_name}
                          </h2>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-mono font-medium text-slate-400">
                              #{household.id.slice(0, 8)}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-xs font-semibold text-slate-600 truncate">
                              {locationPrimary}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Primary Single Status Badge */}
                      {registrationStatus === 'pending' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200 shrink-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Pending Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 border border-slate-200 shrink-0">
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      )}
                    </div>

                    {/* Address Line */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{household.street_address || 'No street address recorded'}</span>
                    </div>

                    {/* High-Signal Action Alerts Only (NO negative tags) */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {/* Flood-Prone Alert (Only if TRUE) */}
                      {purokRiskProfile?.flood_prone ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200">
                          🌊 Flood-Prone
                        </span>
                      ) : null}

                      {/* High Disaster Risk (Only if HIGH) */}
                      {household.disaster_risk_level === 'high' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200">
                          ⚠️ High Risk
                        </span>
                      ) : null}

                      {/* Unverified Member Alert */}
                      {hasUnverified ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200 animate-pulse">
                          <AlertTriangle className="h-3 w-3 text-rose-600" />
                          Unverified Member
                        </span>
                      ) : null}

                      {/* Birthday Alert */}
                      {bdays.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800 border border-teal-200">
                          🎂 {bdays.length === 1 ? 'Birthday this month' : `${bdays.length} birthdays`}
                        </span>
                      ) : null}

                      {/* Active Hazards (if any) */}
                      {householdHazards.map((h) => (
                        <span key={h} className="inline-flex items-center rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-900 border border-cyan-200">
                          {HAZARD_LABELS[h]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Footer: Resident Count, GPS Pin & Action Trigger */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <div className="flex items-center gap-3">
                      {/* Resident Count (Grammar Fixed) */}
                      <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          {residentCount} {residentCount === 1 ? 'resident' : 'residents'}
                        </span>
                      </span>

                      {/* GPS Pin Status */}
                      {isPinned ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-800">
                          <CheckCircle2 className="h-3.5 w-3.5 text-cyan-600" />
                          Geotagged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          Missing Pin
                        </span>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 font-bold text-cyan-950 group-hover:translate-x-0.5 transition-transform">
                      View Dossier
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* ── View Mode B: Master Registry Table ── */
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 pl-6 pr-4">Household Head & ID</th>
                    <th className="py-3.5 px-4">Location</th>
                    <th className="py-3.5 px-4">Registration</th>
                    <th className="py-3.5 px-4">Members</th>
                    <th className="py-3.5 px-4">Risk & Alerts</th>
                    <th className="py-3.5 px-4">GPS Status</th>
                    <th className="py-3.5 pr-6 pl-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map((household) => {
                    const status = STATUS_CFG[household.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.active;
                    const registrationStatus = getHouseholdRegistrationStatus(household);
                    const residentCount = memberCounts[household.id] || 0;
                    const isPinned = hasHouseholdPin(household);
                    const hasUnverified = hasUnverifiedMembers[household.id];
                    const purokRiskProfile = getPurokRiskProfileForHousehold(household, purokRiskProfileMap);

                    return (
                      <tr
                        key={household.id}
                        className="transition-colors hover:bg-slate-50/80 group"
                      >
                        {/* Head & ID */}
                        <td className="py-3.5 pl-6 pr-4">
                          <Link href={`/households/${household.id}`} className="block">
                            <span className="font-bold text-slate-900 group-hover:text-cyan-950 transition-colors">
                              {household.head_name}
                            </span>
                            <span className="block text-xs font-mono text-slate-400">
                              #{household.id.slice(0, 8)}
                            </span>
                          </Link>
                        </td>

                        {/* Location */}
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-800">
                            {household.purok_sitio || 'Purok —'}
                          </span>
                          <span className="block text-xs text-slate-500 truncate max-w-[200px]">
                            {household.street_address}
                          </span>
                        </td>

                        {/* Registration & Status */}
                        <td className="py-3.5 px-4">
                          {registrationStatus === 'pending' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                              {status.label}
                            </span>
                          )}
                        </td>

                        {/* Member Count */}
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 font-mono">
                            {residentCount}
                          </span>
                          <span className="text-xs text-slate-500 ml-1">
                            {residentCount === 1 ? 'resident' : 'residents'}
                          </span>
                          {hasUnverified ? (
                            <span className="block text-[11px] font-bold text-rose-600">
                              ⚠️ Unverified member
                            </span>
                          ) : null}
                        </td>

                        {/* Risk & Alerts */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1">
                            {purokRiskProfile?.flood_prone ? (
                              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200">
                                Flood-Prone
                              </span>
                            ) : null}
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                household.disaster_risk_level === 'high'
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : household.disaster_risk_level === 'medium'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {DISASTER_RISK_LEVEL_LABELS[household.disaster_risk_level ?? 'medium']}
                            </span>
                          </div>
                        </td>

                        {/* GPS Status */}
                        <td className="py-3.5 px-4">
                          {isPinned ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-800">
                              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-600" />
                              Pinned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              Unmapped
                            </span>
                          )}
                        </td>

                        {/* Action Link */}
                        <td className="py-3.5 pr-6 pl-4 text-right">
                          <Link
                            href={`/households/${household.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 transition hover:border-cyan-900 hover:text-cyan-950 shadow-sm"
                          >
                            Open
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <CivicEmptyState
          icon={Home}
          title="No households found"
          description={
            hasAnyFilter
              ? 'No household records match your current search or filter combination.'
              : 'Start by registering your first household census record to populate the directory.'
          }
        />
      )}
    </CivicPage>
  );
}

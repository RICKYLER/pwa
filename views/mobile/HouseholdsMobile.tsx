'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Cake,
  CheckCircle2,
  ChevronRight,
  Filter,
  Home,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  CivicBadge,
  CivicChipButton,
  CivicEmptyState,
  CivicPage,
} from '@/components/ui/civic-primitives';
import { MobileFilterSheet } from '@/components/mobile/mobile-primitives';

const STATUS_CFG = {
  active: { label: 'Active', tone: 'emerald' as const, dot: 'bg-emerald-500' },
  moved_out: { label: 'Moved out', tone: 'amber' as const, dot: 'bg-amber-500' },
  deceased: { label: 'Deceased', tone: 'slate' as const, dot: 'bg-slate-400' },
};

const DEFAULT_STATUS = 'active' as const;

type HouseholdFilterStatus = 'all' | 'active' | 'moved_out' | 'deceased' | 'pending';
type HouseholdSort = 'recent' | 'name' | 'members';

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

export default function HouseholdsMobile() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getCurrentUser();

  const [households, setHouseholds] = useState<Household[]>([]);
  const [purokRiskProfiles, setPurokRiskProfiles] = useState<PurokRiskProfile[]>([]);
  const [puroks, setPuroks] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterPurok, setFilterPurok] = useState('all');
  const [filterBarangay, setFilterBarangay] = useState('all');
  const [filterStatus, setFilterStatus] = useState<HouseholdFilterStatus>(DEFAULT_STATUS);
  const [filterHazard, setFilterHazard] = useState<HazardType | 'all'>('all');
  const [filterRiskLevel, setFilterRiskLevel] = useState<DisasterRiskLevel | 'all'>('all');
  const [filterFloodProne, setFilterFloodProne] = useState<PurokFloodProneFilter>('all');
  const [filterFloodControlStatus, setFilterFloodControlStatus] = useState<PurokFloodControlStatus | 'all'>('all');
  const [filterUnverifiedOnly, setFilterUnverifiedOnly] = useState(false);
  const [filterBirthdayThisMonth, setFilterBirthdayThisMonth] = useState(false);
  const [sortBy, setSortBy] = useState<HouseholdSort>('recent');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [hasUnverifiedMembers, setHasUnverifiedMembers] = useState<Record<string, boolean>>({});
  const [birthdayMembers, setBirthdayMembers] = useState<Record<string, string[]>>({});

  const issueFilter = searchParams.get('issue');
  const isMissingLocationMode = issueFilter === 'missing_location';
  const purokRiskProfileMap = buildPurokRiskProfileMap(purokRiskProfiles);

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
    for (const household of allHouseholds) {
      const hhResidents = await getResidentsInHousehold(household.id);
      counts[household.id] = hhResidents.length;
      unverified[household.id] = hhResidents.some((r) => r.verification_status === 'pending');
      birthdays[household.id] = hhResidents
        .filter((resident) => resident.status === 'active' && isBirthdayThisMonth(resident.birthdate))
        .map((resident) => resident.full_name);
    }
    setMemberCounts(counts);
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

  if (!user) return null;

  const barangays = [...new Map(
    households
      .filter((household) => household.barangay_id)
      .map((household) => [household.barangay_id, household.barangay_name || household.barangay_id] as const),
  ).entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  const filteredHouseholds = households
    .filter((household) => (
      !isMissingLocationMode
      || (
        household.status === 'active'
        && getHouseholdRegistrationStatus(household) === 'approved'
        && !hasHouseholdPin(household)
      )
    ))
    .filter((household) => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'pending') return getHouseholdRegistrationStatus(household) === 'pending';
      return household.status === filterStatus;
    })
    .filter((household) => filterPurok === 'all' || household.purok_sitio === filterPurok)
    .filter((household) => filterBarangay === 'all' || household.barangay_id === filterBarangay)
    .filter((household) => filterHazard === 'all' || parseHazardTags(household.hazard_tags).includes(filterHazard))
    .filter((household) => filterRiskLevel === 'all' || household.disaster_risk_level === filterRiskLevel)
    .filter((household) => matchesPurokRiskFilters(household, purokRiskProfileMap, {
      floodProne: filterFloodProne,
      floodControlStatus: filterFloodControlStatus,
    }))
    .filter((household) => !filterUnverifiedOnly || hasUnverifiedMembers[household.id])
    .filter((household) => !filterBirthdayThisMonth || (birthdayMembers[household.id]?.length ?? 0) > 0)
    .filter((household) => {
      if (!search) return true;
      const query = search.toLowerCase().trim();
      return (
        household.head_name.toLowerCase().includes(query) ||
        household.street_address.toLowerCase().includes(query) ||
        household.purok_sitio.toLowerCase().includes(query) ||
        household.id.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (sortBy === 'name') {
        return left.head_name.localeCompare(right.head_name);
      }
      if (sortBy === 'members') {
        return (memberCounts[right.id] ?? 0) - (memberCounts[left.id] ?? 0);
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

  const activeCount = households.filter((h) => h.status === 'active').length;
  const pendingCount = households.filter((h) => getHouseholdRegistrationStatus(h) === 'pending').length;
  const unverifiedCount = Object.values(hasUnverifiedMembers).filter(Boolean).length;
  const birthdayHouseholdCount = Object.values(birthdayMembers).filter((names) => names.length > 0).length;
  const pinnedCount = households.filter((h) => hasHouseholdPin(h)).length;
  const pinRate = households.length > 0 ? Math.round((pinnedCount / households.length) * 100) : 0;

  const hasFilters =
    Boolean(search) ||
    filterPurok !== 'all' ||
    filterBarangay !== 'all' ||
    filterStatus !== DEFAULT_STATUS ||
    filterHazard !== 'all' ||
    filterRiskLevel !== 'all' ||
    filterFloodProne !== 'all' ||
    filterFloodControlStatus !== 'all' ||
    filterUnverifiedOnly ||
    filterBirthdayThisMonth ||
    sortBy !== 'recent' ||
    isMissingLocationMode;

  const statusOptions = [
    { key: 'all' as const, label: 'All', count: households.length },
    { key: 'active' as const, label: 'Active', count: activeCount },
    { key: 'pending' as const, label: 'Pending', count: pendingCount },
    { key: 'moved_out' as const, label: 'Moved', count: households.filter((h) => h.status === 'moved_out').length },
    { key: 'deceased' as const, label: 'Deceased', count: households.filter((h) => h.status === 'deceased').length },
  ];

  return (
    <CivicPage className="space-y-4 px-3 py-4">
      {/* ── Mobile Executive Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-cyan-800">
              <Sparkles className="h-3 w-3 text-cyan-600" />
              Census Registry
            </span>
            {pendingCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                {pendingCount} Pending
              </span>
            ) : null}
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-950">Households</h1>
        </div>

        {hasPermission('create_household') ? (
          <Button asChild size="sm" className="h-9 rounded-xl bg-cyan-950 px-3 text-xs font-semibold text-white">
            <Link href="/households/register">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Register
            </Link>
          </Button>
        ) : null}
      </div>

      {/* ── Mobile Vitals Strip (Scrollable) ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
        <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
          <Home className="h-3.5 w-3.5 text-cyan-800" />
          <span className="text-slate-500">Total:</span>
          <strong className="font-mono text-slate-900">{isLoading ? '—' : households.length}</strong>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-slate-500">Active:</span>
          <strong className="font-mono text-emerald-900">{isLoading ? '—' : activeCount}</strong>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
          <span className="text-slate-500">Unverified:</span>
          <strong className="font-mono text-rose-900">{isLoading ? '—' : unverifiedCount}</strong>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xs">
          <MapPin className="h-3.5 w-3.5 text-cyan-700" />
          <span className="text-slate-500">GPS:</span>
          <strong className="font-mono text-cyan-900">{isLoading ? '—' : `${pinRate}%`}</strong>
        </div>
      </div>

      {/* ── Search Bar & Filter Sheet Trigger ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search head, address, purok..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-xs text-slate-800 outline-none focus:border-cyan-900"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setFilterSheetOpen(true)}
          className={`h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold ${
            hasFilters ? 'border-cyan-400 bg-cyan-50 text-cyan-950 font-bold' : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filter
          {hasFilters ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-cyan-600" /> : null}
        </Button>
      </div>

      {/* ── Active Filter Badges ── */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-500">
          Showing <strong className="text-slate-900">{filteredHouseholds.length}</strong> of {households.length}
        </span>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setFilterPurok('all');
              setFilterBarangay('all');
              setFilterStatus(DEFAULT_STATUS);
              setFilterHazard('all');
              setFilterRiskLevel('all');
              setFilterFloodProne('all');
              setFilterFloodControlStatus('all');
              setFilterUnverifiedOnly(false);
              setFilterBirthdayThisMonth(false);
              setSortBy('recent');
            }}
            className="text-[11px] font-bold text-rose-600 underline"
          >
            Reset Filters
          </button>
        ) : null}
      </div>

      {/* ── Missing Location Warning ── */}
      {isMissingLocationMode ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-bold">Missing GPS Coordinates</p>
          <p className="mt-0.5 text-[11px]">Showing active households needing verified map pins.</p>
        </div>
      ) : null}

      {/* ── Mobile Filter Sheet ── */}
      <MobileFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        title="Filter Households"
        description="Filter by registration status, purok, or disaster risk exposure."
        resultCount={<span>Showing <strong>{filteredHouseholds.length}</strong> records</span>}
        filters={(
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {statusOptions.map((option) => (
                  <CivicChipButton
                    key={option.key}
                    active={filterStatus === option.key}
                    onClick={() => setFilterStatus(option.key)}
                  >
                    {option.label}
                    <span className="ml-1 text-[10px] font-mono">
                      ({isLoading ? '—' : option.count})
                    </span>
                  </CivicChipButton>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Special Flags</p>
              <div className="flex flex-wrap gap-1.5">
                <CivicChipButton
                  active={filterUnverifiedOnly}
                  onClick={() => setFilterUnverifiedOnly(!filterUnverifiedOnly)}
                >
                  <AlertTriangle className="h-3 w-3 mr-1 text-rose-500" />
                  Unverified Only ({unverifiedCount})
                </CivicChipButton>
                <CivicChipButton
                  active={filterBirthdayThisMonth}
                  onClick={() => setFilterBirthdayThisMonth(!filterBirthdayThisMonth)}
                >
                  <Cake className="h-3 w-3 mr-1 text-teal-600" />
                  Birthdays ({birthdayHouseholdCount})
                </CivicChipButton>
              </div>
            </div>

            {barangays.length > 1 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Barangay</p>
                <Select value={filterBarangay} onValueChange={setFilterBarangay}>
                  <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-white px-3 text-xs">
                    <SelectValue placeholder="All barangays" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Barangays</SelectItem>
                    {barangays.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Purok</p>
              <Select value={filterPurok} onValueChange={setFilterPurok}>
                <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-white px-3 text-xs">
                  <SelectValue placeholder="All puroks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Puroks</SelectItem>
                  {puroks.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Hazard Profile</p>
              <Select value={filterHazard} onValueChange={(v) => setFilterHazard(v as HazardType | 'all')}>
                <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-white px-3 text-xs">
                  <SelectValue placeholder="All hazards" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hazards</SelectItem>
                  {HAZARD_FILTER_OPTIONS.map((h) => (
                    <SelectItem key={h} value={h}>{HAZARD_LABELS[h]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Risk Level</p>
              <Select value={filterRiskLevel} onValueChange={(v) => setFilterRiskLevel(v as DisasterRiskLevel | 'all')}>
                <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-white px-3 text-xs">
                  <SelectValue placeholder="All risk levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  {DISASTER_RISK_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{DISASTER_RISK_LEVEL_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        sort={(
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as HouseholdSort)}>
            <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-white px-3 text-xs">
              <SelectValue placeholder="Most recent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="name">Head Name</SelectItem>
              <SelectItem value="members">Most Members</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      {/* ── Household Dossier Cards (Mobile - Zero Badge Soup) ── */}
      {isLoading ? (
        <div className="space-y-2.5">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filteredHouseholds.length > 0 ? (
        <div className="space-y-2.5">
          {filteredHouseholds.map((household) => {
            const status = STATUS_CFG[household.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.active;
            const registrationStatus = getHouseholdRegistrationStatus(household);
            const residentCount = memberCounts[household.id] || 0;
            const isPinned = hasHouseholdPin(household);
            const hasUnverified = hasUnverifiedMembers[household.id];
            const purokRiskProfile = getPurokRiskProfileForHousehold(household, purokRiskProfileMap);
            const bdays = birthdayMembers[household.id] || [];

            return (
              <Link
                key={household.id}
                href={`/households/${household.id}`}
                className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs active:bg-slate-50 transition"
              >
                {/* Header: Initial, Name, Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-800">
                      {household.head_name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-slate-900 truncate">
                        {household.head_name}
                      </h2>
                      <p className="text-[11px] text-slate-500 truncate">
                        {household.purok_sitio || 'Purok —'} · {household.street_address}
                      </p>
                    </div>
                  </div>

                  {registrationStatus === 'pending' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shrink-0">
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  )}
                </div>

                {/* High-Signal Alerts (NO negative badges) */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {purokRiskProfile?.flood_prone ? (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200">
                      🌊 Flood-Prone
                    </span>
                  ) : null}

                  {household.disaster_risk_level === 'high' ? (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200">
                      ⚠️ High Risk
                    </span>
                  ) : null}

                  {hasUnverified ? (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200">
                      ⚠️ Unverified
                    </span>
                  ) : null}

                  {bdays.length > 0 ? (
                    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200">
                      🎂 Birthday
                    </span>
                  ) : null}
                </div>

                {/* Footer: Resident count + GPS Pin + Open chevron */}
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <span>{residentCount} {residentCount === 1 ? 'resident' : 'residents'}</span>
                    </span>

                    {isPinned ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-800">
                        <CheckCircle2 className="h-3 w-3 text-cyan-600" />
                        Pinned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        No Pin
                      </span>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-0.5 font-bold text-cyan-950">
                    Open
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <CivicEmptyState
          icon={Home}
          title="No households found"
          description={hasFilters ? 'No household matches the current filters.' : 'Household records will appear here after registration.'}
        />
      )}
    </CivicPage>
  );
}

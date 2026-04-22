'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Activity, Filter, Home, Plus, Users } from 'lucide-react';
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
import type { DisasterRiskLevel, HazardType, Household, PurokFloodControlStatus, PurokRiskProfile } from '@/lib/db/schema';
import { formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';
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
  CivicSearchInput,
} from '@/components/ui/civic-primitives';
import { MobileFilterSheet, MobileListCard, MobilePageHeader } from '@/components/mobile/mobile-primitives';

const STATUS_CFG = {
  active: { label: 'Active', tone: 'emerald' as const },
  moved_out: { label: 'Moved out', tone: 'amber' as const },
  deceased: { label: 'Deceased', tone: 'slate' as const },
};

const REGISTRATION_TONE = {
  approved: 'emerald' as const,
  pending: 'amber' as const,
  needs_correction: 'amber' as const,
  rejected: 'rose' as const,
};

const DEFAULT_STATUS = 'active' as const;

type HouseholdFilterStatus = 'all' | 'active' | 'moved_out' | 'deceased';
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
  const [filterStatus, setFilterStatus] = useState<HouseholdFilterStatus>(DEFAULT_STATUS);
  const [filterHazard, setFilterHazard] = useState<HazardType | 'all'>('all');
  const [filterRiskLevel, setFilterRiskLevel] = useState<DisasterRiskLevel | 'all'>('all');
  const [filterFloodProne, setFilterFloodProne] = useState<PurokFloodProneFilter>('all');
  const [filterFloodControlStatus, setFilterFloodControlStatus] = useState<PurokFloodControlStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<HouseholdSort>('recent');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
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
    for (const household of allHouseholds) {
      counts[household.id] = (await getResidentsInHousehold(household.id)).length;
    }
    setMemberCounts(counts);
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

  const filteredHouseholds = households
    .filter((household) => (
      !isMissingLocationMode
      || (
        household.status === 'active'
        && getHouseholdRegistrationStatus(household) === 'approved'
        && !hasHouseholdPin(household)
      )
    ))
    .filter((household) => filterStatus === 'all' || household.status === filterStatus)
    .filter((household) => filterPurok === 'all' || household.purok_sitio === filterPurok)
    .filter((household) => filterHazard === 'all' || parseHazardTags(household.hazard_tags).includes(filterHazard))
    .filter((household) => filterRiskLevel === 'all' || household.disaster_risk_level === filterRiskLevel)
    .filter((household) => matchesPurokRiskFilters(household, purokRiskProfileMap, {
      floodProne: filterFloodProne,
      floodControlStatus: filterFloodControlStatus,
    }))
    .filter((household) => {
      if (!search) {
        return true;
      }

      const query = search.toLowerCase();
      return household.head_name.toLowerCase().includes(query)
        || household.street_address.toLowerCase().includes(query)
        || household.purok_sitio.toLowerCase().includes(query);
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

  const pendingCount = households.filter((household) => getHouseholdRegistrationStatus(household) === 'pending').length;
  const hasFilters = Boolean(search)
    || filterPurok !== 'all'
    || filterStatus !== DEFAULT_STATUS
    || filterHazard !== 'all'
    || filterRiskLevel !== 'all'
    || filterFloodProne !== 'all'
    || filterFloodControlStatus !== 'all'
    || sortBy !== 'recent'
    || isMissingLocationMode;
  const statusOptions = [
    { key: 'all' as const, label: 'All', count: households.length },
    { key: 'active' as const, label: 'Active', count: households.filter((household) => household.status === 'active').length },
    { key: 'moved_out' as const, label: 'Moved', count: households.filter((household) => household.status === 'moved_out').length },
    { key: 'deceased' as const, label: 'Deceased', count: households.filter((household) => household.status === 'deceased').length },
  ];

  return (
    <CivicPage className="space-y-4 px-4 py-4">
      <MobilePageHeader
        title="Households"
        subtitle={isLoading
          ? 'Loading household records...'
          : user.role === 'admin'
            ? `${households.length} records across all barangays.`
            : `${households.length} records in the current barangay roster.`}
        primaryAction={hasPermission('create_household') ? (
          <Button asChild className="h-11 rounded-[18px] px-4 text-sm font-semibold">
            <Link href="/households/register">
              <Plus className="h-4 w-4" />
              Add
            </Link>
          </Button>
        ) : null}
        secondaryActions={pendingCount > 0 ? (
          user.role === 'admin' ? (
            <Link href="/admin/location-review?tab=pending">
              <CivicBadge label={`${pendingCount} pending review`} tone="amber" />
            </Link>
          ) : (
            <CivicBadge label={`${pendingCount} pending review`} tone="amber" />
          )
        ) : null}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <CivicSearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search households, puroks, or addresses..."
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => setFilterSheetOpen(true)}
          className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
        >
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <CivicBadge label={`${filteredHouseholds.length} showing`} tone="slate" />
        {isMissingLocationMode ? <CivicBadge label="Missing coordinates" tone="amber" /> : null}
        {filterStatus !== DEFAULT_STATUS ? <CivicBadge label={STATUS_CFG[filterStatus as keyof typeof STATUS_CFG]?.label || 'All status'} tone="navy" /> : null}
        {filterPurok !== 'all' ? <CivicBadge label={filterPurok} tone="teal" /> : null}
        {filterHazard !== 'all' ? <CivicBadge label={HAZARD_LABELS[filterHazard]} tone="teal" /> : null}
        {filterRiskLevel !== 'all' ? <CivicBadge label={DISASTER_RISK_LEVEL_LABELS[filterRiskLevel]} tone="amber" /> : null}
        {filterFloodProne !== 'all' ? <CivicBadge label={filterFloodProne === 'flood_prone' ? 'Flood-prone puroks' : 'Not flood-prone'} tone="rose" /> : null}
        {filterFloodControlStatus !== 'all' ? <CivicBadge label={PUROK_FLOOD_CONTROL_STATUS_LABELS[filterFloodControlStatus]} tone="slate" /> : null}
        {sortBy !== 'recent' ? <CivicBadge label={sortBy === 'name' ? 'Sorted by name' : 'Sorted by members'} tone="slate" /> : null}
      </div>

      {isMissingLocationMode ? (
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>Showing approved active households that still need a map pin.</p>
          {user.role === 'admin' ? (
            <Link href="/admin/location-review?tab=approved&issue=missing_coordinates" className="mt-2 inline-block text-xs font-semibold text-amber-900 underline underline-offset-4">
              Open review queue
            </Link>
          ) : null}
        </div>
      ) : null}

      <MobileFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        title="Refine households"
        description="Status, purok, and sorting are grouped here so the list stays focused on mobile."
        resultCount={<span>Showing <strong>{filteredHouseholds.length}</strong> of <strong>{households.length}</strong> households</span>}
        filters={(
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</p>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((option) => (
                  <CivicChipButton key={option.key} active={filterStatus === option.key} onClick={() => setFilterStatus(option.key)}>
                    {option.label}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${filterStatus === option.key ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {isLoading ? '--' : option.count}
                    </span>
                  </CivicChipButton>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Purok</p>
              <Select value={filterPurok} onValueChange={setFilterPurok}>
                <SelectTrigger className="h-11 w-full rounded-[18px] border-slate-200 bg-white px-4 text-sm text-slate-700">
                  <SelectValue placeholder="All puroks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All puroks</SelectItem>
                  {puroks.map((purok) => (
                    <SelectItem key={purok} value={purok}>{purok}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Hazard</p>
              <Select value={filterHazard} onValueChange={(value) => setFilterHazard(value as HazardType | 'all')}>
                <SelectTrigger className="h-11 w-full rounded-[18px] border-slate-200 bg-white px-4 text-sm text-slate-700">
                  <SelectValue placeholder="All hazards" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All hazards</SelectItem>
                  {HAZARD_FILTER_OPTIONS.map((hazard) => (
                    <SelectItem key={hazard} value={hazard}>{HAZARD_LABELS[hazard]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Risk level</p>
              <Select value={filterRiskLevel} onValueChange={(value) => setFilterRiskLevel(value as DisasterRiskLevel | 'all')}>
                <SelectTrigger className="h-11 w-full rounded-[18px] border-slate-200 bg-white px-4 text-sm text-slate-700">
                  <SelectValue placeholder="All risk levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All risk levels</SelectItem>
                  {DISASTER_RISK_OPTIONS.map((riskLevel) => (
                    <SelectItem key={riskLevel} value={riskLevel}>{DISASTER_RISK_LEVEL_LABELS[riskLevel]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Flood-prone purok</p>
              <Select value={filterFloodProne} onValueChange={(value) => setFilterFloodProne(value as PurokFloodProneFilter)}>
                <SelectTrigger className="h-11 w-full rounded-[18px] border-slate-200 bg-white px-4 text-sm text-slate-700">
                  <SelectValue placeholder="All puroks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All puroks</SelectItem>
                  <SelectItem value="flood_prone">Flood-prone only</SelectItem>
                  <SelectItem value="not_flood_prone">Not flood-prone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Flood control</p>
              <Select value={filterFloodControlStatus} onValueChange={(value) => setFilterFloodControlStatus(value as PurokFloodControlStatus | 'all')}>
                <SelectTrigger className="h-11 w-full rounded-[18px] border-slate-200 bg-white px-4 text-sm text-slate-700">
                  <SelectValue placeholder="All flood control statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All flood control statuses</SelectItem>
                  {PUROK_FLOOD_CONTROL_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>{PUROK_FLOOD_CONTROL_STATUS_LABELS[status]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasFilters ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setFilterPurok('all');
                  setFilterStatus(DEFAULT_STATUS);
                  setFilterHazard('all');
                  setFilterRiskLevel('all');
                  setFilterFloodProne('all');
                  setFilterFloodControlStatus('all');
                  setSortBy('recent');
                }}
                className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                Clear filters
              </Button>
            ) : null}
          </>
        )}
        sort={(
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as HouseholdSort)}>
            <SelectTrigger className="h-11 w-full rounded-[18px] border-slate-200 bg-white px-4 text-sm text-slate-700">
              <SelectValue placeholder="Most recent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="name">Head name</SelectItem>
              <SelectItem value="members">Most members</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
          ))}
        </div>
      ) : filteredHouseholds.length > 0 ? (
        <div className="space-y-2">
          {filteredHouseholds.map((household) => {
            const status = STATUS_CFG[household.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.active;
            const registrationStatus = getHouseholdRegistrationStatus(household);
            const memberCount = memberCounts[household.id] ?? 0;
            const householdHazards = parseHazardTags(household.hazard_tags);
            const purokRiskProfile = getPurokRiskProfileForHousehold(household, purokRiskProfileMap);
            const locationSummary = user.role === 'admin'
              ? [
                household.barangay_name || household.barangay_id,
                household.purok_sitio,
                household.street_address,
              ].filter(Boolean).join(' | ')
              : `${household.purok_sitio} | ${household.street_address}`;

            return (
              <Link key={household.id} href={`/households/${household.id}`} className="block">
                <MobileListCard
                  title={household.head_name}
                  subtitle={locationSummary}
                  leading={<span className="text-sm font-bold">{household.head_name.charAt(0).toUpperCase()}</span>}
                  trailing={<CivicBadge label={`${memberCount}`} tone="slate" className="text-[10px]" />}
                  status={(
                    <>
                      <CivicBadge label={status.label} tone={status.tone} className="text-[10px]" />
                      <CivicBadge
                        label={formatRegistrationStatusLabel(registrationStatus)}
                        tone={REGISTRATION_TONE[registrationStatus] ?? 'slate'}
                        className="text-[10px]"
                      />
                      <CivicBadge
                        label={DISASTER_RISK_LEVEL_LABELS[household.disaster_risk_level ?? 'medium']}
                        tone={
                          household.disaster_risk_level === 'high'
                            ? 'rose'
                            : household.disaster_risk_level === 'medium'
                              ? 'amber'
                              : 'emerald'
                        }
                        className="text-[10px]"
                      />
                      {hasHouseholdPin(household) ? <CivicBadge label="Pinned" tone="navy" className="text-[10px]" /> : null}
                    </>
                  )}
                  meta={(
                    <div className="space-y-2 text-xs text-slate-500">
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          <span>{memberCount} members</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-slate-400">
                          <Home className="h-3.5 w-3.5" />
                          <span>Open record</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <CivicBadge
                          label={purokRiskProfile?.flood_prone ? 'Flood-prone purok' : 'Not flood-prone'}
                          tone={purokRiskProfile?.flood_prone ? 'rose' : 'emerald'}
                          className="text-[10px]"
                        />
                        <CivicBadge
                          label={PUROK_FLOOD_CONTROL_STATUS_LABELS[purokRiskProfile?.flood_control_status ?? 'unknown']}
                          tone="slate"
                          className="text-[10px]"
                        />
                        {householdHazards.length > 0 ? householdHazards.slice(0, 3).map((hazard) => (
                          <CivicBadge key={hazard} label={HAZARD_LABELS[hazard]} tone="teal" className="text-[10px]" />
                        )) : (
                          <CivicBadge label="No hazard tags" tone="slate" className="text-[10px]" />
                        )}
                        {householdHazards.length > 3 ? (
                          <CivicBadge label={`+${householdHazards.length - 3} more`} tone="slate" className="text-[10px]" />
                        ) : null}
                      </div>
                    </div>
                  )}
                />
              </Link>
            );
          })}
        </div>
      ) : (
        <CivicEmptyState
          icon={Activity}
          title="No households found"
          description={hasFilters ? 'No household matches the current filters.' : 'Household records will appear here after registration.'}
        />
      )}
    </CivicPage>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Activity, Home, Plus, Users, X } from 'lucide-react';
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
  CivicHero,
  CivicKpiCard,
  CivicPage,
  CivicPanel,
  CivicSearchInput,
  CivicSectionHeading,
} from '@/components/ui/civic-primitives';

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
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'moved_out' | 'deceased'>('active');
  const [filterHazard, setFilterHazard] = useState<HazardType | 'all'>('all');
  const [filterRiskLevel, setFilterRiskLevel] = useState<DisasterRiskLevel | 'all'>('all');
  const [filterFloodProne, setFilterFloodProne] = useState<PurokFloodProneFilter>('all');
  const [filterFloodControlStatus, setFilterFloodControlStatus] = useState<PurokFloodControlStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const issueFilter = searchParams.get('issue');
  const isMissingLocationMode = issueFilter === 'missing_location';
  const purokRiskProfileMap = useMemo(
    () => buildPurokRiskProfileMap(purokRiskProfiles),
    [purokRiskProfiles],
  );

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

  const filtered = useMemo(() => {
    let result = households;
    if (isMissingLocationMode) {
      result = result.filter((household) => (
        household.status === 'active'
        && getHouseholdRegistrationStatus(household) === 'approved'
        && !hasHouseholdPin(household)
      ));
    }
    if (filterStatus !== 'all') result = result.filter((household) => household.status === filterStatus);
    if (filterPurok !== 'all') result = result.filter((household) => household.purok_sitio === filterPurok);
    if (filterHazard !== 'all') {
      result = result.filter((household) => parseHazardTags(household.hazard_tags).includes(filterHazard));
    }
    if (filterRiskLevel !== 'all') {
      result = result.filter((household) => household.disaster_risk_level === filterRiskLevel);
    }
    result = result.filter((household) => matchesPurokRiskFilters(household, purokRiskProfileMap, {
      floodProne: filterFloodProne,
      floodControlStatus: filterFloodControlStatus,
    }));
    if (search) {
      const query = search.toLowerCase();
      result = result.filter((household) =>
        household.head_name.toLowerCase().includes(query)
        || household.street_address.toLowerCase().includes(query)
        || household.id.toLowerCase().includes(query),
      );
    }

    return result;
  }, [filterFloodControlStatus, filterFloodProne, filterHazard, filterPurok, filterRiskLevel, filterStatus, households, isMissingLocationMode, purokRiskProfileMap, search]);

  if (!user) return null;

  const activeCount = households.filter((household) => household.status === 'active').length;
  const movedCount = households.filter((household) => household.status === 'moved_out').length;
  const pendingCount = households.filter((household) => getHouseholdRegistrationStatus(household) === 'pending').length;
  const deceasedCount = households.filter((household) => household.status === 'deceased').length;
  const hasFilters = Boolean(search)
    || filterPurok !== 'all'
    || filterStatus !== 'all'
    || filterHazard !== 'all'
    || filterRiskLevel !== 'all'
    || filterFloodProne !== 'all'
    || filterFloodControlStatus !== 'all'
    || isMissingLocationMode;

  return (
    <CivicPage className="space-y-6">
      <CivicHero
        eyebrow="Census Records"
        title="Households"
        description={isLoading
          ? 'Loading household records...'
          : user.role === 'admin'
            ? `${households.length} records tracked across all barangays.`
            : `${households.length} records tracked in ${user.barangay_id}.`}
        aside={pendingCount > 0 ? (
          user.role === 'admin' ? (
            <Link href="/admin/location-review?tab=pending">
              <CivicBadge label={`${pendingCount} pending review`} tone="amber" />
            </Link>
          ) : (
            <CivicBadge label={`${pendingCount} pending review`} tone="amber" />
          )
        ) : null}
      />

      {isMissingLocationMode ? (
        <CivicPanel className="border-amber-200 bg-amber-50/90">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-amber-900">Data Quality Filter: Missing Coordinates</p>
              <p className="mt-1 text-xs text-amber-800">
                Showing approved active households that still need a usable map pin.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {user.role === 'admin' ? (
                <Link href="/admin/location-review?tab=approved&issue=missing_coordinates" className="text-xs font-semibold text-amber-900 underline underline-offset-4">
                  Open review queue
                </Link>
              ) : null}
              <Link href="/households" className="text-xs font-semibold text-amber-900 underline underline-offset-4">
                Show all households
              </Link>
            </div>
          </div>
        </CivicPanel>
      ) : null}

      <div className="grid grid-cols-4 gap-4">
        <CivicKpiCard icon={Home} label="Total households" value={isLoading ? '—' : households.length} tone="navy" />
        <CivicKpiCard icon={Home} label="Active" value={isLoading ? '—' : activeCount} tone="emerald" />
        <CivicKpiCard icon={Users} label="Moved out" value={isLoading ? '—' : movedCount} tone="amber" />
        <CivicKpiCard icon={Activity} label="Pending review" value={isLoading ? '—' : pendingCount} tone="rose" />
      </div>

      <CivicPanel>
        <CivicSectionHeading
          icon={Home}
          title="Filters"
          description="Search household heads, narrow to a purok, and focus by status, hazard, or disaster risk level."
          action={hasPermission('create_household') ? (
            <Link
              href="/households/register"
              className="inline-flex items-center gap-2 rounded-full bg-cyan-950 px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              New registration
            </Link>
          ) : null}
        />
        <div className="mt-5 flex gap-3">
          <CivicSearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by household head, address, or ID..."
            className="flex-1"
          />
          {puroks.length > 0 ? (
            <select
              value={filterPurok}
              onChange={(event) => setFilterPurok(event.target.value)}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
            >
              <option value="all">All puroks</option>
              {puroks.map((purok) => (
                <option key={purok} value={purok}>{purok}</option>
              ))}
            </select>
          ) : null}
          <select
            value={filterHazard}
            onChange={(event) => setFilterHazard(event.target.value as HazardType | 'all')}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
          >
            <option value="all">All hazards</option>
            {HAZARD_FILTER_OPTIONS.map((hazard) => (
              <option key={hazard} value={hazard}>{HAZARD_LABELS[hazard]}</option>
            ))}
          </select>
          <select
            value={filterRiskLevel}
            onChange={(event) => setFilterRiskLevel(event.target.value as DisasterRiskLevel | 'all')}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
          >
            <option value="all">All risk levels</option>
            {DISASTER_RISK_OPTIONS.map((riskLevel) => (
              <option key={riskLevel} value={riskLevel}>{DISASTER_RISK_LEVEL_LABELS[riskLevel]}</option>
            ))}
          </select>
          <select
            value={filterFloodProne}
            onChange={(event) => setFilterFloodProne(event.target.value as PurokFloodProneFilter)}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
          >
            <option value="all">All purok flood flags</option>
            <option value="flood_prone">Flood-prone puroks</option>
            <option value="not_flood_prone">Not flood-prone</option>
          </select>
          <select
            value={filterFloodControlStatus}
            onChange={(event) => setFilterFloodControlStatus(event.target.value as PurokFloodControlStatus | 'all')}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-cyan-900"
          >
            <option value="all">All flood control</option>
            {PUROK_FLOOD_CONTROL_OPTIONS.map((status) => (
              <option key={status} value={status}>{PUROK_FLOOD_CONTROL_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { key: 'all' as const, label: 'All', count: households.length },
            { key: 'active' as const, label: 'Active', count: activeCount },
            { key: 'moved_out' as const, label: 'Moved out', count: movedCount },
            { key: 'deceased' as const, label: 'Deceased', count: deceasedCount },
          ].map((tab) => (
            <CivicChipButton key={tab.key} active={filterStatus === tab.key} onClick={() => setFilterStatus(tab.key)}>
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${filterStatus === tab.key ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {isLoading ? '—' : tab.count}
              </span>
            </CivicChipButton>
          ))}
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilterPurok('all');
                setFilterStatus('all');
                setFilterHazard('all');
                setFilterRiskLevel('all');
                setFilterFloodProne('all');
                setFilterFloodControlStatus('all');
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          ) : null}
        </div>
      </CivicPanel>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((household) => {
            const status = STATUS_CFG[household.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.active;
            const registrationStatus = getHouseholdRegistrationStatus(household);
            const householdHazards = parseHazardTags(household.hazard_tags);
            const purokRiskProfile = getPurokRiskProfileForHousehold(household, purokRiskProfileMap);
            const locationSummary = user.role === 'admin'
              ? [
                household.barangay_name || household.barangay_id,
                household.street_address,
                household.purok_sitio,
              ].filter(Boolean).join(' · ')
              : `${household.street_address} · ${household.purok_sitio}`;
            return (
              <Link
                key={household.id}
                href={`/households/${household.id}`}
                className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.24)] transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-slate-100 text-sm font-bold text-slate-800">
                      {household.head_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{household.head_name}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{locationSummary}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
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
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <CivicBadge
                          label={purokRiskProfile?.flood_prone ? 'Flood-prone purok' : 'Not flood-prone'}
                          tone={purokRiskProfile?.flood_prone ? 'rose' : 'emerald'}
                          className="text-[10px]"
                        />
                        <CivicBadge
                          label={PUROK_FLOOD_CONTROL_STATUS_LABELS[purokRiskProfile?.flood_control_status ?? 'unknown']}
                          tone={
                            purokRiskProfile?.flood_control_status === 'protected'
                              ? 'emerald'
                              : purokRiskProfile?.flood_control_status === 'partial'
                                ? 'amber'
                                : purokRiskProfile?.flood_control_status === 'none'
                                  ? 'rose'
                                  : 'slate'
                          }
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
                  </div>
                  <CivicBadge label={`${memberCounts[household.id] || 0} residents`} tone="slate" className="text-[10px]" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <CivicEmptyState
          icon={Activity}
          title="No households found"
          description={hasFilters ? 'No record matches the current filters.' : 'Create the first household registration to populate this list.'}
        />
      )}
    </CivicPage>
  );
}

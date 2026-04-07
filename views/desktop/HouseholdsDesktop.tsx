'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, Home, MapPin, Plus, Users, X } from 'lucide-react';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getAllPuroks, getHouseholds } from '@/lib/db/households';
import { getResidentsInHousehold } from '@/lib/db/residents';
import type { Household } from '@/lib/db/schema';
import { formatRegistrationStatusLabel, getHouseholdRegistrationStatus } from '@/lib/household-registration';
import { hasHouseholdPin } from '@/lib/map-pins';
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

export default function HouseholdsDesktop() {
  const router = useRouter();
  const user = getCurrentUser();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [filtered, setFiltered] = useState<Household[]>([]);
  const [puroks, setPuroks] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterPurok, setFilterPurok] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'moved_out' | 'deceased'>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  const loadHouseholdsData = useCallback(async (background = false) => {
    if (!user || !hasPermission('view_households')) {
      router.push('/dashboard');
      return;
    }

    if (!background) {
      setIsLoading(true);
    }

    const allHouseholds = user.role === 'admin'
      ? await getHouseholds()
      : await getHouseholds({ barangay_id: user.barangay_id });
    setHouseholds(allHouseholds);
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
    void loadHouseholdsData();
  }, [loadHouseholdsData]);

  useEffect(() => {
    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (!['households', 'residents'].includes(event.detail.table)) {
        return;
      }

      void loadHouseholdsData(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => window.removeEventListener('mswdo-data-changed', handleDataChanged);
  }, [loadHouseholdsData]);

  useEffect(() => {
    let result = households;
    if (filterStatus !== 'all') result = result.filter((household) => household.status === filterStatus);
    if (filterPurok !== 'all') result = result.filter((household) => household.purok_sitio === filterPurok);
    if (search) {
      const query = search.toLowerCase();
      result = result.filter((household) =>
        household.head_name.toLowerCase().includes(query)
        || household.street_address.toLowerCase().includes(query)
        || household.id.toLowerCase().includes(query),
      );
    }
    setFiltered(result);
  }, [households, search, filterPurok, filterStatus]);

  if (!user) return null;

  const activeCount = households.filter((household) => household.status === 'active').length;
  const movedCount = households.filter((household) => household.status === 'moved_out').length;
  const pendingCount = households.filter((household) => getHouseholdRegistrationStatus(household) === 'pending').length;
  const deceasedCount = households.filter((household) => household.status === 'deceased').length;
  const hasFilters = search || filterPurok !== 'all' || filterStatus !== 'all';

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
        aside={pendingCount > 0 ? <CivicBadge label={`${pendingCount} pending review`} tone="amber" /> : null}
      />

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
          description="Search household heads, narrow to a purok, and focus by status."
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
                        {hasHouseholdPin(household) ? <CivicBadge label="Pinned" tone="navy" className="text-[10px]" /> : null}
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

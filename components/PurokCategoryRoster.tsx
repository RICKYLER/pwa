'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import type { FollowUpStatus, Resident, VulnerabilityFlags } from '@/lib/db/schema';
import type { PurokPriorityGroup } from '@/lib/responder-priorities';
import { updateHealthFlags } from '@/lib/db/residents';
import { calculateAge, hasValidResidentBirthdate } from '@/lib/db/vulnerability';
import {
  DISTRIBUTION_CATEGORY_KEYS,
  DISTRIBUTION_CATEGORY_LABELS,
  getResidentCategories,
  type DistributionCategory,
} from '@/lib/distribution-audience';
import { CivicBadge } from '@/components/ui/civic-primitives';

/**
 * Per-purok resident roster by vulnerability category. Clicking a category
 * chip (PWD, Senior, …) expands the named residents in that category, in
 * household-priority order, each with its persisted follow-up status
 * (needs_visit → visited → referred → resolved) stored on the resident's
 * vulnerability flags via `updateHealthFlags`.
 *
 * Everything here is deterministic engine data rendered locally — nothing in
 * this panel is sent to any AI service.
 */

const FOLLOW_UP_STATUSES: { value: FollowUpStatus; label: string; tone: 'slate' | 'amber' | 'teal' | 'navy' | 'emerald'; action: string }[] = [
  { value: 'none', label: 'No follow-up yet', tone: 'slate', action: 'Clear' },
  { value: 'needs_visit', label: 'Needs visit', tone: 'amber', action: 'Needs visit' },
  { value: 'visited', label: 'Visited', tone: 'teal', action: 'Visited' },
  { value: 'referred', label: 'Referred', tone: 'navy', action: 'Referred' },
  { value: 'resolved', label: 'Resolved', tone: 'emerald', action: 'Resolved' },
];

function followUpConfig(status: FollowUpStatus | undefined) {
  return FOLLOW_UP_STATUSES.find((entry) => entry.value === (status ?? 'none')) ?? FOLLOW_UP_STATUSES[0];
}

function formatUpdatedStamp(date: Date | undefined) {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return `Updated ${parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function PurokCategoryRoster({
  group,
  residents,
  flags,
}: {
  group: PurokPriorityGroup;
  residents: Resident[];
  flags: VulnerabilityFlags[];
}) {
  const [openCategory, setOpenCategory] = useState<DistributionCategory | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [errorByResidentId, setErrorByResidentId] = useState<Record<string, string>>({});

  const flagsByResidentId = useMemo(
    () => new Map(flags.map((flag) => [flag.resident_id, flag])),
    [flags],
  );

  const householdOrderByid = useMemo(() => {
    const order = new Map<string, number>();
    group.households.forEach((priority, index) => {
      if (!order.has(priority.household.id)) order.set(priority.household.id, index);
    });
    return order;
  }, [group.households]);

  const householdById = useMemo(
    () => new Map(group.households.map((priority) => [priority.household.id, priority.household])),
    [group.households],
  );

  const purokResidents = useMemo(
    () => residents.filter((resident) =>
      resident.status === 'active' && householdById.has(resident.household_id),
    ),
    [residents, householdById],
  );

  const residentsByCategory = useMemo(() => {
    const byCategory = new Map<DistributionCategory, { resident: Resident; flags?: VulnerabilityFlags; order: number }[]>();
    for (const key of DISTRIBUTION_CATEGORY_KEYS) {
      byCategory.set(key, []);
    }
    for (const resident of purokResidents) {
      const residentFlags = flagsByResidentId.get(resident.id);
      const order = householdOrderByid.get(resident.household_id) ?? Number.MAX_SAFE_INTEGER;
      for (const category of getResidentCategories(resident, residentFlags)) {
        byCategory.get(category)?.push({ resident, flags: residentFlags, order });
      }
    }
    for (const entries of byCategory.values()) {
      entries.sort((left, right) => {
        if (left.order !== right.order) return left.order - right.order;
        return left.resident.full_name.localeCompare(right.resident.full_name);
      });
    }
    return byCategory;
  }, [purokResidents, flagsByResidentId, householdOrderByid]);

  const presentCategories = DISTRIBUTION_CATEGORY_KEYS.filter(
    (key) => (residentsByCategory.get(key)?.length ?? 0) > 0,
  );

  if (presentCategories.length === 0) {
    return null;
  }

  const setFollowUpStatus = async (residentId: string, status: FollowUpStatus) => {
    setPendingIds((current) => new Set(current).add(residentId));
    setErrorByResidentId((current) => {
      const next = { ...current };
      delete next[residentId];
      return next;
    });
    try {
      await updateHealthFlags(residentId, { follow_up_status: status });
    } catch {
      setErrorByResidentId((current) => ({
        ...current,
        [residentId]: 'Could not save — check your connection and try again.',
      }));
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(residentId);
        return next;
      });
    }
  };

  const toggleCategory = (key: DistributionCategory) => {
    setOpenCategory((current) => (current === key ? null : key));
  };

  return (
    <div className="mt-3 rounded-[18px] border border-slate-100 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
        Residents by category — click to list names
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presentCategories.map((key) => {
          const count = residentsByCategory.get(key)?.length ?? 0;
          const isOpen = openCategory === key;
          return (
            <button
              key={key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleCategory(key);
              }}
              aria-expanded={isOpen}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                isOpen
                  ? 'border-cyan-900 bg-cyan-950 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {DISTRIBUTION_CATEGORY_LABELS[key]} · {count}
              <ChevronDown
                className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {openCategory ? (() => {
        const entries = residentsByCategory.get(openCategory) ?? [];
        return (
          <div className="mt-3 space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {DISTRIBUTION_CATEGORY_LABELS[openCategory]} — assist in this order
            </p>
            {entries.map(({ resident, flags: residentFlags, order }) => {
              const config = followUpConfig(residentFlags?.follow_up_status);
              const pending = pendingIds.has(resident.id);
              const household = householdById.get(resident.household_id);
              const age = hasValidResidentBirthdate(resident.birthdate)
                ? calculateAge(resident.birthdate)
                : null;
              const updatedStamp = formatUpdatedStamp(residentFlags?.updatedAt);
              return (
                <div
                  key={`${resident.id}-${order}`}
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">
                        {resident.full_name}{age !== null ? `, ${age}` : ''}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {household ? `${household.head_name} household` : ''}
                        {household?.street_address ? ` · ${household.street_address}` : ''}
                      </p>
                    </div>
                    <CivicBadge label={config.label} tone={config.tone} className="text-[10px]" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {FOLLOW_UP_STATUSES.filter((entry) => entry.value !== 'none').map((entry) => {
                      const isActive = (residentFlags?.follow_up_status ?? 'none') === entry.value;
                      return (
                        <button
                          key={entry.value}
                          type="button"
                          disabled={pending || !residentFlags}
                          onClick={(event) => {
                            event.stopPropagation();
                            void setFollowUpStatus(resident.id, entry.value);
                          }}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            isActive
                              ? 'bg-cyan-950 text-white'
                              : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {entry.action}
                        </button>
                      );
                    })}
                    {updatedStamp ? (
                      <span className="text-[10px] text-slate-400">{updatedStamp}</span>
                    ) : null}
                  </div>
                  {errorByResidentId[resident.id] ? (
                    <p className="mt-1.5 text-[11px] text-red-600" role="alert">{errorByResidentId[resident.id]}</p>
                  ) : null}
                  {!residentFlags ? (
                    <p className="mt-1.5 text-[11px] text-slate-400">No health flags record yet — a health worker must encode this resident first.</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })() : null}
    </div>
  );
}

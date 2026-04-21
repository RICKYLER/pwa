'use client';

import { ShieldAlert, Waves, Wind } from 'lucide-react';
import type { Household, PurokRiskProfile } from '@/lib/db/schema';
import { buildHouseholdPurokRiskSummary } from '@/lib/purok-risk-profiles';
import { CivicBadge } from '@/components/ui/civic-primitives';
import { cn } from '@/lib/utils';

export function PurokFloodProfileCard(props: {
  household: Pick<Household, 'barangay_id' | 'purok_sitio' | 'evacuation_site'>;
  profile?: PurokRiskProfile | null;
  className?: string;
  title?: string;
  description?: string;
}) {
  const summary = buildHouseholdPurokRiskSummary(props.household, props.profile);

  return (
    <div className={cn('rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4', props.className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-cyan-700" />
            <p className="text-sm font-semibold text-slate-900">{props.title ?? 'Purok Flood Profile'}</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {props.description ?? `Official flood guidance for ${summary.purokSitio}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CivicBadge
            label={summary.floodProne ? 'Flood-prone purok' : 'Not marked flood-prone'}
            tone={summary.floodProne ? 'rose' : 'emerald'}
          />
          <CivicBadge
            label={summary.floodControlLabel}
            tone={
              summary.floodControlStatus === 'protected'
                ? 'emerald'
                : summary.floodControlStatus === 'partial'
                  ? 'amber'
                  : summary.floodControlStatus === 'none'
                    ? 'rose'
                    : 'slate'
            }
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[20px] border border-white bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Waves className="h-4 w-4" />
            Evacuation Guidance
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {summary.defaultEvacuationSite || 'No default evacuation site recorded'}
          </p>
          {summary.householdEvacuationSite ? (
            <p className="mt-1 text-xs text-slate-500">
              Household override: {summary.householdEvacuationSite}
            </p>
          ) : null}
        </div>

        <div className="rounded-[20px] border border-white bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Wind className="h-4 w-4" />
            Status Notes
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {summary.warningNotes || summary.floodControlNotes || 'No purok warning notes recorded'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.updatedAt
              ? `Updated ${new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(summary.updatedAt)}`
              : 'Waiting for an admin purok profile update'}
          </p>
        </div>
      </div>
    </div>
  );
}

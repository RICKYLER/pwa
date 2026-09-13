'use client';

import { HeartHandshake, MapPin, Navigation, ShieldAlert } from 'lucide-react';
import { CivicBadge, CivicPanel, CivicSectionHeading } from '@/components/ui/civic-primitives';
import {
  DISTRIBUTION_CATEGORY_KEYS,
  DISTRIBUTION_CATEGORY_LABELS,
  DISTRIBUTION_CATEGORY_TONES,
} from '@/lib/distribution-audience';
import { getVulnerabilityPriorityLabels } from '@/lib/responder-priorities';
import type { Household } from '@/lib/db/schema';
import type { IncidentImpactAnalysis } from '@/lib/incident-impact';

export function IncidentImpactSummary({ analysis }: { analysis: IncidentImpactAnalysis | null | undefined }) {
  if (!analysis || analysis.matchStrategy === 'none' || analysis.affectedResidentCount === 0) {
    return null;
  }

  const firstHousehold = analysis.queue[0];

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <CivicBadge label={`${analysis.affectedResidentCount} residents`} tone="navy" className="text-[10px]" />
      <CivicBadge label={`${analysis.affectedHouseholdCount} households`} tone="slate" className="text-[10px]" />
      {DISTRIBUTION_CATEGORY_KEYS
        .filter((category) => analysis.categoryCounts[category] > 0)
        .map((category) => (
          <CivicBadge
            key={category}
            label={`${analysis.categoryCounts[category]} ${DISTRIBUTION_CATEGORY_LABELS[category]}`}
            tone={DISTRIBUTION_CATEGORY_TONES[category]}
            className="text-[10px]"
          />
        ))}
      {firstHousehold ? (
        <span className="text-[11px] font-semibold text-cyan-900">
          Unahon: {firstHousehold.household.head_name}
        </span>
      ) : null}
    </div>
  );
}

export default function IncidentImpactPanel({
  analysis,
  visitedHouseholdIds,
  onNavigateHousehold,
  onCheckIn,
  compact = false,
}: {
  analysis: IncidentImpactAnalysis | null | undefined;
  visitedHouseholdIds?: Set<string>;
  onNavigateHousehold?: (household: Household) => void;
  onCheckIn?: (householdId: string) => void;
  compact?: boolean;
}) {
  if (!analysis) return null;

  if (analysis.matchStrategy === 'none' || analysis.affectedResidentCount === 0) {
    return (
      <CivicPanel className={compact ? 'space-y-2' : 'space-y-3'}>
        <CivicSectionHeading
          icon={ShieldAlert}
          title="Impact analysis unavailable"
          description={analysis.matchNote}
        />
      </CivicPanel>
    );
  }

  const visited = visitedHouseholdIds ?? new Set<string>();
  return (
    <CivicPanel className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex items-start justify-between gap-3">
        <CivicSectionHeading
          icon={HeartHandshake}
          title="Who needs help first"
          description={analysis.matchNote}
        />
        <CivicBadge
          label={analysis.affectedPuroks.length === 1
            ? `${analysis.affectedPuroks[0].barangayLabel} · ${analysis.affectedPuroks[0].purokSitio}`
            : `${analysis.affectedPuroks.length} puroks affected`}
          tone="navy"
          className="text-[10px]"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-center">
          <p className="text-lg font-black text-slate-950">{analysis.affectedResidentCount}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Residents</p>
        </div>
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-center">
          <p className="text-lg font-black text-slate-950">{analysis.affectedHouseholdCount}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Households</p>
        </div>
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-2 text-center">
          <p className="text-lg font-black text-rose-700">{analysis.vulnerableResidentCount}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-400">Vulnerable</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DISTRIBUTION_CATEGORY_KEYS
          .filter((category) => analysis.categoryCounts[category] > 0)
          .map((category) => (
            <CivicBadge
              key={category}
              label={`${analysis.categoryCounts[category]} ${DISTRIBUTION_CATEGORY_LABELS[category]}`}
              tone={DISTRIBUTION_CATEGORY_TONES[category]}
              className="text-[10px]"
            />
          ))}
      </div>

      {analysis.evacuationSite ? (
        <div className="flex items-center gap-2 rounded-[18px] border border-cyan-200 bg-cyan-50/60 px-3 py-2 text-xs font-semibold text-cyan-900">
          <MapPin className="h-4 w-4 shrink-0" />
          <span>Evacuation: {analysis.evacuationSite}</span>
        </div>
      ) : null}

      {analysis.queue.length > 0 ? (
        <div className="space-y-2 rounded-[18px] border border-slate-100 bg-slate-50/70 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Tabangi una (assist first)</p>
          {analysis.queue.map((queuedHousehold, householdIndex) => {
            const tags = getVulnerabilityPriorityLabels(queuedHousehold.flags);
            const isVisited = visited.has(queuedHousehold.household.id);
            return (
              <div
                key={queuedHousehold.household.id}
                className={`rounded-2xl border px-3 py-3 ${isVisited ? 'border-emerald-200 bg-emerald-50' : 'border-white bg-white'}`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-black text-slate-500">
                    {householdIndex + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-950">{queuedHousehold.household.head_name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{queuedHousehold.household.street_address}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <CivicBadge key={tag} label={tag} tone="rose" className="text-[10px]" />
                      ))}
                      <CivicBadge label={`Score ${queuedHousehold.score}`} tone="amber" className="text-[10px]" />
                      {isVisited ? <CivicBadge label="Visited" tone="emerald" className="text-[10px]" /> : null}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {onNavigateHousehold ? (
                    <button
                      type="button"
                      onClick={() => onNavigateHousehold(queuedHousehold.household)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Navigation className="h-3 w-3" />
                        Navigate
                      </span>
                    </button>
                  ) : null}
                  {onCheckIn ? (
                    <button
                      type="button"
                      onClick={() => onCheckIn(queuedHousehold.household.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        isVisited
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {isVisited ? 'Checked in' : 'Mark check-in'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </CivicPanel>
  );
}

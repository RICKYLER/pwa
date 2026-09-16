'use client';

import { useMemo, useState } from 'react';
import { ListOrdered, Navigation, Users, Zap } from 'lucide-react';
import type { DisasterAlert, Household, Incident } from '@/lib/db/schema';
import { getVulnerabilityPriorityLabels, incidentMatchesPurok, type PurokPriorityGroup } from '@/lib/responder-priorities';
import { buildAIBriefPayload, type AIBriefTriggerSource } from '@/lib/ai-brief';
import {
  DISTRIBUTION_CATEGORY_LABELS,
  type DistributionCategory,
} from '@/lib/distribution-audience';
import { CivicBadge } from '@/components/ui/civic-primitives';
import AIAnalysisBubble from '@/components/AIAnalysisBubble';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Trigger-scoped analysis — the responder's entry point is a trigger on the
 * field map (an incident pin or an alert-rule "!" trigger zone) or an incident
 * card, not the abstract ranking. Selecting the trigger shows the puroks
 * within its scope (engine-matched), their vulnerable-resident composition at
 * purok level (never per-person), and an AI analysis of the affected area.
 * Incident triggers only render for unresolved flood-related incidents — the
 * hazard the priority engine scores.
 */

const CATEGORY_COLORS: Record<DistributionCategory, string> = {
  senior: '#2a78d6',
  pwd: '#eb6834',
  pregnant: '#1baf7a',
  minor: '#eda100',
  low_income: '#e87ba4',
};

const CATEGORY_ORDER: DistributionCategory[] = ['senior', 'pwd', 'pregnant', 'minor', 'low_income'];

const LEVEL_TONES = {
  critical: 'rose',
  high: 'amber',
  medium: 'navy',
  low: 'slate',
} as const;

/** Households shown before the "show all" expander kicks in. */
const QUEUE_PREVIEW_COUNT = 6;

export function isTriggerAnalyzableIncident(
  incident: Incident | null | undefined,
): incident is Incident {
  // Early return keeps the null handling unambiguous for the minifier and
  // for stale dev-server snapshots: nothing below runs for a null incident.
  if (incident == null) return false;
  return incident.status !== 'resolved'
    && (incident.type === 'flood' || incident.hazard_context === 'flood');
}

/** Puroks matched to an incident trigger by the engine's location matching. */
export function useIncidentScopedGroups(
  incident: Incident | null,
  groups: PurokPriorityGroup[],
) {
  return useMemo(
    () => incident
      ? groups
        .filter((group) => incidentMatchesPurok(incident, group.barangayLabel, group.purokSitio))
        .sort((left, right) => right.score - left.score)
      : [],
    [incident, groups],
  );
}

/**
 * The trigger analysis body, renderable inline (map side panel next to the
 * selected trigger pin or zone) or inside the incident-card dialog. The AI
 * analysis auto-runs: selecting a trigger should surface the recommendation
 * immediately, not wait for another click.
 */
export function TriggerAnalysisBody({
  trigger,
  scopedGroups,
  incidents,
  alerts,
  onNavigateHousehold,
}: {
  trigger: AIBriefTriggerSource;
  scopedGroups: PurokPriorityGroup[];
  incidents: Incident[];
  alerts: DisasterAlert[];
  /** Opens the external map for one queued household (map panel passes this in). */
  onNavigateHousehold?: (household: Household) => void;
}) {
  const [queueExpanded, setQueueExpanded] = useState(false);

  const payload = useMemo(
    () => buildAIBriefPayload({
      groups: scopedGroups,
      incidents,
      alerts,
      mode: 'trigger',
      trigger,
    }),
    [scopedGroups, incidents, alerts, trigger],
  );

  // The assist-first queue: every household in the trigger's scope, ranked by
  // the engine's household score — no household-pin clicking needed. Display
  // only; names stay in-app and never reach the AI payload.
  const queue = useMemo(
    () => scopedGroups
      .flatMap((group) => group.households.map((entry) => ({ ...entry, purokSitio: group.purokSitio })))
      .sort((left, right) =>
        right.score - left.score
        || left.household.head_name.localeCompare(right.household.head_name, undefined, { numeric: true })),
    [scopedGroups],
  );
  const visibleQueue = queueExpanded ? queue : queue.slice(0, QUEUE_PREVIEW_COUNT);

  // Bar scale: the largest vulnerable-resident total among the scoped puroks.
  const maxChartTotal = useMemo(
    () => Math.max(
      1,
      ...scopedGroups.map((group) =>
        CATEGORY_ORDER.reduce((sum, key) => sum + group.categoryCounts[key], 0)),
    ),
    [scopedGroups],
  );

  const resetKey = `trigger:${trigger.type}:${trigger.location}:${trigger.status}`;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <CivicBadge label={trigger.severity.toUpperCase()} tone={LEVEL_TONES[trigger.severity as keyof typeof LEVEL_TONES] ?? 'slate'} className="text-[10px]" />
        <CivicBadge label={trigger.type.replaceAll('_', ' ').toUpperCase()} tone="navy" className="text-[10px]" />
        <CivicBadge label={trigger.status.toUpperCase()} tone="teal" className="text-[10px]" />
      </div>

      <p className="text-xs leading-relaxed text-slate-500">{trigger.description}</p>

      {queue.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-800">
            <ListOrdered className="h-3.5 w-3.5" aria-hidden />
            Kinsay una tabangan — {queue.length} {queue.length === 1 ? 'household' : 'households'} in scope
          </p>
          {visibleQueue.map((entry, index) => {
            const tags = getVulnerabilityPriorityLabels(entry.flags);
            return (
              <div key={entry.household.id} className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[11px] font-black ${
                    index === 0 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-950">
                      {entry.household.head_name}
                      {index === 0 ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">Unahon</span> : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {entry.purokSitio}
                      {entry.household.street_address ? ` · ${entry.household.street_address}` : ''}
                    </p>
                    {tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tags.map((tag) => (
                          <CivicBadge key={tag} label={tag} tone="rose" className="text-[10px]" />
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <CivicBadge label={`Score ${entry.score}`} tone="amber" className="text-[10px]" />
                      <CivicBadge label={`${entry.residents.length} ${entry.residents.length === 1 ? 'resident' : 'residents'}`} tone="slate" className="text-[10px]" />
                    </div>
                  </div>
                  {onNavigateHousehold ? (
                    <button
                      type="button"
                      onClick={() => onNavigateHousehold(entry.household)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <Navigation className="h-3 w-3" aria-hidden />
                      Navigate
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {queue.length > QUEUE_PREVIEW_COUNT ? (
            <button
              type="button"
              onClick={() => setQueueExpanded((value) => !value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-cyan-900 transition hover:bg-cyan-50"
            >
              {queueExpanded ? 'Show fewer households' : `Show all ${queue.length} households`}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
          <Users className="h-3.5 w-3.5" aria-hidden />
          Affected puroks — vulnerable residents per purok
        </p>
        {scopedGroups.length === 0 ? (
          <p className="text-xs text-slate-400">
            No registered households matched this trigger&apos;s location. Update the incident location or alert-rule scope to include the purok or barangay name.
          </p>
        ) : (
          <>
            {/* Legend — 5 series, fixed order; identity is never color-alone. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
              {CATEGORY_ORDER.map((key) => (
                <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-[3px]"
                    style={{ backgroundColor: CATEGORY_COLORS[key] }}
                    aria-hidden
                  />
                  {DISTRIBUTION_CATEGORY_LABELS[key]}
                </span>
              ))}
            </div>

            {/* Stacked bars — same visual language as the priority analytics
                chart, scoped to this trigger's puroks. Segment titles carry
                the exact counts (hover). */}
            <div className="space-y-1">
              {scopedGroups.map((group) => {
                const total = CATEGORY_ORDER.reduce((sum, key) => sum + group.categoryCounts[key], 0);
                return (
                  <div key={group.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                    <span className="w-28 shrink-0 truncate text-[11px] font-semibold text-slate-600" title={group.purokSitio}>
                      {group.purokSitio}
                    </span>
                    <span className="flex h-5 min-w-0 flex-1 items-center" aria-hidden>
                      {total === 0 ? (
                        <span className="text-[11px] italic text-slate-400">No flagged residents</span>
                      ) : (
                        CATEGORY_ORDER
                          .filter((key) => group.categoryCounts[key] > 0)
                          .map((key, index, visible) => (
                            <span
                              key={key}
                              title={`${group.categoryCounts[key]} ${DISTRIBUTION_CATEGORY_LABELS[key]} — ${group.purokSitio}`}
                              style={{
                                width: `${(group.categoryCounts[key] / maxChartTotal) * 100}%`,
                                backgroundColor: CATEGORY_COLORS[key],
                              }}
                              className={`h-5 shrink-0 ${index > 0 ? 'ml-[2px]' : ''} ${index === visible.length - 1 ? 'rounded-r-[4px]' : ''}`}
                            />
                          ))
                      )}
                    </span>
                    <span className="w-16 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-950">
                      {group.score}
                    </span>
                  </div>
                );
              })}
            </div>

            {scopedGroups.map((group) => (
              <div key={group.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">{group.purokSitio}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{group.barangayLabel}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <CivicBadge label={group.level.toUpperCase()} tone={LEVEL_TONES[group.level]} className="text-[10px]" />
                    <CivicBadge label={`Score ${group.score}`} tone="amber" className="text-[10px]" />
                    <CivicBadge label={`${group.householdCount} households`} tone="slate" className="text-[10px]" />
                  </div>
                </div>
                {group.defaultEvacuationSite ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Evacuation site: <span className="font-semibold text-slate-700">{group.defaultEvacuationSite}</span>
                  </p>
                ) : null}
              </div>
            ))}
          </>
        )}
      </div>

      <AIAnalysisBubble
        payload={payload}
        resetKey={resetKey}
        actionLabel="Run AI analysis of affected area"
        disabled={scopedGroups.length === 0}
        disabledNote="AI analysis needs at least one purok in the trigger's scope."
        autoRun
      />
    </>
  );
}

export default function TriggerAnalysis({
  incident,
  groups,
  incidents,
  alerts,
}: {
  incident: Incident;
  groups: PurokPriorityGroup[];
  incidents: Incident[];
  alerts: DisasterAlert[];
}) {
  const [open, setOpen] = useState(false);
  const scopedGroups = useIncidentScopedGroups(incident, groups);

  const trigger: AIBriefTriggerSource = {
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    location: incident.location,
    description: incident.description,
  };

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-50"
      >
        <Zap className="h-3.5 w-3.5" aria-hidden />
        Affected puroks &amp; AI analysis
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{incident.location}</DialogTitle>
            <DialogDescription>
              Who to assist first in this trigger&apos;s scope, with AI analysis.
            </DialogDescription>
          </DialogHeader>

          <TriggerAnalysisBody
            trigger={trigger}
            scopedGroups={scopedGroups}
            incidents={incidents}
            alerts={alerts}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The map-trigger dialog — opens automatically when the responder selects a
 * trigger (incident pin or alert-zone "!" pin) on the field map. This is the
 * admin-facing "kinsay una tabangan" view: the assist-first queue leads,
 * followed by the affected-purok composition and the AI narration.
 */
export function TriggerAnalysisDialog({
  open,
  onOpenChange,
  title,
  trigger,
  scopedGroups,
  incidents,
  alerts,
  onNavigateHousehold,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  trigger: AIBriefTriggerSource;
  scopedGroups: PurokPriorityGroup[];
  incidents: Incident[];
  alerts: DisasterAlert[];
  onNavigateHousehold?: (household: Household) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Kinsay una tabangan — engine-ranked assist-first queue for this trigger&apos;s scope, with AI analysis.
          </DialogDescription>
        </DialogHeader>

        <TriggerAnalysisBody
          trigger={trigger}
          scopedGroups={scopedGroups}
          incidents={incidents}
          alerts={alerts}
          onNavigateHousehold={onNavigateHousehold}
        />
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Sparkles } from 'lucide-react';
import type { DisasterAlert, Incident } from '@/lib/db/schema';
import type { PurokPriorityGroup } from '@/lib/responder-priorities';
import { buildAIBriefPayload } from '@/lib/ai-brief';
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
 * Priority analytics — a stacked-bar view of the engine-computed priority
 * queue plus AI analysis in a popup. The chart is pure deterministic engine
 * data (purok vulnerable-resident composition, ranked by score). Clicking a
 * purok opens a dialog where the AI narrates a focused analysis of that
 * purok as a chat bubble. If the AI call fails or the device is offline, the
 * chart and dialog stats are unaffected.
 */

const MAX_CHART_PUROKS = 8;

/** Fixed categorical slot order (dataviz reference palette, light mode) — never cycled. */
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

interface DialogState {
  mode: 'situation' | 'purok';
  group: PurokPriorityGroup | null;
}

export default function PriorityAnalytics({
  groups,
  incidents,
  alerts,
}: {
  groups: PurokPriorityGroup[];
  incidents: Incident[];
  alerts: DisasterAlert[];
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const chartGroups = useMemo(
    () => groups.slice(0, MAX_CHART_PUROKS),
    [groups],
  );

  const maxTotal = useMemo(
    () => Math.max(
      1,
      ...chartGroups.map((group) =>
        CATEGORY_ORDER.reduce((sum, key) => sum + group.categoryCounts[key], 0)),
    ),
    [chartGroups],
  );

  const openDialog = (mode: 'situation' | 'purok', group: PurokPriorityGroup | null) => {
    setDialog({ mode, group });
  };

  const dialogPayload = useMemo(
    () => dialog
      ? buildAIBriefPayload({
          groups: dialog.mode === 'purok' && dialog.group ? [dialog.group] : groups,
          incidents,
          alerts,
          mode: dialog.mode,
        })
      : null,
    [dialog, groups, incidents, alerts],
  );

  const dialogGroup = dialog?.mode === 'purok' ? dialog.group : null;
  const dialogTotals = dialogGroup
    ? CATEGORY_ORDER.map((key) => ({ key, count: dialogGroup.categoryCounts[key] })).filter((entry) => entry.count > 0)
    : [];
  const situationTotals = dialog?.mode === 'situation'
    ? CATEGORY_ORDER.map((key) => ({
        key,
        count: groups.reduce((sum, group) => sum + group.categoryCounts[key], 0),
      })).filter((entry) => entry.count > 0)
    : [];

  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">Priority analytics</p>
          <p className="mt-1 text-xs text-slate-500">
            Vulnerable residents per purok, ranked by engine score. Click a bar for the AI analysis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openDialog('situation', null)}
          disabled={groups.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Full AI briefing
        </button>
      </div>

      {/* Legend — 5 series, fixed order; identity is never color-alone. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
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

      {chartGroups.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          <BarChart3 className="h-4 w-4" aria-hidden />
          No priority puroks to chart right now.
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          {chartGroups.map((group) => {
            const total = CATEGORY_ORDER.reduce((sum, key) => sum + group.categoryCounts[key], 0);
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => openDialog('purok', group)}
                aria-label={`Analyze ${group.purokSitio}, ${group.barangayLabel}`}
                className="group relative flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-900/20"
              >
                <span className="w-24 shrink-0 truncate text-[11px] font-semibold text-slate-600" title={group.purokSitio}>
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
                          style={{
                            width: `${(group.categoryCounts[key] / maxTotal) * 100}%`,
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

                {/* Hover tooltip — values lead, keyed by series color. */}
                <span className="pointer-events-none absolute right-8 top-1 z-10 hidden w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg group-hover:block group-focus-visible:block">
                  <span className="block text-[11px] font-bold text-slate-950">
                    {group.purokSitio} · score {group.score}
                  </span>
                  {CATEGORY_ORDER.filter((key) => group.categoryCounts[key] > 0).map((key) => (
                    <span key={key} className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
                      <span
                        className="inline-block h-2 w-2 rounded-[2px]"
                        style={{ backgroundColor: CATEGORY_COLORS[key] }}
                        aria-hidden
                      />
                      <span className="font-bold text-slate-950">{group.categoryCounts[key]}</span>
                      {DISTRIBUTION_CATEGORY_LABELS[key]}
                    </span>
                  ))}
                  <span className="mt-1.5 block text-[10px] font-semibold text-cyan-800">Click for AI analysis</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogGroup ? `${dialogGroup.purokSitio} — AI analysis` : 'Situational AI briefing'}
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                {dialogGroup ? (
                  <div className="flex flex-wrap gap-1.5">
                    <CivicBadge label={dialogGroup.level.toUpperCase()} tone={LEVEL_TONES[dialogGroup.level]} className="text-[10px]" />
                    <CivicBadge label={`Score ${dialogGroup.score}`} tone="amber" className="text-[10px]" />
                    <CivicBadge label={`${dialogGroup.householdCount} households`} tone="slate" className="text-[10px]" />
                    <CivicBadge label={dialogGroup.floodControlLabel} tone="slate" className="text-[10px]" />
                  </div>
                ) : (
                  <p>AI narration of the full priority queue — {groups.length} puroks, flood/incident context included.</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {dialogGroup ? (
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Vulnerable residents</p>
              <div className="flex flex-wrap gap-1.5">
                {dialogTotals.length > 0 ? dialogTotals.map(({ key, count }) => (
                  <span key={key} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-[3px]"
                      style={{ backgroundColor: CATEGORY_COLORS[key] }}
                      aria-hidden
                    />
                    {count} {DISTRIBUTION_CATEGORY_LABELS[key]}
                  </span>
                )) : (
                  <p className="text-xs text-slate-400">No flagged residents recorded in this purok.</p>
                )}
              </div>
              {dialogGroup.defaultEvacuationSite ? (
                <p className="pt-1 text-xs text-slate-500">
                  Evacuation site: <span className="font-semibold text-slate-700">{dialogGroup.defaultEvacuationSite}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {situationTotals.map(({ key, count }) => (
                <span key={key} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-[3px]"
                    style={{ backgroundColor: CATEGORY_COLORS[key] }}
                    aria-hidden
                  />
                  {count} {DISTRIBUTION_CATEGORY_LABELS[key]}
                </span>
              ))}
            </div>
          )}

          <AIAnalysisBubble
            payload={dialogPayload}
            resetKey={`${dialog?.mode ?? 'none'}:${dialogGroup?.id ?? 'all'}`}
            actionLabel={dialogGroup ? 'Run AI analysis' : 'Generate briefing'}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

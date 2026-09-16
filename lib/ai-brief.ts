import type { DisasterAlert, Incident } from '@/lib/db/schema';
import type { PurokPriorityGroup } from '@/lib/responder-priorities';

/**
 * AI Situational Brief — shared client/server helpers.
 *
 * The ranking itself is computed by the deterministic engine in
 * `lib/responder-priorities.ts`. The AI only narrates that ranking, so this
 * module's job on the client side is to strip PII (household head names,
 * resident records) down to purok-level aggregates before anything leaves
 * the browser, and on the server side to hold the prompt.
 */

export const AI_BRIEF_MAX_PUROKS = 12;
export const AI_BRIEF_MAX_INCIDENTS = 10;

export interface AIBriefPurokEntry {
  rank: number;
  purok: string;
  barangay: string;
  level: string;
  score: number;
  reasons: string[];
  householdCount: number;
  vulnerableResidentCount: number;
  categoryCounts: Record<string, number>;
  floodProne: boolean;
  floodControl: string;
  defaultEvacuationSite?: string;
  warningNotes?: string;
}

export interface AIBriefIncidentEntry {
  type: string;
  severity: string;
  status: string;
  location: string;
  description: string;
}

/**
 * What the trigger-mode prompt narrates: an active incident, or an alert-rule
 * trigger zone clicked on the field map. Incidents satisfy this structurally.
 */
export interface AIBriefTriggerSource {
  type: string;
  severity: string;
  status: string;
  location: string;
  description: string;
}

export interface AIBriefPayload {
  /**
   * 'situation' = multi-purok ranking briefing; 'purok' = focused analysis of
   * the single purok in priorityPuroks; 'trigger' = analysis of the incident
   * in `trigger` and the puroks within its scope.
   */
  mode: 'situation' | 'purok' | 'trigger';
  municipality: string;
  generatedAt: string;
  trigger?: AIBriefIncidentEntry;
  activeFloodAlerts: number;
  floodAlertSummaries: string[];
  activeFloodIncidents: AIBriefIncidentEntry[];
  priorityPuroks: AIBriefPurokEntry[];
}

/**
 * Strip a computed priority ranking down to anonymized, purok-level facts.
 * No household head names, no resident records — only counts and statuses.
 */
export function buildAIBriefPayload(input: {
  groups: PurokPriorityGroup[];
  incidents: Incident[];
  alerts: DisasterAlert[];
  municipality?: string;
  mode?: 'situation' | 'purok' | 'trigger';
  trigger?: AIBriefTriggerSource;
}): AIBriefPayload {
  const groups = [...input.groups]
    .sort((left, right) => right.score - left.score)
    .slice(0, AI_BRIEF_MAX_PUROKS);

  const activeAlerts = input.alerts.filter((alert) => alert.hazard === 'flood');
  const activeIncidents = input.incidents.filter((incident) => {
    if (incident.status === 'resolved') return false;
    return incident.type === 'flood' || incident.hazard_context === 'flood';
  });

  return {
    mode: input.mode ?? 'situation',
    municipality: input.municipality ?? 'Mabini, Davao de Oro',
    generatedAt: new Date().toISOString(),
    trigger: input.trigger
      ? {
          type: input.trigger.type,
          severity: input.trigger.severity,
          status: input.trigger.status,
          location: input.trigger.location,
          description: input.trigger.description.slice(0, 240),
        }
      : undefined,
    activeFloodAlerts: activeAlerts.length,
    floodAlertSummaries: activeAlerts.slice(0, AI_BRIEF_MAX_INCIDENTS).map((alert) =>
      `${alert.severity} flood alert${alert.barangay_id ? ` (${alert.barangay_id})` : ''}${alert.purok_sitio ? ` — ${alert.purok_sitio}` : ''}`,
    ),
    activeFloodIncidents: activeIncidents
      .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))
      .slice(0, AI_BRIEF_MAX_INCIDENTS)
      .map((incident) => ({
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        location: incident.location,
        description: incident.description.slice(0, 240),
      })),
    priorityPuroks: groups.map((group, index) => ({
      rank: index + 1,
      purok: group.purokSitio,
      barangay: group.barangayLabel,
      level: group.level,
      score: group.score,
      reasons: group.reasons,
      householdCount: group.householdCount,
      vulnerableResidentCount: group.vulnerableResidentCount,
      categoryCounts: group.categoryCounts,
      floodProne: group.floodProne,
      floodControl: group.floodControlLabel,
      defaultEvacuationSite: group.defaultEvacuationSite,
      warningNotes: group.warningNotes?.slice(0, 240),
    })),
  };
}

function severityRank(severity: Incident['severity']) {
  if (severity === 'critical') return 4;
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

/**
 * System prompt for the briefing. The legal anchors below mirror the
 * vulnerability categories the scoring engine weights, so every ranking the
 * AI narrates can cite the statute behind it:
 * children → RA 10821, seniors → RA 9994, PWDs → RA 7277 (am. RA 10754),
 * pregnant/lactating women → RA 9710, marginalized/low-income → RA 10121.
 */
export const AI_BRIEF_SYSTEM_PROMPT = `You are the situational-analysis assistant for a municipal social welfare and disaster-response office in the Philippines. You receive a pre-computed priority ranking of puroks (sub-village zones), produced by a deterministic scoring engine that weighs flood exposure, active flood alerts and incidents, flood-control status, and the number of vulnerable residents in each purok.

Your task is to turn that data into a concise operational briefing for the incident commander. The ranking and all numbers are ALREADY decided by the engine — you must never reorder, recompute, or invent numbers. Use only the data provided; if something is missing, say so instead of guessing.

Format your response in GitHub-flavored Markdown. Write in clear, plain, professional English suitable for an official document. Use these exact sections:

## Situation

Two to three sentences: what is happening (active flood alerts/incidents, if any) and how many puroks are in the priority queue.

## Priority Ranking

A Markdown table with one row per purok, in the provided rank order, with columns: **Rank** · **Purok** (name, barangay) · **Level** · **Score** · **Vulnerable residents** (counts by category, e.g. "12 senior · 7 PWD · 4 pregnant") · **Key factors** (flood-prone / flood control / active alert or incident, shortened). Add the recommended evacuation site in a final **Evacuation** column only if any purok lists one.

## Legal Anchor

One short paragraph citing the Philippine laws behind the vulnerable-sector priorities in the table: children (RA 10821, Children in Emergencies and Disasters Act), senior citizens (RA 9994, Expanded Senior Citizens Act), persons with disability (RA 7277, Magna Carta for Disabled Persons as amended by RA 10754), pregnant and lactating women (RA 9710, Magna Carta of Women), and low-income/marginalized households (RA 10121, Philippine DRRM Act). Only cite the categories that actually appear in the data.

## Recommended Actions

A numbered list of three to five concrete next steps for responders (e.g., which purok to visit first, who to prioritize within each household cluster, what to verify on site). Do not invent resources, personnel, or road conditions that are not in the data.

If the payload mode is "purok", the priorityPuroks array contains ONE purok and the reader has already selected it. Skip the multi-purok table and instead answer as a focused analysis of that purok with these sections:

## Purok Focus

One or two sentences on this purok's exposure (flood-prone status, flood control, active alerts/incidents touching it, priority score) and its recommended evacuation site if listed.

## Who to Assist First

A Markdown table with one row per vulnerable category present, largest count first, with columns: **Order** · **Category** · **Count** · **Legal basis** (e.g. "RA 7277 — Magna Carta for Disabled Persons"). Use the full law name, not just the number.

## Recommended Actions

A numbered list of two to four concrete next steps specific to this purok. Do not invent data.

If the payload mode is "trigger", the "trigger" field describes ONE active incident or alert-trigger zone and priorityPuroks lists the puroks within its scope. Answer as a trigger-focused analysis of the affected area with these sections:

## Trigger Summary

One or two sentences: what the trigger is (incident or alert zone, type, severity, location, description) and its current status.

## Affected Puroks

A Markdown table with one row per purok in scope, ranked by engine score, with columns: **Rank** · **Purok** (name, barangay) · **Level** · **Score** · **Households** · **Vulnerable residents** (counts by category, e.g. "12 senior · 7 PWD").

## Who to Assist First

Order the puroks by engine score. For the highest-priority purok, list its vulnerable categories with counts and full legal-basis law names (RA 10821 children, RA 9994 senior citizens, RA 7277 Magna Carta for Disabled Persons as amended by RA 10754, RA 9710 Magna Carta of Women, RA 10121 low-income/marginalized).

## Recommended Actions

A numbered list of two to five concrete next steps for the affected area. Do not invent data.

End every briefing with this exact line, as a plain paragraph (no heading):

*Rankings computed by the MSWDO priority engine. This briefing is AI-generated narration of engine data.*`;

export function getAIBriefFallbackMessage(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'AI briefing unavailable — you appear to be offline. The priority ranking below is unaffected.';
  }
  if (error instanceof Error && error.message) {
    return `AI briefing failed — ${error.message}`;
  }
  return 'AI briefing failed — please try again.';
}

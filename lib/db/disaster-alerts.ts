import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import type { DisasterAlert, DisasterAlertRule } from '@/lib/db/schema';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';
import { runServerMutation } from '@/lib/mutations';

function normalizeDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  return undefined;
}

export function normalizeDisasterAlertRule(rule: DisasterAlertRule): DisasterAlertRule {
  return {
    ...rule,
    official_keywords: Array.isArray(rule.official_keywords)
      ? rule.official_keywords.filter((keyword): keyword is string => typeof keyword === 'string' && keyword.trim().length > 0)
      : [],
    last_triggered_at: normalizeDate(rule.last_triggered_at),
    createdAt: normalizeDate(rule.createdAt) ?? new Date(),
    updatedAt: normalizeDate(rule.updatedAt) ?? new Date(),
  };
}

export function normalizeDisasterAlert(alert: DisasterAlert): DisasterAlert {
  return {
    ...alert,
    issued_at: normalizeDate(alert.issued_at) ?? new Date(),
    createdAt: normalizeDate(alert.createdAt) ?? new Date(),
    updatedAt: normalizeDate(alert.updatedAt) ?? new Date(),
    weather_snapshot:
      alert.weather_snapshot && typeof alert.weather_snapshot === 'object'
        ? alert.weather_snapshot
        : {
          summary: '',
          official_alert_titles: [],
          rain_chance: null,
          rain_intensity_mm_per_hr: null,
          next_hour_precip_mm: null,
          wind_gust_kph: null,
        },
  };
}

export async function getDisasterAlertRules() {
  const rules = await db.getAll<DisasterAlertRule>(STORE_NAMES.disaster_alert_rules);
  return rules
    .map(normalizeDisasterAlertRule)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

export async function getDisasterAlerts() {
  const alerts = await db.getAll<DisasterAlert>(STORE_NAMES.disaster_alerts);
  return alerts
    .map(normalizeDisasterAlert)
    .sort((left, right) => right.issued_at.getTime() - left.issued_at.getTime());
}

export async function createDisasterAlertRule(
  input: Omit<DisasterAlertRule, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'last_triggered_at' | 'last_trigger_signature'>,
) {
  const payload = await runServerMutation<{ rule: Record<string, unknown> }>({
    action: 'create_disaster_alert_rule',
    input,
  });

  await bootstrapCurrentPathData(true);
  return payload.rule;
}

export async function updateDisasterAlertRule(
  ruleId: string,
  updates: Partial<DisasterAlertRule>,
) {
  const payload = await runServerMutation<{ rule: Record<string, unknown> }>({
    action: 'update_disaster_alert_rule',
    ruleId,
    updates,
  });

  await bootstrapCurrentPathData(true);
  return payload.rule;
}

export async function runDisasterAlertEvaluationNow() {
  const response = await fetch('/api/disaster-alerts/evaluate', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null) as { error?: string } & Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Disaster alert evaluation failed with status ${response.status}`);
  }

  await bootstrapCurrentPathData(true);
  return payload;
}

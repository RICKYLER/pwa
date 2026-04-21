import 'server-only';

import {
  BARANGAY_OPTIONS,
  isBarangayId,
  isMabiniMunicipality,
  MABINI_MUNICIPALITY,
} from '@/lib/barangays';
import {
  buildDisasterAlertNotificationBody,
  HAZARD_LABELS,
  isHazardType,
  isPurokFloodControlStatus,
} from '@/lib/disaster-alerts';
import {
  buildGeneratedDisasterAlertMessage,
  evaluateDisasterAlertRule,
} from '@/lib/disaster-alert-evaluation';
import type {
  DisasterAlertRule,
  DisasterAlertTriggerSource,
  HazardType,
  PurokRiskProfile,
  User,
} from '@/lib/db/schema';
import { selectAlertTargetHouseholds } from '@/lib/disaster-alert-targeting';
import { fetchOpenWeatherFieldResponseWeather, type FieldResponseWeatherPayload } from '@/lib/weather';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireSupabaseUserId } from '@/lib/server/supabase-user-ids';

export const DISASTER_ALERT_EVALUATION_SECRET_HEADER = 'x-disaster-alert-secret';
const AUTOMATIC_RULE_HAZARDS: HazardType[] = ['flood', 'typhoon', 'landslide'];

type DisasterAlertRuleInput = Pick<
  DisasterAlertRule,
  | 'municipality'
  | 'barangay_id'
  | 'purok_sitio'
  | 'hazard'
  | 'trigger_lat'
  | 'trigger_lng'
  | 'enabled'
  | 'notify_responders'
  | 'official_keywords'
  | 'min_rain_chance'
  | 'min_rain_intensity_mm_per_hr'
  | 'min_next_hour_precip_mm'
  | 'min_wind_gust_kph'
  | 'cooldown_minutes'
>;

type DisasterAlertEmitResult = {
  alert: Record<string, unknown>;
  candidateHouseholdCount: number;
  reachableHouseholdCount: number;
  unreachableHouseholdCount: number;
  residentNotificationCount: number;
  responderNotificationCount: number;
};

type AlertTargetProfile = Pick<PurokRiskProfile, 'purok_sitio' | 'flood_prone'>;

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function toOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toOptionalDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function toTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
  ));
}

function normalizeRuleHazard(value: unknown) {
  if (!isHazardType(value) || !AUTOMATIC_RULE_HAZARDS.includes(value)) {
    throw new Error('Automatic disaster alert rules only support flood, typhoon, and landslide.');
  }

  return value;
}

function normalizeRuleInput(input: Partial<DisasterAlertRuleInput>) {
  const municipality = toOptionalString(input.municipality) ?? MABINI_MUNICIPALITY;
  if (!isMabiniMunicipality(municipality)) {
    throw new Error('Disaster alert rules are limited to Mabini, Davao de Oro.');
  }

  if (!isBarangayId(input.barangay_id ?? '')) {
    throw new Error('A valid Mabini barangay is required.');
  }

  const triggerLat = toOptionalNumber(input.trigger_lat);
  const triggerLng = toOptionalNumber(input.trigger_lng);
  if (triggerLat === null || triggerLng === null) {
    throw new Error('A trigger map coordinate is required.');
  }

  const cooldownMinutes = Math.max(
    30,
    Math.round(toOptionalNumber(input.cooldown_minutes) ?? 180),
  );

  return {
    municipality: MABINI_MUNICIPALITY,
    barangay_id: input.barangay_id,
    purok_sitio: toOptionalString(input.purok_sitio),
    hazard: normalizeRuleHazard(input.hazard),
    trigger_lat: triggerLat,
    trigger_lng: triggerLng,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    notify_responders: typeof input.notify_responders === 'boolean' ? input.notify_responders : true,
    official_keywords: toTextArray(input.official_keywords),
    min_rain_chance: toOptionalNumber(input.min_rain_chance),
    min_rain_intensity_mm_per_hr: toOptionalNumber(input.min_rain_intensity_mm_per_hr),
    min_next_hour_precip_mm: toOptionalNumber(input.min_next_hour_precip_mm),
    min_wind_gust_kph: toOptionalNumber(input.min_wind_gust_kph),
    cooldown_minutes: cooldownMinutes,
  };
}

function getBarangayLabel(barangayId: string) {
  return BARANGAY_OPTIONS.find((option) => option.id === barangayId)?.label ?? barangayId;
}

function getEvaluationSecret() {
  return process.env.DISASTER_ALERT_EVALUATION_SECRET?.trim()
    || process.env.DISASTER_ALERT_SECRET?.trim()
    || '';
}

function getPatternKey(signature?: string | null) {
  if (!signature) {
    return '';
  }

  const parts = signature.split(':');
  parts.pop();
  return parts.join(':');
}

function isCooldownActive(rule: Record<string, unknown>, nextSignature: string, now: Date) {
  const lastTriggeredAt = toOptionalDate(rule.last_triggered_at);
  if (!lastTriggeredAt) {
    return false;
  }

  const cooldownMinutes = Math.max(0, Math.round(toOptionalNumber(rule.cooldown_minutes) ?? 0));
  if (!cooldownMinutes) {
    return false;
  }

  const lastSignature = typeof rule.last_trigger_signature === 'string' ? rule.last_trigger_signature : '';
  if (getPatternKey(lastSignature) !== getPatternKey(nextSignature)) {
    return false;
  }

  return now.getTime() - lastTriggeredAt.getTime() < cooldownMinutes * 60_000;
}

async function insertAuditLogBySupabaseUserId(
  userId: string | null | undefined,
  action: 'CREATE' | 'UPDATE',
  entityType: 'disaster_alert' | 'disaster_alert_rule',
  entityId: string,
  changes: Record<string, unknown>,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('audit_logs').insert({
    id: generateId('log'),
    user_id: userId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    changes,
    timestamp: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to write disaster alert audit log: ${error.message}`);
  }
}

async function insertAuditLogWithAction(
  user: User,
  action: 'CREATE' | 'UPDATE',
  entityType: 'disaster_alert_rule',
  entityId: string,
  changes: Record<string, unknown>,
) {
  const remoteActorId = await requireSupabaseUserId(user);
  await insertAuditLogBySupabaseUserId(remoteActorId, action, entityType, entityId, changes);
}

function assertAdminRuleManager(user: User) {
  if (user.role !== 'admin') {
    throw new Error('Admin access is required to manage disaster alert rules.');
  }
}

function assertAlertRuleViewer(user: User) {
  if (!['admin', 'responder'].includes(user.role)) {
    throw new Error('Admin or responder access is required to view disaster alert rules.');
  }
}

function assertAlertHistoryViewer(user: User) {
  if (!['admin', 'responder'].includes(user.role)) {
    throw new Error('Admin or responder access is required to view disaster alert history.');
  }
}

export function getDisasterAlertEvaluationSecret() {
  return getEvaluationSecret();
}

export async function createDisasterAlertRuleOnServer(
  user: User,
  input: Partial<DisasterAlertRuleInput>,
) {
  assertAdminRuleManager(user);

  const normalized = normalizeRuleInput(input);
  const supabase = getSupabaseAdminClient();
  const remoteActorId = await requireSupabaseUserId(user);
  const { data, error } = await supabase
    .from('disaster_alert_rules')
    .insert({
      id: generateId('darule'),
      ...normalized,
      created_by: remoteActorId,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await insertAuditLogWithAction(user, 'CREATE', 'disaster_alert_rule', String(data.id), normalized);
  return data;
}

export async function updateDisasterAlertRuleOnServer(
  user: User,
  ruleId: string,
  input: Partial<DisasterAlertRuleInput>,
) {
  assertAdminRuleManager(user);

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from('disaster_alert_rules')
    .select('*')
    .eq('id', ruleId)
    .single();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error('Disaster alert rule not found.');
  }

  const normalized = normalizeRuleInput({
    municipality: existing.municipality,
    barangay_id: existing.barangay_id,
    purok_sitio: existing.purok_sitio,
    hazard: existing.hazard,
    trigger_lat: existing.trigger_lat,
    trigger_lng: existing.trigger_lng,
    enabled: existing.enabled,
    notify_responders: existing.notify_responders,
    official_keywords: existing.official_keywords,
    min_rain_chance: existing.min_rain_chance,
    min_rain_intensity_mm_per_hr: existing.min_rain_intensity_mm_per_hr,
    min_next_hour_precip_mm: existing.min_next_hour_precip_mm,
    min_wind_gust_kph: existing.min_wind_gust_kph,
    cooldown_minutes: existing.cooldown_minutes,
    ...input,
  });

  const { data, error } = await supabase
    .from('disaster_alert_rules')
    .update({
      ...normalized,
      sync_status: 'synced',
    })
    .eq('id', ruleId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await insertAuditLogWithAction(user, 'UPDATE', 'disaster_alert_rule', ruleId, normalized);
  return data;
}

function buildWeatherSnapshot(weather: FieldResponseWeatherPayload, officialAlertTitles: string[]) {
  return {
    summary: weather.summary,
    official_alert_titles: officialAlertTitles,
    rain_chance: weather.current.rainChance,
    rain_intensity_mm_per_hr: weather.current.rainIntensity,
    next_hour_precip_mm: weather.current.nextHourPrecipitationPeak,
    wind_gust_kph: weather.current.windGust,
  };
}

async function resolveResidentRecipientsForHouseholds(households: Array<Record<string, unknown>>) {
  const supabase = getSupabaseAdminClient();
  const applicantUserIds = Array.from(new Set(
    households
      .map((household) => (typeof household.applicant_user_id === 'string' ? household.applicant_user_id : ''))
      .filter(Boolean),
  ));
  const applicantEmails = Array.from(new Set(
    households
      .map((household) => (typeof household.applicant_email === 'string' ? household.applicant_email.trim().toLowerCase() : ''))
      .filter(Boolean),
  ));

  const usersById = new Map<string, { id: string; email: string | null }>();
  const usersByEmail = new Map<string, { id: string; email: string | null }>();

  if (applicantUserIds.length > 0) {
    const { data, error } = await supabase
      .from('users')
      .select('id,email')
      .in('id', applicantUserIds)
      .eq('role', 'resident')
      .eq('status', 'active');

    if (error) {
      throw new Error(error.message);
    }

    for (const user of data ?? []) {
      if (typeof user.id === 'string') {
        usersById.set(user.id, {
          id: user.id,
          email: typeof user.email === 'string' ? user.email : null,
        });
      }
      if (typeof user.email === 'string' && user.email.trim()) {
        usersByEmail.set(user.email.trim().toLowerCase(), {
          id: String(user.id),
          email: user.email,
        });
      }
    }
  }

  if (applicantEmails.length > 0) {
    const { data, error } = await supabase
      .from('users')
      .select('id,email')
      .in('email', applicantEmails)
      .eq('role', 'resident')
      .eq('status', 'active');

    if (error) {
      throw new Error(error.message);
    }

    for (const user of data ?? []) {
      if (typeof user.id === 'string') {
        usersById.set(user.id, {
          id: user.id,
          email: typeof user.email === 'string' ? user.email : null,
        });
      }
      if (typeof user.email === 'string' && user.email.trim()) {
        usersByEmail.set(user.email.trim().toLowerCase(), {
          id: String(user.id),
          email: user.email,
        });
      }
    }
  }

  const notificationsByUserId = new Map<string, Record<string, unknown>>();
  let reachableHouseholdCount = 0;
  let unreachableHouseholdCount = 0;

  const sortedHouseholds = [...households].sort((left, right) => {
    const leftPriority = toOptionalDate(left.disaster_profile_updated_at ?? left.updated_at)?.getTime() ?? 0;
    const rightPriority = toOptionalDate(right.disaster_profile_updated_at ?? right.updated_at)?.getTime() ?? 0;
    return rightPriority - leftPriority;
  });

  for (const household of sortedHouseholds) {
    const linkedUserId = typeof household.applicant_user_id === 'string' ? household.applicant_user_id : '';
    const linkedEmail = typeof household.applicant_email === 'string' ? household.applicant_email.trim().toLowerCase() : '';
    const matchedUser = usersById.get(linkedUserId) ?? usersByEmail.get(linkedEmail);

    if (!matchedUser) {
      unreachableHouseholdCount += 1;
      continue;
    }

    reachableHouseholdCount += 1;
    if (!notificationsByUserId.has(matchedUser.id)) {
      notificationsByUserId.set(matchedUser.id, household);
    }
  }

  return {
    notificationsByUserId,
    reachableHouseholdCount,
    unreachableHouseholdCount,
  };
}

async function resolveResponderRecipients(barangayId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('barangay_id', barangayId)
    .in('role', ['admin', 'responder'])
    .eq('status', 'active');

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(new Set(
    (data ?? [])
      .map((user) => (typeof user.id === 'string' ? user.id : ''))
      .filter(Boolean),
  ));
}

async function emitDisasterAlertForRule(params: {
  rule: Record<string, unknown>;
  evaluation: ReturnType<typeof evaluateDisasterAlertRule>;
  weather: FieldResponseWeatherPayload;
  issuedAt: Date;
}): Promise<DisasterAlertEmitResult | null> {
  const supabase = getSupabaseAdminClient();
  const rule = params.rule;
  const barangayId = String(rule.barangay_id);
  const purokSitio = toOptionalString(rule.purok_sitio);
  const hazard = normalizeRuleHazard(rule.hazard);
  const barangayLabel = getBarangayLabel(barangayId);

  const { data: households, error: householdError } = await supabase
    .from('households')
    .select('id,barangay_id,barangay_name,municipality,purok_sitio,applicant_user_id,applicant_email,hazard_tags,evacuation_site,special_assistance_notes,status,registration_status,updated_at,disaster_profile_updated_at')
    .eq('barangay_id', barangayId)
    .eq('status', 'active')
    .eq('registration_status', 'approved');

  if (householdError) {
    throw new Error(householdError.message);
  }

  const { data: purokRiskProfiles, error: purokRiskProfilesError } = await supabase
    .from('purok_risk_profiles')
    .select('*')
    .eq('barangay_id', barangayId);

  if (purokRiskProfilesError && !purokRiskProfilesError.message.toLowerCase().includes('purok_risk_profiles')) {
    throw new Error(purokRiskProfilesError.message);
  }

  const scopedHouseholds = selectAlertTargetHouseholds({
    households: households ?? [],
    hazard,
    purokSitio,
    purokRiskProfiles: (purokRiskProfiles ?? []) as AlertTargetProfile[],
  }).households;

  if (scopedHouseholds.length === 0) {
    return null;
  }

  const residentRecipients = await resolveResidentRecipientsForHouseholds(scopedHouseholds);
  const purokProfilesByPurok = new Map<string, Record<string, unknown>>(
    ((purokRiskProfiles ?? []) as Record<string, unknown>[])
      .map((profile) => {
        const purok = toOptionalString(profile.purok_sitio);
        return purok ? [purok, profile] as const : null;
      })
      .filter(Boolean) as Array<readonly [string, Record<string, unknown>]>,
  );
  const scopedPurokProfile = purokSitio ? purokProfilesByPurok.get(purokSitio) : null;
  const scopedFloodControlStatus = isPurokFloodControlStatus(scopedPurokProfile?.flood_control_status)
    ? scopedPurokProfile.flood_control_status
    : undefined;
  const scopedDefaultEvacuationSite = toOptionalString(scopedPurokProfile?.default_evacuation_site);
  const scopedWarningNotes = toOptionalString(scopedPurokProfile?.warning_notes);
  const title = `${HAZARD_LABELS[hazard]} ${params.evaluation.severity === 'warning' ? 'Warning' : 'Watch'}`;
  const baseMessage = buildGeneratedDisasterAlertMessage({
    hazard,
    severity: params.evaluation.severity!,
    barangayLabel,
    purokSitio,
    triggerReason: params.evaluation.triggerReason,
  });

  const { data: createdAlert, error: alertError } = await supabase
    .from('disaster_alerts')
    .insert({
      id: generateId('dalert'),
      rule_id: String(rule.id),
      municipality: MABINI_MUNICIPALITY,
      barangay_id: barangayId,
      purok_sitio: purokSitio,
      hazard,
      severity: params.evaluation.severity,
      title,
      message: baseMessage,
      trigger_source: params.evaluation.triggerSource,
      trigger_reason: params.evaluation.triggerReason,
      weather_snapshot: buildWeatherSnapshot(params.weather, params.evaluation.officialAlertTitles),
      notify_responders: Boolean(rule.notify_responders),
      reachable_household_count: residentRecipients.reachableHouseholdCount,
      unreachable_household_count: residentRecipients.unreachableHouseholdCount,
      issued_at: params.issuedAt.toISOString(),
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (alertError) {
    throw new Error(alertError.message);
  }

  const residentNotificationRows = Array.from(residentRecipients.notificationsByUserId.entries()).map(([userId, household]) => {
    const evacuationSite = toOptionalString(household.evacuation_site);
    const specialAssistanceNotes = toOptionalString(household.special_assistance_notes);
    const purokProfile = purokProfilesByPurok.get(typeof household.purok_sitio === 'string' ? household.purok_sitio : '');
    const floodControlStatus = isPurokFloodControlStatus(purokProfile?.flood_control_status)
      ? purokProfile.flood_control_status
      : undefined;
    const floodControlNotes = toOptionalString(purokProfile?.flood_control_notes);
    const defaultEvacuationSite = toOptionalString(purokProfile?.default_evacuation_site);
    const warningNotes = toOptionalString(purokProfile?.warning_notes);
    const payload = {
      alert_id: String(createdAlert.id),
      rule_id: String(rule.id),
      municipality: MABINI_MUNICIPALITY,
      barangay_id: barangayId,
      purok_sitio: purokSitio ?? undefined,
      hazard,
      severity: params.evaluation.severity,
      title,
      message: baseMessage,
      trigger_source: params.evaluation.triggerSource as DisasterAlertTriggerSource,
      trigger_reason: params.evaluation.triggerReason,
      weather_summary: params.evaluation.weatherSummary,
      evacuation_site: evacuationSite ?? undefined,
      special_assistance_notes: specialAssistanceNotes ?? undefined,
      flood_control_status: floodControlStatus,
      flood_control_notes: floodControlNotes ?? undefined,
      default_evacuation_site: defaultEvacuationSite ?? undefined,
      warning_notes: warningNotes ?? undefined,
      issued_at: params.issuedAt.toISOString(),
    };

    return {
      id: generateId('notif'),
      user_id: userId,
      alert_id: createdAlert.id,
      type: 'disaster_alert',
      title,
      body: buildDisasterAlertNotificationBody({
        hazard,
        severity: params.evaluation.severity!,
        barangay_id: barangayId,
        purok_sitio: purokSitio,
        municipality: MABINI_MUNICIPALITY,
        trigger_reason: params.evaluation.triggerReason,
        weather_summary: params.evaluation.weatherSummary,
        flood_control_status: floodControlStatus ?? null,
        default_evacuation_site: defaultEvacuationSite ?? null,
        warning_notes: warningNotes ?? null,
      }),
      payload,
      created_at: params.issuedAt.toISOString(),
      updated_at: params.issuedAt.toISOString(),
    };
  });

  let responderNotificationRows: Array<Record<string, unknown>> = [];
  if (Boolean(rule.notify_responders)) {
    const responderUserIds = await resolveResponderRecipients(barangayId);
    responderNotificationRows = responderUserIds.map((userId) => ({
      id: generateId('notif'),
      user_id: userId,
      alert_id: createdAlert.id,
      type: 'disaster_alert',
      title,
      body: buildDisasterAlertNotificationBody({
        hazard,
        severity: params.evaluation.severity!,
        barangay_id: barangayId,
        purok_sitio: purokSitio,
        municipality: MABINI_MUNICIPALITY,
        trigger_reason: params.evaluation.triggerReason,
        weather_summary: params.evaluation.weatherSummary,
        flood_control_status: scopedFloodControlStatus ?? null,
        default_evacuation_site: scopedDefaultEvacuationSite ?? null,
        warning_notes: scopedWarningNotes ?? null,
      }),
      payload: {
        alert_id: String(createdAlert.id),
        rule_id: String(rule.id),
        municipality: MABINI_MUNICIPALITY,
        barangay_id: barangayId,
        purok_sitio: purokSitio ?? undefined,
        hazard,
        severity: params.evaluation.severity,
        title,
        message: baseMessage,
        trigger_source: params.evaluation.triggerSource,
        trigger_reason: params.evaluation.triggerReason,
        weather_summary: params.evaluation.weatherSummary,
        flood_control_status: scopedFloodControlStatus,
        default_evacuation_site: scopedDefaultEvacuationSite ?? undefined,
        warning_notes: scopedWarningNotes ?? undefined,
        issued_at: params.issuedAt.toISOString(),
      },
      created_at: params.issuedAt.toISOString(),
      updated_at: params.issuedAt.toISOString(),
    }));
  }

  const notificationRows = [...residentNotificationRows, ...responderNotificationRows];
  if (notificationRows.length > 0) {
    const { error: notificationError } = await supabase
      .from('user_notifications')
      .insert(notificationRows);

    if (notificationError) {
      throw new Error(notificationError.message);
    }
  }

  const { error: updateRuleError } = await supabase
    .from('disaster_alert_rules')
    .update({
      last_triggered_at: params.issuedAt.toISOString(),
      last_trigger_signature: params.evaluation.signature,
      sync_status: 'synced',
    })
    .eq('id', rule.id);

  if (updateRuleError) {
    throw new Error(updateRuleError.message);
  }

  return {
    alert: createdAlert,
    candidateHouseholdCount: scopedHouseholds.length,
    reachableHouseholdCount: residentRecipients.reachableHouseholdCount,
    unreachableHouseholdCount: residentRecipients.unreachableHouseholdCount,
    residentNotificationCount: residentNotificationRows.length,
    responderNotificationCount: responderNotificationRows.length,
  };
}

export async function runAutomaticDisasterAlertEvaluation(options?: {
  initiatedBy?: User | null;
}) {
  const supabase = getSupabaseAdminClient();
  const now = new Date();

  const { data: rules, error: rulesError } = await supabase
    .from('disaster_alert_rules')
    .select('*')
    .eq('municipality', MABINI_MUNICIPALITY)
    .eq('enabled', true)
    .order('updated_at', { ascending: false });

  if (rulesError) {
    throw new Error(rulesError.message);
  }

  if ((rules ?? []).length === 0) {
    return {
      evaluated_at: now.toISOString(),
      rule_count: 0,
      emitted_count: 0,
      suppressed_count: 0,
      results: [],
    };
  }

  const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENWEATHER_API_KEY is required for disaster alert evaluation.');
  }

  const results: Array<{
    rule_id: string;
    matched: boolean;
    emitted: boolean;
    suppressed_by_cooldown: boolean;
    reason: string;
    alert_id?: string;
  }> = [];

  for (const rule of rules ?? []) {
    if (!isBarangayId(rule.barangay_id) || !AUTOMATIC_RULE_HAZARDS.includes(rule.hazard)) {
      results.push({
        rule_id: String(rule.id),
        matched: false,
        emitted: false,
        suppressed_by_cooldown: false,
        reason: 'Rule is outside the supported Mabini scope.',
      });
      continue;
    }

    const weather = await fetchOpenWeatherFieldResponseWeather(
      Number(rule.trigger_lat),
      Number(rule.trigger_lng),
      apiKey,
      { cache: 'no-store' },
    );

    const evaluation = evaluateDisasterAlertRule(rule as DisasterAlertRule, weather, now);
    if (!evaluation.matched || !evaluation.signature) {
      results.push({
        rule_id: String(rule.id),
        matched: false,
        emitted: false,
        suppressed_by_cooldown: false,
        reason: 'Current weather did not cross the configured alert rule.',
      });
      continue;
    }

    if (isCooldownActive(rule, evaluation.signature, now)) {
      results.push({
        rule_id: String(rule.id),
        matched: true,
        emitted: false,
        suppressed_by_cooldown: true,
        reason: 'Cooldown suppressed a repeated alert pattern.',
      });
      continue;
    }

    const emitted = await emitDisasterAlertForRule({
      rule,
      evaluation,
      weather,
      issuedAt: now,
    });

    if (!emitted) {
      results.push({
        rule_id: String(rule.id),
        matched: true,
        emitted: false,
        suppressed_by_cooldown: false,
        reason: 'No households matched this rule scope.',
      });
      continue;
    }

    const auditActorId = options?.initiatedBy
      ? await requireSupabaseUserId(options.initiatedBy)
      : (typeof rule.created_by === 'string' ? rule.created_by : null);

    await insertAuditLogBySupabaseUserId(auditActorId, 'CREATE', 'disaster_alert', String(emitted.alert.id), {
      rule_id: rule.id,
      hazard: rule.hazard,
      severity: evaluation.severity,
      trigger_source: evaluation.triggerSource,
      reachable_household_count: emitted.reachableHouseholdCount,
      unreachable_household_count: emitted.unreachableHouseholdCount,
    });

    results.push({
      rule_id: String(rule.id),
      matched: true,
      emitted: true,
      suppressed_by_cooldown: false,
      reason: evaluation.triggerReason,
      alert_id: String(emitted.alert.id),
    });
  }

  return {
    evaluated_at: now.toISOString(),
    rule_count: (rules ?? []).length,
    emitted_count: results.filter((result) => result.emitted).length,
    suppressed_count: results.filter((result) => result.suppressed_by_cooldown).length,
    results,
  };
}

export async function listDisasterAlertRulesForUser(user: User) {
  assertAlertRuleViewer(user);
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from('disaster_alert_rules')
    .select('*')
    .eq('municipality', MABINI_MUNICIPALITY)
    .order('updated_at', { ascending: false });

  if (user.role === 'responder') {
    query = query.eq('barangay_id', user.barangay_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listDisasterAlertsForUser(user: User) {
  assertAlertHistoryViewer(user);
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from('disaster_alerts')
    .select('*')
    .eq('municipality', MABINI_MUNICIPALITY)
    .order('issued_at', { ascending: false })
    .limit(200);

  if (user.role === 'responder') {
    query = query.eq('barangay_id', user.barangay_id);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

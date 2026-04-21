import type {
  DisasterAlertRule,
  DisasterAlertSeverity,
  DisasterAlertTriggerSource,
  HazardType,
} from '@/lib/db/schema';
import type { FieldResponseWeatherPayload } from '@/lib/weather';
import { HAZARD_LABELS } from '@/lib/disaster-alerts';

type ThresholdSnapshot = {
  minRainChance: number | null;
  minRainIntensity: number | null;
  minNextHourPrecip: number | null;
  minWindGust: number | null;
};

type ThresholdBand = 'none' | 'watch' | 'warning';
export type AutomaticDisasterAlertThresholds = ThresholdSnapshot;

export type DisasterAlertEvaluationResult = {
  matched: boolean;
  severity: DisasterAlertSeverity | null;
  triggerSource: DisasterAlertTriggerSource | null;
  triggerReason: string;
  officialAlertTitles: string[];
  thresholdBand: ThresholdBand;
  weatherSummary: string;
  signature: string | null;
};

const DEFAULT_THRESHOLDS: Record<HazardType, ThresholdSnapshot> = {
  flood: {
    minRainChance: 70,
    minRainIntensity: 8,
    minNextHourPrecip: 6,
    minWindGust: null,
  },
  landslide: {
    minRainChance: 80,
    minRainIntensity: 12,
    minNextHourPrecip: 10,
    minWindGust: null,
  },
  typhoon: {
    minRainChance: null,
    minRainIntensity: null,
    minNextHourPrecip: null,
    minWindGust: 55,
  },
  storm_surge: {
    minRainChance: null,
    minRainIntensity: null,
    minNextHourPrecip: null,
    minWindGust: 60,
  },
  fire: {
    minRainChance: null,
    minRainIntensity: null,
    minNextHourPrecip: null,
    minWindGust: null,
  },
  earthquake: {
    minRainChance: null,
    minRainIntensity: null,
    minNextHourPrecip: null,
    minWindGust: null,
  },
};

const DEFAULT_OFFICIAL_KEYWORDS: Record<HazardType, string[]> = {
  flood: ['flood', 'heavy rain', 'rainfall'],
  landslide: ['landslide', 'soil', 'heavy rain', 'rainfall'],
  typhoon: ['typhoon', 'tropical cyclone', 'storm', 'gale', 'strong wind'],
  storm_surge: ['storm surge', 'coastal flood'],
  fire: ['fire'],
  earthquake: ['earthquake', 'aftershock'],
};

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function buildThirtyMinuteBucket(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const bucket = Math.floor(date.getUTCMinutes() / 30);
  return `${year}${month}${day}${hours}${bucket}`;
}

export function getAutomaticDisasterAlertThresholds(hazard: HazardType): AutomaticDisasterAlertThresholds {
  return { ...DEFAULT_THRESHOLDS[hazard] };
}

function getRuleThresholds(rule: Pick<DisasterAlertRule, 'hazard'>): ThresholdSnapshot {
  return getAutomaticDisasterAlertThresholds(rule.hazard);
}

function getAlertKeywords(rule: Pick<DisasterAlertRule, 'hazard' | 'official_keywords'>) {
  return Array.from(new Set(
    [...DEFAULT_OFFICIAL_KEYWORDS[rule.hazard], ...(rule.official_keywords ?? [])]
      .map(sanitizeKeyword)
      .filter(Boolean),
  ));
}

function getOfficialAlertTitles(
  weather: Pick<FieldResponseWeatherPayload, 'alerts'>,
  keywords: string[],
) {
  return weather.alerts
    .filter((alert) => alert.source === 'official')
    .filter((alert) => {
      const haystack = `${alert.title} ${alert.detail}`.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    })
    .map((alert) => alert.title.trim())
    .filter(Boolean);
}

function getEscalatedThreshold(value: number | null) {
  if (value === null) {
    return null;
  }

  return Number((value * 1.25).toFixed(1));
}

function formatMetricReason(label: string, value: number, threshold: number) {
  return `${label} ${Number(value.toFixed(1))} crossed ${Number(threshold.toFixed(1))}`;
}

function evaluateThresholdBand(
  weather: FieldResponseWeatherPayload,
  thresholds: ThresholdSnapshot,
) {
  const reasons: string[] = [];
  let band: ThresholdBand = 'none';

  const checks: Array<{
    label: string;
    value: number | null;
    threshold: number | null;
  }> = [
    {
      label: 'Rain chance',
      value: toNumber(weather.current.rainChance),
      threshold: thresholds.minRainChance,
    },
    {
      label: 'Rain intensity',
      value: toNumber(weather.current.rainIntensity),
      threshold: thresholds.minRainIntensity,
    },
    {
      label: 'Next-hour precipitation',
      value: toNumber(weather.current.nextHourPrecipitationPeak),
      threshold: thresholds.minNextHourPrecip,
    },
    {
      label: 'Wind gust',
      value: toNumber(weather.current.windGust),
      threshold: thresholds.minWindGust,
    },
  ];

  checks.forEach((check) => {
    if (check.value === null || check.threshold === null) {
      return;
    }

    const warningThreshold = getEscalatedThreshold(check.threshold);
    if (warningThreshold !== null && check.value >= warningThreshold) {
      band = 'warning';
      reasons.push(formatMetricReason(check.label, check.value, warningThreshold));
      return;
    }

    if (check.value >= check.threshold) {
      band = band === 'warning' ? 'warning' : 'watch';
      reasons.push(formatMetricReason(check.label, check.value, check.threshold));
    }
  });

  return {
    band,
    reason: reasons.join('; '),
  };
}

export function computeDisasterAlertTriggerSignature(input: {
  ruleId: string;
  hazard: HazardType;
  barangayId: string;
  purokSitio?: string | null;
  severity: DisasterAlertSeverity;
  triggerSource: DisasterAlertTriggerSource;
  matchKey: string;
  issuedAt: Date;
}) {
  const bucket = buildThirtyMinuteBucket(input.issuedAt);
  return [
    input.ruleId,
    input.hazard,
    input.barangayId,
    input.purokSitio?.trim() || 'all',
    input.severity,
    input.triggerSource,
    input.matchKey.trim().toLowerCase() || 'threshold',
    bucket,
  ].join(':');
}

export function evaluateDisasterAlertRule(
  rule: Pick<
    DisasterAlertRule,
    | 'id'
    | 'barangay_id'
    | 'purok_sitio'
    | 'hazard'
    | 'official_keywords'
    | 'min_rain_chance'
    | 'min_rain_intensity_mm_per_hr'
    | 'min_next_hour_precip_mm'
    | 'min_wind_gust_kph'
  >,
  weather: FieldResponseWeatherPayload,
  now = new Date(),
): DisasterAlertEvaluationResult {
  const thresholds = getRuleThresholds(rule);
  const alertKeywords = getAlertKeywords(rule);
  const officialAlertTitles = getOfficialAlertTitles(weather, alertKeywords);
  const thresholdResult = evaluateThresholdBand(weather, thresholds);
  const hasOfficialMatch = officialAlertTitles.length > 0;
  const hasThresholdMatch = thresholdResult.band !== 'none';

  if (!hasOfficialMatch && !hasThresholdMatch) {
    return {
      matched: false,
      severity: null,
      triggerSource: null,
      triggerReason: '',
      officialAlertTitles,
      thresholdBand: thresholdResult.band,
      weatherSummary: weather.summary,
      signature: null,
    };
  }

  const thresholdBand = thresholdResult.band as Exclude<ThresholdBand, 'none'>;
  const severity: DisasterAlertSeverity =
    hasOfficialMatch || thresholdBand === 'warning'
      ? 'warning'
      : 'watch';
  const triggerSource: DisasterAlertTriggerSource =
    hasOfficialMatch && hasThresholdMatch
      ? 'hybrid'
      : hasOfficialMatch
        ? 'official'
        : 'threshold';
  const reasons = [
    hasOfficialMatch ? `Matched official alert: ${officialAlertTitles.join(', ')}` : '',
    thresholdResult.reason,
  ].filter(Boolean);
  const matchKey = hasOfficialMatch ? officialAlertTitles.join('|') : thresholdResult.band;

  return {
    matched: true,
    severity,
    triggerSource,
    triggerReason: reasons.join('. '),
    officialAlertTitles,
    thresholdBand: thresholdResult.band,
    weatherSummary: weather.summary,
    signature: computeDisasterAlertTriggerSignature({
      ruleId: rule.id,
      hazard: rule.hazard,
      barangayId: rule.barangay_id,
      purokSitio: rule.purok_sitio,
      severity,
      triggerSource,
      matchKey,
      issuedAt: now,
    }),
  };
}

export function buildGeneratedDisasterAlertMessage(input: {
  hazard: HazardType;
  severity: DisasterAlertSeverity;
  barangayLabel: string;
  purokSitio?: string | null;
  triggerReason: string;
}) {
  const areaLabel = input.purokSitio?.trim()
    ? `${input.purokSitio.trim()}, ${input.barangayLabel}`
    : input.barangayLabel;
  const severityLine = input.severity === 'warning'
    ? 'Please prepare for immediate safety actions and monitor barangay instructions.'
    : 'Please stay alert and prepare for possible escalation.';

  return `${HAZARD_LABELS[input.hazard]} ${input.severity} for ${areaLabel}. ${severityLine} ${input.triggerReason}`.trim();
}

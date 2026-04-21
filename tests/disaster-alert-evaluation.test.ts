import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeDisasterAlertTriggerSignature,
  evaluateDisasterAlertRule,
} from '../lib/disaster-alert-evaluation';
import type { DisasterAlertRule } from '../lib/db/schema';
import type { FieldResponseWeatherPayload } from '../lib/weather';

function makeWeather(overrides?: Partial<FieldResponseWeatherPayload>): FieldResponseWeatherPayload {
  return {
    source: 'openweather',
    provider: {
      mode: 'onecall',
      label: 'OpenWeather',
      cadenceMinutes: 5,
    },
    generatedAt: '2026-04-15T00:00:00.000Z',
    location: {
      lat: 7.4,
      lng: 125.7,
      name: 'Mabini',
      rounded: false,
    },
    current: {
      time: '2026-04-15T00:00:00.000Z',
      temperature: 28,
      feelsLike: 31,
      dewPoint: 23,
      humidity: 88,
      windSpeed: 22,
      windDirection: 145,
      windDirectionCardinal: 'SE',
      windGust: 35,
      pressureSurfaceLevel: 1007,
      pressureSeaLevel: 1008,
      rainChance: 25,
      rainIntensity: 1,
      nextHourPrecipitationPeak: 0.5,
      precipitationType: 1,
      precipitationLabel: 'Rain',
      visibility: 8000,
      cloudCover: 75,
      cloudBase: 1500,
      cloudCeiling: 2200,
      uvIndex: 4,
      weatherCode: 500,
      weatherLabel: 'Light rain',
      thunderstormProbability: 10,
      heatStressIndex: 31,
    },
    today: {
      high: 31,
      low: 24,
      sunrise: '2026-04-15T21:15:00.000Z',
      sunset: '2026-04-16T09:42:00.000Z',
    },
    hourly: [],
    next24Hours: [],
    dailyOutlook: [],
    alerts: [],
    summary: 'Light rain expected.',
    ...overrides,
  };
}

function makeRule(overrides?: Partial<DisasterAlertRule>): DisasterAlertRule {
  return {
    id: 'rule-1',
    municipality: 'Mabini',
    barangay_id: 'anitapan',
    purok_sitio: undefined,
    hazard: 'flood',
    trigger_lat: 7.4,
    trigger_lng: 125.7,
    enabled: true,
    notify_responders: true,
    official_keywords: [],
    min_rain_chance: 70,
    min_rain_intensity_mm_per_hr: 8,
    min_next_hour_precip_mm: 6,
    min_wind_gust_kph: undefined,
    cooldown_minutes: 180,
    last_triggered_at: undefined,
    last_trigger_signature: undefined,
    createdAt: new Date('2026-04-15T00:00:00.000Z'),
    updatedAt: new Date('2026-04-15T00:00:00.000Z'),
    syncStatus: 'synced',
    ...overrides,
  };
}

test('evaluateDisasterAlertRule emits warning on official advisory matches', () => {
  const rule = makeRule({
    hazard: 'typhoon',
    official_keywords: ['typhoon', 'storm'],
    min_wind_gust_kph: 55,
  });
  const weather = makeWeather({
    current: {
      ...makeWeather().current,
      windGust: 40,
    },
    alerts: [
      {
        title: 'Typhoon advisory',
        detail: 'Official storm advisory in effect.',
        severity: 'warning',
        source: 'official',
      },
    ],
    summary: 'Typhoon advisory issued.',
  });

  const result = evaluateDisasterAlertRule(rule, weather, new Date('2026-04-15T03:15:00.000Z'));

  assert.equal(result.matched, true);
  assert.equal(result.severity, 'warning');
  assert.equal(result.triggerSource, 'official');
  assert.match(result.triggerReason, /Typhoon advisory/i);
  assert.ok(result.signature);
});

test('evaluateDisasterAlertRule emits watch when only threshold checks are met', () => {
  const rule = makeRule();
  const weather = makeWeather({
    current: {
      ...makeWeather().current,
      rainChance: 72,
      rainIntensity: 8.5,
      nextHourPrecipitationPeak: 6.1,
    },
    summary: 'Heavy rain is likely.',
  });

  const result = evaluateDisasterAlertRule(rule, weather, new Date('2026-04-15T03:15:00.000Z'));

  assert.equal(result.matched, true);
  assert.equal(result.severity, 'watch');
  assert.equal(result.triggerSource, 'threshold');
  assert.equal(result.thresholdBand, 'watch');
  assert.match(result.triggerReason, /Rain chance/i);
});

test('evaluateDisasterAlertRule ignores saved manual threshold overrides and uses automatic field-response thresholds', () => {
  const rule = makeRule({
    min_rain_chance: 10,
    min_rain_intensity_mm_per_hr: 0.5,
    min_next_hour_precip_mm: 0.2,
  });
  const weather = makeWeather({
    current: {
      ...makeWeather().current,
      rainChance: 25,
      rainIntensity: 1,
      nextHourPrecipitationPeak: 0.5,
    },
    summary: 'Light rain remains below the automatic alert trigger.',
  });

  const result = evaluateDisasterAlertRule(rule, weather, new Date('2026-04-15T03:15:00.000Z'));

  assert.equal(result.matched, false);
  assert.equal(result.signature, null);
});

test('evaluateDisasterAlertRule escalates to warning at the stronger threshold band', () => {
  const rule = makeRule();
  const weather = makeWeather({
    current: {
      ...makeWeather().current,
      rainChance: 90,
      rainIntensity: 11,
      nextHourPrecipitationPeak: 8.2,
    },
    summary: 'Extreme rainfall expected.',
  });

  const result = evaluateDisasterAlertRule(rule, weather, new Date('2026-04-15T03:15:00.000Z'));

  assert.equal(result.matched, true);
  assert.equal(result.severity, 'warning');
  assert.equal(result.triggerSource, 'threshold');
  assert.equal(result.thresholdBand, 'warning');
});

test('computeDisasterAlertTriggerSignature keeps the same 30-minute bucket and changes after it', () => {
  const first = computeDisasterAlertTriggerSignature({
    ruleId: 'rule-1',
    hazard: 'flood',
    barangayId: 'anitapan',
    purokSitio: 'Purok 1',
    severity: 'watch',
    triggerSource: 'threshold',
    matchKey: 'band-watch',
    issuedAt: new Date('2026-04-15T03:05:00.000Z'),
  });
  const second = computeDisasterAlertTriggerSignature({
    ruleId: 'rule-1',
    hazard: 'flood',
    barangayId: 'anitapan',
    purokSitio: 'Purok 1',
    severity: 'watch',
    triggerSource: 'threshold',
    matchKey: 'band-watch',
    issuedAt: new Date('2026-04-15T03:25:00.000Z'),
  });
  const third = computeDisasterAlertTriggerSignature({
    ruleId: 'rule-1',
    hazard: 'flood',
    barangayId: 'anitapan',
    purokSitio: 'Purok 1',
    severity: 'watch',
    triggerSource: 'threshold',
    matchKey: 'band-watch',
    issuedAt: new Date('2026-04-15T03:35:00.000Z'),
  });

  assert.equal(first, second);
  assert.notEqual(second, third);
});

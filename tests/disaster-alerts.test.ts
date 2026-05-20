import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDisasterAlertNotificationPayloadFromAlert,
  buildDisasterAlertNotificationBody,
  parseDisasterAlertNotification,
} from '../lib/disaster-alerts';
import type { DisasterAlert, UserNotification } from '../lib/db/schema';

test('parseDisasterAlertNotification returns the validated alert payload', () => {
  const notification = {
    id: 'notif-1',
    user_id: 'user-1',
    alert_id: 'alert-1',
    type: 'disaster_alert',
    title: 'Flood Warning',
    body: 'Alert body',
    payload: {
      alert_id: 'alert-1',
      rule_id: 'rule-1',
      municipality: 'Mabini',
      barangay_id: 'anitapan',
      purok_sitio: 'Purok 1',
      trigger_lat: 7.41234,
      trigger_lng: 125.81234,
      hazard: 'flood',
      severity: 'warning',
      title: 'Flood Warning',
      message: 'Move to the evacuation site immediately.',
      trigger_source: 'official',
      trigger_reason: 'PAGASA flood advisory',
      weather_summary: 'Heavy rain expected over the next hour.',
      evacuation_site: 'Barangay gymnasium',
      special_assistance_notes: 'Assist seniors first.',
      flood_control_status: 'partial',
      flood_control_notes: 'Canal clearing is still ongoing.',
      default_evacuation_site: 'Purok 1 covered court',
      warning_notes: 'Watch the creek behind the chapel.',
      issued_at: '2026-04-15T03:00:00.000Z',
    },
    createdAt: new Date('2026-04-15T03:00:00.000Z'),
    updatedAt: new Date('2026-04-15T03:00:00.000Z'),
  } satisfies UserNotification;

  const payload = parseDisasterAlertNotification(notification);

  assert.ok(payload);
  assert.equal(payload.alert_id, 'alert-1');
  assert.equal(payload.hazard, 'flood');
  assert.equal(payload.severity, 'warning');
  assert.equal(payload.trigger_lat, 7.41234);
  assert.equal(payload.trigger_lng, 125.81234);
  assert.equal(payload.evacuation_site, 'Barangay gymnasium');
  assert.equal(payload.flood_control_status, 'partial');
  assert.equal(payload.default_evacuation_site, 'Purok 1 covered court');
});

test('parseDisasterAlertNotification ignores non-disaster notifications', () => {
  const notification = {
    type: 'distribution_event',
    payload: {},
  } satisfies Pick<UserNotification, 'type' | 'payload'>;

  assert.equal(parseDisasterAlertNotification(notification), null);
});

test('buildDisasterAlertNotificationBody summarizes the hazard, area, and basis', () => {
  const body = buildDisasterAlertNotificationBody({
    hazard: 'landslide',
    severity: 'watch',
    barangay_id: 'pindasan',
    purok_sitio: 'Purok 5',
    municipality: 'Mabini',
    trigger_reason: 'Rain intensity 12 crossed 10',
    weather_summary: 'Sustained heavy rain this afternoon',
    flood_control_status: 'none',
    default_evacuation_site: 'Pindasan gym',
    warning_notes: 'Avoid the slope beside the highway',
  });

  assert.match(body, /Landslide watch/i);
  assert.match(body, /Purok 5/i);
  assert.match(body, /Flood control:/i);
  assert.match(body, /Default evacuation site:/i);
  assert.match(body, /Purok note:/i);
  assert.match(body, /Basis:/i);
  assert.match(body, /Weather:/i);
});

test('buildDisasterAlertNotificationPayloadFromAlert derives responder payload fields from alert data', () => {
  const alert: DisasterAlert = {
    id: 'alert-2',
    rule_id: 'rule-2',
    municipality: 'Mabini',
    barangay_id: 'anitapan',
    purok_sitio: 'Purok 3',
    hazard: 'flood',
    severity: 'warning',
    title: 'Flood Warning',
    message: 'Move now.',
    trigger_source: 'hybrid',
    trigger_reason: 'Rain and advisory threshold crossed',
    weather_snapshot: {
      summary: 'Heavy rain with gusty winds',
      official_alert_titles: ['PAGASA advisory'],
      rain_chance: 90,
      rain_intensity_mm_per_hr: 14,
      next_hour_precip_mm: 20,
      wind_gust_kph: 42,
    },
    evacuation_site: 'Anitapan gym',
    special_assistance_notes: 'Prioritize seniors.',
    notify_responders: true,
    reachable_household_count: 12,
    unreachable_household_count: 1,
    issued_at: new Date('2026-04-15T03:00:00.000Z'),
    createdAt: new Date('2026-04-15T03:00:00.000Z'),
    updatedAt: new Date('2026-04-15T03:00:00.000Z'),
    syncStatus: 'synced',
  };

  const payload = buildDisasterAlertNotificationPayloadFromAlert({
    alert,
    purokRiskProfile: {
      flood_control_status: 'partial',
      flood_control_notes: 'Canal is still being cleared.',
      default_evacuation_site: 'Purok 3 chapel',
      warning_notes: 'Watch the low creek crossing.',
    },
  });

  assert.equal(payload.alert_id, 'alert-2');
  assert.equal(payload.weather_summary, 'Heavy rain with gusty winds');
  assert.equal(payload.flood_control_status, 'partial');
  assert.equal(payload.default_evacuation_site, 'Purok 3 chapel');
  assert.equal(payload.issued_at, '2026-04-15T03:00:00.000Z');
});

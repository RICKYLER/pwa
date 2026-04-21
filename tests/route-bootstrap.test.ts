import assert from 'node:assert/strict';
import test from 'node:test';
import { getRouteBootstrapTables } from '../lib/supabase/route-bootstrap';

test('resident household route bootstraps residents in addition to households and notifications', () => {
  assert.deepEqual(
    getRouteBootstrapTables('/resident/household'),
    ['households', 'residents', 'vulnerability_flags', 'user_notifications', 'purok_risk_profiles'],
  );
  assert.deepEqual(
    getRouteBootstrapTables('/resident/household/member'),
    ['households', 'residents', 'vulnerability_flags', 'user_notifications', 'purok_risk_profiles'],
  );
  assert.deepEqual(
    getRouteBootstrapTables('/resident/notifications'),
    ['households', 'user_notifications', 'purok_risk_profiles'],
  );
});

test('alerts route bootstraps disaster alert history and rules', () => {
  assert.deepEqual(
    getRouteBootstrapTables('/alerts'),
    ['disaster_alerts', 'user_notifications', 'location_master_lists', 'purok_risk_profiles', 'disaster_alert_rules'],
  );
});

test('responder route bootstraps automatic alert rules for field map zones', () => {
  assert.deepEqual(
    getRouteBootstrapTables('/responder'),
    ['households', 'residents', 'vulnerability_flags', 'incidents', 'distribution_events', 'purok_risk_profiles', 'disaster_alert_rules'],
  );
});

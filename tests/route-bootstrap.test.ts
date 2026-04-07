import assert from 'node:assert/strict';
import test from 'node:test';
import { getRouteBootstrapTables } from '../lib/supabase/route-bootstrap';

test('resident household route bootstraps residents in addition to households and notifications', () => {
  assert.deepEqual(
    getRouteBootstrapTables('/resident/household'),
    ['households', 'residents', 'vulnerability_flags', 'user_notifications'],
  );
  assert.deepEqual(
    getRouteBootstrapTables('/resident/household/member'),
    ['households', 'residents', 'vulnerability_flags', 'user_notifications'],
  );
  assert.deepEqual(
    getRouteBootstrapTables('/resident/notifications'),
    ['households', 'user_notifications'],
  );
});

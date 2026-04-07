import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnalyticsBarangayScope, getAnalyticsScopeLabel } from '../lib/analytics-scope';

test('analytics scope removes barangay filtering for admin users', () => {
  assert.equal(getAnalyticsBarangayScope({
    role: 'admin',
    barangay_id: 'anitapan',
  }), undefined);
  assert.equal(getAnalyticsScopeLabel({
    role: 'admin',
    barangay_id: 'anitapan',
  }), 'all barangays');
});

test('analytics scope keeps barangay filtering for non-admin users', () => {
  assert.equal(getAnalyticsBarangayScope({
    role: 'encoder',
    barangay_id: 'cuambog',
  }), 'cuambog');
  assert.equal(getAnalyticsScopeLabel({
    role: 'encoder',
    barangay_id: 'cuambog',
  }), 'cuambog');
});

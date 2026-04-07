import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDistributionNotificationBody,
  getDistributionNotificationAudienceLabel,
  parseDistributionEventNotification,
} from '../lib/distribution-notifications';

test('buildDistributionNotificationBody includes the current status and audience', () => {
  const body = buildDistributionNotificationBody({
    type: 'disaster_relief',
    status: 'ongoing',
    scheduled_date: '2026-04-07',
    location: 'Barangay Hall',
    target_scope: 'resident',
    target_group: 'senior',
  });

  assert.match(body, /Disaster Relief distribution status: Ongoing\./);
  assert.match(body, /Barangay Hall/);
  assert.match(body, /Senior residents/);
});

test('getDistributionNotificationAudienceLabel formats all-household and grouped-resident labels', () => {
  assert.equal(getDistributionNotificationAudienceLabel('household', 'all'), 'All households');
  assert.equal(getDistributionNotificationAudienceLabel('resident', 'pwd'), 'PWD residents');
});

test('parseDistributionEventNotification returns a typed payload including status and notes', () => {
  const payload = parseDistributionEventNotification({
    type: 'distribution_event',
    payload: {
      event_id: 'dist_1',
      event_name: 'Food Pack Distribution',
      type: 'regular',
      status: 'completed',
      target_scope: 'household',
      target_group: 'all',
      scheduled_date: '2026-04-08',
      location: 'Covered Court',
      notes: 'Bring your claim stub.',
    },
  });

  assert.deepEqual(payload, {
    event_id: 'dist_1',
    event_name: 'Food Pack Distribution',
    type: 'regular',
    status: 'completed',
    target_scope: 'household',
    target_group: 'all',
    scheduled_date: '2026-04-08',
    location: 'Covered Court',
    notes: 'Bring your claim stub.',
  });
});

test('parseDistributionEventNotification defaults missing legacy status values to planned', () => {
  const payload = parseDistributionEventNotification({
    type: 'distribution_event',
    payload: {
      event_id: 'dist_legacy',
      event_name: 'Senior Support',
      type: 'regular',
      target_scope: 'resident',
      target_group: 'senior',
      scheduled_date: '2026-04-09',
      location: 'Barangay Gym',
    },
  });

  assert.equal(payload?.status, 'planned');
});

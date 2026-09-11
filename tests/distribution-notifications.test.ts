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
    claim_status: undefined,
  });
});

test('parseDistributionEventNotification passes through claim_status and drops invalid values', () => {
  const unclaimed = parseDistributionEventNotification({
    type: 'distribution_event',
    payload: {
      event_id: 'dist_partial',
      event_name: 'Relief Goods',
      type: 'emergency',
      status: 'completed',
      target_scope: 'household',
      target_group: 'all',
      scheduled_date: '2026-09-11',
      location: 'Covered Court',
      claim_status: 'unclaimed',
    },
  });
  assert.equal(unclaimed?.claim_status, 'unclaimed');

  const released = parseDistributionEventNotification({
    type: 'distribution_event',
    payload: {
      event_id: 'dist_partial',
      event_name: 'Relief Goods',
      type: 'emergency',
      status: 'completed',
      target_scope: 'household',
      target_group: 'all',
      scheduled_date: '2026-09-11',
      location: 'Covered Court',
      claim_status: 'released',
    },
  });
  assert.equal(released?.claim_status, 'released');

  const invalid = parseDistributionEventNotification({
    type: 'distribution_event',
    payload: {
      event_id: 'dist_partial',
      event_name: 'Relief Goods',
      type: 'emergency',
      status: 'completed',
      target_scope: 'household',
      target_group: 'all',
      scheduled_date: '2026-09-11',
      location: 'Covered Court',
      claim_status: 'bogus',
    },
  });
  assert.equal(invalid?.claim_status, undefined);
});

test('buildDistributionNotificationBody appends the follow-up sentence only for unclaimed claim status', () => {
  const unclaimedBody = buildDistributionNotificationBody({
    type: 'regular',
    status: 'completed',
    scheduled_date: '2026-09-11',
    location: 'Barangay Hall',
    target_scope: 'household',
    target_group: 'all',
    claim_status: 'unclaimed',
  });
  assert.match(unclaimedBody, /was not able to claim\. Contact the barangay for follow-up\.$/);

  const releasedBody = buildDistributionNotificationBody({
    type: 'regular',
    status: 'completed',
    scheduled_date: '2026-09-11',
    location: 'Barangay Hall',
    target_scope: 'household',
    target_group: 'all',
    claim_status: 'released',
  });
  assert.doesNotMatch(releasedBody, /not able to claim/);

  const genericBody = buildDistributionNotificationBody({
    type: 'regular',
    status: 'completed',
    scheduled_date: '2026-09-11',
    location: 'Barangay Hall',
    target_scope: 'household',
    target_group: 'all',
  });
  assert.doesNotMatch(genericBody, /not able to claim/);
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

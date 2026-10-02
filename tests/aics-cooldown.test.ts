import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAicsCooldown,
  isDisbursedOrApprovedAicsRecord,
  AICS_COOLDOWN_DAYS,
} from '../lib/aics/aics-cooldown';
import type { AicsRecord } from '../lib/db/schema';

test('1. returns eligible when there are no prior records', () => {
  const result = computeAicsCooldown([]);
  assert.equal(result.status, 'eligible');
  assert.equal(result.isUnderCooldown, false);
  assert.equal(result.daysRemaining, 0);
  assert.equal(result.badgeLabel, 'Eligible for Assistance');
});

test('2. returns cooldown when assistance was disbursed 30 days ago (< 90 days)', () => {
  const now = new Date('2026-10-02T00:00:00.000Z');
  const past30Days = new Date(now.getTime() - 30 * 86400000).toISOString();

  const record: Partial<AicsRecord> = {
    id: 'aics_1',
    client_name: 'Ricky Layno Contiga',
    status: 'disbursed',
    intake_date: past30Days.split('T')[0],
    disbursed_at: past30Days,
    amount_approved: 3000,
  };

  const result = computeAicsCooldown([record], now);
  assert.equal(result.status, 'cooldown');
  assert.equal(result.isUnderCooldown, true);
  assert.equal(result.daysElapsed, 30);
  assert.equal(result.daysRemaining, 60);
  assert.ok(result.badgeLabel.includes('60d left'));
  assert.ok(result.badgeLabelCeb.includes('60d nahabilin'));
});

test('3. returns eligible when assistance was disbursed 95 days ago (> 90 days)', () => {
  const now = new Date('2026-10-02T00:00:00.000Z');
  const past95Days = new Date(now.getTime() - 95 * 86400000).toISOString();

  const record: Partial<AicsRecord> = {
    id: 'aics_2',
    client_name: 'Ricky Layno Contiga',
    status: 'disbursed',
    intake_date: past95Days.split('T')[0],
    disbursed_at: past95Days,
    amount_approved: 5000,
  };

  const result = computeAicsCooldown([record], now);
  assert.equal(result.status, 'eligible');
  assert.equal(result.isUnderCooldown, false);
  assert.equal(result.daysRemaining, 0);
  assert.equal(result.daysElapsed, 95);
  assert.equal(result.badgeLabel, 'Eligible for New Claim');
});

test('4. ignores deleted or non-approved records', () => {
  const now = new Date('2026-10-02T00:00:00.000Z');
  const past5Days = new Date(now.getTime() - 5 * 86400000).toISOString();

  const deletedRecord: Partial<AicsRecord> = {
    id: 'aics_deleted',
    status: 'disbursed',
    is_deleted: true,
    disbursed_at: past5Days,
  };

  const pendingRecord: Partial<AicsRecord> = {
    id: 'aics_pending',
    status: 'pending',
    disbursed_at: past5Days,
  };

  const result = computeAicsCooldown([deletedRecord, pendingRecord], now);
  assert.equal(result.status, 'eligible');
  assert.equal(result.isUnderCooldown, false);
});

test('5. correctly evaluates multiple records and picks the most recent disbursement', () => {
  const now = new Date('2026-10-02T00:00:00.000Z');
  const past120Days = new Date(now.getTime() - 120 * 86400000).toISOString();
  const past10Days = new Date(now.getTime() - 10 * 86400000).toISOString();

  const oldRecord: Partial<AicsRecord> = {
    id: 'aics_old',
    status: 'disbursed',
    disbursed_at: past120Days,
    amount_approved: 2000,
  };

  const newRecord: Partial<AicsRecord> = {
    id: 'aics_new',
    status: 'disbursed',
    disbursed_at: past10Days,
    amount_approved: 3000,
  };

  const result = computeAicsCooldown([oldRecord, newRecord], now);
  assert.equal(result.status, 'cooldown');
  assert.equal(result.isUnderCooldown, true);
  assert.equal(result.daysElapsed, 10);
  assert.equal(result.daysRemaining, 80);
  assert.equal(result.lastAmount, 3000);
});

test('6. accurately matches prior records by resident_id for census registered clients', () => {
  const now = new Date('2026-10-02T00:00:00.000Z');
  const past20Days = new Date(now.getTime() - 20 * 86400000).toISOString();

  const allRecords: Partial<AicsRecord>[] = [
    {
      id: 'aics_other',
      resident_id: 'res_other_1',
      client_name: 'Other Person',
      status: 'disbursed',
      disbursed_at: past20Days,
      amount_approved: 5000,
    },
    {
      id: 'aics_target',
      resident_id: 'res_123',
      client_name: 'Ricky Ler Contiga',
      status: 'disbursed',
      disbursed_at: past20Days,
      amount_approved: 3000,
    },
  ];

  // When matched by resident_id
  const matchingRecords = allRecords.filter((r) => r.resident_id === 'res_123');
  const result = computeAicsCooldown(matchingRecords, now);

  assert.equal(result.status, 'cooldown');
  assert.equal(result.isUnderCooldown, true);
  assert.equal(result.daysElapsed, 20);
  assert.equal(result.daysRemaining, 70);
  assert.equal(result.lastAmount, 3000);
});



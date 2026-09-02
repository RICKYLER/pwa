import assert from 'node:assert/strict';
import test from 'node:test';
import type { VulnerabilityFlags } from '../lib/db/schema';
import {
  calculateResidentRisk,
  getFloodRiskLevel,
  getResidentVulnerabilityScore,
  getRiskTier,
  getSectorCompositeScore,
  getVulnerabilitySuggestions,
} from '../lib/db/risk-scoring';

function baseFlags(overrides: Partial<VulnerabilityFlags> = {}): VulnerabilityFlags {
  return {
    id: 'vf_test',
    resident_id: 'res_test',
    is_child: false,
    is_adult: true,
    is_senior: false,
    is_pregnant: false,
    is_pwd: false,
    has_chronic_illness: false,
    is_low_income: false,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    syncStatus: 'synced',
    ...overrides,
  };
}

test('score is zero and tier low for a resident with no flags', () => {
  const flags = baseFlags();
  assert.equal(getResidentVulnerabilityScore(flags), 0);
  assert.equal(getRiskTier(0), 'low');
  assert.equal(calculateResidentRisk(flags).tier, 'low');
});

test('a single senior flag scores medium', () => {
  const flags = baseFlags({ is_senior: true });
  assert.equal(getResidentVulnerabilityScore(flags), 4);
  assert.equal(getRiskTier(4), 'medium');
});

test('PWD combined with low income scores high', () => {
  const flags = baseFlags({ is_pwd: true, is_low_income: true });
  assert.equal(getResidentVulnerabilityScore(flags), 7);
  assert.equal(getRiskTier(7), 'high');
});

test('overlapping severe flags earn a bonus', () => {
  const flags = baseFlags({ is_senior: true, is_pwd: true, is_low_income: true });
  // senior(4) + pwd(5) + low_income(2) + overlap(3) = 14
  assert.equal(getResidentVulnerabilityScore(flags), 14);
  assert.equal(calculateResidentRisk(flags).tier, 'high');
});

test('pregnancy data present but flag unconfirmed triggers a suggestion', () => {
  const flags = baseFlags({ pregnancy_months: 5 });
  const suggestions = getVulnerabilitySuggestions(flags);
  assert.ok(suggestions.some((s) => s.flag === 'pregnant'));
});

test('confirmed pregnancy does not suggest anything on its own', () => {
  const flags = baseFlags({ is_pregnant: true, pregnancy_months: 5 });
  assert.equal(getVulnerabilitySuggestions(flags).length, 0);
});

test('manual flags not re-verified in 12 months trigger re-verification', () => {
  const old = new Date('2024-01-01T00:00:00Z');
  const flags = baseFlags({ is_pwd: true, last_verified_at: old });
  const suggestions = getVulnerabilitySuggestions(flags, new Date('2026-09-01T00:00:00Z'));
  assert.ok(suggestions.some((s) => s.flag === 'reverify'));
});

test('recently verified flags do not trigger re-verification', () => {
  const recent = new Date('2026-08-01T00:00:00Z');
  const flags = baseFlags({ is_pwd: true, last_verified_at: recent });
  const suggestions = getVulnerabilitySuggestions(flags, new Date('2026-09-01T00:00:00Z'));
  assert.ok(!suggestions.some((s) => s.flag === 'reverify'));
});

test('flood risk level maps flood profile to exposure', () => {
  assert.equal(getFloodRiskLevel(true, 'none'), 'high');
  assert.equal(getFloodRiskLevel(true, 'partial'), 'medium');
  assert.equal(getFloodRiskLevel(true, 'protected'), 'low');
  assert.equal(getFloodRiskLevel(false, 'none'), 'none');
});

test('sector composite score adds a flood exposure bonus', () => {
  assert.equal(getSectorCompositeScore(2, 'none'), 2);
  assert.equal(getSectorCompositeScore(2, 'high'), 5);
  assert.equal(getSectorCompositeScore(0, 'medium'), 2);
});

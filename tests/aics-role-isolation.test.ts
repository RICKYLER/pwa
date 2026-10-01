import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultRouteForUser } from '../lib/auth';
import {
  AICS_CLIENT_CATEGORIES,
  AICS_INTAKE_MODES,
  AICS_SECTORS,
  getAicsSubCategories,
} from '../lib/aics/aics-categories';
import type { User } from '../lib/db/schema';

function makeUser(overrides: Partial<User>): User {
  return {
    id: overrides.id ?? 'user-aics',
    email: overrides.email ?? 'aics@mswdo.mabini.gov.ph',
    name: overrides.name ?? 'AICS Officer',
    role: overrides.role ?? 'aics_focal',
    status: overrides.status ?? 'active',
    barangay_id: overrides.barangay_id ?? 'poblacion',
    must_change_password: overrides.must_change_password ?? false,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  };
}

test('1. aics_focal routes directly to /aics upon login', () => {
  const aicsOfficer = makeUser({ role: 'aics_focal' });
  assert.equal(getDefaultRouteForUser(aicsOfficer), '/aics');
});

test('2. social_worker routes to /cases and does not land on /aics', () => {
  const socialWorker = makeUser({ role: 'social_worker' });
  assert.equal(getDefaultRouteForUser(socialWorker), '/cases');
});

test('3. AICS Intake Modes match General Intake Sheet (Photo 1)', () => {
  const modes = AICS_INTAKE_MODES.map((m) => m.id);
  assert.deepEqual(modes, ['walk_in', 'referred', 'rescued']);
});

test('4. AICS Sectors match General Intake Sheet (Photo 1)', () => {
  const sectorIds = AICS_SECTORS.map((s) => s.id);
  assert.ok(sectorIds.includes('4ps'));
  assert.ok(sectorIds.includes('children'));
  assert.ok(sectorIds.includes('youth'));
  assert.ok(sectorIds.includes('women'));
  assert.ok(sectorIds.includes('senior_citizen'));
  assert.ok(sectorIds.includes('pwd'));
  assert.ok(sectorIds.includes('solo_parent'));
});

test('5. AICS 4 Client Categories match official MSWDO Matrix (Photos 3 & 4)', () => {
  const keys = Object.keys(AICS_CLIENT_CATEGORIES);
  assert.deepEqual(keys, ['fhona', 'senior_citizen', 'pwd', 'ynsp']);

  // Check FHONA sub-categories (Photo 3)
  const fhonaSubs = getAicsSubCategories('fhona');
  assert.ok(fhonaSubs.includes('Dialysis Patients'));
  assert.ok(fhonaSubs.includes('Individuals with Cancer'));
  assert.ok(fhonaSubs.includes('Repatriated OFW'));
  assert.ok(fhonaSubs.includes('4Ps Beneficiaries'));
  assert.ok(fhonaSubs.includes('NONE OF THE ABOVE'));

  // Check PWD sub-categories (Photo 3)
  const pwdSubs = getAicsSubCategories('pwd');
  assert.ok(pwdSubs.includes('Deaf/Hard of Hearing Disability'));
  assert.ok(pwdSubs.includes('Physical Disability (Orthopedic)'));
  assert.ok(pwdSubs.includes('Visually impaired'));

  // Check YNSP sub-categories (Photo 4)
  const ynspSubs = getAicsSubCategories('ynsp');
  assert.ok(ynspSubs.includes('Children in Conflict with the Law (9 to < 18 yrs. old)'));
  assert.ok(ynspSubs.includes('Pre-delinquent Youth'));
});

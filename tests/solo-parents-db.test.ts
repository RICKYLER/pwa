import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSoloParent,
  getSoloParents,
  getSoloParentById,
  renewSoloParent,
  updateSoloParent,
  deleteSoloParent,
  revokeSoloParent,
  reactivateSoloParent,
  generateSoloParentIdNumber,
} from '../lib/db/solo-parents';
import { db, STORE_NAMES } from '../lib/db/indexeddb';
import type { VulnerabilityFlags } from '../lib/db/schema';

test('1. generateSoloParentIdNumber creates standardized SP-YYYY-XXXX format', async () => {
  const idNumber = await generateSoloParentIdNumber();
  const currentYear = new Date().getFullYear();
  assert.ok(idNumber.startsWith(`SP-${currentYear}-`));
});

test('2. createSoloParent saves record and updates vulnerability flag', async () => {
  // Pre-seed a dummy vulnerability flag in memory
  const dummyResId = 'res_test_solo_parent_1';
  const dummyFlag: VulnerabilityFlags = {
    id: 'flag_test_1',
    resident_id: dummyResId,
    is_child: false,
    is_adult: true,
    is_senior: false,
    is_pregnant: false,
    is_pwd: false,
    has_chronic_illness: false,
    is_low_income: true,
    updatedAt: new Date(),
    syncStatus: 'synced',
  };
  await db.put(STORE_NAMES.vulnerability_flags, dummyFlag);

  const sp = await createSoloParent({
    id_number: 'SP-2026-TEST-0001',
    resident_id: dummyResId,
    household_id: 'hh_test_1',
    full_name: 'Maria Dela Cruz',
    birthdate: '1992-05-15',
    age: 34,
    gender: 'F',
    barangay_id: 'cadunan',
    purok_sitio: 'Purok 1',
    category: 'unmarried',
    monthly_income: 12000,
    is_minimum_wage_or_below: true,
    dependents: [
      {
        full_name: 'Junior Dela Cruz',
        birthdate: '2016-08-10',
        age: 10,
        relationship: 'Son',
        is_studying: true,
        is_pwd: false,
      },
    ],
    requirements: {
      barangay_cert: true,
      birth_certificates: true,
      justification_proof: false,
      income_proof: true,
    },
    issued_at: '2026-09-28',
    expires_at: '2027-09-28',
    encoder_name: 'MSWDO Staff',
    status: 'active',
  });

  assert.ok(sp.id.startsWith('sp_'));
  assert.equal(sp.full_name, 'Maria Dela Cruz');
  assert.equal(sp.is_minimum_wage_or_below, true);

  // Check that vulnerability flag was auto-synced
  const flags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);
  const foundFlag = flags.find((f) => f.resident_id === dummyResId);
  assert.ok(foundFlag);
  assert.equal(foundFlag.is_solo_parent, true);
  assert.equal(foundFlag.solo_parent_id, 'SP-2026-TEST-0001');
  assert.equal(foundFlag.solo_parent_category, 'unmarried');

  // Verify query by filter
  const activeSubsidyRecords = await getSoloParents({
    status: 'active',
    subsidy_only: true,
    barangay_id: 'cadunan',
  });
  assert.ok(activeSubsidyRecords.some((r) => r.id_number === 'SP-2026-TEST-0001'));
});

test('3. renewSoloParent extends validity by 1 year', async () => {
  const records = await getSoloParents({ query: 'Maria Dela Cruz' });
  assert.ok(records.length > 0);
  const target = records[0];

  const renewed = await renewSoloParent(target.id, '2027-09-28');
  assert.equal(renewed.status, 'active');
  assert.equal(renewed.expires_at, '2028-09-28');
});

test('4. revokeSoloParent revokes status, sets reason/date, and unflags vulnerability', async () => {
  const records = await getSoloParents({ query: 'Maria Dela Cruz' });
  const target = records[0];

  const revoked = await revokeSoloParent(
    target.id,
    '💍 Remarried / Cohabiting with Partner',
    '2026-09-28'
  );

  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revocation_reason, '💍 Remarried / Cohabiting with Partner');
  assert.equal(revoked.revocation_date, '2026-09-28');

  // Verify that the vulnerability flag was unflagged so they are no longer counted as active solo parent
  const flags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);
  const flag = flags.find((f) => f.resident_id === target.resident_id);
  assert.ok(flag);
  assert.equal(flag.is_solo_parent, false);
});

test('5. reactivateSoloParent restores active status and re-flags vulnerability', async () => {
  const records = await getSoloParents({ query: 'Maria Dela Cruz' });
  const target = records[0];

  const reactivated = await reactivateSoloParent(target.id);
  assert.equal(reactivated.status, 'active');
  assert.equal(reactivated.revocation_reason, undefined);

  const flags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);
  const flag = flags.find((f) => f.resident_id === target.resident_id);
  assert.ok(flag);
  assert.equal(flag.is_solo_parent, true);
});

test('6. deleteSoloParent deletes record and unflags vulnerability', async () => {
  const records = await getSoloParents({ query: 'Maria Dela Cruz' });
  const target = records[0];

  await deleteSoloParent(target.id);

  const found = await getSoloParentById(target.id);
  assert.equal(found, undefined);

  // Check vulnerability flag
  const flags = await db.getAll<VulnerabilityFlags>(STORE_NAMES.vulnerability_flags);
  const flag = flags.find((f) => f.resident_id === target.resident_id);
  assert.ok(flag);
  assert.equal(flag.is_solo_parent, false);
});

test('7. mapSupabaseRow restores revocation details from requirements._revocation without schema error', async () => {
  const { mapSupabaseRow } = await import('../lib/supabase/row-mapper');

  const supabaseRow = {
    id: 'sp_test_sync',
    id_number: 'SP-2026-0099',
    full_name: 'Juana Dela Cruz',
    category: 'unmarried',
    status: 'revoked',
    requirements: {
      barangay_cert: true,
      _revocation: {
        reason: '💍 Remarried',
        date: '2026-09-28',
      },
    },
    birthdate: '1990-01-01',
    issued_at: '2026-01-01',
    expires_at: '2027-01-01',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-09-28T00:00:00.000Z',
  };

  const mapped = mapSupabaseRow('solo_parents', supabaseRow) as any;
  assert.equal(mapped.id, 'sp_test_sync');
  assert.equal(mapped.status, 'revoked');
  assert.equal(mapped.revocation_reason, '💍 Remarried');
  assert.equal(mapped.revocation_date, '2026-09-28');
  assert.equal(mapped.syncStatus, 'synced');
});


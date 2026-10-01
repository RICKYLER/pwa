import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAicsRecord,
  getAicsRecords,
  getAicsRecord,
  updateAicsRecord,
  deleteAicsRecord,
  generateAicsControlNumber,
} from '../lib/db/aics';
import { db, STORE_NAMES } from '../lib/db/indexeddb';
import type { SyncQueueItem } from '../lib/db/schema';

test('1. generateAicsControlNumber formats as AICS-YYYY-XXXX', () => {
  const cn = generateAicsControlNumber();
  const year = new Date().getFullYear();
  assert.match(cn, new RegExp(`^AICS-${year}-\\d{4}$`));
});

test('2. createAicsRecord creates record in IndexedDB store with pending sync', async () => {
  const created = await createAicsRecord({
    control_number: 'AICS-2026-9901',
    intake_date: '2026-09-30',
    intake_category: 'walk_in',
    sectors: ['pwd'],
    client_category: 'pwd',
    sub_category: 'Person with Disabilities (PWD)',
    client_name: 'Juan Dela Cruz',
    client_age: 45,
    client_gender: 'Male',
    barangay_id: 'cadunan',
    purok_sitio: 'Purok 2',
    contact_number: '09123456789',
    assistance_type: 'medical',
    specific_assistance: 'Medicine Assistance for Hypertension',
    amount_approved: 3000,
    disbursement_type: 'cash',
    status: 'approved',
  });

  assert.ok(created.id.startsWith('aics_'));
  assert.equal(created.control_number, 'AICS-2026-9901');
  assert.equal(created.client_name, 'Juan Dela Cruz');
  assert.equal(created.amount_approved, 3000);

  const fromDb = await getAicsRecord(created.id);
  assert.ok(fromDb);
  assert.equal(fromDb?.client_name, 'Juan Dela Cruz');
});

test('3. getAicsRecords correctly filters records', async () => {
  const list = await getAicsRecords({ client_category: 'pwd' });
  assert.ok(list.length > 0);
  assert.equal(list[0].client_category, 'pwd');

  const filtered = await getAicsRecords({ assistance_type: 'burial' });
  assert.equal(filtered.length, 0);

  const searched = await getAicsRecords({ query: 'Juan' });
  assert.ok(searched.length > 0);
});

test('4. updateAicsRecord modifies existing record', async () => {
  const list = await getAicsRecords({ query: 'Juan Dela Cruz' });
  assert.ok(list.length > 0);
  const target = list[0];

  const updated = await updateAicsRecord(target.id, {
    status: 'disbursed',
    amount_approved: 4000,
  });

  assert.equal(updated.status, 'disbursed');
  assert.equal(updated.amount_approved, 4000);

  const fromDb = await getAicsRecord(target.id);
  assert.equal(fromDb?.status, 'disbursed');
  assert.equal(fromDb?.amount_approved, 4000);
});

test('5. deleteAicsRecord soft deletes the record', async () => {
  const list = await getAicsRecords({ query: 'Juan Dela Cruz' });
  assert.ok(list.length > 0);
  const target = list[0];

  const ok = await deleteAicsRecord(target.id, 'admin_user');
  assert.equal(ok, true);

  const foundActive = await getAicsRecord(target.id);
  assert.equal(foundActive, undefined);

  const allIncludingDeleted = await getAicsRecords({ includeDeleted: true, query: 'Juan Dela Cruz' });
  assert.ok(allIncludingDeleted.length > 0);
  assert.equal(allIncludingDeleted[0].is_deleted, true);
});

test('6. db.put sets operation to create if item is new, and update if item exists', async () => {
  const dummyId = `test_sync_${Date.now()}`;
  const dummyItem = {
    id: dummyId,
    name: 'Test Record',
    syncStatus: 'pending',
  };

  // Initially does not exist in store -> should queue 'create'
  await db.put(STORE_NAMES.cases, dummyItem);
  const queueItem1 = await db.get<SyncQueueItem>(STORE_NAMES.sync_queue, `${STORE_NAMES.cases}:${dummyId}`);
  assert.ok(queueItem1);
  assert.equal(queueItem1?.operation, 'create');

  // Now it exists in store -> second put should queue 'update'
  await db.put(STORE_NAMES.cases, {
    ...dummyItem,
    name: 'Updated Test Record',
  });
  const queueItem2 = await db.get<SyncQueueItem>(STORE_NAMES.sync_queue, `${STORE_NAMES.cases}:${dummyId}`);
  assert.ok(queueItem2);
  assert.equal(queueItem2?.operation, 'update');
});

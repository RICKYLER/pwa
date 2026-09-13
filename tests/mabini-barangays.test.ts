import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BARANGAY_BOUNDARY_COLORS,
  BARANGAY_REGISTRY,
  MABINI_MUNICIPAL_PSGC,
  formatBarangayArea,
  getBarangayByPsgc,
  getBarangayPsgc,
  isMabiniBarangayId,
} from '../lib/mabini-barangays';
import { BARANGAY_IDS } from '../lib/barangays';

const EXPECTED_AREAS: Record<string, number> = {
  cadunan: 18.43425703,
  pindasan: 6.47417964,
  cuambog: 2.41070776,
  tagnanan: 16.07704139,
  anitapan: 20.29265403,
  cabuyuan: 16.27668413,
  'del-pilar': 13.87286252,
  libodon: 14.90344152,
  'golden-valley': 88.24734446,
  pangibiran: 14.93844857,
  'san-antonio': 2.65369552,
};

const EXPECTED_PSGC: Record<string, string> = {
  cadunan: '1108203002',
  pindasan: '1108203006',
  cuambog: '1108203007',
  tagnanan: '1108203011',
  anitapan: '1108203012',
  cabuyuan: '1108203013',
  'del-pilar': '1108203014',
  libodon: '1108203015',
  'golden-valley': '1108203016',
  pangibiran: '1108203017',
  'san-antonio': '1108203018',
};

test('Mabini municipality PSGC is configured', () => {
  assert.equal(MABINI_MUNICIPAL_PSGC, '1108203000');
});

test('barangay registry covers all 11 barangays of Mabini', () => {
  assert.equal(BARANGAY_REGISTRY.length, 11);
  assert.deepEqual(
    BARANGAY_REGISTRY.map((entry) => entry.id).sort(),
    [...BARANGAY_IDS].sort(),
  );
});

test('barangay registry carries the verified PSGC codes', () => {
  BARANGAY_REGISTRY.forEach((entry) => {
    assert.equal(
      entry.psgc,
      EXPECTED_PSGC[entry.id],
      `PSGC mismatch for ${entry.id}`,
    );
  });
});

test('barangay registry carries the verified land areas', () => {
  BARANGAY_REGISTRY.forEach((entry) => {
    assert.ok(
      Math.abs(entry.areaKm2 - EXPECTED_AREAS[entry.id]!) < 1e-9,
      `Area mismatch for ${entry.id}`,
    );
  });
});

test('PSGC lookups resolve registry entries', () => {
  assert.equal(getBarangayByPsgc('1108203002')?.id, 'cadunan');
  assert.equal(getBarangayByPsgc('1108203016')?.id, 'golden-valley');
  assert.equal(getBarangayByPsgc('9999999999'), null);
  assert.equal(getBarangayPsgc('san-antonio'), '1108203018');
  assert.equal(getBarangayPsgc('not-a-barangay'), null);
});

test('every barangay gets a distinct boundary color', () => {
  const fillColors = new Set<string>();
  const strokeColors = new Set<string>();
  BARANGAY_IDS.forEach((id) => {
    const colors = BARANGAY_BOUNDARY_COLORS[id];
    assert.ok(colors, `Missing boundary colors for ${id}`);
    assert.match(colors.fill, /^#[0-9a-f]{6}$/i);
    assert.match(colors.stroke, /^#[0-9a-f]{6}$/i);
    fillColors.add(colors.fill.toLowerCase());
    strokeColors.add(colors.stroke.toLowerCase());
  });
  assert.equal(fillColors.size, 11, 'Fill colors must be unique per barangay');
  assert.equal(strokeColors.size, 11, 'Stroke colors must be unique per barangay');
});

test('isMabiniBarangayId validates barangay ids', () => {
  assert.equal(isMabiniBarangayId('cadunan'), true);
  assert.equal(isMabiniBarangayId('mati'), false);
});

test('formatBarangayArea renders two decimal places', () => {
  assert.equal(formatBarangayArea(18.43425703), '18.43 km²');
  assert.equal(formatBarangayArea(88.24734446), '88.25 km²');
  assert.equal(formatBarangayArea(2.65369552), '2.65 km²');
});

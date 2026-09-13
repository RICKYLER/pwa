import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDefaultSearchBounds, mergePurokOptions, normalizePurokSitio } from '../lib/geocoding';
import { MABINI_MAP_BOUNDS } from '../lib/mabini';

test('mergePurokOptions only keeps normalized values from real data', () => {
  assert.deepEqual(
    mergePurokOptions(['prk 10', 'Sitio uno', 'Lower valley', '', 'Purok 2', 'prk 2']),
    ['Lower Valley', 'Purok 2', 'Purok 10', 'Sitio Uno'],
  );
});

test('normalizePurokSitio accepts both shorthand and custom purok names', () => {
  assert.equal(normalizePurokSitio('prk 4'), 'Purok 4');
  assert.equal(normalizePurokSitio('lower riverside'), 'Lower Riverside');
});

test('default search bounds cover the full Mabini municipal extent', () => {
  const bounds = buildDefaultSearchBounds();
  assert.equal(bounds.north, MABINI_MAP_BOUNDS.north);
  assert.equal(bounds.south, MABINI_MAP_BOUNDS.south);
  assert.equal(bounds.east, MABINI_MAP_BOUNDS.east);
  assert.equal(bounds.west, MABINI_MAP_BOUNDS.west);
  // Guard against the old ±0.08° box that cut off the eastern barangays
  // (municipality extends past 126.07°E).
  assert.ok(bounds.east >= 126.07);
});

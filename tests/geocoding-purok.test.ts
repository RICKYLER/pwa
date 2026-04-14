import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePurokOptions, normalizePurokSitio } from '../lib/geocoding';

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

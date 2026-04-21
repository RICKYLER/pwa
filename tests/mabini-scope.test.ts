import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isBarangayId,
  isMabiniMunicipality,
  normalizeMabiniMunicipality,
} from '../lib/barangays';

test('isMabiniMunicipality accepts Mabini regardless of case', () => {
  assert.equal(isMabiniMunicipality('Mabini'), true);
  assert.equal(isMabiniMunicipality('mabini'), true);
  assert.equal(isMabiniMunicipality(' Nabini '), false);
});

test('isBarangayId accepts only Mabini barangays from the configured list', () => {
  assert.equal(isBarangayId('anitapan'), true);
  assert.equal(isBarangayId('pindasan'), true);
  assert.equal(isBarangayId('mati'), false);
});

test('normalizeMabiniMunicipality returns the fixed municipality label', () => {
  assert.equal(normalizeMabiniMunicipality(), 'Mabini');
});

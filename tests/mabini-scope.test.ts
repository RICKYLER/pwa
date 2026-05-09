import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isBarangayId,
  isMabiniMunicipality,
  normalizeMabiniMunicipality,
} from '../lib/barangays';
import {
  MABINI_BOUNDARY_PATHS,
  isNearMabini,
  MABINI_CENTER,
  MABINI_LOCATION_LABEL,
  MABINI_MEDICAL_FACILITIES,
} from '../lib/mabini';
import { parseWeatherCoordinates } from '../lib/weather';

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

test('default weather coordinates fall back to Mabini municipal center', () => {
  const { lat, lng } = parseWeatherCoordinates(new URLSearchParams());

  assert.equal(lat, MABINI_CENTER.lat);
  assert.equal(lng, MABINI_CENTER.lng);
});

test('Mabini medical facilities stay within the configured municipality bounds', () => {
  assert.equal(MABINI_LOCATION_LABEL, 'Mabini, Davao de Oro, Region XI');
  assert.equal(MABINI_MEDICAL_FACILITIES.length, 0);
});

test('Mabini boundary paths stay within the configured municipality bounds', () => {
  assert.ok(MABINI_BOUNDARY_PATHS.length >= 1);
  assert.equal(
    MABINI_BOUNDARY_PATHS.every((path) => path.every((point) => isNearMabini(point.lat, point.lng))),
    true,
  );
});

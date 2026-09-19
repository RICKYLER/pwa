import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOsmAddress, parseNominatimQuality } from '../lib/osm-geocoding';

test('parseNominatimQuality identifies street level when road or house number is present', () => {
  assert.equal(parseNominatimQuality({ road: 'National Highway', house_number: '12' }), 'street');
  assert.equal(parseNominatimQuality({ residential: 'Purok 1 Road' }), 'street');
  assert.equal(parseNominatimQuality({ pedestrian: 'Town Plaza Walkway' }), 'street');
});

test('parseNominatimQuality identifies neighborhood level when village or neighbourhood is present without street', () => {
  assert.equal(parseNominatimQuality({ neighbourhood: 'Makugihon', town: 'Mabini' }), 'neighborhood');
  assert.equal(parseNominatimQuality({ village: 'Anitapan', municipality: 'Mabini' }), 'neighborhood');
  assert.equal(parseNominatimQuality({ suburb: 'Poblacion' }), 'neighborhood');
});

test('parseNominatimQuality defaults to city level when only town or city is available', () => {
  assert.equal(parseNominatimQuality({ town: 'Mabini', state: 'Davao de Oro' }), 'city');
  assert.equal(parseNominatimQuality({ city: 'Tagum' }), 'city');
  assert.equal(parseNominatimQuality(undefined), 'city');
});

test('formatOsmAddress constructs a clean hierarchical address', () => {
  const formatted = formatOsmAddress({
    place_id: 12345,
    lat: '7.308',
    lon: '125.853',
    display_name: 'Long Raw String, With, Many, Redundant, Parts, 8807, Philippines',
    address: {
      road: 'Purok 3',
      neighbourhood: 'Cuambogan',
      town: 'Mabini',
      state: 'Davao de Oro',
      country: 'Philippines',
    },
  });

  assert.equal(formatted, 'Purok 3, Cuambogan, Mabini, Davao de Oro');
});

test('formatOsmAddress falls back to display_name when address details are empty', () => {
  const formatted = formatOsmAddress({
    place_id: 999,
    lat: '7.0',
    lon: '125.0',
    display_name: 'Fallback Location Name',
  });

  assert.equal(formatted, 'Fallback Location Name');
});

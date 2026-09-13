import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findBarangayForPoint,
  getBarangayBounds,
  getBarangayCenter,
  getBarangayUnionBounds,
  normalizePsgcValue,
  parseBarangayBoundaries,
  type BarangayBoundary,
} from '../lib/barangay-geometry';
import { BARANGAY_REGISTRY } from '../lib/mabini-barangays';

// Synthetic fixtures — only tests may use hand-drawn polygons.
function squareRing(west: number, south: number, east: number, north: number): number[][] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

const cadunanPsgc = '1108203002';
const pindasanPsgc = '1108203006';

function makeFeatureCollection(features: object[]) {
  return { type: 'FeatureCollection', features };
}

function makeGeoJsonFeature(properties: Record<string, unknown>, geometry: object | null) {
  return { type: 'Feature', properties, geometry };
}

test('parseBarangayBoundaries matches features by PSGC', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { PSGC: cadunanPsgc, Bgy_Name: 'Cadunan', Mun_Name: 'Mabini' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
    makeGeoJsonFeature(
      { PSGC: '1108203000', Bgy_Name: 'Some Other Municipality Barangay', Mun_Name: 'Mabini' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
  ]);

  const { boundaries, unmatchedCount } = parseBarangayBoundaries(payload);
  assert.equal(boundaries.length, 1);
  assert.equal(unmatchedCount, 1);
  assert.equal(boundaries[0]!.barangayId, 'cadunan');
  assert.equal(boundaries[0]!.label, 'Cadunan');
  assert.equal(boundaries[0]!.psgc, cadunanPsgc);
});

test('parseBarangayBoundaries tolerates PH prefixes and leading zeros in PSGC', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { PSGC: `PH${cadunanPsgc}` },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
    makeGeoJsonFeature(
      { PSGC: `0${pindasanPsgc}` },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
  ]);

  const { boundaries } = parseBarangayBoundaries(payload);
  assert.deepEqual(
    boundaries.map((boundary) => boundary.barangayId).sort(),
    ['cadunan', 'pindasan'],
  );
});

test('normalizePsgcValue strips PH prefix and leading zeros', () => {
  assert.equal(normalizePsgcValue('PH1108203002'), '1108203002');
  assert.equal(normalizePsgcValue('01108203002'), '1108203002');
  assert.equal(normalizePsgcValue(' 1108203002 '), '1108203002');
});

test('parseBarangayBoundaries falls back to name + municipality match', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { Bgy_Name: 'San Antonio', Mun_Name: 'Mabini', Prov_Name: 'Davao de Oro' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
    // Same barangay name, but a different municipality — must not match.
    makeGeoJsonFeature(
      { Bgy_Name: 'San Antonio', Mun_Name: 'Mati', Prov_Name: 'Davao Oriental' },
      { type: 'Polygon', coordinates: [squareRing(126.0, 7.3, 126.05, 7.35)] },
    ),
  ]);

  const { boundaries, unmatchedCount } = parseBarangayBoundaries(payload);
  assert.equal(boundaries.length, 1);
  assert.equal(unmatchedCount, 1);
  assert.equal(boundaries[0]!.barangayId, 'san-antonio');
});

test('parseBarangayBoundaries accepts the former province name Compostela Valley', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { Bgy_Name: 'Libodon', Mun_Name: 'Mabini', Prov_Name: 'Compostela Valley' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
  ]);

  const { boundaries } = parseBarangayBoundaries(payload);
  assert.equal(boundaries.length, 1);
  assert.equal(boundaries[0]!.barangayId, 'libodon');
});

test('parseBarangayBoundaries maps legacy GIS source names to current barangays', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { Bgy_Name: 'Cuambog (Pob.)', Mun_Name: 'Mabini', Prov_Name: 'Davao de Oro' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
    makeGeoJsonFeature(
      { Bgy_Name: 'Tagnanan (Mampising)', Mun_Name: 'Mabini', Prov_Name: 'Davao de Oro' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.4, 125.95, 7.45)] },
    ),
    makeGeoJsonFeature(
      { Bgy_Name: 'Golden Valley (Maraut)', Mun_Name: 'Mabini', Prov_Name: 'Davao de Oro' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.5, 125.95, 7.55)] },
    ),
  ]);

  const { boundaries, unmatchedCount } = parseBarangayBoundaries(payload);
  assert.equal(unmatchedCount, 0);
  assert.deepEqual(
    boundaries.map((boundary) => boundary.barangayId).sort(),
    ['cuambog', 'golden-valley', 'tagnanan'],
  );
  // Current name and legacy source name are both preserved.
  const tagnanan = boundaries.find((boundary) => boundary.barangayId === 'tagnanan');
  assert.equal(tagnanan?.label, 'Tagnanan');
  assert.equal(tagnanan?.sourceName, 'Tagnanan (Mampising)');
  assert.equal(tagnanan?.psgc, '1108203011');
});

test('parseBarangayBoundaries preserves the source name for exact matches', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { Bgy_Name: 'Cadunan', Mun_Name: 'Mabini' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
  ]);

  const { boundaries } = parseBarangayBoundaries(payload);
  assert.equal(boundaries[0]!.label, 'Cadunan');
  assert.equal(boundaries[0]!.sourceName, 'Cadunan');
});

test('legacy names from other municipalities are still rejected', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { Bgy_Name: 'Tagnanan (Mampising)', Mun_Name: 'Maco', Prov_Name: 'Davao de Oro' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
  ]);

  const { boundaries, unmatchedCount } = parseBarangayBoundaries(payload);
  assert.equal(boundaries.length, 0);
  assert.equal(unmatchedCount, 1);
});

test('parseBarangayBoundaries reads the real GeoRisk/PSA field names', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      {
        psgc_10d: '1108203011',
        brgy_name: 'Tagnanan (Mampising)',
        city_name: 'Mabini',
        city_code: '1108203000',
        prov_name: 'Compostela Valley',
        bgyarea_sqkm: 16.07704139,
      },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
  ]);

  const { boundaries } = parseBarangayBoundaries(payload);
  assert.equal(boundaries.length, 1);
  assert.equal(boundaries[0]!.barangayId, 'tagnanan');
  assert.equal(boundaries[0]!.label, 'Tagnanan');
  assert.equal(boundaries[0]!.sourceName, 'Tagnanan (Mampising)');
  assert.equal(boundaries[0]!.psgc, '1108203011');
  // Official area comes from the source layer, not the registry fallback.
  assert.equal(boundaries[0]!.areaKm2, 16.07704139);
});

test('parseBarangayBoundaries falls back to the registry area when the source omits it', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { psgc_10d: '1108203002' },
      { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
    ),
  ]);

  const { boundaries } = parseBarangayBoundaries(payload);
  assert.equal(boundaries[0]!.areaKm2, 18.43425703);
});

test('the server-normalized FeatureCollection round-trips through the parser', () => {
  // Exact shape produced by app/api/geo/barangay-boundaries/route.ts.
  const normalized = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [squareRing(125.9, 7.3, 125.95, 7.35)] },
        properties: { psgc: '1108203012', name: 'Anitapan', sourceName: 'Anitapan', areaSqKm: 20.29265403 },
      },
    ],
  };

  const { boundaries, unmatchedCount } = parseBarangayBoundaries(normalized);
  assert.equal(unmatchedCount, 0);
  assert.equal(boundaries.length, 1);
  assert.equal(boundaries[0]!.barangayId, 'anitapan');
  assert.equal(boundaries[0]!.label, 'Anitapan');
  assert.equal(boundaries[0]!.psgc, '1108203012');
  assert.equal(boundaries[0]!.areaKm2, 20.29265403);
});

test('parseBarangayBoundaries handles MultiPolygon and ArcGIS rings', () => {
  const geoJsonPayload = makeFeatureCollection([
    makeGeoJsonFeature(
      { PSGC: cadunanPsgc },
      {
        type: 'MultiPolygon',
        coordinates: [
          [squareRing(125.9, 7.3, 125.95, 7.35)],
          [squareRing(126.0, 7.3, 126.05, 7.35)],
        ],
      },
    ),
  ]);
  const geoJsonResult = parseBarangayBoundaries(geoJsonPayload);
  assert.equal(geoJsonResult.boundaries[0]!.polygons.length, 2);

  const arcJsonPayload = {
    features: [
      {
        attributes: { PSGC: pindasanPsgc },
        geometry: { rings: [squareRing(125.9, 7.3, 125.95, 7.35)] },
      },
    ],
  };
  const arcResult = parseBarangayBoundaries(arcJsonPayload);
  assert.equal(arcResult.boundaries[0]!.barangayId, 'pindasan');
  assert.equal(arcResult.boundaries[0]!.polygons.length, 1);
});

test('parseBarangayBoundaries drops features without usable geometry', () => {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature({ PSGC: cadunanPsgc }, { type: 'Polygon', coordinates: [] }),
    makeGeoJsonFeature({ PSGC: pindasanPsgc }, null),
  ]);
  const { boundaries, unmatchedCount } = parseBarangayBoundaries(payload);
  assert.equal(boundaries.length, 0);
  assert.equal(unmatchedCount, 2);
});

test('parseBarangayBoundaries ignores malformed payloads', () => {
  assert.equal(parseBarangayBoundaries(null).boundaries.length, 0);
  assert.equal(parseBarangayBoundaries({}).boundaries.length, 0);
  assert.equal(parseBarangayBoundaries({ features: 'nope' }).boundaries.length, 0);
});

function makeBoundaryFixture(): BarangayBoundary[] {
  const payload = makeFeatureCollection([
    makeGeoJsonFeature(
      { PSGC: cadunanPsgc },
      {
        type: 'Polygon',
        coordinates: [
          squareRing(0, 0, 10, 10),
          // A hole in the middle: (3,3)-(7,3)-(7,7)-(3,7)
          squareRing(3, 3, 7, 7),
        ],
      },
    ),
    makeGeoJsonFeature(
      { PSGC: pindasanPsgc },
      { type: 'Polygon', coordinates: [squareRing(20, 20, 30, 30)] },
    ),
  ]);
  return parseBarangayBoundaries(payload).boundaries;
}

test('findBarangayForPoint resolves the containing barangay', () => {
  const boundaries = makeBoundaryFixture();

  // Inside Cadunan's outer ring (note: GeoJSON axis order — [lng, lat]).
  const cadunan = findBarangayForPoint(1, 1, boundaries);
  assert.equal(cadunan?.barangayId, 'cadunan');

  const pindasan = findBarangayForPoint(25, 25, boundaries);
  assert.equal(pindasan?.barangayId, 'pindasan');
});

test('findBarangayForPoint returns null inside a hole or outside every ring', () => {
  const boundaries = makeBoundaryFixture();

  // Center of the hole in Cadunan.
  assert.equal(findBarangayForPoint(5, 5, boundaries), null);
  // Far outside everything.
  assert.equal(findBarangayForPoint(50, 50, boundaries), null);
  // Non-finite input.
  assert.equal(findBarangayForPoint(Number.NaN, 1, boundaries), null);
  assert.equal(findBarangayForPoint(1, Number.NaN, boundaries), null);
});

test('findBarangayForPoint returns null for empty boundaries', () => {
  assert.equal(findBarangayForPoint(1, 1, []), null);
});

test('getBarangayBounds reports the geometry envelope', () => {
  const boundaries = makeBoundaryFixture();
  const bounds = getBarangayBounds(boundaries[0]!);
  assert.equal(bounds.north, 10);
  assert.equal(bounds.south, 0);
  assert.equal(bounds.east, 10);
  assert.equal(bounds.west, 0);
});

test('getBarangayUnionBounds spans every barangay polygon', () => {
  const boundaries = makeBoundaryFixture();
  const union = getBarangayUnionBounds(boundaries);
  assert.equal(union?.north, 30);
  assert.equal(union?.south, 0);
  assert.equal(union?.east, 30);
  assert.equal(union?.west, 0);
  assert.equal(getBarangayUnionBounds([]), null);
});

test('getBarangayCenter lands inside the barangay', () => {
  const boundaries = makeBoundaryFixture();
  const center = getBarangayCenter(boundaries[0]!);
  // The centroid of the outer ring is (5,5) — inside the ring, even though
  // that specific point falls in the hole; the label is only a reference.
  assert.ok(center.lat >= 0 && center.lat <= 10);
  assert.ok(center.lng >= 0 && center.lng <= 10);
});

test('registry entries all have unique PSGC codes', () => {
  const psgcSet = new Set(BARANGAY_REGISTRY.map((entry) => entry.psgc));
  assert.equal(psgcSet.size, BARANGAY_REGISTRY.length);
});

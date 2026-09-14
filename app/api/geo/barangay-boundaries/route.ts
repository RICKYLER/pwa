import { NextResponse } from 'next/server';
import {
  BARANGAY_REGISTRY,
  MABINI_MUNICIPAL_PSGC,
} from '@/lib/mabini-barangays';
import { MABINI_MAP_BOUNDS } from '@/lib/mabini';
import {
  parseBarangayBoundaries,
  type BarangayBoundary,
  type PolygonRings,
} from '@/lib/barangay-geometry';

export const runtime = 'nodejs';
export const maxDuration = 30;

import fallbackBoundariesGeoJson from '@/lib/mabini-barangay-boundaries-fallback.json';

const GEORISK_LAYER_URL =
  'https://ulap-nga.georisk.gov.ph/arcgis/rest/services/PSA/BarangayPopMF/MapServer/0';
const GEORISK_QUERY_URL = `${GEORISK_LAYER_URL}/query`;

const REQUEST_TIMEOUT_MS = 20000;
// Barangay boundaries change extremely rarely — cache for a full day.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HTTP_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400';

type CachedPayload = {
  body: string;
  fetchedAt: number;
};

let cachedPayload: CachedPayload | null = null;
let inflightRequest: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Layer schema probe — build where clauses from the fields that actually
// exist, instead of assuming names. (Layer fields include: prov_name,
// city_name, brgy_name, city_code, brgy_code, psgc_10d, bgyarea_sqkm.)
// ---------------------------------------------------------------------------

interface LayerSchema {
  fields: Array<{ name: string; type: string }>;
}

let cachedSchema: LayerSchema | null = null;

async function probeLayerSchema(signal: AbortSignal): Promise<LayerSchema | null> {
  if (cachedSchema) return cachedSchema;
  try {
    const response = await fetch(`${GEORISK_LAYER_URL}?f=pjson`, {
      signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const metadata = (await response.json()) as {
      fields?: Array<{ name?: string; type?: string }>;
    };
    if (!Array.isArray(metadata.fields)) return null;
    cachedSchema = {
      fields: metadata.fields
        .filter((field): field is { name: string; type: string } =>
          typeof field.name === 'string' && typeof field.type === 'string')
        .map((field) => ({ name: field.name, type: field.type })),
    };
    return cachedSchema;
  } catch {
    return null;
  }
}

function findField(schema: LayerSchema | null, candidates: string[]): string | null {
  if (!schema) return null;
  const names = schema.fields.map((field) => field.name.toLowerCase());
  for (const candidate of candidates) {
    const index = names.indexOf(candidate.toLowerCase());
    if (index >= 0) return schema.fields[index]!.name;
  }
  return null;
}

function isNumericField(schema: LayerSchema | null, fieldName: string | null): boolean {
  if (!schema || !fieldName) return false;
  const field = schema.fields.find((entry) => entry.name === fieldName);
  if (!field) return false;
  return /integer|double|single/i.test(field.type);
}

interface QueryAttempt {
  label: string;
  where: string;
  format: 'geojson' | 'json';
  extraParams?: Record<string, string>;
}

function buildQueryAttempts(schema: LayerSchema | null): QueryAttempt[] {
  const attempts: QueryAttempt[] = [];
  const quotedPsgcList = BARANGAY_REGISTRY.map((entry) => `'${entry.psgc}'`).join(', ');
  const unquotedPsgcList = BARANGAY_REGISTRY.map((entry) => entry.psgc).join(', ');

  const psgcField = findField(schema, ['psgc_10d', 'psgc', 'psg', 'brgy_code', 'bgy_code']);
  const cityCodeField = findField(schema, ['city_code', 'mun_code', 'municipality_code']);
  const cityNameField = findField(schema, ['city_name', 'mun_name', 'municipality']);
  const provNameField = findField(schema, ['prov_name', 'province']);

  // 1. PSGC IN — the canonical identifier (quoted or numeric per field type).
  if (psgcField) {
    const psgcList = isNumericField(schema, psgcField) ? unquotedPsgcList : quotedPsgcList;
    attempts.push({ label: `${psgcField} IN (11 Mabini PSGCs)`, where: `${psgcField} IN (${psgcList})`, format: 'geojson' });
  }
  // 2. Municipality PSGC code.
  if (cityCodeField) {
    const code = isNumericField(schema, cityCodeField) ? MABINI_MUNICIPAL_PSGC : `'${MABINI_MUNICIPAL_PSGC}'`;
    attempts.push({ label: `${cityCodeField} = ${MABINI_MUNICIPAL_PSGC}`, where: `${cityCodeField} = ${code}`, format: 'geojson' });
  }
  // 3. Municipality + province names — current and legacy ("Compostela
  //    Valley" was Davao de Oro's name until 2019).
  if (cityNameField) {
    if (provNameField) {
      attempts.push({
        label: `${cityNameField} = Mabini AND ${provNameField} IN (Davao de Oro, Compostela Valley)`,
        where: `${cityNameField} = 'Mabini' AND (${provNameField} = 'Davao de Oro' OR ${provNameField} = 'Compostela Valley')`,
        format: 'geojson',
      });
    }
    attempts.push({ label: `${cityNameField} = Mabini`, where: `${cityNameField} = 'Mabini'`, format: 'geojson' });
  }
  // 4. Schema-independent spatial fallback: everything intersecting the
  //    Mabini envelope. The central parser still keeps only Mabini's 11.
  attempts.push({
    label: 'spatial envelope (Mabini bbox)',
    where: '1=1',
    format: 'geojson',
    extraParams: {
      geometry: JSON.stringify({
        xmin: MABINI_MAP_BOUNDS.west,
        ymin: MABINI_MAP_BOUNDS.south,
        xmax: MABINI_MAP_BOUNDS.east,
        ymax: MABINI_MAP_BOUNDS.north,
      }),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
    },
  });
  // 5. Older ArcGIS servers reject f=geojson — retry the attribute filters
  //    as classic ArcGIS JSON (rings are converted server-side below).
  attempts
    .filter((attempt) => attempt.extraParams === undefined)
    .forEach((attempt) => {
      attempts.push({ ...attempt, format: 'json' });
    });

  return attempts;
}

function buildQueryUrl(attempt: QueryAttempt): string {
  const params = new URLSearchParams({
    f: attempt.format,
    where: attempt.where,
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '200',
  });
  Object.entries(attempt.extraParams ?? {}).forEach(([key, value]) => {
    params.set(key, value);
  });
  return `${GEORISK_QUERY_URL}?${params.toString()}`;
}

async function fetchOnce(attempt: QueryAttempt, signal: AbortSignal): Promise<string> {
  const url = buildQueryUrl(attempt);
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MSWDO-Mabini-PWA/1.0 (barangay boundary lookup)',
    },
    cache: 'no-store',
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GeoRisk upstream returned HTTP ${response.status}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('GeoRisk upstream returned a non-JSON payload');
  }
  const container = parsed as { features?: unknown; error?: { message?: string } };
  if (container.error) {
    throw new Error(container.error.message ?? 'GeoRisk upstream query error');
  }
  if (!Array.isArray(container.features)) {
    throw new Error('GeoRisk upstream payload has no features array');
  }

  return text;
}

async function fetchFromGeoRisk(signal: AbortSignal): Promise<string> {
  const schema = await probeLayerSchema(signal);
  if (process.env.NODE_ENV !== 'production') {
    console.info(
      '[barangay-boundaries] GeoRisk layer schema:',
      schema ? schema.fields.map((field) => `${field.name}:${field.type}`).join(', ') : 'unavailable (using fallback clauses)',
    );
  }

  let lastError: Error | null = null;
  for (const attempt of buildQueryAttempts(schema)) {
    try {
      const body = await fetchOnce(attempt, signal);
      // A query that matches zero features is useless — try the next one.
      const features = (JSON.parse(body) as { features: unknown[] }).features;
      if (features.length === 0) {
        lastError = new Error(`Query matched no features: ${attempt.label}`);
        continue;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.info(`[barangay-boundaries] GeoRisk query succeeded (${attempt.label}) — ${features.length} features`);
      }
      return body;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[barangay-boundaries] query attempt failed (${attempt.label}):`, lastError.message);
      }
    }
  }
  throw lastError ?? new Error('GeoRisk upstream could not be queried');
}

// ---------------------------------------------------------------------------
// Normalization — parse once with the central matcher (PSGC first, then
// legacy-name aliases), then emit a predictable, client-ready FeatureCollection.
// ---------------------------------------------------------------------------

function toGeoJsonGeometry(polygons: PolygonRings[]) {
  if (polygons.length === 1) {
    return { type: 'Polygon', coordinates: polygons[0] };
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

function serializeBoundaries(boundaries: BarangayBoundary[]): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: boundaries.map((boundary) => ({
      type: 'Feature',
      geometry: toGeoJsonGeometry(boundary.polygons),
      properties: {
        psgc: boundary.psgc,
        name: boundary.label,
        sourceName: boundary.sourceName,
        areaSqKm: boundary.areaKm2,
      },
    })),
  });
}

function getCachedBody(): string | null {
  if (!cachedPayload) return null;
  if (Date.now() - cachedPayload.fetchedAt > CACHE_TTL_MS) {
    cachedPayload = null;
    return null;
  }
  return cachedPayload.body;
}

async function loadBoundariesPayload(): Promise<string> {
  const cached = getCachedBody();
  if (cached) return cached;

  if (!inflightRequest) {
    inflightRequest = (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const raw = await fetchFromGeoRisk(controller.signal);
        const { boundaries, unmatchedCount } = parseBarangayBoundaries(raw);
        if (boundaries.length === 0) {
          throw new Error(
            `GeoRisk returned features but none matched Mabini's 11 barangays (${unmatchedCount} unmatched).`,
          );
        }
        if (process.env.NODE_ENV !== 'production') {
          console.info(
            `[barangay-boundaries] normalized ${boundaries.length}/${BARANGAY_REGISTRY.length} Mabini barangays:`,
            boundaries.map((boundary) => `${boundary.label} (${boundary.psgc})`).join(', '),
          );
        }
        const body = serializeBoundaries(boundaries);
        cachedPayload = { body, fetchedAt: Date.now() };
        return body;
      } catch (upstreamError) {
        console.warn(
          '[barangay-boundaries] GeoRisk upstream query failed or timed out — activating bundled Mabini fallback:',
          upstreamError instanceof Error ? upstreamError.message : upstreamError,
        );
        try {
          const { boundaries } = parseBarangayBoundaries(fallbackBoundariesGeoJson);
          if (boundaries.length > 0) {
            const body = serializeBoundaries(boundaries);
            cachedPayload = { body, fetchedAt: Date.now() };
            return body;
          }
        } catch (fallbackError) {
          console.error('[barangay-boundaries] static fallback parsing failed:', fallbackError);
        }
        throw upstreamError;
      } finally {
        clearTimeout(timeoutId);
        inflightRequest = null;
      }
    })();
  }

  return inflightRequest;
}

export async function GET() {
  try {
    const body = await loadBoundariesPayload();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/geo+json',
        'Cache-Control': HTTP_CACHE_CONTROL,
        'X-Mabini-Municipality-Psgc': MABINI_MUNICIPAL_PSGC,
      },
    });
  } catch (error) {
    console.warn(
      '[barangay-boundaries] proxy failed:',
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: 'Could not load Mabini barangay boundaries from the GeoRisk PSA service.' },
      { status: 502 },
    );
  }
}

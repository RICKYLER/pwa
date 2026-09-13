import type { BarangayId } from '@/lib/barangays';
import {
  BARANGAY_REGISTRY,
  LEGACY_SOURCE_NAME_ALIASES,
  getBarangayByPsgc,
  getBarangayRegistryEntry,
} from '@/lib/mabini-barangays';

/**
 * A barangay boundary geometry.
 *
 * `polygons` follows GeoJSON MultiPolygon nesting: a list of polygons, each a
 * list of rings (ring 0 is the outer ring, the rest are holes), each ring a
 * list of `[lng, lat]` positions in GeoJSON axis order. Convert to Leaflet
 * `[lat, lng]` pairs only at render time with `toLeafletLatLngs`.
 */
export type GeoPosition = [number, number]; // [lng, lat]
export type PolygonRings = GeoPosition[][]; // ring 0 = outer, rest = holes

export interface BarangayBoundary {
  barangayId: BarangayId;
  psgc: string;
  /** Current official barangay name. */
  label: string;
  /** Name as it appears in the source GIS layer (may be a legacy name). */
  sourceName: string;
  areaKm2: number;
  polygons: PolygonRings[];
  bbox: { north: number; south: number; east: number; west: number };
}

export interface BarangayBoundaryParseResult {
  boundaries: BarangayBoundary[];
  /** Features that could not be matched to one of Mabini's barangays. */
  unmatchedCount: number;
}

// ---------------------------------------------------------------------------
// Point-in-polygon
// ---------------------------------------------------------------------------

function isPointInRing(lat: number, lng: number, ring: GeoPosition[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]!; // lng, lat
    const [xj, yj] = ring[j]!; // lng, lat
    const intersects = (yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointInPolygon(lat: number, lng: number, rings: GeoPosition[][]): boolean {
  if (rings.length === 0) return false;
  if (!isPointInRing(lat, lng, rings[0]!)) return false;
  // Holes: a point inside any inner ring is outside the polygon.
  for (let i = 1; i < rings.length; i += 1) {
    if (isPointInRing(lat, lng, rings[i]!)) return false;
  }
  return true;
}

export function isPointInBoundary(
  lat: number,
  lng: number,
  boundary: Pick<BarangayBoundary, 'polygons' | 'bbox'>,
): boolean {
  const { bbox } = boundary;
  if (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east) {
    return false;
  }
  return boundary.polygons.some((rings) => isPointInPolygon(lat, lng, rings));
}

/** GIS spatial lookup: which barangay polygon contains this coordinate? */
export function findBarangayForPoint(
  lat: number,
  lng: number,
  boundaries: readonly BarangayBoundary[],
): BarangayBoundary | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const boundary of boundaries) {
    if (isPointInBoundary(lat, lng, boundary)) {
      return boundary;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function computeBbox(polygons: PolygonRings[]): BarangayBoundary['bbox'] {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  polygons.forEach((rings) => {
    rings.forEach((ring) => {
      ring.forEach(([lng, lat]) => {
        if (lat > north) north = lat;
        if (lat < south) south = lat;
        if (lng > east) east = lng;
        if (lng < west) west = lng;
      });
    });
  });
  return { north, south, east, west };
}

/** Centroid of the largest outer ring — used for labels and zoom targets. */
export function getBarangayCenter(boundary: BarangayBoundary): { lat: number; lng: number } {
  let largestRing: GeoPosition[] | null = null;
  let largestArea = -1;
  boundary.polygons.forEach((rings) => {
    const outer = rings[0];
    if (!outer || outer.length === 0) return;
    const area = ringApproximateArea(outer);
    if (area > largestArea) {
      largestArea = area;
      largestRing = outer;
    }
  });

  const ring: GeoPosition[] = largestRing ?? [];
  if (ring.length === 0) {
    const { bbox } = boundary;
    return { lat: (bbox.north + bbox.south) / 2, lng: (bbox.east + bbox.west) / 2 };
  }

  let latSum = 0;
  let lngSum = 0;
  ring.forEach(([lng, lat]) => {
    latSum += lat;
    lngSum += lng;
  });
  return { lat: latSum / ring.length, lng: lngSum / ring.length };
}

/** Rough ring area in square degrees — only used to pick the largest ring. */
function ringApproximateArea(ring: GeoPosition[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    area += xj * yi - xi * yj;
  }
  return Math.abs(area / 2);
}

export function getBarangayBounds(boundary: BarangayBoundary): BarangayBoundary['bbox'] {
  return boundary.bbox;
}

/** Envelope of every barangay polygon — the real municipality extent. */
export function getBarangayUnionBounds(
  boundaries: readonly BarangayBoundary[],
): BarangayBoundary['bbox'] | null {
  if (boundaries.length === 0) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  boundaries.forEach((boundary) => {
    north = Math.max(north, boundary.bbox.north);
    south = Math.min(south, boundary.bbox.south);
    east = Math.max(east, boundary.bbox.east);
    west = Math.min(west, boundary.bbox.west);
  });
  return { north, south, east, west };
}

/** Convert GeoJSON `[lng, lat]` positions to Leaflet `[lat, lng]` pairs. */
export function toLeafletLatLngs(boundary: BarangayBoundary): number[][][][] {
  return boundary.polygons.map((rings) =>
    rings.map((ring) => ring.map(([lng, lat]) => [lat, lng])),
  );
}

// ---------------------------------------------------------------------------
// Parsing (defensive: GeoRisk/PSA field names are matched by candidates)
// ---------------------------------------------------------------------------

const PSGC_FIELD_CANDIDATES = ['psgc_10d', 'PSGC', 'PSG', 'PSG_CODE', 'Bgy_Code', 'BgyCode', 'brgy_code', 'Barangay_PSGC', 'psgc'];
const SOURCE_NAME_FIELD_CANDIDATES = ['sourceName', 'source_name'];
const NAME_FIELD_CANDIDATES = ['Bgy_Name', 'BgyName', 'brgy_name', 'Barangay_Name', 'Barangay', 'NAME_3', 'BrgyName', 'name'];
const MUNICIPALITY_FIELD_CANDIDATES = ['Mun_Name', 'MunName', 'city_name', 'Municipality', 'Municipality_Name', 'NAME_2'];
const PROVINCE_FIELD_CANDIDATES = ['Prov_Name', 'ProvName', 'prov_name', 'Province', 'Province_Name', 'NAME_1'];
const AREA_FIELD_CANDIDATES = ['bgyarea_sqkm', 'areaSqKm', 'area_sqkm', 'area_km2', 'BgyArea_sqkm'];

function readAttribute(attributes: Record<string, unknown>, candidates: string[]): string | null {
  for (const key of Object.keys(attributes)) {
    if (candidates.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
      const value = attributes[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
  }
  return null;
}

/** Official land area (km²) from the source layer, when it provides one. */
function readAttributeArea(attributes: Record<string, unknown>): number | null {
  for (const key of Object.keys(attributes)) {
    if (AREA_FIELD_CANDIDATES.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
      const value = attributes[key];
      const area = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(area) && area > 0) return area;
    }
  }
  return null;
}

/** Normalize a PSGC value: drop country prefixes and leading zeros for compare. */
export function normalizePsgcValue(value: string): string {
  let normalized = value.trim();
  if (/^PH/i.test(normalized)) {
    normalized = normalized.slice(2);
  }
  while (normalized.startsWith('0') && normalized.length > 1) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

function matchByPsgc(psgcValue: string | null): ReturnType<typeof getBarangayByPsgc> {
  if (!psgcValue) return null;
  const direct = getBarangayByPsgc(psgcValue.trim());
  if (direct) return direct;
  const normalized = normalizePsgcValue(psgcValue);
  return getBarangayByPsgc(normalized) ?? null;
}

function normalizeNameValue(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('ñ', 'n')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Tagnanan (Mampising)" → "tagnanan" — compare without the legacy suffix. */
function stripParenthetical(normalizedName: string): string {
  const match = normalizedName.match(/^([^(]+?)(?:\s*\([^)]*\))?$/);
  return match ? match[1]!.trim() : normalizedName;
}

function isMabiniProvinceValue(provinceValue: string | null): boolean {
  if (!provinceValue) return true;
  const normalized = normalizeNameValue(provinceValue);
  // Davao de Oro was renamed from Compostela Valley in 2019 — the GIS layer
  // may carry either name.
  return normalized.includes('davao de oro') || normalized.includes('compostela valley');
}

function matchByNames(
  nameValue: string | null,
  municipalityValue: string | null,
  provinceValue: string | null,
): ReturnType<typeof getBarangayByPsgc> {
  if (!nameValue) return null;

  // The barangay layer covers the whole country — only accept a name match
  // when the municipality/province also looks like Mabini, Davao de Oro.
  if (municipalityValue && normalizeNameValue(municipalityValue) !== 'mabini') return null;
  if (provinceValue && !isMabiniProvinceValue(provinceValue)) return null;

  const normalized = normalizeNameValue(nameValue);
  const withoutParenthetical = stripParenthetical(normalized);

  // Legacy GIS source names ("Cuambog (Pob.)") map by alias first…
  const aliasId = LEGACY_SOURCE_NAME_ALIASES[normalized]
    ?? LEGACY_SOURCE_NAME_ALIASES[withoutParenthetical];
  if (aliasId) {
    const aliasEntry = getBarangayRegistryEntry(aliasId);
    if (aliasEntry) return aliasEntry;
  }

  // …then exact and parenthetical-stripped comparisons against the registry.
  return (
    BARANGAY_REGISTRY.find(
      (entry) =>
        normalizeNameValue(entry.label) === normalized
        || normalizeNameValue(entry.label) === withoutParenthetical,
    ) ?? null
  );
}

type RawGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { rings?: number[][][] }
  | null
  | undefined;

function parseGeometryCoordinates(geometry: RawGeometry): PolygonRings[] | null {
  if (!geometry) return null;

  if ('type' in geometry && geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as PolygonRings[];
  }

  if ('type' in geometry && geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates as PolygonRings];
  }

  // ArcGIS JSON (f=json) geometry — rings are [x, y] pairs, same axis order.
  if ('rings' in geometry && Array.isArray(geometry.rings) && geometry.rings.length > 0) {
    return [geometry.rings as PolygonRings];
  }

  return null;
}

function hasValidPositions(polygons: PolygonRings[]): boolean {
  return polygons.some((rings) =>
    rings.some((ring) =>
      ring.length >= 3
      && ring.every((position) => Array.isArray(position) && position.length >= 2
        && Number.isFinite(position[0]) && Number.isFinite(position[1])),
    ),
  );
}

/**
 * Parse a GeoJSON FeatureCollection (or ArcGIS JSON feature set) from the
 * GeoRisk/PSA barangay boundary service, keeping only Mabini's barangays.
 * Features are matched by PSGC first, then by name + municipality/province.
 */
export function parseBarangayBoundaries(payload: unknown): BarangayBoundaryParseResult {
  const result: BarangayBoundaryParseResult = { boundaries: [], unmatchedCount: 0 };
  if (!payload || typeof payload !== 'object') return result;

  const container = payload as { features?: unknown };
  if (!Array.isArray(container.features)) return result;

  const seenBarangayIds = new Set<BarangayId>();

  container.features.forEach((feature) => {
    if (!feature || typeof feature !== 'object') return;
    const { properties, attributes, geometry } = feature as {
      properties?: Record<string, unknown>;
      attributes?: Record<string, unknown>;
      geometry?: RawGeometry;
    };
    // GeoJSON uses `properties`; ArcGIS JSON feature sets use `attributes`.
    const featureAttributes = properties ?? attributes ?? {};

    const sourceName = readAttribute(featureAttributes, SOURCE_NAME_FIELD_CANDIDATES)
      ?? readAttribute(featureAttributes, NAME_FIELD_CANDIDATES);
    const municipalityValue = readAttribute(featureAttributes, MUNICIPALITY_FIELD_CANDIDATES);
    const provinceValue = readAttribute(featureAttributes, PROVINCE_FIELD_CANDIDATES);
    const entry = matchByPsgc(readAttribute(featureAttributes, PSGC_FIELD_CANDIDATES))
      ?? matchByNames(sourceName, municipalityValue, provinceValue);

    if (!entry) {
      result.unmatchedCount += 1;
      return;
    }
    if (seenBarangayIds.has(entry.id)) {
      return;
    }

    const polygons = parseGeometryCoordinates(geometry ?? null);
    if (!polygons || !hasValidPositions(polygons)) {
      result.unmatchedCount += 1;
      return;
    }

    seenBarangayIds.add(entry.id);
    result.boundaries.push({
      barangayId: entry.id,
      psgc: entry.psgc,
      label: entry.label,
      sourceName: sourceName ?? entry.label,
      // Prefer the official area from the source layer; registry values are
      // the verified fallback.
      areaKm2: readAttributeArea(featureAttributes) ?? entry.areaKm2,
      polygons,
      bbox: computeBbox(polygons),
    });
  });

  return result;
}

/** Registry entry for a barangay id (used when geometry is unavailable). */
export function getBarangayFallbackEntry(barangayId: string) {
  return getBarangayRegistryEntry(barangayId);
}

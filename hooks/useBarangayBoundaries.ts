'use client';

import { useEffect, useState } from 'react';
import { fetchJsonWithCache } from '@/lib/client-fetch-cache';
import { parseBarangayBoundaries, type BarangayBoundary } from '@/lib/barangay-geometry';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';

const BOUNDARIES_ENDPOINT = '/api/geo/barangay-boundaries';
const LOCAL_STORAGE_KEY = 'mabini-barangay-boundaries-v1';
const FETCH_TTL_MS = 24 * 60 * 60 * 1000;

export type BarangayBoundariesSource = 'cache' | 'network';

export interface BarangayBoundariesState {
  boundaries: BarangayBoundary[];
  loading: boolean;
  error: string | null;
  source: BarangayBoundariesSource | null;
}

function readCachedBoundaries(): BarangayBoundary[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const { boundaries } = parseBarangayBoundaries(JSON.parse(raw));
    return boundaries.length === BARANGAY_REGISTRY.length ? boundaries : null;
  } catch {
    return null;
  }
}

function persistBoundaries(payload: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be full or unavailable — the in-memory cache still works.
  }
}

export function useBarangayBoundaries(): BarangayBoundariesState {
  const [boundaries, setBoundaries] = useState<BarangayBoundary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<BarangayBoundariesSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cached = readCachedBoundaries();
    if (cached) {
      setBoundaries(cached);
      setSource('cache');
      setLoading(false);
    }

    (async () => {
      try {
        const payload = await fetchJsonWithCache<unknown>(BOUNDARIES_ENDPOINT, {
          ttlMs: FETCH_TTL_MS,
        });
        const { boundaries: parsed, unmatchedCount } = parseBarangayBoundaries(payload);
        if (cancelled) return;

        // GIS debug trail: request URL, feature count, names, PSGC codes,
        // geometry types — verifies the ArcGIS pipeline end to end.
        console.info(
          `[barangay-boundaries] ${BOUNDARIES_ENDPOINT}`,
          {
            matchedFeatures: parsed.length,
            unmatchedFeatures: unmatchedCount,
            expected: BARANGAY_REGISTRY.length,
            barangays: parsed.map((boundary) => ({
              name: boundary.label,
              sourceName: boundary.sourceName,
              psgc: boundary.psgc,
              geometryType: boundary.polygons.length > 1 ? 'MultiPolygon' : 'Polygon',
              polygonParts: boundary.polygons.length,
              areaKm2: boundary.areaKm2,
            })),
          },
        );

        if (parsed.length === 0) {
          if (!cached) {
            setError('The boundary service returned no Mabini barangay geometries.');
            setLoading(false);
          }
          return;
        }

        persistBoundaries(payload);
        setBoundaries(parsed);
        setSource('network');
        setError(null);
        setLoading(false);
      } catch (fetchError) {
        if (cancelled) return;
        console.warn(
          `[barangay-boundaries] ${BOUNDARIES_ENDPOINT} failed:`,
          fetchError instanceof Error ? fetchError.message : fetchError,
        );
        if (!cached) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Could not load barangay boundaries.',
          );
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { boundaries, loading, error, source };
}

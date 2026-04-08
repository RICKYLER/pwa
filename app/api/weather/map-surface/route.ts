import { NextResponse } from 'next/server';
import {
  fetchOpenWeatherFieldResponseWeather,
  type FieldResponseWeatherPayload,
} from '@/lib/weather';

export const runtime = 'nodejs';
export const maxDuration = 60;

const API_KEY = process.env.OPENWEATHER_API_KEY?.trim() ?? '';
const SAMPLE_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_EFFECTIVE_SURFACE_SAMPLES = 42;
const SURFACE_SAMPLE_COORDINATE_PRECISION = 3;

interface SurfacePointData {
  time: string | null;
  pressureSeaLevel: number | null;
  cloudCover: number | null;
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  providerMode: FieldResponseWeatherPayload['provider']['mode'];
}

interface SurfacePointValue extends SurfacePointData {
  lat: number;
  lng: number;
}

const sampleCache = new Map<string, { expiresAt: number; value: SurfacePointData }>();
const sampleInFlightCache = new Map<string, Promise<SurfacePointData>>();

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeLng(lng: number) {
  let next = lng;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return next;
}

function longitudeToNormalizedX(lng: number) {
  return (normalizeLng(lng) + 180) / 360;
}

function latitudeToMercatorY(lat: number) {
  const safeLat = clamp(lat, -85, 85);
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

function mercatorYToLatitude(y: number) {
  const n = Math.PI - (2 * Math.PI * y);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function resolveEffectiveSurfaceGrid(cols: number, rows: number) {
  let effectiveCols = cols;
  let effectiveRows = rows;

  while ((effectiveCols * effectiveRows) > MAX_EFFECTIVE_SURFACE_SAMPLES) {
    const canReduceCols = effectiveCols > 4;
    const canReduceRows = effectiveRows > 4;

    if (!canReduceCols && !canReduceRows) {
      break;
    }

    const colRatio = canReduceCols ? effectiveCols / cols : -1;
    const rowRatio = canReduceRows ? effectiveRows / rows : -1;

    if (canReduceCols && (!canReduceRows || colRatio >= rowRatio)) {
      effectiveCols -= 1;
      continue;
    }

    effectiveRows -= 1;
  }

  return {
    cols: effectiveCols,
    rows: effectiveRows,
  };
}

function buildGridPoints(
  north: number,
  south: number,
  east: number,
  west: number,
  cols: number,
  rows: number,
) {
  const westX = longitudeToNormalizedX(west);
  let eastX = longitudeToNormalizedX(east);
  if (eastX <= westX) {
    eastX += 1;
  }

  const northY = latitudeToMercatorY(north);
  const southY = latitudeToMercatorY(south);

  return Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const xRatio = cols === 1 ? 0 : col / (cols - 1);
    const yRatio = rows === 1 ? 0 : row / (rows - 1);
    const normalizedX = westX + ((eastX - westX) * xRatio);
    const normalizedY = northY + ((southY - northY) * yRatio);

    return {
      lat: mercatorYToLatitude(normalizedY),
      lng: normalizeLng((normalizedX * 360) - 180),
    };
  });
}

function pickNearestWeatherStep(
  payload: FieldResponseWeatherPayload,
  unixTime: number | null,
) {
  if (!unixTime) {
    return {
      time: payload.current.time,
      pressureSeaLevel: payload.current.pressureSeaLevel,
      cloudCover: payload.current.cloudCover,
      temperature: payload.current.temperature,
      windSpeed: payload.current.windSpeed,
      windDirection: payload.current.windDirection,
    };
  }

  const currentUnix = payload.current.time ? Math.floor(Date.parse(payload.current.time) / 1000) : null;
  const candidates = [
    {
      unixTime: currentUnix,
      time: payload.current.time,
      pressureSeaLevel: payload.current.pressureSeaLevel,
      cloudCover: payload.current.cloudCover,
      temperature: payload.current.temperature,
      windSpeed: payload.current.windSpeed,
      windDirection: payload.current.windDirection,
    },
    ...payload.hourly.map((hour) => ({
      unixTime: hour.time ? Math.floor(Date.parse(hour.time) / 1000) : null,
      time: hour.time,
      pressureSeaLevel: hour.pressureSeaLevel,
      cloudCover: hour.cloudCover,
      temperature: hour.temperature,
      windSpeed: hour.windSpeed,
      windDirection: hour.windDirection,
    })),
  ].filter((entry) => entry.unixTime !== null);

  if (candidates.length === 0) {
    return {
      time: payload.current.time,
      pressureSeaLevel: payload.current.pressureSeaLevel,
      cloudCover: payload.current.cloudCover,
      temperature: payload.current.temperature,
      windSpeed: payload.current.windSpeed,
      windDirection: payload.current.windDirection,
    };
  }

  return candidates.reduce((closest, entry) => {
    if (!closest.unixTime) return entry;
    return Math.abs((entry.unixTime ?? 0) - unixTime) < Math.abs((closest.unixTime ?? 0) - unixTime)
      ? entry
      : closest;
  });
}

async function fetchSurfacePointData(
  lat: number,
  lng: number,
  unixTime: number | null,
) {
  // Keep small-area wind surfaces distinct; 2-decimal rounding can collapse
  // multiple barangay-scale grid points into the same forecast sample.
  const sampledLat = round(lat, SURFACE_SAMPLE_COORDINATE_PRECISION);
  const sampledLng = round(lng, SURFACE_SAMPLE_COORDINATE_PRECISION);
  const bucket = unixTime ? Math.round(unixTime / 3600) : 'live';
  const cacheKey = `${sampledLat}:${sampledLng}:${bucket}`;
  const cached = sampleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inFlight = sampleInFlightCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = fetchOpenWeatherFieldResponseWeather(sampledLat, sampledLng, API_KEY, {
    next: { revalidate: 600 },
  })
    .then((payload) => {
      const nearestStep = pickNearestWeatherStep(payload, unixTime);
      const value: SurfacePointData = {
        time: nearestStep.time,
        pressureSeaLevel: nearestStep.pressureSeaLevel,
        cloudCover: nearestStep.cloudCover,
        temperature: nearestStep.temperature,
        windSpeed: nearestStep.windSpeed,
        windDirection: nearestStep.windDirection,
        providerMode: payload.provider.mode,
      };

      sampleCache.set(cacheKey, {
        expiresAt: Date.now() + SAMPLE_CACHE_TTL_MS,
        value,
      });

      return value;
    })
    .catch((error) => {
      console.error(`Weather fetch failed for ${sampledLat},${sampledLng}:`, error.message);
      throw error;
    })
    .finally(() => {
      sampleInFlightCache.delete(cacheKey);
    });

  sampleInFlightCache.set(cacheKey, requestPromise);
  return requestPromise;
}

async function fetchSurfacePoint(
  lat: number,
  lng: number,
  unixTime: number | null,
): Promise<SurfacePointValue> {
  const value = await fetchSurfacePointData(lat, lng, unixTime);

  return {
    lat: round(lat, 4),
    lng: round(lng, 4),
    ...value,
  };
}

async function mapWithConcurrency<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TResult>,
) {
  const results = new Array<TResult>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const north = Number(searchParams.get('north'));
  const south = Number(searchParams.get('south'));
  const east = Number(searchParams.get('east'));
  const west = Number(searchParams.get('west'));
  const cols = clamp(Number(searchParams.get('cols') ?? 8), 4, 12);
  const rows = clamp(Number(searchParams.get('rows') ?? 6), 4, 10);
  const date = Number(searchParams.get('date'));

  if (!API_KEY) {
    return NextResponse.json({ error: 'OpenWeather API key is not configured.' }, { status: 500 });
  }

  if (
    !Number.isFinite(north)
    || !Number.isFinite(south)
    || !Number.isFinite(east)
    || !Number.isFinite(west)
    || north <= south
  ) {
    return NextResponse.json({ error: 'Invalid weather surface bounds.' }, { status: 400 });
  }

  const unixTime = Number.isFinite(date) && date > 0 ? Math.floor(date) : null;
  const effectiveGrid = resolveEffectiveSurfaceGrid(cols, rows);
  const points = buildGridPoints(
    north,
    south,
    east,
    west,
    effectiveGrid.cols,
    effectiveGrid.rows,
  );

  try {
    const samples = await mapWithConcurrency(points, 12, (point) =>
      fetchSurfacePoint(point.lat, point.lng, unixTime),
    );

    const pressureValues = samples
      .map((sample) => sample.pressureSeaLevel)
      .filter((value): value is number => value !== null);
    const cloudValues = samples
      .map((sample) => sample.cloudCover)
      .filter((value): value is number => value !== null);
    const windValues = samples
      .map((sample) => sample.windSpeed)
      .filter((value): value is number => value !== null);

    return NextResponse.json(
      {
        bounds: {
          north: round(north, 4),
          south: round(south, 4),
          east: round(east, 4),
          west: round(west, 4),
        },
        rows: effectiveGrid.rows,
        cols: effectiveGrid.cols,
        mode: unixTime ? 'forecast' : 'current',
        providerMode: samples[0]?.providerMode ?? null,
        stats: {
          pressureMin: pressureValues.length > 0 ? Math.min(...pressureValues) : null,
          pressureMax: pressureValues.length > 0 ? Math.max(...pressureValues) : null,
          cloudMin: cloudValues.length > 0 ? Math.min(...cloudValues) : null,
          cloudMax: cloudValues.length > 0 ? Math.max(...cloudValues) : null,
          windMin: windValues.length > 0 ? Math.min(...windValues) : null,
          windMax: windValues.length > 0 ? Math.max(...windValues) : null,
        },
        samples,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('Failed to build weather surface:', error);
    return NextResponse.json({ error: 'Failed to build weather surface.' }, { status: 500 });
  }
}

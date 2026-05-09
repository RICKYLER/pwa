import { NextResponse } from 'next/server';
import {
  fetchOpenWeatherFieldResponseWeather,
  fetchTomorrowIoFieldResponseWeather,
  parseWeatherCoordinates,
  type FieldResponseWeatherPayload,
} from '@/lib/weather';

export const runtime = 'nodejs';

const TOMORROW_KEY  = process.env.TOMORROW_IO_API_KEY?.trim()  ?? '';
const OPENWEATHER_KEY = process.env.OPENWEATHER_API_KEY?.trim() ?? '';

// ── In-process cache ──────────────────────────────────────────────────────────
// One entry per unique (lat, lng) pair. Prevents repeat API calls when multiple
// components on the same page request weather at the same coordinates.
// TTL = 10 min → max ~6 calls/hour per location (well within the free-plan 25/h).
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  payload: FieldResponseWeatherPayload;
  expiresAt: number;
}

const weatherCache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number) {
  // Round to 2 decimal places so nearby coordinates share the same cache slot
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { lat, lng } = parseWeatherCoordinates(searchParams);
  const key = cacheKey(lat, lng);

  // Return cached payload if still fresh
  const cached = weatherCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.payload, {
      headers: { 'X-Weather-Cache': 'HIT' },
    });
  }

  let payload: FieldResponseWeatherPayload | null = null;

  // Primary: Tomorrow.io — 1 request returns minute + hourly + daily together
  if (TOMORROW_KEY) {
    try {
      payload = await fetchTomorrowIoFieldResponseWeather(lat, lng, TOMORROW_KEY);
    } catch (err) {
      console.warn('[weather] Tomorrow.io failed, falling back to OpenWeather:', err);
    }
  }

  // Fallback: OpenWeather
  if (!payload) {
    if (!OPENWEATHER_KEY) {
      return NextResponse.json(
        { error: 'No weather API key configured.' },
        { status: 500 },
      );
    }
    try {
      payload = await fetchOpenWeatherFieldResponseWeather(lat, lng, OPENWEATHER_KEY);
    } catch (err) {
      console.error('[weather] OpenWeather also failed:', err);
      return NextResponse.json(
        { error: 'Failed to fetch weather forecast.' },
        { status: 500 },
      );
    }
  }

  // Store in cache
  weatherCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });

  return NextResponse.json(payload, {
    headers: { 'X-Weather-Cache': 'MISS' },
  });
}

import { NextResponse } from 'next/server';
import { getOpenWeatherMapLayer, isOpenWeatherMapLayerId } from '@/lib/openweather-map-layers';

export const runtime = 'nodejs';
export const maxDuration = 30;

const API_KEY = process.env.OPENWEATHER_API_KEY?.trim() ?? '';
const FAILURE_LOG_WINDOW_MS = 5 * 60 * 1000;
const TILE_REQUEST_TIMEOUT_MS = 5000;
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pY9lWQAAAAASUVORK5CYII=',
  'base64',
);
const recentFailureLogs = new Map<string, number>();

function emptyTile(status = 200) {
  return new NextResponse(TRANSPARENT_PNG, {
    status,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=1800',
    },
  });
}

function logFailureOnce(key: string, status: number, errorText: string) {
  const now = Date.now();
  const lastLoggedAt = recentFailureLogs.get(key) ?? 0;
  if (now - lastLoggedAt < FAILURE_LOG_WINDOW_MS) {
    return;
  }

  recentFailureLogs.set(key, now);
  console.warn('OpenWeather map tile proxy fallback:', status, errorText);
}

function buildMapV2Url({
  step,
  tileOp,
  z,
  x,
  y,
  date,
  palette,
  fillBound,
  useNorm,
  arrowStep,
}: {
  step: '1h' | '3h';
  tileOp: string;
  z: number;
  x: number;
  y: number;
  date: number;
  palette?: string;
  fillBound?: boolean;
  useNorm?: boolean;
  arrowStep?: number;
}) {
  const path =
    step === '1h'
      ? `https://maps.openweathermap.org/maps/2.0/weather/1h/${tileOp}/${z}/${x}/${y}`
      : `https://maps.openweathermap.org/maps/2.0/weather/${tileOp}/${z}/${x}/${y}`;
  const upstream = new URL(path);

  upstream.searchParams.set('appid', API_KEY);
  upstream.searchParams.set('fill_bound', fillBound === false ? 'false' : 'true');

  if (Number.isFinite(date) && date > 0) {
    upstream.searchParams.set('date', String(Math.floor(date)));
  }

  if (palette) {
    upstream.searchParams.set('palette', palette);
  }

  if (useNorm) {
    upstream.searchParams.set('use_norm', 'true');
  }

  if (typeof arrowStep === 'number') {
    upstream.searchParams.set('arrow_step', String(arrowStep));
  }

  return upstream;
}

function buildMapV1Url({
  layer,
  z,
  x,
  y,
}: {
  layer: string;
  z: number;
  x: number;
  y: number;
}) {
  const upstream = new URL(`https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png`);
  upstream.searchParams.set('appid', API_KEY);
  return upstream;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layerId = searchParams.get('layer') ?? 'TA2';
  const z = Number(searchParams.get('z'));
  const x = Number(searchParams.get('x'));
  const y = Number(searchParams.get('y'));
  const date = Number(searchParams.get('date'));
  const prefer = (searchParams.get('prefer') ?? '').toLowerCase();
  const preferV1 = prefer === 'v1' || prefer === 'current';

  if (!API_KEY) {
    return emptyTile(200);
  }

  if (
    !isOpenWeatherMapLayerId(layerId)
    || !Number.isInteger(z)
    || !Number.isInteger(x)
    || !Number.isInteger(y)
  ) {
    return emptyTile(400);
  }

  const layer = getOpenWeatherMapLayer(layerId);
  if (!layer) {
    return emptyTile(404);
  }

  const mapV2Attempts = [
    layer.tileOp1h
      ? {
          source: 'maps-2.0-1h',
          logKey: `${layer.id}:maps-2.0-1h`,
          url: buildMapV2Url({
            step: '1h',
            tileOp: layer.tileOp1h,
            z,
            x,
            y,
            date,
            palette: layer.palette,
            fillBound: layer.fillBound,
            useNorm: layer.useNorm,
            arrowStep: layer.arrowStep,
          }),
        }
      : null,
    layer.tileOp3h
      ? {
          source: 'maps-2.0-3h',
          logKey: `${layer.id}:maps-2.0-3h`,
          url: buildMapV2Url({
            step: '3h',
            tileOp: layer.tileOp3h,
            z,
            x,
            y,
            date,
            palette: layer.palette,
            fillBound: layer.fillBound,
            useNorm: layer.useNorm,
            arrowStep: layer.arrowStep,
          }),
        }
      : null,
  ].filter((attempt): attempt is {
    source: string;
    logKey: string;
    url: URL;
  } => Boolean(attempt));

  const mapV1Attempt = layer.fallbackTileV1
    ? [{
        source: 'tile-1.0-current',
        logKey: `${layer.id}:tile-1.0-current`,
        url: buildMapV1Url({
          layer: layer.fallbackTileV1,
          z,
          x,
          y,
        }),
      }]
    : [];

  const attempts = preferV1
    ? [...mapV1Attempt, ...mapV2Attempts]
    : [...mapV2Attempts, ...mapV1Attempt];

  try {
    let lastFailureStatus = 502;
    let lastFailureText = 'Unknown upstream failure';

    for (const attempt of attempts) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TILE_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(attempt.url.toString(), {
          headers: {
            Accept: 'image/png',
          },
          signal: controller.signal,
          next: { revalidate: 600 },
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();

          return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
              'Content-Type': response.headers.get('content-type') ?? 'image/png',
              'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=1800',
              'X-Weather-Tile-Source': attempt.source,
            },
          });
        }

        lastFailureStatus = response.status;
        lastFailureText = await response.text().catch(() => '');

        logFailureOnce(attempt.logKey, response.status, lastFailureText);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          lastFailureText = 'Request timeout after 5s';
          continue;
        }
        throw fetchError;
      }
    }

    return emptyTile(lastFailureStatus === 401 || lastFailureStatus === 403 ? 200 : lastFailureStatus);
  } catch (error) {
    console.error('OpenWeather map tile proxy error:', error);
    return emptyTile(502);
  }
}

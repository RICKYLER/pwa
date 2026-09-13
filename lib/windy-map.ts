/**
 * Windy Map Forecast API integration support (https://api.windy.com/map-forecast/docs).
 *
 * Windy's runtime hard-requires Leaflet 1.4.x, while the responder map runs
 * Leaflet 1.9.4 — so Windy is embedded in an isolated same-origin iframe
 * (public/windy-map.html) that follows Windy's documented init process, and
 * this module defines the layer vocabulary plus the postMessage protocol the
 * host page uses to drive it.
 */

export type WindyLayerId = 'none' | 'wind' | 'temp' | 'rain' | 'clouds';

export interface WindyLayerOption {
  id: WindyLayerId;
  label: string;
  description: string;
  /** Windy overlay id for store.set('overlay', ...); null when no Windy layer is shown. */
  windyOverlay: string | null;
}

export const WINDY_LAYER_OPTIONS: readonly WindyLayerOption[] = [
  {
    id: 'none',
    label: 'None',
    description: 'Keep the standard E-Mabini base map without a Windy layer.',
    windyOverlay: null,
  },
  {
    id: 'wind',
    label: 'Wind',
    description: 'Animated wind particles and wind speed across the response area.',
    windyOverlay: 'wind',
  },
  {
    id: 'temp',
    label: 'Temperature',
    description: 'Air temperature visualization for heat-exposure awareness.',
    windyOverlay: 'temp',
  },
  {
    id: 'rain',
    label: 'Rain / Thunder',
    description: 'Rainfall and thunderstorm visualization over the barangays.',
    windyOverlay: 'rain',
  },
  {
    id: 'clouds',
    label: 'Clouds',
    description: 'Cloud cover visualization for visibility checks.',
    windyOverlay: 'clouds',
  },
] as const;

/** Iframe page implementing the Windy map underlay. */
export const WINDY_MAP_PAGE_URL = '/windy-map.html';

/** Messages sent by the Windy iframe to the host page. */
export type WindyFrameMessage =
  | { type: 'windy:loaded' }
  | { type: 'windy:ready'; allowedOverlays: string[] }
  | { type: 'windy:error'; message: string };

/** Messages the host page sends into the Windy iframe. */
export type WindyHostMessage =
  | { type: 'windy:hello' }
  | {
      type: 'windy:init';
      apikey: string;
      lat: number;
      lon: number;
      zoom: number;
      overlay: string;
    }
  | { type: 'windy:view'; view: { lat: number; lon: number; zoom: number } }
  | { type: 'windy:overlay'; overlay: string };

/** Overlays available on Windy's free testing tier (per the pricing page). */
export const WINDY_TESTING_ALLOWED_OVERLAYS = ['wind', 'temp', 'pressure'] as const;

/**
 * Resolve the Windy Map Forecast API key. Pure (takes the raw env value) so it
 * stays unit-testable; never hardcode the key itself in source.
 */
export function resolveWindyApiKey(rawValue: string | undefined): string {
  return (rawValue ?? '').trim();
}

export function getWindyApiKey(): string {
  return resolveWindyApiKey(process.env.NEXT_PUBLIC_WINDY_API_KEY);
}

export function isWindyAvailable(): boolean {
  return getWindyApiKey() !== '';
}

export function isWindyLayerId(value: unknown): value is WindyLayerId {
  return typeof value === 'string' && WINDY_LAYER_OPTIONS.some((option) => option.id === value);
}

export function getWindyLayerOption(layerId: WindyLayerId): WindyLayerOption {
  return WINDY_LAYER_OPTIONS.find((option) => option.id === layerId) ?? WINDY_LAYER_OPTIONS[0]!;
}

/**
 * Whether a Windy layer option can be selected right now. Until Windy reports
 * store.getAllowed('overlay'), assume the documented free testing tier (wind,
 * temperature, pressure only) — this self-corrects once Windy initializes, so
 * a Professional key enables the rest without any code change.
 */
export function isWindyLayerOptionEnabled(
  option: WindyLayerOption,
  allowedOverlays: string[] | null,
): boolean {
  if (option.windyOverlay === null) return true;
  const effectiveOverlays: readonly string[] = allowedOverlays ?? WINDY_TESTING_ALLOWED_OVERLAYS;
  return effectiveOverlays.includes(option.windyOverlay);
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Bike,
  BusFront,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Cloudy,
  Crosshair,
  Droplets,
  Eye,
  Gauge,
  Lock,
  Layers3,
  Loader2,
  Map,
  MapPin,
  Mountain,
  RefreshCw,
  Route,
  Shield,
  Thermometer,
  Wind,
  X,
} from 'lucide-react';
import type { Household, Incident } from '@/lib/db/schema';
import type { FieldResponseWeatherPayload } from '@/lib/weather';
import {
  DEFAULT_BARANGAY_CENTER,
  HOUSEHOLD_PIN_COLOR,
  hasHouseholdPin,
} from '@/lib/map-pins';
import ResponderWindDetailsCard from '@/components/ResponderWindDetailsCard';
import ResponderWindFieldOverlay from '@/components/ResponderWindFieldOverlay';
import {
  getOpenWeatherMapLayer,
  type OpenWeatherTileLayerId,
} from '@/lib/openweather-map-layers';

declare global {
  interface Window {
    L?: unknown;
  }
}

interface LeafletBounds {
  getNorth(): number;
  getSouth(): number;
  getEast(): number;
  getWest(): number;
}

interface LeafletLayer {
  addTo(map: LeafletMap): this;
  setOpacity?(value: number): this;
  setUrl?(url: string): this;
}

interface LeafletMarker extends LeafletLayer {
  bindPopup(html: string, options?: Record<string, unknown>): this;
  on(event: string, handler: (event: { latlng?: { lat: number; lng: number } }) => void): this;
  openPopup(): this;
  setLatLng(latlng: [number, number]): this;
}

interface LeafletLayerGroup extends LeafletLayer {
  clearLayers(): this;
  addLayer(layer: LeafletLayer): this;
}

interface MapViewportSnapshot {
  north: number;
  south: number;
  east: number;
  west: number;
  width: number;
  height: number;
  zoom: number;
}

interface WindSurfaceSample {
  lat: number;
  lng: number;
  time: string | null;
  windSpeed: number | null;
  windDirection: number | null;
}

interface WindSurfacePayload {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  rows: number;
  cols: number;
  mode: 'current' | 'forecast';
  providerMode: FieldResponseWeatherPayload['provider']['mode'] | null;
  stats: {
    windMin: number | null;
    windMax: number | null;
  };
  samples: WindSurfaceSample[];
}

interface LeafletMap {
  addLayer(layer: LeafletLayer): this;
  closePopup(): this;
  createPane(name: string): void;
  fitBounds(bounds: unknown, options?: Record<string, unknown>): this;
  flyTo(latlng: [number, number], zoom?: number, options?: Record<string, unknown>): this;
  getBounds(): LeafletBounds;
  getCenter(): { lat: number; lng: number };
  getPane(name: string): HTMLElement | undefined;
  getZoom(): number;
  hasLayer(layer: LeafletLayer): boolean;
  invalidateSize(): void;
  off(event?: string, handler?: (event: { latlng?: { lat: number; lng: number } }) => void): this;
  on(event: string, handler: (event: { latlng?: { lat: number; lng: number } }) => void): this;
  remove(): void;
  removeLayer(layer: LeafletLayer): this;
  setView(latlng: [number, number], zoom: number, options?: Record<string, unknown>): this;
}

interface LeafletRuntime {
  divIcon(options?: Record<string, unknown>): unknown;
  layerGroup(layers?: LeafletLayer[]): LeafletLayerGroup;
  latLngBounds(points: [number, number][]): unknown;
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  marker(latlng: [number, number], options?: Record<string, unknown>): LeafletMarker;
  tileLayer(urlTemplate: string, options?: Record<string, unknown>): LeafletLayer;
}

interface ResponderLeafletMapProps {
  households: Household[];
  incidents: Incident[];
  selectedHousehold?: Household | null;
  onSelectHousehold?: (household: Household | null) => void;
  containerClassName?: string;
  compactWeather?: boolean;
}

interface SelectorLayer {
  id: OpenWeatherTileLayerId;
}

type ResponderBaseMapLayerId =
  | 'standard'
  | 'cyclosm'
  | 'cyclemap'
  | 'transportmap'
  | 'tracestracktopo'
  | 'humanitarian'
  | 'opentopomap';

type WeatherFocus =
  | { mode: 'center' }
  | { mode: 'point'; lat: number; lng: number; label?: string | null };

interface DispatchDecision {
  label: 'Safe to dispatch' | 'Dispatch with caution' | 'Delay / escalate';
  detail: string;
  panelClassName: string;
  chipClassName: string;
}

interface WindSurfaceGrid {
  cols: number;
  rows: number;
}

interface ResponderBaseMapLayerDefinition {
  id: ResponderBaseMapLayerId;
  label: string;
  provider: string;
  description: string;
  tileUrl: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string[];
  apiKey?: string;
  requiredEnvVar?: 'NEXT_PUBLIC_THUNDERFOREST_API_KEY' | 'NEXT_PUBLIC_TRACESTRACK_KEY';
  previewGradientClassName: string;
}

const INCIDENT_SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#94a3b8',
};

const QUICK_LAYER_IDS: OpenWeatherTileLayerId[] = ['PR0', 'WND'];
const ADVANCED_LAYER_IDS: OpenWeatherTileLayerId[] = ['WS10', 'TA2', 'APM', 'CL'];
const ALL_LAYER_IDS: OpenWeatherTileLayerId[] = [...QUICK_LAYER_IDS, ...ADVANCED_LAYER_IDS];
const LAYER_ICON_MAP: Record<OpenWeatherTileLayerId, LucideIcon> = {
  TA2: Thermometer,
  APM: Gauge,
  WS10: Wind,
  PR0: CloudRain,
  CL: Cloudy,
  WND: Wind,
};
const WEATHER_LAYER_Z_INDEX: Record<OpenWeatherTileLayerId, number> = {
  PR0: 360,
  TA2: 365,
  APM: 370,
  CL: 375,
  WS10: 380,
  WND: 385,
};

const LEAFLET_CSS_ID = 'responder-leaflet-css';
const LEAFLET_SCRIPT_ID = 'responder-leaflet-script';
const LEAFLET_CSS_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_SCRIPT_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const THUNDERFOREST_API_KEY = process.env.NEXT_PUBLIC_THUNDERFOREST_API_KEY?.trim() ?? '';
const TRACESTRACK_API_KEY = process.env.NEXT_PUBLIC_TRACESTRACK_KEY?.trim() ?? '';
const BASE_LAYER_STORAGE_KEY = 'responder-map-base-layer';
const OPENTOPOMAP_ATTRIBUTION =
  'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org/about">OpenTopoMap</a> (CC-BY-SA)';
const CYCLOSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Tiles style by <a href="https://www.cyclosm.org/">CyclOSM</a> hosted by <a href="https://openstreetmap.fr/">OpenStreetMap France</a>';
const THUNDERFOREST_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Tiles courtesy of <a href="https://www.thunderforest.com/">Andy Allan</a>';
const TRACESTRACK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Tiles courtesy of <a href="https://www.tracestrack.com/">Tracestrack Maps</a>';
const HUMANITARIAN_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Tiles courtesy of <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a>';
const RESPONDER_BASE_MAP_LAYERS: ResponderBaseMapLayerDefinition[] = [
  {
    id: 'standard',
    label: 'Standard',
    provider: 'OpenStreetMap',
    description: 'The familiar OSM street map for general navigation and pin review.',
    tileUrl: OSM_TILE_URL,
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    previewGradientClassName: 'from-sky-300/70 via-emerald-200/35 to-slate-900/55',
  },
  {
    id: 'cyclosm',
    label: 'CyclOSM',
    provider: 'CyclOSM',
    description: 'Road hierarchy and paths stand out more clearly for routing in the field.',
    tileUrl: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: CYCLOSM_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['a', 'b', 'c'],
    previewGradientClassName: 'from-cyan-300/65 via-sky-300/25 to-slate-950/60',
  },
  {
    id: 'cyclemap',
    label: 'Cycle Map',
    provider: 'Thunderforest',
    description: 'OpenCycleMap styling from OSM.org. Unlock it with your Thunderforest key.',
    tileUrl: 'https://api.thunderforest.com/cycle/{z}/{x}/{y}{r}.png?apikey={apikey}',
    attribution: THUNDERFOREST_ATTRIBUTION,
    maxZoom: 21,
    apiKey: THUNDERFOREST_API_KEY,
    requiredEnvVar: 'NEXT_PUBLIC_THUNDERFOREST_API_KEY',
    previewGradientClassName: 'from-lime-300/70 via-emerald-300/30 to-slate-950/60',
  },
  {
    id: 'transportmap',
    label: 'Transport Map',
    provider: 'Thunderforest',
    description: 'Transit-focused styling from OSM.org for road and route context.',
    tileUrl: 'https://api.thunderforest.com/transport/{z}/{x}/{y}{r}.png?apikey={apikey}',
    attribution: THUNDERFOREST_ATTRIBUTION,
    maxZoom: 21,
    apiKey: THUNDERFOREST_API_KEY,
    requiredEnvVar: 'NEXT_PUBLIC_THUNDERFOREST_API_KEY',
    previewGradientClassName: 'from-violet-400/70 via-indigo-400/30 to-slate-950/65',
  },
  {
    id: 'tracestracktopo',
    label: 'Tracestrack Topo',
    provider: 'Tracestrack',
    description: 'Closest match to the OSM.org topo view in your screenshot.',
    tileUrl: 'https://tile.tracestrack.com/topo__/{z}/{x}/{y}.webp?key={apikey}',
    attribution: TRACESTRACK_ATTRIBUTION,
    maxZoom: 19,
    apiKey: TRACESTRACK_API_KEY,
    requiredEnvVar: 'NEXT_PUBLIC_TRACESTRACK_KEY',
    previewGradientClassName: 'from-sky-500/70 via-blue-500/35 to-slate-950/70',
  },
  {
    id: 'humanitarian',
    label: 'Humanitarian',
    provider: 'HOT / OSM-FR',
    description: 'Emergency-friendly styling that keeps key places and roads easy to scan.',
    tileUrl: 'https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: HUMANITARIAN_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['a', 'b', 'c'],
    previewGradientClassName: 'from-teal-300/70 via-cyan-200/25 to-slate-950/55',
  },
  {
    id: 'opentopomap',
    label: 'OpenTopoMap',
    provider: 'OpenTopoMap',
    description: 'A ready-to-use terrain fallback with contour lines for mountain barangays.',
    tileUrl: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: OPENTOPOMAP_ATTRIBUTION,
    maxZoom: 17,
    subdomains: ['a', 'b', 'c'],
    previewGradientClassName: 'from-emerald-400/70 via-amber-200/30 to-slate-950/60',
  },
];
const BASE_LAYER_ICON_MAP: Record<ResponderBaseMapLayerId, LucideIcon> = {
  standard: Map,
  cyclosm: Bike,
  cyclemap: Bike,
  transportmap: BusFront,
  tracestracktopo: Route,
  humanitarian: Shield,
  opentopomap: Mountain,
};
const DEFAULT_BASE_LAYER_ID: ResponderBaseMapLayerId = TRACESTRACK_API_KEY
  ? 'tracestracktopo'
  : 'opentopomap';

let leafletRuntimePromise: Promise<LeafletRuntime> | null = null;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveWindSurfaceGrid(
  viewportWidth: number,
  viewportHeight: number,
  compactWeather: boolean,
): WindSurfaceGrid {
  const safeWidth = Math.max(viewportWidth, compactWeather ? 720 : 960);
  const safeHeight = Math.max(viewportHeight, compactWeather ? 480 : 640);
  const densityBase = compactWeather ? 170 : 145;

  return {
    cols: clampNumber(Math.round(safeWidth / densityBase), compactWeather ? 5 : 7, compactWeather ? 8 : 11),
    rows: clampNumber(Math.round(safeHeight / densityBase), compactWeather ? 4 : 5, compactWeather ? 6 : 8),
  };
}

function normalizeTileCoordinate(value: number, zoom: number) {
  const tileRange = 1 << zoom;
  return ((value % tileRange) + tileRange) % tileRange;
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const tileCount = 2 ** zoom;
  const normalizedLng = ((lng + 180) / 360) * tileCount;
  const latRadians = (lat * Math.PI) / 180;
  const normalizedLat = (
    (1 - (Math.log(Math.tan(latRadians) + (1 / Math.cos(latRadians))) / Math.PI))
    / 2
  ) * tileCount;

  return {
    x: Math.floor(normalizeTileCoordinate(normalizedLng, zoom)),
    y: Math.floor(clampNumber(normalizedLat, 0, tileCount - 1)),
  };
}

function getBaseMapLayer(layerId: ResponderBaseMapLayerId) {
  return RESPONDER_BASE_MAP_LAYERS.find((layer) => layer.id === layerId) ?? null;
}

function isResponderBaseMapLayerId(value: string): value is ResponderBaseMapLayerId {
  return RESPONDER_BASE_MAP_LAYERS.some((layer) => layer.id === value);
}

function canUseBaseMapLayer(layer: ResponderBaseMapLayerDefinition) {
  return !layer.requiredEnvVar || Boolean(layer.apiKey);
}

function getBaseLayerTileTemplate(layer: ResponderBaseMapLayerDefinition) {
  if (!canUseBaseMapLayer(layer)) return null;
  return layer.tileUrl
    .replaceAll('{apikey}', layer.apiKey ?? '')
    .replaceAll('{r}', '');
}

function buildBaseLayerPreviewUrl(
  layer: ResponderBaseMapLayerDefinition,
  lat: number,
  lng: number,
  zoom: number,
) {
  const template = getBaseLayerTileTemplate(layer);
  if (!template) return null;

  const { x, y } = latLngToTile(lat, lng, zoom);
  const subdomain = layer.subdomains?.[(x + y) % layer.subdomains.length] ?? 'a';

  return template
    .replaceAll('{s}', subdomain)
    .replaceAll('{z}', String(zoom))
    .replaceAll('{x}', String(x))
    .replaceAll('{y}', String(y));
}

function getBaseLayerAvailabilityLabel(layer: ResponderBaseMapLayerDefinition) {
  if (canUseBaseMapLayer(layer)) return 'Switch';
  return layer.requiredEnvVar ? 'Key required' : 'Unavailable';
}

function ensureLeafletAssets(): Promise<LeafletRuntime> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet can only load in the browser.'));
  }

  const existingRuntime = window.L as LeafletRuntime | undefined;
  if (existingRuntime) {
    return Promise.resolve(existingRuntime);
  }

  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement('link');
    link.id = LEAFLET_CSS_ID;
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_HREF;
    document.head.appendChild(link);
  }

  if (!leafletRuntimePromise) {
    leafletRuntimePromise = new Promise<LeafletRuntime>((resolve, reject) => {
      const availableRuntime = window.L as LeafletRuntime | undefined;
      if (availableRuntime) {
        resolve(availableRuntime);
        return;
      }

      let script = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;

      const cleanup = () => {
        script?.removeEventListener('load', handleLoad);
        script?.removeEventListener('error', handleError);
      };

      const handleLoad = () => {
        const runtime = window.L as LeafletRuntime | undefined;
        cleanup();
        if (!runtime) {
          reject(new Error('Leaflet loaded but the global runtime was unavailable.'));
          return;
        }
        resolve(runtime);
      };

      const handleError = () => {
        cleanup();
        reject(new Error('Could not load the Leaflet runtime.'));
      };

      if (!script) {
        script = document.createElement('script');
        script.id = LEAFLET_SCRIPT_ID;
        script.src = LEAFLET_SCRIPT_SRC;
        script.async = true;
        document.body.appendChild(script);
      }

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
    }).catch((error) => {
      leafletRuntimePromise = null;
      throw error;
    });
  }

  return leafletRuntimePromise;
}

function escapeHtml(value: string | undefined) {
  if (!value) return '';
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTemperature(value: number | null) {
  if (value === null) return '--';
  return `${Math.round(value)}°C`;
}

function formatPercent(value: number | null) {
  if (value === null) return '--';
  return `${Math.round(value)}%`;
}

function formatDistance(value: number | null) {
  if (value === null) return '--';
  return `${Math.round(value * 10) / 10} km`;
}

function formatRainPeak(value: number | null) {
  if (value === null) return '--';
  return `${Math.round(value * 10) / 10} mm/h`;
}

function formatWind(value: number | null, direction: string | null) {
  if (value === null) return '--';
  const speed = `${Math.round(value)} km/h`;
  return direction ? `${speed} ${direction}` : speed;
}

function formatUpdatedTime(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatUpdatedDateTime(value: string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function friendlyWeatherError(message: string | null) {
  if (!message) return 'Could not load map weather.';
  if (message.toLowerCase().includes('api key')) {
    return 'Add OPENWEATHER_API_KEY to .env.local and restart the app.';
  }
  return message;
}

function getLayerDisplayLabel(layerId: OpenWeatherTileLayerId) {
  if (layerId === 'WND') return 'Wind flow';
  return getOpenWeatherMapLayer(layerId)?.label ?? layerId;
}

function getWeatherPaneName(layerId: OpenWeatherTileLayerId) {
  return `responder-weather-pane-${layerId.toLowerCase()}`;
}

function summarizeActiveLayers(layerIds: OpenWeatherTileLayerId[]) {
  if (layerIds.length === 0) return 'No weather layers selected';
  if (layerIds.length === 1) return getLayerDisplayLabel(layerIds[0]!);
  if (layerIds.length === 2) {
    return `${getLayerDisplayLabel(layerIds[0]!)} + ${getLayerDisplayLabel(layerIds[1]!)}`;
  }
  return `${layerIds.length} layers active`;
}

function getWeatherIcon(weatherCode: number | null) {
  if (weatherCode === null) return Cloud;
  if (weatherCode >= 200 && weatherCode < 300) return CloudLightning;
  if (weatherCode >= 300 && weatherCode < 600) return CloudRain;
  if (weatherCode >= 600 && weatherCode < 700) return CloudSnow;
  if (weatherCode === 800) return Thermometer;
  return Cloudy;
}

function haversineDistanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    (Math.sin(dLat / 2) ** 2)
    + (Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function pickPrimaryCluster(points: Array<{ lat: number; lng: number }>) {
  if (points.length <= 2) return points;

  const lats = points.map((point) => point.lat).sort((a, b) => a - b);
  const lngs = points.map((point) => point.lng).sort((a, b) => a - b);
  const midIndex = Math.floor(points.length / 2);
  const medianLat = lats[midIndex] ?? points[0]!.lat;
  const medianLng = lngs[midIndex] ?? points[0]!.lng;
  const ranked = points
    .map((point) => ({
      ...point,
      distance: haversineDistanceKm(medianLat, medianLng, point.lat, point.lng),
    }))
    .sort((a, b) => a.distance - b.distance);

  const percentileIndex = Math.min(ranked.length - 1, Math.floor(ranked.length * 0.75));
  const percentileDistance = ranked[percentileIndex]?.distance ?? ranked[0]?.distance ?? 0;
  const thresholdKm = Math.max(3, Math.min(18, percentileDistance * 1.5 || 6));
  const cluster = ranked.filter((point) => point.distance <= thresholdKm);

  return cluster.length >= 2 ? cluster : ranked.slice(0, Math.min(4, ranked.length));
}

function computeNextThreeHourRainChance(weather: FieldResponseWeatherPayload | null) {
  if (!weather) return null;
  const values = weather.hourly
    .slice(0, 3)
    .map((hour) => hour.rainChance)
    .filter((value): value is number => value !== null);

  if (values.length > 0) {
    return Math.max(...values);
  }

  return weather.current.rainChance;
}

function resolveOfficialWarning(weather: FieldResponseWeatherPayload | null) {
  if (!weather) return null;
  return weather.alerts.find((alert) => alert.source === 'official') ?? null;
}

function resolveDispatchDecision(weather: FieldResponseWeatherPayload | null): DispatchDecision {
  if (!weather) {
    return {
      label: 'Dispatch with caution',
      detail: 'Weather data is still loading for this point.',
      panelClassName: 'border-amber-200 bg-amber-50 text-amber-900',
      chipClassName: 'bg-amber-100 text-amber-700 border border-amber-200',
    };
  }

  const officialWarning = resolveOfficialWarning(weather);
  const hasWarningAlert = weather.alerts.some((alert) => alert.severity === 'warning');
  const hasWatchAlert = weather.alerts.some((alert) => alert.severity === 'watch');

  if (
    officialWarning?.severity === 'warning'
    || hasWarningAlert
    || (weather.current.rainChance !== null && weather.current.rainChance >= 70)
    || (weather.current.windGust !== null && weather.current.windGust >= 35)
    || (weather.current.visibility !== null && weather.current.visibility <= 2)
  ) {
    return {
      label: 'Delay / escalate',
      detail: officialWarning?.title || 'High-impact weather signals are active for this response point.',
      panelClassName: 'border-rose-200 bg-rose-50 text-rose-900',
      chipClassName: 'bg-rose-100 text-rose-700 border border-rose-200',
    };
  }

  if (
    officialWarning?.severity === 'watch'
    || hasWatchAlert
    || (weather.current.rainChance !== null && weather.current.rainChance >= 45)
    || (weather.current.windGust !== null && weather.current.windGust >= 25)
    || (weather.current.visibility !== null && weather.current.visibility <= 5)
  ) {
    return {
      label: 'Dispatch with caution',
      detail: officialWarning?.title || 'Field movement is still possible, but crews should prepare for weather risk.',
      panelClassName: 'border-amber-200 bg-amber-50 text-amber-900',
      chipClassName: 'bg-amber-100 text-amber-700 border border-amber-200',
    };
  }

  return {
    label: 'Safe to dispatch',
    detail: 'No significant weather blockers are showing for this response point.',
    panelClassName: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    chipClassName: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  };
}

function buildHouseholdMarkerHtml(selected: boolean) {
  const outerSize = selected ? 28 : 22;
  const innerSize = selected ? 16 : 14;
  const ringColor = selected ? 'rgba(99,102,241,0.24)' : 'rgba(99,102,241,0.16)';
  return `
    <div style="width:${outerSize}px;height:${outerSize}px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:${ringColor};box-shadow:0 10px 24px rgba(15,23,42,0.18);">
      <div style="width:${innerSize}px;height:${innerSize}px;border-radius:999px;background:${HOUSEHOLD_PIN_COLOR};border:3px solid #ffffff;"></div>
    </div>
  `;
}

function buildIncidentMarkerHtml(severity: string) {
  const color = INCIDENT_SEVERITY_COLORS[severity] ?? INCIDENT_SEVERITY_COLORS.low;
  return `
    <div style="width:18px;height:18px;transform:rotate(45deg);border-radius:5px;background:${color};border:3px solid #ffffff;box-shadow:0 10px 22px rgba(15,23,42,0.24);"></div>
  `;
}

function buildFocusMarkerHtml() {
  return `
    <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(249,115,22,0.16);box-shadow:0 10px 24px rgba(15,23,42,0.18);">
      <div style="width:14px;height:14px;border-radius:999px;background:#f97316;border:3px solid #ffffff;"></div>
    </div>
  `;
}

function buildHouseholdPopupContent(household: Household) {
  const parts = [
    `<div style="min-width:180px;font-family:inherit;color:#0f172a;">`,
    `<p style="margin:0;font-size:14px;font-weight:700;">${escapeHtml(household.head_name)}</p>`,
    `<p style="margin:4px 0 0;font-size:12px;color:#64748b;">${escapeHtml(household.purok_sitio)}</p>`,
    `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${escapeHtml(household.street_address)}</p>`,
  ];

  if (household.contact_number) {
    parts.push(
      `<p style="margin:8px 0 0;font-size:12px;color:#4f46e5;">${escapeHtml(household.contact_number)}</p>`,
    );
  }

  parts.push('</div>');
  return parts.join('');
}

function buildIncidentPopupContent(incident: Incident) {
  const severityColor = INCIDENT_SEVERITY_COLORS[incident.severity] ?? INCIDENT_SEVERITY_COLORS.low;
  return [
    `<div style="min-width:180px;font-family:inherit;color:#0f172a;">`,
    `<div style="display:flex;align-items:center;gap:8px;">`,
    `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${severityColor};"></span>`,
    `<p style="margin:0;font-size:13px;font-weight:700;text-transform:capitalize;">${escapeHtml(incident.type)}</p>`,
    `</div>`,
    `<p style="margin:6px 0 0;font-size:12px;color:#64748b;">${escapeHtml(incident.location)}</p>`,
    `<p style="margin:6px 0 0;font-size:12px;color:#475569;">${escapeHtml(incident.description)}</p>`,
    `</div>`,
  ].join('');
}

function getLayerOptions(layerIds: OpenWeatherTileLayerId[]): SelectorLayer[] {
  return layerIds
    .map((layerId) => {
      const layer = getOpenWeatherMapLayer(layerId);
      if (!layer) return null;
      return { id: layer.id };
    })
    .filter((layer): layer is SelectorLayer => Boolean(layer));
}

function hasIncidentPin(incident: Pick<Incident, 'gps_lat' | 'gps_lng'>): incident is Incident & {
  gps_lat: number;
  gps_lng: number;
} {
  return typeof incident.gps_lat === 'number' && typeof incident.gps_lng === 'number';
}

export default function ResponderLeafletMap({
  households,
  incidents,
  selectedHousehold,
  onSelectHousehold,
  containerClassName = 'h-full',
  compactWeather = false,
}: ResponderLeafletMapProps) {
  const [runtime, setRuntime] = useState<LeafletRuntime | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [baseLayersOpen, setBaseLayersOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [showWeather, setShowWeather] = useState(true);
  const [activeLayerIds, setActiveLayerIds] = useState<OpenWeatherTileLayerId[]>(['PR0']);
  const [activeBaseLayerId, setActiveBaseLayerId] = useState<ResponderBaseMapLayerId>(
    DEFAULT_BASE_LAYER_ID,
  );
  const [overlayOpacity, setOverlayOpacity] = useState(
    getOpenWeatherMapLayer('PR0')?.defaultOpacity ?? 54,
  );
  const [weatherFocus, setWeatherFocus] = useState<WeatherFocus>({ mode: 'center' });
  const [showAdvancedLayers, setShowAdvancedLayers] = useState(false);
  const [mapCenter, setMapCenter] = useState(DEFAULT_BARANGAY_CENTER);
  const [mapViewport, setMapViewport] = useState<MapViewportSnapshot | null>(null);
  const [weather, setWeather] = useState<FieldResponseWeatherPayload | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [windSurfaceData, setWindSurfaceData] = useState<WindSurfacePayload | null>(null);
  const [windSurfaceLoading, setWindSurfaceLoading] = useState(false);
  const [windSurfaceError, setWindSurfaceError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [internalSelectedHousehold, setInternalSelectedHousehold] = useState<Household | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const householdLayerRef = useRef<LeafletLayerGroup | null>(null);
  const incidentLayerRef = useRef<LeafletLayerGroup | null>(null);
  const baseTileRefs = useRef<Partial<Record<ResponderBaseMapLayerId, LeafletLayer>>>({});
  const weatherTileRefs = useRef<Partial<Record<OpenWeatherTileLayerId, LeafletLayer>>>({});
  const focusMarkerRef = useRef<LeafletMarker | null>(null);

  const activeSelectedHousehold =
    selectedHousehold === undefined ? internalSelectedHousehold : selectedHousehold;
  const activeWeatherTarget = weatherFocus.mode === 'point'
    ? { lat: weatherFocus.lat, lng: weatherFocus.lng }
    : mapCenter;
  const activeIncidents = useMemo(
    () => incidents.filter((incident) => incident.status !== 'resolved'),
    [incidents],
  );
  const WeatherIcon = getWeatherIcon(weather?.current.weatherCode ?? null);
  const weatherPanelWidth = compactWeather ? 'w-[252px]' : 'w-[344px]';
  const nextThreeHourRainChance = computeNextThreeHourRainChance(weather);
  const officialWarning = resolveOfficialWarning(weather);
  const dispatchDecision = resolveDispatchDecision(weather);
  const focusLabel = weatherFocus.mode === 'point' ? weatherFocus.label : null;
  const activeBaseLayer = getBaseMapLayer(activeBaseLayerId) ?? getBaseMapLayer(DEFAULT_BASE_LAYER_ID)!;
  const ActiveBaseLayerIcon = BASE_LAYER_ICON_MAP[activeBaseLayer.id];
  const quickLayers = useMemo(() => getLayerOptions(QUICK_LAYER_IDS), []);
  const advancedLayers = useMemo(() => getLayerOptions(ADVANCED_LAYER_IDS), []);
  const weatherOverlayVisible = showWeather && activeLayerIds.length > 0;
  const activeLayerSummary = useMemo(() => summarizeActiveLayers(activeLayerIds), [activeLayerIds]);
  const allLayersSelected = activeLayerIds.length === ALL_LAYER_IDS.length;
  const windLayerSelected = activeLayerIds.includes('WND');
  const animatedWindReady = windLayerSelected && weatherOverlayVisible && Boolean(windSurfaceData);
  const suppressStaticWindTiles = windLayerSelected && weatherOverlayVisible && !windSurfaceError;
  const baseLayerPanelWidth = compactWeather ? 'w-[290px]' : 'w-[336px]';
  const baseLayerPreviewZoom = useMemo(
    () => clampNumber(Math.round((mapViewport?.zoom ?? 12) - 4), 5, 10),
    [mapViewport?.zoom],
  );
  const windSurfaceGrid = useMemo(
    () => resolveWindSurfaceGrid(
      mapViewport?.width ?? 0,
      mapViewport?.height ?? 0,
      compactWeather,
    ),
    [compactWeather, mapViewport?.height, mapViewport?.width],
  );

  function handleLayerToggle(layerId: OpenWeatherTileLayerId) {
    setActiveLayerIds((current) => (
      current.includes(layerId)
        ? current.filter((currentLayerId) => currentLayerId !== layerId)
        : [...current, layerId]
    ));
    setShowWeather(true);
  }

  function handleWeatherVisibilityToggle() {
    if (weatherOverlayVisible) {
      setShowWeather(false);
      return;
    }
    if (activeLayerIds.length === 0) {
      setActiveLayerIds(['PR0']);
    }
    setShowWeather(true);
  }

  function handleOpenAllLayers() {
    setActiveLayerIds(ALL_LAYER_IDS);
    setShowWeather(true);
  }

  function handleClearAllLayers() {
    setActiveLayerIds([]);
    setShowWeather(false);
  }

  function handleBaseLayerSelect(layerId: ResponderBaseMapLayerId) {
    const layer = getBaseMapLayer(layerId);
    if (!layer || !canUseBaseMapLayer(layer)) return;
    setActiveBaseLayerId(layerId);
    if (compactWeather) {
      setBaseLayersOpen(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    ensureLeafletAssets()
      .then((leafletRuntime) => {
        if (!cancelled) {
          setRuntime(leafletRuntime);
        }
      })
      .catch((error) => {
        console.error('Failed to load Leaflet for responder map:', error);
        if (!cancelled) {
          setRuntimeError('Could not load the responder map.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeLayerIds.length === 0 && showWeather) {
      setShowWeather(false);
    }
  }, [activeLayerIds, showWeather]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedLayerId = window.localStorage.getItem(BASE_LAYER_STORAGE_KEY);
    if (!savedLayerId || !isResponderBaseMapLayerId(savedLayerId)) return;

    const savedLayer = getBaseMapLayer(savedLayerId);
    if (!savedLayer || !canUseBaseMapLayer(savedLayer)) return;
    setActiveBaseLayerId(savedLayerId);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BASE_LAYER_STORAGE_KEY, activeBaseLayerId);
  }, [activeBaseLayerId]);

  useEffect(() => {
    const currentLayer = getBaseMapLayer(activeBaseLayerId);
    if (!currentLayer || canUseBaseMapLayer(currentLayer)) return;
    setActiveBaseLayerId(DEFAULT_BASE_LAYER_ID);
  }, [activeBaseLayerId]);

  useEffect(() => {
    if (!runtime || !containerRef.current || mapRef.current) return;

    const map = runtime.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      preferCanvas: true,
    });

    mapRef.current = map;
    map.setView([DEFAULT_BARANGAY_CENTER.lat, DEFAULT_BARANGAY_CENTER.lng], 14);

    householdLayerRef.current = runtime.layerGroup().addTo(map);
    incidentLayerRef.current = runtime.layerGroup().addTo(map);

    ALL_LAYER_IDS.forEach((layerId) => {
      const paneName = getWeatherPaneName(layerId);
      if (!map.getPane(paneName)) {
        map.createPane(paneName);
      }
      const weatherPane = map.getPane(paneName);
      if (weatherPane) {
        weatherPane.style.zIndex = String(WEATHER_LAYER_Z_INDEX[layerId]);
        weatherPane.style.pointerEvents = 'none';
      }
    });

    const syncViewport = () => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      setMapCenter({ lat: center.lat, lng: center.lng });
      setMapViewport({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        width: containerRef.current?.clientWidth ?? 0,
        height: containerRef.current?.clientHeight ?? 0,
        zoom: map.getZoom(),
      });
    };

    const handleMapClick = (event: { latlng?: { lat: number; lng: number } }) => {
      if (!event.latlng) return;
      setWeatherFocus({
        mode: 'point',
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    };

    map.on('moveend', syncViewport);
    map.on('click', handleMapClick);
    syncViewport();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        map.invalidateSize();
        syncViewport();
      })
      : null;
    resizeObserver?.observe(containerRef.current);

    window.setTimeout(() => {
      map.invalidateSize();
    }, 0);

    return () => {
      resizeObserver?.disconnect();
      map.off('moveend', syncViewport);
      map.off('click', handleMapClick);
      map.remove();
      mapRef.current = null;
      householdLayerRef.current = null;
      incidentLayerRef.current = null;
      baseTileRefs.current = {};
      weatherTileRefs.current = {};
      focusMarkerRef.current = null;
      setMapViewport(null);
    };
  }, [runtime]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime) return;

    RESPONDER_BASE_MAP_LAYERS.forEach((layer) => {
      const shouldShowLayer = layer.id === activeBaseLayerId && canUseBaseMapLayer(layer);
      const existingLayer = baseTileRefs.current[layer.id];

      if (!shouldShowLayer) {
        if (existingLayer && map.hasLayer(existingLayer)) {
          map.removeLayer(existingLayer);
        }
        return;
      }

      const tileTemplate = getBaseLayerTileTemplate(layer);
      if (!tileTemplate) {
        return;
      }

      if (!existingLayer) {
        baseTileRefs.current[layer.id] = runtime.tileLayer(tileTemplate, {
          attribution: layer.attribution,
          maxZoom: layer.maxZoom,
          subdomains: layer.subdomains,
        });
      } else {
        existingLayer.setUrl?.(tileTemplate);
      }

      const activeTileLayer = baseTileRefs.current[layer.id];
      if (activeTileLayer && !map.hasLayer(activeTileLayer)) {
        activeTileLayer.addTo(map);
      }
    });
  }, [runtime, activeBaseLayerId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime) return;

    const pinnedHouseholds = households.filter(hasHouseholdPin);
    const pinnedIncidents = activeIncidents.filter(hasIncidentPin);
    const incidentFocusPoints = pickPrimaryCluster(
      pinnedIncidents.map((incident) => ({
        lat: incident.gps_lat,
        lng: incident.gps_lng,
      })),
    );
    const focusPoints = pickPrimaryCluster(
      pinnedHouseholds.map((household) => ({
        lat: household.gps_lat,
        lng: household.gps_long,
      })),
    );

    if (activeSelectedHousehold && hasHouseholdPin(activeSelectedHousehold)) {
      map.flyTo([activeSelectedHousehold.gps_lat, activeSelectedHousehold.gps_long], 17, {
        duration: 0.45,
      });
      return;
    }

    const preferredFocusPoints = incidentFocusPoints.length > 0 ? incidentFocusPoints : focusPoints;

    if (preferredFocusPoints.length === 0) {
      map.setView([DEFAULT_BARANGAY_CENTER.lat, DEFAULT_BARANGAY_CENTER.lng], 14);
      return;
    }

    if (preferredFocusPoints.length === 1) {
      map.setView([preferredFocusPoints[0]!.lat, preferredFocusPoints[0]!.lng], 17);
      return;
    }

    map.fitBounds(
      runtime.latLngBounds(
        preferredFocusPoints.map((point) => [point.lat, point.lng]),
      ),
      { padding: [28, 28], maxZoom: 16 },
    );
  }, [runtime, households, activeIncidents, activeSelectedHousehold]);

  useEffect(() => {
    if (!activeSelectedHousehold || !hasHouseholdPin(activeSelectedHousehold)) return;
    setWeatherFocus({
      mode: 'point',
      lat: activeSelectedHousehold.gps_lat,
      lng: activeSelectedHousehold.gps_long,
      label: activeSelectedHousehold.head_name,
    });
    setWeatherOpen(true);
  }, [activeSelectedHousehold]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime || !householdLayerRef.current || !incidentLayerRef.current) return;

    householdLayerRef.current.clearLayers();
    incidentLayerRef.current.clearLayers();

    let selectedMarker: LeafletMarker | null = null;

    households.filter(hasHouseholdPin).forEach((household) => {
      const isSelected = activeSelectedHousehold?.id === household.id;
      const marker = runtime.marker([household.gps_lat, household.gps_long], {
        icon: runtime.divIcon({
          className: 'responder-marker',
          html: buildHouseholdMarkerHtml(isSelected),
          iconSize: isSelected ? [28, 28] : [22, 22],
          iconAnchor: isSelected ? [14, 14] : [11, 11],
          popupAnchor: [0, -10],
        }),
      });

      marker.bindPopup(buildHouseholdPopupContent(household), {
        closeButton: false,
        autoPanPadding: [24, 24],
      });
      marker.on('click', () => {
        setWeatherFocus({
          mode: 'point',
          lat: household.gps_lat,
          lng: household.gps_long,
          label: household.head_name,
        });
        setWeatherOpen(true);
        if (onSelectHousehold) {
          onSelectHousehold(household);
          return;
        }
        setInternalSelectedHousehold(household);
      });

      householdLayerRef.current?.addLayer(marker);

      if (isSelected) {
        selectedMarker = marker;
      }
    });

    activeIncidents.filter(hasIncidentPin).forEach((incident) => {
      const marker = runtime.marker([incident.gps_lat, incident.gps_lng], {
        icon: runtime.divIcon({
          className: 'responder-marker',
          html: buildIncidentMarkerHtml(incident.severity),
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          popupAnchor: [0, -8],
        }),
      });

      marker.bindPopup(buildIncidentPopupContent(incident), {
        closeButton: false,
        autoPanPadding: [24, 24],
      });
      marker.on('click', () => {
        setWeatherFocus({
          mode: 'point',
          lat: incident.gps_lat,
          lng: incident.gps_lng,
          label: incident.location,
        });
        setWeatherOpen(true);
      });
      incidentLayerRef.current?.addLayer(marker);
    });

    const markerToOpen = selectedMarker as LeafletMarker | null;
    if (markerToOpen) {
      markerToOpen.openPopup();
      return;
    }

    map.closePopup();
  }, [runtime, households, activeIncidents, activeSelectedHousehold, onSelectHousehold]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime) return;

    ALL_LAYER_IDS.forEach((layerId) => {
      const shouldShowLayer = showWeather
        && activeLayerIds.includes(layerId)
        && !((layerId === 'WND' || layerId === 'WS10') && suppressStaticWindTiles);
      const existingLayer = weatherTileRefs.current[layerId];

      if (!shouldShowLayer) {
        if (existingLayer && map.hasLayer(existingLayer)) {
          map.removeLayer(existingLayer);
        }
        return;
      }

      const tilePreference = layerId === 'WND' ? 'v2' : 'v1';
      const tileUrl = `/api/weather/map-tile?layer=${layerId}&prefer=${tilePreference}&z={z}&x={x}&y={y}`;

      if (!existingLayer) {
        weatherTileRefs.current[layerId] = runtime.tileLayer(tileUrl, {
          opacity: overlayOpacity / 100,
          pane: getWeatherPaneName(layerId),
        });
      } else {
        existingLayer.setUrl?.(tileUrl);
        existingLayer.setOpacity?.(overlayOpacity / 100);
      }

      const activeTileLayer = weatherTileRefs.current[layerId];
      if (activeTileLayer && !map.hasLayer(activeTileLayer)) {
        activeTileLayer.addTo(map);
      }
    });
  }, [runtime, activeLayerIds, animatedWindReady, overlayOpacity, showWeather, suppressStaticWindTiles]);

  useEffect(() => {
    if (!windLayerSelected || !weatherOverlayVisible || !mapViewport) {
      setWindSurfaceData(null);
      setWindSurfaceLoading(false);
      setWindSurfaceError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setWindSurfaceLoading(true);
        setWindSurfaceError(null);
        const params = new URLSearchParams({
          north: mapViewport.north.toFixed(4),
          south: mapViewport.south.toFixed(4),
          east: mapViewport.east.toFixed(4),
          west: mapViewport.west.toFixed(4),
          cols: String(windSurfaceGrid.cols),
          rows: String(windSurfaceGrid.rows),
        });
        const response = await fetch(`/api/weather/map-surface?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string'
              ? payload.error
              : 'Could not load animated wind field.',
          );
        }

        if (!controller.signal.aborted) {
          setWindSurfaceData(payload as WindSurfacePayload);
          setWindSurfaceLoading(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn(
            'Failed to load animated wind surface:',
            error instanceof Error ? error.message : error,
          );
          setWindSurfaceData(null);
          setWindSurfaceLoading(false);
          setWindSurfaceError('Animated wind is unavailable right now. Showing static wind tiles instead.');
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setWindSurfaceLoading(false);
    };
  }, [
    mapViewport?.east,
    mapViewport?.height,
    mapViewport?.north,
    mapViewport?.south,
    mapViewport?.west,
    mapViewport?.width,
    weatherOverlayVisible,
    windLayerSelected,
    windSurfaceGrid.cols,
    windSurfaceGrid.rows,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime) return;

    if (weatherFocus.mode !== 'point') {
      if (focusMarkerRef.current && map.hasLayer(focusMarkerRef.current)) {
        map.removeLayer(focusMarkerRef.current);
      }
      focusMarkerRef.current = null;
      return;
    }

    if (!focusMarkerRef.current) {
      focusMarkerRef.current = runtime.marker([weatherFocus.lat, weatherFocus.lng], {
        icon: runtime.divIcon({
          className: 'responder-marker',
          html: buildFocusMarkerHtml(),
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      });
      focusMarkerRef.current.addTo(map);
      return;
    }

    focusMarkerRef.current.setLatLng([weatherFocus.lat, weatherFocus.lng]);
  }, [runtime, weatherFocus]);

  useEffect(() => {
    const params = new URLSearchParams({
      lat: activeWeatherTarget.lat.toFixed(6),
      lng: activeWeatherTarget.lng.toFixed(6),
    });
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setWeatherLoading(true);
      setWeatherError(null);

      try {
        const response = await fetch(`/api/weather?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string' ? payload.error : 'Could not load map weather.',
          );
        }

        setWeather(payload as FieldResponseWeatherPayload);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setWeatherError(
          friendlyWeatherError(error instanceof Error ? error.message : 'Could not load map weather.'),
        );
      } finally {
        if (!controller.signal.aborted) {
          setWeatherLoading(false);
        }
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeWeatherTarget.lat, activeWeatherTarget.lng, refreshNonce]);

  return (
    <div className={`responder-leaflet-shell relative w-full overflow-hidden bg-slate-100 ${containerClassName}`}>
      <div ref={containerRef} className="responder-leaflet-map h-full w-full" />
      {windSurfaceData ? (
        <ResponderWindFieldOverlay
          visible={animatedWindReady}
          width={mapViewport?.width ?? 0}
          height={mapViewport?.height ?? 0}
          rows={windSurfaceData.rows}
          cols={windSurfaceData.cols}
          samples={windSurfaceData.samples}
        />
      ) : null}

      {!runtimeError && !runtime && (
        <div className="absolute inset-0 z-[450] flex items-center justify-center bg-slate-100/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm font-medium">Loading field map...</p>
          </div>
        </div>
      )}

      {runtimeError && (
        <div className="absolute inset-0 z-[450] flex items-center justify-center bg-slate-100/92 px-6 text-center backdrop-blur-sm">
          <div className="max-w-sm rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-lg">
            <p className="text-sm font-semibold text-slate-900">{runtimeError}</p>
            <p className="mt-1 text-xs text-slate-500">
              The responder page no longer depends on Google Maps, so only the Leaflet runtime needs
              to load here.
            </p>
          </div>
        </div>
      )}

      <div className="absolute left-3 top-3 z-[500] max-w-[calc(100%-24px)]">
        {!weatherOpen ? (
          <button
            type="button"
            onClick={() => setWeatherOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/92 px-3 text-sm font-semibold text-slate-800 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.42)] backdrop-blur transition hover:bg-white"
            title="Open weather layers"
          >
            <Layers3 className="h-4 w-4 text-orange-500" />
            <span className="truncate">{weatherOverlayVisible ? activeLayerSummary : 'Weather hidden'}</span>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">
              {weatherOverlayVisible ? `${activeLayerIds.length} on` : 'Hidden'}
            </span>
          </button>
        ) : (
          <div className={`max-w-[calc(100vw-24px)] rounded-[24px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_24px_65px_-35px_rgba(15,23,42,0.42)] backdrop-blur ${weatherPanelWidth}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  OpenWeather
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="rounded-2xl bg-slate-100 p-2 text-slate-700">
                    <Layers3 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {weatherOverlayVisible ? activeLayerSummary : 'Weather hidden'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {weatherFocus.mode === 'point'
                        ? 'Pinned location weather'
                        : 'Current weather follows the map center'}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWeatherOpen(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                title="Hide weather layers"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold text-slate-800">Weather overlay</p>
                <p className="text-[11px] text-slate-500">
                  Blend live OpenWeather tiles into {activeBaseLayer.label}.
                </p>
              </div>
              <button
                type="button"
                onClick={handleWeatherVisibilityToggle}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  weatherOverlayVisible
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 shadow-sm ring-1 ring-inset ring-slate-200'
                }`}
              >
                {weatherOverlayVisible ? 'Showing' : 'Hidden'}
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAllLayers}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                <Layers3 className="h-3.5 w-3.5" />
                {allLayersSelected ? 'All layers on' : 'Open all layers'}
              </button>
              <button
                type="button"
                onClick={handleClearAllLayers}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-white"
              >
                <X className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Active now
              </p>
              {activeLayerIds.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeLayerIds.map((layerId) => (
                    <span
                      key={layerId}
                      className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200"
                    >
                      {getLayerDisplayLabel(layerId)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-slate-500">
                  No weather layers are selected right now.
                </p>
              )}
            </div>

            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Quick layers
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {quickLayers.map((layer) => {
                  const Icon = LAYER_ICON_MAP[layer.id];
                  const isActive = activeLayerIds.includes(layer.id);
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => handleLayerToggle(layer.id)}
                      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                        isActive
                          ? 'border-indigo-300 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                      }`}
                      >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{getLayerDisplayLabel(layer.id)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowAdvancedLayers((current) => !current)}
                className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white"
              >
                <span>Advanced layers</span>
                {showAdvancedLayers ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showAdvancedLayers && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {advancedLayers.map((layer) => {
                    const Icon = LAYER_ICON_MAP[layer.id];
                    const isActive = activeLayerIds.includes(layer.id);
                    return (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => handleLayerToggle(layer.id)}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                          isActive
                            ? 'border-indigo-300 bg-indigo-600 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                        }`}
                        >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{getLayerDisplayLabel(layer.id)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Overlay opacity</p>
                  <p className="text-[11px] text-slate-500">
                    {weatherOverlayVisible ? `${overlayOpacity}% visible` : 'Overlay is hidden'}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {overlayOpacity}%
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={2}
                value={overlayOpacity}
                onChange={(event) => setOverlayOpacity(Number(event.target.value))}
                className="mt-3 h-2 w-full cursor-pointer accent-indigo-600"
              />
            </div>

            {!weatherOverlayVisible && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                The map overlay is hidden right now. Pick one or more layers above, or tap Open all
                layers, to show wind, pressure, precipitation, temperature, and clouds together.
              </div>
            )}

            {windLayerSelected && weatherOverlayVisible && (
              <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900">
                {windSurfaceError
                  ? windSurfaceError
                  : animatedWindReady
                    ? 'Animated wind flow is active across the visible map using sampled OpenWeather vectors.'
                    : windSurfaceLoading
                      ? 'Loading animated wind flow for the visible map area.'
                      : 'Preparing animated wind flow for the visible map area.'}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeatherFocus({ mode: 'center' })}
                className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  weatherFocus.mode === 'center'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                Follow center
              </button>
              <button
                type="button"
                onClick={() => setWeatherOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  weatherFocus.mode === 'point'
                    ? 'border-orange-300 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
                title="Tap the map to inspect a point"
              >
                <Crosshair className="h-3.5 w-3.5" />
                Tap map to inspect
              </button>
            </div>

            <div className="mt-3 rounded-[22px] border border-slate-200 bg-white/90 p-3 shadow-sm">
              {weatherError ? (
                <p className="text-sm font-medium text-rose-600">{weatherError}</p>
              ) : weatherLoading && !weather ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading map weather...
                </div>
              ) : weather ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {focusLabel
                          || weather.location.name
                          || (weatherFocus.mode === 'point' ? 'Selected pin' : 'Map center')}
                      </p>
                      <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                        {formatTemperature(weather.current.temperature)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {weather.current.weatherLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 text-slate-700">
                      <WeatherIcon className="h-6 w-6" />
                    </div>
                  </div>

                  <div className={`mt-3 rounded-2xl border px-3 py-3 ${dispatchDecision.panelClassName}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${dispatchDecision.chipClassName}`}>
                        Dispatch
                      </span>
                      <span className="text-xs font-semibold">{dispatchDecision.label}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed">{dispatchDecision.detail}</p>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-500">{weather.summary}</p>

                  <ResponderWindDetailsCard weather={weather} compact={compactWeather} />

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <p className="text-slate-400">Current weather</p>
                      <p className="mt-1 font-semibold text-slate-700">
                        {weather.current.weatherLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <p className="text-slate-400">Next 60m peak rain</p>
                      <p className="mt-1 inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Droplets className="h-3.5 w-3.5" />
                        {formatRainPeak(weather.current.nextHourPrecipitationPeak)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <p className="text-slate-400">Next 3h rain chance</p>
                      <p className="mt-1 inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Droplets className="h-3.5 w-3.5" />
                        {formatPercent(nextThreeHourRainChance)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <p className="text-slate-400">Wind gust</p>
                      <p className="mt-1 inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Wind className="h-3.5 w-3.5" />
                        {formatWind(
                          weather.current.windGust,
                          weather.current.windDirectionCardinal,
                        )}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <p className="text-slate-400">Visibility</p>
                      <p className="mt-1 inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Eye className="h-3.5 w-3.5" />
                        {formatDistance(weather.current.visibility)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2">
                      <p className="text-slate-400">Precipitation type</p>
                      <p className="mt-1 font-semibold text-slate-700">
                        {weather.current.precipitationLabel}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-2xl bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-slate-400">Official warning status</p>
                        {officialWarning ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${
                            officialWarning.severity === 'warning'
                              ? 'bg-rose-100 text-rose-700'
                              : officialWarning.severity === 'watch'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {officialWarning.severity}
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                            None
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-semibold text-slate-700">
                        {officialWarning?.title || 'No official provider warning in the current feed.'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px]">
                    <p className="font-semibold text-slate-700">
                      Updated {formatUpdatedDateTime(weather.generatedAt)}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {weather.provider.label}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                    <div>
                      <p>Updated {formatUpdatedTime(weather.generatedAt)}</p>
                      <p>{weather.provider.cadenceMinutes ? `~${weather.provider.cadenceMinutes} minute cadence` : 'Live forecast feed'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRefreshNonce((current) => current + 1)}
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-700 transition hover:bg-white"
                    >
                      {weatherLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Refresh
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Pan the map or tap a point to load the OpenWeather conditions for this response area.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="absolute right-3 top-3 z-[500] flex max-w-[calc(100%-24px)] flex-col items-end">
        {!baseLayersOpen ? (
          <button
            type="button"
            onClick={() => setBaseLayersOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/84 px-3 text-sm font-semibold text-white shadow-[0_24px_55px_-32px_rgba(15,23,42,0.78)] backdrop-blur transition hover:bg-slate-950"
            title="Open map layers"
          >
            <Layers3 className="h-4 w-4 text-sky-300" />
            <span className="max-w-[148px] truncate">{activeBaseLayer.label}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-200">
              Base map
            </span>
          </button>
        ) : (
          <div className={`max-w-[calc(100vw-24px)] rounded-[26px] border border-slate-700/80 bg-slate-950/88 p-3 text-white shadow-[0_28px_80px_-34px_rgba(15,23,42,0.82)] backdrop-blur ${baseLayerPanelWidth}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Field Response
                </p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">Map Layers</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  OSM-style base maps with a topo-first fallback for field routing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBaseLayersOpen(false)}
                className="rounded-full bg-white/8 p-1.5 text-slate-300 transition hover:bg-white/14 hover:text-white"
                title="Close map layers"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Active now
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="rounded-2xl border border-sky-300/30 bg-sky-400/14 p-2 text-sky-100">
                  <ActiveBaseLayerIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{activeBaseLayer.label}</p>
                  <p className="text-[11px] text-slate-300">{activeBaseLayer.provider}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                {activeBaseLayer.description}
              </p>
            </div>

            <div className="mt-3 max-h-[min(58vh,560px)] space-y-2 overflow-y-auto pr-1">
              {RESPONDER_BASE_MAP_LAYERS.map((layer) => {
                const Icon = BASE_LAYER_ICON_MAP[layer.id];
                const isActive = layer.id === activeBaseLayer.id;
                const isAvailable = canUseBaseMapLayer(layer);
                const previewUrl = buildBaseLayerPreviewUrl(
                  layer,
                  mapCenter.lat,
                  mapCenter.lng,
                  baseLayerPreviewZoom,
                );

                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => handleBaseLayerSelect(layer.id)}
                    disabled={!isAvailable}
                    className={`group block w-full text-left transition ${
                      isAvailable ? 'hover:translate-x-0.5' : 'cursor-not-allowed'
                    }`}
                  >
                    <div className={`relative overflow-hidden rounded-[22px] border bg-slate-900 ${
                      isActive
                        ? 'border-sky-300/80 ring-2 ring-sky-400/40'
                        : 'border-white/12'
                    }`}>
                      {previewUrl ? (
                        <div
                          className="absolute inset-0 scale-[1.02] bg-cover bg-center"
                          style={{ backgroundImage: `url(${previewUrl})` }}
                        />
                      ) : null}
                      <div className={`absolute inset-0 bg-gradient-to-br ${layer.previewGradientClassName}`} />
                      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/82 via-slate-950/38 to-slate-950/78" />

                      <div className="relative flex min-h-[106px] flex-col justify-between p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className={`rounded-2xl border p-2 ${
                              isActive
                                ? 'border-sky-300/30 bg-sky-400/16 text-sky-100'
                                : 'border-white/10 bg-white/10 text-white'
                            }`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-base font-bold text-white">{layer.label}</p>
                              <p className="truncate text-[11px] text-slate-300">{layer.provider}</p>
                            </div>
                          </div>

                          <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                            isActive
                              ? 'bg-sky-400/18 text-sky-100 ring-1 ring-inset ring-sky-300/35'
                              : isAvailable
                                ? 'bg-white/12 text-slate-100 ring-1 ring-inset ring-white/12'
                                : 'bg-amber-400/14 text-amber-100 ring-1 ring-inset ring-amber-200/25'
                          }`}>
                            {isActive ? 'Active' : getBaseLayerAvailabilityLabel(layer)}
                          </span>
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-3">
                          <p className="max-w-[76%] text-xs leading-relaxed text-slate-200">
                            {layer.description}
                          </p>
                          {!isAvailable ? (
                            <Lock className="h-4 w-4 flex-shrink-0 text-amber-200/90" />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-slate-300">
              {TRACESTRACK_API_KEY || THUNDERFOREST_API_KEY
                ? 'Key-backed OSM.org styles are enabled automatically when their provider key is present.'
                : 'Cycle Map, Transport Map, and Tracestrack Topo unlock automatically after adding NEXT_PUBLIC_THUNDERFOREST_API_KEY or NEXT_PUBLIC_TRACESTRACK_KEY to .env.local.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
import { Bike, BusFront, CloudRain, Cloudy, Gauge, Map, Mountain, Route, Shield, Thermometer, Wind } from 'lucide-react';
import { getOpenWeatherMapLayer, type OpenWeatherTileLayerId } from '@/lib/openweather-map-layers';

export type ResponderBaseMapLayerId =
  | 'standard'
  | 'cyclosm'
  | 'cyclemap'
  | 'transportmap'
  | 'tracestracktopo'
  | 'humanitarian'
  | 'opentopomap';

export interface ResponderBaseMapLayerDefinition {
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
}

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const THUNDERFOREST_API_KEY = process.env.NEXT_PUBLIC_THUNDERFOREST_API_KEY?.trim() ?? '';
const TRACESTRACK_API_KEY = process.env.NEXT_PUBLIC_TRACESTRACK_KEY?.trim() ?? '';
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

export const QUICK_LAYER_IDS: OpenWeatherTileLayerId[] = ['PR0', 'WND'];
export const ADVANCED_LAYER_IDS: OpenWeatherTileLayerId[] = ['WS10', 'TA2', 'APM', 'CL'];
export const ALL_LAYER_IDS: OpenWeatherTileLayerId[] = [...QUICK_LAYER_IDS, ...ADVANCED_LAYER_IDS];

export const WEATHER_LAYER_Z_INDEX: Record<OpenWeatherTileLayerId, number> = {
  PR0: 360,
  TA2: 365,
  APM: 370,
  CL: 375,
  WS10: 380,
  WND: 385,
};

export const RESPONDER_BASE_MAP_LAYERS: ResponderBaseMapLayerDefinition[] = [
  {
    id: 'standard',
    label: 'Standard',
    provider: 'OpenStreetMap',
    description: 'General navigation and household pin review.',
    tileUrl: OSM_TILE_URL,
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
  },
  {
    id: 'cyclosm',
    label: 'CyclOSM',
    provider: 'CyclOSM',
    description: 'Road hierarchy and paths are more readable for field routing.',
    tileUrl: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: CYCLOSM_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['a', 'b', 'c'],
  },
  {
    id: 'cyclemap',
    label: 'Cycle Map',
    provider: 'Thunderforest',
    description: 'OpenCycleMap styling when a Thunderforest key is configured.',
    tileUrl: 'https://api.thunderforest.com/cycle/{z}/{x}/{y}{r}.png?apikey={apikey}',
    attribution: THUNDERFOREST_ATTRIBUTION,
    maxZoom: 21,
    apiKey: THUNDERFOREST_API_KEY,
    requiredEnvVar: 'NEXT_PUBLIC_THUNDERFOREST_API_KEY',
  },
  {
    id: 'transportmap',
    label: 'Transport Map',
    provider: 'Thunderforest',
    description: 'Transit-focused road styling when a Thunderforest key is configured.',
    tileUrl: 'https://api.thunderforest.com/transport/{z}/{x}/{y}{r}.png?apikey={apikey}',
    attribution: THUNDERFOREST_ATTRIBUTION,
    maxZoom: 21,
    apiKey: THUNDERFOREST_API_KEY,
    requiredEnvVar: 'NEXT_PUBLIC_THUNDERFOREST_API_KEY',
  },
  {
    id: 'tracestracktopo',
    label: 'Tracestrack Topo',
    provider: 'Tracestrack',
    description: 'Closest topo match for terrain-heavy field navigation.',
    tileUrl: 'https://tile.tracestrack.com/topo__/{z}/{x}/{y}.webp?key={apikey}',
    attribution: TRACESTRACK_ATTRIBUTION,
    maxZoom: 19,
    apiKey: TRACESTRACK_API_KEY,
    requiredEnvVar: 'NEXT_PUBLIC_TRACESTRACK_KEY',
  },
  {
    id: 'humanitarian',
    label: 'Humanitarian',
    provider: 'HOT / OSM-FR',
    description: 'Emergency-friendly styling with clear roads and landmarks.',
    tileUrl: 'https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: HUMANITARIAN_ATTRIBUTION,
    maxZoom: 20,
    subdomains: ['a', 'b', 'c'],
  },
  {
    id: 'opentopomap',
    label: 'OpenTopoMap',
    provider: 'OpenTopoMap',
    description: 'Terrain fallback with contour lines for mountain barangays.',
    tileUrl: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: OPENTOPOMAP_ATTRIBUTION,
    maxZoom: 17,
    subdomains: ['a', 'b', 'c'],
  },
];

export const BASE_LAYER_ICON_MAP: Record<ResponderBaseMapLayerId, LucideIcon> = {
  standard: Map,
  cyclosm: Bike,
  cyclemap: Bike,
  transportmap: BusFront,
  tracestracktopo: Route,
  humanitarian: Shield,
  opentopomap: Mountain,
};

export const LAYER_ICON_MAP: Record<OpenWeatherTileLayerId, LucideIcon> = {
  TA2: Thermometer,
  APM: Gauge,
  WS10: Wind,
  PR0: CloudRain,
  CL: Cloudy,
  WND: Wind,
};

export const DEFAULT_BASE_LAYER_ID: ResponderBaseMapLayerId = TRACESTRACK_API_KEY
  ? 'tracestracktopo'
  : 'opentopomap';

export const BASE_LAYER_STORAGE_KEY = 'responder-map-base-layer';

export function getBaseMapLayer(layerId: ResponderBaseMapLayerId) {
  return RESPONDER_BASE_MAP_LAYERS.find((layer) => layer.id === layerId) ?? null;
}

export function isResponderBaseMapLayerId(value: string): value is ResponderBaseMapLayerId {
  return RESPONDER_BASE_MAP_LAYERS.some((layer) => layer.id === value);
}

export function canUseBaseMapLayer(layer: ResponderBaseMapLayerDefinition) {
  return !layer.requiredEnvVar || Boolean(layer.apiKey);
}

export function getBaseLayerTileTemplate(layer: ResponderBaseMapLayerDefinition) {
  if (!canUseBaseMapLayer(layer)) return null;
  return layer.tileUrl.replaceAll('{apikey}', layer.apiKey ?? '').replaceAll('{r}', '');
}

export function getBaseLayerAvailabilityLabel(layer: ResponderBaseMapLayerDefinition) {
  if (canUseBaseMapLayer(layer)) return 'Ready';
  return layer.requiredEnvVar ? 'Key required' : 'Unavailable';
}

export function getLayerDisplayLabel(layerId: OpenWeatherTileLayerId) {
  if (layerId === 'WND') return 'Wind flow';
  return getOpenWeatherMapLayer(layerId)?.label ?? layerId;
}

export function summarizeActiveLayers(layerIds: OpenWeatherTileLayerId[]) {
  if (layerIds.length === 0) return 'No weather layers selected';
  if (layerIds.length === 1) return getLayerDisplayLabel(layerIds[0]!);
  if (layerIds.length === 2) {
    return `${getLayerDisplayLabel(layerIds[0]!)} + ${getLayerDisplayLabel(layerIds[1]!)}`;
  }
  return `${layerIds.length} layers active`;
}

export function getWeatherPaneName(layerId: OpenWeatherTileLayerId) {
  return `responder-weather-pane-${layerId.toLowerCase()}`;
}

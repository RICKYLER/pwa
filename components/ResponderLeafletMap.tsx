'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Household, Incident } from '@/lib/db/schema';
import {
  DEFAULT_BARANGAY_CENTER,
  HOUSEHOLD_PIN_COLOR,
  hasHouseholdPin,
} from '@/lib/map-pins';
import ResponderWindFieldOverlay from '@/components/ResponderWindFieldOverlay';
import type { OpenWeatherTileLayerId } from '@/lib/openweather-map-layers';
import {
  DEFAULT_BASE_LAYER_ID,
  WEATHER_LAYER_Z_INDEX,
  canUseBaseMapLayer,
  getBaseLayerTileTemplate,
  getBaseMapLayer,
  getWeatherPaneName,
  type ResponderBaseMapLayerId,
} from '@/lib/responder-map-config';

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
  redraw?(): this;
  setOpacity?(value: number): this;
  setUrl?(url: string): this;
}

interface LeafletTileLayer extends LeafletLayer {
  off(
    event: 'load' | 'loading' | 'tileerror' | 'tileload',
    handler: () => void,
  ): this;
  on(
    event: 'load' | 'loading' | 'tileerror' | 'tileload',
    handler: () => void,
  ): this;
}

interface LeafletMarker extends LeafletLayer {
  on(event: string, handler: (event: { latlng?: { lat: number; lng: number } }) => void): this;
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
  providerMode: 'current' | 'forecast' | 'mixed' | null;
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
  tileLayer(urlTemplate: string, options?: Record<string, unknown>): LeafletTileLayer;
}

interface WindSurfaceGrid {
  cols: number;
  rows: number;
}

interface ResponderLeafletMapProps {
  households: Household[];
  incidents: Incident[];
  selectedHousehold?: Household | null;
  onSelectHousehold?: (household: Household | null) => void;
  selectedIncident?: Incident | null;
  onSelectIncident?: (incident: Incident | null) => void;
  activeBaseLayerId: ResponderBaseMapLayerId;
  activeLayerIds: OpenWeatherTileLayerId[];
  showWeather: boolean;
  overlayOpacity: number;
  refreshVersion?: number;
  containerClassName?: string;
  compactWeather?: boolean;
}

const INCIDENT_SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#94a3b8',
};

const LEAFLET_CSS_ID = 'responder-leaflet-css';
const LEAFLET_SCRIPT_ID = 'responder-leaflet-script';
const LEAFLET_CSS_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_SCRIPT_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LAYER_SWAP_TIMEOUT_MS = 2200;
const LAYER_FADE_DELAY_MS = 180;
const PREFETCH_RING_TILES = 1;
const PREFETCH_DEBOUNCE_MS = 260;
const MAX_TRACKED_PREFETCH_KEYS = 4096;

let leafletRuntimePromise: Promise<LeafletRuntime> | null = null;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveWeatherTileOpacity(
  layerId: OpenWeatherTileLayerId,
  overlayOpacity: number,
  windLayerSelected: boolean,
) {
  const normalizedOpacity = clampNumber(overlayOpacity, 20, 100) / 100;

  if (!windLayerSelected) {
    return normalizedOpacity;
  }

  if (layerId === 'PR0') {
    return Math.min(normalizedOpacity, 0.22);
  }

  if (layerId === 'CL') {
    return Math.min(normalizedOpacity, 0.18);
  }

  if (layerId === 'TA2' || layerId === 'APM') {
    return Math.min(normalizedOpacity, 0.28);
  }

  if (layerId === 'WS10') {
    return Math.min(normalizedOpacity, 0.24);
  }

  return normalizedOpacity;
}

function resolveWindSurfaceGrid(
  viewportWidth: number,
  viewportHeight: number,
  compactWeather: boolean,
  zoom: number,
): WindSurfaceGrid {
  const safeWidth = Math.max(viewportWidth, compactWeather ? 720 : 960);
  const safeHeight = Math.max(viewportHeight, compactWeather ? 480 : 640);
  const densityBase = zoom <= 10
    ? compactWeather ? 240 : 220
    : zoom <= 12
      ? compactWeather ? 210 : 185
      : compactWeather ? 170 : 145;
  const minCols = zoom <= 10
    ? compactWeather ? 4 : 5
    : zoom <= 12
      ? compactWeather ? 5 : 6
      : compactWeather ? 5 : 7;
  const minRows = zoom <= 12 ? 4 : compactWeather ? 4 : 5;
  const maxCols = compactWeather ? 8 : 11;
  const maxRows = compactWeather ? 6 : 8;

  return {
    cols: clampNumber(Math.round(safeWidth / densityBase), minCols, maxCols),
    rows: clampNumber(Math.round(safeHeight / densityBase), minRows, maxRows),
  };
}

function queueMapRefresh(map: LeafletMap) {
  const refresh = () => {
    map.invalidateSize();
  };

  window.requestAnimationFrame(refresh);
  window.setTimeout(refresh, 140);
  window.setTimeout(refresh, 320);
}

function resolveSelectionZoom(map: LeafletMap, weatherOverlayVisible: boolean) {
  const currentZoom = map.getZoom();
  if (!weatherOverlayVisible) {
    return Math.max(currentZoom, 17);
  }

  return clampNumber(Math.max(currentZoom, 15), 15, 16);
}

function normalizeTileX(value: number, zoom: number) {
  const tileRange = 1 << zoom;
  return ((value % tileRange) + tileRange) % tileRange;
}

function clampTileY(value: number, zoom: number) {
  return clampNumber(value, 0, (1 << zoom) - 1);
}

function longitudeToTileX(longitude: number, zoom: number) {
  return Math.floor(((longitude + 180) / 360) * (1 << zoom));
}

function latitudeToTileY(latitude: number, zoom: number) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const mercator = Math.log(Math.tan((Math.PI / 4) + (latitudeRadians / 2)));
  return Math.floor((1 - (mercator / Math.PI)) / 2 * (1 << zoom));
}

function getTileRingCoordinates(viewport: MapViewportSnapshot, ring = PREFETCH_RING_TILES) {
  const zoom = Math.max(0, Math.floor(viewport.zoom));
  const minVisibleX = longitudeToTileX(viewport.west, zoom);
  const maxVisibleX = longitudeToTileX(viewport.east, zoom);
  const minVisibleY = latitudeToTileY(viewport.north, zoom);
  const maxVisibleY = latitudeToTileY(viewport.south, zoom);
  const coordinates: Array<{ x: number; y: number; z: number }> = [];

  for (let y = minVisibleY - ring; y <= maxVisibleY + ring; y += 1) {
    const clampedY = clampTileY(y, zoom);
    for (let x = minVisibleX - ring; x <= maxVisibleX + ring; x += 1) {
      const normalizedX = normalizeTileX(x, zoom);
      const isVisibleTile =
        x >= minVisibleX
        && x <= maxVisibleX
        && y >= minVisibleY
        && y <= maxVisibleY;

      if (isVisibleTile) {
        continue;
      }

      coordinates.push({
        x: normalizedX,
        y: clampedY,
        z: zoom,
      });
    }
  }

  return coordinates;
}

function pickTileSubdomain(subdomains: string[] | undefined, x: number, y: number) {
  if (!subdomains || subdomains.length === 0) {
    return 'a';
  }

  const index = Math.abs(x + y) % subdomains.length;
  return subdomains[index]!;
}

function buildBaseTileUrl(
  template: string,
  coordinates: { x: number; y: number; z: number },
  subdomains: string[] | undefined,
) {
  return template
    .replaceAll('{s}', pickTileSubdomain(subdomains, coordinates.x, coordinates.y))
    .replaceAll('{z}', String(coordinates.z))
    .replaceAll('{x}', String(coordinates.x))
    .replaceAll('{y}', String(coordinates.y));
}

function buildWeatherTileUrl(
  layerId: OpenWeatherTileLayerId,
  coordinates: { x: number; y: number; z: number },
) {
  const prefer = layerId === 'WND' ? 'v2' : 'v1';
  return `/api/weather/map-tile?layer=${layerId}&prefer=${prefer}&z=${coordinates.z}&x=${coordinates.x}&y=${coordinates.y}`;
}

function waitForTileLayerUsable(layer: LeafletTileLayer) {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let hasLoadedTile = false;
    const timeoutId = window.setTimeout(() => settle(hasLoadedTile), LAYER_SWAP_TIMEOUT_MS);

    const handleTileLoad = () => {
      hasLoadedTile = true;
      settle(true);
    };

    const handleLoad = () => {
      hasLoadedTile = true;
      settle(true);
    };

    const settle = (usable: boolean) => {
      if (resolved) {
        return;
      }

      resolved = true;
      window.clearTimeout(timeoutId);
      layer.off('tileload', handleTileLoad);
      layer.off('load', handleLoad);
      resolve(usable);
    };

    layer.on('tileload', handleTileLoad);
    layer.on('load', handleLoad);
  });
}

function waitForTileLayerComplete(layer: LeafletTileLayer) {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let hasLoadedTile = false;
    const timeoutId = window.setTimeout(() => settle(hasLoadedTile), LAYER_SWAP_TIMEOUT_MS);

    const handleTileLoad = () => {
      hasLoadedTile = true;
    };

    const handleLoad = () => {
      hasLoadedTile = true;
      settle(true);
    };

    const settle = (complete: boolean) => {
      if (resolved) {
        return;
      }

      resolved = true;
      window.clearTimeout(timeoutId);
      layer.off('tileload', handleTileLoad);
      layer.off('load', handleLoad);
      resolve(complete);
    };

    layer.on('tileload', handleTileLoad);
    layer.on('load', handleLoad);
  });
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

function buildHouseholdMarkerHtml(selected: boolean) {
  const outerSize = selected ? 30 : 22;
  const innerSize = selected ? 16 : 13;
  const ringColor = selected ? 'rgba(8,47,73,0.22)' : 'rgba(8,47,73,0.12)';
  return `
    <div style="width:${outerSize}px;height:${outerSize}px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:${ringColor};box-shadow:0 12px 24px rgba(15,23,42,0.18);">
      <div style="width:${innerSize}px;height:${innerSize}px;border-radius:999px;background:${HOUSEHOLD_PIN_COLOR};border:3px solid #ffffff;"></div>
    </div>
  `;
}

function buildIncidentMarkerHtml(severity: string, selected: boolean) {
  const color = INCIDENT_SEVERITY_COLORS[severity] ?? INCIDENT_SEVERITY_COLORS.low;
  const size = selected ? 22 : 18;
  return `
    <div style="width:${size}px;height:${size}px;transform:rotate(45deg);border-radius:5px;background:${color};border:3px solid #ffffff;box-shadow:0 10px 22px rgba(15,23,42,0.24);"></div>
  `;
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
  selectedIncident,
  onSelectIncident,
  activeBaseLayerId,
  activeLayerIds,
  showWeather,
  overlayOpacity,
  refreshVersion = 0,
  containerClassName = 'h-full',
  compactWeather = false,
}: ResponderLeafletMapProps) {
  const [runtime, setRuntime] = useState<LeafletRuntime | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [mapViewport, setMapViewport] = useState<MapViewportSnapshot | null>(null);
  const [windSurfaceData, setWindSurfaceData] = useState<WindSurfacePayload | null>(null);
  const [windSurfaceLoading, setWindSurfaceLoading] = useState(false);
  const [windSurfaceError, setWindSurfaceError] = useState<string | null>(null);
  const [baseLayerReady, setBaseLayerReady] = useState(false);
  const [mapTransitioning, setMapTransitioning] = useState(false);
  const [internalSelectedHousehold, setInternalSelectedHousehold] = useState<Household | null>(null);
  const [internalSelectedIncident, setInternalSelectedIncident] = useState<Incident | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onSelectHouseholdRef = useRef(onSelectHousehold);
  const onSelectIncidentRef = useRef(onSelectIncident);
  const selectedHouseholdControlledRef = useRef(selectedHousehold !== undefined);
  const selectedIncidentControlledRef = useRef(selectedIncident !== undefined);
  const householdLayerRef = useRef<LeafletLayerGroup | null>(null);
  const incidentLayerRef = useRef<LeafletLayerGroup | null>(null);
  const baseTileRefs = useRef<Partial<Record<ResponderBaseMapLayerId, LeafletTileLayer>>>({});
  const weatherTileRefs = useRef<Partial<Record<OpenWeatherTileLayerId, LeafletTileLayer>>>({});
  const activeBaseLayerRef = useRef<{
    key: ResponderBaseMapLayerId;
    layer: LeafletTileLayer;
  } | null>(null);
  const baseLayerSwapTokenRef = useRef(0);
  const weatherLayerSwapTokenRef = useRef(0);
  const prefetchedTileKeysRef = useRef<Set<string>>(new Set());
  const prefetchImageRefs = useRef<Set<HTMLImageElement>>(new Set());

  const activeSelectedHousehold =
    selectedHousehold === undefined ? internalSelectedHousehold : selectedHousehold;
  const activeSelectedIncident =
    selectedIncident === undefined ? internalSelectedIncident : selectedIncident;
  const activeIncidents = useMemo(
    () => incidents.filter((incident) => incident.status !== 'resolved'),
    [incidents],
  );
  const viewportReady = (mapViewport?.width ?? 0) > 0 && (mapViewport?.height ?? 0) > 0;
  const weatherOverlayVisible = showWeather && activeLayerIds.length > 0;
  const windLayerSelected = activeLayerIds.includes('WND');
  const animatedWindReady = windLayerSelected && weatherOverlayVisible && Boolean(windSurfaceData);
  const suppressStaticWindTiles = windLayerSelected && weatherOverlayVisible && !windSurfaceError;
  const windSurfaceGrid = useMemo(
    () => resolveWindSurfaceGrid(
      mapViewport?.width ?? 0,
      mapViewport?.height ?? 0,
      compactWeather,
      mapViewport?.zoom ?? 14,
    ),
    [compactWeather, mapViewport?.height, mapViewport?.width, mapViewport?.zoom],
  );

  useEffect(() => {
    onSelectHouseholdRef.current = onSelectHousehold;
    onSelectIncidentRef.current = onSelectIncident;
    selectedHouseholdControlledRef.current = selectedHousehold !== undefined;
    selectedIncidentControlledRef.current = selectedIncident !== undefined;
  }, [onSelectHousehold, onSelectIncident, selectedHousehold, selectedIncident]);

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

    Object.keys(WEATHER_LAYER_Z_INDEX).forEach((layerId) => {
      const paneName = getWeatherPaneName(layerId as OpenWeatherTileLayerId);
      if (!map.getPane(paneName)) {
        map.createPane(paneName);
      }
      const weatherPane = map.getPane(paneName);
      if (weatherPane) {
        weatherPane.style.zIndex = String(WEATHER_LAYER_Z_INDEX[layerId as OpenWeatherTileLayerId]);
        weatherPane.style.pointerEvents = 'none';
      }
    });

    const syncViewport = () => {
      const bounds = map.getBounds();
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

    const handleMapClick = () => {
      onSelectHouseholdRef.current?.(null);
      onSelectIncidentRef.current?.(null);
      if (!selectedHouseholdControlledRef.current) setInternalSelectedHousehold(null);
      if (!selectedIncidentControlledRef.current) setInternalSelectedIncident(null);
    };

    const handleMoveStart = () => {
      setMapTransitioning(true);
    };

    const handleMoveEnd = () => {
      setMapTransitioning(false);
      syncViewport();
    };

    map.on('movestart', handleMoveStart);
    map.on('moveend', handleMoveEnd);
    map.on('click', handleMapClick);
    syncViewport();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        map.invalidateSize();
        syncViewport();
      })
      : null;

    resizeObserver?.observe(containerRef.current);
    const initialAnimationFrame = window.requestAnimationFrame(() => {
      map.invalidateSize();
      syncViewport();
    });
    const initialTimeoutId = window.setTimeout(() => {
      map.invalidateSize();
      syncViewport();
    }, 120);

    return () => {
      window.cancelAnimationFrame(initialAnimationFrame);
      window.clearTimeout(initialTimeoutId);
      resizeObserver?.disconnect();
      map.off('movestart', handleMoveStart);
      map.off('moveend', handleMoveEnd);
      map.off('click', handleMapClick);
      map.remove();
      mapRef.current = null;
      householdLayerRef.current = null;
      incidentLayerRef.current = null;
      baseTileRefs.current = {};
      weatherTileRefs.current = {};
      activeBaseLayerRef.current = null;
      prefetchedTileKeysRef.current.clear();
      prefetchImageRefs.current.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
      prefetchImageRefs.current.clear();
      setBaseLayerReady(false);
      setMapViewport(null);
    };
  }, [runtime]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime || !viewportReady) return;

    const requestedBaseLayer = getBaseMapLayer(activeBaseLayerId) ?? getBaseMapLayer(DEFAULT_BASE_LAYER_ID)!;
    const fallbackBaseLayer = getBaseMapLayer(DEFAULT_BASE_LAYER_ID)!;
    const activeBaseLayer = canUseBaseMapLayer(requestedBaseLayer)
      ? requestedBaseLayer
      : fallbackBaseLayer;
    const tileTemplate = getBaseLayerTileTemplate(activeBaseLayer);
    if (!tileTemplate) return;

    map.invalidateSize();

    const currentLayer = activeBaseLayerRef.current;
    const nextLayer = baseTileRefs.current[activeBaseLayer.id]
      ?? runtime.tileLayer(tileTemplate, {
        attribution: activeBaseLayer.attribution,
        maxZoom: activeBaseLayer.maxZoom,
        subdomains: activeBaseLayer.subdomains,
        keepBuffer: 10,
        updateWhenIdle: false,
        updateWhenZooming: true,
        updateInterval: 120,
        crossOrigin: true,
      });

    baseTileRefs.current[activeBaseLayer.id] = nextLayer;
    nextLayer.setUrl?.(tileTemplate);

    if (!map.hasLayer(nextLayer)) {
      nextLayer.addTo(map);
    }
    nextLayer.setOpacity?.(1);
    nextLayer.redraw?.();

    if (currentLayer?.key === activeBaseLayer.id) {
      setBaseLayerReady(true);
      return;
    }

    const previousLayer = currentLayer?.layer ?? null;
    const swapToken = ++baseLayerSwapTokenRef.current;
    activeBaseLayerRef.current = {
      key: activeBaseLayer.id,
      layer: nextLayer,
    };
    setBaseLayerReady(previousLayer !== null);

    void waitForTileLayerUsable(nextLayer).then((usable) => {
      if (baseLayerSwapTokenRef.current !== swapToken || !usable) {
        return;
      }

      setBaseLayerReady(true);
    });

    void waitForTileLayerComplete(nextLayer).then((completed) => {
      if (baseLayerSwapTokenRef.current !== swapToken || !completed || !previousLayer || previousLayer === nextLayer) {
        return;
      }

      window.setTimeout(() => {
        if (map.hasLayer(previousLayer)) {
          map.removeLayer(previousLayer);
        }
      }, LAYER_FADE_DELAY_MS);
    });

    Object.entries(baseTileRefs.current).forEach(([layerId, layer]) => {
      if (!layer || layer === nextLayer || layer === previousLayer) {
        return;
      }

      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
  }, [runtime, activeBaseLayerId, viewportReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime) return;

    if (activeSelectedHousehold && hasHouseholdPin(activeSelectedHousehold)) {
      map.flyTo(
        [activeSelectedHousehold.gps_lat, activeSelectedHousehold.gps_long],
        resolveSelectionZoom(map, weatherOverlayVisible),
        {
          duration: weatherOverlayVisible ? 0.32 : 0.45,
        },
      );
      queueMapRefresh(map);
      return;
    }

    if (activeSelectedIncident && hasIncidentPin(activeSelectedIncident)) {
      map.flyTo(
        [activeSelectedIncident.gps_lat, activeSelectedIncident.gps_lng],
        resolveSelectionZoom(map, weatherOverlayVisible),
        {
          duration: weatherOverlayVisible ? 0.32 : 0.45,
        },
      );
      queueMapRefresh(map);
      return;
    }

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
    const preferredFocusPoints = incidentFocusPoints.length > 0 ? incidentFocusPoints : focusPoints;

    if (preferredFocusPoints.length === 0) {
      map.setView([DEFAULT_BARANGAY_CENTER.lat, DEFAULT_BARANGAY_CENTER.lng], 14);
      queueMapRefresh(map);
      return;
    }

    if (preferredFocusPoints.length === 1) {
      map.setView([preferredFocusPoints[0]!.lat, preferredFocusPoints[0]!.lng], weatherOverlayVisible ? 15 : 17);
      queueMapRefresh(map);
      return;
    }

    map.fitBounds(
      runtime.latLngBounds(preferredFocusPoints.map((point) => [point.lat, point.lng])),
      { padding: [28, 28], maxZoom: weatherOverlayVisible ? 15 : 16 },
    );
    queueMapRefresh(map);
  }, [runtime, households, activeIncidents, activeSelectedHousehold, activeSelectedIncident, weatherOverlayVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime || !householdLayerRef.current || !incidentLayerRef.current) return;

    householdLayerRef.current.clearLayers();
    incidentLayerRef.current.clearLayers();

    households.filter(hasHouseholdPin).forEach((household) => {
      const isSelected = activeSelectedHousehold?.id === household.id;
      const marker = runtime.marker([household.gps_lat, household.gps_long], {
        icon: runtime.divIcon({
          className: 'responder-marker',
          html: buildHouseholdMarkerHtml(isSelected),
          iconSize: isSelected ? [30, 30] : [22, 22],
          iconAnchor: isSelected ? [15, 15] : [11, 11],
        }),
      });

      marker.on('click', () => {
        onSelectHousehold?.(household);
        onSelectIncident?.(null);
        if (selectedHousehold === undefined) setInternalSelectedHousehold(household);
        if (selectedIncident === undefined) setInternalSelectedIncident(null);
      });

      householdLayerRef.current?.addLayer(marker);
    });

    activeIncidents.filter(hasIncidentPin).forEach((incident) => {
      const isSelected = activeSelectedIncident?.id === incident.id;
      const marker = runtime.marker([incident.gps_lat, incident.gps_lng], {
        icon: runtime.divIcon({
          className: 'responder-marker',
          html: buildIncidentMarkerHtml(incident.severity, isSelected),
          iconSize: isSelected ? [22, 22] : [18, 18],
          iconAnchor: isSelected ? [11, 11] : [9, 9],
        }),
      });

      marker.on('click', () => {
        onSelectIncident?.(incident);
        onSelectHousehold?.(null);
        if (selectedIncident === undefined) setInternalSelectedIncident(incident);
        if (selectedHousehold === undefined) setInternalSelectedHousehold(null);
      });

      incidentLayerRef.current?.addLayer(marker);
    });

    map.closePopup();
  }, [
    runtime,
    households,
    activeIncidents,
    activeSelectedHousehold,
    activeSelectedIncident,
    onSelectHousehold,
    onSelectIncident,
    selectedHousehold,
    selectedIncident,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime || !viewportReady || !baseLayerReady) return;
    map.invalidateSize();

    const desiredLayerIds = new Set<OpenWeatherTileLayerId>();
    const pendingDesiredLayerLoads: Array<Promise<boolean>> = [];
    const swapToken = ++weatherLayerSwapTokenRef.current;

    Object.keys(WEATHER_LAYER_Z_INDEX).forEach((layerId) => {
      const typedLayerId = layerId as OpenWeatherTileLayerId;
      const effectiveOpacity = resolveWeatherTileOpacity(typedLayerId, overlayOpacity, windLayerSelected);
      const shouldShowLayer = showWeather
        && activeLayerIds.includes(typedLayerId)
        && !((typedLayerId === 'WND' || typedLayerId === 'WS10') && suppressStaticWindTiles);
      const existingLayer = weatherTileRefs.current[typedLayerId];

      if (!shouldShowLayer) {
        return;
      }

      desiredLayerIds.add(typedLayerId);
      const tilePreference = typedLayerId === 'WND' ? 'v2' : 'v1';
      const tileUrl = `/api/weather/map-tile?layer=${typedLayerId}&prefer=${tilePreference}&z={z}&x={x}&y={y}`;

      if (!existingLayer) {
        weatherTileRefs.current[typedLayerId] = runtime.tileLayer(tileUrl, {
          opacity: effectiveOpacity,
          pane: getWeatherPaneName(typedLayerId),
          maxNativeZoom: 10,
          keepBuffer: 8,
          updateWhenIdle: false,
          updateWhenZooming: true,
          updateInterval: 120,
          crossOrigin: true,
          className: 'weather-tile-layer-smooth',
        });
      }

      const activeTileLayer = weatherTileRefs.current[typedLayerId];
      if (!activeTileLayer) {
        return;
      }

      activeTileLayer.setUrl?.(tileUrl);
      activeTileLayer.setOpacity?.(effectiveOpacity);

      if (!map.hasLayer(activeTileLayer)) {
        activeTileLayer.addTo(map);
        pendingDesiredLayerLoads.push(waitForTileLayerComplete(activeTileLayer));
      } else {
        activeTileLayer.redraw?.();
      }
    });

    const removeObsoleteLayers = () => {
      Object.entries(weatherTileRefs.current).forEach(([layerId, layer]) => {
        if (!layer || desiredLayerIds.has(layerId as OpenWeatherTileLayerId) || !map.hasLayer(layer)) {
          return;
        }

        map.removeLayer(layer);
      });
    };

    if (!showWeather || activeLayerIds.length === 0) {
      removeObsoleteLayers();
      return;
    }

    if (pendingDesiredLayerLoads.length === 0) {
      removeObsoleteLayers();
      return;
    }

    void Promise.all(pendingDesiredLayerLoads).then((results) => {
      if (weatherLayerSwapTokenRef.current !== swapToken || !results.every(Boolean)) {
        return;
      }

      removeObsoleteLayers();
    });
  }, [
    baseLayerReady,
    runtime,
    activeLayerIds,
    animatedWindReady,
    overlayOpacity,
    showWeather,
    suppressStaticWindTiles,
    viewportReady,
    windLayerSelected,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !runtime) return;

    let cancelled = false;
    const timeoutIds: number[] = [];

    const refreshMapCanvas = () => {
      if (cancelled) return;

      map.invalidateSize();
      Object.values(baseTileRefs.current).forEach((layer) => layer?.redraw?.());
      Object.values(weatherTileRefs.current).forEach((layer) => layer?.redraw?.());

      const bounds = map.getBounds();
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

    const animationFrame = window.requestAnimationFrame(refreshMapCanvas);
    timeoutIds.push(window.setTimeout(refreshMapCanvas, 120));
    timeoutIds.push(window.setTimeout(refreshMapCanvas, 320));

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [
    runtime,
    refreshVersion,
    viewportReady,
  ]);

  useEffect(() => {
    if (!baseLayerReady || !mapViewport) {
      return;
    }

    const requestedBaseLayer = getBaseMapLayer(activeBaseLayerId) ?? getBaseMapLayer(DEFAULT_BASE_LAYER_ID)!;
    const fallbackBaseLayer = getBaseMapLayer(DEFAULT_BASE_LAYER_ID)!;
    const activeBaseLayer = canUseBaseMapLayer(requestedBaseLayer)
      ? requestedBaseLayer
      : fallbackBaseLayer;
    const baseTileTemplate = getBaseLayerTileTemplate(activeBaseLayer);
    if (!baseTileTemplate) {
      return;
    }

    const visibleWeatherLayerIds = showWeather
      ? activeLayerIds.filter((layerId) => !((layerId === 'WND' || layerId === 'WS10') && suppressStaticWindTiles))
      : [];

    const timeoutId = window.setTimeout(() => {
      const surroundingTiles = getTileRingCoordinates(mapViewport);
      if (surroundingTiles.length === 0) {
        return;
      }

      const nextUrls: string[] = [];

      surroundingTiles.forEach((coordinates) => {
        const baseKey = `base:${activeBaseLayer.id}:${coordinates.z}:${coordinates.x}:${coordinates.y}`;
        if (!prefetchedTileKeysRef.current.has(baseKey)) {
          prefetchedTileKeysRef.current.add(baseKey);
          nextUrls.push(buildBaseTileUrl(baseTileTemplate, coordinates, activeBaseLayer.subdomains));
        }

        visibleWeatherLayerIds.forEach((layerId) => {
          const weatherKey = `weather:${layerId}:${coordinates.z}:${coordinates.x}:${coordinates.y}`;
          if (prefetchedTileKeysRef.current.has(weatherKey)) {
            return;
          }

          prefetchedTileKeysRef.current.add(weatherKey);
          nextUrls.push(buildWeatherTileUrl(layerId, coordinates));
        });
      });

      if (prefetchedTileKeysRef.current.size > MAX_TRACKED_PREFETCH_KEYS) {
        prefetchedTileKeysRef.current.clear();
      }

      nextUrls.forEach((url) => {
        const image = new Image();
        const clearImage = () => {
          image.onload = null;
          image.onerror = null;
          prefetchImageRefs.current.delete(image);
        };

        image.decoding = 'async';
        image.loading = 'eager';
        image.referrerPolicy = 'no-referrer';
        image.onload = clearImage;
        image.onerror = clearImage;
        prefetchImageRefs.current.add(image);
        image.src = url;
      });
    }, PREFETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeBaseLayerId,
    activeLayerIds,
    baseLayerReady,
    mapViewport,
    showWeather,
    suppressStaticWindTiles,
  ]);

  useEffect(() => {
    if (!windLayerSelected || !weatherOverlayVisible || !mapViewport || !viewportReady) {
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
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not load wind flow.');
        }

        if (!controller.signal.aborted) {
          setWindSurfaceData(payload as WindSurfacePayload);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setWindSurfaceData(null);
        setWindSurfaceError(error instanceof Error ? error.message : 'Could not load wind flow.');
      } finally {
        if (!controller.signal.aborted) {
          setWindSurfaceLoading(false);
        }
      }
    }, 500);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mapViewport, viewportReady, weatherOverlayVisible, windLayerSelected, windSurfaceGrid.cols, windSurfaceGrid.rows]);

  return (
    <div className={`responder-leaflet-shell relative w-full overflow-hidden rounded-[30px] border border-slate-200/80 bg-slate-100 ${containerClassName}`}>
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

      {!runtimeError && !runtime ? (
        <div className="absolute inset-0 z-[450] flex items-center justify-center bg-slate-100/92 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm font-medium">Loading field map...</p>
          </div>
        </div>
      ) : null}

      {runtimeError ? (
        <div className="absolute inset-0 z-[450] flex items-center justify-center bg-slate-100/92 px-6 text-center backdrop-blur-sm">
          <div className="max-w-sm rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-lg">
            <p className="text-sm font-semibold text-slate-900">{runtimeError}</p>
            <p className="mt-1 text-xs text-slate-500">
              The responder page now keeps map controls outside the canvas, so only the Leaflet
              runtime needs to load here.
            </p>
          </div>
        </div>
      ) : null}

      {windSurfaceLoading ? (
        <div className="pointer-events-none absolute bottom-4 left-4 z-[420] rounded-full border border-white/70 bg-white/88 px-3 py-2 text-[11px] font-semibold text-slate-600 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur">
          Updating wind flow…
        </div>
      ) : null}

      {weatherOverlayVisible && mapTransitioning && !windSurfaceLoading ? (
        <div className="pointer-events-none absolute bottom-4 left-4 z-[420] rounded-full border border-white/70 bg-white/88 px-3 py-2 text-[11px] font-semibold text-slate-600 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur">
          Updating weather…
        </div>
      ) : null}
    </div>
  );
}

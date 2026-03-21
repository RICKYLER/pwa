'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Cloudy,
  Droplets,
  Gauge,
  Layers3,
  MapPin,
  Pause,
  Play,
  Thermometer,
  Wind,
  X,
} from 'lucide-react';
import type { FieldResponseWeatherPayload } from '@/lib/weather';
import {
  getOpenWeatherMapLayer,
  getOpenWeatherSelectorLayers,
  OPENWEATHER_WIND_PARTICLE_LAYER_ID,
  type OpenWeatherMapLayerId,
} from '@/lib/openweather-map-layers';

interface OpenWeatherMapControlProps {
  map: google.maps.Map | null;
  compact?: boolean;
}

interface TimelineStep {
  isoTime: string | null;
  unixTime: number | null;
  label: string;
  sublabel: string;
  temperature: number | null;
  feelsLike: number | null;
  rainChance: number | null;
  weatherCode: number | null;
  weatherLabel: string;
  windSpeed: number | null;
  windDirection: number | null;
  windDirectionCardinal: string | null;
  windGust: number | null;
  visibility: number | null;
  humidity: number | null;
  cloudCover: number | null;
  pressureSeaLevel: number | null;
}

type WeatherFocusMode = 'center' | 'point';
type SurfaceLayerId = 'APM' | 'CL';

interface MapWeatherSurfaceSample {
  lat: number;
  lng: number;
  time: string | null;
  pressureSeaLevel: number | null;
  cloudCover: number | null;
  temperature: number | null;
  providerMode: FieldResponseWeatherPayload['provider']['mode'];
}

interface MapWeatherSurfacePayload {
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
    pressureMin: number | null;
    pressureMax: number | null;
    cloudMin: number | null;
    cloudMax: number | null;
  };
  samples: MapWeatherSurfaceSample[];
}

interface MapViewportSnapshot {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
  heading: number;
  tilt: number;
}

const FALLBACK_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const SELECTOR_LAYERS = getOpenWeatherSelectorLayers();
const SURFACE_FETCH_DENSITY: Record<SurfaceLayerId, { cols: number; rows: number }> = {
  APM: { cols: 7, rows: 5 },
  CL: { cols: 6, rows: 4 },
};

const LAYER_ICONS: Record<OpenWeatherMapLayerId, typeof Thermometer> = {
  TA2: Thermometer,
  APM: Gauge,
  WS10: Wind,
  PR0: CloudRain,
  CL: Cloudy,
};

function normalizeTileCoordinate(value: number, zoom: number) {
  const tileRange = 1 << zoom;
  return ((value % tileRange) + tileRange) % tileRange;
}

function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number | null, suffix = '') {
  if (value === null) return '--';
  return `${Math.round(value * 10) / 10}${suffix}`;
}

function formatLocation(value: number | null) {
  if (value === null) return '--';
  return value.toFixed(2);
}

function friendlyWeatherError(message: string | null) {
  if (!message) return 'Could not load map weather';
  if (message.toLowerCase().includes('api key')) {
    return 'Add OPENWEATHER_API_KEY to .env.local and restart the dev server to load map weather.';
  }
  return message;
}

function isoToUnix(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function formatTimelineMain(isoTime: string | null, fallback = 'Live') {
  if (!isoTime) return fallback;

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTime));
}

function formatTimelineSub(isoTime: string | null) {
  if (!isoTime) return 'Current map weather';

  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTime));
}

function windDirectionLabel(direction: number | null, cardinal: string | null) {
  if (cardinal && direction !== null) return `${cardinal} ${Math.round(direction)}°`;
  if (cardinal) return cardinal;
  if (direction !== null) return `${Math.round(direction)}°`;
  return '--';
}

function isSurfaceLayerId(layerId: OpenWeatherMapLayerId): layerId is SurfaceLayerId {
  return layerId === 'APM' || layerId === 'CL';
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  const value = Number.parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixHexColors(start: string, end: string, amount: number) {
  const from = hexToRgb(start);
  const to = hexToRgb(end);
  const ratio = clamp(amount, 0, 1);
  return {
    r: Math.round(from.r + ((to.r - from.r) * ratio)),
    g: Math.round(from.g + ((to.g - from.g) * ratio)),
    b: Math.round(from.b + ((to.b - from.b) * ratio)),
  };
}

function buildDenseField(
  surface: MapWeatherSurfacePayload,
  width: number,
  height: number,
  accessor: (sample: MapWeatherSurfaceSample) => number | null,
) {
  const baseValues = surface.samples.map(accessor);
  const validValues = baseValues.filter((value): value is number => value !== null);
  const fallbackValue = validValues.length > 0
    ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
    : 0;
  const safeBase = baseValues.map((value) => value ?? fallbackValue);
  const field = Array.from({ length: height }, () => new Array<number>(width).fill(fallbackValue));

  for (let y = 0; y < height; y += 1) {
    const sourceY = height === 1 ? 0 : (y / (height - 1)) * (surface.rows - 1);
    const row0 = Math.floor(sourceY);
    const row1 = Math.min(surface.rows - 1, row0 + 1);
    const ty = sourceY - row0;

    for (let x = 0; x < width; x += 1) {
      const sourceX = width === 1 ? 0 : (x / (width - 1)) * (surface.cols - 1);
      const col0 = Math.floor(sourceX);
      const col1 = Math.min(surface.cols - 1, col0 + 1);
      const tx = sourceX - col0;

      const topLeft = safeBase[(row0 * surface.cols) + col0] ?? fallbackValue;
      const topRight = safeBase[(row0 * surface.cols) + col1] ?? fallbackValue;
      const bottomLeft = safeBase[(row1 * surface.cols) + col0] ?? fallbackValue;
      const bottomRight = safeBase[(row1 * surface.cols) + col1] ?? fallbackValue;

      const top = topLeft + ((topRight - topLeft) * tx);
      const bottom = bottomLeft + ((bottomRight - bottomLeft) * tx);
      field[y]![x] = top + ((bottom - top) * ty);
    }
  }

  return {
    field,
    min: validValues.length > 0 ? Math.min(...validValues) : null,
    max: validValues.length > 0 ? Math.max(...validValues) : null,
  };
}

function buildPressureLevels(min: number | null, max: number | null) {
  if (min === null || max === null) return [1000, 1004, 1008, 1012, 1016];
  const span = Math.max(max - min, 1);
  const step = span >= 12 ? 4 : span >= 6 ? 2 : 1;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const levels: number[] = [];
  for (let value = start; value <= end; value += step) {
    levels.push(value);
  }
  return levels;
}

function drawMarchingSquaresContours(
  ctx: CanvasRenderingContext2D,
  field: number[][],
  levels: number[],
  width: number,
  height: number,
) {
  const rows = field.length;
  const cols = field[0]?.length ?? 0;
  if (rows < 2 || cols < 2) return;

  const cellWidth = width / (cols - 1);
  const cellHeight = height / (rows - 1);

  const interpolate = (level: number, startValue: number, endValue: number) => {
    if (startValue === endValue) return 0.5;
    return clamp((level - startValue) / (endValue - startValue), 0, 1);
  };

  const drawSegment = (
    level: number,
    x: number,
    y: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    const alpha = 0.18 + (0.08 * ((level % 4) === 0 ? 1 : 0));
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = (level % 4) === 0 ? 1.35 : 0.9;
    ctx.beginPath();
    ctx.moveTo((x * cellWidth) + start.x, (y * cellHeight) + start.y);
    ctx.lineTo((x * cellWidth) + end.x, (y * cellHeight) + end.y);
    ctx.stroke();
  };

  for (const level of levels) {
    for (let y = 0; y < rows - 1; y += 1) {
      for (let x = 0; x < cols - 1; x += 1) {
        const topLeft = field[y]?.[x] ?? 0;
        const topRight = field[y]?.[x + 1] ?? 0;
        const bottomRight = field[y + 1]?.[x + 1] ?? 0;
        const bottomLeft = field[y + 1]?.[x] ?? 0;

        const top = {
          x: interpolate(level, topLeft, topRight) * cellWidth,
          y: 0,
        };
        const right = {
          x: cellWidth,
          y: interpolate(level, topRight, bottomRight) * cellHeight,
        };
        const bottom = {
          x: interpolate(level, bottomLeft, bottomRight) * cellWidth,
          y: cellHeight,
        };
        const left = {
          x: 0,
          y: interpolate(level, topLeft, bottomLeft) * cellHeight,
        };

        const mask =
          (topLeft >= level ? 1 : 0)
          | (topRight >= level ? 2 : 0)
          | (bottomRight >= level ? 4 : 0)
          | (bottomLeft >= level ? 8 : 0);

        switch (mask) {
          case 0:
          case 15:
            break;
          case 1:
          case 14:
            drawSegment(level, x, y, left, top);
            break;
          case 2:
          case 13:
            drawSegment(level, x, y, top, right);
            break;
          case 3:
          case 12:
            drawSegment(level, x, y, left, right);
            break;
          case 4:
          case 11:
            drawSegment(level, x, y, right, bottom);
            break;
          case 5:
            drawSegment(level, x, y, left, top);
            drawSegment(level, x, y, right, bottom);
            break;
          case 6:
          case 9:
            drawSegment(level, x, y, top, bottom);
            break;
          case 7:
          case 8:
            drawSegment(level, x, y, left, bottom);
            break;
          case 10:
            drawSegment(level, x, y, top, right);
            drawSegment(level, x, y, left, bottom);
            break;
          default:
            break;
        }
      }
    }
  }
}

function renderSurfaceCanvas(
  canvas: HTMLCanvasElement,
  surface: MapWeatherSurfacePayload,
  layerId: SurfaceLayerId,
  opacity: number,
) {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (width === 0 || height === 0) return;

  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const renderWidth = clamp(Math.round(width / 3), 120, 240);
  const renderHeight = clamp(Math.round(height / 3), 80, 180);
  const offscreen = document.createElement('canvas');
  offscreen.width = renderWidth;
  offscreen.height = renderHeight;
  const offscreenContext = offscreen.getContext('2d');
  if (!offscreenContext) return;

  const {
    field,
    min,
    max,
  } = buildDenseField(
    surface,
    renderWidth,
    renderHeight,
    (sample) => (layerId === 'APM' ? sample.pressureSeaLevel : sample.cloudCover),
  );

  const imageData = offscreenContext.createImageData(renderWidth, renderHeight);
  const pixels = imageData.data;
  const alphaScale = opacity / 100;

  for (let y = 0; y < renderHeight; y += 1) {
    for (let x = 0; x < renderWidth; x += 1) {
      const index = ((y * renderWidth) + x) * 4;
      const value = field[y]?.[x] ?? 0;

      if (layerId === 'APM') {
        const pressureMin = min ?? 1000;
        const pressureMax = max ?? pressureMin + 8;
        const normalized = clamp((value - pressureMin) / Math.max(pressureMax - pressureMin, 1), 0, 1);
        const segment = normalized <= 0.33
          ? mixHexColors('#2155d6', '#1ea86b', normalized / 0.33)
          : normalized <= 0.66
            ? mixHexColors('#1ea86b', '#f0c94f', (normalized - 0.33) / 0.33)
            : mixHexColors('#f0c94f', '#c2410c', (normalized - 0.66) / 0.34);

        pixels[index] = segment.r;
        pixels[index + 1] = segment.g;
        pixels[index + 2] = segment.b;
        pixels[index + 3] = Math.round((55 + (115 * normalized)) * alphaScale);
      } else {
        const normalized = clamp(value / 100, 0, 1);
        const base = mixHexColors('#d7eef6', '#ffffff', normalized);
        pixels[index] = base.r;
        pixels[index + 1] = base.g;
        pixels[index + 2] = base.b;
        pixels[index + 3] = Math.round((normalized ** 1.15) * 165 * alphaScale);
      }
    }
  }

  offscreenContext.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, 0, 0, width, height);

  if (layerId === 'APM') {
    const denseContourWidth = 42;
    const denseContourHeight = 28;
    const contourField = buildDenseField(
      surface,
      denseContourWidth,
      denseContourHeight,
      (sample) => sample.pressureSeaLevel,
    );
    const levels = buildPressureLevels(contourField.min, contourField.max);
    ctx.save();
    drawMarchingSquaresContours(ctx, contourField.field, levels, width, height);
    ctx.restore();
  } else {
    const cloudField = buildDenseField(
      surface,
      36,
      24,
      (sample) => sample.cloudCover,
    );
    ctx.save();
    drawMarchingSquaresContours(ctx, cloudField.field, [35, 60, 80], width, height);
    ctx.restore();
  }
}

function buildSurfaceLegendTicks(
  layerId: SurfaceLayerId,
  surface: MapWeatherSurfacePayload | null,
) {
  if (!surface) return null;

  if (layerId === 'APM') {
    const levels = buildPressureLevels(surface.stats.pressureMin, surface.stats.pressureMax);
    return levels.slice(0, 6).map((value) => String(value));
  }

  return ['0', '20', '40', '60', '80', '100'];
}

function getWeatherIcon(code: number | null) {
  if (code === null) return Thermometer;
  if (code >= 200 && code < 300) return CloudLightning;
  if (code >= 300 && code < 600) return CloudRain;
  if (code >= 600 && code < 700) return CloudSnow;
  if (code === 800) return Thermometer;
  return Cloud;
}

function buildTimeline(weather: FieldResponseWeatherPayload | null): TimelineStep[] {
  if (!weather?.current) return [];

  const currentTime = weather.current.time ?? weather.generatedAt;
  const steps: TimelineStep[] = [
    {
      isoTime: currentTime,
      unixTime: isoToUnix(currentTime),
      label: 'Live',
      sublabel: formatTimelineMain(currentTime, 'Live'),
      temperature: weather.current.temperature,
      feelsLike: weather.current.feelsLike,
      rainChance: weather.current.rainChance,
      weatherCode: weather.current.weatherCode,
      weatherLabel: weather.current.weatherLabel,
      windSpeed: weather.current.windSpeed,
      windDirection: weather.current.windDirection,
      windDirectionCardinal: weather.current.windDirectionCardinal,
      windGust: weather.current.windGust,
      visibility: weather.current.visibility,
      humidity: weather.current.humidity,
      cloudCover: weather.current.cloudCover,
      pressureSeaLevel: weather.current.pressureSeaLevel,
    },
  ];

  weather.hourly.forEach((hour, index) => {
    steps.push({
      isoTime: hour.time,
      unixTime: isoToUnix(hour.time),
      label: `+${index + 1}`,
      sublabel: formatTimelineMain(hour.time, `+${index + 1}`),
      temperature: hour.temperature,
      feelsLike: hour.feelsLike,
      rainChance: hour.rainChance,
      weatherCode: hour.weatherCode,
      weatherLabel: hour.weatherLabel,
      windSpeed: hour.windSpeed,
      windDirection: hour.windDirection,
      windDirectionCardinal: hour.windDirectionCardinal,
      windGust: hour.windGust,
      visibility: hour.visibility,
      humidity: hour.humidity,
      cloudCover: hour.cloudCover,
      pressureSeaLevel: hour.pressureSeaLevel,
    });
  });

  return steps;
}

function buildTileUrl(layerId: string, unixTime: number | null, coord: google.maps.Point, zoom: number) {
  const tileRange = 1 << zoom;
  if (coord.y < 0 || coord.y >= tileRange) return FALLBACK_TILE;

  const x = normalizeTileCoordinate(coord.x, zoom);
  const params = new URLSearchParams({
    layer: layerId,
    z: String(zoom),
    x: String(x),
    y: String(coord.y),
  });

  if (unixTime) {
    params.set('date', String(unixTime));
  }

  return `/api/weather/map-tile?${params.toString()}`;
}

function createOverlay(
  layerId: string,
  opacity: number,
  unixTime: number | null,
) {
  return new window.google.maps.ImageMapType({
    getTileUrl: (coord, zoom) => buildTileUrl(layerId, unixTime, coord, zoom),
    name: `${layerId} weather layer`,
    maxZoom: 18,
    minZoom: 1,
    opacity: opacity / 100,
    tileSize: new window.google.maps.Size(256, 256),
  });
}

export default function OpenWeatherMapControl({
  map,
  compact = false,
}: OpenWeatherMapControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showInspector, setShowInspector] = useState(!compact);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<OpenWeatherMapLayerId>('TA2');
  const [opacity, setOpacity] = useState<number>(
    getOpenWeatherMapLayer('TA2')?.defaultOpacity ?? 72,
  );
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [weather, setWeather] = useState<FieldResponseWeatherPayload | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [showWindParticles, setShowWindParticles] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [focusMode, setFocusMode] = useState<WeatherFocusMode>('center');
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [mapViewport, setMapViewport] = useState<MapViewportSnapshot | null>(null);
  const [surfaceData, setSurfaceData] = useState<MapWeatherSurfacePayload | null>(null);
  const primaryOverlayRef = useRef<google.maps.ImageMapType | null>(null);
  const windOverlayRef = useRef<google.maps.ImageMapType | null>(null);
  const focusMarkerRef = useRef<google.maps.Marker | null>(null);
  const surfaceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedLayer = useMemo(
    () => getOpenWeatherMapLayer(selectedLayerId) ?? SELECTOR_LAYERS[0],
    [selectedLayerId],
  );
  const timelineSteps = useMemo(() => buildTimeline(weather), [weather]);
  const effectiveCoords =
    focusMode === 'point' && focusPoint
      ? focusPoint
      : centerCoords;
  const selectedStep =
    timelineSteps[Math.min(timelineIndex, Math.max(timelineSteps.length - 1, 0))] ?? null;
  const selectedUnixTime = selectedStep?.unixTime ?? null;
  const ActiveLayerIcon = LAYER_ICONS[selectedLayerId];
  const WeatherConditionIcon = getWeatherIcon(selectedStep?.weatherCode ?? weather?.current.weatherCode ?? null);
  const locationLabel =
    weather?.location.name
    || (focusMode === 'point' ? 'Selected weather point' : 'Map center forecast');
  const customSurfaceRequested = isSurfaceLayerId(selectedLayerId);
  const canRenderCustomSurface = Boolean(
    mapViewport
    && Math.abs(mapViewport.heading) < 1
    && mapViewport.tilt < 1,
  );
  const useCustomSurface = Boolean(
    isOpen
    && customSurfaceRequested
    && canRenderCustomSurface
    && surfaceData,
  );
  const surfaceLegendTicks = isSurfaceLayerId(selectedLayerId)
    ? buildSurfaceLegendTicks(selectedLayerId, surfaceData)
    : null;

  useEffect(() => {
    setOpacity(selectedLayer.defaultOpacity);
  }, [selectedLayer.defaultOpacity]);

  useEffect(() => {
    if (!map || typeof window === 'undefined' || !window.google?.maps) return;

    const overlays = map.overlayMapTypes;
    const previousPrimary = primaryOverlayRef.current;
    const previousWind = windOverlayRef.current;

    [previousPrimary, previousWind].forEach((overlay) => {
      if (!overlay) return;
      for (let index = overlays.getLength() - 1; index >= 0; index -= 1) {
        if (overlays.getAt(index) === overlay) {
          overlays.removeAt(index);
        }
      }
    });

    primaryOverlayRef.current = null;
    windOverlayRef.current = null;

    if (!isOpen) return;

    let primaryOverlay: google.maps.ImageMapType | null = null;

    if (!(customSurfaceRequested && canRenderCustomSurface && surfaceData)) {
      primaryOverlay = createOverlay(selectedLayerId, opacity, selectedUnixTime);
      overlays.insertAt(0, primaryOverlay);
      primaryOverlayRef.current = primaryOverlay;
    }

    if (showWindParticles) {
      const windOverlay = createOverlay(
        OPENWEATHER_WIND_PARTICLE_LAYER_ID,
        selectedLayerId === 'WS10' ? 65 : 42,
        selectedUnixTime,
      );
      overlays.insertAt(1, windOverlay);
      windOverlayRef.current = windOverlay;
    }

    return () => {
      [primaryOverlay, windOverlayRef.current].forEach((overlay) => {
        if (!overlay) return;
        for (let index = overlays.getLength() - 1; index >= 0; index -= 1) {
          if (overlays.getAt(index) === overlay) {
            overlays.removeAt(index);
          }
        }
      });

      if (primaryOverlayRef.current === primaryOverlay) {
        primaryOverlayRef.current = null;
      }
      windOverlayRef.current = null;
    };
  }, [
    canRenderCustomSurface,
    customSurfaceRequested,
    isOpen,
    map,
    opacity,
    selectedLayerId,
    selectedUnixTime,
    showWindParticles,
    surfaceData,
  ]);

  useEffect(() => {
    if (!map || !isOpen) return;

    const syncCenter = () => {
      const center = map.getCenter();
      if (!center) return;

      const nextCoords = {
        lat: roundCoordinate(center.lat()),
        lng: roundCoordinate(center.lng()),
      };

      setCenterCoords((current) =>
        current && current.lat === nextCoords.lat && current.lng === nextCoords.lng
          ? current
          : nextCoords,
      );

      const bounds = map.getBounds();
      const zoom = map.getZoom();
      if (!bounds || zoom === undefined) return;

      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      setMapViewport({
        north: Math.round(northEast.lat() * 1000) / 1000,
        south: Math.round(southWest.lat() * 1000) / 1000,
        east: Math.round(northEast.lng() * 1000) / 1000,
        west: Math.round(southWest.lng() * 1000) / 1000,
        zoom,
        heading: map.getHeading?.() ?? 0,
        tilt: map.getTilt?.() ?? 0,
      });
    };

    syncCenter();
    const idleListener = map.addListener('idle', syncCenter);

    return () => {
      idleListener.remove();
    };
  }, [isOpen, map]);

  useEffect(() => {
    if (!map || !isOpen) return;

    const clickListener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      const lat = event.latLng?.lat();
      const lng = event.latLng?.lng();
      if (lat === undefined || lng === undefined) return;

      setFocusMode('point');
      setFocusPoint({
        lat: roundCoordinate(lat),
        lng: roundCoordinate(lng),
      });
      setIsPlaying(false);
    });

    return () => {
      clickListener.remove();
    };
  }, [isOpen, map]);

  useEffect(() => {
    if (!map || typeof window === 'undefined' || !window.google?.maps) return;

    if (!isOpen || focusMode !== 'point' || !focusPoint) {
      focusMarkerRef.current?.setMap(null);
      focusMarkerRef.current = null;
      return;
    }

    if (!focusMarkerRef.current) {
      focusMarkerRef.current = new window.google.maps.Marker({
        map,
        clickable: false,
        zIndex: 999,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#f97316',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
    }

    focusMarkerRef.current.setPosition(focusPoint);
    focusMarkerRef.current.setMap(map);
  }, [focusMode, focusPoint, isOpen, map]);

  useEffect(() => {
    if (!isOpen || !effectiveCoords) return;

    let cancelled = false;
    const coords = effectiveCoords;

    async function fetchCenterWeather() {
      try {
        const params = new URLSearchParams({
          lat: String(coords.lat),
          lng: String(coords.lng),
        });

        const response = await fetch(`/api/weather?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }

        if (cancelled) return;
        setWeather(payload as FieldResponseWeatherPayload);
        setWeatherError(null);
      } catch (error) {
        if (cancelled) return;
        setWeatherError(
          friendlyWeatherError(error instanceof Error ? error.message : 'Could not load map weather'),
        );
      }
    }

    fetchCenterWeather();

    return () => {
      cancelled = true;
    };
  }, [effectiveCoords, isOpen]);

  useEffect(() => {
    setTimelineIndex(0);
  }, [weather?.generatedAt, weather?.location.lat, weather?.location.lng]);

  useEffect(() => {
    if (!isOpen || !isPlaying || timelineSteps.length <= 1) return;

    const timer = window.setInterval(() => {
      setTimelineIndex((value) => (value >= timelineSteps.length - 1 ? 0 : value + 1));
    }, selectedLayerId === 'WS10' ? 900 : 1200);

    return () => {
      window.clearInterval(timer);
    };
  }, [isOpen, isPlaying, selectedLayerId, timelineSteps.length]);

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      setFocusMode('center');
      setFocusPoint(null);
      focusMarkerRef.current?.setMap(null);
      focusMarkerRef.current = null;
      setSurfaceData(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!compact) return;
    if (!isOpen) return;
    setShowTimeline(false);
  }, [compact, isOpen, selectedLayerId]);

  useEffect(() => {
    if (!isOpen || !isSurfaceLayerId(selectedLayerId) || !canRenderCustomSurface || !mapViewport) {
      setSurfaceData(null);
      return;
    }

    const density = SURFACE_FETCH_DENSITY[selectedLayerId];
    const viewport = mapViewport;
    let cancelled = false;

    async function fetchSurface() {
      try {
        setSurfaceData(null);
        const params = new URLSearchParams({
          north: String(viewport.north),
          south: String(viewport.south),
          east: String(viewport.east),
          west: String(viewport.west),
          cols: String(density.cols),
          rows: String(density.rows),
        });

        if (selectedUnixTime) {
          params.set('date', String(selectedUnixTime));
        }

        const response = await fetch(`/api/weather/map-surface?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }

        if (!cancelled) {
          setSurfaceData(payload as MapWeatherSurfacePayload);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load smooth weather surface:', error);
          setSurfaceData(null);
        }
      }
    }

    fetchSurface();

    return () => {
      cancelled = true;
    };
  }, [
    canRenderCustomSurface,
    isOpen,
    mapViewport?.east,
    mapViewport?.north,
    mapViewport?.south,
    mapViewport?.west,
    selectedLayerId,
    selectedUnixTime,
  ]);

  useEffect(() => {
    if (!useCustomSurface || !surfaceData || !surfaceCanvasRef.current || !isSurfaceLayerId(selectedLayerId)) {
      return;
    }
    renderSurfaceCanvas(surfaceCanvasRef.current, surfaceData, selectedLayerId, opacity);
  }, [opacity, selectedLayerId, surfaceData, useCustomSurface]);

  useEffect(() => {
    if (!useCustomSurface || !surfaceData || !surfaceCanvasRef.current || !isSurfaceLayerId(selectedLayerId)) {
      return;
    }

    const redraw = () => {
      if (!surfaceCanvasRef.current) return;
      renderSurfaceCanvas(surfaceCanvasRef.current, surfaceData, selectedLayerId, opacity);
    };

    window.addEventListener('resize', redraw);
    return () => {
      window.removeEventListener('resize', redraw);
    };
  }, [opacity, selectedLayerId, surfaceData, useCustomSurface]);

  const canGoPrevious = timelineIndex > 0;
  const canGoNext = timelineIndex < timelineSteps.length - 1;
  const panelWidth = compact ? 'w-[238px]' : 'w-[300px]';
  const detailCoords = effectiveCoords ?? centerCoords;
  const activeRainChance = selectedStep?.rainChance ?? weather?.current.rainChance ?? null;
  const activeWindGust = selectedStep?.windGust ?? weather?.current.windGust ?? null;
  const activeVisibility = selectedStep?.visibility ?? weather?.current.visibility ?? null;
  const activeCloudCover = selectedStep?.cloudCover ?? weather?.current.cloudCover ?? null;
  const activePressure = selectedStep?.pressureSeaLevel ?? weather?.current.pressureSeaLevel ?? null;
  const liveCurrent = weather?.current ?? null;
  const dailyOutlook = weather?.dailyOutlook ?? [];
  const hasWeatherDetails = Boolean(weather && liveCurrent);

  return (
    <>
      {useCustomSurface ? (
        <canvas
          ref={surfaceCanvasRef}
          className="pointer-events-none absolute inset-0 z-10"
          aria-hidden="true"
        />
      ) : null}

      <div className={`absolute left-3 top-3 z-20 ${panelWidth}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            className={`flex min-w-0 flex-1 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2.5 text-left shadow-lg backdrop-blur ${compact ? 'text-xs' : 'text-sm'}`}
          >
            <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-slate-800">
              <Layers3 className="h-4 w-4 flex-shrink-0 text-orange-600" />
              <span className="truncate">{isOpen ? 'Weather layer' : 'Open weather'}</span>
            </span>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
              {selectedLayer.label}
            </span>
          </button>

          {isOpen ? (
            <>
              <button
                type="button"
                onClick={() => setShowInspector((value) => !value)}
                className="rounded-2xl border border-slate-200/80 bg-white/95 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-lg backdrop-blur transition hover:border-slate-300 hover:text-slate-900"
                title={showInspector ? 'Hide weather details' : 'Show weather details'}
              >
                {showInspector ? 'Hide info' : 'Show info'}
              </button>
              <button
                type="button"
                onClick={() => setShowTimeline((value) => !value)}
                className="rounded-2xl border border-slate-200/80 bg-white/95 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-lg backdrop-blur transition hover:border-slate-300 hover:text-slate-900"
                title={showTimeline ? 'Hide timeline' : 'Show timeline'}
              >
                {showTimeline ? 'Hide time' : 'Show time'}
              </button>
            </>
          ) : null}
        </div>

        {isOpen && (
          <div className="mt-2 rounded-[24px] border border-slate-200/80 bg-white/94 p-3 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.32)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Map weather
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="rounded-xl bg-orange-50 p-2">
                    <ActiveLayerIcon className="h-4 w-4 text-orange-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{selectedLayer.label}</p>
                    <p className="text-[11px] leading-4 text-slate-500">{selectedLayer.description}</p>
                    {customSurfaceRequested ? (
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-700">
                        {canRenderCustomSurface
                          ? 'Smoothed point surface'
                          : 'Switch map to 2D for smooth surface mode'}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                title="Hide layer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              {SELECTOR_LAYERS.map((layer) => {
                const Icon = LAYER_ICONS[layer.id];
                const isActive = layer.id === selectedLayerId;

                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => {
                      setSelectedLayerId(layer.id);
                      if (layer.id === 'WS10') {
                        setShowWindParticles(true);
                      }
                      setIsPlaying(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                      isActive
                        ? 'border-orange-300 bg-orange-500 text-white shadow-[0_14px_24px_-18px_rgba(249,115,22,0.85)]'
                        : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    {layer.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Opacity
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Blend the weather layer into the base map.
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
                  {opacity}%
                </span>
              </div>
              {customSurfaceRequested && canRenderCustomSurface ? (
                <p className="mt-2 text-[11px] text-orange-700">
                  Using sampled OpenWeather points for a smoother field instead of the raw tile layer.
                </p>
              ) : null}
              <input
                type="range"
                min={28}
                max={82}
                step={2}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                className="mt-3 w-full accent-orange-600"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="mt-3 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              <span>{showAdvanced ? 'Hide advanced tools' : 'Show advanced tools'}</span>
              <span className="text-slate-400">{showAdvanced ? '−' : '+'}</span>
            </button>

            {showAdvanced ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Weather focus
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Tap the map to inspect a real weather point, or switch back to follow the map center.
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
                      {focusMode === 'point' ? 'Point' : 'Center'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFocusMode('center');
                        setFocusPoint(null);
                      }}
                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                        focusMode === 'center'
                          ? 'border-orange-300 bg-orange-500 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Follow center
                    </button>
                    <button
                      type="button"
                      onClick={() => setFocusMode('point')}
                      disabled={!focusPoint}
                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                        focusMode === 'point'
                          ? 'border-orange-300 bg-orange-500 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      Use picked point
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {focusMode === 'point' && focusPoint
                      ? `Inspecting ${formatLocation(focusPoint.lat)}, ${formatLocation(focusPoint.lng)}`
                      : 'Current weather follows the visible map center.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Wind particles
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Overlay wind direction arrows when your OpenWeather plan includes Maps 2.0 wind tiles.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showWindParticles}
                      onClick={() => setShowWindParticles((value) => !value)}
                      className={`relative h-8 w-14 rounded-full border transition ${
                        showWindParticles
                          ? 'border-orange-300 bg-orange-500'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
                          showWindParticles ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Forecast playback
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Animate real OpenWeather forecast tiles when Maps 2.0 is available, with a current-tile fallback if not.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPlaying((value) => !value)}
                      disabled={timelineSteps.length <= 1}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition ${
                        isPlaying
                          ? 'bg-orange-500 text-white shadow-[0_18px_30px_-22px_rgba(249,115,22,0.9)]'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {isOpen && (
        <>
          {timelineSteps.length > 0 && showTimeline && (
            <div className="absolute bottom-3 left-3 z-20 w-[min(420px,calc(100%-24px))] max-w-[420px] rounded-[22px] border border-slate-200/80 bg-white/94 p-3 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.32)] backdrop-blur">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTimelineIndex((value) => Math.max(0, value - 1))}
                  disabled={!canGoPrevious}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Previous forecast step"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying((value) => !value)}
                  disabled={timelineSteps.length <= 1}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                    isPlaying
                      ? 'border-orange-300 bg-orange-500 text-white'
                      : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  title={isPlaying ? 'Pause forecast playback' : 'Play forecast playback'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(timelineSteps.length - 1, 0)}
                  step={1}
                  value={timelineIndex}
                  onChange={(event) => setTimelineIndex(Number(event.target.value))}
                  className="h-2 w-full accent-orange-600"
                />
                <button
                  type="button"
                  onClick={() => setTimelineIndex((value) => Math.min(timelineSteps.length - 1, value + 1))}
                  disabled={!canGoNext}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Next forecast step"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="min-w-[132px] rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-2 text-right">
                  <p className="text-xs font-semibold text-orange-800">{selectedStep?.sublabel || 'Live'}</p>
                  <p className="text-[11px] text-orange-600">
                    {selectedStep?.label === 'Live'
                      ? 'Current'
                      : isPlaying
                        ? 'Animated forecast'
                        : 'Forecast step'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!showTimeline && timelineSteps.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowTimeline(true)}
              className="absolute bottom-3 left-3 z-20 rounded-2xl border border-slate-200/80 bg-white/94 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.32)] backdrop-blur transition hover:border-slate-300 hover:text-slate-900"
            >
              Show timeline
            </button>
          ) : null}

          {showInspector ? (
          <div className={`absolute right-3 top-20 z-20 ${compact ? 'w-[250px]' : panelWidth}`}>
            <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/94 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.32)] backdrop-blur">
              <div className="border-b border-orange-100 bg-gradient-to-br from-orange-100 via-amber-50 to-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900">{locationLabel}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {detailCoords
                        ? `${formatLocation(detailCoords.lat)}, ${formatLocation(detailCoords.lng)}`
                        : 'Waiting for map center'}
                    </p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-orange-700">
                      {focusMode === 'point'
                        ? (selectedStep?.label === 'Live' ? 'Picked point weather' : `Picked point at ${selectedStep?.sublabel}`)
                        : (selectedStep?.label === 'Live' ? 'Live map weather' : `Forecast at ${selectedStep?.sublabel}`)}
                    </p>
                    {weather ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <span className="rounded-full border border-orange-100 bg-white/70 px-2 py-1 text-orange-700">
                          {weather.provider.label}
                        </span>
                        {useCustomSurface ? (
                          <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-1">
                            sampled map surface
                          </span>
                        ) : null}
                        {weather.provider.cadenceMinutes ? (
                          <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-1">
                            ~{weather.provider.cadenceMinutes}m cadence
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowInspector(false)}
                    className="rounded-full bg-white/90 p-2 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-700"
                    title="Hide weather details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {weatherError ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {weatherError}
                  </div>
                ) : !hasWeatherDetails ? (
                  <div className="mt-4 rounded-2xl border border-orange-100 bg-white/70 px-3 py-3 text-sm text-slate-600">
                    Loading point weather...
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-orange-50 p-3">
                        <WeatherConditionIcon className="h-6 w-6 text-orange-700" />
                      </div>
                      <div>
                        <p className="text-4xl font-black tracking-tight text-slate-950">
                          {formatNumber(selectedStep?.temperature ?? null, '°C')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {selectedStep?.weatherLabel || 'Weather update'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-slate-500">
                          <Thermometer className="h-4 w-4" />
                          Feels like
                        </span>
                        <span className="font-semibold">{formatNumber(selectedStep?.feelsLike ?? null, '°C')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-slate-500">
                          <Wind className="h-4 w-4" />
                          Wind speed
                        </span>
                        <span className="font-semibold">{formatNumber(selectedStep?.windSpeed ?? null, ' km/h')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-slate-500">
                          <MapPin className="h-4 w-4" />
                          Wind direction
                        </span>
                        <span className="font-semibold">
                          {windDirectionLabel(selectedStep?.windDirection ?? null, selectedStep?.windDirectionCardinal ?? null)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-slate-500">
                          <Droplets className="h-4 w-4" />
                          Humidity
                        </span>
                        <span className="font-semibold">{formatNumber(selectedStep?.humidity ?? null, '%')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-slate-500">
                          <Cloudy className="h-4 w-4" />
                          Clouds
                        </span>
                        <span className="font-semibold">{formatNumber(activeCloudCover, '%')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-slate-500">
                          <Gauge className="h-4 w-4" />
                          Pressure
                        </span>
                        <span className="font-semibold">{formatNumber(activePressure, ' hPa')}</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-orange-100 bg-white/75 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Rain chance</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{formatNumber(activeRainChance, '%')}</p>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-white/75 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Gusts</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{formatNumber(activeWindGust, ' km/h')}</p>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-white/75 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Visibility</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{formatNumber(activeVisibility, ' km')}</p>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-white/75 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Next hour rain</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {formatNumber(liveCurrent?.nextHourPrecipitationPeak ?? null, ' mm/h')}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-white/75 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Dew point</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{formatNumber(liveCurrent?.dewPoint ?? null, '°C')}</p>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-white/75 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">UV index</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{formatNumber(liveCurrent?.uvIndex ?? null)}</p>
                      </div>
                    </div>

                    {dailyOutlook.length > 0 ? (
                      <div className="mt-4 rounded-2xl border border-orange-100 bg-white/75 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Daily outlook
                          </p>
                          <span className="text-[10px] text-slate-500">
                            Point forecast
                          </span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {dailyOutlook.map((day) => (
                            <div
                              key={day.time}
                              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{day.label}</p>
                                <p className="mt-0.5 text-[11px] text-slate-500">{day.summary}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-slate-900">
                                  {formatNumber(day.high, '°')} / {formatNumber(day.low, '°')}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  Rain {formatNumber(day.rainChance, '%')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowInspector(true)}
              className="absolute right-3 top-20 z-20 rounded-2xl border border-slate-200/80 bg-white/94 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.32)] backdrop-blur transition hover:border-slate-300 hover:text-slate-900"
            >
              Show weather
            </button>
          )}

          <div className={`pointer-events-none absolute bottom-3 right-3 z-20 ${compact ? 'w-[220px]' : 'w-[300px]'}`}>
            <div className="rounded-[22px] border border-orange-200/70 bg-white/92 px-4 py-3 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-orange-700">{selectedLayer.label}</p>
                <span className="text-[11px] text-slate-500">Unit: {selectedLayer.unit}</span>
              </div>
              <div
                className="mt-3 h-3 rounded-full border border-slate-200"
                style={{ backgroundImage: selectedLayer.gradient }}
              />
              <div className="mt-2 flex items-center justify-between gap-1 text-[10px] font-medium text-slate-500">
                {(surfaceLegendTicks ?? selectedLayer.ticks).map((tick) => (
                  <span key={tick} className="min-w-0 flex-1 text-center">
                    {tick}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

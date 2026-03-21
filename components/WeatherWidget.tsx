'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Eye,
  Gauge,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  SunMedium,
  Sunrise,
  Sunset,
  Wind,
} from 'lucide-react';
import type { FieldResponseWeatherPayload } from '@/lib/weather';

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

interface WeatherWidgetProps {
  lat?: number;
  lng?: number;
  mode?: 'compact' | 'full';
  className?: string;
  defaultMinimized?: boolean;
  autoMinimizeInTightPanel?: boolean;
}

interface WeatherLayerRow {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  description: string;
  availability: string;
}

interface WeatherLayerSection {
  title: string;
  note: string;
  rows: WeatherLayerRow[];
}

function friendlyWeatherError(message: string | null) {
  if (!message) return 'Could not load weather';
  if (message.toLowerCase().includes('api key')) {
    return 'Weather is not configured yet. Add OPENWEATHER_API_KEY to .env.local and restart the dev server.';
  }
  return message;
}

function formatNumber(value: number | null, suffix = '') {
  if (value === null) return '--';
  return `${Math.round(value)}${suffix}`;
}

function formatDecimal(value: number | null, suffix = '', digits = 1) {
  if (value === null) return '--';
  return `${value.toFixed(digits)}${suffix}`;
}

function formatTime(value: string | null, style: 'hour' | 'clock' = 'clock') {
  if (!value) return '--';

  return new Date(value).toLocaleTimeString('en-PH', {
    hour: style === 'hour' ? 'numeric' : '2-digit',
    minute: style === 'hour' ? undefined : '2-digit',
  });
}

function severityTone(severity: FieldResponseWeatherPayload['alerts'][number]['severity']) {
  switch (severity) {
    case 'warning':
      return {
        frame: 'border-rose-200 bg-rose-50/90',
        chip: 'border-rose-200 bg-rose-100 text-rose-700',
        text: 'text-rose-700',
      };
    case 'watch':
      return {
        frame: 'border-amber-200 bg-amber-50/90',
        chip: 'border-amber-200 bg-amber-100 text-amber-700',
        text: 'text-amber-700',
      };
    default:
      return {
        frame: 'border-emerald-200 bg-emerald-50/90',
        chip: 'border-emerald-200 bg-emerald-100 text-emerald-700',
        text: 'text-emerald-700',
      };
  }
}

function conditionMeta(code: number | null): {
  Icon: LucideIcon;
  panel: string;
  iconWrap: string;
  iconColor: string;
} {
  if (code === 8000 || (code !== null && code >= 200 && code < 300)) {
    return {
      Icon: CloudLightning,
      panel: 'from-violet-100 via-rose-50 to-sky-100',
      iconWrap: 'bg-violet-500/10 ring-1 ring-violet-200',
      iconColor: 'text-violet-700',
    };
  }

  if (
    code === 4201
    || code === 4001
    || code === 4200
    || code === 4000
    || (code !== null && code >= 300 && code < 600)
  ) {
    return {
      Icon: CloudRain,
      panel: 'from-sky-100 via-blue-50 to-cyan-100',
      iconWrap: 'bg-sky-500/10 ring-1 ring-sky-200',
      iconColor: 'text-sky-700',
    };
  }

  if (code === 5000 || code === 5001 || code === 5100 || code === 5101 || (code !== null && code >= 600 && code < 700)) {
    return {
      Icon: CloudSnow,
      panel: 'from-cyan-50 via-slate-50 to-blue-100',
      iconWrap: 'bg-cyan-500/10 ring-1 ring-cyan-200',
      iconColor: 'text-cyan-700',
    };
  }

  if (code === 2000 || code === 2100 || code === 701 || code === 721 || code === 741) {
    return {
      Icon: CloudFog,
      panel: 'from-slate-100 via-slate-50 to-sky-100',
      iconWrap: 'bg-slate-500/10 ring-1 ring-slate-200',
      iconColor: 'text-slate-700',
    };
  }

  if (code === 1001 || code === 1102 || code === 1101 || code === 801 || code === 802 || code === 803 || code === 804) {
    return {
      Icon: Cloud,
      panel: 'from-slate-100 via-slate-50 to-blue-100',
      iconWrap: 'bg-slate-500/10 ring-1 ring-slate-200',
      iconColor: 'text-slate-700',
    };
  }

  if (code === 1100 || code === 1000 || code === 800) {
    return {
      Icon: SunMedium,
      panel: 'from-amber-100 via-orange-50 to-sky-100',
      iconWrap: 'bg-amber-500/10 ring-1 ring-amber-200',
      iconColor: 'text-amber-700',
    };
  }

  return {
    Icon: CloudDrizzle,
    panel: 'from-sky-100 via-slate-50 to-blue-100',
    iconWrap: 'bg-sky-500/10 ring-1 ring-sky-200',
    iconColor: 'text-sky-700',
  };
}

function windSummary(speed: number | null, direction: string | null) {
  if (speed === null) return '--';
  if (!direction) return `${Math.round(speed)} km/h`;
  return `${direction} ${Math.round(speed)} km/h`;
}

function severityLabel(severity: FieldResponseWeatherPayload['alerts'][number]['severity']) {
  switch (severity) {
    case 'warning':
      return 'Warning';
    case 'watch':
      return 'Watch';
    default:
      return 'Stable';
  }
}

export default function WeatherWidget({
  lat,
  lng,
  mode = 'compact',
  className = '',
  defaultMinimized = false,
  autoMinimizeInTightPanel = false,
}: WeatherWidgetProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [weather, setWeather] = useState<FieldResponseWeatherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [isMinimizeOverride, setIsMinimizeOverride] = useState(false);

  async function fetchWeather() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (lat !== undefined) params.set('lat', String(lat));
      if (lng !== undefined) params.set('lng', String(lng));

      const response = await fetch(`/api/weather?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      setWeather(payload as FieldResponseWeatherPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load weather';
      setError(friendlyWeatherError(message));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lat, lng]);

  useEffect(() => {
    if (mode !== 'full') {
      setContainerWidth(null);
      return;
    }

    const node = rootRef.current;
    if (!node) return;

    const updateWidth = (width: number) => {
      const nextWidth = Math.round(width);
      setContainerWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    updateWidth(node.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateWidth(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [mode, weather]);

  const isTightFull = mode === 'full' && (containerWidth === null || containerWidth < 560);

  useEffect(() => {
    if (mode !== 'full' || !autoMinimizeInTightPanel || isMinimizeOverride) return;
    setIsMinimized(isTightFull);
  }, [autoMinimizeInTightPanel, isMinimizeOverride, isTightFull, mode]);

  if (loading && !weather) {
    return (
      <div className={`flex items-center gap-2 rounded-3xl border border-sky-100 bg-sky-50 px-4 py-3 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
        <span className="text-xs text-sky-700">Loading responder weather...</span>
      </div>
    );
  }

  if (error && !weather) {
    return (
      <div className={`flex items-center gap-2 rounded-3xl border border-rose-100 bg-rose-50 px-4 py-3 ${className}`}>
        <AlertCircle className="h-4 w-4 text-rose-500" />
        <span className="text-xs text-rose-700">{error}</span>
        <button
          type="button"
          onClick={fetchWeather}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-rose-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (!weather) return null;

  const current = weather.current;
  const leadAlert = weather.alerts[0];
  const leadTone = severityTone(leadAlert.severity);
  const condition = conditionMeta(current.weatherCode);
  const updatedTime = new Date(weather.generatedAt).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const locationLabel = weather.location.name || 'Field response area';
  const toggleLabel = isMinimized ? 'Expand' : 'Minimize';
  const ConditionIcon = condition.Icon;
  const fullStats = [
    {
      icon: Droplets,
      label: 'Humidity',
      value: formatNumber(current.humidity, '%'),
    },
    {
      icon: CloudRain,
      label: 'Rain chance',
      value: formatNumber(current.rainChance, '%'),
    },
    {
      icon: CloudDrizzle,
      label: 'Rain intensity',
      value: formatDecimal(current.rainIntensity, ' mm/hr', 2),
    },
    {
      icon: Wind,
      label: 'Wind',
      value: windSummary(current.windSpeed, current.windDirectionCardinal),
    },
    {
      icon: Gauge,
      label: 'Gusts',
      value: formatNumber(current.windGust, ' km/h'),
    },
    {
      icon: Eye,
      label: 'Visibility',
      value: formatDecimal(current.visibility, ' km'),
    },
    {
      icon: Cloud,
      label: 'Cloud cover',
      value: formatNumber(current.cloudCover, '%'),
    },
    {
      icon: SunMedium,
      label: 'UV index',
      value: formatNumber(current.uvIndex),
    },
  ];
  const layerSections: WeatherLayerSection[] = [
    {
      title: 'Thermal & Rain',
      note: 'OpenWeather comfort and precipitation fields for dispatch timing.',
      rows: [
        {
          key: 'temperature',
          label: 'Temperature',
          value: formatDecimal(current.temperature, '°C'),
          unit: 'celsius',
          description: 'Actual air temperature near the ground.',
          availability: 'Current + hourly',
        },
        {
          key: 'feels_like',
          label: 'Feels Like',
          value: formatDecimal(current.feelsLike, '°C'),
          unit: 'celsius',
          description: 'Human-perceived temperature using heat and wind.',
          availability: 'Current + hourly',
        },
        {
          key: 'dew_point',
          label: 'Dew Point',
          value: formatDecimal(current.dewPoint, '°C'),
          unit: 'celsius',
          description: 'Moisture saturation point that hints at sticky conditions.',
          availability: 'Current + hourly',
        },
        {
          key: 'pop',
          label: 'Rain Chance',
          value: formatNumber(current.rainChance, '%'),
          unit: 'percent',
          description: 'Probability of precipitation from the hourly forecast.',
          availability: 'Hourly',
        },
        {
          key: 'rain.1h',
          label: 'Rain Intensity',
          value: formatDecimal(current.rainIntensity, ' mm/hr', 2),
          unit: 'mm/hr',
          description: 'Estimated rain amount for the latest hour if available.',
          availability: 'Current / hourly',
        },
        {
          key: 'weather.description',
          label: 'Condition',
          value: current.weatherLabel,
          unit: null,
          description: 'Primary OpenWeather condition text for the response area.',
          availability: 'Current + hourly',
        },
      ],
    },
    {
      title: 'Wind & Pressure',
      note: 'Travel, shelter setup, and vehicle safety indicators.',
      rows: [
        {
          key: 'wind_speed',
          label: 'Wind Speed',
          value: formatDecimal(current.windSpeed, ' km/h'),
          unit: 'km/h',
          description: 'Sustained wind speed for field movement.',
          availability: 'Current + hourly',
        },
        {
          key: 'wind_deg',
          label: 'Wind Direction',
          value: current.windDirectionCardinal
            ? `${current.windDirectionCardinal} ${formatNumber(current.windDirection, '°')}`
            : formatNumber(current.windDirection, '°'),
          unit: 'degrees',
          description: 'Direction the wind is coming from.',
          availability: 'Current + hourly',
        },
        {
          key: 'wind_gust',
          label: 'Wind Gust',
          value: formatDecimal(current.windGust, ' km/h'),
          unit: 'km/h',
          description: 'Short bursts that may affect tents, tarps, and motorcycles.',
          availability: 'Current + hourly',
        },
        {
          key: 'pressure',
          label: 'Pressure',
          value: formatNumber(current.pressureSeaLevel, ' hPa'),
          unit: 'hPa',
          description: 'Current atmospheric pressure from the One Call feed.',
          availability: 'Current + hourly',
        },
        {
          key: 'visibility',
          label: 'Visibility',
          value: formatDecimal(current.visibility, ' km'),
          unit: 'km',
          description: 'How far landmarks and roads should remain visible.',
          availability: 'Current + hourly',
        },
        {
          key: 'humidity',
          label: 'Humidity',
          value: formatNumber(current.humidity, '%'),
          unit: 'percent',
          description: 'Air moisture level that affects comfort and heat stress.',
          availability: 'Current + hourly',
        },
      ],
    },
    {
      title: 'Sky & Safety',
      note: 'Sky cover, UV exposure, and daily timing from the OpenWeather forecast.',
      rows: [
        {
          key: 'clouds',
          label: 'Cloud Cover',
          value: formatNumber(current.cloudCover, '%'),
          unit: 'percent',
          description: 'Share of the sky expected to be covered by clouds.',
          availability: 'Current + hourly',
        },
        {
          key: 'uvi',
          label: 'UV Index',
          value: formatNumber(current.uvIndex),
          unit: 'index',
          description: 'Sun exposure risk for outdoor operations.',
          availability: 'Current',
        },
        {
          key: 'daily.temp.max',
          label: 'Today High',
          value: formatDecimal(weather.today.high, '°C'),
          unit: 'celsius',
          description: 'Highest forecast temperature for the current day.',
          availability: 'Daily',
        },
        {
          key: 'daily.temp.min',
          label: 'Today Low',
          value: formatDecimal(weather.today.low, '°C'),
          unit: 'celsius',
          description: 'Lowest forecast temperature for the current day.',
          availability: 'Daily',
        },
        {
          key: 'sunrise',
          label: 'Sunrise',
          value: formatTime(weather.today.sunrise),
          unit: null,
          description: 'Local sunrise time from the daily forecast block.',
          availability: 'Daily',
        },
        {
          key: 'sunset',
          label: 'Sunset',
          value: formatTime(weather.today.sunset),
          unit: null,
          description: 'Local sunset time from the daily forecast block.',
          availability: 'Daily',
        },
      ],
    },
  ];
  const totalLayers = layerSections.reduce((sum, section) => sum + section.rows.length, 0);

  function handleToggleMinimized() {
    setIsMinimizeOverride(true);
    setIsMinimized((value) => !value);
  }

  if (mode === 'compact') {
    return (
      <div className={`overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] ${className}`}>
        <div className={`bg-gradient-to-r ${condition.panel} px-4 py-4`}>
          <div className="flex items-start gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${condition.iconWrap}`}>
              <ConditionIcon className={`h-6 w-6 ${condition.iconColor}`} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Field Weather
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">
                      {formatNumber(current.temperature, '°')}
                    </span>
                    <span className="text-xs text-slate-500">
                      Feels {formatNumber(current.feelsLike, '°')}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{current.weatherLabel}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {locationLabel}
                      {weather.location.rounded ? ' · area forecast' : ''}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={fetchWeather}
                    disabled={loading}
                    className="rounded-full bg-white/80 p-2 text-slate-600 shadow-sm transition hover:bg-white"
                    title="Refresh weather"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleMinimized}
                    className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-slate-700 shadow-sm"
                    aria-expanded={!isMinimized}
                    title={toggleLabel}
                  >
                    {isMinimized ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                    <span>{toggleLabel}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!isMinimized && (
          <div className="space-y-3 px-4 py-4">
            <div className={`rounded-2xl border px-3 py-2 ${leadTone.frame}`}>
              <div className="flex items-start gap-2">
                <ShieldAlert className={`mt-0.5 h-4 w-4 flex-shrink-0 ${leadTone.text}`} />
                <div>
                  <p className={`text-xs font-semibold ${leadTone.text}`}>{leadAlert.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">{leadAlert.detail}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2">
                <p className="text-[10px] text-slate-500">Rain</p>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {formatNumber(current.rainChance, '%')}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2">
                <p className="text-[10px] text-slate-500">Wind</p>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {formatNumber(current.windSpeed, ' km/h')}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2">
                <p className="text-[10px] text-slate-500">Visibility</p>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {formatDecimal(current.visibility, ' km')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 px-4 py-2 text-[10px] text-slate-500">
          <span>Updated {updatedTime}</span>
          <span>Sunrise {formatTime(weather.today.sunrise)}</span>
          <span>Sunset {formatTime(weather.today.sunset)}</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_22px_70px_-35px_rgba(15,23,42,0.38)] sm:rounded-[30px] ${className}`}>
      <div className={`bg-gradient-to-br ${condition.panel} px-4 py-4 sm:px-5 sm:py-5`}>
        <div className={isTightFull ? 'flex flex-col gap-4' : 'flex flex-col gap-4 sm:flex-row sm:items-start'}>
          <div className={`flex h-14 w-14 items-center justify-center rounded-[22px] sm:h-16 sm:w-16 sm:rounded-[24px] ${condition.iconWrap}`}>
            <ConditionIcon className={`h-8 w-8 ${condition.iconColor}`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className={isTightFull ? 'flex flex-col gap-3' : 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'}>
              <div className="space-y-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    OpenWeather Forecast
                  </p>
                  <h3 className="mt-1 text-[2rem] font-black tracking-tight text-slate-950 sm:text-3xl">
                    {formatNumber(current.temperature, '°C')}
                  </h3>
                  <p className="text-sm font-semibold text-slate-800">
                    {current.weatherLabel} · feels like {formatNumber(current.feelsLike, '°C')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/80 px-2.5 py-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {locationLabel}
                  </span>
                  {weather.location.rounded && (
                    <span className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-slate-500">
                      Rounded area query to save API calls
                    </span>
                  )}
                  <span className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-slate-500">
                    Updated {updatedTime}
                  </span>
                </div>
              </div>

              <div className={isTightFull ? 'grid w-full grid-cols-2 gap-2' : 'grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-none'}>
                <button
                  type="button"
                  onClick={fetchWeather}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                  title="Refresh weather"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleToggleMinimized}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                  aria-expanded={!isMinimized}
                  title={toggleLabel}
                >
                  {isMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  {toggleLabel}
                </button>
              </div>
            </div>

            <div className={isTightFull ? 'mt-4 grid gap-3' : 'mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]'}>
              <div className={`rounded-2xl border px-3 py-3 sm:px-4 ${leadTone.frame}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${leadTone.chip}`}>
                    {severityLabel(leadAlert.severity)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${leadTone.text}`}>{leadAlert.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{leadAlert.detail}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/75 px-3 py-3 sm:px-4">
                <p className="text-[11px] text-slate-500">Today</p>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  High {formatNumber(weather.today.high, '°')} · Low {formatNumber(weather.today.low, '°')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1">
                    <Sunrise className="h-3 w-3" />
                    {formatTime(weather.today.sunrise)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1">
                    <Sunset className="h-3 w-3" />
                    {formatTime(weather.today.sunset)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="border-t border-slate-200/70 bg-slate-50/70 px-4 py-4 sm:px-5">
            <div className={isTightFull ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
              {fullStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3 shadow-[0_10px_25px_-20px_rgba(15,23,42,0.45)] sm:px-4 sm:py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl bg-slate-100 p-2">
                        <Icon className="h-4 w-4 text-slate-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-500">{stat.label}</p>
                        <p className="mt-0.5 text-sm font-bold leading-5 text-slate-900 sm:text-[15px]">{stat.value}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200/70 px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Weather Data Layers</h4>
                <p className="text-xs leading-5 text-slate-500">
                  Responder view of the live OpenWeather One Call 3.0 fields behind this area forecast.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {totalLayers} live layers
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  Metric units
                </span>
              </div>
            </div>

            <div className={isTightFull ? 'mt-4 grid gap-3' : 'mt-4 grid gap-3 xl:grid-cols-3'}>
              {layerSections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-[26px] border border-slate-200/80 bg-slate-50/70 p-4 shadow-[0_14px_35px_-28px_rgba(15,23,42,0.35)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-bold text-slate-900">{section.title}</h5>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">{section.note}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {section.rows.length} fields
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {section.rows.map((row) => (
                      <div key={row.key} className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <code className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700">
                            {row.key}
                          </code>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              {row.availability}
                            </span>
                            {row.unit ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {row.unit}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-500">
                              {row.description}
                            </p>
                          </div>
                          <p className="text-right text-lg font-black leading-tight text-slate-950 sm:text-xl">
                            {row.value}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Next Forecast Updates</h4>
                <p className="text-xs text-slate-500">
                  Short outlook for dispatch timing, site visits, and road visibility from the upcoming forecast steps.
                </p>
              </div>
              <p className="max-w-[420px] text-xs text-slate-500 sm:text-right">{weather.summary}</p>
            </div>

            <div
              className={
                isTightFull
                  ? '-mx-1 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1'
                  : '-mx-1 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 xl:grid-cols-8'
              }
            >
              {weather.hourly.map((hour) => {
                const HourIcon = conditionMeta(hour.weatherCode).Icon;

                return (
                  <div
                    key={hour.time}
                    className={
                      isTightFull
                        ? 'min-w-[132px] flex-shrink-0 snap-start rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3'
                        : 'min-w-[132px] flex-shrink-0 snap-start rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 md:min-w-0'
                    }
                  >
                    <p className="text-[11px] font-semibold text-slate-500">
                      {formatTime(hour.time, 'hour')}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <HourIcon className="h-4 w-4 text-slate-600" />
                      <span className="text-lg font-black text-slate-900">
                        {formatNumber(hour.temperature, '°')}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">{hour.weatherLabel}</p>
                    <div className="mt-3 space-y-1 text-[10px] text-slate-500">
                      <p>Rain {formatNumber(hour.rainChance, '%')}</p>
                      <p>Wind {formatNumber(hour.windSpeed, ' km/h')}</p>
                      <p>Vis {formatDecimal(hour.visibility, ' km')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Sunrise className="h-3.5 w-3.5" />
            Sunrise {formatTime(weather.today.sunrise)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Sunset className="h-3.5 w-3.5" />
            Sunset {formatTime(weather.today.sunset)}
          </span>
        </div>
        <span>Updated {updatedTime}</span>
      </div>
    </div>
  );
}

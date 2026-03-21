'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, Navigation, Wind } from 'lucide-react';
import type { FieldResponseWeatherHour, FieldResponseWeatherPayload } from '@/lib/weather';

interface ResponderWindDetailsCardProps {
  weather: FieldResponseWeatherPayload;
  compact?: boolean;
}

interface BeaufortLevel {
  scale: number;
  label: string;
}

interface WindFlowPreviewProps {
  directionDeg: number | null;
  speedKph: number | null;
}

const BEAUFORT_LEVELS: Array<BeaufortLevel & { minKph: number; maxKph: number | null }> = [
  { scale: 0, label: 'Calm', minKph: 0, maxKph: 0.9 },
  { scale: 1, label: 'Light air', minKph: 1, maxKph: 5 },
  { scale: 2, label: 'Light breeze', minKph: 6, maxKph: 11 },
  { scale: 3, label: 'Gentle breeze', minKph: 12, maxKph: 19 },
  { scale: 4, label: 'Moderate breeze', minKph: 20, maxKph: 28 },
  { scale: 5, label: 'Fresh breeze', minKph: 29, maxKph: 38 },
  { scale: 6, label: 'Strong breeze', minKph: 39, maxKph: 49 },
  { scale: 7, label: 'Near gale', minKph: 50, maxKph: 61 },
  { scale: 8, label: 'Gale', minKph: 62, maxKph: 74 },
  { scale: 9, label: 'Strong gale', minKph: 75, maxKph: 88 },
  { scale: 10, label: 'Storm', minKph: 89, maxKph: 102 },
  { scale: 11, label: 'Violent storm', minKph: 103, maxKph: 117 },
  { scale: 12, label: 'Hurricane force', minKph: 118, maxKph: null },
] as const;

function formatSpeed(value: number | null) {
  if (value === null) return '--';
  return `${Math.round(value)} km/h`;
}

function formatSpeedShort(value: number | null) {
  if (value === null) return '--';
  return `${Math.round(value)}`;
}

function formatDirection(direction: number | null, cardinal: string | null) {
  if (cardinal && direction !== null) return `${cardinal} ${Math.round(direction)}°`;
  if (cardinal) return cardinal;
  if (direction !== null) return `${Math.round(direction)}°`;
  return '--';
}

function formatHourLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
  }).format(date);
}

function resolveBeaufortLevel(speedKph: number | null): BeaufortLevel {
  if (speedKph === null) {
    return {
      scale: 0,
      label: 'No wind data',
    };
  }

  return BEAUFORT_LEVELS.find((level) => (
    speedKph >= level.minKph
    && (level.maxKph === null || speedKph <= level.maxKph)
  )) ?? BEAUFORT_LEVELS[BEAUFORT_LEVELS.length - 1]!;
}

function resolveBarTone(speedKph: number | null) {
  if (speedKph === null) {
    return {
      fill: '#cbd5e1',
      ring: 'ring-slate-200',
      chip: 'bg-slate-100 text-slate-600',
    };
  }

  if (speedKph >= 50) {
    return {
      fill: '#ef4444',
      ring: 'ring-rose-200',
      chip: 'bg-rose-100 text-rose-700',
    };
  }

  if (speedKph >= 30) {
    return {
      fill: '#f59e0b',
      ring: 'ring-amber-200',
      chip: 'bg-amber-100 text-amber-700',
    };
  }

  if (speedKph >= 15) {
    return {
      fill: '#22c55e',
      ring: 'ring-emerald-200',
      chip: 'bg-emerald-100 text-emerald-700',
    };
  }

  return {
    fill: '#38bdf8',
    ring: 'ring-sky-200',
    chip: 'bg-sky-100 text-sky-700',
  };
}

function toFlowDirection(directionDeg: number | null) {
  if (directionDeg === null) return 180;
  return (directionDeg + 180) % 360;
}

function WindFlowPreview({ directionDeg, speedKph }: WindFlowPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const canvasElement = canvas;
    const drawingContext = context;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    const particleCount = Math.max(
      18,
      Math.min(44, Math.round((speedKph ?? 10) * 0.9) + 14),
    );
    const particles = Array.from({ length: particleCount }, () => ({
      x: 0,
      y: 0,
      life: 0,
      ttl: 0,
    }));

    const flowDirection = toFlowDirection(directionDeg);
    const radians = ((flowDirection - 90) * Math.PI) / 180;
    const velocityScale = Math.max(0.45, Math.min(1.8, (speedKph ?? 12) / 24));
    const strokeColor = resolveBarTone(speedKph).fill;

    function spawnParticle(index: number) {
      particles[index] = {
        x: Math.random() * width,
        y: Math.random() * height,
        life: 0,
        ttl: 36 + Math.random() * 48,
      };
    }

    function resizeCanvas() {
      const bounds = canvasElement.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      canvasElement.width = Math.round(width * pixelRatio);
      canvasElement.height = Math.round(height * pixelRatio);
      drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particles.forEach((_, index) => {
        spawnParticle(index);
      });
    }

    resizeCanvas();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => resizeCanvas())
      : null;
    resizeObserver?.observe(canvasElement);

    let lastTime = performance.now();

    const draw = (time: number) => {
      const delta = Math.min(32, time - lastTime || 16);
      lastTime = time;

      drawingContext.clearRect(0, 0, width, height);
      drawingContext.fillStyle = 'rgba(248, 250, 252, 0.16)';
      drawingContext.fillRect(0, 0, width, height);

      drawingContext.strokeStyle = strokeColor;
      drawingContext.lineCap = 'round';
      drawingContext.lineWidth = 1.4;

      particles.forEach((particle, index) => {
        if (particle.ttl <= 0 || particle.life >= particle.ttl) {
          spawnParticle(index);
        }

        const previousX = particle.x;
        const previousY = particle.y;
        const drift = (delta / 16) * velocityScale * 2.8;
        particle.x += Math.cos(radians) * drift;
        particle.y += Math.sin(radians) * drift;
        particle.life += delta / 16;

        if (
          particle.x < -16
          || particle.x > width + 16
          || particle.y < -16
          || particle.y > height + 16
        ) {
          spawnParticle(index);
          return;
        }

        drawingContext.globalAlpha = Math.max(0.22, 1 - (particle.life / particle.ttl));
        drawingContext.beginPath();
        drawingContext.moveTo(previousX, previousY);
        drawingContext.lineTo(particle.x, particle.y);
        drawingContext.stroke();
      });

      drawingContext.globalAlpha = 1;
      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [directionDeg, speedKph]);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top,#eff6ff_0%,#e0f2fe_48%,#f8fafc_100%)]">
      <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Local flow preview
        </p>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          Point-based
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="block h-24 w-full"
        aria-label="Animated local wind flow preview"
      />
    </div>
  );
}

export default function ResponderWindDetailsCard({
  weather,
  compact = false,
}: ResponderWindDetailsCardProps) {
  const [selectedHourIndex, setSelectedHourIndex] = useState(0);
  const [showFlowPreview, setShowFlowPreview] = useState(false);
  const forecastHours = useMemo(
    () => (weather.next24Hours.length > 0 ? weather.next24Hours : weather.hourly).slice(0, 24),
    [weather.hourly, weather.next24Hours],
  );
  const selectedHour = forecastHours[selectedHourIndex] ?? null;
  const beaufort = resolveBeaufortLevel(weather.current.windSpeed);
  const maxWindSpeed = useMemo(() => {
    const values = [
      weather.current.windSpeed,
      ...forecastHours.map((hour) => hour.windSpeed),
    ].filter((value): value is number => value !== null);
    return values.length > 0 ? Math.max(...values, 1) : 1;
  }, [forecastHours, weather.current.windSpeed]);
  const previewDirection = selectedHour?.windDirection ?? weather.current.windDirection;
  const previewSpeed = selectedHour?.windSpeed ?? weather.current.windSpeed;
  const previewLabel = selectedHour
    ? `Selected ${formatHourLabel(selectedHour.time)}`
    : 'Current point wind';

  useEffect(() => {
    setSelectedHourIndex(0);
    if (compact) {
      setShowFlowPreview(false);
    }
  }, [compact, weather.generatedAt, weather.location.lat, weather.location.lng]);

  return (
    <div className="mt-3 rounded-[22px] border border-sky-200 bg-sky-50/80 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Wind details
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Point forecast for the tapped responder location.
          </p>
        </div>
        {!compact ? (
          <button
            type="button"
            onClick={() => setShowFlowPreview((current) => !current)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              showFlowPreview
                ? 'bg-sky-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {showFlowPreview ? 'Hide flow' : 'Show flow'}
          </button>
        ) : (
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">
            Desktop flow preview
          </span>
        )}
      </div>

      <div className={`mt-3 grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-[112px_minmax(0,1fr)]'}`}>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Compass
          </p>
          <div className="mt-2 flex justify-center">
            <svg viewBox="0 0 120 120" className="h-24 w-24">
              <circle cx="60" cy="60" r="44" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
              <circle cx="60" cy="60" r="34" fill="none" stroke="#e2e8f0" strokeDasharray="3 5" />
              <text x="60" y="17" textAnchor="middle" fontSize="10" fill="#64748b">N</text>
              <text x="104" y="63" textAnchor="middle" fontSize="10" fill="#64748b">E</text>
              <text x="60" y="110" textAnchor="middle" fontSize="10" fill="#64748b">S</text>
              <text x="16" y="63" textAnchor="middle" fontSize="10" fill="#64748b">W</text>
              <g transform={`rotate(${weather.current.windDirection ?? 0} 60 60)`}>
                <line x1="60" y1="66" x2="60" y2="29" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
                <path d="M60 20 L68 36 L52 36 Z" fill="#0f172a" />
              </g>
              <circle cx="60" cy="60" r="4.5" fill="#0f172a" />
            </svg>
          </div>
          <p className="mt-2 text-center text-sm font-semibold text-slate-800">
            {formatDirection(
              weather.current.windDirection,
              weather.current.windDirectionCardinal,
            )}
          </p>
          <p className="mt-1 text-center text-[11px] text-slate-500">
            Wind source direction
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Wind speed
            </p>
            <p className="mt-2 text-lg font-black text-slate-900">
              {formatSpeed(weather.current.windSpeed)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Gust
            </p>
            <p className="mt-2 text-lg font-black text-slate-900">
              {formatSpeed(weather.current.windGust)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Beaufort
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-black text-sky-700">
                B{beaufort.scale}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{beaufort.label}</p>
                <p className="text-[11px] text-slate-500">Field wind strength</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Pressure
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-slate-500" />
              <p className="text-sm font-black text-slate-900">
                {weather.current.pressureSeaLevel === null ? '--' : `${Math.round(weather.current.pressureSeaLevel)} hPa`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!compact && showFlowPreview ? (
        <WindFlowPreview directionDeg={previewDirection} speedKph={previewSpeed} />
      ) : null}

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Forecast focus
          </p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {previewLabel}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 font-semibold">
            <Wind className="h-3.5 w-3.5" />
            {formatSpeed(previewSpeed)}
          </span>
          <span className="rounded-full bg-slate-50 px-2.5 py-1 font-semibold">
            Gust {formatSpeed(selectedHour?.windGust ?? weather.current.windGust)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 font-semibold">
            <Navigation className="h-3.5 w-3.5" />
            {formatDirection(previewDirection, selectedHour?.windDirectionCardinal ?? weather.current.windDirectionCardinal)}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              24h wind forecast
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Tap a bar to preview wind speed, gust, and direction for that hour.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
            {forecastHours.length} steps
          </span>
        </div>

        <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max items-end gap-2">
            {forecastHours.map((hour, index) => {
              const ratio = Math.max(0.18, (hour.windSpeed ?? 0) / maxWindSpeed);
              const barHeight = Math.round(24 + (ratio * 52));
              const tone = resolveBarTone(hour.windSpeed);
              const isActive = index === selectedHourIndex;

              return (
                <button
                  key={hour.time}
                  type="button"
                  onClick={() => setSelectedHourIndex(index)}
                  className={`flex w-12 flex-shrink-0 flex-col items-center rounded-2xl border px-2 py-2 text-center transition ${
                    isActive
                      ? 'border-sky-300 bg-sky-50 shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:bg-white'
                  }`}
                >
                  <div className="flex h-[82px] items-end">
                    <div
                      className={`flex w-8 items-start justify-center rounded-t-xl ring-1 ring-inset ${tone.ring}`}
                      style={{
                        height: `${barHeight}px`,
                        backgroundColor: tone.fill,
                      }}
                    >
                      <Navigation
                        className="mt-1 h-3.5 w-3.5 text-white"
                        style={{
                          transform: `rotate(${toFlowDirection(hour.windDirection)}deg)`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold text-slate-700">
                    {formatHourLabel(hour.time)}
                  </p>
                  <span className={`mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                    {formatSpeedShort(hour.windSpeed)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

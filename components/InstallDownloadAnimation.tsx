'use client';

import type { CSSProperties } from 'react';
import { Check, Download, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InstallAnimationStatus =
  | 'idle'
  | 'downloading'
  | 'awaiting'
  | 'installed'
  | 'not-installed'
  | 'manual';

interface InstallDownloadAnimationProps {
  status: InstallAnimationStatus;
  size?: number;
  showBar?: boolean;
  className?: string;
}

const RING_RADIUS = 32;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const BURST_PARTICLES = [
  { tx: 0, ty: -34, delay: 0.0 },
  { tx: 0, ty: 34, delay: 0.0 },
  { tx: -34, ty: 0, delay: 0.05 },
  { tx: 34, ty: 0, delay: 0.05 },
  { tx: -24, ty: -24, delay: 0.1 },
  { tx: 24, ty: -24, delay: 0.1 },
  { tx: -24, ty: 24, delay: 0.15 },
  { tx: 24, ty: 24, delay: 0.15 },
];

const STATUS_COPY: Record<InstallAnimationStatus, string> = {
  idle: 'Download the app for faster access',
  downloading: 'Downloading MSWDO App…',
  awaiting: 'Confirm the install in your browser…',
  installed: 'App Installed!',
  'not-installed': 'Installation incomplete',
  manual: 'Follow these steps to finish',
};

export function InstallDownloadAnimation({
  status,
  size = 104,
  showBar = true,
  className,
}: InstallDownloadAnimationProps) {
  const iconSize = Math.round(size * 0.3);
  const track = 'stroke-slate-200';
  const progressStroke =
    status === 'installed'
      ? 'stroke-emerald-500'
      : status === 'not-installed'
        ? 'stroke-amber-500'
        : 'stroke-cyan-600';

  const halo =
    status === 'installed'
      ? 'bg-emerald-100/80'
      : status === 'not-installed'
        ? 'bg-amber-100/70'
        : status === 'manual'
          ? 'bg-cyan-100/60'
          : 'bg-cyan-100/70';

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        {/* soft halo behind the ring */}
        <div
          className={cn('absolute inset-0 rounded-full transition-colors duration-500', halo)}
          aria-hidden="true"
        />

        {/* progress ring */}
        <svg
          viewBox="0 0 72 72"
          width={size}
          height={size}
          className="absolute inset-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="36"
            cy="36"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="5"
            className={track}
          />
          {status === 'downloading' ? (
            <circle
              cx="36"
              cy="36"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className={cn('install-ring-progress', progressStroke)}
            />
          ) : null}
          {status === 'awaiting' ? (
            <>
              <circle
                cx="36"
                cy="36"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                className={progressStroke}
                strokeDasharray={`${RING_CIRCUMFERENCE}`}
                strokeDashoffset={0}
              />
              <circle
                cx="36"
                cy="36"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                className="install-ring-sweep stroke-cyan-600"
              />
            </>
          ) : null}
          {status === 'installed' ? (
            <circle
              cx="36"
              cy="36"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="5"
              className="stroke-emerald-500"
            />
          ) : null}
          {status === 'not-installed' ? (
            <circle
              cx="36"
              cy="36"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="5"
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
              strokeDashoffset={RING_CIRCUMFERENCE * 0.65}
              className="stroke-amber-500"
            />
          ) : null}
          {status === 'manual' ? (
            <circle
              cx="36"
              cy="36"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="5"
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
              strokeDashoffset={0}
              className="stroke-cyan-200"
            />
          ) : null}
        </svg>

        {/* success burst particles */}
        {status === 'installed' ? (
          <div className="absolute inset-0" aria-hidden="true">
            {BURST_PARTICLES.map((particle, index) => (
              <span
                key={index}
                className="install-burst absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-emerald-400"
                style={
                  {
                    '--tx': `${particle.tx}px`,
                    '--ty': `${particle.ty}px`,
                    marginLeft: -4,
                    marginTop: -4,
                    animationDelay: `${particle.delay}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ) : null}

        {/* center content */}
        <div className="relative grid place-items-center" style={{ width: iconSize, height: iconSize }}>
          {status === 'idle' ? (
            <Download width={iconSize} height={iconSize} className="stroke-slate-400" />
          ) : null}
          {status === 'downloading' ? (
            <Download width={iconSize} height={iconSize} className="install-arrow-drop stroke-cyan-600" />
          ) : null}
          {status === 'awaiting' ? (
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="install-dot h-2 w-2 rounded-full bg-cyan-600"
                  style={{ animationDelay: `${dot * 0.18}s` }}
                />
              ))}
            </div>
          ) : null}
          {status === 'installed' ? (
            <span className="install-check-pop grid place-items-center rounded-full bg-emerald-500 p-1.5 shadow-[0_10px_24px_-10px_rgba(16,185,129,0.9)]">
              <Check width={iconSize * 0.6} height={iconSize * 0.6} className="stroke-white" strokeWidth={3.5} />
            </span>
          ) : null}
          {status === 'not-installed' ? (
            <span className="install-shake grid place-items-center rounded-full bg-amber-100 p-2">
              <X width={iconSize * 0.6} height={iconSize * 0.6} className="stroke-amber-600" strokeWidth={3} />
            </span>
          ) : null}
          {status === 'manual' ? (
            <Smartphone width={iconSize * 0.85} height={iconSize * 0.85} className="stroke-cyan-600" />
          ) : null}
        </div>
      </div>

      {showBar ? (
        <div className="mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-slate-200/80" aria-hidden="true">
          {status === 'downloading' ? (
            <div className="install-bar-fill h-full w-full rounded-full bg-cyan-600" />
          ) : null}
          {status === 'awaiting' ? (
            <div className="install-bar-slide h-full w-1/3 rounded-full bg-cyan-600" />
          ) : null}
          {status === 'installed' ? <div className="h-full w-full rounded-full bg-emerald-500" /> : null}
          {status === 'not-installed' ? (
            <div className="h-full w-1/3 rounded-full bg-amber-500" />
          ) : null}
          {status === 'manual' ? <div className="h-full w-full rounded-full bg-cyan-200/80" /> : null}
        </div>
      ) : null}

      <p
        role={status === 'installed' || status === 'not-installed' ? 'status' : undefined}
        aria-live="polite"
        className={cn(
          'mt-3 text-center text-sm font-semibold',
          status === 'installed'
            ? 'text-emerald-700'
            : status === 'not-installed'
              ? 'text-amber-700'
              : 'text-slate-700',
        )}
      >
        {STATUS_COPY[status]}
      </p>
    </div>
  );
}

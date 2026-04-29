'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CivicAuthFeature {
  icon: LucideIcon;
  label: string;
  description: string;
}

export interface CivicAuthStat {
  label: string;
  value: string;
  description?: string;
}

interface CivicAuthShellProps {
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  panelEyebrow: string;
  panelTitle: string;
  panelDescription: string;
  children: ReactNode;
  heroBadge?: string;
  heroFootnote?: string;
  panelAside?: ReactNode;
  footer?: ReactNode;
  features?: CivicAuthFeature[];
  stats?: CivicAuthStat[];
  className?: string;
}

export default function CivicAuthShell({
  heroEyebrow,
  heroTitle,
  heroDescription,
  panelEyebrow,
  panelTitle,
  panelDescription,
  children,
  heroBadge = 'Municipal civic operations',
  heroFootnote,
  panelAside,
  footer,
  features = [],
  stats = [],
  className,
}: CivicAuthShellProps) {
  return (
    <div className={cn('civic-shell-noise relative min-h-screen overflow-hidden', className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(8,47,73,0.12),transparent_56%)]" />

      <div className="flex min-h-screen w-full flex-col xl:grid xl:grid-cols-12">
        <section className="relative overflow-hidden border-b border-white/80 bg-[linear-gradient(160deg,rgba(232,244,252,0.96),rgba(218,238,247,0.92)_42%,rgba(12,74,110,0.96)_100%)] px-5 py-7 sm:px-7 sm:py-8 lg:px-9 lg:py-9 xl:col-span-7 xl:min-h-screen xl:border-b-0 xl:border-r xl:border-r-white/70 xl:px-[clamp(1.75rem,3vw,3.5rem)] xl:py-[clamp(1.5rem,2.4vw,2.75rem)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:36px_36px] opacity-40" />
          <div className="pointer-events-none absolute -left-10 top-20 h-52 w-52 rounded-full bg-white/35 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />

          <div className="relative mx-auto flex h-full w-full max-w-[72rem] flex-col justify-between gap-8 xl:ml-auto xl:mr-0 xl:max-w-[56rem] xl:gap-7">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/80 bg-white/78 px-3.5 py-2 shadow-[0_20px_40px_-28px_rgba(8,47,73,0.35)] backdrop-blur">
                <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-white shadow-[0_18px_36px_-24px_rgba(8,47,73,0.2)] overflow-hidden p-1.5 transition-transform hover:scale-105">
                  <img src="/dswd-logo.png" alt="DSWD Logo" className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">E-Mabini</p>
                  <p className="truncate text-sm font-bold text-cyan-950">{heroBadge}</p>
                </div>
              </div>

              <div className="mt-6 max-w-[56rem] xl:mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-900/70">{heroEyebrow}</p>
                <h1 className="mt-3 text-[clamp(2.1rem,4vw,4.6rem)] font-black leading-[0.98] tracking-tight text-slate-950">
                  {heroTitle}
                </h1>
                <p className="mt-3 max-w-[48rem] text-[clamp(0.98rem,1.25vw,1.08rem)] leading-6 text-slate-700 xl:max-w-[44rem]">
                  {heroDescription}
                </p>
              </div>
            </div>

            <div className="space-y-4 xl:space-y-3.5">
              {stats.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-[22px] border border-white/70 bg-white/72 px-4 py-3.5 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.3)] backdrop-blur"
                    >
                      <p className="text-[1.7rem] font-black tracking-tight text-cyan-950">{stat.value}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
                      {stat.description ? <p className="mt-1.5 text-sm leading-5 text-slate-600">{stat.description}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {features.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {features.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div
                        key={feature.label}
                        className="rounded-[22px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(241,247,251,0.76))] p-3.5 shadow-[0_20px_46px_-34px_rgba(15,23,42,0.28)] backdrop-blur"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-100 bg-white text-cyan-950 shadow-[0_18px_36px_-28px_rgba(8,47,73,0.5)]">
                          <Icon className="h-[18px] w-[18px]" />
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-950">{feature.label}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{feature.description}</p>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {heroFootnote ? (
                <div className="inline-flex max-w-[44rem] items-center gap-2 rounded-full border border-white/75 bg-white/70 px-4 py-2 text-sm text-slate-600 shadow-[0_18px_36px_-26px_rgba(15,23,42,0.2)] backdrop-blur">
                  <ArrowRight className="h-4 w-4 text-cyan-900" />
                  {heroFootnote}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <main className="flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:col-span-5 xl:px-[clamp(1.25rem,2.5vw,2.5rem)] xl:py-[clamp(1.5rem,2.4vw,2.5rem)]">
          <div className="w-full max-w-[56rem] rounded-[30px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.96))] p-5 shadow-[0_34px_80px_-42px_rgba(15,23,42,0.35)] sm:p-6 xl:max-w-[40rem]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div className="max-w-xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{panelEyebrow}</p>
                <h2 className="mt-2.5 text-[1.85rem] font-black tracking-tight text-slate-950 sm:text-[1.95rem]">{panelTitle}</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600 sm:text-[0.95rem]">{panelDescription}</p>
              </div>
              {panelAside ? <div className="flex shrink-0 items-start">{panelAside}</div> : null}
            </div>

            <div className="mt-5">{children}</div>

            {footer ? <div className="mt-5 border-t border-slate-200/80 pt-4">{footer}</div> : null}
          </div>
        </main>
      </div>
    </div>
  );
}

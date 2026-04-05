'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'navy' | 'teal' | 'amber' | 'rose' | 'emerald' | 'slate';

const toneStyles: Record<Tone, string> = {
  navy: 'border-cyan-200/70 bg-cyan-50 text-cyan-950',
  teal: 'border-teal-200/70 bg-teal-50 text-teal-950',
  amber: 'border-amber-200/70 bg-amber-50 text-amber-950',
  rose: 'border-rose-200/70 bg-rose-50 text-rose-950',
  emerald: 'border-emerald-200/70 bg-emerald-50 text-emerald-950',
  slate: 'border-slate-200/80 bg-white text-slate-900',
};

const toneIconStyles: Record<Tone, string> = {
  navy: 'bg-cyan-950 text-white shadow-[0_14px_36px_-20px_rgba(8,47,73,0.6)]',
  teal: 'bg-teal-700 text-white shadow-[0_14px_36px_-20px_rgba(15,118,110,0.55)]',
  amber: 'bg-amber-500 text-white shadow-[0_14px_36px_-20px_rgba(217,119,6,0.55)]',
  rose: 'bg-rose-600 text-white shadow-[0_14px_36px_-20px_rgba(225,29,72,0.55)]',
  emerald: 'bg-emerald-600 text-white shadow-[0_14px_36px_-20px_rgba(5,150,105,0.55)]',
  slate: 'bg-slate-900 text-white shadow-[0_14px_36px_-20px_rgba(15,23,42,0.55)]',
};

export function CivicPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8', className)}>
      {children}
    </div>
  );
}

export function CivicHero({
  eyebrow,
  title,
  description,
  children,
  aside,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,249,255,0.92))] px-5 py-5 shadow-[0_26px_70px_-38px_rgba(15,23,42,0.35)] sm:px-6 sm:py-6',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(8,47,73,0.08),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(13,148,136,0.08),transparent_28%)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-[2rem]">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-start">{aside}</div> : null}
      </div>
    </section>
  );
}

export function CivicPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-[26px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_54px_-34px_rgba(15,23,42,0.24)] backdrop-blur sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CivicSectionHeading({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div>
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CivicKpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'slate',
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn('rounded-[24px] border p-4 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.45)]', toneStyles[tone], className)}>
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', toneIconStyles[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function CivicBadge({
  label,
  tone = 'slate',
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]',
        toneStyles[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function CivicChipButton({
  active,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition',
        active
          ? 'border-cyan-900 bg-cyan-950 text-white shadow-[0_14px_28px_-20px_rgba(8,47,73,0.75)]'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CivicSearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-slate-400 focus:border-cyan-800 focus:bg-white focus:ring-4 focus:ring-cyan-900/10"
        {...props}
      />
    </div>
  );
}

export function CivicEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[26px] border border-dashed border-slate-300 bg-white/85 px-6 py-14 text-center shadow-[0_18px_46px_-36px_rgba(15,23,42,0.3)]',
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-slate-400">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

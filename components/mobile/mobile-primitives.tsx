'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

export interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  sticky?: boolean;
  className?: string;
}

export function MobilePageHeader({
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  sticky = false,
  className,
}: MobilePageHeaderProps) {
  return (
    <section
      className={cn(
        'space-y-3',
        sticky && 'sticky top-[4.5rem] z-20 rounded-[24px] bg-[rgba(244,249,255,0.94)] pb-3 pt-2 backdrop-blur',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight text-slate-950">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p> : null}
        </div>
        {primaryAction ? <div className="shrink-0">{primaryAction}</div> : null}
      </div>
      {secondaryActions ? <div className="flex flex-wrap gap-2">{secondaryActions}</div> : null}
    </section>
  );
}

export interface MobileActionBarProps {
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
  safeArea?: boolean;
  className?: string;
}

export function MobileActionBar({
  primaryAction,
  secondaryAction,
  safeArea = true,
  className,
}: MobileActionBarProps) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-20 px-4',
        safeArea ? 'bottom-[calc(env(safe-area-inset-bottom)+5.6rem)]' : 'bottom-24',
        className,
      )}
    >
      <div className="pointer-events-auto mx-auto max-w-lg rounded-[26px] border border-white/85 bg-white/96 p-2 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.32)] backdrop-blur">
        <div className={cn('grid gap-2', secondaryAction ? 'grid-cols-[1fr_auto]' : 'grid-cols-1')}>
          <div className="min-w-0">{primaryAction}</div>
          {secondaryAction ? <div className="shrink-0">{secondaryAction}</div> : null}
        </div>
      </div>
    </div>
  );
}

export interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  search?: ReactNode;
  filters: ReactNode;
  sort?: ReactNode;
  resultCount?: ReactNode;
  className?: string;
}

export function MobileFilterSheet({
  open,
  onOpenChange,
  title,
  description,
  search,
  filters,
  sort,
  resultCount,
  className,
}: MobileFilterSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn('max-h-[82vh] rounded-t-[30px] border-slate-200 bg-white', className)}>
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="text-base font-bold text-slate-950">{title}</DrawerTitle>
          {description ? (
            <DrawerDescription className="text-sm leading-6 text-slate-500">
              {description}
            </DrawerDescription>
          ) : null}
        </DrawerHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-1">
          {resultCount ? (
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              {resultCount}
            </div>
          ) : null}
          {search}
          <div className="space-y-4">{filters}</div>
          {sort ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sort</p>
              {sort}
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export interface MobileListCardProps {
  title: string;
  subtitle?: ReactNode;
  meta: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function MobileListCard({
  title,
  subtitle,
  meta,
  status,
  actions,
  leading,
  trailing,
  className,
}: MobileListCardProps) {
  return (
    <Card className={cn('rounded-[26px] border-slate-200/80 bg-white/96 py-0 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.28)]', className)}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          {leading ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 text-slate-700">
              {leading}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">{title}</p>
                {subtitle ? <div className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</div> : null}
              </div>
              {trailing ? <div className="shrink-0">{trailing}</div> : null}
            </div>
            {status ? <div className="mt-3 flex flex-wrap gap-1.5">{status}</div> : null}
            <div className="mt-3">{meta}</div>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}

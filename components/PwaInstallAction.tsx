'use client';

import { Check } from 'lucide-react';
import PwaInstallStatusMessage from '@/components/PwaInstallStatusMessage';
import InstallDownloadButton from '@/components/InstallDownloadButton';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { cn } from '@/lib/utils';

interface PwaInstallActionProps {
  className?: string;
  iconClassName?: string;
  iconOnly?: boolean;
  label?: string;
}

export default function PwaInstallAction({
  className,
  iconClassName,
  iconOnly = false,
  label = 'Download App',
}: PwaInstallActionProps) {
  const { isInstalled } = usePwaInstall();

  if (isInstalled) {
    return (
      <div className={cn('flex flex-col', iconOnly ? 'relative items-end' : 'items-start')}>
        <button
          type="button"
          aria-label="App installed"
          disabled
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700',
            iconOnly ? 'h-11 w-11 rounded-[20px] px-0 py-0' : '',
            className,
          )}
        >
          <Check className={cn('h-4 w-4', iconClassName)} />
          {iconOnly ? null : 'Installed'}
        </button>
        <PwaInstallStatusMessage
          compact={iconOnly}
          className={cn(
            iconOnly
              ? 'absolute right-0 top-full z-40 mt-2 w-64 shadow-lg'
              : 'mt-2 max-w-[320px]',
          )}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', iconOnly ? 'relative items-end' : 'items-start')}>
      <InstallDownloadButton
        label={label}
        iconOnly={iconOnly}
        className={cn(
          'border border-cyan-200 bg-cyan-50 text-cyan-950 hover:border-cyan-300 hover:bg-cyan-100',
          className,
        )}
        iconClassName={iconClassName}
      />

      <PwaInstallStatusMessage
        compact={iconOnly}
        className={cn(
          iconOnly
            ? 'absolute right-0 top-full z-40 mt-2 w-64 shadow-lg'
            : 'mt-2 max-w-[320px]',
        )}
      />
    </div>
  );
}

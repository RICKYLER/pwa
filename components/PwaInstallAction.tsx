'use client';

import { Download, Loader2 } from 'lucide-react';
import PwaInstallStatusMessage from '@/components/PwaInstallStatusMessage';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { getInstallActionLabel } from '@/lib/pwa-install';
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
  const { isInstalled, isInstalling, install, installFeedbackStatus } = usePwaInstall();

  if (isInstalled) {
    return null;
  }

  async function handleClick() {
    await install();
  }

  return (
    <div className={cn('flex flex-col', iconOnly ? 'relative items-end' : 'items-start')}>
      <button
        type="button"
        onClick={() => { void handleClick(); }}
        aria-label={label}
        disabled={isInstalling}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-950 transition hover:border-cyan-300 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60',
          iconOnly ? 'h-11 w-11 rounded-[20px] px-0 py-0' : '',
          className,
        )}
      >
        {isInstalling ? (
          <Loader2 className={cn('h-4 w-4 animate-spin', iconClassName)} />
        ) : (
          <Download className={cn('h-4 w-4', iconClassName)} />
        )}
        {iconOnly ? null : getInstallActionLabel(installFeedbackStatus, label)}
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

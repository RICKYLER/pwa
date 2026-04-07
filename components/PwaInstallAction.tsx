'use client';

import { Download } from 'lucide-react';
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
  const { isInstalled, isInstalling, isInstallAvailable, install, openDialog } = usePwaInstall();

  if (isInstalled) {
    return null;
  }

  async function handleClick() {
    if (isInstallAvailable) {
      const outcome = await install();
      if (outcome === 'unavailable') {
        openDialog();
      }
      return;
    }

    openDialog();
  }

  return (
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
      <Download className={cn('h-4 w-4', iconClassName)} />
      {iconOnly ? null : (isInstalling ? 'Opening Install...' : label)}
    </button>
  );
}

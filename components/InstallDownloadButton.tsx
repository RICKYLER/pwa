'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Check, Download, Loader2 } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { getInstallActionLabel } from '@/lib/pwa-install';
import { cn } from '@/lib/utils';

interface InstallDownloadButtonProps {
  className?: string;
  iconClassName?: string;
  iconOnly?: boolean;
  label?: string;
  onTapped?: () => void;
  onOutcome?: (outcome: 'accepted' | 'dismissed' | 'unavailable') => void;
  cooldownMs?: number;
}

/**
 * Animated "Download App" button that keeps users from spamming the
 * install action:
 * - disabled for the whole install flow (not just while awaiting the prompt)
 * - shows a clear "Installed" terminal state instead of unmounting
 * - after a dismissed/cancelled install, a short cooldown blocks repeat taps
 */
export default function InstallDownloadButton({
  className,
  iconClassName,
  iconOnly = false,
  label = 'Download App',
  onTapped,
  onOutcome,
  cooldownMs = 2500,
}: InstallDownloadButtonProps) {
  const { isInstalling, isInstalled, install, installFeedbackStatus, apkUrl } = usePwaInstall();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [apkDownloading, setApkDownloading] = useState(false);

  // Re-render while the cooldown is active so the disabled state and
  // label stay in sync with the remaining wait time.
  useEffect(() => {
    if (now >= cooldownUntil) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 120);

    return () => {
      window.clearInterval(interval);
    };
  }, [cooldownUntil, now]);

  const inCooldown = now < cooldownUntil;
  const isDone = isInstalled || installFeedbackStatus === 'installed';
  const disabled = isInstalling || isDone || inCooldown || apkDownloading;

  async function handleClick() {
    if (disabled) {
      return;
    }

    onTapped?.();

    // Android with a packaged APK configured: the button becomes a direct file
    // download — press, the .apk saves to the phone, tap it to install. No
    // browser install prompt, no manual steps.
    if (apkUrl) {
      const anchor = document.createElement('a');
      anchor.href = apkUrl;
      anchor.download = 'e-mabini.apk';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setApkDownloading(true);
      window.setTimeout(() => {
        setApkDownloading(false);
      }, 2200);
      onOutcome?.('accepted');
      return;
    }

    const outcome = await install();

    // A cancelled or unavailable install is the number-one spam trigger —
    // freeze the button briefly so users can read the "not installed yet"
    // message instead of mashing Download again.
    if (outcome === 'dismissed' || outcome === 'unavailable') {
      setCooldownUntil(Date.now() + cooldownMs);
      setNow(Date.now());
    }

    onOutcome?.(outcome);
  }

  let buttonLabel = getInstallActionLabel(installFeedbackStatus, label);
  if (apkDownloading) {
    buttonLabel = 'Downloading…';
  } else if (isDone) {
    buttonLabel = 'Installed ✓';
  } else if (inCooldown) {
    buttonLabel = 'Please wait…';
  } else if (installFeedbackStatus === 'dismissed') {
    buttonLabel = 'Try Again';
  }

  let icon: ReactNode = <Download className={cn('h-4 w-4', iconClassName)} />;
  if (apkDownloading) {
    icon = <Loader2 className={cn('h-4 w-4 animate-spin', iconClassName)} />;
  } else if (isDone) {
    icon = <Check className={cn('h-4 w-4', iconClassName)} />;
  } else if (isInstalling) {
    icon = <Loader2 className={cn('h-4 w-4 animate-spin', iconClassName)} />;
  }

  return (
    <button
      type="button"
      onClick={() => { void handleClick(); }}
      aria-label={iconOnly ? label : undefined}
      aria-live="polite"
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-cyan-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60',
        iconOnly ? 'h-11 w-11 rounded-[20px] px-0 py-0' : '',
        className,
      )}
    >
      {icon}
      {iconOnly ? null : buttonLabel}
    </button>
  );
}

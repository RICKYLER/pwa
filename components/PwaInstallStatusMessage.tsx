'use client';

import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { cn } from '@/lib/utils';

interface PwaInstallStatusMessageProps {
  className?: string;
  compact?: boolean;
}

export default function PwaInstallStatusMessage({
  className,
  compact = false,
}: PwaInstallStatusMessageProps) {
  const {
    installFeedbackStatus,
    installFeedbackMessage,
    installFeedbackTone,
  } = usePwaInstall();

  if (installFeedbackStatus === 'idle' || !installFeedbackMessage) {
    return null;
  }

  const Icon = installFeedbackTone === 'success'
    ? CheckCircle2
    : installFeedbackTone === 'warning'
      ? AlertCircle
      : Info;

  const toneClassName = installFeedbackTone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : installFeedbackTone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-cyan-200 bg-cyan-50 text-cyan-950';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 rounded-2xl border px-3 py-2',
        compact ? 'text-xs' : 'text-sm',
        toneClassName,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      <p className="leading-5">{installFeedbackMessage}</p>
    </div>
  );
}

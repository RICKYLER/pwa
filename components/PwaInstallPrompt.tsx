'use client';

import { Download, MonitorSmartphone } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';

export default function PwaInstallPrompt() {
  const {
    showPrompt,
    isInstallAvailable,
    isInstalling,
    install,
    openDialog,
    dismissPrompt,
  } = usePwaInstall();

  if (!showPrompt) {
    return null;
  }

  async function handleDownload() {
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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end p-4">
      <div
        className="pointer-events-auto w-full max-w-md rounded-[24px] border border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_18px_54px_-34px_rgba(15,23,42,0.24)] backdrop-blur"
        style={{ marginTop: 'max(env(safe-area-inset-top), 0px)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-950 text-white shadow-[0_14px_28px_-20px_rgba(8,47,73,0.8)]">
            <MonitorSmartphone className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">Download App</p>
            <p className="mt-1 text-sm text-slate-600">
              Install MSWDO App for faster opening and a cleaner full-screen experience.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleDownload(); }}
              disabled={isInstalling}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {isInstalling ? 'Opening...' : 'Download App'}
            </button>
            <button
              type="button"
              onClick={dismissPrompt}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

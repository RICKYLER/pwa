'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Download, Home, Loader2, MonitorSmartphone, Share2 } from 'lucide-react';
import PwaInstallStatusMessage from '@/components/PwaInstallStatusMessage';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { getInstallActionLabel } from '@/lib/pwa-install';
import { useIsMobile } from '@/components/ui/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

function BenefitCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3.5 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-950 text-white">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="mt-2.5 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
    </div>
  );
}

function InstallContent({
  showManualSteps,
  manualStepsRef,
  isManualStepsHighlighted,
}: {
  showManualSteps: boolean;
  manualStepsRef: RefObject<HTMLDivElement | null>;
  isManualStepsHighlighted: boolean;
}) {
  const {
    platform,
    manualSteps,
    isInstallAvailable,
  } = usePwaInstall();

  const platformDescription = useMemo(() => {
    if (platform === 'ios') {
      return 'Use Safari to add the app to your iPhone or iPad home screen.';
    }

    if (platform === 'android') {
      return isInstallAvailable
        ? 'Install directly from your browser for faster launch and a clean full-screen app view.'
        : 'If the browser does not show the install popup yet, use the browser menu to add the app.';
    }

    return isInstallAvailable
      ? 'Install the app from your browser so it opens like a normal desktop application.'
      : 'Use the browser install icon or menu to pin the app like a desktop application.';
  }, [isInstallAvailable, platform]);

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <BenefitCard
          title="Faster access"
          description="Open the app from your home screen or desktop in one tap."
          icon={Download}
        />
        <BenefitCard
          title="Full-screen view"
          description="Use the app in a cleaner layout without the browser bars."
          icon={MonitorSmartphone}
        />
        <BenefitCard
          title="Easy launch"
          description="Keep MSWDO pinned so staff and residents can open it quickly."
          icon={Home}
        />
      </div>

      <div className="rounded-[22px] border border-cyan-200 bg-cyan-50/70 px-4 py-3.5">
        <p className="text-sm font-semibold text-cyan-950">Download MSWDO App</p>
        <p className="mt-1.5 text-sm leading-5 text-slate-700">{platformDescription}</p>
        {!isInstallAvailable ? (
          <p className="mt-3 text-xs font-medium text-slate-500">
            Tap the Download App button below, then follow the install steps if your browser needs a manual install.
          </p>
        ) : null}
      </div>

      {!isInstallAvailable ? (
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3.5">
          <p className="text-sm font-semibold text-amber-950">Why the download does not open automatically</p>
          <p className="mt-1.5 text-sm leading-5 text-amber-900/80">
            This browser is not giving the app a one-click install prompt right now. Use the install steps below.
            {platform === 'desktop'
              ? ' If you want a one-click install button, open this site in Chrome or Edge.'
              : platform === 'ios'
                ? ' On iPhone or iPad, Safari requires Add to Home Screen.'
                : ' Some Android browsers also require the browser menu install option.'}
          </p>
        </div>
      ) : null}

      {showManualSteps ? (
        <div
          ref={manualStepsRef}
          className={`rounded-[22px] border bg-slate-50 px-4 py-3.5 transition ${isManualStepsHighlighted ? 'border-cyan-300 ring-4 ring-cyan-100' : 'border-slate-200'}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Install Steps</p>
          <div className="mt-3.5 space-y-2.5">
            {manualSteps.map((step, index) => (
              <div key={step} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-950">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function PwaInstallDialog() {
  const {
    platform,
    isInstalled,
    isDialogOpen,
    closeDialog,
    isInstallAvailable,
    isInstalling,
    install,
    installFeedbackStatus,
  } = usePwaInstall();
  const isMobile = useIsMobile();
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [isManualStepsHighlighted, setIsManualStepsHighlighted] = useState(false);
  const manualStepsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    setShowManualSteps(platform === 'ios' || !isInstallAvailable);
  }, [isDialogOpen, isInstallAvailable, platform]);

  useEffect(() => {
    if (!isDialogOpen || installFeedbackStatus !== 'manual_steps_required') {
      return;
    }

    revealManualSteps();
  }, [installFeedbackStatus, isDialogOpen]);

  function scrollToManualSteps() {
    requestAnimationFrame(() => {
      manualStepsRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }

  function revealManualSteps() {
    setShowManualSteps(true);
    setIsManualStepsHighlighted(true);
    scrollToManualSteps();
  }

  useEffect(() => {
    if (!isManualStepsHighlighted) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsManualStepsHighlighted(false);
    }, 1600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isManualStepsHighlighted]);

  const primaryActionLabel = isInstallAvailable
    ? 'Download App'
    : platform === 'ios'
      ? 'Show Safari Steps'
      : 'Show Install Steps';

  async function handleDownloadAction() {
    if (isInstallAvailable) {
      const outcome = await install();
      if (outcome === 'unavailable') {
        revealManualSteps();
      }
      return;
    }

    revealManualSteps();
  }

  if (isInstalled) {
    return null;
  }

  const content = (
    <InstallContent
      showManualSteps={showManualSteps}
      manualStepsRef={manualStepsRef}
      isManualStepsHighlighted={isManualStepsHighlighted}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DrawerContent className="max-h-[85vh] rounded-t-[30px] border-slate-200 bg-white px-0">
          <DrawerHeader className="px-5 pb-3 pt-4 text-left">
            <DrawerTitle className="text-xl font-black tracking-tight text-slate-950">
              Download MSWDO App
            </DrawerTitle>
            <DrawerDescription className="text-sm leading-6 text-slate-600">
              Install the app for faster opening, a home-screen icon, and a cleaner full-screen experience.
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 overflow-y-auto px-5 pb-2">
            {content}
            <PwaInstallStatusMessage />
          </div>

          <DrawerFooter className="border-t border-slate-200/70 bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
            <button
              type="button"
              onClick={() => { void handleDownloadAction(); }}
              disabled={isInstalling}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-cyan-950 px-4 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {getInstallActionLabel(installFeedbackStatus, primaryActionLabel)}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowManualSteps((current) => {
                  const next = !current;
                  if (!current) {
                    scrollToManualSteps();
                  }
                  return next;
                });
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Share2 className="h-4 w-4" />
              {showManualSteps ? 'Hide Install Steps' : 'Show Install Steps'}
            </button>
            <button
              type="button"
              onClick={closeDialog}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Close
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
      <DialogContent className="max-w-[700px] rounded-[30px] border-slate-200 bg-white p-0 shadow-[0_28px_80px_-38px_rgba(15,23,42,0.4)]">
        <div className="rounded-t-[30px] border-b border-slate-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,249,255,0.92))] px-6 py-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-black tracking-tight text-slate-950">
              Download MSWDO App
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Install the app for faster opening, a home-screen icon, and a cleaner full-screen experience.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          {content}
          <PwaInstallStatusMessage />
        </div>

        <DialogFooter className="border-t border-slate-200/70 bg-white px-6 py-4 sm:justify-between">
          <button
            type="button"
            onClick={closeDialog}
            className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setShowManualSteps((current) => {
                  const next = !current;
                  if (!current) {
                    scrollToManualSteps();
                  }
                  return next;
                });
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Share2 className="h-4 w-4" />
              {showManualSteps ? 'Hide Install Steps' : 'Show Install Steps'}
            </button>
            <button
              type="button"
              onClick={() => { void handleDownloadAction(); }}
              disabled={isInstalling}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-cyan-950 px-5 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {getInstallActionLabel(installFeedbackStatus, primaryActionLabel)}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

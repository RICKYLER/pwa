'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, MonitorSmartphone, Share2, X } from 'lucide-react';

const DISMISS_STORAGE_KEY = 'mswdo-install-prompt-dismissed-at';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type InstallPlatform = 'ios' | 'android' | 'desktop';

function getNavigatorWithStandalone() {
  return navigator as Navigator & { standalone?: boolean };
}

function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches
    || getNavigatorWithStandalone().standalone === true
  );
}

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') {
    return 'desktop';
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios';
  }

  if (/android/.test(userAgent)) {
    return 'android';
  }

  return 'desktop';
}

function shouldSuppressPrompt() {
  if (typeof window === 'undefined') {
    return true;
  }

  const rawValue = window.localStorage.getItem(DISMISS_STORAGE_KEY);
  const dismissedAt = rawValue ? Number(rawValue) : 0;
  if (!dismissedAt) {
    return false;
  }

  return Number.isFinite(dismissedAt) && (Date.now() - dismissedAt) < DISMISS_DURATION_MS;
}

function rememberDismissal() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
}

function clearDismissal() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(DISMISS_STORAGE_KEY);
}

export default function PwaInstallPrompt() {
  const [platform, setPlatform] = useState<InstallPlatform>('desktop');
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const nextPlatform = detectPlatform();
    setPlatform(nextPlatform);
    setIsInstalled(isStandaloneDisplayMode());
    setIsDismissed(shouldSuppressPrompt());

    const displayModeQuery = window.matchMedia('(display-mode: standalone)');

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      clearDismissal();
      setDeferredPrompt(null);
      setIsDismissed(true);
      setIsInstalled(true);
      setShowManualSteps(false);
    }

    function handleDisplayModeChange() {
      setIsInstalled(isStandaloneDisplayMode());
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    displayModeQuery.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      displayModeQuery.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const title = useMemo(() => {
    if (deferredPrompt) {
      return 'Install MSWDO Census';
    }

    if (platform === 'ios') {
      return 'Add To Home Screen';
    }

    return 'Install This App';
  }, [deferredPrompt, platform]);

  const description = useMemo(() => {
    if (deferredPrompt) {
      return 'Install the app for faster access, a cleaner full-screen view, and one-tap launch from the home screen.';
    }

    if (platform === 'ios') {
      return 'Safari on iPhone does not show the native install pop-up, but you can still add this app to your home screen in a few taps.';
    }

    if (platform === 'android') {
      return 'If your browser does not show the native install pop-up yet, you can still install it from the browser menu.';
    }

    return 'Install the app from your browser to open it like a normal desktop application.';
  }, [deferredPrompt, platform]);

  const manualSteps = useMemo(() => {
    if (platform === 'ios') {
      return [
        'Tap the Share button in Safari.',
        'Choose Add to Home Screen.',
        'Tap Add to finish installing.',
      ];
    }

    if (platform === 'android') {
      return [
        'Open the browser menu.',
        'Tap Install app or Add to Home screen.',
        'Confirm the install when prompted.',
      ];
    }

    return [
      'Open your browser menu or address bar install icon.',
      'Choose Install App.',
      'Confirm the install to pin it like a desktop app.',
    ];
  }, [platform]);

  const canShowManualHelp = platform === 'ios' || platform === 'android';
  const shouldShowPrompt = !isInstalled && !isDismissed && (Boolean(deferredPrompt) || canShowManualHelp);

  async function handleInstall() {
    if (!deferredPrompt) {
      setShowManualSteps((current) => !current);
      return;
    }

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (choice.outcome === 'accepted') {
        clearDismissal();
        setIsInstalled(true);
        setIsDismissed(true);
        return;
      }

      rememberDismissal();
      setIsDismissed(true);
    } finally {
      setIsInstalling(false);
    }
  }

  function handleDismiss() {
    rememberDismissal();
    setIsDismissed(true);
  }

  if (!shouldShowPrompt) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end p-4">
      <div
        className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-[28px] border border-indigo-200/70 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur"
        style={{ marginTop: 'max(env(safe-area-inset-top), 0px)' }}
      >
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white/15 p-2.5">
                <MonitorSmartphone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-sm text-indigo-100">
                  {description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-full p-1 text-indigo-100 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss install prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {showManualSteps && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Install Steps
              </p>
              <div className="mt-3 space-y-2">
                {manualSteps.map((step, index) => (
                  <div key={step} className="flex items-start gap-3 text-sm text-slate-700">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => { void handleInstall(); }}
              disabled={isInstalling}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deferredPrompt ? <Download className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {isInstalling
                ? 'Opening Install...'
                : deferredPrompt
                  ? 'Install App'
                  : showManualSteps
                    ? 'Hide Steps'
                    : 'How To Install'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

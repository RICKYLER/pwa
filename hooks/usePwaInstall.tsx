'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  BeforeInstallPromptEvent,
  detectInstallPlatform,
  getInstallManualSteps,
  isStandaloneDisplayMode,
  PWA_INSTALL_DISMISS_STORAGE_KEY,
  type InstallPlatform,
  shouldSuppressInstallPrompt,
} from '@/lib/pwa-install';

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

type PwaInstallContextValue = {
  platform: InstallPlatform;
  manualSteps: string[];
  isInstalled: boolean;
  isInstallAvailable: boolean;
  canManualInstall: boolean;
  isInstalling: boolean;
  isDialogOpen: boolean;
  showPrompt: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  dismissPrompt: () => void;
  install: () => Promise<InstallOutcome>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function getNavigatorWithStandalone() {
  return navigator as Navigator & { standalone?: boolean };
}

function readDismissedAt() {
  if (typeof window === 'undefined') {
    return 0;
  }

  return Number(window.localStorage.getItem(PWA_INSTALL_DISMISS_STORAGE_KEY) ?? 0);
}

function rememberDismissal() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PWA_INSTALL_DISMISS_STORAGE_KEY, String(Date.now()));
}

function clearDismissal() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(PWA_INSTALL_DISMISS_STORAGE_KEY);
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<InstallPlatform>('desktop');
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hasUsedInstallExperienceThisSession, setHasUsedInstallExperienceThisSession] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const displayModeQuery = window.matchMedia('(display-mode: standalone)');

    function resolveInstalledState() {
      return isStandaloneDisplayMode({
        mediaStandalone: displayModeQuery.matches,
        navigatorStandalone: getNavigatorWithStandalone().standalone === true,
      });
    }

    setPlatform(detectInstallPlatform(navigator.userAgent));
    setIsInstalled(resolveInstalledState());
    setIsDismissed(shouldSuppressInstallPrompt({ dismissedAt: readDismissedAt() }));

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      clearDismissal();
      setDeferredPrompt(null);
      setIsDismissed(true);
      setIsInstalled(true);
      setIsDialogOpen(false);
      setHasUsedInstallExperienceThisSession(true);
    }

    function handleDisplayModeChange() {
      setIsInstalled(resolveInstalledState());
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

  const isInstallAvailable = Boolean(deferredPrompt);
  const canManualInstall = true;
  const manualSteps = useMemo(() => getInstallManualSteps(platform), [platform]);

  const showPrompt = !isInstalled
    && !isDismissed
    && !hasUsedInstallExperienceThisSession
    && (isInstallAvailable || canManualInstall);

  function openDialog() {
    setHasUsedInstallExperienceThisSession(true);
    setIsDialogOpen(true);
  }

  function closeDialog() {
    setIsDialogOpen(false);
  }

  function dismissPrompt() {
    rememberDismissal();
    setIsDismissed(true);
    setIsDialogOpen(false);
  }

  async function install(): Promise<InstallOutcome> {
    setHasUsedInstallExperienceThisSession(true);

    if (!deferredPrompt) {
      setIsDialogOpen(true);
      return 'unavailable';
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
        setIsDialogOpen(false);
        return 'accepted';
      }

      rememberDismissal();
      setIsDismissed(true);
      return 'dismissed';
    } finally {
      setIsInstalling(false);
    }
  }

  const value = useMemo<PwaInstallContextValue>(() => ({
    platform,
    manualSteps,
    isInstalled,
    isInstallAvailable,
    canManualInstall,
    isInstalling,
    isDialogOpen,
    showPrompt,
    openDialog,
    closeDialog,
    dismissPrompt,
    install,
  }), [
    canManualInstall,
    isDialogOpen,
    isInstallAvailable,
    isInstalled,
    isInstalling,
    manualSteps,
    platform,
    showPrompt,
  ]);

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (!context) {
    throw new Error('usePwaInstall must be used within a PwaInstallProvider.');
  }

  return context;
}

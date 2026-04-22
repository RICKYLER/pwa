'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BeforeInstallPromptEvent,
  detectInstallPlatform,
  getInstallFeedbackMessage,
  getInstallFeedbackTone,
  getInstallManualSteps,
  type InstallFeedbackStatus,
  type InstallFeedbackTone,
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
  installFeedbackStatus: InstallFeedbackStatus;
  installFeedbackMessage: string;
  installFeedbackTone: InstallFeedbackTone;
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
  const [installFeedbackStatus, setInstallFeedbackStatus] = useState<InstallFeedbackStatus>('idle');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hasUsedInstallExperienceThisSession, setHasUsedInstallExperienceThisSession] = useState(false);
  const installStateTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  function clearInstallStateTimer() {
    if (installStateTimerRef.current) {
      window.clearTimeout(installStateTimerRef.current);
      installStateTimerRef.current = null;
    }
  }

  function clearFeedbackTimer() {
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }

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
      clearInstallStateTimer();
      clearFeedbackTimer();
      clearDismissal();
      setDeferredPrompt(null);
      setIsDismissed(true);
      setInstallFeedbackStatus('installed');
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
      clearInstallStateTimer();
      clearFeedbackTimer();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      displayModeQuery.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    if (installFeedbackStatus !== 'installed' && installFeedbackStatus !== 'dismissed') {
      clearFeedbackTimer();
      return;
    }

    clearFeedbackTimer();
    feedbackTimerRef.current = window.setTimeout(() => {
      setInstallFeedbackStatus('idle');
    }, 4500);

    return () => {
      clearFeedbackTimer();
    };
  }, [installFeedbackStatus]);

  const isInstallAvailable = Boolean(deferredPrompt);
  const canManualInstall = true;
  const manualSteps = useMemo(() => getInstallManualSteps(platform), [platform]);
  const installFeedbackMessage = useMemo(
    () => getInstallFeedbackMessage(installFeedbackStatus),
    [installFeedbackStatus],
  );
  const installFeedbackTone = useMemo(
    () => getInstallFeedbackTone(installFeedbackStatus),
    [installFeedbackStatus],
  );

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
    if (!isInstalling && installFeedbackStatus === 'manual_steps_required') {
      setInstallFeedbackStatus('idle');
    }
  }

  function dismissPrompt() {
    rememberDismissal();
    setIsDismissed(true);
    setIsDialogOpen(false);
  }

  async function install(): Promise<InstallOutcome> {
    setHasUsedInstallExperienceThisSession(true);

    if (!deferredPrompt) {
      setInstallFeedbackStatus('manual_steps_required');
      setIsDialogOpen(true);
      return 'unavailable';
    }

    clearInstallStateTimer();
    setIsInstalling(true);
    setInstallFeedbackStatus('opening_prompt');
    try {
      await deferredPrompt.prompt();
      setInstallFeedbackStatus('awaiting_browser_action');
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (choice.outcome === 'accepted') {
        clearDismissal();
        setInstallFeedbackStatus('installed');
        setIsDismissed(true);
        setIsDialogOpen(false);
        installStateTimerRef.current = window.setTimeout(() => {
          setIsInstalled(true);
        }, 1200);
        return 'accepted';
      }

      rememberDismissal();
      setInstallFeedbackStatus('dismissed');
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
    installFeedbackStatus,
    installFeedbackMessage,
    installFeedbackTone,
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
    installFeedbackMessage,
    installFeedbackStatus,
    installFeedbackTone,
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

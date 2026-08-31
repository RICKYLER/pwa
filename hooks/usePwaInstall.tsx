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
import { useToast } from '@/hooks/use-toast';

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

const INSTALL_PROMPT_OPEN_TIMEOUT_MS = 3500;
// How long to keep waiting for the browser's `beforeinstallprompt` event when
// the user taps Download before it has fired. Chrome fires it a beat after the
// page becomes installable, so this grace period turns "no prompt yet" into an
// instant install dialog on Chrome/Edge instead of a manual-steps dead end.
const INSTALL_PROMPT_WAIT_MS = 3500;
// Optional: when NEXT_PUBLIC_APK_URL is set, Android users get a direct APK
// download — press Download, the .apk file saves to the phone instantly, tap
// it to install. No browser install prompt, no manual steps. See APK_BUILD.md.
const APK_URL = process.env.NEXT_PUBLIC_APK_URL;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: number | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

type PwaInstallContextValue = {
  platform: InstallPlatform;
  apkUrl: string | undefined;
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
  const { toast } = useToast();
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
  const pendingInstallPromptWaitRef = useRef<{
    resolve: (promptEvent: BeforeInstallPromptEvent) => void;
    reject: (error: Error) => void;
  } | null>(null);

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
      const promptEvent = event as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      // If the user already tapped Download and is waiting on the grace
      // period, hand the freshly-arrived prompt straight over so the browser
      // install dialog opens the moment the event lands.
      pendingInstallPromptWaitRef.current?.resolve(promptEvent);
    }

    function handleInstalled() {
      clearInstallStateTimer();
      clearFeedbackTimer();
      clearDismissal();
      setDeferredPrompt(null);
      setIsDismissed(true);
      setInstallFeedbackStatus('installed');
      setIsInstalled(true);
      // Keep the install dialog open so its success screen can animate and
      // confirm the download before closing itself. Every entry point also
      // gets a toast so users never wonder whether the app was installed.
      toast({
        title: 'App installed',
        description: 'E-Mabini is now on your home screen. You can open it anytime.',
      });
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
      pendingInstallPromptWaitRef.current = null;
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
  const apkUrl = platform === 'android' ? (APK_URL || undefined) : undefined;
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

  function waitForInstallPrompt(timeoutMs: number): Promise<BeforeInstallPromptEvent> {
    return new Promise<BeforeInstallPromptEvent>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (pendingInstallPromptWaitRef.current) {
          pendingInstallPromptWaitRef.current = null;
        }
        reject(new Error('The browser did not provide an install prompt.'));
      }, timeoutMs);

      pendingInstallPromptWaitRef.current = {
        resolve: (promptEvent) => {
          window.clearTimeout(timeoutId);
          pendingInstallPromptWaitRef.current = null;
          resolve(promptEvent);
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          pendingInstallPromptWaitRef.current = null;
          reject(error);
        },
      };
    });
  }

  async function install(): Promise<InstallOutcome> {
    setHasUsedInstallExperienceThisSession(true);
    clearInstallStateTimer();
    setIsInstalling(true);

    try {
      let prompt = deferredPrompt;

      // The browser fires `beforeinstallprompt` a beat after the page becomes
      // installable (service worker activation, installability heuristics). If
      // the user taps Download before it arrives, wait the short grace period
      // for it so Chrome/Edge opens the install dialog right away — instead of
      // dropping the user straight into manual steps. iOS never fires it, so
      // skip straight to the Safari steps there.
      if (!prompt && platform !== 'ios') {
        setInstallFeedbackStatus('opening_prompt');
        prompt = await waitForInstallPrompt(INSTALL_PROMPT_WAIT_MS);
      }

      if (!prompt) {
        setInstallFeedbackStatus('manual_steps_required');
        setIsDialogOpen(true);
        return 'unavailable';
      }

      setDeferredPrompt(null);
      setInstallFeedbackStatus('awaiting_browser_action');

      await withTimeout(
        Promise.resolve(prompt.prompt()),
        INSTALL_PROMPT_OPEN_TIMEOUT_MS,
        'The browser did not open the install prompt.',
      );

      setInstallFeedbackStatus('awaiting_browser_action');
      const choice = await prompt.userChoice;

      if (choice.outcome === 'accepted') {
        clearDismissal();
        setIsDismissed(true);
        setInstallFeedbackStatus('installed');
        setIsInstalled(true);
        // Keep the dialog open so its success screen can animate before the
        // dialog auto-closes. The `appinstalled` handler does the same.
        return 'accepted';
      }

      rememberDismissal();
      setInstallFeedbackStatus('dismissed');
      setIsDismissed(true);
      return 'dismissed';
    } catch {
      setInstallFeedbackStatus('manual_steps_required');
      setIsDialogOpen(true);
      return 'unavailable';
    } finally {
      setIsInstalling(false);
    }
  }

  const value = useMemo<PwaInstallContextValue>(() => ({
    platform,
    apkUrl,
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
    apkUrl,
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

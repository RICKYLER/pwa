export const PWA_INSTALL_DISMISS_STORAGE_KEY = 'mswdo-install-prompt-dismissed-at';
export const PWA_INSTALL_DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export function detectInstallPlatform(userAgent: string | null | undefined): InstallPlatform {
  const normalizedUserAgent = (userAgent ?? '').toLowerCase();

  if (/iphone|ipad|ipod/.test(normalizedUserAgent)) {
    return 'ios';
  }

  if (/android/.test(normalizedUserAgent)) {
    return 'android';
  }

  return 'desktop';
}

export function isStandaloneDisplayMode(options: {
  mediaStandalone: boolean;
  navigatorStandalone: boolean;
}) {
  return options.mediaStandalone || options.navigatorStandalone;
}

export function shouldSuppressInstallPrompt(options: {
  dismissedAt?: number | null;
  now?: number;
  durationMs?: number;
}) {
  const dismissedAt = Number(options.dismissedAt ?? 0);
  if (!dismissedAt || !Number.isFinite(dismissedAt)) {
    return false;
  }

  const now = options.now ?? Date.now();
  const durationMs = options.durationMs ?? PWA_INSTALL_DISMISS_DURATION_MS;

  return (now - dismissedAt) < durationMs;
}

export function getInstallManualSteps(platform: InstallPlatform) {
  if (platform === 'ios') {
    return [
      'Open this app in Safari.',
      'Tap the Share button.',
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
    'Open your browser menu or address-bar install icon.',
    'Choose Install App.',
    'Confirm the install to pin it like a desktop app.',
  ];
}

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
export type InstallFeedbackStatus =
  | 'idle'
  | 'opening_prompt'
  | 'awaiting_browser_action'
  | 'manual_steps_required'
  | 'installed'
  | 'dismissed';
export type InstallFeedbackTone = 'info' | 'warning' | 'success';

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

export function getInstallFeedbackMessage(status: InstallFeedbackStatus) {
  switch (status) {
    case 'opening_prompt':
      return 'Opening the browser install prompt...';
    case 'awaiting_browser_action':
      return 'Check your browser prompt to continue installation.';
    case 'manual_steps_required':
      return 'No install prompt appeared. Follow the install steps below.';
    case 'installed':
      return 'App installed successfully.';
    case 'dismissed':
      return 'Installation was not completed yet. You can try again anytime.';
    default:
      return '';
  }
}

export function getInstallFeedbackTone(status: InstallFeedbackStatus): InstallFeedbackTone {
  switch (status) {
    case 'installed':
      return 'success';
    case 'manual_steps_required':
    case 'dismissed':
      return 'warning';
    default:
      return 'info';
  }
}

export function getInstallActionLabel(status: InstallFeedbackStatus, defaultLabel: string) {
  switch (status) {
    case 'opening_prompt':
      return 'Opening install prompt...';
    case 'awaiting_browser_action':
      return 'Waiting for browser prompt...';
    default:
      return defaultLabel;
  }
}

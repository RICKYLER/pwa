import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectInstallPlatform,
  getInstallManualSteps,
  isStandaloneDisplayMode,
  shouldSuppressInstallPrompt,
} from '../lib/pwa-install';

test('detectInstallPlatform distinguishes ios android and desktop user agents', () => {
  assert.equal(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'android');
  assert.equal(detectInstallPlatform('Mozilla/5.0 (X11; Linux x86_64)'), 'desktop');
});

test('shouldSuppressInstallPrompt respects the dismissal cooldown', () => {
  const now = Date.UTC(2026, 3, 7, 12, 0, 0);

  assert.equal(shouldSuppressInstallPrompt({ dismissedAt: now - 1_000, now }), true);
  assert.equal(
    shouldSuppressInstallPrompt({ dismissedAt: now - (8 * 24 * 60 * 60 * 1000), now }),
    false,
  );
  assert.equal(shouldSuppressInstallPrompt({ dismissedAt: 0, now }), false);
});

test('getInstallManualSteps provides platform-specific instructions', () => {
  assert.equal(getInstallManualSteps('ios')[1], 'Tap the Share button.');
  assert.equal(getInstallManualSteps('android')[1], 'Tap Install app or Add to Home screen.');
  assert.equal(getInstallManualSteps('desktop')[0], 'Open your browser menu or address-bar install icon.');
});

test('isStandaloneDisplayMode is true when either standalone signal is active', () => {
  assert.equal(isStandaloneDisplayMode({ mediaStandalone: true, navigatorStandalone: false }), true);
  assert.equal(isStandaloneDisplayMode({ mediaStandalone: false, navigatorStandalone: true }), true);
  assert.equal(isStandaloneDisplayMode({ mediaStandalone: false, navigatorStandalone: false }), false);
});

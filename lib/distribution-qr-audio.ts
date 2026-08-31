'use client';

/**
 * Short audio confirmation for a successful QR redemption. The distribution
 * venue is noisy and a phone in a pocket cannot be felt, so a small beep gives
 * staff feedback without looking at the screen. Best-effort only: audio is
 * feature-detected, failures are swallowed, and the context is reused after the
 * first success (autoplay policy means the context usually becomes runnable
 * after the staff member's "Open Camera" click).
 */

let audioContext: AudioContext | null = null;
let beepEnabled = true;

export function setQrBeepEnabled(enabled: boolean) {
  beepEnabled = enabled;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!audioContext) {
    const AudioContextCtor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    try {
      audioContext = new AudioContextCtor();
    } catch {
      return null;
    }
  }

  return audioContext;
}

export function playQrSuccessBeep(): void {
  if (!beepEnabled) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }

  try {
    if (context.state === 'suspended') {
      void context.resume().catch(() => {});
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
  } catch {
    // Audio must never break the scan flow.
  }
}

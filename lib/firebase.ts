// lib/firebase.ts
// Initializes Firebase exactly once.
// App Check + reCAPTCHA Enterprise protects every Google Maps API request
// by requiring a valid attestation token — following the guide at
// https://developers.google.com/maps/documentation/javascript/maps-app-check

import { initializeApp, getApps, getApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function inferProjectId(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;

  const match = normalized.match(
    /^([a-z0-9-]+)\.(?:firebaseapp\.com|firebasestorage\.app|appspot\.com|web\.app)$/i,
  );

  return match?.[1] ?? null;
}

const hasCompleteFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
].every((value) => Boolean(value?.trim()));

const inferredProjectId =
  inferProjectId(firebaseConfig.authDomain) ?? inferProjectId(firebaseConfig.storageBucket);

const hasConsistentProjectId =
  !firebaseConfig.projectId || !inferredProjectId || firebaseConfig.projectId === inferredProjectId;

// Re-use an existing Firebase app instance on hot-reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ── App Check ─────────────────────────────────────────────────────────────────
// Keep the cached instance loosely typed so this module has no static dependency
// on `firebase/app-check`, which makes Turbopack HMR more stable.
type AppCheckHandle = object;

let appCheck: AppCheckHandle | null = null;
let appCheckPromise: Promise<AppCheckHandle | null> | null = null;

async function ensureAppCheck(): Promise<AppCheckHandle | null> {
  if (appCheck) return appCheck;
  if (appCheckPromise) return appCheckPromise;

  appCheckPromise = (async () => {
    if (typeof window === 'undefined') return null;

    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ?? '';

    if (!siteKey) {
      console.warn('Firebase App Check is disabled because NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing.');
      return null;
    }

    if (!hasCompleteFirebaseConfig) {
      console.warn('Firebase App Check is disabled because the Firebase public config is incomplete.');
      return null;
    }

    if (!hasConsistentProjectId) {
      console.warn(
        `Firebase App Check is disabled because NEXT_PUBLIC_FIREBASE_PROJECT_ID="${firebaseConfig.projectId}" does not match "${inferredProjectId}" inferred from the Firebase domain.`,
      );
      return null;
    }

    if (process.env.NODE_ENV === 'development') {
      // This debug token is registered in Firebase Console under
      // App Check → Apps → MSWDO → Manage debug tokens.
      // It lets localhost pass App Check without real reCAPTCHA attestation.
      // @ts-expect-error — this global is intentionally undocumented
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = '44CFD672-B2EE-40FB-95EC-299BE17C3BD2';
    }

    try {
      const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');

      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        // Automatically refreshes the token before it expires
        isTokenAutoRefreshEnabled: true,
      });

      return appCheck;
    } catch (error) {
      console.warn('Firebase App Check failed to initialize:', error);
      return null;
    }
  })();

  const resolvedAppCheck = await appCheckPromise;
  if (!resolvedAppCheck) {
    appCheckPromise = null;
  }

  return resolvedAppCheck;
}

// Expose a helper so GoogleMapsProvider can attach the token to Maps requests
async function getAppCheckToken(): Promise<{ token: string } | null> {
  const activeAppCheck = await ensureAppCheck();
  if (!activeAppCheck) return null;

  try {
    const { getToken } = await import('firebase/app-check');
    return await getToken(activeAppCheck as never, /* forceRefresh= */ false);
  } catch {
    return null;
  }
}

export { app, getAppCheckToken };

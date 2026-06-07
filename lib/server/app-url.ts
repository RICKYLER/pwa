function normalizeOrigin(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).origin;
    }

    return new URL(`https://${trimmed}`).origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string | null) {
  if (!origin) return false;

  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isNonLocalRequestOrigin(origin: string | null) {
  return Boolean(origin && !isLocalOrigin(origin));
}

export function resolveAppUrl(requestUrl?: string) {
  const configuredOrigin = normalizeOrigin(process.env.APP_URL) ?? normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const requestOrigin = normalizeOrigin(requestUrl);
  const vercelOrigin =
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    ?? normalizeOrigin(process.env.VERCEL_BRANCH_URL)
    ?? normalizeOrigin(process.env.VERCEL_URL);

  if (process.env.NODE_ENV === 'production') {
    if (configuredOrigin && !isLocalOrigin(configuredOrigin)) {
      return configuredOrigin;
    }

    return vercelOrigin ?? requestOrigin ?? configuredOrigin ?? 'http://localhost:3000';
  }

  if (isLocalOrigin(configuredOrigin) && isNonLocalRequestOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return configuredOrigin ?? requestOrigin ?? vercelOrigin ?? 'http://localhost:3000';
}

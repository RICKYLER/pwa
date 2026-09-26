/**
 * Cloudflare API integration — Free Plan
 *
 * Covers: CDN cache purging, Zone analytics reading, WAF/Security
 * settings read, and zone-level configuration.
 *
 * Requires env vars:
 *   CLOUDFLARE_API_TOKEN   — scoped to: Zone:Cache Rules:Edit,
 *                             Zone:WAF:Edit, Zone:Zone Settings:Read,
 *                             Zone:Analytics:Read
 *   CLOUDFLARE_ZONE_ID     — from Cloudflare dashboard → your domain → "Zone ID"
 *   CLOUDFLARE_ACCOUNT_ID  — from Cloudflare dashboard → top-right account menu
 *
 * ⚠️  These are SERVER-ONLY env vars. Never expose them to the browser.
 *     CLOUDFLARE_API_TOKEN does NOT have the NEXT_PUBLIC_ prefix.
 */

const CF_BASE = 'https://api.cloudflare.com/client/v4';

function getCfConfig() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

  if (!token || !zoneId || !accountId) {
    throw new Error(
      '[Cloudflare] Missing required env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, CLOUDFLARE_ACCOUNT_ID',
    );
  }

  return { token, zoneId, accountId };
}

function cfHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Generic Cloudflare API request wrapper */
async function cfRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<{ success: boolean; result: T; errors: { message: string }[] }> {
  const { token } = getCfConfig();
  const response = await fetch(`${CF_BASE}${path}`, {
    ...options,
    headers: {
      ...cfHeaders(token),
      ...(options.headers ?? {}),
    },
  });

  const json = await response.json() as {
    success: boolean;
    result: T;
    errors: { message: string }[];
  };

  if (!json.success) {
    const errorMsg = json.errors?.[0]?.message ?? 'Unknown Cloudflare API error';
    throw new Error(`[Cloudflare API] ${errorMsg}`);
  }

  return json;
}

// =============================================================================
// CDN — Cache Purging
// =============================================================================

/**
 * Purge specific URLs from Cloudflare's CDN cache.
 * Call this after you update public static content.
 *
 * @example
 * await purgeCloudflareCacheByUrls([
 *   'https://yourdomain.com/manifest.json',
 *   'https://yourdomain.com/sw.js',
 * ]);
 */
export async function purgeCloudflareCacheByUrls(urls: string[]): Promise<void> {
  const { zoneId } = getCfConfig();

  await cfRequest(`/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    body: JSON.stringify({ files: urls }),
  });

  console.info(`[Cloudflare] Purged ${urls.length} URL(s) from CDN cache.`);
}

/**
 * Purge ALL cached content from Cloudflare CDN for your zone.
 * Use with caution — this forces all visitors to re-fetch everything.
 * Useful after a major deployment.
 */
export async function purgeAllCloudflareCache(): Promise<void> {
  const { zoneId } = getCfConfig();

  await cfRequest(`/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    body: JSON.stringify({ purge_everything: true }),
  });

  console.info('[Cloudflare] Purged ALL CDN cache for zone.');
}

// =============================================================================
// Zone Info & Security Level
// =============================================================================

/** Get basic zone info (plan, status, name). */
export async function getCloudflareZoneInfo(): Promise<{
  id: string;
  name: string;
  status: string;
  plan: { name: string };
}> {
  const { zoneId } = getCfConfig();
  const { result } = await cfRequest<{
    id: string;
    name: string;
    status: string;
    plan: { name: string };
  }>(`/zones/${zoneId}`);
  return result;
}

/**
 * Get current security level for your zone.
 * Possible values: 'off', 'essentially_off', 'low', 'medium', 'high', 'under_attack'
 */
export async function getCloudflareSecurityLevel(): Promise<string> {
  const { zoneId } = getCfConfig();
  const { result } = await cfRequest<{ value: string }>(
    `/zones/${zoneId}/settings/security_level`,
  );
  return result.value;
}

/**
 * Set the security level for your zone.
 *
 * Recommended values:
 *   'medium'       — Normal operation (default)
 *   'high'         — More aggressive bot/threat detection
 *   'under_attack' — Emergency: 5-second challenge on ALL visitors
 *
 * ⚠️  'under_attack' will affect legitimate users too. Use only during an
 *     active DDoS attack.
 */
export async function setCloudflareSecurityLevel(
  level: 'off' | 'essentially_off' | 'low' | 'medium' | 'high' | 'under_attack',
): Promise<void> {
  const { zoneId } = getCfConfig();

  await cfRequest(`/zones/${zoneId}/settings/security_level`, {
    method: 'PATCH',
    body: JSON.stringify({ value: level }),
  });

  console.info(`[Cloudflare] Security level set to: ${level}`);
}

// =============================================================================
// SSL / HTTPS
// =============================================================================

/** Get current SSL/TLS mode. Recommended: 'full_strict' */
export async function getCloudflareSSLMode(): Promise<string> {
  const { zoneId } = getCfConfig();
  const { result } = await cfRequest<{ value: string }>(
    `/zones/${zoneId}/settings/ssl`,
  );
  return result.value;
}

// =============================================================================
// Analytics — Request/Threat stats (Free plan)
// =============================================================================

/**
 * Get basic zone analytics for the last N hours.
 * Returns total requests, threats blocked, cached requests.
 *
 * Note: On Free plan, data granularity is limited to last 24h.
 */
export async function getCloudflareAnalytics(sinceHours: number = 24): Promise<{
  requests: { all: number; cached: number; uncached: number };
  threats: number;
  pageviews: { all: number };
  bandwidth: { all: number; cached: number };
}> {
  const { zoneId } = getCfConfig();
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
  const until = new Date().toISOString();

  const { result } = await cfRequest<{
    totals: {
      requests: { all: number; cached: number; uncached: number };
      threats: { all: number };
      pageviews: { all: number };
      bandwidth: { all: number; cached: number };
    };
  }>(`/zones/${zoneId}/analytics/dashboard?since=${since}&until=${until}&continuous=false`);

  return {
    requests: result.totals.requests,
    threats: result.totals.threats.all,
    pageviews: result.totals.pageviews,
    bandwidth: result.totals.bandwidth,
  };
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Verify that the Cloudflare API token is working.
 * Returns token status and permissions summary.
 */
export async function verifyCloudflareToken(): Promise<{ valid: boolean; status: string }> {
  try {
    const response = await fetch(`${CF_BASE}/user/tokens/verify`, {
      headers: cfHeaders(getCfConfig().token),
    });
    const json = await response.json() as { success: boolean; result: { status: string } };
    return {
      valid: json.success,
      status: json.result?.status ?? 'unknown',
    };
  } catch {
    return { valid: false, status: 'error' };
  }
}

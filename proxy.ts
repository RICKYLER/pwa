/**
 * Next.js Edge Middleware — Cloudflare-aware Security Layer
 *
 * This middleware runs on EVERY request before it reaches your API routes or
 * pages. It uses Cloudflare's forwarded headers to:
 *
 *   1. Read the real visitor IP (CF-Connecting-IP) — not the Cloudflare proxy IP
 *   2. Rate-limit brute-force attempts on /api/auth/* routes
 *   3. Block requests flagged by Cloudflare as threats (CF-Threat-Score header)
 *   4. Add security response headers on all responses
 *
 * When your DNS is proxied through Cloudflare (orange cloud ☁️), Cloudflare
 * automatically adds these headers to every request before it reaches Vercel/
 * your server:
 *
 *   CF-Connecting-IP   — the visitor's real IP address
 *   CF-Ray             — unique request ID for Cloudflare support
 *   CF-IPCountry       — ISO country code of the visitor
 *   CF-Threat-Score    — 0–100 threat score (0 = clean, 100 = very bad)
 *   X-Forwarded-For    — proxy chain (less reliable, use CF-Connecting-IP)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Rate limiting map (in-memory, per Edge runtime instance)
 * ─────────────────────────────────────────────────────────────────────────────
 * Note: This is lightweight in-memory rate limiting. For production at scale,
 * replace with Cloudflare's own Rate Limiting (Free plan: basic rules) or
 * Upstash Redis. For a capstone/student project this is plenty.
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Max login/register attempts per IP in the window below. */
const AUTH_MAX_ATTEMPTS = 10;

/** Window duration in milliseconds (5 minutes). */
const AUTH_WINDOW_MS = 5 * 60 * 1000;

/**
 * Cloudflare threat score threshold.
 * Requests with CF-Threat-Score >= this value are blocked.
 * Range: 0 (clean) — 100 (high threat). 25 is a safe default.
 */
const CF_THREAT_SCORE_BLOCK_THRESHOLD = 25;

// ---------------------------------------------------------------------------
// In-memory rate limit store
// ---------------------------------------------------------------------------
// Map<ip, { count: number; resetAt: number }>
const authRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkAuthRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = authRateLimit.get(ip);

  // First request or window expired → fresh entry
  if (!entry || now >= entry.resetAt) {
    authRateLimit.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return { allowed: true, remaining: AUTH_MAX_ATTEMPTS - 1, resetAt: now + AUTH_WINDOW_MS };
  }

  // Increment
  entry.count += 1;
  authRateLimit.set(ip, entry);

  return {
    allowed: entry.count <= AUTH_MAX_ATTEMPTS,
    remaining: Math.max(0, AUTH_MAX_ATTEMPTS - entry.count),
    resetAt: entry.resetAt,
  };
}

// Periodically clean up expired entries to prevent memory leaks
// (Runs at most once per request in the same edge instance)
let lastCleanup = 0;
function maybeCleanupRateLimitStore() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // only every 60s
  lastCleanup = now;
  for (const [ip, entry] of authRateLimit.entries()) {
    if (now >= entry.resetAt) authRateLimit.delete(ip);
  }
}

// ---------------------------------------------------------------------------
// Cloudflare header helpers
// ---------------------------------------------------------------------------

/**
 * Get the real visitor IP from Cloudflare's CF-Connecting-IP header.
 * Falls back to X-Forwarded-For, then X-Real-IP.
 *
 * CF-Connecting-IP is the most reliable when proxied through Cloudflare.
 */
function getVisitorIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

/**
 * Get Cloudflare threat score for this request (0–100).
 * Returns 0 (clean) if the header is absent (i.e. not behind Cloudflare).
 */
function getCfThreatScore(request: NextRequest): number {
  const raw = request.headers.get('cf-threat-score');
  if (!raw) return 0;
  const score = parseInt(raw, 10);
  return isNaN(score) ? 0 : score;
}

/**
 * Get visitor country from Cloudflare.
 * Returns 'XX' if not behind Cloudflare.
 */
function getCfCountry(request: NextRequest): string {
  return request.headers.get('cf-ipcountry') ?? 'XX';
}

// ---------------------------------------------------------------------------
// Security response headers (added to every response)
// ---------------------------------------------------------------------------
const SECURITY_HEADERS: Record<string, string> = {
  // Prevent clickjacking
  'X-Frame-Options': 'SAMEORIGIN',
  // Disable MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  // Enable XSS filter in older browsers
  'X-XSS-Protection': '1; mode=block',
  // Only send referrer on same origin
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Control which browser features are allowed
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  // Force HTTPS for 1 year (only meaningful if behind HTTPS — which Cloudflare enforces)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

// ---------------------------------------------------------------------------
// Proxy (Next.js 16+ convention, replaces middleware)
// ---------------------------------------------------------------------------

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  maybeCleanupRateLimitStore();

  const ip = getVisitorIp(request);
  const cfThreatScore = getCfThreatScore(request);
  const cfCountry = getCfCountry(request);
  const cfRay = request.headers.get('cf-ray') ?? 'no-cf-ray';

  // ── 1. Block high-threat-score requests ──────────────────────────────────
  // Only applies when behind Cloudflare (CF-Threat-Score header exists).
  // The Free Managed WAF already blocks the worst threats; this is a backup.
  if (
    cfThreatScore >= CF_THREAT_SCORE_BLOCK_THRESHOLD &&
    request.headers.has('cf-threat-score') // only if Cloudflare is in front
  ) {
    console.warn(
      `[Cloudflare] Blocked high-threat request | ip=${ip} score=${cfThreatScore} country=${cfCountry} ray=${cfRay} path=${pathname}`,
    );
    return addSecurityHeaders(
      new NextResponse('Forbidden', { status: 403 }),
    );
  }

  // ── 2. Rate limit auth endpoints ─────────────────────────────────────────
  const isAuthMutation = (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/register' ||
    pathname === '/api/auth/forgot-password' ||
    pathname === '/api/auth/resend-verification'
  ) && request.method === 'POST';

  if (isAuthMutation) {
    const rateLimit = checkAuthRateLimit(ip);

    if (!rateLimit.allowed) {
      const retryAfterSec = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      console.warn(
        `[RateLimit] Too many auth attempts | ip=${ip} country=${cfCountry} path=${pathname}`,
      );

      const response = NextResponse.json(
        {
          error: 'Too many attempts. Please wait before trying again.',
          retryAfterSeconds: retryAfterSec,
        },
        { status: 429 },
      );
      response.headers.set('Retry-After', String(retryAfterSec));
      response.headers.set('X-RateLimit-Limit', String(AUTH_MAX_ATTEMPTS));
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetAt / 1000)));
      return addSecurityHeaders(response);
    }
  }

  // ── 3. Continue to the route and add security headers ────────────────────
  const response = NextResponse.next();

  // Forward real IP to your API routes via a custom header
  response.headers.set('x-real-ip', ip);
  response.headers.set('x-cf-country', cfCountry);

  return addSecurityHeaders(response);
}

// ---------------------------------------------------------------------------
// Route matcher — apply middleware to API routes and all pages
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - _next/static (static files)
     *   - _next/image (image optimization)
     *   - favicon.ico
     *   - public assets (icons, images, sw.js, manifest.json)
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|images/|sw.js|manifest.json).*)',
  ],
};

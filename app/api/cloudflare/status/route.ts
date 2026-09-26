/**
 * GET /api/cloudflare/status
 *
 * Admin-only endpoint. Returns live Cloudflare zone info:
 *   - Token validity
 *   - Zone plan & status
 *   - Current security level
 *   - SSL mode
 *   - 24h analytics summary (requests, threats blocked, bandwidth)
 *
 * Protected: requireAdminUser
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/server/auth-guards';
import {
  verifyCloudflareToken,
  getCloudflareZoneInfo,
  getCloudflareSecurityLevel,
  getCloudflareSSLMode,
  getCloudflareAnalytics,
} from '@/lib/server/cloudflare';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireAdminUser(request);
  if ('response' in guard) {
    return guard.response;
  }

  // Check if Cloudflare is configured at all
  const isConfigured =
    Boolean(process.env.CLOUDFLARE_API_TOKEN) &&
    Boolean(process.env.CLOUDFLARE_ZONE_ID) &&
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);

  if (!isConfigured) {
    return NextResponse.json({
      configured: false,
      message:
        'Cloudflare is not configured. Add CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, and CLOUDFLARE_ACCOUNT_ID to your environment variables.',
    });
  }

  try {
    const [tokenStatus, zoneInfo, securityLevel, sslMode, analytics] = await Promise.allSettled([
      verifyCloudflareToken(),
      getCloudflareZoneInfo(),
      getCloudflareSecurityLevel(),
      getCloudflareSSLMode(),
      getCloudflareAnalytics(24),
    ]);

    return NextResponse.json({
      configured: true,
      token: tokenStatus.status === 'fulfilled' ? tokenStatus.value : { valid: false, status: 'error' },
      zone: zoneInfo.status === 'fulfilled' ? zoneInfo.value : null,
      security_level: securityLevel.status === 'fulfilled' ? securityLevel.value : null,
      ssl_mode: sslMode.status === 'fulfilled' ? sslMode.value : null,
      analytics_24h: analytics.status === 'fulfilled' ? analytics.value : null,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cloudflare status check failed.' },
      { status: 500 },
    );
  }
}

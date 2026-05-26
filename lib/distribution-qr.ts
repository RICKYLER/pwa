export const DISTRIBUTION_QR_QUERY_PARAM = 'qr';
export const DISTRIBUTION_QR_PURPOSE = 'distribution-household-claim';

export type DistributionQrClaims = {
  purpose: typeof DISTRIBUTION_QR_PURPOSE;
  eventId: string;
  householdId: string;
  userId: string;
  scope: 'household';
  exp: number;
};

export function buildDistributionQrDeepLink(
  baseUrl: string,
  eventId: string,
  token: string,
) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = new URL(`${normalizedBaseUrl}/distribution/${encodeURIComponent(eventId)}`);
  url.searchParams.set(DISTRIBUTION_QR_QUERY_PARAM, token);
  return url.toString();
}

export function extractDistributionQrToken(
  value: string,
  currentEventId?: string,
): { token: string; eventId?: string } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, 'https://mswdo.local');
    const token = parsed.searchParams.get(DISTRIBUTION_QR_QUERY_PARAM)?.trim();
    const match = parsed.pathname.match(/^\/distribution\/([^/?#]+)/i);
    const eventId = match ? decodeURIComponent(match[1]) : undefined;

    if (token) {
      if (currentEventId && eventId && currentEventId !== eventId) {
        return null;
      }

      return {
        token,
        eventId,
      };
    }
  } catch {
    // Fall through to raw token handling.
  }

  return {
    token: trimmed,
    eventId: currentEventId,
  };
}

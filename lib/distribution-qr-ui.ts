/**
 * Client-safe formatting for distribution QR scan failures. Kept pure and
 * framework-free so it can be unit tested with `node --test`.
 */

export const QR_NETWORK_FAILURE_MESSAGE =
  'No internet connection at the venue. Use the search list below to release the package manually.';

/**
 * Turns a thrown error from the QR resolve request into a staff-friendly
 * message. The most common failure on distribution day is a dead connection at
 * the venue — `fetch` rejects with a generic `TypeError`, which we translate
 * into an actionable hint pointing at the manual release list.
 */
export function describeDistributionQrFailure(error: unknown): string {
  if (error instanceof TypeError && /fetch|network|load|connect/i.test(error.message)) {
    return QR_NETWORK_FAILURE_MESSAGE;
  }

  return error instanceof Error
    ? error.message
    : 'Unable to process the household QR code.';
}

export function isDistributionQrNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && /fetch|network|load|connect/i.test(error.message);
}

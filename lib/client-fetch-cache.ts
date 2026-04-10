'use client';

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

function readCachedValue<T>(key: string, now: number) {
  const entry = responseCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= now) {
    responseCache.delete(key);
    return null;
  }

  return entry.payload as T;
}

export async function fetchJsonWithCache<T>(
  url: string,
  options?: {
    signal?: AbortSignal;
    ttlMs?: number;
  },
) {
  const ttlMs = options?.ttlMs ?? 5 * 60 * 1000;
  const now = Date.now();
  const cached = readCachedValue<T>(url, now);
  if (cached !== null) {
    return cached;
  }

  const inflight = inflightRequests.get(url);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const request = fetch(url, {
    signal: options?.signal,
  })
    .then(async (response) => {
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`,
        );
      }

      responseCache.set(url, {
        expiresAt: now + ttlMs,
        payload,
      });

      return payload as T;
    })
    .finally(() => {
      inflightRequests.delete(url);
    });

  inflightRequests.set(url, request);
  return request;
}

export function clearCachedJson(url: string) {
  responseCache.delete(url);
}

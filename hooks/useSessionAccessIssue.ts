'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from '@/lib/db/schema';

export type SessionAccessIssue = 'account-removed' | 'account-deactivated' | 'access-updated' | null;

type SessionPayload = {
  user?: {
    id?: string;
    role?: string;
  } | null;
  reason?: 'account-removed' | 'account-deactivated' | null;
};

export function useSessionAccessIssue(user: User | null | undefined, enabled = true): SessionAccessIssue {
  const [accessIssue, setAccessIssue] = useState<SessionAccessIssue>(null);
  const inFlightRef = useRef(false);
  const lastCheckedAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !user) {
      return;
    }

    const currentUser = user;
    let cancelled = false;

    async function validateSession() {
      if (cancelled || inFlightRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastCheckedAtRef.current < 1_500) {
        return;
      }

      inFlightRef.current = true;
      lastCheckedAtRef.current = now;

      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json() as SessionPayload;
        if (cancelled) {
          return;
        }

        if (!payload.user) {
          setAccessIssue(payload.reason === 'account-deactivated' ? 'account-deactivated' : 'account-removed');
          return;
        }

        if (payload.user.id !== currentUser.id || payload.user.role !== currentUser.role) {
          setAccessIssue('access-updated');
        }
      } catch {
        // Ignore transient network failures and keep the current UI state.
      } finally {
        inFlightRef.current = false;
      }
    }

    void validateSession();
    const intervalId = window.setInterval(() => {
      void validateSession();
    }, 30_000);

    const handleAttentionEvent = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void validateSession();
    };

    window.addEventListener('focus', handleAttentionEvent);
    document.addEventListener('visibilitychange', handleAttentionEvent);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleAttentionEvent);
      document.removeEventListener('visibilitychange', handleAttentionEvent);
    };
  }, [enabled, user]);

  return accessIssue;
}

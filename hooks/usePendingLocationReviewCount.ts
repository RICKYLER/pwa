'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getHouseholds } from '@/lib/db/households';

/**
 * Count of households awaiting location review (registration_status `pending`).
 *
 * Returns 0 for non-admins (and performs no local-store read for them). For
 * admins it reads the pending count on mount and refreshes whenever household
 * data changes via the global `mswdo-data-changed` event.
 */
export function usePendingLocationReviewCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
      setCount(0);
      return;
    }

    try {
      const pending = await getHouseholds({ registration_status: 'pending' });
      setCount(pending.length);
    } catch (error) {
      console.error('Failed to load pending location review count:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();

    if (typeof window === 'undefined') {
      return;
    }

    function handleDataChanged(event: Event) {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail && detail.table !== 'households') {
        return;
      }
      void refresh();
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);

    // Refresh on return to the tab as well, so the badge is current after
    // backgrounding — mirrors usePendingMemberApprovalCount.
    function handleVisibilityChanged() {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }

    function handleWindowFocus() {
      void refresh();
    }

    document.addEventListener('visibilitychange', handleVisibilityChanged);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
      document.removeEventListener('visibilitychange', handleVisibilityChanged);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [refresh]);

  return count;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { getPendingMemberApprovals } from '@/lib/db/member-approvals';

/**
 * Count of household members awaiting admin approval.
 *
 * Returns 0 for non-admins (and performs no local-store read for them). For
 * admins it reads the pending-approval count on mount and refreshes whenever
 * household/resident data changes via the global `mswdo-data-changed` event.
 */
export function usePendingMemberApprovalCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
      setCount(0);
      return;
    }

    try {
      const pending = await getPendingMemberApprovals();
      setCount(pending.length);
    } catch (error) {
      console.error('Failed to load pending member approval count:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();

    if (typeof window === 'undefined') {
      return;
    }

    function handleDataChanged(event: Event) {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail && !['households', 'residents'].includes(detail.table || '')) {
        return;
      }
      void refresh();
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);

    // The realtime bridge refreshes on window focus, but only while it is
    // mounted and a Supabase connection is configured. Refresh here too so the
    // badge is current after returning to the tab — including when the bridge
    // fell back to offline or the device was asleep — and on mobile, where a
    // focus event is not reliably fired when the app is resumed.
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

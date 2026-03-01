'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `true` when viewport is mobile (< 1024px).
 * Returns `null` during SSR / before hydration (prevents flash).
 */
export function useIsMobile(): boolean | null {
    const [isMobile, setIsMobile] = useState<boolean | null>(null);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        setIsMobile(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    return isMobile;
}

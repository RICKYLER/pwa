'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import ResponderMobile from '@/views/mobile/ResponderMobile';
import ResponderDesktop from '@/views/desktop/ResponderDesktop';
import AppShell from '@/components/AppShell';

export default function ResponderPage() {
    const isMobile = useIsMobile();
    if (isMobile === null) return <AppShell title="Field Response"><div className="h-screen" /></AppShell>;
    return (
        <AppShell title="Field Response">
            {isMobile
                ? <ResponderMobile />
                // h-full + overflow-hidden: lock page-level scroll so only
                // the left panel scrolls independently
                : <div className="h-full overflow-hidden"><ResponderDesktop /></div>
            }
        </AppShell>
    );
}

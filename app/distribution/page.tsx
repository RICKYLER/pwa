'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import DistributionMobile from '@/views/mobile/DistributionMobile';
import DistributionDesktop from '@/views/desktop/DistributionDesktop';
import AppShell from '@/components/AppShell';

export default function DistributionPage() {
  const isMobile = useIsMobile();
  if (isMobile === null) return <AppShell title="Distribution"><div className="h-screen" /></AppShell>;
  return (
    <AppShell title="Distribution">
      {isMobile ? <DistributionMobile /> : <DistributionDesktop />}
    </AppShell>
  );
}

'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import HouseholdsMobile from '@/views/mobile/HouseholdsMobile';
import HouseholdsDesktop from '@/views/desktop/HouseholdsDesktop';
import AppShell from '@/components/AppShell';

export default function HouseholdsPage() {
  const isMobile = useIsMobile();
  if (isMobile === null) return <AppShell title="Households"><div className="h-screen" /></AppShell>;
  return (
    <AppShell title="Households">
      {isMobile ? <HouseholdsMobile /> : <HouseholdsDesktop />}
    </AppShell>
  );
}

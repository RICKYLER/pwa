'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import DashboardMobile from '@/views/mobile/DashboardMobile';
import DashboardDesktop from '@/views/desktop/DashboardDesktop';
import AppShell from '@/components/AppShell';

export default function DashboardPage() {
  const isMobile = useIsMobile();
  // Render nothing until hydration resolves to avoid layout flash
  if (isMobile === null) return <AppShell title="Dashboard"><div className="h-screen" /></AppShell>;
  return (
    <AppShell title="Dashboard">
      {isMobile ? <DashboardMobile /> : <DashboardDesktop />}
    </AppShell>
  );
}

'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import ReportsMobile from '@/views/mobile/ReportsMobile';
import ReportsDesktop from '@/views/desktop/ReportsDesktop';
import AppShell from '@/components/AppShell';

export default function ReportsPage() {
  const isMobile = useIsMobile();
  if (isMobile === null) return <AppShell title="Reports"><div className="h-screen" /></AppShell>;
  return (
    <AppShell title="Reports">
      {isMobile ? <ReportsMobile /> : <ReportsDesktop />}
    </AppShell>
  );
}

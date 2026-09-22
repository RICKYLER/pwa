'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import ForecastingMobile from '../../views/mobile/ForecastingMobile';
import ForecastingDesktop from '../../views/desktop/ForecastingDesktop';
import AppShell from '@/components/AppShell';

export default function ForecastingPage() {
  const isMobile = useIsMobile();
  if (isMobile === null) return <AppShell title="Demand Forecasting"><div className="h-screen" /></AppShell>;
  return (
    <AppShell title="Demand Forecasting">
      {isMobile ? <ForecastingMobile /> : <ForecastingDesktop />}
    </AppShell>
  );
}

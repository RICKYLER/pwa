'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import InventoryMobile from '@/views/mobile/InventoryMobile';
import InventoryDesktop from '@/views/desktop/InventoryDesktop';
import AppShell from '@/components/AppShell';

export default function InventoryPage() {
  const isMobile = useIsMobile();
  if (isMobile === null) return <AppShell title="Inventory"><div className="h-screen" /></AppShell>;
  return (
    <AppShell title="Inventory">
      {isMobile ? <InventoryMobile /> : <InventoryDesktop />}
    </AppShell>
  );
}

import type { InventoryItem } from '@/lib/db/schema';

export interface BodegaAuditCycle {
  currentAuditMonth: string;
  nextCycleCheckDate: string;
  targetFfpBuffer: number;
}

export function getBodegaAuditCycle(now: Date = new Date()): BodegaAuditCycle {
  const currentMonthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  
  // First day of next month
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextDateFormatted = nextMonth.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    currentAuditMonth: `${currentMonthName} Audit`,
    nextCycleCheckDate: nextDateFormatted,
    targetFfpBuffer: 2000,
  };
}

export function computeBodegaStats(items: InventoryItem[]) {
  const activeItems = items.filter((i) => i.status !== 'trashed');
  const totalUnits = activeItems.reduce((acc, curr) => acc + (curr.quantity_available || 0), 0);

  // Find Family Food Pack (FFP) item - e.g. REL-FFP-001 or name containing "Family Food Pack"
  const ffpItem = activeItems.find(
    (i) =>
      i.item_code?.toUpperCase().includes('FFP') ||
      i.item_name.toLowerCase().includes('family food pack'),
  );

  const ffpStock = ffpItem ? ffpItem.quantity_available : 0;
  const targetBuffer = 2000;
  const ffpBufferMet = ffpStock >= targetBuffer;
  const ffpPercentage = Math.min(100, Math.round((ffpStock / targetBuffer) * 100));

  const lowStockItems = activeItems.filter(
    (i) => (i.quantity_available || 0) <= (i.reorder_level ?? 10),
  );

  return {
    totalUnits,
    totalItemTypes: activeItems.length,
    ffpItem,
    ffpStock,
    targetBuffer,
    ffpBufferMet,
    ffpPercentage,
    lowStockCount: lowStockItems.length,
    lowStockItems,
  };
}

export function exportBodegaAuditCsv(items: InventoryItem[], auditMonth: string) {
  const headers = [
    'Item Code',
    'Item Description',
    'Category',
    'Storage Location',
    'Stock Qty',
    'Unit',
    'Reorder Level',
    'Status',
    'Monthly Audit Check',
  ];

  const rows = items
    .filter((i) => i.status !== 'trashed')
    .map((item) => {
      const isLow = (item.quantity_available || 0) <= (item.reorder_level ?? 10);
      const isOut = (item.quantity_available || 0) === 0;
      const status = isOut ? 'OUT OF STOCK' : isLow ? 'LOW STOCK !' : 'Normal';

      return [
        `"${(item.item_code || '').replace(/"/g, '""')}"`,
        `"${item.item_name.replace(/"/g, '""')}"`,
        `"${item.category.toUpperCase()}"`,
        `"${(item.storage_location || 'MDRRMO Bodega').replace(/"/g, '""')}"`,
        item.quantity_available,
        `"${item.unit}"`,
        item.reorder_level ?? 10,
        `"${status}"`,
        `"${auditMonth}"`,
      ].join(',');
    });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `E-Mabini_MSWDO_Bodega_Inventory_Audit_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

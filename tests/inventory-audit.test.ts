import test from 'node:test';
import assert from 'node:assert/strict';
import { getBodegaAuditCycle, computeBodegaStats } from '../lib/inventory-audit';
import type { InventoryItem } from '../lib/db/schema';

test('getBodegaAuditCycle formats the current month audit and next month cycle check date', () => {
  const fixedDate = new Date(2026, 8, 18); // September 18, 2026
  const cycle = getBodegaAuditCycle(fixedDate);

  assert.equal(cycle.currentAuditMonth, 'September 2026 Audit');
  assert.equal(cycle.nextCycleCheckDate, 'October 1, 2026');
  assert.equal(cycle.targetFfpBuffer, 2000);
});

test('computeBodegaStats calculates total units, FFP buffer metrics, and low stock items', () => {
  const mockItems: InventoryItem[] = [
    {
      id: 'item-1',
      item_code: 'REL-FFP-001',
      item_name: 'DSWD / LGU Family Food Pack',
      category: 'food',
      quantity_available: 2000,
      unit: 'pack',
      reorder_level: 500,
      status: 'active',
      syncStatus: 'synced',
    },
    {
      id: 'item-2',
      item_code: 'REL-KIT-001',
      item_name: 'Standard Kitchen / Cooking Set',
      category: 'other',
      quantity_available: 350,
      unit: 'pcs',
      reorder_level: 100,
      status: 'active',
      syncStatus: 'synced',
    },
    {
      id: 'item-3',
      item_code: 'REL-HYG-001',
      item_name: 'Family Hygiene Kit',
      category: 'hygiene',
      quantity_available: 140,
      unit: 'pack',
      reorder_level: 150,
      status: 'active',
      syncStatus: 'synced',
    },
    {
      id: 'item-trashed',
      item_code: 'REL-OLD-001',
      item_name: 'Expired Biscuits',
      category: 'food',
      quantity_available: 50,
      unit: 'pcs',
      reorder_level: 10,
      status: 'trashed',
      syncStatus: 'synced',
    },
  ];

  const stats = computeBodegaStats(mockItems);

  // Excludes trashed: 2000 + 350 + 140 = 2490
  assert.equal(stats.totalUnits, 2490);
  assert.equal(stats.totalItemTypes, 3);
  assert.equal(stats.ffpStock, 2000);
  assert.equal(stats.ffpBufferMet, true);
  assert.equal(stats.ffpPercentage, 100);

  // Item-3 is below threshold (140 <= 150)
  assert.equal(stats.lowStockCount, 1);
  assert.equal(stats.lowStockItems[0].item_code, 'REL-HYG-001');
});

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Filter, Package, Plus, Search, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import {
  bootstrapInventoryFromSupabase,
  createInventoryItem,
  getInventoryItems,
  getLowStockItems,
} from '@/lib/db/inventory';
import type { InventoryItem } from '@/lib/db/schema';
import { CivicBadge, CivicChipButton, CivicEmptyState, CivicPage } from '@/components/ui/civic-primitives';
import { MobileFilterSheet, MobileListCard, MobilePageHeader } from '@/components/mobile/mobile-primitives';

const CAT_CFG: Record<string, { label: string; tone: 'emerald' | 'navy' | 'amber' | 'rose' | 'slate'; dot: string }> = {
  food: { label: 'Food', tone: 'emerald', dot: 'bg-emerald-500' },
  medicine: { label: 'Medicine', tone: 'navy', dot: 'bg-cyan-950' },
  hygiene: { label: 'Hygiene', tone: 'amber', dot: 'bg-amber-500' },
  clothing: { label: 'Clothing', tone: 'rose', dot: 'bg-rose-500' },
  blankets: { label: 'Blankets', tone: 'navy', dot: 'bg-sky-500' },
  other: { label: 'Other', tone: 'slate', dot: 'bg-slate-400' },
};
const LOW_STOCK = 10;

export default function InventoryMobile() {
  const router = useRouter();
  const user = getCurrentUser();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [filterCat, setFilterCat] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState('');
  const [form, setForm] = useState({
    item_name: '',
    category: 'food' as const,
    quantity_available: 0,
    unit: 'pcs' as const,
    expiration_date: '',
    notes: '',
  });

  const load = useCallback(async (background = false) => {
    if (!background) {
      setIsLoading(true);
    }

    await bootstrapInventoryFromSupabase();
    const [inventoryItems, lowStockItems] = await Promise.all([getInventoryItems(), getLowStockItems()]);
    setItems(inventoryItems);
    setLowStock(lowStockItems);

    if (!background) {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    void load();
  }, [load, router, user]);

  useEffect(() => {
    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (!['inventory_items', 'inventory_movements', 'package_templates'].includes(event.detail.table)) {
        return;
      }

      void load(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => window.removeEventListener('mswdo-data-changed', handleDataChanged);
  }, [load]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const quantity = parseInt(form.quantity_available.toString(), 10);

    if (!form.item_name.trim()) {
      setAddItemError('Item name is required.');
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      setAddItemError('Quantity must be zero or greater.');
      return;
    }

    try {
      setIsAddingItem(true);
      setAddItemError('');
      await createInventoryItem({
        ...form,
        item_name: form.item_name.trim(),
        quantity_available: quantity,
      });
      setForm({ item_name: '', category: 'food', quantity_available: 0, unit: 'pcs', expiration_date: '', notes: '' });
      setShowForm(false);
      await load();
    } catch (error) {
      setAddItemError(error instanceof Error ? error.message : 'Failed to add inventory item.');
    } finally {
      setIsAddingItem(false);
    }
  }

  if (!user) return null;

  const displayedItems = items.filter((item) => {
    if (filterCat !== 'all' && item.category !== filterCat) {
      return false;
    }
    if (!search) {
      return true;
    }
    return item.item_name.toLowerCase().includes(search.toLowerCase());
  });

  const maxQty = Math.max(...items.map((item) => item.quantity_available), 1);
  const canManage = hasPermission('manage_inventory');

  return (
    <>
      <Drawer open={showForm} onOpenChange={(open) => {
        setAddItemError('');
        setShowForm(open);
      }}>
        <DrawerContent className="max-h-[82vh] rounded-t-[30px] border-slate-200 bg-white">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base font-bold text-slate-950">Add inventory item</DrawerTitle>
            <DrawerDescription className="text-sm leading-6 text-slate-500">
              Capture a new stock item without leaving the mobile inventory workflow.
            </DrawerDescription>
          </DrawerHeader>
          <form onSubmit={handleAdd} noValidate className="space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-1">
            <Input
              type="text"
              required
              placeholder="Item name"
              value={form.item_name}
              onChange={(event) => setForm({ ...form, item_name: event.target.value })}
              className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm"
            />

            <div className="grid grid-cols-2 gap-2">
              <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value as typeof form.category })}>
                <SelectTrigger className="h-11 w-full rounded-[18px] border-slate-200 bg-white px-4 text-sm text-slate-700">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CAT_CFG).map(([key, value]) => (
                    <SelectItem key={key} value={key}>{value.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                required
                min={0}
                placeholder="Quantity"
                value={form.quantity_available}
                onChange={(event) => setForm({ ...form, quantity_available: parseInt(event.target.value, 10) || 0 })}
                className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="text"
                placeholder="Unit"
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value as typeof form.unit })}
                className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm"
              />
              <Input
                type="date"
                value={form.expiration_date}
                onChange={(event) => setForm({ ...form, expiration_date: event.target.value })}
                className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm"
              />
            </div>

            <Input
              type="text"
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm"
            />

            {addItemError ? (
              <Alert className="rounded-[20px] border-rose-200 bg-rose-50 text-rose-700">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Unable to add item</AlertTitle>
                <AlertDescription>{addItemError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={isAddingItem} className="h-11 w-full rounded-[18px] text-sm font-semibold">
              {isAddingItem ? 'Adding...' : 'Add to inventory'}
            </Button>
          </form>
        </DrawerContent>
      </Drawer>

      <CivicPage className="space-y-4 px-4 py-4">
        <MobilePageHeader
          title="Inventory"
          subtitle={isLoading ? 'Loading stock records...' : `${items.length} item types are tracked across the active inventory.`}
          primaryAction={canManage ? (
            <Button type="button" onClick={() => setShowForm(true)} className="h-11 rounded-[18px] px-4 text-sm font-semibold">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          ) : null}
        />

        {lowStock.length > 0 && !isLoading ? (
          <Alert className="rounded-[22px] border-amber-200 bg-amber-50 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{lowStock.length} low-stock item{lowStock.length !== 1 ? 's' : ''}</AlertTitle>
            <AlertDescription>
              {lowStock.slice(0, 3).map((item) => item.item_name).join(', ')}{lowStock.length > 3 ? ` +${lowStock.length - 3} more` : ''}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search inventory..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 rounded-[18px] border-slate-200 bg-white pl-10 pr-10 text-sm"
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterSheetOpen(true)}
            className="h-11 rounded-[18px] border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <CivicBadge label={`${displayedItems.length} showing`} tone="slate" />
          {filterCat !== 'all' ? <CivicBadge label={CAT_CFG[filterCat]?.label || 'Filtered'} tone={CAT_CFG[filterCat]?.tone || 'slate'} /> : null}
        </div>

        <MobileFilterSheet
          open={filterSheetOpen}
          onOpenChange={setFilterSheetOpen}
          title="Filter inventory"
          description="Move category filtering into a drawer so the list stays readable on narrow screens."
          resultCount={<span>Showing <strong>{displayedItems.length}</strong> of <strong>{items.length}</strong> items</span>}
          filters={(
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Category</p>
              <div className="flex flex-wrap gap-2">
                <CivicChipButton active={filterCat === 'all'} onClick={() => setFilterCat('all')}>
                  All
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${filterCat === 'all' ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {items.length}
                  </span>
                </CivicChipButton>
                {Object.entries(CAT_CFG).map(([key, value]) => {
                  const count = items.filter((item) => item.category === key).length;
                  return (
                    <CivicChipButton key={key} active={filterCat === key} onClick={() => setFilterCat(key)}>
                      {value.label}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${filterCat === key ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {count}
                      </span>
                    </CivicChipButton>
                  );
                })}
              </div>
            </div>
          )}
        />

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
            ))}
          </div>
        ) : displayedItems.length > 0 ? (
          <div className="space-y-2">
            {displayedItems.map((item) => {
              const config = CAT_CFG[item.category] || CAT_CFG.other;
              const isLow = item.quantity_available < LOW_STOCK;

              return (
                <MobileListCard
                  key={item.id}
                  title={item.item_name}
                  subtitle={item.notes || `${config.label} supply item`}
                  leading={<span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />}
                  status={(
                    <>
                      <CivicBadge label={config.label} tone={config.tone} className="text-[10px]" />
                      {isLow ? <CivicBadge label="Low stock" tone="rose" className="text-[10px]" /> : null}
                    </>
                  )}
                  meta={(
                    <div className="space-y-2 text-xs text-slate-500">
                      <div className="flex items-center justify-between gap-3">
                        <span>{item.quantity_available} {item.unit}</span>
                        <span>{item.expiration_date || 'No expiry set'}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${isLow ? 'bg-rose-500' : 'bg-cyan-950'}`}
                          style={{ width: `${Math.min((item.quantity_available / maxQty) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                />
              );
            })}
          </div>
        ) : (
          <CivicEmptyState
            icon={Package}
            title="No items found"
            description="Try clearing filters or add a new stock item."
          />
        )}
      </CivicPage>
    </>
  );
}

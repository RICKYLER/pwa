'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Boxes,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LayoutGrid,
  Package,
  PackageCheck,
  PencilLine,
  Plus,
  RefreshCcw,
  Search,
  Table,
  Trash2,
  X,
} from 'lucide-react';
import {
  computeBodegaStats,
  exportBodegaAuditCsv,
  getBodegaAuditCycle,
} from '@/lib/inventory-audit';
import { ForecastingInsightsCard } from '@/components/forecasting/ForecastingInsightsCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import {
  addStock,
  archiveInventoryItem,
  adjustInventoryCount,
  bootstrapInventoryFromSupabase,
  createInventoryItem,
  createPackageTemplate,
  deletePackageTemplate,
  getExpiringSoonItems,
  getInventoryItems,
  getInventoryMovements,
  getInventoryStatusSummary,
  getInventoryTrashItems,
  getItemStockState,
  getLowStockItems,
  getOutOfStockItems,
  getPackageTemplates,
  permanentlyDeleteInventoryItem,
  restoreInventoryItem,
  updateInventoryItem,
} from '@/lib/db/inventory';
import { getBlockedPackageTemplateReadiness } from '@/lib/db/queries';
import type { DistributedItem, InventoryItem, InventoryMovement, PackageTemplate } from '@/lib/db/schema';

const CAT_CFG: Record<
  string,
  { label: string; dot: string; bg: string; color: string; ring: string }
> = {
  food: {
    label: 'Food',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    color: 'text-emerald-700',
    ring: 'ring-emerald-200',
  },
  medicine: {
    label: 'Medicine',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    color: 'text-blue-700',
    ring: 'ring-blue-200',
  },
  hygiene: {
    label: 'Hygiene',
    dot: 'bg-violet-500',
    bg: 'bg-violet-50',
    color: 'text-violet-700',
    ring: 'ring-violet-200',
  },
  clothing: {
    label: 'Clothing',
    dot: 'bg-orange-500',
    bg: 'bg-orange-50',
    color: 'text-orange-700',
    ring: 'ring-orange-200',
  },
  blankets: {
    label: 'Blankets',
    dot: 'bg-indigo-500',
    bg: 'bg-indigo-50',
    color: 'text-indigo-700',
    ring: 'ring-indigo-200',
  },
  other: {
    label: 'Other',
    dot: 'bg-slate-400',
    bg: 'bg-slate-50',
    color: 'text-slate-600',
    ring: 'ring-slate-200',
  },
};

function getDisplayCategory(item: InventoryItem) {
  const name = item.item_name.toLowerCase();
  const code = (item.item_code || '').toLowerCase();
  if (name.includes('kitchen') || code.includes('kit')) {
    return {
      label: 'Kitchen',
      dot: 'bg-orange-500',
      bg: 'bg-orange-50',
      color: 'text-orange-700',
      ring: 'ring-orange-200',
    };
  }
  if (name.includes('water') || code.includes('wat')) {
    return {
      label: 'WASH',
      dot: 'bg-cyan-500',
      bg: 'bg-cyan-50',
      color: 'text-cyan-700',
      ring: 'ring-cyan-200',
    };
  }
  if (item.category === 'hygiene') {
    return {
      label: 'NFI / Hygiene',
      dot: 'bg-violet-500',
      bg: 'bg-violet-50',
      color: 'text-violet-700',
      ring: 'ring-violet-200',
    };
  }
  if (item.category === 'blankets') {
    return {
      label: 'NFI / Sleeping',
      dot: 'bg-indigo-500',
      bg: 'bg-indigo-50',
      color: 'text-indigo-700',
      ring: 'ring-indigo-200',
    };
  }
  return CAT_CFG[item.category] || CAT_CFG.other;
}

const MOVEMENT_LABELS: Record<
  InventoryMovement['type'],
  { label: string; tone: string; icon: typeof ArrowUp }
> = {
  stock_in: { label: 'Stock In', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: ArrowUp },
  stock_out: { label: 'Stock Out', tone: 'bg-slate-100 text-slate-700 ring-slate-200', icon: ArrowDown },
  adjustment: { label: 'Adjustment', tone: 'bg-amber-50 text-amber-700 ring-amber-200', icon: PencilLine },
  distribution_release: {
    label: 'Distribution Release',
    tone: 'bg-blue-50 text-blue-700 ring-blue-200',
    icon: Boxes,
  },
  transfer: { label: 'Transfer', tone: 'bg-violet-50 text-violet-700 ring-violet-200', icon: RefreshCcw },
};

type StockFilter = 'all' | 'low' | 'out' | 'expiring';
type TransactionMode = 'add' | 'adjust';
type MovementScope = 'all' | 'selected';
type InventoryView = 'active' | 'trash';
type ItemActionKind = 'archive' | 'restore' | 'delete';
type ItemActionDialogState = {
  action: ItemActionKind;
  itemId: string;
  itemName: string;
  quantityAvailable: number;
  unit: InventoryItem['unit'];
};

export default function InventoryDesktop() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getCurrentUser();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [trashItems, setTrashItems] = useState<InventoryItem[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [outOfStock, setOutOfStock] = useState<InventoryItem[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [templates, setTemplates] = useState<PackageTemplate[]>([]);
  const [blockedTemplates, setBlockedTemplates] = useState<Awaited<ReturnType<typeof getBlockedPackageTemplateReadiness>>>([]);
  const [summary, setSummary] = useState({
    totalItemTypes: 0,
    totalUnits: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    expiringSoonCount: 0,
  });
  const [inventoryView, setInventoryView] = useState<InventoryView>('active');
  const [filterCat, setFilterCat] = useState('all');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'ledger' | 'grid'>('ledger');
  const [auditCycle] = useState(() => getBodegaAuditCycle());
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [movementScope, setMovementScope] = useState<MovementScope>('all');
  const [transactionItem, setTransactionItem] = useState<InventoryItem | null>(null);
  const [transactionMode, setTransactionMode] = useState<TransactionMode>('add');
  const [transactionQuantity, setTransactionQuantity] = useState('1');
  const [transactionCount, setTransactionCount] = useState('0');
  const [transactionNotes, setTransactionNotes] = useState('');
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [isRestoringItem, setIsRestoringItem] = useState(false);
  const [isPermanentlyDeletingItem, setIsPermanentlyDeletingItem] = useState(false);
  const [itemActionError, setItemActionError] = useState('');
  const [itemActionDialog, setItemActionDialog] = useState<ItemActionDialogState | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const issueFilter = searchParams.get('issue');
  const isPackageBlockerMode = issueFilter === 'package_blockers';

  const [form, setForm] = useState({
    item_name: '',
    item_code: '',
    category: 'food' as InventoryItem['category'],
    quantity_available: 0,
    unit: 'pcs' as InventoryItem['unit'],
    reorder_level: 10,
    storage_location: '',
    expiration_date: '',
    notes: '',
  });

  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    items: [] as DistributedItem[],
    selectedItemId: '',
    quantity: '1',
  });
  const [editForm, setEditForm] = useState({
    item_name: '',
    item_code: '',
    category: 'food' as InventoryItem['category'],
    unit: 'pcs' as InventoryItem['unit'],
    reorder_level: 10,
    storage_location: '',
    expiration_date: '',
    notes: '',
  });

  const load = useCallback(async (
    itemIdForMovements?: string,
    background = false,
    view: InventoryView = inventoryView,
  ) => {
    if (!background) {
      setIsLoading(true);
    }

    try {
      await bootstrapInventoryFromSupabase();

      const [inv, trashList, ls, out, exp, stats, templateList, blockedTemplateReadiness] = await Promise.all([
        getInventoryItems(),
        getInventoryTrashItems(),
        getLowStockItems(),
        getOutOfStockItems(),
        getExpiringSoonItems(),
        getInventoryStatusSummary(),
        getPackageTemplates(),
        getBlockedPackageTemplateReadiness(),
      ]);

      setItems(inv);
      setTrashItems(trashList);
      setLowStock(ls);
      setOutOfStock(out);
      setExpiringSoon(exp);
      setSummary(stats);
      setTemplates(templateList);
      setBlockedTemplates(blockedTemplateReadiness);

      if (!templateForm.selectedItemId && inv[0]) {
        setTemplateForm((current) => ({ ...current, selectedItemId: inv[0].id }));
      }

      const sourceItems = view === 'trash' ? trashList : inv;
      const requestedItemId =
        itemIdForMovements && sourceItems.some((item) => item.id === itemIdForMovements)
          ? itemIdForMovements
          : null;
      const persistedSelectedItemId =
        selectedItemId && sourceItems.some((item) => item.id === selectedItemId)
          ? selectedItemId
          : null;
      const nextSelectedItemId =
        requestedItemId || persistedSelectedItemId || (sourceItems.length > 0 ? sourceItems[0].id : null);
      setSelectedItemId(nextSelectedItemId);

      const nextMovementScope =
        movementScope === 'selected' && !nextSelectedItemId ? 'all' : movementScope;
      await loadMovements(
        nextMovementScope === 'selected' ? nextSelectedItemId || undefined : undefined,
        nextMovementScope,
      );
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, [inventoryView, movementScope, selectedItemId, templateForm.selectedItemId]);

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    void load();
  }, [user, router, load]);

  useEffect(() => {
    if (movementScope === 'selected' && selectedItemId) {
      void loadMovements(selectedItemId, 'selected');
      return;
    }

    void loadMovements(undefined, 'all');
  }, [movementScope, selectedItemId]);

  useEffect(() => {
    setItemActionError('');
  }, [inventoryView, selectedItemId]);

  async function loadMovements(itemId?: string, scope: MovementScope = movementScope) {
    const recentMovements = await getInventoryMovements({
      item_id: scope === 'selected' ? itemId : undefined,
      limit: scope === 'selected' ? 16 : 24,
    });
    setMovements(recentMovements);
  }

  useEffect(() => {
    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (!['inventory_items', 'inventory_movements', 'package_templates'].includes(event.detail.table)) {
        return;
      }

      void load(selectedItemId || undefined, true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);

    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [load, selectedItemId]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const itemName = form.item_name.trim();
    const quantity = Number(form.quantity_available);
    const reorderLevel = Number(form.reorder_level);
    const expirationValue = form.expiration_date.trim();

    if (!itemName) {
      setAddItemError('Item name is required.');
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      setAddItemError('Opening stock must be zero or greater.');
      return;
    }

    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      setAddItemError('Reorder level must be zero or greater.');
      return;
    }

    if (expirationValue && Number.isNaN(new Date(expirationValue).getTime())) {
      setAddItemError('Expiration date is invalid. Use the calendar picker or YYYY-MM-DD format.');
      return;
    }

    try {
      setIsAddingItem(true);
      setAddItemError('');

      await createInventoryItem({
        ...form,
        item_name: itemName,
        quantity_available: quantity,
        reorder_level: reorderLevel,
        expiration_date: expirationValue || undefined,
      });

      setForm({
        item_name: '',
        item_code: '',
        category: 'food',
        quantity_available: 0,
        unit: 'pcs',
        reorder_level: 10,
        storage_location: '',
        expiration_date: '',
        notes: '',
      });
      setShowForm(false);
      await load();
    } catch (error) {
      setAddItemError(
        error instanceof Error ? error.message : 'Failed to add inventory item.',
      );
    } finally {
      setIsAddingItem(false);
    }
  }

  function openTransaction(item: InventoryItem, mode: TransactionMode) {
    setItemActionError('');
    setTransactionItem(item);
    setTransactionMode(mode);
    setTransactionQuantity('1');
    setTransactionCount(String(item.quantity_available));
    setTransactionNotes('');
  }

  async function handleSubmitTransaction(event: React.FormEvent) {
    event.preventDefault();
    if (!transactionItem) return;

    try {
      setIsSubmittingTransaction(true);

      if (transactionMode === 'add') {
        await addStock(
          transactionItem.id,
          Number(transactionQuantity) || 0,
          transactionNotes.trim() || 'Manual stock in',
        );
      } else {
        await adjustInventoryCount(
          transactionItem.id,
          Number(transactionCount) || 0,
          transactionNotes.trim() || 'Manual count adjustment',
        );
      }

      const selectedId = transactionItem.id;
      setTransactionItem(null);
      await load(selectedId);
    } finally {
      setIsSubmittingTransaction(false);
    }
  }

  function openEditItem(item: InventoryItem) {
    setItemActionError('');
    setEditingItem(item);
    setEditForm({
      item_name: item.item_name,
      item_code: item.item_code || '',
      category: item.category,
      unit: item.unit,
      reorder_level: item.reorder_level ?? 10,
      storage_location: item.storage_location || '',
      expiration_date: item.expiration_date || '',
      notes: item.notes || '',
    });
  }

  function openItemActionDialog(item: InventoryItem, action: ItemActionKind) {
    setItemActionError('');
    setItemActionDialog({
      action,
      itemId: item.id,
      itemName: item.item_name,
      quantityAvailable: item.quantity_available,
      unit: item.unit,
    });
  }

  function closeItemActionDialog() {
    setItemActionDialog(null);
  }

  function getItemActionBusy(action: ItemActionKind) {
    switch (action) {
      case 'archive':
        return isDeletingItem;
      case 'restore':
        return isRestoringItem;
      case 'delete':
        return isPermanentlyDeletingItem;
      default:
        return false;
    }
  }

  function getItemActionDialogMeta(dialog: ItemActionDialogState) {
    switch (dialog.action) {
      case 'archive':
        return {
          eyebrow: 'Inventory Archive',
          title: 'Move this item to Trash?',
          description: `This keeps "${dialog.itemName}" and its movement history, sets stock to 0, and lets you restore it later.`,
          detailLabel: 'Stock on hand',
          detailValue: `${dialog.quantityAvailable} ${dialog.unit}`,
          detailHint: 'Current recorded quantity before archiving',
          noteTitle: 'What happens next',
          noteBody: 'The item leaves the active list, stays searchable in Trash, and can be restored whenever you need it again.',
          icon: Archive,
          iconTone: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
          surfaceTone: 'from-amber-100 via-white to-rose-100',
          actionClassName:
            'border-0 bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-[0_18px_40px_-20px_rgba(244,114,182,0.45)] hover:from-amber-400 hover:to-rose-400',
          actionLabel: 'Move To Trash',
          actionPendingLabel: 'Moving…',
        };
      case 'restore':
        return {
          eyebrow: 'Restore Item',
          title: 'Restore this item from Trash?',
          description: `This will return "${dialog.itemName}" to your active inventory so you can add stock, adjust counts, and include it in workflows again.`,
          detailLabel: 'Current stock',
          detailValue: `${dialog.quantityAvailable} ${dialog.unit}`,
          detailHint: 'Stock stays as-is after restore',
          noteTitle: 'After restore',
          noteBody: 'The item moves back to the active inventory list immediately. You can update stock again right after restoring it.',
          icon: RefreshCcw,
          iconTone: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
          surfaceTone: 'from-emerald-100 via-white to-teal-100',
          actionClassName:
            'border-0 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_18px_40px_-20px_rgba(16,185,129,0.45)] hover:from-emerald-400 hover:to-teal-500',
          actionLabel: 'Restore Item',
          actionPendingLabel: 'Restoring…',
        };
      case 'delete':
        return {
          eyebrow: 'Permanent Delete',
          title: 'Delete this item permanently?',
          description: `This permanently removes "${dialog.itemName}" and its stock movement history. This action cannot be undone.`,
          detailLabel: 'Delete scope',
          detailValue: 'Item + history',
          detailHint: 'All related inventory movements will be removed',
          noteTitle: 'Before you continue',
          noteBody: 'Permanent delete is only for items already in Trash. If this item is still referenced by a package or distribution event, deletion will be blocked.',
          icon: Trash2,
          iconTone: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
          surfaceTone: 'from-rose-100 via-white to-orange-100',
          actionClassName:
            'border-0 bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-[0_18px_40px_-20px_rgba(225,29,72,0.45)] hover:from-rose-500 hover:to-red-500',
          actionLabel: 'Delete Permanently',
          actionPendingLabel: 'Deleting…',
        };
      default:
        return null;
    }
  }

  async function handleSaveItemEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingItem) return;

    try {
      setIsSavingEdit(true);
      await updateInventoryItem(editingItem.id, {
        item_name: editForm.item_name,
        item_code: editForm.item_code,
        category: editForm.category,
        unit: editForm.unit,
        reorder_level: Number(editForm.reorder_level) || 0,
        storage_location: editForm.storage_location,
        expiration_date: editForm.expiration_date || undefined,
        notes: editForm.notes,
      });
      const selectedId = editingItem.id;
      setEditingItem(null);
      await load(selectedId);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleArchiveSelectedItem() {
    if (!selectedItem) return;
    openItemActionDialog(selectedItem, 'archive');
  }

  async function confirmArchiveSelectedItem(itemId: string) {
    try {
      setItemActionError('');
      setIsDeletingItem(true);
      await archiveInventoryItem(itemId);
      setInventoryView('trash');
      await load(itemId, false, 'trash');
      closeItemActionDialog();
    } catch (error) {
      setItemActionError(
        error instanceof Error ? error.message : 'Unable to move this item to Trash.',
      );
    } finally {
      setIsDeletingItem(false);
    }
  }

  async function handleRestoreSelectedItem() {
    if (!selectedItem) return;
    openItemActionDialog(selectedItem, 'restore');
  }

  async function confirmRestoreSelectedItem(itemId: string) {
    try {
      setItemActionError('');
      setIsRestoringItem(true);
      await restoreInventoryItem(itemId);
      setInventoryView('active');
      await load(itemId, false, 'active');
      closeItemActionDialog();
    } catch (error) {
      setItemActionError(
        error instanceof Error ? error.message : 'Unable to restore this item.',
      );
    } finally {
      setIsRestoringItem(false);
    }
  }

  async function handlePermanentlyDeleteSelectedItem() {
    if (!selectedItem) return;
    openItemActionDialog(selectedItem, 'delete');
  }

  async function confirmPermanentlyDeleteSelectedItem(itemId: string) {
    try {
      setItemActionError('');
      setIsPermanentlyDeletingItem(true);
      await permanentlyDeleteInventoryItem(itemId);
      await load(undefined, false, 'trash');
      closeItemActionDialog();
    } catch (error) {
      setItemActionError(
        error instanceof Error ? error.message : 'Unable to permanently delete this item.',
      );
    } finally {
      setIsPermanentlyDeletingItem(false);
    }
  }

  async function handleConfirmItemAction() {
    if (!itemActionDialog) return;

    if (itemActionDialog.action === 'archive') {
      await confirmArchiveSelectedItem(itemActionDialog.itemId);
      return;
    }

    if (itemActionDialog.action === 'restore') {
      await confirmRestoreSelectedItem(itemActionDialog.itemId);
      return;
    }

    await confirmPermanentlyDeleteSelectedItem(itemActionDialog.itemId);
  }

  function addTemplateLine() {
    const selectedItem = items.find((item) => item.id === templateForm.selectedItemId);
    const quantity = Number(templateForm.quantity) || 0;

    if (!selectedItem || quantity <= 0) return;

    setTemplateForm((current) => {
      const existingIndex = current.items.findIndex((item) => item.item_id === selectedItem.id);
      if (existingIndex === -1) {
        return {
          ...current,
          items: [
            ...current.items,
            {
              item_id: selectedItem.id,
              item_name: selectedItem.item_name,
              unit: selectedItem.unit,
              quantity,
            },
          ],
          quantity: '1',
        };
      }

      const updatedItems = [...current.items];
      updatedItems[existingIndex] = {
        ...updatedItems[existingIndex],
        quantity: updatedItems[existingIndex].quantity + quantity,
      };

      return {
        ...current,
        items: updatedItems,
        quantity: '1',
      };
    });
  }

  function removeTemplateLine(itemId: string) {
    setTemplateForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.item_id !== itemId),
    }));
  }

  async function handleCreateTemplate(event: React.FormEvent) {
    event.preventDefault();
    if (!templateForm.name.trim() || templateForm.items.length === 0) return;

    try {
      setIsSavingTemplate(true);
      await createPackageTemplate({
        name: templateForm.name.trim(),
        description: templateForm.description.trim() || undefined,
        items: templateForm.items,
      });

      setTemplateForm((current) => ({
        ...current,
        name: '',
        description: '',
        items: [],
        quantity: '1',
      }));
      await load(selectedItemId || undefined);
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    await deletePackageTemplate(templateId);
    await load(selectedItemId || undefined);
  }

  if (!user) return null;

  const currentItems = inventoryView === 'trash' ? trashItems : items;
  const selectedItem = currentItems.find((item) => item.id === selectedItemId) ?? null;
  const displayed = currentItems.filter((item) => {
    const matchesCategory = filterCat === 'all' || item.category === filterCat;
    const searchValue = [
      item.item_name,
      item.item_code,
      item.storage_location,
      item.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesSearch = !search || searchValue.includes(search.toLowerCase());

    const matchesStock =
      inventoryView === 'trash'
        ? true
        : filterStock === 'all'
          ? true
          : filterStock === 'low'
            ? getItemStockState(item) === 'low'
            : filterStock === 'out'
              ? getItemStockState(item) === 'out'
              : Boolean(expiringSoon.find((expiringItem) => expiringItem.id === item.id));

    return matchesCategory && matchesSearch && matchesStock;
  });

  const maxQty = Math.max(...currentItems.map((item) => item.quantity_available), 1);
  const hasFilters = search || filterCat !== 'all' || (inventoryView === 'active' && filterStock !== 'all');
  const blockedTemplateIds = new Set(blockedTemplates.map((entry) => entry.template.id));
  const displayedTemplates = isPackageBlockerMode
    ? templates.filter((template) => blockedTemplateIds.has(template.id))
    : templates;
  const bodegaStats = computeBodegaStats(items);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-8">
      {/* Top Bodega Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-amber-400 shadow-sm ring-1 ring-slate-800">
            E-MABINI
          </span>
          <span className="text-xl font-light text-slate-300">|</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              MSWDO – MDRRMO Bodega Inventory Tracking
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {inventoryView === 'trash'
                ? `${trashItems.length} item${trashItems.length !== 1 ? 's' : ''} in Trash`
                : `Mabini Municipal Bodega · ${items.length} Tracked Item Types · ${summary.totalUnits.toLocaleString()} Units Available`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Monthly Audit Indicator */}
          <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200/90 bg-amber-50/80 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-sm">
            <Calendar className="h-4 w-4 text-amber-600" />
            <span className="font-semibold">{auditCycle.currentAuditMonth}</span>
          </div>

          {/* Active / Trash switcher */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setInventoryView('active')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                inventoryView === 'active'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Active <span className="ml-1 text-[11px] opacity-70">{items.length}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterStock('all');
                setInventoryView('trash');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                inventoryView === 'trash'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Trash <span className="text-[11px] opacity-70">{trashItems.length}</span>
            </button>
          </div>

          {hasPermission('manage_inventory') ? (
            <button
              onClick={() => {
                setAddItemError('');
                setShowForm((value) => !value);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all shadow-sm hover:-translate-y-px ${
                showForm
                  ? 'bg-slate-200 text-slate-700 shadow-slate-200/50'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/25'
              }`}
            >
              {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showForm ? 'Cancel' : '+ Add Item'}
            </button>
          ) : null}
        </div>
      </div>

      {isPackageBlockerMode ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Showing package templates that cannot be fulfilled with the current stock.
        </div>
      ) : null}

      {/* Stats Overview */}
      {inventoryView === 'active' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Stats Overview
            </span>
            <span className="text-xs text-slate-400">
              Prepositioned Bodega Buffer & Safety Levels
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* 1. TOTAL STOCK ON HAND */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-500">
                    TOTAL STOCK ON HAND
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-900">
                    {bodegaStats.totalUnits.toLocaleString()}{' '}
                    <span className="text-base font-normal text-slate-500">Units</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {bodegaStats.totalItemTypes} supply types stored in bodega
                  </p>
                </div>
                <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                  <Boxes className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* 2. FFP BUFFER (BODEGA) */}
            <div
              className={`rounded-2xl border p-5 shadow-sm transition-all ${
                bodegaStats.ffpBufferMet
                  ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/30'
                  : 'border-amber-200 bg-amber-50/40'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-full mr-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider text-emerald-800">
                      FFP BUFFER (BODEGA)
                    </p>
                    {bodegaStats.ffpBufferMet ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" /> Target Met
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        <AlertTriangle className="h-3 w-3" /> Under Target
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-3xl font-black text-slate-900">
                    {bodegaStats.ffpStock.toLocaleString()}{' '}
                    <span className="text-base font-normal text-slate-500">Packs</span>
                  </p>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Buffer Target: 2,000 Packs</span>
                      <span className="font-semibold text-slate-700">{bodegaStats.ffpPercentage}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                        style={{ width: `${bodegaStats.ffpPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-100/80 p-2.5 text-emerald-700 flex-shrink-0">
                  <PackageCheck className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* 3. LOW STOCK ALERTS */}
            <div
              className={`rounded-2xl border p-5 shadow-sm transition-all ${
                bodegaStats.lowStockCount > 0
                  ? 'border-amber-300 bg-amber-50/50'
                  : 'border-slate-200/80 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-800">
                    LOW STOCK ALERTS
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-900">
                    {bodegaStats.lowStockCount}{' '}
                    <span className="text-base font-normal text-slate-600">
                      {bodegaStats.lowStockCount === 1 ? 'Item Below Minimum' : 'Items Below Minimum'}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    {bodegaStats.lowStockCount > 0
                      ? 'Requires LGU / DSWD augmentation requisition'
                      : 'All relief supplies above minimum reorder threshold'}
                  </p>
                </div>
                <div
                  className={`rounded-xl p-2.5 ${
                    bodegaStats.lowStockCount > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          {/* MSWDO RELIEF DEMAND FORECASTING & ACCURACY MODULE */}
          <ForecastingInsightsCard
            currentStockpile={bodegaStats.ffpStock || 2000}
            className="mt-6"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-500" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">Trash keeps archived inventory items safe.</p>
              <p className="text-xs text-slate-500">
                Restore items anytime, or permanently delete them once they are no longer needed.
              </p>
            </div>
          </div>
        </div>
      )}

      {inventoryView === 'active' && (lowStock.length > 0 || outOfStock.length > 0 || expiringSoon.length > 0) && !isLoading ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-amber-900">
                {lowStock.length} low stock · {outOfStock.length} out of stock · {expiringSoon.length}{' '}
                expiring soon
              </p>
              <p className="text-xs text-amber-700">
                Priority items: {[...new Set([...outOfStock, ...lowStock, ...expiringSoon].map((item) => item.item_name))]
                  .slice(0, 6)
                  .join(', ')}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
            <p className="font-bold text-slate-800">Add New Inventory Item</p>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleAdd} noValidate className="space-y-4 p-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rice 5kg"
                  value={form.item_name}
                  onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">SKU / Code</label>
                <input
                  type="text"
                  placeholder="Optional code"
                  value={form.item_code}
                  onChange={(e) => setForm({ ...form, item_code: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Category *</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as InventoryItem['category'] })
                  }
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  {Object.entries(CAT_CFG).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Opening Stock *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={form.quantity_available}
                  onChange={(e) =>
                    setForm({ ...form, quantity_available: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Unit *</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value as InventoryItem['unit'] })}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  {['pcs', 'kg', 'box', 'pack', 'bundle'].map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Reorder Level *</label>
                <input
                  type="number"
                  min={0}
                  value={form.reorder_level}
                  onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Storage Location</label>
                <input
                  type="text"
                  placeholder="Shelf / room"
                  value={form.storage_location}
                  onChange={(e) => setForm({ ...form, storage_location: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Expiration</label>
                <input
                  type="date"
                  value={form.expiration_date}
                  onChange={(e) => setForm({ ...form, expiration_date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional description or handling notes"
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
              <p className="mt-2 text-[11px] text-slate-400">
                Best practice: if the same food item has a different expiration date or supplier
                batch, add it as a separate inventory line instead of mixing it into the old one.
              </p>
            </div>

            <div className="flex gap-3">
              {addItemError ? (
                <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                  {addItemError}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={isAddingItem}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-500/20 transition-all hover:-translate-y-px hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAddingItem ? 'Adding...' : 'Add To Inventory'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddItemError('');
                  setShowForm(false);
                }}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* INVENTORY LEDGER Header Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Inventory Ledger
            </span>
            {/* View Mode Switcher: Ledger Table vs Card Grid */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('ledger')}
                title="Ledger Table View"
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === 'ledger'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Table className="h-3.5 w-3.5" />
                Ledger
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Grid Cards View"
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Stock In Button */}
            {hasPermission('manage_inventory') && (
              <button
                type="button"
                onClick={() => {
                  const target = selectedItem || bodegaStats.ffpItem || displayed[0] || items[0];
                  if (target) {
                    openTransaction(target, 'add');
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 hover:border-emerald-400 active:scale-95"
              >
                <Plus className="h-3.5 w-3.5 text-emerald-600" />
                Stock In
              </button>
            )}

            {/* Export Audit Button */}
            <button
              type="button"
              onClick={() => exportBodegaAuditCsv(items, auditCycle.currentAuditMonth)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 hover:border-slate-400 active:scale-95"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              Export Audit
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-100">
          <div className="relative w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search items, SKU, or bodega shelf..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-9 text-xs shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            {search ? (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-1 gap-1.5 overflow-x-auto pb-0">
            <button
              onClick={() => setFilterCat('all')}
              className={`flex-shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
                filterCat === 'all'
                  ? 'bg-slate-800 text-white shadow'
                  : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              All <span className="ml-1">{currentItems.length}</span>
            </button>
            {Object.entries(CAT_CFG).map(([key, value]) => {
              const count = currentItems.filter((item) => item.category === key).length;
              return (
                <button
                  key={key}
                  onClick={() => setFilterCat(key)}
                  className={`flex-shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    filterCat === key
                      ? `${value.bg} ${value.color} shadow ring-1 ${value.ring}`
                      : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${value.dot}`} />
                  {value.label}
                  <span className="ml-1 text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {inventoryView === 'active' ? (
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              {[
                { key: 'all', label: 'All' },
                { key: 'low', label: 'Low Stock' },
                { key: 'out', label: 'Out' },
                { key: 'expiring', label: 'Expiring' },
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setFilterStock(filter.key as StockFilter)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    filterStock === filter.key
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
              {hasFilters && (
                <button
                  onClick={() => {
                    setSearch('');
                    setFilterCat('all');
                    setFilterStock('all');
                  }}
                  className="text-xs font-semibold text-amber-600 hover:text-amber-800 ml-1"
                >
                  Reset
                </button>
              )}
            </div>
          ) : (
            hasFilters && (
              <button
                onClick={() => {
                  setSearch('');
                  setFilterCat('all');
                  setFilterStock('all');
                }}
                className="text-xs font-semibold text-amber-600 hover:text-amber-800 ml-auto"
              >
                Reset
              </button>
            )
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-2xl border border-slate-200/60 bg-white"
                />
              ))}
            </div>
          ) : displayed.length > 0 ? (
            viewMode === 'ledger' ? (
              /* Ledger Table View */
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3.5 px-4">Item Code</th>
                        <th className="py-3.5 px-4">Item Description</th>
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4 text-right">Stock Qty</th>
                        <th className="py-3.5 px-4 text-right">Reorder Lvl</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayed.map((item) => {
                        const isSelected = selectedItemId === item.id;
                        const isTrashed = item.status === 'trashed';
                        const stockState = getItemStockState(item);
                        const isLow = stockState === 'low';
                        const isOut = stockState === 'out';
                        const catInfo = getDisplayCategory(item);
                        const expiring = Boolean(expiringSoon.find((expiringItem) => expiringItem.id === item.id));

                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedItemId(item.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-amber-50/60 font-medium'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* Item Code */}
                            <td className="py-3.5 px-4 font-mono font-bold text-xs text-slate-800 whitespace-nowrap">
                              <span className="rounded bg-slate-100 px-2 py-1 border border-slate-200/80 text-slate-700">
                                {item.item_code || '---'}
                              </span>
                            </td>

                            {/* Item Description */}
                            <td className="py-3.5 px-4">
                              <div className="font-sans font-semibold text-slate-900 text-sm">
                                {item.item_name}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-sans">
                                <span>{item.storage_location || 'MDRRMO Bodega'}</span>
                                {expiring && (
                                  <span className="text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.2 rounded text-[10px]">
                                    Exp: {item.expiration_date}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Category */}
                            <td className="py-3.5 px-4 font-sans whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${catInfo.bg} ${catInfo.color} ring-1 ${catInfo.ring}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${catInfo.dot}`} />
                                {catInfo.label}
                              </span>
                            </td>

                            {/* Stock Qty */}
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="font-sans font-bold text-slate-900 text-sm">
                                {item.quantity_available.toLocaleString()}{' '}
                                <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                              </div>
                              <div className="h-1.5 w-16 ml-auto mt-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${
                                    isOut
                                      ? 'bg-rose-500'
                                      : isLow
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{
                                    width: `${Math.min(100, Math.max(10, (item.quantity_available / maxQty) * 100))}%`,
                                  }}
                                />
                              </div>
                            </td>

                            {/* Reorder Lvl */}
                            <td className="py-3.5 px-4 text-right font-sans text-xs text-slate-600 whitespace-nowrap">
                              {item.reorder_level ?? 10}{' '}
                              <span className="text-[11px] text-slate-400">{item.unit}</span>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {isOut ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                  Out of Stock
                                </span>
                              ) : isLow ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Normal
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {hasPermission('manage_inventory') && !isTrashed && (
                                <button
                                  type="button"
                                  onClick={() => openTransaction(item, 'add')}
                                  title="Add stock"
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-sans font-semibold text-slate-700 transition hover:bg-slate-100 hover:border-slate-300 active:scale-95"
                                >
                                  <Plus className="h-3 w-3 text-emerald-600" />
                                  Stock In
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Monthly cycle check footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-slate-50/90 px-5 py-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono text-slate-700">
                      *Monthly cycle check: Next required physical bodega count on{' '}
                      <span className="font-bold text-slate-900">{auditCycle.nextCycleCheckDate}</span>
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    MSWDO & MDRRMO Prepositioned Relief System
                  </span>
                </div>
              </div>
            ) : (
              /* Grid Cards View */
              <div className="grid grid-cols-2 gap-3">
                {displayed.map((item) => {
                  const cfg = CAT_CFG[item.category] || CAT_CFG.other;
                  const isTrashed = item.status === 'trashed';
                  const stockState = getItemStockState(item);
                  const isLow = stockState === 'low';
                  const isOut = stockState === 'out';
                  const expiring = Boolean(expiringSoon.find((expiringItem) => expiringItem.id === item.id));
                  const isSelected = selectedItemId === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItemId(item.id)}
                      className={`text-left rounded-2xl border p-5 transition-all hover:shadow-md ${isSelected
                          ? 'border-slate-900 shadow-md'
                          : isTrashed
                            ? 'border-slate-300 bg-slate-50/80'
                            : isOut
                              ? 'border-rose-200 bg-rose-50/40'
                              : isLow
                                ? 'border-amber-200 bg-amber-50/30'
                                : 'border-slate-200/60 bg-white'
                        }`}
                    >
                      <div className="mb-3 flex items-start gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${cfg.bg}`}>
                          <span className={`h-3 w-3 rounded-full ${cfg.dot}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{item.item_name}</p>
                            {isTrashed ? (
                              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-300">
                                In trash
                              </span>
                            ) : isOut ? (
                              <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 ring-1 ring-rose-200">
                                Out of stock
                              </span>
                            ) : isLow ? (
                              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                                Low stock
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                Healthy
                              </span>
                            )}
                            {expiring ? (
                              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-200">
                                Expiring soon
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            {item.item_code ? <span>SKU {item.item_code}</span> : null}
                            {item.storage_location ? <span>{item.storage_location}</span> : null}
                          </div>
                          <span
                            className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.color} ring-1 ${cfg.ring}`}
                          >
                            <span className={`h-1 w-1 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </div>
                      </div>

                      <div className="mb-2">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs text-slate-500">Available stock</span>
                          <span className="text-lg font-bold text-slate-800">
                            {item.quantity_available}{' '}
                            <span className="text-sm font-normal text-slate-400">{item.unit}</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${isOut
                                ? 'bg-rose-400'
                                : isLow
                                  ? 'bg-amber-400'
                                  : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                              }`}
                            style={{ width: `${Math.min((item.quantity_available / maxQty) * 100, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                            Reorder
                          </p>
                          <p className="mt-1 font-semibold text-slate-700">
                            {item.reorder_level} {item.unit}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                            Expiration
                          </p>
                          <p className="mt-1 font-semibold text-slate-700">
                            {item.expiration_date || '--'}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
              <Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="mb-1 font-semibold text-slate-700">
                {inventoryView === 'trash' ? 'Trash is empty' : 'No items found'}
              </p>
              <p className="mb-5 text-sm text-slate-400">
                {inventoryView === 'trash'
                  ? 'Archived inventory items will appear here.'
                  : 'Clear filters or add your first item'}
              </p>
              {hasFilters ? (
                <button
                  onClick={() => {
                    setSearch('');
                    setFilterCat('all');
                    setFilterStock('all');
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">Item Detail</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {inventoryView === 'trash'
                    ? 'Review archived items, restore them, or delete them permanently.'
                    : 'Inspect the latest stock history and update counts professionally.'}
                </p>
              </div>
              {selectedItem ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {selectedItem.status === 'trashed' ? 'In Trash' : 'Selected'}
                </span>
              ) : null}
            </div>

            {selectedItem ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-base font-bold text-slate-900">{selectedItem.item_name}</p>
                  <div className="mt-2 grid gap-2 text-xs text-slate-500">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <span className="font-semibold text-slate-800">
                        {selectedItem.status === 'trashed' ? 'In Trash' : 'Active'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Current stock</span>
                      <span className="font-semibold text-slate-800">
                        {selectedItem.quantity_available} {selectedItem.unit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Reorder level</span>
                      <span className="font-semibold text-slate-800">
                        {selectedItem.reorder_level} {selectedItem.unit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Storage</span>
                      <span className="font-semibold text-slate-800">
                        {selectedItem.storage_location || '--'}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedItem.status === 'trashed' ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">This item is currently in Trash.</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Restore it to use it in stock operations again, or permanently delete it if you no longer need it.
                    </p>
                  </div>
                ) : null}

                {itemActionError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <p className="text-sm font-semibold text-rose-700">Action failed</p>
                    <p className="mt-1 text-xs text-rose-600">{itemActionError}</p>
                  </div>
                ) : null}

                {hasPermission('manage_inventory') ? (
                  selectedItem.status === 'trashed' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRestoreSelectedItem()}
                        disabled={isRestoringItem}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RefreshCcw className="h-4 w-4" />
                        {isRestoringItem ? 'Restoring…' : 'Restore Item'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePermanentlyDeleteSelectedItem()}
                        disabled={isPermanentlyDeletingItem}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        {isPermanentlyDeletingItem ? 'Deleting…' : 'Delete Permanently'}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => openTransaction(selectedItem, 'add')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                      >
                        <Plus className="h-4 w-4" />
                        Add Stock
                      </button>
                      <button
                        type="button"
                        onClick={() => openTransaction(selectedItem, 'adjust')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <PencilLine className="h-4 w-4" />
                        Adjust Count
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditItem(selectedItem)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                      >
                        <PencilLine className="h-4 w-4" />
                        Edit Details
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleArchiveSelectedItem()}
                        disabled={isDeletingItem}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        {isDeletingItem ? 'Moving…' : 'Move To Trash'}
                      </button>
                    </div>
                  )
                ) : null}

                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Stock Movement History</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {movementScope === 'all'
                          ? 'Showing all recent inventory transactions.'
                          : 'Showing the selected item only.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-full bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => setMovementScope('all')}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${movementScope === 'all'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                          All Items
                        </button>
                        <button
                          type="button"
                          onClick={() => setMovementScope('selected')}
                          disabled={!selectedItem}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${movementScope === 'selected'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          Selected
                        </button>
                      </div>
                      <span className="text-xs text-slate-400">{movements.length} recent</span>
                    </div>
                  </div>

                  {movements.length > 0 ? (
                    <div className="space-y-2">
                      {movements.map((movement) => {
                        const cfg = MOVEMENT_LABELS[movement.type];
                        const Icon = cfg.icon;
                        return (
                          <div
                            key={movement.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${cfg.tone}`}
                                >
                                  <Icon className="h-3 w-3" />
                                  {cfg.label}
                                </span>
                                <p className="mt-2 text-sm font-semibold text-slate-900">
                                  {movement.quantity} {movement.unit}
                                </p>
                                {movementScope === 'all' ? (
                                  <p className="mt-1 text-xs font-semibold text-slate-700">
                                    {movement.item_name}
                                  </p>
                                ) : null}
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {movement.previous_quantity} to {movement.new_quantity} {movement.unit}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-400">
                                  {movement.performed_by_name || 'System'} ·{' '}
                                  {new Date(movement.timestamp).toLocaleString('en-PH', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                            </div>
                            {movement.notes ? (
                              <p className="mt-2 text-xs text-slate-500">{movement.notes}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
                      {movementScope === 'selected'
                        ? 'No movement history yet for this item.'
                        : 'No transaction history found yet.'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400">
                {inventoryView === 'trash'
                  ? 'Select a trashed item to review its history, restore it, or delete it permanently.'
                  : 'Select an item card to inspect movements and adjust stock.'}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">Package Templates</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Reuse standard food packs and relief kits in distribution events.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                {displayedTemplates.length} template{displayedTemplates.length !== 1 ? 's' : ''}
              </span>
            </div>

            <form onSubmit={handleCreateTemplate} className="mt-4 space-y-3">
              <input
                type="text"
                required
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Template name"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
              <textarea
                rows={2}
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="Short description"
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />

              <div className="grid grid-cols-[minmax(0,1fr)_96px_auto] gap-2">
                <select
                  value={templateForm.selectedItemId}
                  onChange={(e) =>
                    setTemplateForm({ ...templateForm, selectedItemId: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.item_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={templateForm.quantity}
                  onChange={(e) => setTemplateForm({ ...templateForm, quantity: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <button
                  type="button"
                  onClick={addTemplateLine}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Add Line
                </button>
              </div>

              {templateForm.items.length > 0 ? (
                <div className="space-y-2">
                  {templateForm.items.map((item) => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="text-sm text-slate-700">
                        {item.item_name} · {item.quantity} {item.unit}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTemplateLine(item.item_id)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
                  Add items to build a reusable relief package.
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingTemplate || templateForm.items.length === 0}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingTemplate ? 'Saving Template…' : 'Save Package Template'}
              </button>
            </form>

            {displayedTemplates.length > 0 ? (
              <div className="mt-4 space-y-3">
                {displayedTemplates.map((template) => {
                  const readiness = blockedTemplates.find((entry) => entry.template.id === template.id);
                  return (
                    <div
                      key={template.id}
                      className={`rounded-2xl border px-4 py-3 ${readiness ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                          {template.description ? (
                            <p className="mt-0.5 text-xs text-slate-500">{template.description}</p>
                          ) : null}
                          {readiness ? (
                            <p className="mt-1 text-[11px] font-semibold text-amber-700">
                              Blocking items: {readiness.inventory_summary.blocking_items.map((item) => item.item_name).join(', ')}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {template.items.map((item) => (
                              <span
                                key={`${template.id}_${item.item_id}`}
                                className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200"
                              >
                                {item.item_name} · {item.quantity} {item.unit}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTemplate(template.id)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-rose-500"
                          title="Delete template"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {transactionItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setTransactionItem(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200/60 bg-white shadow-2xl shadow-slate-900/20">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-base font-bold text-slate-900">
                  {transactionMode === 'add' ? 'Add Stock' : 'Adjust Count'}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{transactionItem.item_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setTransactionItem(null)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitTransaction} className="space-y-4 p-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 space-y-2">
                {transactionMode === 'add' && items.filter((i) => i.status !== 'trashed').length > 1 && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-500">Bodega Relief Item</label>
                    <select
                      value={transactionItem.id}
                      onChange={(e) => {
                        const found = items.find((i) => i.id === e.target.value);
                        if (found) {
                          setTransactionItem(found);
                          setTransactionCount(String(found.quantity_available));
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    >
                      {items
                        .filter((i) => i.status !== 'trashed')
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.item_code ? `[${i.item_code}] ` : ''}{i.item_name} ({i.quantity_available} {i.unit})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Current Stock on Hand:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {transactionItem.quantity_available} {transactionItem.unit}
                  </span>
                </div>
              </div>

              {transactionMode === 'add' ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Quantity To Add
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={transactionQuantity}
                    onChange={(e) => setTransactionQuantity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    New Physical Count
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={transactionCount}
                    onChange={(e) => setTransactionCount(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Notes</label>
                <textarea
                  rows={3}
                  value={transactionNotes}
                  onChange={(e) => setTransactionNotes(e.target.value)}
                  placeholder={
                    transactionMode === 'add'
                      ? 'Reason for stock in'
                      : 'Why the count was adjusted'
                  }
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isSubmittingTransaction}
                  className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {isSubmittingTransaction
                    ? 'Saving...'
                    : transactionMode === 'add'
                      ? 'Save Stock In'
                      : 'Save Adjustment'}
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionItem(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setEditingItem(null)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200/60 bg-white shadow-2xl shadow-slate-900/20">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-base font-bold text-slate-900">Edit Inventory Details</p>
                <p className="mt-0.5 text-xs text-slate-400">{editingItem.item_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItemEdit} className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Item Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.item_name}
                    onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">SKU / Code</label>
                  <input
                    type="text"
                    value={editForm.item_code}
                    onChange={(e) => setEditForm({ ...editForm, item_code: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Category *</label>
                  <select
                    value={editForm.category}
                    onChange={(e) =>
                      setEditForm({ ...editForm, category: e.target.value as InventoryItem['category'] })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    {Object.entries(CAT_CFG).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Unit *</label>
                  <select
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value as InventoryItem['unit'] })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  >
                    {['pcs', 'kg', 'box', 'pack', 'bundle'].map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Reorder Level</label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.reorder_level}
                    onChange={(e) =>
                      setEditForm({ ...editForm, reorder_level: Number(e.target.value) || 0 })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Expiration</label>
                  <input
                    type="date"
                    value={editForm.expiration_date}
                    onChange={(e) => setEditForm({ ...editForm, expiration_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Storage Location</label>
                <input
                  type="text"
                  value={editForm.storage_location}
                  onChange={(e) => setEditForm({ ...editForm, storage_location: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Notes</label>
                <textarea
                  rows={3}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <p className="mt-2 text-[11px] text-slate-400">
                  Recommended: do not combine old and new food stock when expiration dates differ.
                  Track them as separate inventory lines or batches, then release older stock first.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {isSavingEdit ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {itemActionDialog ? (
        <AlertDialog
          open={Boolean(itemActionDialog)}
          onOpenChange={(open) => {
            if (!open && !getItemActionBusy(itemActionDialog.action)) {
              closeItemActionDialog();
            }
          }}
        >
          {(() => {
            const meta = getItemActionDialogMeta(itemActionDialog);
            if (!meta) return null;

            const Icon = meta.icon;
            const isBusy = getItemActionBusy(itemActionDialog.action);

            return (
              <AlertDialogContent className="max-w-xl overflow-hidden rounded-[30px] border border-slate-200/80 bg-white p-0 shadow-[0_32px_90px_-40px_rgba(15,23,42,0.45)]">
                <div className="relative overflow-hidden">
                  <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-br ${meta.surfaceTone}`} />
                  <div className="relative space-y-6 p-6 sm:p-7">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="flex items-start gap-4">
                        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] ${meta.iconTone}`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            {meta.eyebrow}
                          </p>
                          <AlertDialogTitle className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">
                            {meta.title}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
                            {meta.description}
                          </AlertDialogDescription>
                        </div>
                      </div>
                    </AlertDialogHeader>

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.8fr)]">
                      <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.25)] backdrop-blur">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Selected Item
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">
                          {itemActionDialog.itemName}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {itemActionDialog.action === 'archive'
                            ? 'Move this item out of the active stock list while keeping its records.'
                            : itemActionDialog.action === 'restore'
                              ? 'Bring this item back into active inventory operations.'
                              : 'Remove this item completely from your inventory database.'}
                        </p>
                      </div>

                      <div className="rounded-[24px] border border-slate-200/80 bg-slate-950 p-4 text-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.42)]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                          {meta.detailLabel}
                        </p>
                        <p className="mt-2 text-xl font-semibold tracking-[-0.02em]">
                          {meta.detailValue}
                        </p>
                        <p className="mt-1 text-sm text-white/70">
                          {meta.detailHint}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-4">
                      <p className="text-sm font-semibold text-slate-900">{meta.noteTitle}</p>
                      <p className="mt-1.5 text-sm leading-6 text-slate-600">{meta.noteBody}</p>
                    </div>

                    {itemActionError ? (
                      <div className="flex items-start gap-3 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-left">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                        <div>
                          <p className="text-sm font-semibold text-rose-700">Action failed</p>
                          <p className="mt-1 text-sm text-rose-600">{itemActionError}</p>
                        </div>
                      </div>
                    ) : null}

                    <AlertDialogFooter className="flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
                      <AlertDialogCancel
                        disabled={isBusy}
                        onClick={() => closeItemActionDialog()}
                        className="rounded-2xl border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={isBusy}
                        onClick={(event) => {
                          event.preventDefault();
                          void handleConfirmItemAction();
                        }}
                        className={`rounded-2xl px-5 py-2.5 text-sm font-semibold ${meta.actionClassName}`}
                      >
                        {isBusy ? meta.actionPendingLabel : meta.actionLabel}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </div>
                </div>
              </AlertDialogContent>
            );
          })()}
        </AlertDialog>
      ) : null}
    </div>
  );
}

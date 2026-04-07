'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  Package,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import MapLocationPicker from '@/components/MapLocationPicker';
import { createDistributionEvent } from '@/lib/db/distribution';
import { getInventoryItems, getPackageTemplates } from '@/lib/db/inventory';
import type {
  DistributedItem,
  DistributionTargetGroup,
  DistributionTargetScope,
  DistributionType,
  InventoryItem,
  PackageTemplate,
} from '@/lib/db/schema';

const EVENT_TYPES: { value: DistributionType; label: string; desc: string; color: string }[] = [
  {
    value: 'regular',
    label: 'Regular',
    desc: 'Scheduled community distribution',
    color: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  },
  {
    value: 'emergency',
    label: 'Emergency',
    desc: 'Urgent response relief',
    color: 'border-amber-300 bg-amber-50 text-amber-700',
  },
  {
    value: 'disaster_relief',
    label: 'Disaster Relief',
    desc: 'Post-disaster assistance',
    color: 'border-red-300 bg-red-50 text-red-700',
  },
];

const TARGET_SCOPES: {
  value: DistributionTargetScope;
  label: string;
  desc: string;
  icon: typeof Users;
}[] = [
  {
    value: 'household',
    label: 'Household',
    desc: 'Food packs, relief goods, family kits',
    icon: Users,
  },
  {
    value: 'resident',
    label: 'Resident',
    desc: 'Senior, pregnant, PWD, child support',
    icon: ShieldCheck,
  },
];

const TARGET_GROUPS: { value: DistributionTargetGroup; label: string; desc: string }[] = [
  { value: 'all', label: 'All', desc: 'Serve all eligible targets' },
  { value: 'senior', label: 'Senior', desc: '60 years old and above' },
  { value: 'pwd', label: 'PWD', desc: 'Persons with disability' },
  { value: 'pregnant', label: 'Pregnant', desc: 'Maternal support' },
  { value: 'minor', label: 'Minor', desc: 'Ages 0 to 17' },
  { value: 'low_income', label: 'Low Income', desc: 'Income-priority support' },
];

const DISTRIBUTION_NAMES = [
  'Food Pack Distribution',
  'General Relief Distribution',
  'Senior Relief',
  'PWD Assistance',
  'Maternal Health',
  'Child Support',
  'Emergency Family Kit',
  'Medical Assistance',
];

export default function NewDistributionPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [packageTemplates, setPackageTemplates] = useState<PackageTemplate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [packageItemId, setPackageItemId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [packageQuantity, setPackageQuantity] = useState('1');

  const [form, setForm] = useState({
    event_name: '',
    type: 'regular' as DistributionType,
    target_scope: 'household' as DistributionTargetScope,
    target_group: 'all' as DistributionTargetGroup,
    package_items: [] as DistributedItem[],
    location: '',
    gps_lat: null as number | null,
    gps_lng: null as number | null,
    scheduled_date: '',
    status: 'planned' as const,
    notes: '',
  });

  useEffect(() => {
    if (!user || !hasPermission('manage_inventory')) {
      router.push('/distribution');
      return;
    }

    async function loadInventory() {
      try {
        setIsLoadingInventory(true);
        const [items, templates] = await Promise.all([
          getInventoryItems(),
          getPackageTemplates(),
        ]);
        const activeItems = items.filter((item) => item.quantity_available > 0);
        setInventoryItems(activeItems);
        setPackageTemplates(templates);
        if (activeItems[0]) {
          setPackageItemId(activeItems[0].id);
        }
        if (templates[0]) {
          setSelectedTemplateId(templates[0].id);
        }
      } finally {
        setIsLoadingInventory(false);
      }
    }

    loadInventory();
  }, [user, router]);

  const selectedInventoryItem = useMemo(
    () => inventoryItems.find((item) => item.id === packageItemId),
    [inventoryItems, packageItemId],
  );
  const selectedTemplate = useMemo(
    () => packageTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [packageTemplates, selectedTemplateId],
  );

  function setField<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  }

  function handleLocationChange(address: string, coords: { lat: number; lng: number }) {
    setForm((current) => ({
      ...current,
      location: address,
      gps_lat: coords.lat,
      gps_lng: coords.lng,
    }));
    setError('');
  }

  function handleAddPackageItem() {
    if (!selectedInventoryItem) {
      setError('Select an inventory item first.');
      return;
    }

    const quantity = Number(packageQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Package quantity must be greater than zero.');
      return;
    }

    if (quantity > selectedInventoryItem.quantity_available) {
      setError(
        `Only ${selectedInventoryItem.quantity_available} ${selectedInventoryItem.unit} available for ${selectedInventoryItem.item_name}.`,
      );
      return;
    }

    setForm((current) => {
      const existingIndex = current.package_items.findIndex(
        (item) => item.item_id === selectedInventoryItem.id,
      );

      if (existingIndex === -1) {
        return {
          ...current,
          package_items: [
            ...current.package_items,
            {
              item_id: selectedInventoryItem.id,
              item_name: selectedInventoryItem.item_name,
              unit: selectedInventoryItem.unit,
              quantity,
            },
          ],
        };
      }

      const updatedItems = [...current.package_items];
      const nextQuantity = updatedItems[existingIndex].quantity + quantity;

      if (nextQuantity > selectedInventoryItem.quantity_available) {
        setError(
          `Combined package quantity for ${selectedInventoryItem.item_name} exceeds available stock.`,
        );
        return current;
      }

      updatedItems[existingIndex] = {
        ...updatedItems[existingIndex],
        quantity: nextQuantity,
      };

      return {
        ...current,
        package_items: updatedItems,
      };
    });

    setPackageQuantity('1');
    setError('');
  }

  function handleRemovePackageItem(itemId: string) {
    setForm((current) => ({
      ...current,
      package_items: current.package_items.filter((item) => item.item_id !== itemId),
    }));
    setError('');
  }

  function handleApplyTemplate() {
    if (!selectedTemplate) {
      setError('Select a package template first.');
      return;
    }

    setForm((current) => ({
      ...current,
      package_items: selectedTemplate.items.map((item) => ({ ...item })),
    }));
    setError('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;

    if (!form.event_name.trim()) {
      setError('Event name is required.');
      return;
    }

    if (!form.location.trim()) {
      setError('Please pin a location on the map.');
      return;
    }

    if (!form.scheduled_date) {
      setError('Scheduled date is required.');
      return;
    }

    if (form.package_items.length === 0) {
      setError('Add at least one package item before creating the event.');
      return;
    }

    try {
      setIsSubmitting(true);

      await createDistributionEvent(
        {
          event_name: form.event_name.trim(),
          type: form.type,
          target_scope: form.target_scope,
          target_group: form.target_group,
          package_items: form.package_items,
          location: form.location.trim(),
          gps_lat: form.gps_lat ?? undefined,
          gps_lng: form.gps_lng ?? undefined,
          scheduled_date: form.scheduled_date,
          status: form.status,
          notes: form.notes.trim() || undefined,
        },
        user.id,
      );

      setSuccess(true);
      setTimeout(() => router.push('/distribution'), 1200);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create event.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/distribution"
            className="-ml-2 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Back to Distribution"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-none text-slate-900">New Distribution Event</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Configure the target, package, and pinned location before release.
            </p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50">
            <Package className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {success ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 shadow-lg shadow-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-slate-900">Event Created!</p>
            <p className="mt-1 text-sm text-slate-400">Redirecting to Distribution…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-3 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Event Type</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {EVENT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setField('type', type.value)}
                    className={`flex flex-col items-start rounded-xl border-2 p-3 text-left transition-all ${
                      form.type === type.value
                        ? `${type.color} border-current`
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold">{type.label}</span>
                    <span className="mt-0.5 text-[10px] leading-tight opacity-80">{type.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Event Details
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Event Name <span className="text-red-400">*</span>
                </label>
                <input
                  list="event-name-suggestions"
                  type="text"
                  placeholder="e.g. Food Pack Distribution - Purok 3"
                  value={form.event_name}
                  onChange={(e) => setField('event_name', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <datalist id="event-name-suggestions">
                  {DISTRIBUTION_NAMES.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    Scheduled Date <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.scheduled_date}
                    onChange={(e) => setField('scheduled_date', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Initial Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value as typeof form.status)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="planned">Planned</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Distribution Rules
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Choose whether the package is claimed per household or per resident, then set
                  the target group.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {TARGET_SCOPES.map((scope) => {
                  const Icon = scope.icon;
                  const active = form.target_scope === scope.value;

                  return (
                    <button
                      key={scope.value}
                      type="button"
                      onClick={() => setField('target_scope', scope.value)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        active
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`rounded-xl p-2 ${
                            active ? 'bg-white text-emerald-600' : 'bg-white text-slate-400'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{scope.label}</p>
                          <p className="mt-0.5 text-[11px] leading-tight opacity-80">
                            {scope.desc}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-600">
                  Target Group <span className="text-red-400">*</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {TARGET_GROUPS.map((group) => {
                    const active = form.target_group === group.value;
                    return (
                      <button
                        key={group.value}
                        type="button"
                        onClick={() => setField('target_group', group.value)}
                        className={`rounded-xl border px-3 py-3 text-left transition-all ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <p className="text-sm font-semibold">{group.label}</p>
                        <p
                          className={`mt-1 text-[11px] leading-tight ${
                            active ? 'text-white/80' : 'text-slate-400'
                          }`}
                        >
                          {group.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Package Items
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Build the default package once. Each release will deduct this exact bundle from
                    inventory.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  {form.package_items.length} item{form.package_items.length !== 1 ? 's' : ''}
                </span>
              </div>

              {packageTemplates.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      {packageTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleApplyTemplate}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Apply Template
                    </button>
                  </div>
                  {selectedTemplate?.description ? (
                    <p className="mt-2 text-[11px] text-slate-500">{selectedTemplate.description}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                <select
                  value={packageItemId}
                  onChange={(e) => setPackageItemId(e.target.value)}
                  disabled={isLoadingInventory || inventoryItems.length === 0}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                >
                  {inventoryItems.length === 0 ? (
                    <option value="">No inventory items available</option>
                  ) : (
                    inventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item_name} · {item.quantity_available} {item.unit} available
                      </option>
                    ))
                  )}
                </select>

                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={packageQuantity}
                  onChange={(e) => setPackageQuantity(e.target.value)}
                  placeholder="Qty"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />

                <button
                  type="button"
                  onClick={handleAddPackageItem}
                  disabled={inventoryItems.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {selectedInventoryItem ? (
                <p className="text-[11px] text-slate-400">
                  Selected: {selectedInventoryItem.item_name} · {selectedInventoryItem.quantity_available}{' '}
                  {selectedInventoryItem.unit} available
                </p>
              ) : null}

              {form.package_items.length > 0 ? (
                <div className="space-y-2">
                  {form.package_items.map((item) => {
                    const stock = inventoryItems.find((inventoryItem) => inventoryItem.id === item.item_id);

                    return (
                      <div
                        key={item.item_id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.item_name || 'Inventory item'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            Package: {item.quantity} {item.unit}
                            {stock ? ` · Stock left now: ${stock.quantity_available} ${stock.unit}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePackageItem(item.item_id)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-rose-500"
                          title="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  No package items yet. Add rice, sardines, noodles, or other supplies from
                  inventory.
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Location <span className="text-red-400">*</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Search an address or click the map to drop a pin.
                </p>
              </div>
              <MapLocationPicker onLocationChange={handleLocationChange} />
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                <FileText className="h-3.5 w-3.5" />
                Notes <span className="normal-case font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                rows={3}
                placeholder="Any additional information about this event…"
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {error ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                {error}
              </div>
            ) : null}

            <div className="flex gap-3 pb-8">
              <button
                type="submit"
                disabled={isSubmitting || isLoadingInventory}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:-translate-y-px hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4" />
                    Create Event
                  </>
                )}
              </button>
              <Link
                href="/distribution"
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

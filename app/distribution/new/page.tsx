'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
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
import { getAnalyticsScopeLabel } from '@/lib/analytics-scope';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import MapLocationPicker from '@/components/MapLocationPicker';
import { buildDistributionInventorySummary } from '@/lib/distribution-insights';
import {
  createDistributionEvent,
  getDistributionAudienceStats,
  type DistributionAudienceStats,
} from '@/lib/db/distribution';
import { BARANGAY_OPTIONS, MABINI_MUNICIPALITY } from '@/lib/barangays';
import { getInventoryItems, getPackageTemplates } from '@/lib/db/inventory';
import { getLocationMasterLists } from '@/lib/db/location-master';
import type {
  DistributedItem,
  DistributionTargetGroup,
  DistributionTargetScope,
  DistributionType,
  InventoryItem,
  LocationMasterList,
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

const TARGET_GROUP_PROGRAMS: Record<DistributionTargetGroup, { sector: string; program: string }> = {
  all: {
    sector: 'General community sector',
    program: 'General relief distribution for all eligible beneficiaries in scope.',
  },
  senior: {
    sector: 'Senior citizens sector',
    program: 'Senior citizen assistance and age-priority relief support.',
  },
  pwd: {
    sector: 'Persons with disability sector',
    program: 'PWD support assistance and accessibility-priority relief.',
  },
  pregnant: {
    sector: 'Maternal care sector',
    program: 'Pregnancy and maternal support assistance.',
  },
  minor: {
    sector: 'Children and minors sector',
    program: 'Child-focused assistance for residents ages 0 to 17.',
  },
  low_income: {
    sector: 'Low-income households sector',
    program: 'Income-priority household assistance.',
  },
};

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
  const [barangayOptions, setBarangayOptions] = useState<LocationMasterList[]>([]);
  const [packageItemId, setPackageItemId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [packageQuantity, setPackageQuantity] = useState('1');
  const [audienceStats, setAudienceStats] = useState<DistributionAudienceStats | null>(null);
  const [isLoadingAudience, setIsLoadingAudience] = useState(false);

  const fallbackBarangayOptions = useMemo<LocationMasterList[]>(
    () => BARANGAY_OPTIONS.map((barangay) => ({
      id: barangay.id,
      barangay_id: barangay.id,
      barangay_name: barangay.label,
      municipality: MABINI_MUNICIPALITY,
      puroks: [],
      updatedAt: new Date(0),
    })),
    [],
  );

  const [form, setForm] = useState({
    event_name: '',
    type: 'regular' as DistributionType,
    target_scope: 'household' as DistributionTargetScope,
    target_group: 'all' as DistributionTargetGroup,
    package_items: [] as DistributedItem[],
    barangay_id: '',
    location: '',
    gps_lat: null as number | null,
    gps_lng: null as number | null,
    scheduled_date: '',
    status: 'planned' as const,
    notes: '',
  });
  const audienceScopeLabel = useMemo(
    () => getAnalyticsScopeLabel(user),
    [user],
  );
  const selectedBarangay = useMemo(
    () => barangayOptions.find((barangay) => barangay.barangay_id === form.barangay_id) ?? null,
    [barangayOptions, form.barangay_id],
  );
  const selectedAudienceScopeLabel = useMemo(() => {
    if (selectedBarangay?.barangay_name) {
      return selectedBarangay.barangay_name;
    }

    return form.barangay_id || audienceScopeLabel;
  }, [selectedBarangay, form.barangay_id, audienceScopeLabel]);
  const packageInventorySummary = useMemo(
    () => buildDistributionInventorySummary(form.package_items, inventoryItems),
    [form.package_items, inventoryItems],
  );

  const loadAudiencePreview = useCallback(async () => {
    if (!user) {
      setAudienceStats(null);
      return;
    }

    if (!form.barangay_id) {
      setAudienceStats(null);
      return;
    }

    try {
      setIsLoadingAudience(true);
      const stats = await getDistributionAudienceStats({
        barangay_id: form.barangay_id,
        target_group: form.target_group,
        target_scope: form.target_scope,
        scope_label: selectedAudienceScopeLabel,
      });
      setAudienceStats(stats);
    } finally {
      setIsLoadingAudience(false);
    }
  }, [form.barangay_id, form.target_group, form.target_scope, selectedAudienceScopeLabel, user]);

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
        const masterLists = await getLocationMasterLists();
        const nextBarangayOptions = masterLists.length > 0 ? masterLists : fallbackBarangayOptions;
        const activeItems = items.filter((item) => item.quantity_available > 0);
        setInventoryItems(activeItems);
        setPackageTemplates(templates);
        setBarangayOptions(nextBarangayOptions);
        setForm((current) => {
          const encoderBarangayId = user.role !== 'admin' ? user.barangay_id : '';
          const defaultBarangayId = encoderBarangayId || current.barangay_id || nextBarangayOptions[0]?.barangay_id || '';
          return defaultBarangayId === current.barangay_id
            ? current
            : { ...current, barangay_id: defaultBarangayId };
        });
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
  }, [fallbackBarangayOptions, user, router]);

  useEffect(() => {
    if (!user || !hasPermission('manage_inventory')) {
      return;
    }

    void loadAudiencePreview();
  }, [loadAudiencePreview, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    function handleDataChanged(event: CustomEvent<{ table: string }>) {
      if (!['households', 'residents', 'vulnerability_flags'].includes(event.detail.table)) {
        return;
      }

      void loadAudiencePreview();
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged as EventListener);
    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged as EventListener);
    };
  }, [loadAudiencePreview, user]);

  const selectedInventoryItem = useMemo(
    () => inventoryItems.find((item) => item.id === packageItemId),
    [inventoryItems, packageItemId],
  );
  const selectedTemplate = useMemo(
    () => packageTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [packageTemplates, selectedTemplateId],
  );
  const selectedTargetGroupLabel = useMemo(
    () => TARGET_GROUPS.find((group) => group.value === form.target_group)?.label ?? 'All',
    [form.target_group],
  );
  const selectedTargetGroupProgram = useMemo(
    () => TARGET_GROUP_PROGRAMS[form.target_group],
    [form.target_group],
  );

  function setField<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  }

  function handleTargetScopeSelect(nextScope: DistributionTargetScope) {
    setField('target_scope', nextScope);
  }

  function handleTargetGroupSelect(nextGroup: DistributionTargetGroup) {
    setForm((current) => ({
      ...current,
      target_group: nextGroup,
      target_scope: current.target_scope,
    }));
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

    if (!form.barangay_id.trim()) {
      setError('Select the barangay that will receive this event.');
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

    if (packageInventorySummary.blocking_items.length > 0) {
      setError(
        `Restock required before creating this event: ${packageInventorySummary.blocking_items
          .map((item) => item.item_name)
          .join(', ')}.`,
      );
      return;
    }

    try {
      setIsSubmitting(true);

      await createDistributionEvent(
        {
          event_name: form.event_name.trim(),
          barangay_id: form.barangay_id,
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

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Target Barangay <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.barangay_id}
                  onChange={(e) => setField('barangay_id', e.target.value)}
                  disabled={user.role !== 'admin'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {!form.barangay_id && <option value="">Select barangay</option>}
                  {barangayOptions.map((barangay) => (
                    <option key={barangay.barangay_id} value={barangay.barangay_id}>
                      {barangay.barangay_name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  {user.role === 'admin'
                    ? 'Only the selected barangay will qualify for this event.'
                    : 'Your account is limited to your assigned barangay.'}
                </p>
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
                      onClick={() => handleTargetScopeSelect(scope.value)}
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
                            {scope.value === 'household'
                              ? 'One package per qualifying household, even when only some members match.'
                              : scope.desc}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-600">
                  Sector / Target Group <span className="text-red-400">*</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {TARGET_GROUPS.map((group) => {
                    const active = form.target_group === group.value;
                    return (
                      <button
                        key={group.value}
                        type="button"
                        onClick={() => handleTargetGroupSelect(group.value)}
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

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Selected Sector Program
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {selectedTargetGroupProgram.sector}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  {selectedTargetGroupProgram.program}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Audience Preview
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-emerald-800/80">
                      {form.target_group === 'all'
                          ? `This event will show all ${form.target_scope === 'resident' ? 'residents' : 'eligible households'} in ${selectedAudienceScopeLabel}.`
                        : form.target_scope === 'household'
                          ? `This event will show households in ${selectedAudienceScopeLabel} that have at least one ${selectedTargetGroupLabel.toLowerCase()} member.`
                          : `This event will only show ${selectedTargetGroupLabel.toLowerCase()} ${form.target_scope === 'resident' ? 'residents' : 'households with matching members'} in ${selectedAudienceScopeLabel}.`}
                    </p>
                  </div>
                  {isLoadingAudience ? <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> : null}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-3">
                    <p className="text-2xl font-bold text-slate-900">
                      {audienceStats?.eligibility_summary.eligible_households ?? 0}
                    </p>
                    <p className="text-xs font-medium text-slate-500">Matching Households</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-3">
                    <p className="text-2xl font-bold text-slate-900">
                      {audienceStats?.eligibility_summary.eligible_residents ?? 0}
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      {form.target_group === 'all'
                        ? 'Residents in Scope'
                        : `${selectedTargetGroupLabel} Matches`}
                    </p>
                  </div>
                </div>

                {audienceStats?.eligibility_summary.match_support ? (
                  <p className="mt-3 text-[11px] text-emerald-900/75">
                    {audienceStats.eligibility_summary.match_support}
                  </p>
                ) : null}

                {selectedBarangay ? (
                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/80 p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Selected Barangay
                    </p>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{selectedBarangay.barangay_name}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Only households and residents from this barangay will be included in the event audience.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Master List of Recipients
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Preview the exact {form.target_scope === 'household' ? 'households' : 'residents'} currently qualified for this selected barangay and sector.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                      {audienceStats?.audience_master_list.length ?? 0} record{(audienceStats?.audience_master_list.length ?? 0) === 1 ? '' : 's'}
                    </span>
                  </div>

                  {audienceStats?.audience_master_list.length ? (
                    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                      {audienceStats.audience_master_list.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <p className="text-sm font-semibold text-slate-900">{entry.primary_text}</p>
                          <p className="mt-1 text-xs text-slate-500">{entry.secondary_text}</p>
                          <p className="mt-2 text-[11px] text-emerald-800/80">{entry.qualification_text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                      No matching {form.target_scope === 'household' ? 'households' : 'residents'} found yet for this barangay and sector.
                    </div>
                  )}
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
                <div className="space-y-3">
                  {form.package_items.map((item) => {
                    const stockLine = packageInventorySummary.lines.find(
                      (inventoryItem) => inventoryItem.item_id === item.item_id,
                    );

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
                            {stockLine
                              ? ` · Stock left now: ${stockLine.available} ${stockLine.unit}`
                              : ''}
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

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Inventory Readiness
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {packageInventorySummary.available_packages} full package
                          {packageInventorySummary.available_packages !== 1 ? 's' : ''} available
                        </p>
                      </div>
                      {packageInventorySummary.low_stock_items.length > 0 ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-700">
                          {packageInventorySummary.low_stock_items.length} low stock
                        </span>
                      ) : null}
                    </div>

                    {packageInventorySummary.blocking_items.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                          <p>
                            This package cannot be fulfilled yet. Restock{' '}
                            {packageInventorySummary.blocking_items.map((item) => item.item_name).join(', ')}.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {packageInventorySummary.low_stock_items.length > 0 ? (
                      <p className="mt-3 text-[11px] text-amber-700">
                        Low stock after release warning: {packageInventorySummary.low_stock_items.map((item) => item.item_name).join(', ')}.
                      </p>
                    ) : null}
                  </div>
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
                disabled={isSubmitting || isLoadingInventory || packageInventorySummary.blocking_items.length > 0}
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { PurokFloodProfileCard } from '@/components/PurokFloodProfileCard';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getAllPuroks, getHousehold, updateHousehold } from '@/lib/db/households';
import { getPurokRiskProfile } from '@/lib/db/purok-risk-profiles';
import {
  getResidentsInHousehold, createResident, updateResident,
  deleteResident, getResidentVulnerabilityFlags, verifyResident, updateHealthFlags,
} from '@/lib/db/residents';
import { calculateAge, getPregnancyProgress } from '@/lib/db/vulnerability';
import { type DisasterRiskLevel, type FollowUpStatus, type HazardType, type PWDType, Household, PurokRiskProfile, Resident, VulnerabilityFlags } from '@/lib/db/schema';
import { mergePurokOptions, normalizePurokSitio } from '@/lib/geocoding';
import {
  DISASTER_RISK_LEVEL_LABELS,
  HAZARD_LABELS,
  parseHazardTags,
} from '@/lib/disaster-alerts';
import { MABINI_MUNICIPALITY } from '@/lib/barangays';
import {
  ArrowLeft, Plus, Edit2, Trash2, Save, X, User, MapPin,
  Phone, Home, CheckCircle2, AlertTriangle, ChevronDown, Navigation,
} from 'lucide-react';
import { LocationPicker } from '@/components/LocationPicker';

interface ResidentWithFlags { resident: Resident; flags: VulnerabilityFlags | undefined; }

const CIVIL_STATUSES = ['single', 'married', 'widowed', 'separated'] as const;
const HOUSEHOLD_STATUSES = ['active', 'moved_out', 'deceased'] as const;
const HOUSEHOLD_HAZARD_OPTIONS: HazardType[] = [
  'flood',
  'typhoon',
  'landslide',
  'storm_surge',
  'fire',
  'earthquake',
];
const DISASTER_RISK_OPTIONS: DisasterRiskLevel[] = ['low', 'medium', 'high'];
const FOLLOW_UP_STATUS_OPTIONS: Array<{ value: FollowUpStatus; label: string }> = [
  { value: 'none', label: 'No follow-up' },
  { value: 'needs_visit', label: 'Needs visit' },
  { value: 'visited', label: 'Visited' },
  { value: 'referred', label: 'Referred' },
  { value: 'resolved', label: 'Resolved' },
];
const PWD_TYPE_OPTIONS: Array<{ value: PWDType; label: string }> = [
  { value: 'physical', label: 'Physical' },
  { value: 'visual', label: 'Visual' },
  { value: 'hearing', label: 'Hearing' },
  { value: 'intellectual', label: 'Intellectual' },
  { value: 'psychosocial', label: 'Psychosocial' },
];
type HHStatus = typeof HOUSEHOLD_STATUSES[number];

const emptyResidentForm = {
  full_name: '', birthdate: '', gender: 'M' as 'M' | 'F',
  relationship_to_head: '', civil_status: 'single' as const, occupation: '',
};

const emptyHealthForm = {
  is_pregnant: false,
  pregnancy_months: '' as number | '',
  expected_delivery_date: '',
  is_pwd: false,
  pwd_type: '' as PWDType | '',
  has_chronic_illness: false,
  chronic_conditions: '',
  follow_up_status: 'none' as FollowUpStatus,
  medical_notes: '',
};

export default function HouseholdDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const user = getCurrentUser();
  const householdId = params.id as string;

  const [household, setHousehold] = useState<Household | null>(null);
  const [residents, setResidents] = useState<ResidentWithFlags[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Household edit state
  const [isEditingHH, setIsEditingHH] = useState(false);
  const [hhForm, setHhForm] = useState({
    head_name: '',
    street_address: '',
    purok_sitio: '',
    municipality: MABINI_MUNICIPALITY,
    contact_number: '',
    status: 'active' as typeof HOUSEHOLD_STATUSES[number],
    gps_lat: undefined as number | undefined,
    gps_long: undefined as number | undefined,
    hazard_tags: [] as HazardType[],
    disaster_risk_level: 'medium' as DisasterRiskLevel,
    evacuation_site: '',
    special_assistance_notes: '',
  });
  const [isSavingHH, setIsSavingHH] = useState(false);
  const [purokOptions, setPurokOptions] = useState<string[]>([]);
  const [purokRiskProfile, setPurokRiskProfile] = useState<PurokRiskProfile | null>(null);

  // Resident add / edit state
  const [showAddResident, setShowAddResident] = useState(false);
  const [editingResidentId, setEditingResidentId] = useState<string | null>(null);
  const [residentForm, setResidentForm] = useState(emptyResidentForm);
  const [isSavingResident, setIsSavingResident] = useState(false);
  const [editingHealthResidentId, setEditingHealthResidentId] = useState<string | null>(null);
  const [healthForm, setHealthForm] = useState(emptyHealthForm);
  const [isSavingHealth, setIsSavingHealth] = useState(false);

  // Delete confirmation
  const [deletingResidentId, setDeletingResidentId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState<'moved_out' | 'deceased'>('moved_out');

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }

  const canViewHouseholdDetails = hasPermission('view_households') || hasPermission('view_residents');

  useEffect(() => {
    if (!user || !canViewHouseholdDetails) { router.push('/dashboard'); return; }
    loadData();
  }, [user, router, householdId, canViewHouseholdDetails]);

  async function loadData() {
    try {
      setIsLoading(true);
      const hh = await getHousehold(householdId);
      if (!hh) { router.push('/households'); return; }
      const nextPurokOptions = await getAllPuroks(hh.barangay_id);
      const profile = await getPurokRiskProfile(hh.barangay_id, hh.purok_sitio);
      setHousehold(hh);
      setPurokOptions(mergePurokOptions([...nextPurokOptions, hh.purok_sitio]));
      setPurokRiskProfile(profile ?? null);
      setHhForm({
        head_name: hh.head_name,
        street_address: hh.street_address ?? '',
        purok_sitio: normalizePurokSitio(hh.purok_sitio),
        municipality: MABINI_MUNICIPALITY,
        contact_number: hh.contact_number ?? '',
        status: hh.status as typeof HOUSEHOLD_STATUSES[number],
        gps_lat: hh.gps_lat,
        gps_long: hh.gps_long,
        hazard_tags: parseHazardTags(hh.hazard_tags),
        disaster_risk_level: hh.disaster_risk_level ?? 'medium',
        evacuation_site: hh.evacuation_site ?? '',
        special_assistance_notes: hh.special_assistance_notes ?? '',
      });
      const list = await getResidentsInHousehold(householdId);
      const withFlags = await Promise.all(list.map(async r => ({ resident: r, flags: await getResidentVulnerabilityFlags(r.id) })));
      setResidents(withFlags);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  }

  useEffect(() => {
    if (!household) {
      setPurokRiskProfile(null);
      return;
    }

    const normalizedPurok = normalizePurokSitio(hhForm.purok_sitio);
    if (!normalizedPurok) {
      setPurokRiskProfile(null);
      return;
    }

    let cancelled = false;

    async function loadPurokProfile() {
      try {
        const profile = await getPurokRiskProfile(household!.barangay_id, normalizedPurok);
        if (!cancelled) {
          setPurokRiskProfile(profile ?? null);
        }
      } catch {
        if (!cancelled) {
          setPurokRiskProfile(null);
        }
      }
    }

    void loadPurokProfile();

    return () => {
      cancelled = true;
    };
  }, [hhForm.purok_sitio, household]);

  // ── Household save ──────────────────────────────────────────────────────────
  async function handleSaveHousehold() {
    const normalizedPurok = normalizePurokSitio(hhForm.purok_sitio);
    if (!household || !hhForm.head_name.trim() || !normalizedPurok) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    setIsSavingHH(true);
    try {
      const updatedHousehold = await updateHousehold(household.id, {
        head_name: hhForm.head_name.trim(),
        street_address: hhForm.street_address.trim(),
        purok_sitio: normalizedPurok,
        municipality: MABINI_MUNICIPALITY,
        contact_number: hhForm.contact_number.trim(),
        status: hhForm.status,
        gps_lat: hhForm.gps_lat,
        gps_long: hhForm.gps_long,
        hazard_tags: parseHazardTags(hhForm.hazard_tags),
        disaster_risk_level: hhForm.disaster_risk_level,
        evacuation_site: hhForm.evacuation_site.trim(),
        special_assistance_notes: hhForm.special_assistance_notes.trim(),
        disaster_profile_updated_at: new Date(),
      });
      setPurokOptions((current) => mergePurokOptions([...current, normalizedPurok]));
      setHousehold(updatedHousehold);
      setHhForm({
        head_name: updatedHousehold.head_name,
        street_address: updatedHousehold.street_address ?? '',
        purok_sitio: normalizePurokSitio(updatedHousehold.purok_sitio),
        municipality: MABINI_MUNICIPALITY,
        contact_number: updatedHousehold.contact_number ?? '',
        status: updatedHousehold.status as HHStatus,
        gps_lat: updatedHousehold.gps_lat,
        gps_long: updatedHousehold.gps_long,
        hazard_tags: parseHazardTags(updatedHousehold.hazard_tags),
        disaster_risk_level: updatedHousehold.disaster_risk_level ?? 'medium',
        evacuation_site: updatedHousehold.evacuation_site ?? '',
        special_assistance_notes: updatedHousehold.special_assistance_notes ?? '',
      });
      setIsEditingHH(false);
      showToast('Household updated successfully.');
    } catch { showToast('Failed to save changes.', 'error'); } finally { setIsSavingHH(false); }
  }

  // ── Resident add / edit ─────────────────────────────────────────────────────
  function openEditResident(r: Resident) {
    setEditingResidentId(r.id);
    setResidentForm({
      full_name: r.full_name,
      birthdate: r.birthdate,
      gender: r.gender,
      relationship_to_head: r.relationship_to_head ?? '',
      civil_status: (r.civil_status as any) ?? 'single',
      occupation: r.occupation ?? '',
    });
    setShowAddResident(false);
    setEditingHealthResidentId(null);
  }

  function openAddResident() {
    setEditingResidentId(null);
    setEditingHealthResidentId(null);
    setResidentForm(emptyResidentForm);
    setShowAddResident(true);
  }

  function openEditHealth(resident: Resident, flags?: VulnerabilityFlags) {
    setEditingHealthResidentId(resident.id);
    setEditingResidentId(null);
    setShowAddResident(false);
    setHealthForm({
      is_pregnant: Boolean(flags?.is_pregnant),
      pregnancy_months: typeof flags?.pregnancy_months === 'number' ? flags.pregnancy_months : '',
      expected_delivery_date: flags?.expected_delivery_date ?? '',
      is_pwd: Boolean(flags?.is_pwd),
      pwd_type: flags?.pwd_type ?? '',
      has_chronic_illness: Boolean(flags?.has_chronic_illness),
      chronic_conditions: flags?.chronic_conditions?.join(', ') ?? '',
      follow_up_status: flags?.follow_up_status ?? 'none',
      medical_notes: flags?.medical_notes ?? '',
    });
  }

  async function handleSaveResident(e: React.FormEvent) {
    e.preventDefault();
    if (!residentForm.full_name.trim() || !residentForm.birthdate) {
      showToast('Full name and birthdate are required.', 'error');
      return;
    }
    setIsSavingResident(true);
    try {
      if (editingResidentId) {
        await updateResident(editingResidentId, {
          ...residentForm,
          full_name: residentForm.full_name.trim(),
        });
        const flags = await getResidentVulnerabilityFlags(editingResidentId);
        setResidents(prev => prev.map(rw =>
          rw.resident.id === editingResidentId
            ? { resident: { ...rw.resident, ...residentForm }, flags }
            : rw
        ));
        setEditingResidentId(null);
        showToast('Member updated.');
      } else {
        const created = await createResident({ household_id: householdId, ...residentForm, status: 'active' });
        const flags = await getResidentVulnerabilityFlags(created.id);
        setResidents(prev => [...prev, { resident: created, flags }]);
        setShowAddResident(false);
        showToast('Member added.');
      }
      setResidentForm(emptyResidentForm);
    } catch { showToast('Failed to save member.', 'error'); } finally { setIsSavingResident(false); }
  }

  async function handleSaveHealthFlags(e: React.FormEvent, resident: Resident) {
    e.preventDefault();
    if (healthForm.is_pregnant && resident.gender !== 'F') {
      showToast('Pregnancy flag can only be set for female members.', 'error');
      return;
    }

    if (healthForm.is_pregnant) {
      const months = Number(healthForm.pregnancy_months);
      if (!Number.isFinite(months) || months < 1 || months > 9) {
        showToast('Enter the pregnancy month from 1 to 9.', 'error');
        return;
      }
      if (!healthForm.expected_delivery_date) {
        showToast('Enter the expected date of delivery (EDD) before saving.', 'error');
        return;
      }
    }

    if (healthForm.is_pwd && !healthForm.pwd_type) {
      showToast('Select the PWD type before saving.', 'error');
      return;
    }

    setIsSavingHealth(true);
    try {
      const updatedFlags = await updateHealthFlags(resident.id, {
        is_pregnant: healthForm.is_pregnant,
        pregnancy_months: healthForm.is_pregnant && typeof healthForm.pregnancy_months === 'number'
          ? healthForm.pregnancy_months
          : undefined,
        expected_delivery_date: healthForm.is_pregnant
          ? healthForm.expected_delivery_date || undefined
          : undefined,
        is_pwd: healthForm.is_pwd,
        pwd_type: healthForm.is_pwd && healthForm.pwd_type ? healthForm.pwd_type : undefined,
        has_chronic_illness: healthForm.has_chronic_illness,
        chronic_conditions: healthForm.chronic_conditions
          .split(',')
          .map((condition) => condition.trim())
          .filter(Boolean),
        follow_up_status: healthForm.follow_up_status,
        medical_notes: healthForm.medical_notes.trim(),
      });

      setResidents(prev => prev.map(rw =>
        rw.resident.id === resident.id ? { ...rw, flags: updatedFlags ?? rw.flags } : rw
      ));
      setEditingHealthResidentId(null);
      setHealthForm(emptyHealthForm);
      showToast('Health monitoring updated.');
    } catch {
      showToast('Failed to update health monitoring.', 'error');
    } finally {
      setIsSavingHealth(false);
    }
  }

  // ── Resident delete ─────────────────────────────────────────────────────────
  async function handleDeleteResident(id: string) {
    try {
      await deleteResident(id, deleteReason);
      setResidents(prev => prev.filter(r => r.resident.id !== id));
      setDeletingResidentId(null);
      showToast('Member removed.');
    } catch { showToast('Failed to delete member.', 'error'); }
  }

  async function handleVerifyResident(id: string) {
    try {
      await verifyResident(id);
      const updated = await getResidentInState(id);
      if (updated) {
        setResidents(prev => prev.map(rw =>
          rw.resident.id === id ? { ...rw, resident: updated } : rw
        ));
      }
      showToast('Member verified.');
    } catch { showToast('Failed to verify member.', 'error'); }
  }

  async function getResidentInState(id: string) {
    const list = await getResidentsInHousehold(householdId);
    return list.find(r => r.id === id);
  }

  if (!user || isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
    </div>
  );

  if (!household) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-slate-500">Household not found</p>
    </div>
  );

  const canEdit = hasPermission('update_resident');
  const canEditHealth = hasPermission('update_health_flags');
  const backHref = hasPermission('view_households') ? '/households' : '/vulnerability';
  const backLabel = hasPermission('view_households') ? 'Back to Households' : 'Back to Vulnerability';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium transition-all animate-in slide-in-from-top-2 
                    ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingResidentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-1">Remove Member?</h3>
            <p className="text-sm text-slate-500 text-center mb-4">Select a reason before removing.</p>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Reason</label>
              <select value={deleteReason} onChange={e => setDeleteReason(e.target.value as any)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30">
                <option value="moved_out">Moved Out</option>
                <option value="deceased">Deceased</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingResidentId(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDeleteResident(deletingResidentId)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href={backHref} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" /> {backLabel}
          </Link>
          {canEdit && !isEditingHH && (
            <button onClick={() => setIsEditingHH(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:opacity-90 transition-all shadow-md shadow-indigo-500/25">
              <Edit2 className="w-3.5 h-3.5" /> Edit Household
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Household Info Card ─────────────────────────────────────── */}
        <div className="bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">

          {/* Card hero strip */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Home className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-indigo-200 text-xs font-medium">Household Record</p>
              <h1 className="text-white font-bold text-lg leading-tight">{household.head_name}</h1>
            </div>
          </div>

          <div className="p-6">
            {isEditingHH ? (
              /* ── Edit Form ── */
              <div className="space-y-5">
                <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Edit Household Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Household Head */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Household Head *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="text" value={hhForm.head_name}
                        onChange={e => setHhForm(f => ({ ...f, head_name: e.target.value }))}
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                        placeholder="Full name of household head" />
                    </div>
                  </div>

                  {/* Address */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Street Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="text" value={hhForm.street_address}
                        onChange={e => setHhForm(f => ({ ...f, street_address: e.target.value }))}
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                        placeholder="House no., street name" />
                    </div>
                  </div>

                  {/* Purok */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Purok / Sitio *</label>
                    <input
                      type="text"
                      list="household-detail-purok-options"
                      value={hhForm.purok_sitio}
                      onChange={e => setHhForm(f => ({ ...f, purok_sitio: e.target.value }))}
                      onBlur={e => setHhForm(f => ({ ...f, purok_sitio: normalizePurokSitio(e.target.value) }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                      placeholder="Type the purok or sitio"
                    />
                    <datalist id="household-detail-purok-options">
                      {purokOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                    <p className="mt-1 text-xs text-slate-400">
                      You can type a new purok directly. Saved puroks will appear in suggestions.
                    </p>
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Contact Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="tel" value={hhForm.contact_number}
                        onChange={e => setHhForm(f => ({ ...f, contact_number: e.target.value }))}
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                        placeholder="09xxxxxxxxx" />
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Municipality</label>
                    <input
                      type="text"
                      value={hhForm.municipality}
                      readOnly
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-600"
                    />
                    <p className="mt-1 text-xs text-slate-400">Automatic household disaster alerts are locked to Mabini.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Status</label>
                    <div className="relative">
                      <select value={hhForm.status}
                        onChange={e => setHhForm(f => ({ ...f, status: e.target.value as any }))}
                        className="w-full appearance-none px-3 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all">
                        <option value="active">Active</option>
                        <option value="moved_out">Moved Out</option>
                        <option value="deceased">Deceased</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Disaster Risk Profile</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        These fields drive Mabini-only automatic household disaster alerts.
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                      Mabini only
                    </span>
                  </div>

                  {hhForm.purok_sitio.trim() ? (
                    <div className="mt-4">
                      <PurokFloodProfileCard
                        household={{
                          barangay_id: household.barangay_id,
                          purok_sitio: hhForm.purok_sitio,
                          evacuation_site: hhForm.evacuation_site,
                        }}
                        profile={purokRiskProfile}
                        title="Official Purok Flood Profile"
                        description="This admin-managed purok profile stays separate from the household-specific risk details below."
                        className="border-cyan-200 bg-cyan-50/60"
                      />
                    </div>
                  ) : null}

                  {purokRiskProfile?.default_evacuation_site?.trim() && !hhForm.evacuation_site.trim() ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">Suggested evacuation site from the purok profile</p>
                          <p className="mt-1">{purokRiskProfile.default_evacuation_site.trim()}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHhForm((current) => ({
                            ...current,
                            evacuation_site: purokRiskProfile.default_evacuation_site ?? '',
                          }))}
                          className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Use suggestion
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hazard tags</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {HOUSEHOLD_HAZARD_OPTIONS.map((hazard) => {
                        const checked = hhForm.hazard_tags.includes(hazard);
                        return (
                          <label
                            key={hazard}
                            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                              checked
                                ? 'border-cyan-200 bg-cyan-50 text-cyan-950'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const nextTags = event.target.checked
                                  ? [...hhForm.hazard_tags, hazard]
                                  : hhForm.hazard_tags.filter((entry) => entry !== hazard);
                                setHhForm((current) => ({
                                  ...current,
                                  hazard_tags: parseHazardTags(nextTags),
                                }));
                              }}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                            <span>{HAZARD_LABELS[hazard]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Risk Level</label>
                      <div className="relative">
                        <select
                          value={hhForm.disaster_risk_level}
                          onChange={(event) => setHhForm((current) => ({
                            ...current,
                            disaster_risk_level: event.target.value as DisasterRiskLevel,
                          }))}
                          className="w-full appearance-none px-3 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                        >
                          {DISASTER_RISK_OPTIONS.map((riskLevel) => (
                            <option key={riskLevel} value={riskLevel}>
                              {DISASTER_RISK_LEVEL_LABELS[riskLevel]}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Evacuation Site</label>
                      <input
                        type="text"
                        value={hhForm.evacuation_site}
                        onChange={(event) => setHhForm((current) => ({ ...current, evacuation_site: event.target.value }))}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                        placeholder="Barangay gym, school, or shelter"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Special Assistance Notes</label>
                    <textarea
                      rows={3}
                      value={hhForm.special_assistance_notes}
                      onChange={(event) => setHhForm((current) => ({
                        ...current,
                        special_assistance_notes: event.target.value,
                      }))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                      placeholder="Wheelchair support, medicine transport, assisted evacuation, or other household-specific needs."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Household GPS Pin
                  </label>
                  <LocationPicker
                    lat={hhForm.gps_lat}
                    lng={hhForm.gps_long}
                    onChange={(lat, lng) => setHhForm(f => ({ ...f, gps_lat: lat, gps_long: lng }))}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-1">
                  <button onClick={handleSaveHousehold} disabled={isSavingHH}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md shadow-indigo-500/25 disabled:opacity-60">
                    {isSavingHH ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <><Save className="w-4 h-4" />Save Changes</>}
                  </button>
                  <button onClick={() => {
                    setIsEditingHH(false);
                    setHhForm({
                      head_name: household.head_name,
                      street_address: household.street_address ?? '',
                      purok_sitio: normalizePurokSitio(household.purok_sitio),
                      municipality: MABINI_MUNICIPALITY,
                      contact_number: household.contact_number ?? '',
                      status: household.status as HHStatus,
                      gps_lat: household.gps_lat,
                      gps_long: household.gps_long,
                      hazard_tags: parseHazardTags(household.hazard_tags),
                      disaster_risk_level: household.disaster_risk_level ?? 'medium',
                      evacuation_site: household.evacuation_site ?? '',
                      special_assistance_notes: household.special_assistance_notes ?? '',
                    });
                  }}
                    className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                    <X className="w-4 h-4" />Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── View Mode ── */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  { label: 'Household Head', value: household.head_name, icon: User },
                  { label: 'Street Address', value: household.street_address || 'N/A', icon: MapPin },
                  { label: 'Purok / Sitio', value: household.purok_sitio, icon: Home },
                  { label: 'Municipality', value: household.municipality || MABINI_MUNICIPALITY, icon: Home },
                  { label: 'Contact Number', value: household.contact_number || 'N/A', icon: Phone },
                ].map(f => {
                  const Icon = f.icon;
                  return (
                    <div key={f.label} className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 font-medium">{f.label}</p>
                        <p className="text-sm font-semibold text-slate-800">{f.value}</p>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Status</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mt-0.5 ${household.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      household.status === 'moved_out' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                      {household.status === 'moved_out' ? 'Moved Out' : household.status.charAt(0).toUpperCase() + household.status.slice(1)}
                    </span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <PurokFloodProfileCard
                    household={household}
                    profile={purokRiskProfile}
                    description="Official purok guidance is shown separately from the household-specific risk profile below."
                    className="border-cyan-200 bg-cyan-50/60"
                  />
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Disaster Risk Profile</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Hazard tags and assistance details used by Mabini-only automatic alerts.
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      household.disaster_risk_level === 'high'
                        ? 'bg-rose-100 text-rose-700'
                        : household.disaster_risk_level === 'medium'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {DISASTER_RISK_LEVEL_LABELS[household.disaster_risk_level ?? 'medium']}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {parseHazardTags(household.hazard_tags).length > 0 ? (
                      parseHazardTags(household.hazard_tags).map((hazard) => (
                        <span
                          key={hazard}
                          className="inline-flex items-center rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-semibold text-cyan-950"
                        >
                          {HAZARD_LABELS[hazard]}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        No hazard tags yet
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Evacuation Site</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {household.evacuation_site?.trim() || 'Not set'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Profile Updated</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {household.disaster_profile_updated_at
                          ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(household.disaster_profile_updated_at)
                          : 'Not updated yet'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-white px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Special Assistance Notes</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {household.special_assistance_notes?.trim() || 'No special assistance notes recorded.'}
                    </p>
                  </div>
                </div>
                {household.gps_lat !== undefined && household.gps_long !== undefined && (
                  <div className="sm:col-span-2 space-y-3">
                    <div>
                      <p className="text-xs text-slate-400 font-medium mb-2">Pinned Household Location</p>
                      <LocationPicker
                        readonly
                        height="200px"
                        lat={household.gps_lat}
                        lng={household.gps_long}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(`https://maps.google.com/?q=${household.gps_lat},${household.gps_long}`, '_blank')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Navigate Here
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Household Members Card ──────────────────────────────────── */}
        <div className="bg-white border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-900">Household Members</h2>
              <p className="text-xs text-slate-400 mt-0.5">{residents.length} member{residents.length !== 1 ? 's' : ''} registered</p>
            </div>
            {canEdit && (
              <button onClick={openAddResident}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:opacity-90 transition-all shadow-md shadow-indigo-500/25">
                <Plus className="w-4 h-4" /> Add Member
              </button>
            )}
          </div>

          <div className="p-6 space-y-3">

            {/* ── Add / Edit Resident Inline Form ── */}
            {(showAddResident || editingResidentId) && (
              <form onSubmit={handleSaveResident}
                className="mb-2 p-5 bg-indigo-50/60 border border-indigo-200/60 rounded-2xl space-y-4">
                <h3 className="text-sm font-bold text-indigo-700">
                  {editingResidentId ? '✏️ Edit Member' : '➕ Add New Member'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Full Name *</label>
                    <input type="text" placeholder="Full name" required
                      value={residentForm.full_name}
                      onChange={e => setResidentForm(f => ({ ...f, full_name: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Birthdate *</label>
                    <input type="date" required
                      value={residentForm.birthdate}
                      onChange={e => setResidentForm(f => ({ ...f, birthdate: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Gender</label>
                    <div className="relative">
                      <select value={residentForm.gender}
                        onChange={e => setResidentForm(f => ({ ...f, gender: e.target.value as 'M' | 'F' }))}
                        className="w-full appearance-none px-4 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400">
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Relationship to Head</label>
                    <input type="text" placeholder="e.g. Spouse, Son, Daughter"
                      value={residentForm.relationship_to_head}
                      onChange={e => setResidentForm(f => ({ ...f, relationship_to_head: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Civil Status</label>
                    <div className="relative">
                      <select value={residentForm.civil_status}
                        onChange={e => setResidentForm(f => ({ ...f, civil_status: e.target.value as any }))}
                        className="w-full appearance-none px-4 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400">
                        {CIVIL_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Occupation</label>
                    <input type="text" placeholder="e.g. Farmer, Student, N/A"
                      value={residentForm.occupation}
                      onChange={e => setResidentForm(f => ({ ...f, occupation: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={isSavingResident}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-all shadow-md shadow-indigo-500/25">
                    {isSavingResident ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <><Save className="w-4 h-4" />{editingResidentId ? 'Update Member' : 'Add Member'}</>}
                  </button>
                  <button type="button"
                    onClick={() => { setShowAddResident(false); setEditingResidentId(null); setResidentForm(emptyResidentForm); }}
                    className="flex items-center gap-1.5 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                    <X className="w-4 h-4" />Cancel
                  </button>
                </div>
              </form>
            )}

            {/* ── Members List ── */}
            {residents.length === 0 && !showAddResident ? (
              <div className="text-center py-12 text-slate-400">
                <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No members added yet</p>
              </div>
            ) : (
              residents.map(({ resident, flags }) => {
                const age = calculateAge(resident.birthdate);
                const vuln: string[] = [];
                if (flags?.is_child) vuln.push('Child');
                if (flags?.is_senior) vuln.push('Senior');
                if (flags?.is_pwd) vuln.push('PWD');
                if (flags?.is_pregnant) {
                  vuln.push(
                    typeof flags.pregnancy_months === 'number'
                      ? `Pregnant (${flags.pregnancy_months} months)`
                      : 'Pregnant',
                  );
                }
                if (flags?.has_chronic_illness) vuln.push('Chronic');
                if (flags?.is_low_income) vuln.push('Low-Income');

                const isBeingEdited = editingResidentId === resident.id;
                const isHealthBeingEdited = editingHealthResidentId === resident.id;
                const followUpLabel = FOLLOW_UP_STATUS_OPTIONS.find((option) => option.value === (flags?.follow_up_status ?? 'none'))?.label ?? 'No follow-up';
                return (
                  <div key={resident.id}
                    className={`p-4 border rounded-2xl transition-all ${isBeingEdited || isHealthBeingEdited ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200/60 hover:border-slate-300 hover:bg-slate-50/50'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${resident.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                          {resident.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">{resident.full_name}</span>
                          <span className="text-xs text-slate-400">({age} yrs)</span>
                          <span className="text-xs text-slate-400">· {resident.gender === 'M' ? 'Male' : 'Female'}</span>
                          {resident.verification_status === 'pending' ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full animate-pulse">Pending Verification</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">Verified</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">{resident.relationship_to_head || 'Member'}</p>
                        {resident.occupation && <p className="text-xs text-slate-400">{resident.occupation}</p>}
                        {vuln.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {vuln.map(v => (
                              <span key={v} className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-semibold rounded-full">{v}</span>
                            ))}
                          </div>
                        )}
                        {(flags?.follow_up_status && flags.follow_up_status !== 'none') || flags?.medical_notes ? (
                          <div className="mt-2 space-y-1 text-xs text-slate-500">
                            {flags?.follow_up_status && flags.follow_up_status !== 'none' ? (
                              <p><span className="font-semibold text-slate-600">Follow-up:</span> {followUpLabel}</p>
                            ) : null}
                            {flags?.medical_notes ? (
                              <p><span className="font-semibold text-slate-600">Medical notes:</span> {flags.medical_notes}</p>
                            ) : null}
                            {typeof flags?.pregnancy_months === 'number' ? (
                              <p><span className="font-semibold text-slate-600">Pregnancy month:</span> {flags.pregnancy_months}</p>
                            ) : null}
                            {flags?.expected_delivery_date ? (
                              <p><span className="font-semibold text-slate-600">Expected date of delivery (EDD):</span> {flags.expected_delivery_date}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {(canEdit || canEditHealth) && (
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        {canEdit && resident.verification_status === 'pending' && (
                          <button onClick={() => handleVerifyResident(resident.id)}
                            title="Verify"
                            className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all mr-1">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {canEditHealth && (
                          <button onClick={() => openEditHealth(resident, flags)}
                            title="Update health monitoring"
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${isHealthBeingEdited ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                            Health
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button onClick={() => openEditResident(resident)}
                              title="Edit"
                              className={`p-2 rounded-xl transition-all ${isBeingEdited ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-indigo-50 text-slate-400 hover:text-indigo-600'}`}>
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeletingResidentId(resident.id)}
                              title="Remove"
                              className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    </div>
                    {isHealthBeingEdited && (
                      <form onSubmit={(event) => handleSaveHealthFlags(event, resident)}
                        className="mt-4 border-t border-indigo-100 pt-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                            <input
                              type="checkbox"
                              checked={healthForm.is_pregnant}
                              onChange={(event) => setHealthForm((current) => ({
                                ...current,
                                is_pregnant: event.target.checked,
                                pregnancy_months: event.target.checked ? current.pregnancy_months : '',
                                expected_delivery_date: event.target.checked ? current.expected_delivery_date : '',
                              }))}
                              className="mt-1"
                            />
                            <span>
                              <span className="block font-semibold text-slate-800">Pregnant</span>
                              <span className="block text-xs text-slate-500">Include in maternal health monitoring.</span>
                            </span>
                          </label>
                          {healthForm.is_pregnant && (
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:col-span-2">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Pregnancy Month</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={9}
                                    value={healthForm.pregnancy_months}
                                    onChange={(event) => setHealthForm((current) => ({
                                      ...current,
                                      pregnancy_months: event.target.value ? Number(event.target.value) : '',
                                    }))}
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                                    placeholder="e.g. 6"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Expected Date of Delivery (EDD)</label>
                                  <input
                                    type="date"
                                    value={healthForm.expected_delivery_date}
                                    onChange={(event) => setHealthForm((current) => ({
                                      ...current,
                                      expected_delivery_date: event.target.value,
                                    }))}
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                                  />
                                </div>
                              </div>
                              {getPregnancyProgress(
                                typeof healthForm.pregnancy_months === 'number' ? healthForm.pregnancy_months : null,
                              ) && typeof healthForm.pregnancy_months === 'number' ? (
                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-3 text-sm text-rose-900">
                                  {(() => {
                                    const progress = getPregnancyProgress(healthForm.pregnancy_months);
                                    if (!progress) return null;
                                    return (
                                      <>
                                        <p className="font-semibold">
                                          {healthForm.pregnancy_months} month{healthForm.pregnancy_months === 1 ? '' : 's'} pregnant
                                        </p>
                                        <p className="mt-1 text-xs text-rose-700">
                                          {progress.trimesterLabel}
                                          {' · '}
                                          {progress.monthsRemaining === 0
                                            ? 'Full-term month reached, monitor closely for delivery and maternal care.'
                                            : `About ${progress.monthsRemaining} month${progress.monthsRemaining === 1 ? '' : 's'} left before the usual 9-month full term.`}
                                        </p>
                                        {healthForm.expected_delivery_date ? (
                                          <p className="mt-1 text-xs text-rose-700">
                                            Expected date of delivery (EDD): {healthForm.expected_delivery_date}
                                          </p>
                                        ) : null}
                                      </>
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          )}
                          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                            <input
                              type="checkbox"
                              checked={healthForm.has_chronic_illness}
                              onChange={(event) => setHealthForm((current) => ({ ...current, has_chronic_illness: event.target.checked }))}
                              className="mt-1"
                            />
                            <span>
                              <span className="block font-semibold text-slate-800">Chronic illness</span>
                              <span className="block text-xs text-slate-500">Track maintenance or special care needs.</span>
                            </span>
                          </label>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                            <label className="flex items-start gap-3 text-sm">
                              <input
                                type="checkbox"
                                checked={healthForm.is_pwd}
                                onChange={(event) => setHealthForm((current) => ({
                                  ...current,
                                  is_pwd: event.target.checked,
                                  pwd_type: event.target.checked ? current.pwd_type : '',
                                }))}
                                className="mt-1"
                              />
                              <span>
                                <span className="block font-semibold text-slate-800">PWD</span>
                                <span className="block text-xs text-slate-500">Mark disability status for reports and aid targeting.</span>
                              </span>
                            </label>
                            {healthForm.is_pwd && (
                              <select
                                value={healthForm.pwd_type}
                                onChange={(event) => setHealthForm((current) => ({ ...current, pwd_type: event.target.value as PWDType | '' }))}
                                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                              >
                                <option value="">Select PWD type</option>
                                {PWD_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-up Status</label>
                            <select
                              value={healthForm.follow_up_status}
                              onChange={(event) => setHealthForm((current) => ({ ...current, follow_up_status: event.target.value as FollowUpStatus }))}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                            >
                              {FOLLOW_UP_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Chronic Conditions</label>
                            <input
                              type="text"
                              value={healthForm.chronic_conditions}
                              onChange={(event) => setHealthForm((current) => ({ ...current, chronic_conditions: event.target.value }))}
                              placeholder="e.g. Hypertension, asthma"
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Medical Notes</label>
                            <textarea
                              value={healthForm.medical_notes}
                              onChange={(event) => setHealthForm((current) => ({ ...current, medical_notes: event.target.value }))}
                              placeholder="Add visit notes, referral details, or care reminders."
                              rows={3}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                            />
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button type="submit" disabled={isSavingHealth}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white rounded-xl text-sm font-semibold hover:bg-emerald-800 disabled:opacity-60 transition-all">
                            {isSavingHealth ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Health Monitoring</>}
                          </button>
                          <button type="button"
                            onClick={() => { setEditingHealthResidentId(null); setHealthForm(emptyHealthForm); }}
                            className="flex items-center gap-1.5 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                            <X className="w-4 h-4" />Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

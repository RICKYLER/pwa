'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getHousehold, updateHousehold } from '@/lib/db/households';
import {
  getResidentsInHousehold, createResident, updateResident,
  deleteResident, getResidentVulnerabilityFlags,
} from '@/lib/db/residents';
import { calculateAge } from '@/lib/db/vulnerability';
import { Household, Resident, VulnerabilityFlags } from '@/lib/db/schema';
import {
  ArrowLeft, Plus, Edit2, Trash2, Save, X, User, MapPin,
  Phone, Home, CheckCircle2, AlertTriangle, ChevronDown,
} from 'lucide-react';

interface ResidentWithFlags { resident: Resident; flags: VulnerabilityFlags | undefined; }

const CIVIL_STATUSES = ['single', 'married', 'widowed', 'separated'] as const;
const PUROK_OPTIONS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7', 'Sitio A', 'Sitio B', 'Sitio C'];
const HOUSEHOLD_STATUSES = ['active', 'moved_out', 'deceased'] as const;
type HHStatus = typeof HOUSEHOLD_STATUSES[number];

const emptyResidentForm = {
  full_name: '', birthdate: '', gender: 'M' as 'M' | 'F',
  relationship_to_head: '', civil_status: 'single' as const, occupation: '',
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
  const [hhForm, setHhForm] = useState({ head_name: '', street_address: '', purok_sitio: '', contact_number: '', status: 'active' as typeof HOUSEHOLD_STATUSES[number] });
  const [isSavingHH, setIsSavingHH] = useState(false);

  // Resident add / edit state
  const [showAddResident, setShowAddResident] = useState(false);
  const [editingResidentId, setEditingResidentId] = useState<string | null>(null);
  const [residentForm, setResidentForm] = useState(emptyResidentForm);
  const [isSavingResident, setIsSavingResident] = useState(false);

  // Delete confirmation
  const [deletingResidentId, setDeletingResidentId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState<'moved_out' | 'deceased'>('moved_out');

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    if (!user || !hasPermission('view_households')) { router.push('/households'); return; }
    loadData();
  }, [user, router, householdId]);

  async function loadData() {
    try {
      setIsLoading(true);
      const hh = await getHousehold(householdId);
      if (!hh) { router.push('/households'); return; }
      setHousehold(hh);
      setHhForm({
        head_name: hh.head_name,
        street_address: hh.street_address ?? '',
        purok_sitio: hh.purok_sitio,
        contact_number: hh.contact_number ?? '',
        status: hh.status as typeof HOUSEHOLD_STATUSES[number],
      });
      const list = await getResidentsInHousehold(householdId);
      const withFlags = await Promise.all(list.map(async r => ({ resident: r, flags: await getResidentVulnerabilityFlags(r.id) })));
      setResidents(withFlags);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  }

  // ── Household save ──────────────────────────────────────────────────────────
  async function handleSaveHousehold() {
    if (!household || !hhForm.head_name.trim() || !hhForm.purok_sitio) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }
    setIsSavingHH(true);
    try {
      await updateHousehold(household.id, {
        head_name: hhForm.head_name.trim(),
        street_address: hhForm.street_address.trim(),
        purok_sitio: hhForm.purok_sitio,
        contact_number: hhForm.contact_number.trim(),
        status: hhForm.status,
      });
      setHousehold(prev => prev ? { ...prev, ...hhForm } : prev);
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
  }

  function openAddResident() {
    setEditingResidentId(null);
    setResidentForm(emptyResidentForm);
    setShowAddResident(true);
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

  // ── Resident delete ─────────────────────────────────────────────────────────
  async function handleDeleteResident(id: string) {
    try {
      await deleteResident(id, deleteReason);
      setResidents(prev => prev.filter(r => r.resident.id !== id));
      setDeletingResidentId(null);
      showToast('Member removed.');
    } catch { showToast('Failed to delete member.', 'error'); }
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
          <Link href="/households" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Households
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
                    <div className="relative">
                      <select value={hhForm.purok_sitio}
                        onChange={e => setHhForm(f => ({ ...f, purok_sitio: e.target.value }))}
                        className="w-full appearance-none px-3 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all">
                        <option value="">Select purok…</option>
                        {PUROK_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        {!PUROK_OPTIONS.includes(hhForm.purok_sitio) && hhForm.purok_sitio && (
                          <option value={hhForm.purok_sitio}>{hhForm.purok_sitio}</option>
                        )}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
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
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Status</label>
                    <div className="relative">
                      <select value={hhForm.status}
                        onChange={e => setHhForm(f => ({ ...f, status: e.target.value as any }))}
                        className="w-full appearance-none px-3 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="moved_out">Moved Out</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-1">
                  <button onClick={handleSaveHousehold} disabled={isSavingHH}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md shadow-indigo-500/25 disabled:opacity-60">
                    {isSavingHH ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : <><Save className="w-4 h-4" />Save Changes</>}
                  </button>
                  <button onClick={() => { setIsEditingHH(false); setHhForm({ head_name: household.head_name, street_address: household.street_address ?? '', purok_sitio: household.purok_sitio, contact_number: household.contact_number ?? '', status: household.status as any }); }}
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
                if (flags?.is_pregnant) vuln.push('Pregnant');
                if (flags?.has_chronic_illness) vuln.push('Chronic');
                if (flags?.is_low_income) vuln.push('Low-Income');

                const isBeingEdited = editingResidentId === resident.id;
                return (
                  <div key={resident.id}
                    className={`flex items-start justify-between p-4 border rounded-2xl transition-all ${isBeingEdited ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200/60 hover:border-slate-300 hover:bg-slate-50/50'}`}>
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
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 flex-shrink-0 ml-2">
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
                      </div>
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

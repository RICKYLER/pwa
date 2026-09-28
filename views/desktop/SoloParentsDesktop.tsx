'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  HeartHandshake,
  Search,
  Filter,
  Plus,
  Download,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  DollarSign,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  X,
  MapPin,
  Calendar,
  Sparkles,
  Ban,
  UserX,
  ShieldCheck,
  Edit2,
} from 'lucide-react';
import type {
  SoloParentRecord,
  SoloParentCategory,
  SoloParentStatus,
} from '@/lib/db/schema';
import { getSoloParents } from '@/lib/db/solo-parents';
import { getCurrentUser } from '@/lib/auth';
import { BARANGAY_REGISTRY, getBarangayName } from '@/lib/mabini-barangays';
import { exportRospCsv, SOLO_PARENT_CATEGORY_LABELS } from '@/lib/solo-parents/rosp-exporter';
import WalkInSoloParentModal from '@/components/solo-parents/WalkInSoloParentModal';
import SoloParentIdCardModal from '@/components/solo-parents/SoloParentIdCardModal';
import SoloParentDetailModal from '@/components/solo-parents/SoloParentDetailModal';
import { cn } from '@/lib/utils';

export default function SoloParentsDesktop() {
  const currentUser = getCurrentUser();
  const [records, setRecords] = useState<SoloParentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [barangayFilter, setBarangayFilter] = useState<string>('all');

  // Modals
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<SoloParentRecord | null>(null);
  const [selectedRecordForCard, setSelectedRecordForCard] = useState<SoloParentRecord | null>(null);

  // Success Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();

    function handleDataChanged(event: WindowEventMap['mswdo-data-changed']) {
      if (event.detail.table === 'solo_parents') {
        void loadRecords();
      }
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => window.removeEventListener('mswdo-data-changed', handleDataChanged);
  }, []);

  async function loadRecords() {
    setIsLoading(true);
    try {
      const data = await getSoloParents();
      setRecords(data);
    } catch (err) {
      console.error('Failed to load solo parents:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }

  // Filtered calculation
  const filteredRecords = useMemo(() => {
    let result = records;

    if (statusFilter !== 'all') {
      const today = new Date();
      if (statusFilter === 'active') {
        result = result.filter((r) => {
          const exp = new Date(r.expires_at);
          return exp >= today && r.status !== 'revoked';
        });
      } else if (statusFilter === 'subsidy') {
        result = result.filter((r) => r.is_minimum_wage_or_below && r.status !== 'revoked');
      } else if (statusFilter === 'expiring') {
        result = result.filter((r) => {
          if (r.status === 'revoked') return false;
          const exp = new Date(r.expires_at);
          const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 30;
        });
      } else if (statusFilter === 'expired') {
        result = result.filter((r) => {
          if (r.status === 'revoked') return false;
          const exp = new Date(r.expires_at);
          return exp < today;
        });
      } else if (statusFilter === 'revoked') {
        result = result.filter((r) => r.status === 'revoked');
      }
    }

    if (categoryFilter !== 'all') {
      result = result.filter((r) => r.category === categoryFilter);
    }

    if (barangayFilter !== 'all') {
      result = result.filter(
        (r) => r.barangay_id.toLowerCase() === barangayFilter.toLowerCase()
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        return (
          r.id_number.toLowerCase().includes(q) ||
          r.full_name.toLowerCase().includes(q) ||
          (r.purok_sitio && r.purok_sitio.toLowerCase().includes(q)) ||
          r.dependents.some((d) => d.full_name.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [records, statusFilter, categoryFilter, barangayFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const today = new Date();
    const active = records.filter((r) => new Date(r.expires_at) >= today && r.status !== 'revoked').length;
    const subsidy = records.filter((r) => r.is_minimum_wage_or_below && r.status !== 'revoked').length;
    const revoked = records.filter((r) => r.status === 'revoked').length;
    const expiring = records.filter((r) => {
      if (r.status === 'revoked') return false;
      const exp = new Date(r.expires_at);
      const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 30;
    }).length;

    return {
      total: records.length,
      active,
      subsidy,
      expiring,
      revoked,
    };
  }, [records]);

  function handleExportRosp() {
    if (records.length === 0) {
      showToast('No records to export.');
      return;
    }
    exportRospCsv(filteredRecords);
    showToast('Registry of Solo Parents (ROSP) downloaded.');
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 shadow-xl animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-teal-800 uppercase tracking-widest">
            <HeartHandshake className="h-4 w-4 text-teal-600" />
            Social Welfare & Development Office
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Solo Parents Registry & Walk-In Desk
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Walk-in registration, Republic Act 11861 assessment, 1-click official ID generation, and DSWD ROSP reporting.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {currentUser?.role === 'admin' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">
                <ShieldCheck className="h-3.5 w-3.5 text-violet-600" />
                Admin Oversight • Full Master Access (Intake, Assessment, Revocation, Deletion, ROSP)
              </span>
            ) : currentUser?.role === 'solo_parent_focal' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-800 ring-1 ring-teal-200">
                <HeartHandshake className="h-3.5 w-3.5 text-teal-600" />
                Solo Parent Officer Desk • Exclusive RA 11861 Intake, ID Generation, Subsidy & Revocation
              </span>
            ) : currentUser?.role === 'social_worker' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                <HeartHandshake className="h-3.5 w-3.5 text-amber-600" />
                Social Worker • Social Welfare Casework & Assessment
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                Authorized Staff Desk
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportRosp}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Export DSWD ROSP
          </button>
          <button
            type="button"
            onClick={() => setWalkInModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-teal-700 transition"
          >
            <Plus className="h-4 w-4" />
            New Walk-In Registration
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Registered</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.total}</span>
            <span className="text-[11px] text-slate-500 font-medium">Solo Parents</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Masterlist across all barangays</p>
        </div>

        {/* Active Valid IDs */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Active Valid IDs</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700">{stats.active}</span>
            <span className="text-[11px] text-slate-500 font-medium">Unexpired</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Currently recognized & verified</p>
        </div>

        {/* ₱1,000 Subsidy Qualified */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-xs font-bold uppercase tracking-wider">₱1,000 Subsidy Qualified</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-900">{stats.subsidy}</span>
            <span className="text-[11px] text-emerald-700 font-bold">Eligible</span>
          </div>
          <p className="mt-1 text-[11px] text-emerald-700/80">Minimum wage or below (RA 11861)</p>
        </div>

        {/* For Renewal */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between text-amber-800">
            <span className="text-xs font-bold uppercase tracking-wider">For Renewal Soon</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-900">{stats.expiring}</span>
            <span className="text-[11px] text-amber-800 font-medium">Within 30 Days</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-700/80">Annual re-validation queue</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID Number, Full Name, Purok, or Child's Name..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs focus:border-teal-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Barangay Filter */}
          <select
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-500 focus:outline-none"
          >
            <option value="all">All Barangays</option>
            {BARANGAY_REGISTRY.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-500 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {Object.entries(SOLO_PARENT_CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Status Pill Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs overflow-x-auto">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'subsidy', label: '₱1k Subsidy' },
            { id: 'expiring', label: 'Expiring Soon' },
            { id: 'expired', label: 'Expired' },
            { id: 'revoked', label: 'Revoked (Terminated)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'rounded-lg px-3 py-1 font-semibold transition',
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3.5">ID Number</th>
                <th className="px-4 py-3.5">Full Name & Details</th>
                <th className="px-4 py-3.5">Barangay & Address</th>
                <th className="px-4 py-3.5">RA 11861 Category</th>
                <th className="px-4 py-3.5">Dependents</th>
                <th className="px-4 py-3.5">Subsidy Status</th>
                <th className="px-4 py-3.5">Validity</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-teal-600 mb-2" />
                    Loading Solo Parent records...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 mx-auto mb-3">
                      <HeartHandshake className="h-6 w-6" />
                    </div>
                    <p className="font-bold text-slate-800">No Solo Parent records found</p>
                    <p className="text-slate-400 mt-1">
                      {searchQuery
                        ? 'Try adjusting your search query or filters.'
                        : 'Click "+ New Walk-In Registration" to register an applicant.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const today = new Date();
                  const exp = new Date(r.expires_at);
                  const isExp = exp < today;
                  const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const isExpiringSoon = diff >= 0 && diff <= 30;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition">
                      {/* ID Number */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono font-bold text-teal-800 bg-teal-50 px-2 py-1 rounded-md border border-teal-200">
                          {r.id_number}
                        </span>
                      </td>

                      {/* Name & Age */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">{r.full_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {r.gender === 'F' ? 'Female' : 'Male'} • {r.age} y/o •{' '}
                          <span className="capitalize">{r.civil_status || 'Single'}</span>
                        </div>
                      </td>

                      {/* Barangay */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">
                          {getBarangayName(r.barangay_id)}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[150px]">
                          {r.purok_sitio || 'Purok N/A'}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                          {SOLO_PARENT_CATEGORY_LABELS[r.category] || r.category}
                        </span>
                      </td>

                      {/* Dependents */}
                      <td className="px-4 py-3.5">
                        <span className="font-bold text-slate-800">{r.dependents.length}</span>{' '}
                        <span className="text-[11px] text-slate-500">
                          {r.dependents.length === 1 ? 'child' : 'children'}
                        </span>
                      </td>

                      {/* Subsidy Status */}
                      <td className="px-4 py-3.5">
                        {r.is_minimum_wage_or_below ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-800">
                            <DollarSign className="h-3 w-3" />
                            ₱1k Subsidy
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-medium">Standard</span>
                        )}
                      </td>

                      {/* Validity */}
                      <td className="px-4 py-3.5">
                        {r.status === 'revoked' ? (
                          <div className="flex flex-col gap-1 max-w-[210px]">
                            <span
                              className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200 w-fit"
                            >
                              <Ban className="h-3 w-3 text-rose-600 shrink-0" />
                              Revoked (Terminated)
                            </span>
                            <span
                              className="text-[11px] text-rose-900 font-semibold leading-tight line-clamp-2"
                              title={r.revocation_reason}
                            >
                              {r.revocation_reason || 'Naminyo / Re-married'}
                            </span>
                            {r.revocation_date && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                Petsa: {r.revocation_date}
                              </span>
                            )}
                          </div>
                        ) : isExp ? (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            Expired ({r.expires_at})
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Expiring in {diff}d
                          </span>
                        ) : (
                          <span className="text-slate-700 font-medium">
                            Until {r.expires_at}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedRecordForCard(r)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-teal-300 hover:text-teal-700 shadow-2xs transition"
                          title="Print Official ID Card"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedRecordForDetail(r)}
                          className="rounded-lg bg-teal-800 px-3 py-1.5 font-bold text-white shadow-2xs hover:bg-teal-700 transition"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <WalkInSoloParentModal
        isOpen={walkInModalOpen}
        onClose={() => setWalkInModalOpen(false)}
        onSuccess={(created) => {
          loadRecords();
          showToast(`Solo Parent ${created.full_name} registered successfully.`);
          setSelectedRecordForCard(created);
        }}
      />

      <SoloParentDetailModal
        isOpen={Boolean(selectedRecordForDetail)}
        record={selectedRecordForDetail}
        onClose={() => setSelectedRecordForDetail(null)}
        onPrintCard={(rec) => {
          setSelectedRecordForDetail(null);
          setSelectedRecordForCard(rec);
        }}
        onRecordUpdated={() => {
          loadRecords();
          showToast('Solo parent record updated.');
        }}
      />

      <SoloParentIdCardModal
        isOpen={Boolean(selectedRecordForCard)}
        record={selectedRecordForCard}
        onClose={() => setSelectedRecordForCard(null)}
      />
    </div>
  );
}

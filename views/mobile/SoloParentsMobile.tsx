'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  HeartHandshake,
  Search,
  Plus,
  Users,
  CheckCircle2,
  DollarSign,
  Printer,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  Ban,
  ShieldCheck,
  Edit2,
} from 'lucide-react';
import type { SoloParentRecord } from '@/lib/db/schema';
import { getSoloParents } from '@/lib/db/solo-parents';
import { getCurrentUser } from '@/lib/auth';
import { getBarangayName } from '@/lib/mabini-barangays';
import { exportRospCsv, SOLO_PARENT_CATEGORY_LABELS } from '@/lib/solo-parents/rosp-exporter';
import WalkInSoloParentModal from '@/components/solo-parents/WalkInSoloParentModal';
import SoloParentIdCardModal from '@/components/solo-parents/SoloParentIdCardModal';
import SoloParentDetailModal from '@/components/solo-parents/SoloParentDetailModal';

export default function SoloParentsMobile() {
  const currentUser = getCurrentUser();
  const [records, setRecords] = useState<SoloParentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<SoloParentRecord | null>(null);
  const [selectedRecordForCard, setSelectedRecordForCard] = useState<SoloParentRecord | null>(null);

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

  const filteredRecords = useMemo(() => {
    let result = records;

    if (statusFilter !== 'all') {
      const today = new Date();
      if (statusFilter === 'active') {
        result = result.filter((r) => new Date(r.expires_at) >= today && r.status !== 'revoked');
      } else if (statusFilter === 'subsidy') {
        result = result.filter((r) => r.is_minimum_wage_or_below && r.status !== 'revoked');
      } else if (statusFilter === 'expired') {
        result = result.filter((r) => new Date(r.expires_at) < today && r.status !== 'revoked');
      } else if (statusFilter === 'revoked') {
        result = result.filter((r) => r.status === 'revoked');
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.id_number.toLowerCase().includes(q) ||
          r.full_name.toLowerCase().includes(q) ||
          (r.purok_sitio && r.purok_sitio.toLowerCase().includes(q))
      );
    }

    return result;
  }, [records, statusFilter, searchQuery]);

  return (
    <div className="p-4 space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">
            MSWDO Desk
          </span>
          <h1 className="text-xl font-black text-slate-900">Solo Parents</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportRospCsv(filteredRecords)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs"
            title="Export CSV"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          </button>
          <button
            type="button"
            onClick={() => setWalkInModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-teal-800 px-3 py-2 text-xs font-bold text-white shadow-md"
          >
            <Plus className="h-4 w-4" /> Walk-In
          </button>
        </div>
      </div>

      {/* Role Badge */}
      <div className="flex flex-wrap items-center gap-1.5">
        {currentUser?.role === 'admin' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">
            <ShieldCheck className="h-3 w-3 text-violet-600" />
            Admin Oversight • Full Access
          </span>
        ) : currentUser?.role === 'solo_parent_focal' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-800 ring-1 ring-teal-200">
            <HeartHandshake className="h-3 w-3 text-teal-600" />
            Solo Parent Officer • Exclusive RA 11861 Desk
          </span>
        ) : currentUser?.role === 'social_worker' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
            <HeartHandshake className="h-3 w-3 text-amber-600" />
            Social Worker • Welfare Assessment
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-200">
            <Edit2 className="h-3 w-3 text-blue-600" />
            Staff Desk
          </span>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, ID number, or purok..."
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs focus:border-teal-500 focus:outline-none"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'all', label: `All (${records.length})` },
          { id: 'active', label: 'Active Valid' },
          { id: 'subsidy', label: '₱1k Subsidy' },
          { id: 'expired', label: 'Expired' },
          { id: 'revoked', label: 'Revoked' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1 font-semibold transition ${
              statusFilter === tab.id
                ? 'bg-teal-800 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Records Cards List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-teal-600 mb-2" />
            Loading records...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-slate-500">
            <HeartHandshake className="h-8 w-8 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-800">No Solo Parents Found</p>
            <p className="text-xs text-slate-400 mt-1">
              Tap "+ Walk-In" to register a new applicant.
            </p>
          </div>
        ) : (
          filteredRecords.map((r) => {
            const today = new Date();
            const exp = new Date(r.expires_at);
            const isExp = exp < today;

            return (
              <div
                key={r.id}
                onClick={() => setSelectedRecordForDetail(r)}
                className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs hover:border-teal-300 transition flex flex-col gap-2.5 cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {r.id_number}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 mt-1">{r.full_name}</h3>
                    <p className="text-[11px] text-slate-500">
                      {getBarangayName(r.barangay_id)} • {r.dependents.length} child(ren)
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {r.is_minimum_wage_or_below ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                        ₱1k Subsidy
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                        Standard
                      </span>
                    )}

                    {r.status === 'revoked' ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          <Ban className="h-3 w-3" /> Revoked
                        </span>
                        <span className="text-[9.5px] text-rose-800 font-semibold truncate max-w-[140px]" title={r.revocation_reason}>
                          {r.revocation_reason?.split('—')[0]?.trim() || 'Naminyo / Remarried'}
                        </span>
                      </div>
                    ) : isExp ? (
                      <span className="text-[10px] font-bold text-rose-600">Expired</span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Valid to {r.expires_at}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <span className="truncate max-w-[200px]">
                    {SOLO_PARENT_CATEGORY_LABELS[r.category] || r.category}
                  </span>
                  <div className="flex items-center gap-1 font-semibold text-teal-700">
                    View <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      <WalkInSoloParentModal
        isOpen={walkInModalOpen}
        onClose={() => setWalkInModalOpen(false)}
        onSuccess={(created) => {
          loadRecords();
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
        onRecordUpdated={loadRecords}
      />

      <SoloParentIdCardModal
        isOpen={Boolean(selectedRecordForCard)}
        record={selectedRecordForCard}
        onClose={() => setSelectedRecordForCard(null)}
      />
    </div>
  );
}

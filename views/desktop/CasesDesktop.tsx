'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderLock,
  Search,
  Filter,
  Plus,
  Upload,
  Download,
  FileSpreadsheet,
  Shield,
  AlertTriangle,
  User,
  Clock,
  CheckCircle2,
  Lock,
  Eye,
  RefreshCw,
  X,
  FileText,
  MapPin,
  Calendar,
} from 'lucide-react';
import type {
  CaseRecord,
  CaseClassification,
  CaseStatus,
} from '@/lib/db/schema';
import { getCases } from '@/lib/db/cases';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import {
  downloadCaseExcelTemplate,
  downloadCaseCsvTemplate,
} from '@/lib/cases/case-excel-importer';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import { cn } from '@/lib/utils';

export default function CasesDesktop() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [barangayFilter, setBarangayFilter] = useState<string>('all');

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Success Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setIsLoading(true);
    try {
      const data = await getCases();
      setCases(data);
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }

  // Filtered cases calculation
  const filteredCases = useMemo(() => {
    let result = cases;

    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (typeFilter !== 'all') {
      result = result.filter((c) => c.case_type === typeFilter);
    }

    if (barangayFilter !== 'all') {
      result = result.filter((c) => c.barangay_id.toLowerCase() === barangayFilter.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((c) => {
        return (
          c.case_number.toLowerCase().includes(q) ||
          c.victim_name.toLowerCase().includes(q) ||
          (c.perpetrator_name && c.perpetrator_name.toLowerCase().includes(q)) ||
          (c.assigned_worker_name && c.assigned_worker_name.toLowerCase().includes(q)) ||
          (c.case_summary && c.case_summary.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [cases, searchQuery, statusFilter, typeFilter, barangayFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = cases.length;
    const active = cases.filter((c) => c.status === 'active').length;
    const bpo = cases.filter((c) => c.status === 'under_bpo_tpo').length;
    const pnpOrCourt = cases.filter(
      (c) => c.status === 'referred_pnp_wcpd' || c.status === 'filed_in_court',
    ).length;
    const resolved = cases.filter((c) => c.status === 'resolved_closed').length;
    return { total, active, bpo, pnpOrCourt, resolved };
  }, [cases]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-900 text-white shadow-xl text-xs font-semibold animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 rounded-2xl bg-gradient-to-r from-amber-950 via-slate-900 to-slate-900 text-white shadow-xl border border-amber-900/30">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <FolderLock className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">
              MSWDO Social Services & VAWC Desk
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Confidential Case Management
          </h1>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Centralized digital case folders for VAWC, Child Abuse (VAC), Rape, and special protection cases.
            Protected under RA 9262, RA 7610, and the Data Privacy Act of 2012.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
          <div className="flex items-center rounded-xl bg-white/10 p-0.5 border border-white/10 backdrop-blur-md">
            <button
              onClick={downloadCaseExcelTemplate}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition"
              title="Download MSWDO Excel Template"
            >
              <Download className="h-3.5 w-3.5" />
              Template (.xlsx)
            </button>
            <button
              onClick={downloadCaseCsvTemplate}
              className="px-2 py-2 text-[11px] font-semibold text-slate-300 hover:text-white transition"
              title="Download CSV Template"
            >
              CSV
            </button>
          </div>

          <button
            onClick={() => setUploadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 transition transform hover:-translate-y-0.5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Bulk Upload Excel
          </button>

          <button
            onClick={() => setNewCaseModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-white text-slate-900 hover:bg-slate-100 shadow-lg transition transform hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4 text-amber-600" />
            New Case Intake
          </button>
        </div>
      </div>

      {/* Statistics Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Cases</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{stats.total}</span>
            <FolderLock className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Active Cases</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-900">{stats.active}</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Under BPO / TPO</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-indigo-900">{stats.bpo}</span>
            <Shield className="h-4 w-4 text-indigo-600" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Referred to PNP / Court</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-sky-900">{stats.pnpOrCourt}</span>
            <AlertTriangle className="h-4 w-4 text-sky-600" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-sm flex flex-col justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Resolved / Closed</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-900">{stats.resolved}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Case Number (e.g. VAWC-2024-001), Victim Name, or Perpetrator..."
              className="w-full pl-10 pr-9 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition bg-slate-50/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Barangay Dropdown */}
          <select
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
            aria-label="Filter by Barangay"
            className="w-full md:w-48 py-2.5 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50/60 text-slate-700 focus:border-amber-500 outline-none capitalize cursor-pointer font-medium"
          >
            <option value="all">All Barangays (11)</option>
            {BARANGAY_REGISTRY.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>

          {/* Classification Dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by Classification"
            className="w-full md:w-56 py-2.5 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50/60 text-slate-700 focus:border-amber-500 outline-none cursor-pointer font-medium"
          >
            <option value="all">All Classifications</option>
            <option value="vawc_physical">VAWC Physical Abuse</option>
            <option value="vawc_psychological">VAWC Psychological</option>
            <option value="vawc_sexual">VAWC Sexual Abuse</option>
            <option value="vawc_economic">VAWC Economic Abuse</option>
            <option value="vac_abuse">VAC Child Abuse</option>
            <option value="vac_neglect">VAC Child Neglect</option>
            <option value="rape">Rape / Attempted Rape</option>
            <option value="cicl">CICL</option>
            <option value="other">Other</option>
          </select>

          <button
            onClick={loadCases}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Refresh List"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>

        {/* Status Quick-Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-2">
            Status:
          </span>
          {[
            { id: 'all', label: 'All Cases' },
            { id: 'active', label: 'Active' },
            { id: 'under_bpo_tpo', label: 'Under BPO / TPO' },
            { id: 'referred_pnp_wcpd', label: 'PNP-WCPD' },
            { id: 'filed_in_court', label: 'In Court' },
            { id: 'resolved_closed', label: 'Resolved / Closed' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={cn(
                'px-3 py-1 rounded-lg font-semibold transition',
                statusFilter === s.id
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cases Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Case Records Directory</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
              {filteredCases.length} {filteredCases.length === 1 ? 'case' : 'cases'}
            </span>
          </div>
          {searchQuery && (
            <p className="text-xs text-slate-500">
              Filtered by: &ldquo;<strong className="text-slate-800">{searchQuery}</strong>&rdquo;
            </p>
          )}
        </div>

        {filteredCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-3">
              <FolderLock className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">No cases found</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              {searchQuery || statusFilter !== 'all' || barangayFilter !== 'all'
                ? 'No matching cases for the active filter. Try resetting search parameters.'
                : 'Your case registry is empty. Upload your existing MSWDO Excel logbook or create a new case intake.'}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => setUploadModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Excel Sheet
              </button>
              <button
                onClick={() => setNewCaseModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                New Intake
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Case Number</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Victim / Client</th>
                  <th className="py-3 px-4">Barangay</th>
                  <th className="py-3 px-4">Alleged Perpetrator</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reported</th>
                  <th className="py-3 px-4">Assigned Worker</th>
                  <th className="py-3 px-4 text-right">Folder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredCases.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className="hover:bg-amber-50/40 transition cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-900 flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                      <span>{c.case_number}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          'inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                          c.case_type.includes('rape')
                            ? 'bg-rose-100 text-rose-800'
                            : c.case_type.includes('vac')
                              ? 'bg-amber-100 text-amber-800'
                              : c.case_type.includes('vawc')
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800',
                        )}
                      >
                        {c.case_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">{c.victim_name}</p>
                      {c.victim_age && (
                        <p className="text-[10px] text-slate-400">
                          {c.victim_age} yrs • {c.victim_gender === 'F' ? 'Female' : 'Male'}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 capitalize font-medium text-slate-700">
                      {c.barangay_id}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-800">{c.perpetrator_name || '—'}</p>
                      {c.perpetrator_relationship && (
                        <p className="text-[10px] text-slate-400">({c.perpetrator_relationship})</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize',
                          c.status === 'active' && 'bg-amber-100 text-amber-800',
                          c.status === 'under_bpo_tpo' && 'bg-indigo-100 text-indigo-800',
                          c.status === 'referred_pnp_wcpd' && 'bg-sky-100 text-sky-800',
                          c.status === 'filed_in_court' && 'bg-violet-100 text-violet-800',
                          c.status === 'resolved_closed' && 'bg-emerald-100 text-emerald-800',
                          c.status === 'monitoring' && 'bg-teal-100 text-teal-800',
                        )}
                      >
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {c.reported_at}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 truncate max-w-[120px]">
                      {c.assigned_worker_name || 'MSWDO'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCaseId(c.id);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 group-hover:bg-amber-600 group-hover:text-white text-slate-700 font-bold transition shadow-sm"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Open Folder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CaseExcelUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={(count) => {
          loadCases();
          showToast(`Successfully imported ${count} cases into MSWDO Case Directory!`);
        }}
      />

      <NewCaseModal
        isOpen={newCaseModalOpen}
        onClose={() => setNewCaseModalOpen(false)}
        onSuccess={(newCase) => {
          loadCases();
          showToast(`New case ${newCase.case_number} recorded successfully!`);
          setSelectedCaseId(newCase.id);
        }}
      />

      <CaseDetailModal
        isOpen={Boolean(selectedCaseId)}
        caseId={selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onCaseUpdated={loadCases}
      />
    </div>
  );
}

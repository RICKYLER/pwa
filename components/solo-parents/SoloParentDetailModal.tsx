'use client';

import React, { useState } from 'react';
import {
  X,
  Printer,
  Calendar,
  DollarSign,
  User,
  HeartHandshake,
  Users,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  RefreshCw,
  Trash2,
  Clock,
  MapPin,
  Phone,
  UserX,
  RotateCcw,
  Ban,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import type { SoloParentRecord } from '@/lib/db/schema';
import { SOLO_PARENT_CATEGORY_LABELS } from '@/lib/solo-parents/rosp-exporter';
import { getBarangayName } from '@/lib/mabini-barangays';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import {
  renewSoloParent,
  deleteSoloParent,
  revokeSoloParent,
  reactivateSoloParent,
} from '@/lib/db/solo-parents';

interface SoloParentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: SoloParentRecord | null;
  onPrintCard: (record: SoloParentRecord) => void;
  onRecordUpdated: () => void;
}

const REVOCATION_REASONS = [
  {
    id: 'remarried',
    label: '💍 Remarried / Cohabiting with Partner',
    desc: 'The solo parent has remarried or is cohabiting with a common-law partner.',
  },
  {
    id: 'reconciled',
    label: '🤝 Reconciled with Spouse',
    desc: 'Reconciled with the previously separated or abandoned spouse.',
  },
  {
    id: 'dependents_aged_out',
    label: '🎓 Dependents Aged Out / No Longer Qualified',
    desc: 'All dependent children have reached 18 (or 22 if student) and are gainfully employed / no longer in school.',
  },
  {
    id: 'loss_of_custody',
    label: '⚖️ Loss or Transfer of Parental Custody',
    desc: 'Custody has transferred to another legal guardian or spouse by court order or agreement.',
  },
  {
    id: 'relocated',
    label: '📍 Relocated / Transferred Residence',
    desc: 'Resident has relocated permanently outside the municipality.',
  },
  {
    id: 'voluntary',
    label: '📝 Voluntary Surrender / Financial Improvement',
    desc: 'Solo parent voluntarily surrenders privileges due to income improvement or personal request.',
  },
];

export default function SoloParentDetailModal({
  isOpen,
  onClose,
  record: initialRecord,
  onPrintCard,
  onRecordUpdated,
}: SoloParentDetailModalProps) {
  const [currentRecord, setCurrentRecord] = useState<SoloParentRecord | null>(initialRecord);

  React.useEffect(() => {
    setCurrentRecord(initialRecord);
  }, [initialRecord]);

  const record = currentRecord || initialRecord;

  const [isRenewing, setIsRenewing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Revocation Form State
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState('remarried');
  const [revocationNotes, setRevocationNotes] = useState('');
  const [revocationDate, setRevocationDate] = useState(new Date().toISOString().slice(0, 10));
  const [isRevoking, setIsRevoking] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);

  // Role permissions:
  // Admin: full access (delete, revoke, reactivate, renew, print)
  // Social Worker: welfare assessment, revoke, reactivate, renew, print (cannot delete master DB records)
  // Encoder: walk-in intake, ID printing, renew (cannot revoke legal status or delete master records)
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const isSocialWorker = currentUser?.role === 'social_worker';
  const isSoloParentFocal = currentUser?.role === 'solo_parent_focal';
  const canDelete = isAdmin || hasPermission('delete_solo_parents');
  const canRevoke = isAdmin || isSocialWorker || isSoloParentFocal || hasPermission('revoke_solo_parents');
  const canReactivate = isAdmin || isSocialWorker || isSoloParentFocal || hasPermission('revoke_solo_parents');

  if (!isOpen || !record) return null;

  const categoryLabel = SOLO_PARENT_CATEGORY_LABELS[record.category] || record.category;
  const barangayName = getBarangayName(record.barangay_id);
  const isRevoked = record.status === 'revoked';

  // Check if expired or expiring soon (< 30 days)
  const today = new Date();
  const expiryDate = new Date(record.expires_at);
  const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isExpired = diffDays < 0 && !isRevoked;
  const isExpiringSoon = diffDays >= 0 && diffDays <= 30 && !isRevoked;

  async function handleRenew() {
    if (!record) return;
    setIsRenewing(true);
    try {
      const renewed = await renewSoloParent(record.id);
      setCurrentRecord(renewed);
      setActionMessage('Solo Parent ID successfully renewed for 1 full year.');
      onRecordUpdated();
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err: any) {
      console.error('Error renewing solo parent:', err);
      setActionMessage('Failed to renew. Please try again.');
    } finally {
      setIsRenewing(false);
    }
  }

  async function handleRevokeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!record) return;
    setIsRevoking(true);
    try {
      const reasonObj = REVOCATION_REASONS.find((r) => r.id === selectedReason);
      const fullReasonText = reasonObj
        ? `${reasonObj.label}${revocationNotes.trim() ? ` — Remarks: ${revocationNotes.trim()}` : ''}`
        : selectedReason;

      const updated = await revokeSoloParent(record.id, fullReasonText, revocationDate);
      setCurrentRecord(updated);
      setActionMessage(`✅ Solo Parent status successfully revoked. Grounds: ${fullReasonText}`);
      setShowRevokeModal(false);
      onRecordUpdated();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      console.error('Error revoking solo parent:', err);
      setActionMessage('Failed to revoke status. Please try again.');
    } finally {
      setIsRevoking(false);
    }
  }

  async function handleReactivate() {
    if (!record) return;
    setIsReactivating(true);
    try {
      const reactivated = await reactivateSoloParent(record.id);
      setCurrentRecord(reactivated);
      setActionMessage('Solo Parent record reactivated successfully.');
      onRecordUpdated();
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err: any) {
      console.error('Error reactivating record:', err);
      setActionMessage('Failed to reactivate record.');
    } finally {
      setIsReactivating(false);
    }
  }

  async function handleDelete() {
    if (!record) return;
    setIsDeleting(true);
    try {
      await deleteSoloParent(record.id);
      onRecordUpdated();
      onClose();
    } catch (err: any) {
      console.error('Error deleting record:', err);
      setActionMessage('Failed to delete record.');
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{record.full_name}</h2>
                <span className="font-mono text-xs font-bold text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-800">
                  {record.id_number}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official Solo Parent Record • {barangayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {actionMessage && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{actionMessage}</span>
            </div>
          )}

          {/* Revocation Status Alert Banner */}
          {isRevoked && (
            <div className="rounded-xl border border-rose-300 bg-rose-50/95 p-4 text-xs text-rose-950 space-y-2.5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600 text-white shrink-0">
                    <Ban className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-black text-rose-900 tracking-wide text-xs">
                      STATUS: REVOKED / TERMINATED (RA 11861)
                    </span>
                    <p className="text-[11px] text-rose-700">
                      Privileges terminated & resident unflagged from active solo parent benefits
                    </p>
                  </div>
                </div>
                {canReactivate ? (
                  <button
                    type="button"
                    onClick={handleReactivate}
                    disabled={isReactivating}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 shadow-xs transition"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${isReactivating ? 'animate-spin' : ''}`} />
                    {isReactivating ? 'Reactivating...' : 'Reactivate Status'}
                  </button>
                ) : (
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200"
                    title="Reactivation requires a Social Worker case assessment or Admin authorization."
                  >
                    <Lock className="h-3 w-3 text-slate-400" />
                    Reactivation Restricted (Social Worker only)
                  </span>
                )}
              </div>
              <div className="rounded-xl bg-white/95 p-3.5 border border-rose-200 text-xs space-y-1.5 shadow-2xs">
                <div className="flex items-start gap-1.5">
                  <span className="font-bold text-slate-800 shrink-0">Revocation Grounds & Reason:</span>
                  <span className="font-black text-rose-800 break-words">{record.revocation_reason || 'Remarried / Cohabiting with Partner'}</span>
                </div>
                {record.revocation_date && (
                  <p className="text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-700">Effective Date:</span> <span className="font-mono font-bold text-slate-900">{record.revocation_date}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Expiry Alert Banner */}
          {isExpired ? (
            <div className="flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span className="font-semibold">
                  This Solo Parent ID expired on {record.expires_at}.
                </span>
              </div>
              <button
                type="button"
                onClick={handleRenew}
                disabled={isRenewing}
                className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-700 transition"
              >
                {isRenewing ? 'Renewing...' : 'Renew Now'}
              </button>
            </div>
          ) : isExpiringSoon ? (
            <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="font-semibold">
                  Expiring in {diffDays} days (on {record.expires_at}).
                </span>
              </div>
              <button
                type="button"
                onClick={handleRenew}
                disabled={isRenewing}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700 transition"
              >
                {isRenewing ? 'Renewing...' : 'Extend 1 Year'}
              </button>
            </div>
          ) : null}

          {/* Basic Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs">
            <div>
              <span className="text-[11px] font-medium text-slate-500">Gender & Age</span>
              <p className="font-bold text-slate-900">
                {record.gender === 'F' ? 'Female' : 'Male'} • {record.age} y/o
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500">Birthdate</span>
              <p className="font-bold text-slate-900">{record.birthdate}</p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500">Civil Status</span>
              <p className="font-bold text-slate-900 capitalize">
                {record.civil_status || 'Single'}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500">Contact Number</span>
              <p className="font-bold text-slate-900">{record.contact_number || 'None'}</p>
            </div>
          </div>

          {/* Assessment & Category */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-teal-600" />
              RA 11861 Assessment & Benefits Status
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 font-medium">Category Basis:</span>
                <p className="font-bold text-slate-900">{categoryLabel}</p>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 font-medium">Monthly Income:</span>
                <p className="font-bold text-slate-900">
                  ₱{record.monthly_income.toLocaleString()} / month
                </p>
              </div>
            </div>

            {/* Subsidy Tag */}
            <div
              className={`p-3 rounded-lg border text-xs font-medium ${
                record.is_minimum_wage_or_below
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                <DollarSign className="h-4 w-4" />
                {record.is_minimum_wage_or_below
                  ? 'Qualified for ₱1,000 Monthly Cash Subsidy (RA 11861 Section 15)'
                  : 'Standard Solo Parent Benefits (Leave & Discounts Only)'}
              </div>
              <p className="text-[11px] mt-0.5 opacity-80">
                {record.is_minimum_wage_or_below
                  ? 'Resident earns minimum wage or below. Eligible for local and DSWD cash assistance payouts.'
                  : 'Income exceeds statutory minimum threshold for cash subsidy.'}
              </p>
            </div>

            {record.notes && (
              <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="font-bold block text-slate-700">Casework Notes:</span>
                {record.notes}
              </div>
            )}
          </div>

          {/* Dependents */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-600" />
              Qualified Minor & Dependent Children ({record.dependents.length})
            </h3>

            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {record.dependents.map((dep, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{dep.full_name}</p>
                    <p className="text-[11px] text-slate-500">
                      Relationship: {dep.relationship} • Born: {dep.birthdate} ({dep.age} y/o)
                    </p>
                  </div>
                  <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200">
                    Dependent
                  </span>
                </div>
              ))}
              {record.dependents.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                  No registered dependent children found.
                </div>
              )}
            </div>
          </div>

          {/* Requirements Checklist */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Submitted Physical Requirements
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2
                  className={`h-4 w-4 ${
                    record.requirements.barangay_cert ? 'text-emerald-600' : 'text-slate-300'
                  }`}
                />
                <span>Barangay Certificate</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2
                  className={`h-4 w-4 ${
                    record.requirements.birth_certificates
                      ? 'text-emerald-600'
                      : 'text-slate-300'
                  }`}
                />
                <span>PSA Birth Certificates</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2
                  className={`h-4 w-4 ${
                    record.requirements.justification_proof
                      ? 'text-emerald-600'
                      : 'text-slate-300'
                  }`}
                />
                <span>Death / Blotter / Court Order</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2
                  className={`h-4 w-4 ${
                    record.requirements.income_proof ? 'text-emerald-600' : 'text-slate-300'
                  }`}
                />
                <span>Proof of Income / Indigency</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3.5">
          <div className="flex items-center gap-2">
            {canDelete && (
              !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 p-1 rounded hover:bg-rose-50"
                  title="Permanently remove record from municipal registry (Admin only)"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-rose-700 font-bold">Confirm delete?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="rounded bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              )
            )}

            {!isRevoked && (
              canRevoke ? (
                <button
                  type="button"
                  onClick={() => setShowRevokeModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-2xs"
                  title="Revoke privileges if solo parent remarried, cohabiting, or dependents aged out per RA 11861"
                >
                  <UserX className="h-3.5 w-3.5" />
                  Revoke Status
                </button>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed"
                  title="Status revocation requires a licensed Social Worker case assessment or Admin authorization."
                >
                  <Lock className="h-3 w-3 text-slate-400" />
                  Revoke Restricted (Social Worker only)
                </span>
              )
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {!isRevoked && (
              <button
                type="button"
                onClick={handleRenew}
                disabled={isRenewing}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRenewing ? 'animate-spin' : ''}`} />
                Renew ID (1 Year)
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onPrintCard(record);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-teal-800 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-teal-700 transition"
            >
              <Printer className="h-4 w-4" />
              {isRevoked ? 'Print Inactive Record' : 'Print Official ID'}
            </button>
          </div>
        </div>

        {/* Revoke Confirmation Dialog */}
        {showRevokeModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 text-rose-700">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700 shrink-0">
                    <UserX className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Revoke / Terminate Solo Parent Status
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      RA 11861 Section 13 • Grounds for Termination of Privileges
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRevokeModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleRevokeSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-800 block mb-1.5">
                    Select Statutory Grounds for Termination (RA 11861 Section 13):
                  </label>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {REVOCATION_REASONS.map((reason) => (
                      <label
                        key={reason.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                          selectedReason === reason.id
                            ? 'border-rose-400 bg-rose-50/80 text-rose-950 font-semibold shadow-xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="revocation_reason"
                          value={reason.id}
                          checked={selectedReason === reason.id}
                          onChange={(e) => setSelectedReason(e.target.value)}
                          className="mt-0.5 text-rose-600 focus:ring-rose-500"
                        />
                        <div>
                          <p className="font-bold text-xs">{reason.label}</p>
                          <p className="text-[11px] text-slate-500 font-normal">{reason.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Date of Status Change (e.g. Date of Marriage / Event):
                    </label>
                    <input
                      type="date"
                      value={revocationDate}
                      onChange={(e) => setRevocationDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Revocation Remarks & Notes (Caseworker Documentation):
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Enter detailed notes, e.g. Remarried to Juan Dela Cruz on Sept 15, 2026 per Marriage Certificate #12345..."
                      value={revocationNotes}
                      onChange={(e) => setRevocationNotes(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2 text-xs focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>System Impact:</strong> Revoking this record will immediately deactivate RA 11861 privileges, cancel the ₱1,000 monthly cash subsidy and discounts, and unflag the resident in the census vulnerability matrix.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowRevokeModal(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRevoking}
                    className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 transition disabled:opacity-50"
                  >
                    {isRevoking ? 'Revoking...' : 'Confirm Revocation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

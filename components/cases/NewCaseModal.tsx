'use client';

import React, { useState } from 'react';
import {
  X,
  Plus,
  Shield,
  Loader2,
  Sparkles,
  User,
  AlertTriangle,
  MapPin,
  Calendar,
  FileText,
} from 'lucide-react';
import type {
  CaseRecord,
  CaseClassification,
  CaseStatus,
  Gender,
} from '@/lib/db/schema';
import { createCase } from '@/lib/db/cases';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import { getCurrentUser } from '@/lib/auth';

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (created: CaseRecord) => void;
}

export default function NewCaseModal({
  isOpen,
  onClose,
  onSuccess,
}: NewCaseModalProps) {
  const currentUser = getCurrentUser();

  const [caseNumber, setCaseNumber] = useState('');
  const [caseType, setCaseType] = useState<CaseClassification>('vawc_physical');
  const [status, setStatus] = useState<CaseStatus>('active');
  const [reportedAt, setReportedAt] = useState(new Date().toISOString().slice(0, 10));
  const [incidentDate, setIncidentDate] = useState('');

  // Victim
  const [victimName, setVictimName] = useState('');
  const [victimAge, setVictimAge] = useState<string>('');
  const [victimGender, setVictimGender] = useState<Gender>('F');
  const [victimContact, setVictimContact] = useState('');
  const [barangayId, setBarangayId] = useState(currentUser?.barangay_id || 'cadunan');
  const [victimAddress, setVictimAddress] = useState('');

  // Perpetrator
  const [perpetratorName, setPerpetratorName] = useState('');
  const [perpetratorRelationship, setPerpetratorRelationship] = useState('');
  const [perpetratorAddress, setPerpetratorAddress] = useState('');

  // Narrative & Notes
  const [caseSummary, setCaseSummary] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [assignedWorker, setAssignedWorker] = useState(currentUser?.name || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleAutoGenerateNumber() {
    const year = new Date().getFullYear();
    const prefix = caseType.startsWith('vawc')
      ? 'VAWC'
      : caseType.startsWith('vac')
        ? 'VAC'
        : caseType === 'rape'
          ? 'RAPE'
          : 'CASE';
    const rand = Math.floor(1000 + Math.random() * 9000);
    setCaseNumber(`${prefix}-${year}-${rand}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!victimName.trim()) {
      setError('Please provide the Victim / Client full name.');
      return;
    }

    let finalCaseNo = caseNumber.trim();
    if (!finalCaseNo) {
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      finalCaseNo = `CASE-${year}-${rand}`;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await createCase({
        case_number: finalCaseNo,
        case_type: caseType,
        status,
        reported_at: reportedAt,
        incident_date: incidentDate || undefined,
        victim_name: victimName.trim(),
        victim_age: victimAge ? parseInt(victimAge, 10) : undefined,
        victim_gender: victimGender,
        victim_contact: victimContact.trim() || undefined,
        barangay_id: barangayId,
        purok_sitio: victimAddress.trim() || undefined,
        victim_address: victimAddress.trim() || undefined,
        perpetrator_name: perpetratorName.trim() || undefined,
        perpetrator_relationship: perpetratorRelationship.trim() || undefined,
        perpetrator_address: perpetratorAddress.trim() || undefined,
        case_summary: caseSummary.trim() || `Intake recorded for ${victimName.trim()}`,
        intake_notes: intakeNotes.trim() || undefined,
        assigned_worker_name: assignedWorker.trim() || currentUser?.name || 'MSWDO Staff',
        assigned_worker_id: currentUser?.id,
        source: 'manual_intake',
      });

      onSuccess(created);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to create case: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white font-bold">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">New Social Case Intake</h2>
              <p className="text-xs text-slate-500">Record a new walk-in or endorsed confidential case</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Classification & Case Number Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Case Classification</label>
              <select
                value={caseType}
                onChange={(e) => setCaseType(e.target.value as CaseClassification)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white font-medium"
              >
                <option value="vawc_physical">VAWC (RA 9262) - Physical Abuse</option>
                <option value="vawc_psychological">VAWC (RA 9262) - Psychological Abuse</option>
                <option value="vawc_sexual">VAWC (RA 9262) - Sexual Abuse</option>
                <option value="vawc_economic">VAWC (RA 9262) - Economic Abuse</option>
                <option value="vac_abuse">VAC (RA 7610) - Child Abuse</option>
                <option value="vac_neglect">VAC (RA 7610) - Child Neglect</option>
                <option value="vac_exploitation">VAC (RA 7610) - Child Exploitation</option>
                <option value="rape">Rape / Attempted Rape</option>
                <option value="cicl">Children in Conflict with the Law (CICL)</option>
                <option value="other">Other Social Case</option>
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">Case Number</label>
                <button
                  type="button"
                  onClick={handleAutoGenerateNumber}
                  className="text-[11px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" /> Auto
                </button>
              </div>
              <input
                type="text"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="e.g. VAWC-2026-0042"
                className="w-full p-2.5 text-xs font-mono font-bold rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none uppercase"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CaseStatus)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white font-medium"
              >
                <option value="active">Active Case</option>
                <option value="under_bpo_tpo">Under BPO / TPO</option>
                <option value="referred_pnp_wcpd">Referred to PNP-WCPD</option>
                <option value="filed_in_court">Filed in Court</option>
                <option value="resolved_closed">Resolved / Closed</option>
                <option value="monitoring">Monitoring</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Date Reported to MSWDO</label>
              <input
                type="date"
                value={reportedAt}
                onChange={(e) => setReportedAt(e.target.value)}
                required
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Approximate Incident Date (Optional)</label>
              <input
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>

          {/* Section: Victim Profile */}
          <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/30 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase">
              <User className="h-4 w-4 text-emerald-700" />
              Victim / Client Information
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-700">Full Name *</label>
                <input
                  type="text"
                  value={victimName}
                  onChange={(e) => setVictimName(e.target.value)}
                  placeholder="e.g. Maria Clara Santos"
                  required
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Age</label>
                  <input
                    type="number"
                    value={victimAge}
                    onChange={(e) => setVictimAge(e.target.value)}
                    placeholder="e.g. 28"
                    className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Gender</label>
                  <select
                    value={victimGender}
                    onChange={(e) => setVictimGender(e.target.value as Gender)}
                    className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                  >
                    <option value="F">Female</option>
                    <option value="M">Male</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Barangay</label>
                <select
                  value={barangayId}
                  onChange={(e) => setBarangayId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white capitalize"
                >
                  {BARANGAY_REGISTRY.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Purok / Street</label>
                <input
                  type="text"
                  value={victimAddress}
                  onChange={(e) => setVictimAddress(e.target.value)}
                  placeholder="e.g. Purok 3B"
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Contact Number</label>
                <input
                  type="text"
                  value={victimContact}
                  onChange={(e) => setVictimContact(e.target.value)}
                  placeholder="e.g. 09171234567"
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                />
              </div>
            </div>
          </div>

          {/* Section: Alleged Perpetrator */}
          <div className="p-4 rounded-xl border border-rose-200/80 bg-rose-50/30 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-900 uppercase">
              <AlertTriangle className="h-4 w-4 text-rose-700" />
              Alleged Perpetrator / Respondent
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Name</label>
                <input
                  type="text"
                  value={perpetratorName}
                  onChange={(e) => setPerpetratorName(e.target.value)}
                  placeholder="e.g. Juan Santos"
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white font-semibold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Relationship to Victim</label>
                <input
                  type="text"
                  value={perpetratorRelationship}
                  onChange={(e) => setPerpetratorRelationship(e.target.value)}
                  placeholder="e.g. Husband, Live-in Partner, Neighbor"
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Known Address</label>
                <input
                  type="text"
                  value={perpetratorAddress}
                  onChange={(e) => setPerpetratorAddress(e.target.value)}
                  placeholder="e.g. Brgy. Cadunan"
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                />
              </div>
            </div>
          </div>

          {/* Narrative & Initial Notes */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Incident Narrative / Case Summary *</label>
              <textarea
                value={caseSummary}
                onChange={(e) => setCaseSummary(e.target.value)}
                placeholder="Narrate the facts of the incident, injuries, psychological harm, or neglect..."
                rows={3}
                required
                className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Intake Notes & Immediate Actions Taken</label>
              <textarea
                value={intakeNotes}
                onChange={(e) => setIntakeNotes(e.target.value)}
                placeholder="e.g. BPO applied, initial counseling administered, coordinated with PNP WCPD..."
                rows={2}
                className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none resize-none"
              />
            </div>
          </div>

          {/* Assigned Social Worker */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Assigned Social Worker (RSW)</label>
            <input
              type="text"
              value={assignedWorker}
              onChange={(e) => setAssignedWorker(e.target.value)}
              placeholder="e.g. Jane Doe, RSW"
              className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <p className="text-[11px] text-slate-500">
              Confidential MSWDO Record • Strictly Protected
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 shadow-md shadow-amber-600/20 transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving Case...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Save Case Intake
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import {
  X,
  Zap,
  ShieldAlert,
  MapPin,
  User,
  Phone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Hospital,
  Home,
  Shield,
  FileText,
} from 'lucide-react';
import type { CaseRecord, CaseClassification } from '@/lib/db/schema';
import { createCase, addCaseNote } from '@/lib/db/cases';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import { getCurrentUser } from '@/lib/auth';

interface EmergencyCrisisIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCase: CaseRecord) => void;
}

export default function EmergencyCrisisIntakeModal({
  isOpen,
  onClose,
  onSuccess,
}: EmergencyCrisisIntakeModalProps) {
  const currentUser = getCurrentUser();
  const year = new Date().getFullYear();

  const [victimName, setVictimName] = useState('');
  const [victimAge, setVictimAge] = useState<number | ''>('');
  const [victimGender, setVictimGender] = useState<'F' | 'M'>('F');
  const [victimContact, setVictimContact] = useState('');
  const [barangayId, setBarangayId] = useState('tagnanan');
  const [currentSafeLocation, setCurrentSafeLocation] = useState('MSWDO Office (Municipal Hall)');
  
  const [perpetratorName, setPerpetratorName] = useState('');
  const [perpetratorRelationship, setPerpetratorRelationship] = useState('Husband / Live-in Partner');
  const [caseType, setCaseType] = useState<CaseClassification>('vawc_physical');
  const [incidentSummary, setIncidentSummary] = useState('');
  
  // Emergency Interventions
  const [actionsTaken, setActionsTaken] = useState<string[]>([
    'Brought to RHU / Hospital for Medical Examination',
    'Applied for Barangay Protection Order (BPO)',
  ]);
  const [assignedWorker, setAssignedWorker] = useState(currentUser?.name || 'Pedro Penduko (SW II)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  function toggleAction(action: string) {
    if (actionsTaken.includes(action)) {
      setActionsTaken(actionsTaken.filter((a) => a !== action));
    } else {
      setActionsTaken([...actionsTaken, action]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!victimName.trim()) return;

    setIsSubmitting(true);
    try {
      const randomCode = Math.floor(100 + Math.random() * 900);
      const caseNumber = `MAB-${year}-CRISIS-${randomCode}`;
      const now = new Date();

      const createdCase = await createCase({
        case_number: caseNumber,
        case_type: caseType,
        status: 'under_bpo_tpo',
        reported_at: now.toISOString(),
        victim_name: victimName.trim(),
        victim_age: victimAge ? Number(victimAge) : undefined,
        victim_gender: victimGender,
        victim_contact: victimContact.trim() || undefined,
        victim_address: `Safe Location: ${currentSafeLocation}`,
        barangay_id: barangayId,
        perpetrator_name: perpetratorName.trim() || 'Unidentified / Withheld',
        perpetrator_relationship: perpetratorRelationship.trim(),
        case_summary: incidentSummary.trim() || `Emergency walk-in intake. Actions taken: ${actionsTaken.join('; ')}`,
        assigned_worker_name: assignedWorker,
        source: 'manual_intake',
        intake_sheet: {
          date_of_interview: now.toISOString().split('T')[0],
          client_category: 'walk_in',
          sectors: ['women'],
          case_category_type: caseType,
          problem_presented: incidentSummary.trim() || 'Immediate crisis walk-in due to physical/emotional threat.',
          recommendation_action: actionsTaken.join('; '),
          family_members: [],
        },
      });

      // Immediate Case Note for chain-of-custody log
      await addCaseNote(createdCase.id, {
        worker_name: assignedWorker,
        date: now.toISOString().split('T')[0],
        note: `[CRISIS INTAKE LOGGED]: Emergency assistance provided to ${victimName}. Actions: ${actionsTaken.join(', ')}. Current Safe Location: ${currentSafeLocation}.`,
        action_taken: actionsTaken.join(', '),
      });

      onSuccess(createdCase);
      onClose();
    } catch (err) {
      console.error('Failed to create emergency case:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-xl bg-white rounded-2xl p-6 shadow-2xl border border-rose-200 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
              <Zap className="h-5 w-5 fill-rose-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Emergency Crisis Quick-Intake</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800">
                  2-Minute Priority
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Fast entry for walk-in victims in immediate distress. Detailed GIS can be completed later.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Section 1: Victim Profile */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
            <div className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
              <User className="h-3.5 w-3.5 text-slate-600" />
              <span>1. Client / Victim Information</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Client Full Name *
                </label>
                <input
                  type="text"
                  value={victimName}
                  onChange={(e) => setVictimName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15 outline-none"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Age &amp; Gender
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={victimAge}
                    onChange={(e) => setVictimAge(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Age"
                    className="w-16 p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 outline-none"
                  />
                  <select
                    value={victimGender}
                    onChange={(e) => setVictimGender(e.target.value as 'F' | 'M')}
                    className="flex-1 p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 outline-none"
                  >
                    <option value="F">Female</option>
                    <option value="M">Male</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Barangay of Residence *
                </label>
                <select
                  value={barangayId}
                  onChange={(e) => setBarangayId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 outline-none capitalize cursor-pointer"
                >
                  {BARANGAY_REGISTRY.map((b) => (
                    <option key={b.id} value={b.id}>
                      Brgy. {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Contact / Cellphone Number
                </label>
                <input
                  type="text"
                  value={victimContact}
                  onChange={(e) => setVictimContact(e.target.value)}
                  placeholder="e.g. 0917-000-0000"
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Current Safe Haven / Immediate Location
              </label>
              <input
                type="text"
                value={currentSafeLocation}
                onChange={(e) => setCurrentSafeLocation(e.target.value)}
                placeholder="e.g. MSWDO Office / LGU Safehouse / Relative's House in Poblacion"
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 outline-none"
              />
            </div>
          </div>

          {/* Section 2: Threat & Perpetrator */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
            <div className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
              <span>2. Violence Classification &amp; Perpetrator</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Crisis Classification
                </label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value as CaseClassification)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 outline-none cursor-pointer"
                >
                  <option value="vawc_physical">VAWC Physical Abuse (RA 9262)</option>
                  <option value="vawc_psychological">VAWC Threats / Psychological</option>
                  <option value="vawc_sexual">VAWC Sexual Abuse</option>
                  <option value="vawc_economic">VAWC Economic Deprivation</option>
                  <option value="vac_abuse">Child Abuse &amp; Maltreatment (RA 7610)</option>
                  <option value="rape">Rape / Attempted Sexual Assault</option>
                  <option value="other">Special Protection Crisis</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alleged Perpetrator &amp; Relationship
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={perpetratorName}
                    onChange={(e) => setPerpetratorName(e.target.value)}
                    placeholder="Name of Perpetrator"
                    className="flex-1 p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 outline-none"
                  />
                  <input
                    type="text"
                    value={perpetratorRelationship}
                    onChange={(e) => setPerpetratorRelationship(e.target.value)}
                    placeholder="Relationship"
                    className="w-32 p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Brief Incident Description / What Happened Just Now
              </label>
              <textarea
                value={incidentSummary}
                onChange={(e) => setIncidentSummary(e.target.value)}
                rows={2}
                placeholder="Brief summary of physical injuries, threats uttered, or current danger..."
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 outline-none resize-none"
              />
            </div>
          </div>

          {/* Section 3: Immediate Life-Saving Actions Taken */}
          <div className="bg-rose-50/60 p-3.5 rounded-xl border border-rose-200/90 space-y-2.5">
            <div className="font-bold text-rose-900 flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
              <CheckCircle2 className="h-3.5 w-3.5 text-rose-600" />
              <span>3. Immediate Protective Measures Taken</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                'Brought to RHU / Hospital for Medical Examination',
                'Applied for Barangay Protection Order (BPO)',
                'PNP-WCPD Blotter & Escort Requested',
                'Transferred to LGU Crisis Safehouse / Shelter',
                'AICS Crisis Walk-in Food & Cash Assistance Endorsed',
                'Temporary Child Custody Protective Custody',
              ].map((act, i) => (
                <label
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white border border-rose-200/80 cursor-pointer hover:bg-rose-50/50 transition select-none"
                >
                  <input
                    type="checkbox"
                    checked={actionsTaken.includes(act)}
                    onChange={() => toggleAction(act)}
                    className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4 cursor-pointer"
                  />
                  <span className="font-medium text-slate-800 leading-tight">{act}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Assigned Social Worker */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Handling Social Worker / Intake Officer
            </label>
            <input
              type="text"
              value={assignedWorker}
              onChange={(e) => setAssignedWorker(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 outline-none"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">
              * Automatically creates official dossier with immediate timestamp.
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold transition hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition shadow-xs cursor-pointer active:scale-98"
              >
                <Zap className="h-4 w-4 fill-white" />
                <span>{isSubmitting ? 'Registering...' : 'Save Emergency Dossier'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import {
  Printer,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  FileText,
  AlertTriangle,
  User,
  Users,
  Coins,
  Shield,
  Loader2,
  Building,
  Sprout,
  Check,
} from 'lucide-react';
import type {
  CaseRecord,
  GeneralIntakeSheetData,
  GeneralIntakeCategory,
  GeneralIntakeSector,
  CaseFamilyMember,
} from '@/lib/db/schema';
import { updateCase } from '@/lib/db/cases';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import { cn } from '@/lib/utils';

interface CaseIntakeSheetTabProps {
  caseRecord: CaseRecord;
  onCaseUpdated?: (updated: CaseRecord) => void;
}

const SECTOR_OPTIONS: { id: GeneralIntakeSector; label: string }[] = [
  { id: '4ps', label: '4Ps' },
  { id: 'children', label: 'Children' },
  { id: 'youth', label: 'Youth' },
  { id: 'women', label: 'Women' },
  { id: 'senior_citizen', label: 'Senior Citizen' },
  { id: 'pwd', label: 'PWD' },
  { id: 'solo_parent', label: 'Solo Parent' },
];

export default function CaseIntakeSheetTab({
  caseRecord,
  onCaseUpdated,
}: CaseIntakeSheetTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize form state with existing GIS data or synthesize from caseRecord
  const existingGis = caseRecord.intake_sheet;
  const [formData, setFormData] = useState<GeneralIntakeSheetData>(() => ({
    date_of_interview:
      existingGis?.date_of_interview ||
      caseRecord.reported_at ||
      new Date().toISOString().slice(0, 10),
    client_category: existingGis?.client_category || 'walk_in',
    sectors: existingGis?.sectors || ['women'],
    case_category_type:
      existingGis?.case_category_type || caseRecord.case_type || 'vawc',
    case_category_other: existingGis?.case_category_other || '',

    birthdate: existingGis?.birthdate || caseRecord.incident_date || '',
    birthplace: existingGis?.birthplace || 'Mabini, Davao de Oro',
    length_of_stay: existingGis?.length_of_stay || '10 years',
    civil_status: existingGis?.civil_status || 'Married',
    educational_attainment:
      existingGis?.educational_attainment || 'High School Graduate',
    religion: existingGis?.religion || 'Roman Catholic',
    occupation: existingGis?.occupation || 'Housekeeper / Informal',
    monthly_income:
      existingGis?.monthly_income !== undefined ? existingGis.monthly_income : 5000,
    house_occupancy: existingGis?.house_occupancy || 'owner',
    estimated_property_damage: existingGis?.estimated_property_damage || 0,

    family_members: existingGis?.family_members?.length
      ? existingGis.family_members
      : [
          {
            name: caseRecord.victim_name,
            age: caseRecord.victim_age || 32,
            civil_status: 'Married',
            relationship: 'Self / Client',
            educational_attainment: 'High School',
            occupation: 'Housewife',
            income: 3000,
            birthday: '',
          },
        ],

    sources_of_income:
      existingGis?.sources_of_income || 'Daily wage / Farming / Informal work',
    total_family_income:
      existingGis?.total_family_income !== undefined
        ? existingGis.total_family_income
        : 8500,
    monthly_expenses: existingGis?.monthly_expenses || {
      food: 3500,
      water: 250,
      electricity: 650,
      education: 1200,
      transportation: 400,
      total: 6000,
    },

    agricultural_profile: existingGis?.agricultural_profile || {
      has_land: false,
      hectares: 'None',
      crops_planted: 'N/A',
      area_location: 'N/A',
    },
    other_sources_of_income:
      existingGis?.other_sources_of_income || 'Livestock backyard raising',
    has_sought_outside_assistance:
      existingGis?.has_sought_outside_assistance || false,
    outside_assistance_details:
      existingGis?.outside_assistance_details || 'Barangay VAW Desk assistance',

    problem_presented:
      existingGis?.problem_presented ||
      caseRecord.case_summary ||
      'Client presented seeking MSWDO social services, psychosocial counseling, and protective intervention.',
    family_background:
      existingGis?.family_background ||
      'Family resides within Municipality of Mabini. Dependent upon seasonal agricultural and informal labor.',
    assessment:
      existingGis?.assessment ||
      'Client is assessed to be in need of comprehensive social welfare services and supportive intervention under municipal guidelines.',
    recommendation_action:
      existingGis?.recommendation_action ||
      caseRecord.intake_notes ||
      'Provision of immediate psychosocial support, endorsement for legal/medical assistance, and continuous case monitoring.',

    priority_assistance_for:
      existingGis?.priority_assistance_for || 'Social Service / Assistance',
    priority_rank: existingGis?.priority_rank || '1',
    date_interviewed:
      existingGis?.date_interviewed ||
      caseRecord.reported_at ||
      new Date().toISOString().slice(0, 10),
    client_signature_name:
      existingGis?.client_signature_name || caseRecord.victim_name,
    mswdo_worker_name:
      existingGis?.mswdo_worker_name ||
      caseRecord.assigned_worker_name ||
      'MSWDO Case Worker',
    noted_by_name:
      existingGis?.noted_by_name || 'VIRGENCITA M. CHU, RSW, MPA',
  }));

  function handleToggleSector(sectorId: GeneralIntakeSector) {
    setFormData((prev) => {
      const exists = prev.sectors.includes(sectorId);
      const updated = exists
        ? prev.sectors.filter((s) => s !== sectorId)
        : [...prev.sectors, sectorId];
      return { ...prev, sectors: updated };
    });
  }

  function handleAddFamilyMember() {
    if (formData.family_members.length >= 10) {
      alert('Maximum of 10 family members allowed as per the official Municipal GIS sheet.');
      return;
    }
    const newMember: CaseFamilyMember = {
      name: '',
      age: 0,
      civil_status: 'Single',
      relationship: '',
      educational_attainment: '',
      occupation: '',
      income: 0,
      birthday: '',
    };
    setFormData((prev) => ({
      ...prev,
      family_members: [...prev.family_members, newMember],
    }));
  }

  function handleRemoveFamilyMember(index: number) {
    setFormData((prev) => ({
      ...prev,
      family_members: prev.family_members.filter((_, i) => i !== index),
    }));
  }

  function handleFamilyMemberChange(
    index: number,
    field: keyof CaseFamilyMember,
    value: any,
  ) {
    setFormData((prev) => {
      const updated = [...prev.family_members];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, family_members: updated };
    });
  }

  function handleExpenseChange(
    field: keyof NonNullable<GeneralIntakeSheetData['monthly_expenses']>,
    value: number,
  ) {
    setFormData((prev) => {
      const current = prev.monthly_expenses || {
        food: 0,
        water: 0,
        electricity: 0,
        education: 0,
        transportation: 0,
      };
      const updated = { ...current, [field]: value };
      const total =
        (updated.food || 0) +
        (updated.water || 0) +
        (updated.electricity || 0) +
        (updated.education || 0) +
        (updated.transportation || 0);
      return {
        ...prev,
        monthly_expenses: { ...updated, total },
      };
    });
  }

  async function handleSaveGis() {
    setIsSaving(true);
    try {
      const updated = await updateCase(caseRecord.id, {
        intake_sheet: formData,
        case_summary: formData.problem_presented || caseRecord.case_summary,
        intake_notes: formData.recommendation_action || caseRecord.intake_notes,
      });
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onCaseUpdated?.(updated);
    } catch (err) {
      console.error('Failed to save General Intake Sheet:', err);
      alert('Error saving General Intake Sheet. Please check console.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Mabini MSWDO General Intake Sheet (GIS)
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 uppercase">
                Official 2-Page Form
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Standard clinical intake document for social case management & assistance.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl">
              <Check className="h-3.5 w-3.5" /> Saved!
            </span>
          )}

          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm transition"
              >
                <Edit3 className="h-3.5 w-3.5 text-amber-600" />
                Edit GIS
              </button>
              <button
                type="button"
                onClick={() => printGeneralIntakeSheet(caseRecord)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 shadow-sm transition"
              >
                <Printer className="h-3.5 w-3.5" />
                Print 2-Page GIS
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGis}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save GIS Changes
              </button>
            </>
          )}
        </div>
      </div>

      {/* FORM CONTENT */}
      {isEditing ? (
        /* ================= EDIT MODE ================= */
        <div className="space-y-6 bg-slate-50/50 p-4 sm:p-6 rounded-2xl border border-slate-200">
          {/* Metadata & Admission */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Date of Interview
              </label>
              <input
                type="date"
                value={formData.date_of_interview}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, date_of_interview: e.target.value }))
                }
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Admission Category
              </label>
              <select
                value={formData.client_category}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    client_category: e.target.value as GeneralIntakeCategory,
                  }))
                }
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-amber-500 outline-none font-semibold"
              >
                <option value="walk_in">Walk-in</option>
                <option value="referred">Referred</option>
                <option value="rescued">Rescued</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Case Category
              </label>
              <select
                value={formData.case_category_type}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    case_category_type: e.target.value,
                  }))
                }
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-amber-500 outline-none font-semibold"
              >
                <option value="vawc">VAWC (RA 9262)</option>
                <option value="acts_of_lasciviousness">Acts of Lasciviousness</option>
                <option value="rape">Rape / Attempted Rape</option>
                <option value="child_custody">Child Custody</option>
                <option value="child_support">Child Support</option>
                <option value="permit_to_travel">Permit to Travel (Minors)</option>
                <option value="indigency">Certificate of Indigency</option>
                <option value="scsr">Social Case Study Report (SCSR)</option>
                <option value="adoption">Adoption / Foster Care</option>
                <option value="trafficking">Trafficking in Persons</option>
                <option value="osaec_csaem">OSAEC & CSAEM (Online Exploitation)</option>
                <option value="other">Others (Specify)</option>
              </select>

              {/* Pop-up input right under Case Category when Others is selected */}
              {(formData.case_category_type === 'other' ||
                formData.case_category_type === 'permit_to_travel' ||
                formData.case_category_type === 'indigency' ||
                formData.case_category_type === 'scsr' ||
                formData.case_category_type === 'adoption' ||
                formData.case_category_type === 'trafficking' ||
                formData.case_category_type === 'osaec_csaem' ||
                Boolean(formData.case_category_other)) && (
                <div className="pt-1.5 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  <label className="text-[11px] font-bold text-amber-900 block">
                    Specify Others / I-type ang Kategorya:
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={formData.case_category_other || ''}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, case_category_other: e.target.value }))
                    }
                    placeholder="I-type diri ang category..."
                    className="w-full p-2 text-xs rounded-xl border-2 border-amber-500 bg-amber-50/50 text-slate-900 font-medium focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sector Tags */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Sectors (Multi-Select)
            </label>
            <div className="flex flex-wrap gap-2">
              {SECTOR_OPTIONS.map((sec) => {
                const active = formData.sectors.includes(sec.id);
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleToggleSector(sec.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5',
                      active
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100',
                    )}
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                    {sec.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section I Demographics */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              I. Client Identifying Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Birthdate
                </label>
                <input
                  type="date"
                  value={formData.birthdate || ''}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, birthdate: e.target.value }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Birthplace
                </label>
                <input
                  type="text"
                  value={formData.birthplace || ''}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, birthplace: e.target.value }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Length of stay at address
                </label>
                <input
                  type="text"
                  value={formData.length_of_stay || ''}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, length_of_stay: e.target.value }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Civil Status
                </label>
                <select
                  value={formData.civil_status || 'Single'}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, civil_status: e.target.value }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                >
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                  <option value="Common Law / Live-in">Common Law / Live-in</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Educational Attainment
                </label>
                <input
                  type="text"
                  value={formData.educational_attainment || ''}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      educational_attainment: e.target.value,
                    }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Religion
                </label>
                <input
                  type="text"
                  value={formData.religion || ''}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, religion: e.target.value }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Present Occupation
                </label>
                <input
                  type="text"
                  value={formData.occupation || ''}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, occupation: e.target.value }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Monthly Income (₱)
                </label>
                <input
                  type="number"
                  value={formData.monthly_income ?? ''}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      monthly_income: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  House Occupancy
                </label>
                <select
                  value={formData.house_occupancy || 'owner'}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, house_occupancy: e.target.value }))
                  }
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                >
                  <option value="owner">Owner</option>
                  <option value="renter">Renter</option>
                  <option value="sharer">Sharer / Extended</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Property Damage (₱)
                </label>
                <input
                  type="number"
                  value={formData.estimated_property_damage ?? ''}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      estimated_property_damage: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0.00"
                  className="w-full p-2 text-xs rounded-lg border border-slate-300"
                />
              </div>
            </div>
          </div>

          {/* Family Members (1-10) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Family Composition Table ({formData.family_members.length}/10)
              </h4>
              <button
                type="button"
                onClick={handleAddFamilyMember}
                disabled={formData.family_members.length >= 10}
                className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition"
              >
                <Plus className="h-3 w-3" /> Add Member
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-semibold text-left">
                    <th className="p-2">#</th>
                    <th className="p-2">Name</th>
                    <th className="p-2 w-16">Age</th>
                    <th className="p-2">Civil Status</th>
                    <th className="p-2">Relationship</th>
                    <th className="p-2">Education</th>
                    <th className="p-2">Occupation</th>
                    <th className="p-2 w-24">Income (₱)</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formData.family_members.map((m, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={m.name}
                          onChange={(e) =>
                            handleFamilyMemberChange(idx, 'name', e.target.value)
                          }
                          className="w-full p-1.5 text-xs rounded border border-slate-300"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          value={m.age || ''}
                          onChange={(e) =>
                            handleFamilyMemberChange(
                              idx,
                              'age',
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-16 p-1.5 text-xs rounded border border-slate-300 text-center"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={m.civil_status || ''}
                          onChange={(e) =>
                            handleFamilyMemberChange(
                              idx,
                              'civil_status',
                              e.target.value,
                            )
                          }
                          className="w-24 p-1.5 text-xs rounded border border-slate-300"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={m.relationship || ''}
                          onChange={(e) =>
                            handleFamilyMemberChange(
                              idx,
                              'relationship',
                              e.target.value,
                            )
                          }
                          className="w-28 p-1.5 text-xs rounded border border-slate-300"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={m.educational_attainment || ''}
                          onChange={(e) =>
                            handleFamilyMemberChange(
                              idx,
                              'educational_attainment',
                              e.target.value,
                            )
                          }
                          className="w-28 p-1.5 text-xs rounded border border-slate-300"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={m.occupation || ''}
                          onChange={(e) =>
                            handleFamilyMemberChange(
                              idx,
                              'occupation',
                              e.target.value,
                            )
                          }
                          className="w-24 p-1.5 text-xs rounded border border-slate-300"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          value={m.income ?? ''}
                          onChange={(e) =>
                            handleFamilyMemberChange(
                              idx,
                              'income',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-24 p-1.5 text-xs rounded border border-slate-300 text-right"
                        />
                      </td>
                      <td className="p-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveFamilyMember(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expenses Breakdown */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b pb-2">
              Monthly Household Expenses (₱)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Food
                </label>
                <input
                  type="number"
                  value={formData.monthly_expenses?.food ?? ''}
                  onChange={(e) =>
                    handleExpenseChange('food', parseFloat(e.target.value) || 0)
                  }
                  className="w-full p-2 text-xs rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Water
                </label>
                <input
                  type="number"
                  value={formData.monthly_expenses?.water ?? ''}
                  onChange={(e) =>
                    handleExpenseChange('water', parseFloat(e.target.value) || 0)
                  }
                  className="w-full p-2 text-xs rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Electricity
                </label>
                <input
                  type="number"
                  value={formData.monthly_expenses?.electricity ?? ''}
                  onChange={(e) =>
                    handleExpenseChange(
                      'electricity',
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  className="w-full p-2 text-xs rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Education
                </label>
                <input
                  type="number"
                  value={formData.monthly_expenses?.education ?? ''}
                  onChange={(e) =>
                    handleExpenseChange(
                      'education',
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  className="w-full p-2 text-xs rounded border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Transportation
                </label>
                <input
                  type="number"
                  value={formData.monthly_expenses?.transportation ?? ''}
                  onChange={(e) =>
                    handleExpenseChange(
                      'transportation',
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  className="w-full p-2 text-xs rounded border border-slate-300"
                />
              </div>
              <div className="bg-amber-50 p-2 rounded border border-amber-200">
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  Total Monthly
                </label>
                <span className="block text-sm font-black text-amber-900 mt-1">
                  ₱{formData.monthly_expenses?.total?.toLocaleString() || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Clinical Narratives: II - V */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                II. PROBLEM PRESENTED
              </label>
              <textarea
                rows={3}
                value={formData.problem_presented || ''}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, problem_presented: e.target.value }))
                }
                className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                III. FAMILY BACKGROUND INFORMATION
              </label>
              <textarea
                rows={3}
                value={formData.family_background || ''}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, family_background: e.target.value }))
                }
                className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                IV. ASSESSMENT
              </label>
              <textarea
                rows={3}
                value={formData.assessment || ''}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, assessment: e.target.value }))
                }
                className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                V. RECOMMENDATION / ACTION TAKEN
              </label>
              <textarea
                rows={3}
                value={formData.recommendation_action || ''}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    recommendation_action: e.target.value,
                  }))
                }
                className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
              />
            </div>
          </div>

          {/* Priority & Signatures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-slate-200 bg-white">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Priority Assistance For
              </label>
              <input
                type="text"
                value={formData.priority_assistance_for || ''}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    priority_assistance_for: e.target.value,
                  }))
                }
                className="w-full p-2 text-xs rounded border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Priority Rank
              </label>
              <input
                type="text"
                value={formData.priority_rank || ''}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, priority_rank: e.target.value }))
                }
                className="w-full p-2 text-xs rounded border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Client Signature Name
              </label>
              <input
                type="text"
                value={formData.client_signature_name || ''}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    client_signature_name: e.target.value,
                  }))
                }
                className="w-full p-2 text-xs rounded border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Assessed By (MSWDO Worker)
              </label>
              <input
                type="text"
                value={formData.mswdo_worker_name || ''}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    mswdo_worker_name: e.target.value,
                  }))
                }
                className="w-full p-2 text-xs rounded border border-slate-300"
              />
            </div>
          </div>
        </div>
      ) : (
        /* ================= VIEW MODE ================= */
        <div className="space-y-6">
          {/* Header Summary Banner */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">
                  DATE OF INTERVIEW:
                </span>
                <span className="text-xs font-bold text-slate-900 underline">
                  {formData.date_of_interview}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">CASE NUMBER:</span>
                <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {caseRecord.case_number}
                </span>
              </div>
            </div>

            {/* Category Tags Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Admission Category
                </span>
                <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-900 uppercase">
                  {formData.client_category.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Sectors
                </span>
                <div className="flex flex-wrap gap-1">
                  {formData.sectors.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 uppercase"
                    >
                      {s.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Case Category
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-900 uppercase">
                    {formData.case_category_type.replace(/_/g, ' ')}
                  </span>
                  {formData.case_category_other && (
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                      Details: {formData.case_category_other}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section I: Identifying Information Details */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b pb-2 flex items-center gap-2">
              <User className="h-4 w-4 text-amber-600" />
              I. Identifying Information
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-y-3 gap-x-4 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Client Name:</span>
                <span className="font-bold text-slate-900">{caseRecord.victim_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Age & Sex:</span>
                <span className="font-bold text-slate-900">
                  {caseRecord.victim_age || '—'} yrs old • {caseRecord.victim_gender === 'F' ? 'Female' : 'Male'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Birthdate:</span>
                <span className="font-medium text-slate-900">{formData.birthdate || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Civil Status:</span>
                <span className="font-medium text-slate-900">{formData.civil_status || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Education:</span>
                <span className="font-medium text-slate-900">{formData.educational_attainment || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Occupation:</span>
                <span className="font-medium text-slate-900">{formData.occupation || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Monthly Income:</span>
                <span className="font-bold text-slate-900">
                  {formData.monthly_income ? `₱${formData.monthly_income.toLocaleString()}` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">House Occupancy:</span>
                <span className="font-medium text-slate-900 capitalize">{formData.house_occupancy || 'Owner'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[11px]">Residence Address:</span>
                <span className="font-medium text-slate-900">
                  {caseRecord.victim_address || `Barangay ${caseRecord.barangay_id}, Mabini`}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Length of Stay:</span>
                <span className="font-medium text-slate-900">{formData.length_of_stay || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Contact Number:</span>
                <span className="font-medium text-slate-900">{caseRecord.victim_contact || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Family Composition Table */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b pb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-amber-600" />
              Family Members Composition
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold border-b">
                    <th className="py-2 px-3 text-center w-8">#</th>
                    <th className="py-2 px-3 text-left">Name</th>
                    <th className="py-2 px-3 text-center w-12">Age</th>
                    <th className="py-2 px-3 text-left">Civil Status</th>
                    <th className="py-2 px-3 text-left">Relationship</th>
                    <th className="py-2 px-3 text-left">Education</th>
                    <th className="py-2 px-3 text-left">Occupation</th>
                    <th className="py-2 px-3 text-right">Income</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formData.family_members.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800 uppercase">{m.name}</td>
                      <td className="py-2 px-3 text-center text-slate-600">{m.age}</td>
                      <td className="py-2 px-3 text-slate-600">{m.civil_status}</td>
                      <td className="py-2 px-3 text-slate-600">{m.relationship}</td>
                      <td className="py-2 px-3 text-slate-600">{m.educational_attainment}</td>
                      <td className="py-2 px-3 text-slate-600">{m.occupation}</td>
                      <td className="py-2 px-3 text-right font-medium text-slate-800">
                        {m.income ? `₱${m.income.toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Monthly Expenses Display */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-4">
                <span className="text-slate-500 font-semibold">Monthly Expenses:</span>
                <span className="text-slate-700">Food: ₱{formData.monthly_expenses?.food || 0}</span>
                <span className="text-slate-700">Water: ₱{formData.monthly_expenses?.water || 0}</span>
                <span className="text-slate-700">Electric: ₱{formData.monthly_expenses?.electricity || 0}</span>
                <span className="text-slate-700">Education: ₱{formData.monthly_expenses?.education || 0}</span>
                <span className="text-slate-700">Transpo: ₱{formData.monthly_expenses?.transportation || 0}</span>
              </div>
              <div className="font-bold text-slate-900 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
                Total Expenses: ₱{formData.monthly_expenses?.total?.toLocaleString() || 0}
              </div>
            </div>
          </div>

          {/* Clinical Narratives (II - V) */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b pb-2">
              Clinical Assessment & Findings (Sections II - V)
            </h4>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <h5 className="font-bold text-slate-800 mb-1">II. PROBLEM PRESENTED</h5>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {formData.problem_presented}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <h5 className="font-bold text-slate-800 mb-1">
                  III. FAMILY BACKGROUND INFORMATION
                </h5>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {formData.family_background}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <h5 className="font-bold text-slate-800 mb-1">IV. ASSESSMENT</h5>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {formData.assessment}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <h5 className="font-bold text-slate-800 mb-1">
                  V. RECOMMENDATION / ACTION TAKEN
                </h5>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {formData.recommendation_action}
                </p>
              </div>
            </div>
          </div>

          {/* Priority & Signatures Box */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs border-b pb-3">
              <div>
                <span className="text-slate-500">Priority Assistance For:</span>{' '}
                <strong className="text-slate-900">{formData.priority_assistance_for}</strong>
              </div>
              <div>
                <span className="text-slate-500">Priority Rank:</span>{' '}
                <strong className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {formData.priority_rank}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 text-center text-xs">
              <div className="border-t border-slate-300 pt-2">
                <p className="font-bold text-slate-900 uppercase">
                  {formData.client_signature_name || caseRecord.victim_name}
                </p>
                <p className="text-[10px] text-slate-500">Client / Applicant Signature</p>
              </div>

              <div className="border-t border-slate-300 pt-2">
                <p className="font-bold text-slate-900 uppercase">
                  {formData.mswdo_worker_name || caseRecord.assigned_worker_name || 'Social Worker'}
                </p>
                <p className="text-[10px] text-slate-500">Assessed by (MSWDO Worker)</p>
              </div>

              <div className="border-t border-slate-300 pt-2">
                <p className="font-bold text-slate-900 uppercase">
                  {formData.noted_by_name || 'VIRGENCITA M. CHU, RSW, MPA'}
                </p>
                <p className="text-[10px] text-slate-500">Noted by (MSWDO Head)</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

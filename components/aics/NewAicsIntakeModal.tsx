'use client';

import React, { useState, useEffect, useId } from 'react';
import {
  X,
  User,
  HeartHandshake,
  DollarSign,
  Users,
  FileText,
  Printer,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Upload,
  Camera,
  CheckCircle2,
  FileCheck,
  Eye,
  Check,
  AlertTriangle,
  FileImage,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import {
  AICS_INTAKE_MODES,
  AICS_SECTORS,
  AICS_CLIENT_CATEGORIES,
  AICS_ASSISTANCE_TYPES,
  getAicsSubCategories,
} from '@/lib/aics/aics-categories';
import {
  getAicsRequirementTemplates,
  type AicsRequirementTemplate,
  type AicsRequirementDocument,
} from '@/lib/aics/aics-requirements';
import { compressDocumentPhoto, formatDocumentSize } from '@/lib/solo-parents/document-compressor';
import { createAicsRecord, generateAicsControlNumber, getAicsRecords } from '@/lib/db/aics';
import {
  getAicsDailyBudget,
  calculateAicsDailyBudgetSummary,
  formatAicsCurrency,
  type AicsDailyBudgetSummary,
} from '@/lib/db/aics-budget';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import { getCurrentUser } from '@/lib/auth';
import type {
  AicsRecord,
  AicsClientCategory,
  AicsAssistanceType,
  AicsIntakeCategory,
  AicsSector,
  CaseFamilyMember,
} from '@/lib/db/schema';

interface NewAicsIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (record: AicsRecord) => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

const WIZARD_STEPS = [
  { step: 1, title: 'Intake & Aid', shortTitle: 'Intake', icon: User },
  { step: 2, title: 'Requirements & Uploads', shortTitle: 'Requirements', icon: FileCheck },
  { step: 3, title: 'Family & Expenses', shortTitle: 'Family', icon: Users },
  { step: 4, title: 'Clinical Assessment', shortTitle: 'Assessment', icon: FileText },
  { step: 5, title: 'Review & Finalize', shortTitle: 'Review', icon: CheckCircle2 },
] as const;

export default function NewAicsIntakeModal({
  isOpen,
  onClose,
  onSuccess,
}: NewAicsIntakeModalProps) {
  const currentUser = getCurrentUser();
  const fileInputPrefix = useId();

  // Step state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [budgetSummary, setBudgetSummary] = useState<AicsDailyBudgetSummary | null>(null);

  useEffect(() => {
    if (isOpen) {
      void Promise.all([getAicsDailyBudget(), getAicsRecords()]).then(([budget, recs]) => {
        setBudgetSummary(calculateAicsDailyBudgetSummary(budget, recs));
      });
    }
  }, [isOpen]);

  // Form State - Identification & Intake
  const [controlNumber] = useState(generateAicsControlNumber());
  const [intakeDate, setIntakeDate] = useState(new Date().toISOString().split('T')[0]);
  const [intakeCategory, setIntakeCategory] = useState<AicsIntakeCategory>('walk_in');
  const [sectors, setSectors] = useState<AicsSector[]>([]);
  const [clientCategory, setClientCategory] = useState<AicsClientCategory>('fhona');
  const [subCategory, setSubCategory] = useState<string>('Dialysis Patients');

  // Client Details
  const [clientName, setClientName] = useState('');
  const [clientAge, setClientAge] = useState<string>('');
  const [clientGender, setClientGender] = useState<'Male' | 'Female'>('Female');
  const [birthdate, setBirthdate] = useState('');
  const [birthplace, setBirthplace] = useState('');
  const [barangayId, setBarangayId] = useState(currentUser?.barangay_id || 'poblacion');
  const [purokSitio, setPurokSitio] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [civilStatus, setCivilStatus] = useState('married');
  const [religion, setReligion] = useState('Roman Catholic');
  const [educationalAttainment, setEducationalAttainment] = useState('High School Graduate');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('0');
  const [houseOccupancy, setHouseOccupancy] = useState<'owner' | 'renter'>('owner');

  // Assistance Details
  const [assistanceType, setAssistanceType] = useState<AicsAssistanceType>('medical');
  const [specificAssistance, setSpecificAssistance] = useState('Hemodialysis Treatment Assistance');
  const [amountApproved, setAmountApproved] = useState<string>('3000');
  const [disbursementType, setDisbursementType] = useState('cash');

  // Step 2: Requirements Checklist & File Attachments State
  const [requirementChecklist, setRequirementChecklist] = useState<Record<string, boolean>>({
    barangay_indigency: false,
    valid_id: false,
  });
  const [requirementDocuments, setRequirementDocuments] = useState<Record<string, AicsRequirementDocument>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<AicsRequirementDocument | null>(null);

  // Step 3: Family Members Table (up to 10 items)
  const [familyMembers, setFamilyMembers] = useState<CaseFamilyMember[]>([
    {
      name: '',
      age: '',
      civil_status: 'single',
      relationship: 'Child',
      educational_attainment: 'Elementary',
      occupation: 'None',
      income: '',
      birthday: '',
    },
  ]);

  // Expenses
  const [expenses, setExpenses] = useState({
    food: 4000,
    water: 300,
    electricity: 800,
    education: 500,
    transportation: 400,
  });

  // Step 4: Clinical Narratives
  const [problemPresented, setProblemPresented] = useState('');
  const [familyBackground, setFamilyBackground] = useState('');
  const [assessment, setAssessment] = useState('');
  const [recommendation, setRecommendation] = useState('');

  if (!isOpen) return null;

  // Dynamic requirements templates for selected assistance & category
  const requirementTemplates = getAicsRequirementTemplates(
    assistanceType,
    clientCategory,
    sectors
  );

  const mandatoryCount = requirementTemplates.filter((r) => r.mandatory).length;
  const verifiedCount = requirementTemplates.filter(
    (r) => requirementChecklist[r.key] || Boolean(requirementDocuments[r.key])
  ).length;

  function toggleSector(s: AicsSector) {
    if (sectors.includes(s)) {
      setSectors(sectors.filter((item) => item !== s));
    } else {
      setSectors([...sectors, s]);
    }
  }

  function handleCategoryChange(cat: AicsClientCategory) {
    setClientCategory(cat);
    const subList = getAicsSubCategories(cat);
    if (subList.length > 0) {
      setSubCategory(subList[0]);
    } else {
      setSubCategory('');
    }
  }

  function addFamilyMember() {
    if (familyMembers.length >= 10) return;
    setFamilyMembers([
      ...familyMembers,
      {
        name: '',
        age: '',
        civil_status: 'single',
        relationship: 'Dependent',
        educational_attainment: '',
        occupation: '',
        income: '',
        birthday: '',
      },
    ]);
  }

  function updateFamilyMember(index: number, field: keyof CaseFamilyMember, val: string) {
    const updated = [...familyMembers];
    updated[index] = { ...updated[index], [field]: val };
    setFamilyMembers(updated);
  }

  function removeFamilyMember(index: number) {
    setFamilyMembers(familyMembers.filter((_, i) => i !== index));
  }

  // Handle file upload and compression for requirements
  async function handleFileUpload(reqKey: string, file: File) {
    setUploadingKey(reqKey);
    try {
      const compressed = await compressDocumentPhoto(file, {
        documentType: reqKey,
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.72,
      });

      setRequirementDocuments((prev) => ({
        ...prev,
        [reqKey]: {
          id: compressed.id,
          requirement_key: reqKey,
          name: compressed.name,
          file_url: compressed.file_url,
          file_size: compressed.file_size,
          original_size: compressed.original_size,
          uploaded_at: compressed.uploaded_at,
          saved_percentage: compressed.saved_percentage,
        },
      }));

      // Automatically mark hard copy as checked/verified
      setRequirementChecklist((prev) => ({
        ...prev,
        [reqKey]: true,
      }));
    } catch (err) {
      console.error(`Failed to process requirement upload for ${reqKey}:`, err);
      alert('Could not process this file. Please ensure it is a valid image or PDF.');
    } finally {
      setUploadingKey(null);
    }
  }

  function toggleRequirementCheck(reqKey: string) {
    setRequirementChecklist((prev) => ({
      ...prev,
      [reqKey]: !prev[reqKey],
    }));
  }

  function removeDocument(reqKey: string) {
    setRequirementDocuments((prev) => {
      const copy = { ...prev };
      delete copy[reqKey];
      return copy;
    });
  }

  // Step Navigation Handlers
  function goToNextStep() {
    setValidationError(null);

    if (currentStep === 1) {
      if (!clientName.trim()) {
        setValidationError('Please enter the client / applicant full name before proceeding.');
        return;
      }
      if (!barangayId) {
        setValidationError('Please select the client barangay in Mabini.');
        return;
      }
    }

    if (currentStep < 5) {
      setCurrentStep((prev) => (prev + 1) as WizardStep);
    }
  }

  function goToPreviousStep() {
    setValidationError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as WizardStep);
    }
  }

  function jumpToStep(step: WizardStep) {
    // Only allow jumping back, or jumping forward if step 1 is valid
    if (step > 1 && !clientName.trim()) {
      setValidationError('Please complete the client name in Step 1 first.');
      return;
    }
    setValidationError(null);
    setCurrentStep(step);
  }

  async function handleSave(andPrint = false) {
    if (!clientName.trim()) {
      setCurrentStep(1);
      setValidationError('Please enter the client / applicant name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedAmount = parseFloat(amountApproved) || 0;
      const parsedAge = parseInt(clientAge, 10) || 0;
      const parsedIncome = parseFloat(monthlyIncome) || 0;

      const record = await createAicsRecord({
        control_number: controlNumber,
        intake_date: intakeDate,
        intake_category: intakeCategory,
        sectors,
        client_category: clientCategory,
        sub_category: subCategory,
        client_name: clientName.trim(),
        client_age: parsedAge,
        client_gender: clientGender,
        barangay_id: barangayId,
        purok_sitio: purokSitio.trim(),
        contact_number: contactNumber.trim(),
        assistance_type: assistanceType,
        specific_assistance: specificAssistance.trim() || 'AICS Financial Grant',
        amount_approved: parsedAmount,
        disbursement_type: disbursementType,
        status: 'approved',
        assigned_worker_id: currentUser?.id,
        assigned_worker_name: currentUser?.name || 'MSWDO Intake Worker',
        intake_sheet: {
          date_of_interview: intakeDate,
          client_category: intakeCategory,
          sectors,
          case_category_type: 'aics',
          case_category_other: `${AICS_CLIENT_CATEGORIES[clientCategory]?.shortLabel} - ${subCategory}`,
          birthdate,
          birthplace,
          civil_status: civilStatus,
          educational_attainment: educationalAttainment,
          religion,
          occupation,
          monthly_income: parsedIncome,
          house_occupancy: houseOccupancy,
          family_members: familyMembers.filter((m) => m.name.trim().length > 0),
          monthly_expenses: {
            ...expenses,
            total:
              expenses.food +
              expenses.water +
              expenses.electricity +
              expenses.education +
              expenses.transportation,
          },
          problem_presented: problemPresented,
          family_background: familyBackground,
          assessment: assessment,
          recommendation_action: recommendation,
          priority_assistance_for: specificAssistance,
          priority_rank: `₱${parsedAmount.toLocaleString()}`,
          mswdo_worker_name: currentUser?.name || 'MSWDO Officer',
          noted_by_name: 'VIRGENCITA M. CHU, RSW, MPA',
          date_interviewed: intakeDate,
          requirements: {
            checklist: requirementChecklist,
            documents: Object.values(requirementDocuments),
            all_mandatory_met: verifiedCount >= mandatoryCount,
          },
        },
      });

      if (andPrint) {
        printGeneralIntakeSheet({
          id: record.id,
          case_number: record.control_number,
          case_type: 'other' as any,
          reported_at: record.intake_date,
          victim_name: record.client_name,
          victim_age: record.client_age,
          victim_gender: record.client_gender === 'Male' ? 'M' : 'F',
          victim_contact: record.contact_number,
          barangay_id: record.barangay_id,
          purok_sitio: record.purok_sitio,
          status: 'active' as any,
          case_summary: `${record.specific_assistance} (₱${record.amount_approved})`,
          source: 'manual_intake',
          intake_sheet: record.intake_sheet,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        });
      }

      onSuccess(record);
      onClose();
    } catch (err) {
      console.error('Failed to create AICS record:', err);
      alert('Error saving AICS intake record. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const subCategoriesList = getAicsSubCategories(clientCategory);
  const totalExpenses =
    expenses.food +
    expenses.water +
    expenses.electricity +
    expenses.education +
    expenses.transportation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 px-6 py-4 text-white flex items-center justify-between shadow-md shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/25 text-emerald-200 border border-emerald-400/30">
                Official Intake Form
              </span>
              <span className="text-xs text-slate-300 font-mono font-semibold">{controlNumber}</span>
            </div>
            <h2 className="text-lg font-black tracking-tight text-white mt-1 flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-emerald-300" />
              A.I.C.S. Crisis Assistance Intake Desk
            </h2>
            <p className="text-[11px] text-emerald-100/80">
              General Intake Sheet (GIS) & Assistance Voucher • MSWDO Mabini, Davao de Oro
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Wizard Stepper Bar (Next-Next Navigation) */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {WIZARD_STEPS.map((s, index) => {
              const Icon = s.icon;
              const isCurrent = currentStep === s.step;
              const isPast = currentStep > s.step;

              return (
                <React.Fragment key={s.step}>
                  <button
                    type="button"
                    onClick={() => jumpToStep(s.step as WizardStep)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition cursor-pointer group text-left ${
                      isCurrent
                        ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30 font-bold'
                        : isPast
                        ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70 font-semibold'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-medium'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                        isCurrent
                          ? 'bg-white text-emerald-800'
                          : isPast
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600 group-hover:bg-slate-300'
                      }`}
                    >
                      {isPast ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : s.step}
                    </div>
                    <span className="hidden sm:inline text-xs tracking-tight">
                      {s.shortTitle}
                    </span>
                  </button>

                  {index < WIZARD_STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1.5 transition-colors ${
                        currentStep > s.step ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Current Step Label for Mobile */}
          <div className="mt-2 text-center sm:hidden text-[11px] font-bold text-slate-600">
            Step {currentStep} of 5: <span className="text-emerald-700">{WIZARD_STEPS[currentStep - 1].title}</span>
          </div>
        </div>

        {/* Validation Error Alert if any */}
        {validationError && (
          <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span className="font-medium">{validationError}</span>
          </div>
        )}

        {/* Scrollable Wizard Step Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* =========================================================================
              STEP 1: INTAKE & DEMOGRAPHICS + ASSISTANCE REQUESTED
             ========================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Section Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-600" />
                    Step 1: Client Intake & Assistance Request
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Enter the client&apos;s identifying details, intake category, and the assistance applied for.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Step 1 of 5
                </span>
              </div>

              {/* Mode & Date */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                      Intake Mode (Entry Category) *
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {AICS_INTAKE_MODES.map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setIntakeCategory(mode.id)}
                          className={`py-2 px-3 text-xs font-bold rounded-xl border text-center transition cursor-pointer ${
                            intakeCategory === mode.id
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                      Date of Interview *
                    </label>
                    <input
                      type="date"
                      value={intakeDate}
                      onChange={(e) => setIntakeDate(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {/* Beneficiary Sectors */}
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                    Beneficiary Sectors (Select all applicable)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {AICS_SECTORS.map((sec) => {
                      const isSelected = sectors.includes(sec.id);
                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => toggleSector(sec.id)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer border ${
                            isSelected
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {sec.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Client Identifying Information */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Client Identifying Information
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Name of Applicant / Client <span className="text-rose-600 font-black">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g. Maria Clara De Los Santos"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Gender</label>
                    <select
                      value={clientGender}
                      onChange={(e) => setClientGender(e.target.value as any)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:border-emerald-500 outline-none"
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Age</label>
                    <input
                      type="number"
                      value={clientAge}
                      onChange={(e) => setClientAge(e.target.value)}
                      placeholder="e.g. 45"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Birthdate</label>
                    <input
                      type="date"
                      value={birthdate}
                      onChange={(e) => setBirthdate(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Contact / Phone Number</label>
                    <input
                      type="text"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      placeholder="e.g. 0917-123-4567"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Barangay (Mabini) <span className="text-rose-600 font-black">*</span>
                    </label>
                    <select
                      value={barangayId}
                      onChange={(e) => setBarangayId(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:border-emerald-500 outline-none"
                    >
                      {BARANGAY_REGISTRY.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Purok / Sitio / House No.</label>
                    <input
                      type="text"
                      value={purokSitio}
                      onChange={(e) => setPurokSitio(e.target.value)}
                      placeholder="e.g. Purok 4, Sitio Malipayon"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Civil Status</label>
                    <select
                      value={civilStatus}
                      onChange={(e) => setCivilStatus(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:border-emerald-500 outline-none"
                    >
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                      <option value="widowed">Widowed</option>
                      <option value="separated">Separated</option>
                      <option value="cohabitation">Live-in / Cohabitation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Occupation</label>
                    <input
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      placeholder="e.g. Farmer / Fisherfolk / None"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Monthly Income (₱)</label>
                    <input
                      type="number"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      placeholder="0"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* AICS Client Category & Assistance Type */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 space-y-4">
                <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                  <HeartHandshake className="h-4 w-4 text-emerald-700" />
                  Official MSWDO Category & Assistance Grant
                </h4>

                {/* 4 Client Categories Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(AICS_CLIENT_CATEGORIES) as AicsClientCategory[]).map((catKey) => {
                    const cat = AICS_CLIENT_CATEGORIES[catKey];
                    const isSelected = clientCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => handleCategoryChange(catKey)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <p className={`text-[10px] font-black uppercase ${isSelected ? 'text-emerald-200' : 'text-slate-400'}`}>
                          {cat.shortLabel}
                        </p>
                        <p className="text-xs font-bold leading-tight mt-0.5">{cat.name}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Specific Sub-Category (Target Client Group) *
                    </label>
                    <select
                      value={subCategory}
                      onChange={(e) => setSubCategory(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:border-emerald-500 outline-none"
                    >
                      {subCategoriesList.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Assistance Type (Aid Category) *
                    </label>
                    <select
                      value={assistanceType}
                      onChange={(e) => setAssistanceType(e.target.value as AicsAssistanceType)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:border-emerald-500 outline-none"
                    >
                      {AICS_ASSISTANCE_TYPES.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">Specific Assistance / Purpose *</label>
                    <input
                      type="text"
                      value={specificAssistance}
                      onChange={(e) => setSpecificAssistance(e.target.value)}
                      placeholder="e.g. Hospitalization Bill, Funeral Grant"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">Approved Grant Amount (₱) *</label>
                    <input
                      type="number"
                      value={amountApproved}
                      onChange={(e) => setAmountApproved(e.target.value)}
                      placeholder="3000"
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-black text-emerald-800 focus:border-emerald-500 outline-none font-mono"
                    />

                    {/* Real-Time Daily Budget Feedback */}
                    {budgetSummary && budgetSummary.hasBudgetSet && (
                      <div className="mt-1.5 space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between text-[10.5px]">
                          <span className="text-slate-500 font-semibold">Today's Remaining:</span>
                          <span
                            className={`font-black ${
                              budgetSummary.remainingAmount > 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {formatAicsCurrency(budgetSummary.remainingAmount)}
                          </span>
                        </div>

                        {parseFloat(amountApproved || '0') > 0 && (
                          <div className="text-[10px] flex items-center justify-between border-t border-slate-200/60 pt-0.5">
                            <span className="text-slate-500">Balance after this release:</span>
                            <span
                              className={`font-bold ${
                                budgetSummary.remainingAmount - parseFloat(amountApproved || '0') >= 0
                                  ? 'text-teal-700 font-black'
                                  : 'text-amber-700 font-black'
                              }`}
                            >
                              {formatAicsCurrency(
                                budgetSummary.remainingAmount - parseFloat(amountApproved || '0')
                              )}
                            </span>
                          </div>
                        )}

                        {parseFloat(amountApproved || '0') > budgetSummary.remainingAmount && (
                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[10.5px] text-amber-900 leading-tight flex items-start gap-1.5 mt-1">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              <strong>Soft Cap Warning:</strong> Exceeds today's remaining allocation of{' '}
                              {formatAicsCurrency(budgetSummary.remainingAmount)} by{' '}
                              {formatAicsCurrency(
                                parseFloat(amountApproved || '0') - budgetSummary.remainingAmount
                              )}
                              . This intake may proceed with supervisor notation.
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">Disbursement Mode</label>
                    <select
                      value={disbursementType}
                      onChange={(e) => setDisbursementType(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:border-emerald-500 outline-none"
                    >
                      <option value="cash">Cash Pay-out (Municipal Treasury)</option>
                      <option value="guarantee_letter">Guarantee Letter (GL)</option>
                      <option value="cheque">Cheque Voucher</option>
                      <option value="food_pack">Food / In-Kind Goods</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              STEP 2: REQUIREMENTS & DOCUMENT UPLOADS (THE USER'S REQUEST)
             ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Step Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-emerald-600" />
                    Step 2: Required Documents & File Uploads
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Verify hard-copy documents and take photo or upload files for each requirement based on the selected assistance.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-extrabold px-3 py-1 rounded-full border ${
                      verifiedCount >= mandatoryCount
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}
                  >
                    {verifiedCount} of {mandatoryCount} Mandatory Verified
                  </span>
                </div>
              </div>

              {/* Quick Summary Pill of Aid */}
              <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    ₱
                  </div>
                  <div>
                    <p className="text-xs font-black text-emerald-950">
                      {specificAssistance || 'Crisis Financial Grant'}
                    </p>
                    <p className="text-[11px] text-emerald-800/80 font-medium">
                      Client: <strong>{clientName || 'Applicant'}</strong> • Type:{' '}
                      <span className="capitalize">{assistanceType}</span> • Amount:{' '}
                      <strong>₱{parseFloat(amountApproved || '0').toLocaleString()}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-[11px] font-bold text-slate-600 bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-200">
                  Category: {AICS_CLIENT_CATEGORIES[clientCategory]?.shortLabel} ({subCategory})
                </div>
              </div>

              {/* Requirement Checklist & Upload Cards */}
              <div className="space-y-3">
                {requirementTemplates.map((req, reqIndex) => {
                  const isChecked = Boolean(requirementChecklist[req.key]);
                  const doc = requirementDocuments[req.key];
                  const isUploading = uploadingKey === req.key;
                  const inputId = `${fileInputPrefix}-req-file-${req.key}`;

                  return (
                    <div
                      key={req.key}
                      className={`p-4 rounded-2xl border transition-all ${
                        doc || isChecked
                          ? 'bg-emerald-50/30 border-emerald-300 ring-1 ring-emerald-500/20 shadow-xs'
                          : req.mandatory
                          ? 'bg-white border-slate-200 hover:border-slate-300'
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Requirement Info & Checkbox */}
                        <div className="flex items-start gap-3 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleRequirementCheck(req.key)}
                            className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border transition cursor-pointer shrink-0 ${
                              isChecked || doc
                                ? 'bg-emerald-600 border-emerald-700 text-white'
                                : 'bg-white border-slate-300 hover:border-emerald-500'
                            }`}
                          >
                            {(isChecked || doc) && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                          </button>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-slate-900">
                                {reqIndex + 1}. {req.label}
                              </span>
                              {req.mandatory ? (
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                                  * Required
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  Optional / Supplementary
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              {req.description}
                            </p>
                          </div>
                        </div>

                        {/* Upload & Verified Controls */}
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          {/* Hidden File Input */}
                          <input
                            id={inputId}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleFileUpload(req.key, file);
                              }
                            }}
                          />

                          {/* Upload or Camera Button */}
                          <label
                            htmlFor={inputId}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                              doc
                                ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                : 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-800 shadow-sm'
                            }`}
                          >
                            {isUploading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Compressing...</span>
                              </>
                            ) : doc ? (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                                <span>Change File</span>
                              </>
                            ) : (
                              <>
                                <Camera className="h-3.5 w-3.5" />
                                <span>Upload / Snap Photo</span>
                              </>
                            )}
                          </label>

                          {/* Hard Copy Toggle Button */}
                          <button
                            type="button"
                            onClick={() => toggleRequirementCheck(req.key)}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                              isChecked
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {isChecked ? '✓ Hard Copy On File' : 'Mark Received'}
                          </button>
                        </div>
                      </div>

                      {/* Uploaded Document Badge Preview */}
                      {doc && (
                        <div className="mt-3 pt-3 border-t border-emerald-100 flex items-center justify-between gap-2 bg-emerald-50/60 p-2.5 rounded-xl">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            {doc.file_url.startsWith('data:image/') ? (
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                className="w-10 h-10 rounded-lg overflow-hidden border border-emerald-200 shrink-0 cursor-pointer hover:opacity-80 transition group relative"
                              >
                                <img
                                  src={doc.file_url}
                                  alt={doc.name}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                  <Eye className="h-4 w-4 text-white" />
                                </div>
                              </button>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                                <FileText className="h-5 w-5" />
                              </div>
                            )}

                            <div className="truncate">
                              <p className="text-xs font-bold text-slate-800 truncate">
                                {doc.name}
                              </p>
                              <p className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1.5">
                                <span>{formatDocumentSize(doc.file_size)}</span>
                                {doc.saved_percentage ? (
                                  <span className="text-emerald-600 bg-emerald-100/80 px-1.5 py-0.2 rounded text-[9px] font-extrabold">
                                    {doc.saved_percentage}% compressed
                                  </span>
                                ) : null}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {doc.file_url.startsWith('data:image/') && (
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                className="p-1.5 text-xs text-slate-600 hover:text-emerald-700 rounded-lg hover:bg-white transition cursor-pointer"
                                title="Preview Document"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => removeDocument(req.key)}
                              className="p-1.5 text-xs text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                              title="Remove Attachment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Requirement Notes */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2 text-amber-900 text-xs font-medium">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  MSWDO Guideline: You can mark physical hard copies as received, or use the camera to attach digital photos to the record for paperless audit and backup.
                </span>
              </div>
            </div>
          )}

          {/* =========================================================================
              STEP 3: FAMILY COMPOSITION & EXPENSES
             ========================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Step Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-600" />
                    Step 3: Family Composition & Household Expenses
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    General Intake Sheet Section II: Family members and socio-economic expenditure profile.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Step 3 of 5
                </span>
              </div>

              {/* Living Arrangement */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                    Housing Occupancy / Tenure
                  </label>
                  <select
                    value={houseOccupancy}
                    onChange={(e) => setHouseOccupancy(e.target.value as any)}
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:border-emerald-500 outline-none"
                  >
                    <option value="owner">Owner (Tag-iya sa balay)</option>
                    <option value="renter">Renter (Nag-abang)</option>
                    <option value="sharer">Living with Relatives (Nakipuyo)</option>
                    <option value="informal_settler">Informal Settler</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                    Highest Educational Attainment
                  </label>
                  <input
                    type="text"
                    value={educationalAttainment}
                    onChange={(e) => setEducationalAttainment(e.target.value)}
                    placeholder="e.g. High School Graduate, College Undergraduate"
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Family Members Table (up to 10 rows) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    II. Family Composition Table ({familyMembers.length}/10 Members)
                  </h4>
                  <button
                    type="button"
                    onClick={addFamilyMember}
                    disabled={familyMembers.length >= 10}
                    className="px-3 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Family Member
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-extrabold text-[11px] sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 w-8 text-center">#</th>
                          <th className="p-2.5 min-w-[140px]">Full Name</th>
                          <th className="p-2.5 w-24">Relationship</th>
                          <th className="p-2.5 w-16">Age</th>
                          <th className="p-2.5 w-24">Civil Status</th>
                          <th className="p-2.5 min-w-[110px]">Occupation</th>
                          <th className="p-2.5 w-24">Income (₱)</th>
                          <th className="p-2.5 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {familyMembers.map((member, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70 transition">
                            <td className="p-2 text-center text-slate-400 font-bold">{idx + 1}</td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={member.name}
                                onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)}
                                placeholder="Full Name"
                                className="w-full p-1.5 text-xs rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={member.relationship}
                                onChange={(e) => updateFamilyMember(idx, 'relationship', e.target.value)}
                                placeholder="e.g. Spouse"
                                className="w-full p-1.5 text-xs rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="number"
                                value={member.age || ''}
                                onChange={(e) => updateFamilyMember(idx, 'age', e.target.value)}
                                placeholder="Age"
                                className="w-full p-1.5 text-xs rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                              />
                            </td>
                            <td className="p-1.5">
                              <select
                                value={member.civil_status || 'single'}
                                onChange={(e) => updateFamilyMember(idx, 'civil_status', e.target.value)}
                                className="w-full p-1.5 text-xs rounded-lg border border-slate-200 bg-white outline-none"
                              >
                                <option value="single">Single</option>
                                <option value="married">Married</option>
                                <option value="widowed">Widowed</option>
                                <option value="child">Child</option>
                              </select>
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={member.occupation || ''}
                                onChange={(e) => updateFamilyMember(idx, 'occupation', e.target.value)}
                                placeholder="Occupation"
                                className="w-full p-1.5 text-xs rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="number"
                                value={member.income || ''}
                                onChange={(e) => updateFamilyMember(idx, 'income', e.target.value)}
                                placeholder="0"
                                className="w-full p-1.5 text-xs rounded-lg border border-slate-200 focus:border-emerald-500 outline-none font-mono"
                              />
                            </td>
                            <td className="p-1.5 text-center">
                              {familyMembers.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeFamilyMember(idx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                  title="Remove Member"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Monthly Expenses Breakdown */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Monthly Family Expenditures
                  </h4>
                  <span className="text-xs font-black text-slate-900 font-mono">
                    Total: <span className="text-emerald-700">₱{totalExpenses.toLocaleString()}</span> / mo
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Food (Pagkaon)</label>
                    <input
                      type="number"
                      value={expenses.food}
                      onChange={(e) => setExpenses({ ...expenses, food: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-white font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Water (Tubig)</label>
                    <input
                      type="number"
                      value={expenses.water}
                      onChange={(e) => setExpenses({ ...expenses, water: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-white font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Electricity (Kuryente)</label>
                    <input
                      type="number"
                      value={expenses.electricity}
                      onChange={(e) => setExpenses({ ...expenses, electricity: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-white font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Education (Eskwela)</label>
                    <input
                      type="number"
                      value={expenses.education}
                      onChange={(e) => setExpenses({ ...expenses, education: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-white font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Transport (Plete)</label>
                    <input
                      type="number"
                      value={expenses.transportation}
                      onChange={(e) => setExpenses({ ...expenses, transportation: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-white font-mono focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              STEP 4: CLINICAL ASSESSMENT & SOCIAL WORKER NARRATIVE
             ========================================================================= */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Step Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    Step 4: Social Worker Assessment & Recommendations
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Official 4 Clinical Narratives required on the General Intake Sheet (GIS).
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Step 4 of 5
                </span>
              </div>

              {/* 1. Problem Presented */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                  1. Problem Presented (Hinungdan sa Pagdangop sa MSWDO)
                </label>
                <textarea
                  rows={3}
                  value={problemPresented}
                  onChange={(e) => setProblemPresented(e.target.value)}
                  placeholder="Describe the crisis situation (e.g. Applicant seeks financial assistance for ongoing hemodialysis treatment due to End-Stage Renal Disease with insufficient family income)..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none leading-relaxed"
                />
              </div>

              {/* 2. Family Background */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                  2. Family Background & Socio-Economic Functioning
                </label>
                <textarea
                  rows={3}
                  value={familyBackground}
                  onChange={(e) => setFamilyBackground(e.target.value)}
                  placeholder="Describe the household structure, living conditions, and immediate support system..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none leading-relaxed"
                />
              </div>

              {/* 3. Social Worker Assessment */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                  3. Assessment (Pagtuki sa Kahimtang sa Kliyente)
                </label>
                <textarea
                  rows={3}
                  value={assessment}
                  onChange={(e) => setAssessment(e.target.value)}
                  placeholder="Clinical assessment on client's eligibility, vulnerability level, and coping capacity..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none leading-relaxed"
                />
              </div>

              {/* 4. Recommendation */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                  4. Recommendation & Action Plan (Girekomenda nga Hinabang)
                </label>
                <textarea
                  rows={3}
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                  placeholder="Recommended assistance (e.g. Recommend financial assistance of ₱3,000 for medical/dialysis expenses under the AICS Crisis Intervention Program)..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 outline-none leading-relaxed"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2 text-amber-900 text-xs font-medium">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  All clinical assessments are officially certified by the AICS Intake Officer and approved by MSWDO Head <strong>Virgencita M. Chu, RSW, MPA</strong>.
                </span>
              </div>
            </div>
          )}

          {/* =========================================================================
              STEP 5: REVIEW, APPROVAL & FINAL SUBMISSION
             ========================================================================= */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Step Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Step 5: Review & Finalize Intake Record
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Verify all client details, grant amount, and uploaded requirements before saving or printing.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Step 5 of 5
                </span>
              </div>

              {/* Comprehensive Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client Profile Card */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Client Profile
                    </span>
                    <button
                      type="button"
                      onClick={() => jumpToStep(1)}
                      className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>

                  <p className="text-sm font-black text-slate-900">{clientName || 'N/A'}</p>
                  <p className="text-xs text-slate-600">
                    {clientAge ? `${clientAge} yrs old` : ''} • {clientGender} • {civilStatus}
                  </p>
                  <p className="text-xs text-slate-600">
                    {purokSitio ? `${purokSitio}, ` : ''}Barangay {BARANGAY_REGISTRY.find((b) => b.id === barangayId)?.label || barangayId}
                  </p>
                  <p className="text-xs text-slate-600 font-mono">
                    Contact: {contactNumber || 'Not provided'}
                  </p>
                  <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                    Category: <strong>{AICS_CLIENT_CATEGORIES[clientCategory]?.name}</strong> ({subCategory})
                  </div>
                </div>

                {/* Aid & Voucher Card */}
                <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                    <span className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                      Assistance Voucher Grant
                    </span>
                    <button
                      type="button"
                      onClick={() => jumpToStep(1)}
                      className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                      Specific Purpose
                    </span>
                    <p className="text-sm font-black text-emerald-950">
                      {specificAssistance || 'AICS Financial Grant'}
                    </p>
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                        Approved Amount
                      </span>
                      <p className="text-2xl font-black text-emerald-800 font-mono">
                        ₱{parseFloat(amountApproved || '0').toLocaleString()}
                      </p>
                      {budgetSummary && budgetSummary.hasBudgetSet && (
                        <span className="text-[10px] font-bold text-emerald-700 block">
                          Today's fund balance after release:{' '}
                          {formatAicsCurrency(
                            budgetSummary.remainingAmount - parseFloat(amountApproved || '0')
                          )}
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                        Disbursement
                      </span>
                      <p className="text-xs font-extrabold text-slate-700 capitalize">
                        {disbursementType.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Requirements & Documents Review */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="h-4 w-4 text-emerald-600" />
                    Verified Documents & Attachments ({verifiedCount}/{mandatoryCount} Mandatory)
                  </span>
                  <button
                    type="button"
                    onClick={() => jumpToStep(2)}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
                  >
                    Edit
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {requirementTemplates.map((req) => {
                    const isChecked = Boolean(requirementChecklist[req.key]);
                    const doc = requirementDocuments[req.key];
                    const isDone = isChecked || doc;

                    return (
                      <div
                        key={req.key}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          isDone
                            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                            : req.mandatory
                            ? 'bg-rose-50/50 border-rose-200 text-rose-900'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : req.mandatory ? (
                            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                          )}
                          <span className="font-bold truncate">{req.label}</span>
                        </div>

                        {doc && (
                          <span className="text-[10px] font-bold bg-emerald-200/60 text-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                            Attached
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assessment Narrative Summary */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Social Worker Assessment Summary
                  </span>
                  <button
                    type="button"
                    onClick={() => jumpToStep(4)}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
                  >
                    Edit
                  </button>
                </div>

                <p className="text-xs text-slate-700 italic">
                  &ldquo;{assessment || problemPresented || 'Crisis intervention financial assistance assessed and endorsed.'}&rdquo;
                </p>
                <div className="text-[11px] text-slate-500 pt-1">
                  Intake Worker: <strong>{currentUser?.name || 'MSWDO Officer'}</strong> • Recommending Head:{' '}
                  <strong>Virgencita M. Chu, RSW, MPA</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer with Next / Previous & Submit Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Left Side: Summary or Previous Button */}
          <div>
            {currentStep === 1 ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={goToPreviousStep}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Previous Step
              </button>
            )}
          </div>

          {/* Right Side: Next Step or Final Save Buttons */}
          <div className="flex items-center gap-2.5">
            {currentStep < 5 ? (
              <button
                type="button"
                onClick={goToNextStep}
                className="px-5 py-2.5 text-xs font-black bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-700/20"
              >
                <span>
                  {currentStep === 1
                    ? 'Next: Step 2 Requirements'
                    : currentStep === 2
                    ? 'Next: Step 3 Family Profile'
                    : currentStep === 3
                    ? 'Next: Step 4 Assessment'
                    : 'Next: Step 5 Review'}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSave(true)}
                  className="px-4 py-2.5 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Printer className="h-3.5 w-3.5 text-emerald-400" />
                  Save & Print GIS
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSave(false)}
                  className="px-5 py-2.5 text-xs font-black bg-gradient-to-r from-emerald-700 to-teal-700 text-white hover:from-emerald-600 hover:to-teal-600 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-700/20 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSubmitting ? 'Saving...' : 'Save AICS Record'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox / Document Zoom Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            <div className="p-3 bg-slate-800/80 text-white flex items-center justify-between border-b border-white/10">
              <span className="text-xs font-bold truncate">{previewDoc.name}</span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center flex-1 bg-black/40">
              <img
                src={previewDoc.file_url}
                alt={previewDoc.name}
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

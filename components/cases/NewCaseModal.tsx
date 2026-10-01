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
  Users,
  DollarSign,
  Printer,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Trash2,
  Search,
} from 'lucide-react';
import type {
  CaseRecord,
  CaseClassification,
  CaseStatus,
  Gender,
  GeneralIntakeCategory,
  GeneralIntakeSector,
  CaseFamilyMember,
  Resident,
  Household,
} from '@/lib/db/schema';
import { createCase } from '@/lib/db/cases';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import { getCurrentUser } from '@/lib/auth';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';

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

  // Wizard tab state
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  // Case Basics
  const [caseNumber, setCaseNumber] = useState('');
  const [caseType, setCaseType] = useState<CaseClassification>('vawc_physical');
  const [status, setStatus] = useState<CaseStatus>('active');
  const [dateOfInterview, setDateOfInterview] = useState(new Date().toISOString().slice(0, 10));
  const [incidentDate, setIncidentDate] = useState('');

  // Top GIS Flags
  const [clientCategory, setClientCategory] = useState<GeneralIntakeCategory>('walk_in');
  const [sectors, setSectors] = useState<GeneralIntakeSector[]>([]);
  const [caseCategoryType, setCaseCategoryType] = useState('vawc');
  const [caseCategoryOther, setCaseCategoryOther] = useState('');

  // I. Client Identifying Information & Resident Search
  const [residentId, setResidentId] = useState<string | undefined>(undefined);
  const [householdId, setHouseholdId] = useState<string | undefined>(undefined);
  const [linkedResident, setLinkedResident] = useState<Resident | null>(null);
  const [residentSearchResults, setResidentSearchResults] = useState<Resident[]>([]);
  const [isSearchingResident, setIsSearchingResident] = useState(false);
  const [showResidentDropdown, setShowResidentDropdown] = useState(false);

  const [victimName, setVictimName] = useState('');
  const [victimAge, setVictimAge] = useState<string>('');
  const [victimGender, setVictimGender] = useState<Gender>('F');
  const [birthdate, setBirthdate] = useState('');
  const [birthplace, setBirthplace] = useState('Mabini, Davao de Oro');
  const [barangayId, setBarangayId] = useState(currentUser?.barangay_id || 'cadunan');
  const [victimAddress, setVictimAddress] = useState('');
  const [lengthOfStay, setLengthOfStay] = useState('');
  const [civilStatus, setCivilStatus] = useState('Single');
  const [educationalAttainment, setEducationalAttainment] = useState('High School Graduate');
  const [religion, setReligion] = useState('Roman Catholic');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('');
  const [houseOccupancy, setHouseOccupancy] = useState<'owner' | 'renter'>('owner');
  const [estimatedPropertyDamage, setEstimatedPropertyDamage] = useState<string>('');
  const [victimContact, setVictimContact] = useState('');

  // Family Members Grid (up to 10 rows)
  const [familyMembers, setFamilyMembers] = useState<CaseFamilyMember[]>([
    { name: '', age: '', civil_status: '', relationship: '', educational_attainment: '', occupation: '', income: '', birthday: '' },
  ]);

  // Financial Profile & Expenses
  const [sourcesOfIncome, setSourcesOfIncome] = useState('');
  const [totalFamilyIncome, setTotalFamilyIncome] = useState<string>('');
  const [foodExpense, setFoodExpense] = useState<string>('');
  const [waterExpense, setWaterExpense] = useState<string>('');
  const [electricityExpense, setElectricityExpense] = useState<string>('');
  const [educationExpense, setEducationExpense] = useState<string>('');
  const [transportationExpense, setTransportationExpense] = useState<string>('');

  // Agricultural Land & Outside Assistance
  const [hasLand, setHasLand] = useState(false);
  const [landHectares, setLandHectares] = useState('');
  const [cropsPlanted, setCropsPlanted] = useState('');
  const [landLocation, setLandLocation] = useState('');
  const [otherSourcesOfIncome, setOtherSourcesOfIncome] = useState('');
  const [hasSoughtAssistance, setHasSoughtAssistance] = useState(false);
  const [assistanceDetails, setAssistanceDetails] = useState('');

  // Four Clinical Narrative Sections (II - V)
  const [problemPresented, setProblemPresented] = useState('');
  const [familyBackground, setFamilyBackground] = useState('');
  const [assessment, setAssessment] = useState('');
  const [recommendationAction, setRecommendationAction] = useState('');

  // Perpetrator (for VAWC / Abuse cases)
  const [hasPerpetrator, setHasPerpetrator] = useState(false);
  const [perpetratorName, setPerpetratorName] = useState('');
  const [perpetratorRelationship, setPerpetratorRelationship] = useState('');
  const [perpetratorAddress, setPerpetratorAddress] = useState('');

  // Signatures & Priority
  const [priorityAssistance, setPriorityAssistance] = useState('Psychosocial & Legal Protection');
  const [priorityRank, setPriorityRank] = useState('1');
  const [clientSignatureName, setClientSignatureName] = useState('');
  const [assignedWorker, setAssignedWorker] = useState(currentUser?.name || 'MSWDO Social Worker');
  const [notedByName, setNotedByName] = useState('VIRGENCITA M. CHU, RSW, MPA');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Auto-calculated expenses total
  const computedTotalExpenses =
    (parseFloat(foodExpense) || 0) +
    (parseFloat(waterExpense) || 0) +
    (parseFloat(electricityExpense) || 0) +
    (parseFloat(educationExpense) || 0) +
    (parseFloat(transportationExpense) || 0);

  function handleAutoGenerateNumber() {
    const year = new Date().getFullYear();
    const prefix = caseCategoryType.toUpperCase().slice(0, 4) || 'CASE';
    const rand = Math.floor(1000 + Math.random() * 9000);
    setCaseNumber(`${prefix}-${year}-${rand}`);
  }

  function toggleSector(s: GeneralIntakeSector) {
    if (sectors.includes(s)) {
      setSectors(sectors.filter((item) => item !== s));
    } else {
      setSectors([...sectors, s]);
    }
  }

  function handleAddFamilyMember() {
    if (familyMembers.length >= 10) return;
    setFamilyMembers([
      ...familyMembers,
      { name: '', age: '', civil_status: '', relationship: '', educational_attainment: '', occupation: '', income: '', birthday: '' },
    ]);
  }

  function handleRemoveFamilyMember(index: number) {
    if (familyMembers.length <= 1) {
      setFamilyMembers([{ name: '', age: '', civil_status: '', relationship: '', educational_attainment: '', occupation: '', income: '', birthday: '' }]);
      return;
    }
    setFamilyMembers(familyMembers.filter((_, i) => i !== index));
  }

  function updateFamilyMember(index: number, field: keyof CaseFamilyMember, value: string) {
    const updated = [...familyMembers];
    updated[index] = { ...updated[index], [field]: value };
    setFamilyMembers(updated);
  }

  // Resident Lookup & Auto-fill logic
  async function handleSearchResident(query: string) {
    setVictimName(query);
    if (!query.trim()) {
      setResidentSearchResults([]);
      setShowResidentDropdown(false);
      return;
    }

    setIsSearchingResident(true);
    setShowResidentDropdown(true);

    try {
      const allResidents = await db.getAll<Resident>(STORE_NAMES.residents);
      const clean = query.toLowerCase().trim();
      const tokens = clean.split(/\s+/).filter(Boolean);

      const matches = allResidents.filter((r) => {
        const full = `${r.first_name || ''} ${r.middle_name || ''} ${r.last_name || ''} ${r.full_name || ''}`.toLowerCase();
        return tokens.every((token) => full.includes(token));
      });

      // Prioritize verified residents first, then alphabetical
      matches.sort((a, b) => {
        if (a.verification_status === 'verified' && b.verification_status !== 'verified') return -1;
        if (a.verification_status !== 'verified' && b.verification_status === 'verified') return 1;
        return a.full_name.localeCompare(b.full_name);
      });

      setResidentSearchResults(matches.slice(0, 8));
    } catch (err) {
      console.error('Failed to search residents:', err);
    } finally {
      setIsSearchingResident(false);
    }
  }

  async function handleSelectResident(resident: Resident) {
    setLinkedResident(resident);
    setResidentId(resident.id);
    setHouseholdId(resident.household_id);
    setShowResidentDropdown(false);

    // Formatted name
    const formatted =
      `${resident.first_name || ''} ${resident.middle_name ? resident.middle_name + ' ' : ''}${resident.last_name || ''}`.trim() ||
      resident.full_name;

    setVictimName(formatted);
    setClientSignatureName(formatted);

    // Age & Birthdate
    if (resident.birthdate) {
      setBirthdate(resident.birthdate);
      const bdate = new Date(resident.birthdate);
      if (!isNaN(bdate.getTime())) {
        const today = new Date();
        let calculatedAge = today.getFullYear() - bdate.getFullYear();
        const m = today.getMonth() - bdate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bdate.getDate())) {
          calculatedAge--;
        }
        if (calculatedAge >= 0) {
          setVictimAge(String(calculatedAge));
        }
      }
    }

    // Gender
    if (resident.gender === 'M' || resident.gender === 'F') {
      setVictimGender(resident.gender);
    }

    // Civil Status
    if (resident.civil_status) {
      const civ = resident.civil_status.toLowerCase();
      if (civ.includes('married')) setCivilStatus('Married');
      else if (civ.includes('single')) setCivilStatus('Single');
      else if (civ.includes('widow')) setCivilStatus('Widowed');
      else if (civ.includes('separat')) setCivilStatus('Separated');
      else if (civ.includes('cohabit') || civ.includes('live-in')) setCivilStatus('Cohabiting / Live-in');
    }

    // Occupation & Contact
    if (resident.occupation) {
      setOccupation(resident.occupation);
    }
    if (resident.contact_number) {
      setVictimContact(resident.contact_number);
    }

    // Look up Household & Family members from Census
    try {
      if (resident.household_id) {
        const hh = await db.get<Household>(STORE_NAMES.households, resident.household_id);
        if (hh) {
          if (hh.barangay_id) {
            setBarangayId(hh.barangay_id);
          }
          const addrParts = [hh.purok_sitio, hh.street_address].filter(Boolean);
          if (addrParts.length > 0) {
            setVictimAddress(addrParts.join(', '));
          }
        }

        // Auto-fetch household members for Family Composition table (Step 2)
        const allRes = await db.getAll<Resident>(STORE_NAMES.residents);
        const householdMembers = allRes.filter((r) => r.household_id === resident.household_id);

        if (householdMembers.length > 0) {
          const mappedMembers: CaseFamilyMember[] = householdMembers.map((m) => {
            let mAge = '';
            if (m.birthdate) {
              const bd = new Date(m.birthdate);
              if (!isNaN(bd.getTime())) {
                const now = new Date();
                let a = now.getFullYear() - bd.getFullYear();
                const mon = now.getMonth() - bd.getMonth();
                if (mon < 0 || (mon === 0 && now.getDate() < bd.getDate())) a--;
                if (a >= 0) mAge = String(a);
              }
            }
            return {
              name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.full_name,
              age: mAge,
              civil_status: m.civil_status || '',
              relationship: m.id === resident.id ? 'Self / Client' : (m.relationship_to_head || 'Family Member'),
              educational_attainment: '',
              occupation: m.occupation || '',
              income: '',
              birthday: m.birthdate || '',
            };
          });
          // Ensure client is first in the list
          mappedMembers.sort((a, b) => (a.relationship === 'Self / Client' ? -1 : 1));
          setFamilyMembers(mappedMembers.slice(0, 10));
        }
      }
    } catch (err) {
      console.error('Error fetching household details for resident:', err);
    }
  }

  function handleClearResident() {
    setLinkedResident(null);
    setResidentId(undefined);
    setHouseholdId(undefined);
    setVictimName('');
    setResidentSearchResults([]);
    setShowResidentDropdown(false);
  }

  // Build current CaseRecord snapshot for print or save
  function buildCaseRecordSnapshot(): CaseRecord {
    let finalCaseNo = caseNumber.trim();
    if (!finalCaseNo) {
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      finalCaseNo = `GIS-${year}-${rand}`;
    }

    const filteredFamily = familyMembers.filter((m) => m.name.trim().length > 0);

    return {
      id: `temp_${Date.now()}`,
      case_number: finalCaseNo,
      case_type: caseType,
      status,
      reported_at: dateOfInterview,
      incident_date: incidentDate || undefined,
      victim_name: victimName.trim() || 'Client (Pending Name)',
      victim_age: victimAge ? parseInt(victimAge, 10) : undefined,
      victim_gender: victimGender,
      victim_contact: victimContact.trim() || undefined,
      barangay_id: barangayId,
      purok_sitio: victimAddress.trim() || undefined,
      victim_address: victimAddress.trim() || undefined,
      perpetrator_name: hasPerpetrator ? perpetratorName.trim() : undefined,
      perpetrator_relationship: hasPerpetrator ? perpetratorRelationship.trim() : undefined,
      perpetrator_address: hasPerpetrator ? perpetratorAddress.trim() : undefined,
      case_summary: problemPresented.trim() || `General Intake Sheet recorded for ${victimName.trim()}`,
      intake_notes: recommendationAction.trim() || undefined,
      assigned_worker_name: assignedWorker.trim() || currentUser?.name || 'MSWDO Social Worker',
      assigned_worker_id: currentUser?.id,
      resident_id: residentId || undefined,
      household_id: householdId || undefined,
      source: 'manual_intake',
      createdAt: new Date(),
      updatedAt: new Date(),
      intake_sheet: {
        date_of_interview: dateOfInterview,
        client_category: clientCategory,
        sectors,
        case_category_type: caseCategoryType,
        case_category_other: caseCategoryOther.trim() || undefined,
        birthdate: birthdate.trim() || undefined,
        birthplace: birthplace.trim() || undefined,
        length_of_stay: lengthOfStay.trim() || undefined,
        civil_status: civilStatus,
        educational_attainment: educationalAttainment,
        religion: religion.trim() || undefined,
        occupation: occupation.trim() || undefined,
        monthly_income: monthlyIncome ? parseFloat(monthlyIncome) : undefined,
        house_occupancy: houseOccupancy,
        estimated_property_damage: estimatedPropertyDamage ? parseFloat(estimatedPropertyDamage) : undefined,
        family_members: filteredFamily,
        sources_of_income: sourcesOfIncome.trim() || undefined,
        total_family_income: totalFamilyIncome ? parseFloat(totalFamilyIncome) : undefined,
        monthly_expenses: {
          food: foodExpense ? parseFloat(foodExpense) : undefined,
          water: waterExpense ? parseFloat(waterExpense) : undefined,
          electricity: electricityExpense ? parseFloat(electricityExpense) : undefined,
          education: educationExpense ? parseFloat(educationExpense) : undefined,
          transportation: transportationExpense ? parseFloat(transportationExpense) : undefined,
          total: computedTotalExpenses > 0 ? computedTotalExpenses : undefined,
        },
        agricultural_profile: {
          has_land: hasLand,
          hectares: landHectares.trim() || undefined,
          crops_planted: cropsPlanted.trim() || undefined,
          area_location: landLocation.trim() || undefined,
        },
        other_sources_of_income: otherSourcesOfIncome.trim() || undefined,
        has_sought_outside_assistance: hasSoughtAssistance,
        outside_assistance_details: assistanceDetails.trim() || undefined,
        problem_presented: problemPresented.trim() || undefined,
        family_background: familyBackground.trim() || undefined,
        assessment: assessment.trim() || undefined,
        recommendation_action: recommendationAction.trim() || undefined,
        priority_assistance_for: priorityAssistance.trim() || undefined,
        priority_rank: priorityRank.trim() || undefined,
        date_interviewed: dateOfInterview,
        client_signature_name: clientSignatureName.trim() || victimName.trim() || undefined,
        mswdo_worker_name: assignedWorker.trim() || undefined,
        noted_by_name: notedByName.trim() || undefined,
      },
    };
  }

  function handlePrintPreview() {
    const snapshot = buildCaseRecordSnapshot();
    printGeneralIntakeSheet(snapshot);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!victimName.trim()) {
      setError('Please provide the Applicant / Client full name.');
      setActiveStep(1);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const snapshot = buildCaseRecordSnapshot();
      const created = await createCase(snapshot);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[94vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white font-bold shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                General Intake Sheet (GIS) & Social Case Recording
              </h2>
              <p className="text-[11px] text-slate-400">
                Official DSWD & MSWDO Mabini Standard Intake Form
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintPreview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-white hover:bg-slate-700 transition"
              title="Print General Intake Sheet"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print GIS Form</span>
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stepper Tabs Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              activeStep === 1
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
              1
            </span>
            <span>I. Client Info & Sectors</span>
          </button>

          <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />

          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              activeStep === 2
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
              2
            </span>
            <span>Family & Finances</span>
          </button>

          <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />

          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              activeStep === 3
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
              3
            </span>
            <span>Clinical Narrative (II - V)</span>
          </button>

          <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />

          <button
            type="button"
            onClick={() => setActiveStep(4)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              activeStep === 4
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
              4
            </span>
            <span>Priority & Signatures</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* ================= STEP 1 ================= */}
          {activeStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Top Classification Group */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Category (Admission Type) */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-800 uppercase">
                      Category (Admission)
                    </label>
                    <select
                      value={clientCategory}
                      onChange={(e) => setClientCategory(e.target.value as GeneralIntakeCategory)}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="walk_in">Walk-in</option>
                      <option value="referred">Referred</option>
                      <option value="rescued">Rescued</option>
                    </select>
                  </div>

                  {/* Case Category */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-800 uppercase">
                      Case Category
                    </label>
                    <select
                      value={caseCategoryType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCaseCategoryType(val);
                        if (val !== 'other') {
                          setCaseCategoryOther('');
                        }
                        if (val === 'vawc') setCaseType('vawc_physical');
                        else if (val === 'rape') setCaseType('rape');
                        else if (val === 'child_custody' || val === 'child_support') setCaseType('vac_abuse');
                        else setCaseType('other');
                      }}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold outline-none focus:ring-2 focus:ring-amber-500"
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

                    {/* Pop-up input right under Case Category ONLY when Others is selected */}
                    {caseCategoryType === 'other' && (
                      <div className="pt-1.5 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        <label className="text-[11px] font-bold text-amber-900 block">
                          Specify Other Category:
                        </label>
                        <input
                          type="text"
                          autoFocus
                          value={caseCategoryOther}
                          onChange={(e) => setCaseCategoryOther(e.target.value)}
                          placeholder="Please specify case category..."
                          className="w-full p-2 text-xs rounded-xl border-2 border-amber-500 bg-amber-50/50 text-slate-900 font-medium focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Case Number & Auto */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 uppercase">Case Number</label>
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
                      className="w-full p-2 text-xs font-mono font-bold rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none uppercase bg-white"
                    />
                  </div>
                </div>

                {/* Sector Checkboxes */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <label className="text-xs font-bold text-slate-800 uppercase block">
                    Sector Checklist (Multi-Select)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: '4ps', label: '4Ps Beneficiary' },
                      { id: 'children', label: 'Children' },
                      { id: 'youth', label: 'Youth' },
                      { id: 'women', label: 'Women' },
                      { id: 'senior_citizen', label: 'Senior Citizen' },
                      { id: 'pwd', label: 'PWD' },
                      { id: 'solo_parent', label: 'Solo Parent' },
                    ].map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => toggleSector(sec.id as GeneralIntakeSector)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                          sectors.includes(sec.id as GeneralIntakeSector)
                            ? 'bg-amber-700 text-white border-amber-800'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {sectors.includes(sec.id as GeneralIntakeSector) ? '✓ ' : '+ '}
                        {sec.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section I: Identifying Information */}
              <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/20 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-950 uppercase border-b border-emerald-200 pb-2">
                  <User className="h-4 w-4 text-emerald-700" />
                  I. Identifying Information (Applicant / Client)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="sm:col-span-2 space-y-1 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <span>Name of Applicant / Client *</span>
                        {linkedResident ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Mabini Verified Resident
                          </span>
                        ) : (
                          <span className="text-[10px] font-normal text-slate-500">
                            (Auto-search Mabini residents registry)
                          </span>
                        )}
                      </label>
                      {linkedResident && (
                        <button
                          type="button"
                          onClick={handleClearResident}
                          className="text-[10px] text-amber-700 hover:text-amber-800 font-bold underline"
                        >
                          Change / Search another
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={victimName}
                        onChange={(e) => handleSearchResident(e.target.value)}
                        onFocus={() => {
                          if (residentSearchResults.length > 0) setShowResidentDropdown(true);
                        }}
                        placeholder="Type resident name to search (e.g. Santos, Maria)..."
                        required
                        className={`w-full pl-8 pr-8 py-2 text-xs rounded-xl border font-semibold outline-none transition ${
                          linkedResident
                            ? 'border-emerald-500 bg-emerald-50/30 text-emerald-950 focus:ring-2 focus:ring-emerald-500'
                            : 'border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-amber-500'
                        }`}
                      />
                      {isSearchingResident ? (
                        <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-amber-600" />
                      ) : linkedResident ? (
                        <CheckCircle2 className="absolute right-3 top-2.5 h-3.5 w-3.5 text-emerald-600" />
                      ) : null}
                    </div>

                    {/* Autocomplete Results Dropdown */}
                    {showResidentDropdown && residentSearchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto">
                        <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                          <span>Mabini Resident Registry Matches ({residentSearchResults.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowResidentDropdown(false)}
                            className="text-slate-400 hover:text-slate-700 p-0.5"
                          >
                            ✕
                          </button>
                        </div>
                        {residentSearchResults.map((r) => {
                          const cleanName =
                            `${r.first_name || ''} ${r.middle_name || ''} ${r.last_name || ''}`.trim() ||
                            r.full_name;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => handleSelectResident(r)}
                              className="w-full text-left p-3 hover:bg-emerald-50/60 transition flex items-center justify-between group"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-900 truncate">
                                    {cleanName}
                                  </p>
                                  {r.verification_status === 'verified' && (
                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                      ✓ Verified
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  Birthdate: {r.birthdate || 'N/A'} • {r.gender === 'F' ? 'Female' : 'Male'} •{' '}
                                  <span className="capitalize">{r.civil_status || 'Civil status N/A'}</span>
                                  {r.occupation ? ` • ${r.occupation}` : ''}
                                </p>
                              </div>
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg flex-shrink-0 opacity-80 group-hover:opacity-100 transition">
                                Select & Auto-fill
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {linkedResident && (
                      <p className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 mt-1">
                        <span>Linked to Census ID: <strong className="font-mono">{linkedResident.id}</strong></span>
                        <span>• Demographic and family composition auto-filled.</span>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Age</label>
                      <input
                        type="number"
                        value={victimAge}
                        onChange={(e) => setVictimAge(e.target.value)}
                        placeholder="e.g. 28"
                        className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Sex</label>
                      <select
                        value={victimGender}
                        onChange={(e) => setVictimGender(e.target.value as Gender)}
                        className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                      >
                        <option value="F">Female</option>
                        <option value="M">Male</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Birthdate</label>
                    <input
                      type="date"
                      value={birthdate}
                      onChange={(e) => setBirthdate(e.target.value)}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Birthplace</label>
                    <input
                      type="text"
                      value={birthplace}
                      onChange={(e) => setBirthplace(e.target.value)}
                      placeholder="e.g. Mabini, Davao de Oro"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Civil Status</label>
                    <select
                      value={civilStatus}
                      onChange={(e) => setCivilStatus(e.target.value)}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Separated">Separated</option>
                      <option value="Cohabiting">Cohabiting / Live-in</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Barangay</label>
                    <select
                      value={barangayId}
                      onChange={(e) => setBarangayId(e.target.value)}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      {BARANGAY_REGISTRY.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-700">Present Address / Purok</label>
                    <input
                      type="text"
                      value={victimAddress}
                      onChange={(e) => setVictimAddress(e.target.value)}
                      placeholder="e.g. Purok 3B, Cadunan"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Length of Stay at Address</label>
                    <input
                      type="text"
                      value={lengthOfStay}
                      onChange={(e) => setLengthOfStay(e.target.value)}
                      placeholder="e.g. 5 years"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Highest Education</label>
                    <select
                      value={educationalAttainment}
                      onChange={(e) => setEducationalAttainment(e.target.value)}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="None">None</option>
                      <option value="Elementary Undergraduate">Elementary Undergraduate</option>
                      <option value="Elementary Graduate">Elementary Graduate</option>
                      <option value="High School Undergraduate">High School Undergraduate</option>
                      <option value="High School Graduate">High School Graduate</option>
                      <option value="College Undergraduate">College Undergraduate</option>
                      <option value="College Graduate">College Graduate</option>
                      <option value="Vocational / Tech">Vocational / Tech</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Religion</label>
                    <input
                      type="text"
                      value={religion}
                      onChange={(e) => setReligion(e.target.value)}
                      placeholder="e.g. Roman Catholic"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Present Occupation</label>
                    <input
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      placeholder="e.g. Farmer / Store Keeper"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Monthly Income (₱)</label>
                    <input
                      type="number"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">House Occupancy</label>
                    <select
                      value={houseOccupancy}
                      onChange={(e) => setHouseOccupancy(e.target.value as 'owner' | 'renter')}
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="owner">Owner</option>
                      <option value="renter">Renter</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Phone / Contact Number</label>
                    <input
                      type="text"
                      value={victimContact}
                      onChange={(e) => setVictimContact(e.target.value)}
                      placeholder="09171234567"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700">
                      Estimated Property Damage (if distressed / calamity)
                    </label>
                    <input
                      type="number"
                      value={estimatedPropertyDamage}
                      onChange={(e) => setEstimatedPropertyDamage(e.target.value)}
                      placeholder="Php amount"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white shadow-xs transition"
                >
                  <span>Next: Family Composition & Finances</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 2 ================= */}
          {activeStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Family Members Table */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase">
                    <Users className="h-4 w-4 text-amber-700" />
                    Family Members Composition (Up to 10)
                  </div>
                  <button
                    type="button"
                    onClick={handleAddFamilyMember}
                    disabled={familyMembers.length >= 10}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-500 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" /> Add Member
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase bg-slate-100/60">
                        <th className="p-1.5 w-6">#</th>
                        <th className="p-1.5 min-w-[130px]">Name</th>
                        <th className="p-1.5 w-16">Age</th>
                        <th className="p-1.5 min-w-[90px]">Civil Status</th>
                        <th className="p-1.5 min-w-[100px]">Relationship</th>
                        <th className="p-1.5 min-w-[100px]">Education</th>
                        <th className="p-1.5 min-w-[90px]">Occupation</th>
                        <th className="p-1.5 min-w-[80px]">Income</th>
                        <th className="p-1.5 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {familyMembers.map((member, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="p-1.5 font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={member.name}
                              onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)}
                              placeholder="Full Name"
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={member.age}
                              onChange={(e) => updateFamilyMember(idx, 'age', e.target.value)}
                              placeholder="Age"
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={member.civil_status}
                              onChange={(e) => updateFamilyMember(idx, 'civil_status', e.target.value)}
                              placeholder="Single/etc"
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={member.relationship}
                              onChange={(e) => updateFamilyMember(idx, 'relationship', e.target.value)}
                              placeholder="Son/Spouse"
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={member.educational_attainment}
                              onChange={(e) => updateFamilyMember(idx, 'educational_attainment', e.target.value)}
                              placeholder="Education"
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={member.occupation}
                              onChange={(e) => updateFamilyMember(idx, 'occupation', e.target.value)}
                              placeholder="Job"
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={member.income}
                              onChange={(e) => updateFamilyMember(idx, 'income', e.target.value)}
                              placeholder="₱ Income"
                              className="w-full p-1 border rounded text-xs"
                            />
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveFamilyMember(idx)}
                              className="text-slate-400 hover:text-rose-600"
                              title="Remove row"
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

              {/* Financial Profile & Monthly Expenses */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase border-b border-slate-200 pb-2">
                  <DollarSign className="h-4 w-4 text-emerald-700" />
                  Financial & Monthly Expenses Assessment
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Sources of Income</label>
                    <input
                      type="text"
                      value={sourcesOfIncome}
                      onChange={(e) => setSourcesOfIncome(e.target.value)}
                      placeholder="e.g. Daily wage labor, small sari-sari store"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Total Family Income (₱/month)</label>
                    <input
                      type="number"
                      value={totalFamilyIncome}
                      onChange={(e) => setTotalFamilyIncome(e.target.value)}
                      placeholder="e.g. 8000"
                      className="w-full p-2 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 uppercase">
                      Total Family Monthly Expenses Breakdown
                    </label>
                    <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      Total: ₱{computedTotalExpenses.toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600">Food (₱)</label>
                      <input
                        type="number"
                        value={foodExpense}
                        onChange={(e) => setFoodExpense(e.target.value)}
                        placeholder="0"
                        className="w-full p-1.5 text-xs rounded-lg border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600">Water (₱)</label>
                      <input
                        type="number"
                        value={waterExpense}
                        onChange={(e) => setWaterExpense(e.target.value)}
                        placeholder="0"
                        className="w-full p-1.5 text-xs rounded-lg border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600">Electricity (₱)</label>
                      <input
                        type="number"
                        value={electricityExpense}
                        onChange={(e) => setElectricityExpense(e.target.value)}
                        placeholder="0"
                        className="w-full p-1.5 text-xs rounded-lg border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600">Education (₱)</label>
                      <input
                        type="number"
                        value={educationExpense}
                        onChange={(e) => setEducationExpense(e.target.value)}
                        placeholder="0"
                        className="w-full p-1.5 text-xs rounded-lg border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600">Transpo (₱)</label>
                      <input
                        type="number"
                        value={transportationExpense}
                        onChange={(e) => setTransportationExpense(e.target.value)}
                        placeholder="0"
                        className="w-full p-1.5 text-xs rounded-lg border bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Agricultural Land & Outside Assistance */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <label className="text-xs font-bold text-slate-800 uppercase">
                    A. Agricultural Land & Livelihood Assets
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasLand}
                      onChange={(e) => setHasLand(e.target.checked)}
                      className="rounded"
                    />
                    <span>Family owns / works agricultural land</span>
                  </label>
                </div>

                {hasLand && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">No. of Hectares</label>
                      <input
                        type="text"
                        value={landHectares}
                        onChange={(e) => setLandHectares(e.target.value)}
                        placeholder="e.g. 1.5 has"
                        className="w-full p-2 text-xs rounded-xl border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Crops Planted</label>
                      <input
                        type="text"
                        value={cropsPlanted}
                        onChange={(e) => setCropsPlanted(e.target.value)}
                        placeholder="e.g. Coconut, Rice, Corn"
                        className="w-full p-2 text-xs rounded-xl border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Area of Location</label>
                      <input
                        type="text"
                        value={landLocation}
                        onChange={(e) => setLandLocation(e.target.value)}
                        placeholder="e.g. Sitio Masagpat, Cadunan"
                        className="w-full p-2 text-xs rounded-xl border bg-white"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">B. Other Sources of Income</label>
                    <input
                      type="text"
                      value={otherSourcesOfIncome}
                      onChange={(e) => setOtherSourcesOfIncome(e.target.value)}
                      placeholder="e.g. Remittance from sibling, backyard poultry"
                      className="w-full p-2 text-xs rounded-xl border bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">C. Outside Assistance Sought?</label>
                      <div className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="sought_assistance"
                            checked={hasSoughtAssistance}
                            onChange={() => setHasSoughtAssistance(true)}
                          />
                          <span>Yes</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="sought_assistance"
                            checked={!hasSoughtAssistance}
                            onChange={() => setHasSoughtAssistance(false)}
                          />
                          <span>No</span>
                        </label>
                      </div>
                    </div>
                    {hasSoughtAssistance && (
                      <input
                        type="text"
                        value={assistanceDetails}
                        onChange={(e) => setAssistanceDetails(e.target.value)}
                        placeholder="Type of assistance & source (e.g. Barangay medical aid)"
                        className="w-full p-2 text-xs rounded-xl border bg-white"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back to Step 1</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white shadow-xs transition"
                >
                  <span>Next: Clinical Narrative (II - V)</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 3 ================= */}
          {activeStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="text-xs text-slate-500">
                Record the 4 official clinical social work assessment sections as stipulated in the MSWDO General Intake Sheet.
              </div>

              {/* II. Problem Presented */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[10px]">
                    II
                  </span>
                  <span>Problem Presented *</span>
                </label>
                <textarea
                  value={problemPresented}
                  onChange={(e) => setProblemPresented(e.target.value)}
                  rows={3}
                  placeholder="State the presenting problem, immediate crisis, complaint, or reason for seeking MSWDO assistance..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed"
                />
              </div>

              {/* III. Family Background Information */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[10px]">
                    III
                  </span>
                  <span>Family Background Information</span>
                </label>
                <textarea
                  value={familyBackground}
                  onChange={(e) => setFamilyBackground(e.target.value)}
                  rows={3}
                  placeholder="Describe family origin, relationship dynamics, living conditions, and historical socio-economic background..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed"
                />
              </div>

              {/* IV. Assessment */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[10px]">
                    IV
                  </span>
                  <span>Social Worker's Assessment</span>
                </label>
                <textarea
                  value={assessment}
                  onChange={(e) => setAssessment(e.target.value)}
                  rows={3}
                  placeholder="Social worker's clinical assessment, psychosocial findings, risk evaluation, and root cause analysis..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed"
                />
              </div>

              {/* V. Recommendation / Action Taken */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white text-[10px]">
                    V
                  </span>
                  <span>Recommendation / Action Taken</span>
                </label>
                <textarea
                  value={recommendationAction}
                  onChange={(e) => setRecommendationAction(e.target.value)}
                  rows={3}
                  placeholder="Action taken (e.g. counseling, BPO/TPO endorsement, PNP WCPD referral, medical examination, psychological evaluation, legal aid)..."
                  className="w-full p-3 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed"
                />
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back to Step 2</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white shadow-xs transition"
                >
                  <span>Next: Priority & Signatures</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 4 ================= */}
          {activeStep === 4 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Perpetrator Section (Optional for VAWC/Abuse) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <label className="text-xs font-bold text-slate-800 uppercase">
                    Alleged Perpetrator / Respondent (If applicable)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasPerpetrator}
                      onChange={(e) => setHasPerpetrator(e.target.checked)}
                      className="rounded"
                    />
                    <span>Case involves an alleged perpetrator / respondent</span>
                  </label>
                </div>

                {hasPerpetrator && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Respondent Name</label>
                      <input
                        type="text"
                        value={perpetratorName}
                        onChange={(e) => setPerpetratorName(e.target.value)}
                        placeholder="e.g. Juan Santos"
                        className="w-full p-2 text-xs rounded-xl border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Relationship to Client</label>
                      <input
                        type="text"
                        value={perpetratorRelationship}
                        onChange={(e) => setPerpetratorRelationship(e.target.value)}
                        placeholder="e.g. Husband, Live-in Partner"
                        className="w-full p-2 text-xs rounded-xl border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Known Address</label>
                      <input
                        type="text"
                        value={perpetratorAddress}
                        onChange={(e) => setPerpetratorAddress(e.target.value)}
                        placeholder="e.g. Brgy. Cadunan"
                        className="w-full p-2 text-xs rounded-xl border bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Priority Assistance & Ranking */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
                <div className="text-xs font-bold text-slate-900 uppercase border-b border-slate-200 pb-2">
                  Case Prioritization & Ranking
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Priority Assistance for</label>
                    <input
                      type="text"
                      value={priorityAssistance}
                      onChange={(e) => setPriorityAssistance(e.target.value)}
                      placeholder="e.g. Medical, Burial, Transportation, Shelter, Legal"
                      className="w-full p-2 text-xs rounded-xl border bg-white font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Rank / Priority Level</label>
                    <input
                      type="text"
                      value={priorityRank}
                      onChange={(e) => setPriorityRank(e.target.value)}
                      placeholder="e.g. 1 (Urgent) / Rank A"
                      className="w-full p-2 text-xs rounded-xl border bg-white font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Signatures & Approvals */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
                <div className="text-xs font-bold text-slate-900 uppercase border-b border-slate-200 pb-2">
                  Official Signatures & Casework Verification
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Name of Client (Signature)</label>
                    <input
                      type="text"
                      value={clientSignatureName || victimName}
                      onChange={(e) => setClientSignatureName(e.target.value)}
                      placeholder="Client Name"
                      className="w-full p-2 text-xs rounded-xl border bg-white font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Assessed by (MSWDO Worker)</label>
                    <input
                      type="text"
                      value={assignedWorker}
                      onChange={(e) => setAssignedWorker(e.target.value)}
                      placeholder="Licensed Social Worker Name"
                      className="w-full p-2 text-xs rounded-xl border bg-white font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Noted by (MSWDO Head)</label>
                    <input
                      type="text"
                      value={notedByName}
                      onChange={(e) => setNotedByName(e.target.value)}
                      className="w-full p-2 text-xs rounded-xl border bg-white font-semibold text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition w-full sm:w-auto justify-center"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back to Step 3</span>
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handlePrintPreview}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-xs transition"
                  >
                    <Printer className="h-4 w-4 text-slate-600" />
                    <span>Print 2-Page GIS</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-xs font-black text-white shadow transition disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving GIS Record...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Save & Complete Intake</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

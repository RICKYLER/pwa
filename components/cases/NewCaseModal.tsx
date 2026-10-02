'use client';

import React, { useState, useEffect } from 'react';
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
  Tag,
  Database,
  Coins,
  MessageSquare,
  Compass,
  ClipboardList,
  Check,
  UserX,
  ListOrdered,
  PenTool,
  ShieldCheck,
  Info,
  HandHeart,
  GripVertical,
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
import { cn } from '@/lib/utils';

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (created: CaseRecord) => void;
}

const SECTOR_OPTIONS: { id: GeneralIntakeSector; label: string }[] = [
  { id: '4ps', label: '4Ps Beneficiary' },
  { id: 'children', label: 'Children' },
  { id: 'youth', label: 'Youth' },
  { id: 'women', label: 'Women' },
  { id: 'senior_citizen', label: 'Senior Citizen' },
  { id: 'pwd', label: 'PWD' },
  { id: 'solo_parent', label: 'Solo Parent' },
];

export default function NewCaseModal({
  isOpen,
  onClose,
  onSuccess,
}: NewCaseModalProps) {
  const currentUser = getCurrentUser();

  // Wizard tab state
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  // Case Basics
  const [caseNumber, setCaseNumber] = useState('VAWC-2024-004');
  const [caseType, setCaseType] = useState<CaseClassification>('vawc_economic');
  const [status, setStatus] = useState<CaseStatus>('active');
  const [dateOfInterview, setDateOfInterview] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Top GIS Flags
  const [clientCategory, setClientCategory] = useState<GeneralIntakeCategory>('walk_in');
  const [sectors, setSectors] = useState<GeneralIntakeSector[]>(['women']);
  const [caseCategoryType, setCaseCategoryType] = useState('vawc_economic');
  const [caseCategoryOther, setCaseCategoryOther] = useState('');

  // I. Client Identifying Information & Resident Search
  const [residentId, setResidentId] = useState<string | undefined>(undefined);
  const [householdId, setHouseholdId] = useState<string | undefined>(undefined);
  const [linkedResident, setLinkedResident] = useState<Resident | null>(null);
  const [residentSearchResults, setResidentSearchResults] = useState<Resident[]>([]);
  const [isSearchingResident, setIsSearchingResident] = useState(false);
  const [showRegistryDrawer, setShowRegistryDrawer] = useState(false);
  const [registryQuery, setRegistryQuery] = useState('');

  const [victimName, setVictimName] = useState('Luzviminda Reyes');
  const [victimAge, setVictimAge] = useState<string>('28');
  const [victimGender, setVictimGender] = useState<Gender>('F');
  const [birthdate, setBirthdate] = useState('1996-06-18');
  const [birthplace, setBirthplace] = useState('Mabini, Davao de Oro');
  const [barangayId, setBarangayId] = useState('tagisan');
  const [victimAddress, setVictimAddress] = useState('Purok 3, Barangay Tagisan');
  const [lengthOfStay, setLengthOfStay] = useState('18 years');
  const [civilStatus, setCivilStatus] = useState('Married');
  const [educationalAttainment, setEducationalAttainment] = useState('High School Graduate');
  const [religion, setReligion] = useState('Roman Catholic');
  const [occupation, setOccupation] = useState('House helper / Informal');
  const [monthlyIncome, setMonthlyIncome] = useState<string>('5000');
  const [houseOccupancy, setHouseOccupancy] = useState<'owner' | 'renter'>('owner');
  const [estimatedPropertyDamage, setEstimatedPropertyDamage] = useState<string>('0');
  const [victimContact, setVictimContact] = useState('0917 123 4567');

  // Step 2: Family Members Composition (up to 10 rows)
  const [familyMembers, setFamilyMembers] = useState<CaseFamilyMember[]>([
    {
      name: 'Luzviminda Reyes',
      age: '28',
      civil_status: 'Married',
      relationship: 'Self / Client',
      educational_attainment: 'High School',
      occupation: 'House helper',
      income: '5000',
      birthday: '1996-06-18',
    },
  ]);

  // Financial Profile & Expenses
  const [sourcesOfIncome, setSourcesOfIncome] = useState('House helper / Informal work');
  const [otherSourcesOfIncome, setOtherSourcesOfIncome] = useState('');
  const [hasLand, setHasLand] = useState(false);
  const [landHectares, setLandHectares] = useState('');
  const [cropsPlanted, setCropsPlanted] = useState('');
  const [landLocation, setLandLocation] = useState('');

  // Expenses breakdown
  const [foodExpense, setFoodExpense] = useState<string>('3500');
  const [waterExpense, setWaterExpense] = useState<string>('250');
  const [electricityExpense, setElectricityExpense] = useState<string>('650');
  const [educationExpense, setEducationExpense] = useState<string>('500');
  const [transportationExpense, setTransportationExpense] = useState<string>('600');
  const [otherExpense, setOtherExpense] = useState<string>('0');

  // Outside Assistance Sought
  const [outsideAssistanceSought, setOutsideAssistanceSought] = useState<'no' | 'yes'>('no');
  const [agencyOrganization, setAgencyOrganization] = useState('Not applicable');
  const [assistanceReceived, setAssistanceReceived] = useState('Not applicable');

  // Step 3: Four Clinical Narrative Sections (II - V)
  const [problemPresented, setProblemPresented] = useState('');
  const [familyBackground, setFamilyBackground] = useState('');
  const [assessment, setAssessment] = useState('');
  const [recommendationAction, setRecommendationAction] = useState('');

  // Step 4: Alleged Perpetrator / Respondent
  const [hasPerpetrator, setHasPerpetrator] = useState(true);
  const [perpetratorName, setPerpetratorName] = useState('Carlos Reyes');
  const [perpetratorRelationship, setPerpetratorRelationship] = useState('Husband');
  const [perpetratorAddress, setPerpetratorAddress] = useState('Purok 3, Barangay Tagisan');

  // Case Prioritization & Ranking
  const [priorityLevel, setPriorityLevel] = useState<'Low' | 'Medium' | 'High' | 'Urgent / Critical'>('High');
  const [rankingScore, setRankingScore] = useState('3');
  const [dateAssessed, setDateAssessed] = useState('2024-12-14');
  const [basisForPrioritization, setBasisForPrioritization] = useState(
    'VAWC economic abuse affecting the subsistence and welfare of two minor children.'
  );

  // Official Signatures & Verification
  const [clientSignatureName, setClientSignatureName] = useState('Luzviminda Reyes');
  const [assignedWorker, setAssignedWorker] = useState(
    currentUser?.name || 'Pedro Penduko, RSW'
  );
  const [notedByName, setNotedByName] = useState('VIRGENCITA M. CHU, RSW, MPA');
  const [mswdoVerification, setMswdoVerification] = useState('For review and signature');
  const [isRecordConfirmed, setIsRecordConfirmed] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-calculated expenses total
  const computedTotalExpenses =
    (parseFloat(foodExpense) || 0) +
    (parseFloat(waterExpense) || 0) +
    (parseFloat(electricityExpense) || 0) +
    (parseFloat(educationExpense) || 0) +
    (parseFloat(transportationExpense) || 0) +
    (parseFloat(otherExpense) || 0);

  // Auto-calculated total family income
  const computedTotalIncome =
    (parseFloat(monthlyIncome) || 0) + (parseFloat(otherSourcesOfIncome) || 0);

  // Toggle Sector
  function toggleSector(sectorId: GeneralIntakeSector) {
    setSectors((prev) =>
      prev.includes(sectorId) ? prev.filter((s) => s !== sectorId) : [...prev, sectorId]
    );
  }

  // Auto-generate Case Number
  function handleAutoGenerateNumber() {
    const year = new Date().getFullYear();
    let prefix = 'CASE';
    if (caseCategoryType.startsWith('vawc')) prefix = 'VAWC';
    else if (caseCategoryType.includes('vac') || caseCategoryType.includes('child')) prefix = 'VAC';
    else if (caseCategoryType.includes('rape')) prefix = 'RAPE';
    else if (caseCategoryType.includes('lascivious')) prefix = 'LAS';

    const randNum = String(Math.floor(1 + Math.random() * 999)).padStart(3, '0');
    setCaseNumber(`${prefix}-${year}-${randNum}`);
  }

  // Search resident registry
  async function handleSearchResident(query: string) {
    setRegistryQuery(query);
    if (!query.trim()) {
      setResidentSearchResults([]);
      return;
    }
    setIsSearchingResident(true);
    try {
      const allResidents = await db.getAll<Resident>(STORE_NAMES.residents);
      const clean = query.toLowerCase().trim();
      const tokens = clean.split(/\s+/).filter(Boolean);

      const matches = allResidents.filter((r) => {
        const full = `${r.first_name || ''} ${r.middle_name || ''} ${r.last_name || ''} ${r.full_name || ''}`.toLowerCase();
        return tokens.every((token) => full.includes(token));
      });

      matches.sort((a, b) => {
        if (a.verification_status === 'verified' && b.verification_status !== 'verified') return -1;
        if (a.verification_status !== 'verified' && b.verification_status === 'verified') return 1;
        return a.full_name.localeCompare(b.full_name);
      });

      setResidentSearchResults(matches.slice(0, 6));
    } catch (err) {
      console.error('Failed to search residents:', err);
    } finally {
      setIsSearchingResident(false);
    }
  }

  // Select resident from search results
  async function handleSelectResident(resident: Resident) {
    setLinkedResident(resident);
    setResidentId(resident.id);
    setHouseholdId(resident.household_id);
    setShowRegistryDrawer(false);

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

    if (resident.occupation) {
      setOccupation(resident.occupation);
    }
    if (resident.contact_number) {
      setVictimContact(resident.contact_number);
    }

    // Lookup Household and auto-populate address and family composition
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
              income: m.id === resident.id ? monthlyIncome : '',
              birthday: m.birthdate || '',
            };
          });
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
  }

  // Family Members Table Management
  function handleAddFamilyMember() {
    if (familyMembers.length >= 10) return;
    setFamilyMembers([
      ...familyMembers,
      {
        name: '',
        age: '',
        civil_status: '',
        relationship: '',
        educational_attainment: '',
        occupation: '',
        income: '',
        birthday: '',
      },
    ]);
  }

  function handleRemoveFamilyMember(index: number) {
    if (familyMembers.length <= 1) return;
    setFamilyMembers(familyMembers.filter((_, idx) => idx !== index));
  }

  function updateFamilyMember(index: number, field: keyof CaseFamilyMember, value: string) {
    const updated = [...familyMembers];
    updated[index] = { ...updated[index], [field]: value };
    setFamilyMembers(updated);
  }

  // Build CaseRecord snapshot
  function buildCaseRecordSnapshot(): CaseRecord {
    let finalCaseNo = caseNumber.trim();
    if (!finalCaseNo) {
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      finalCaseNo = `GIS-${year}-${rand}`;
    }

    const filteredFamily = familyMembers.filter((m) => m.name.trim().length > 0);

    return {
      id: crypto.randomUUID(),
      case_number: finalCaseNo,
      case_type: caseType,
      status: status,
      reported_at: new Date().toISOString(),
      incident_date: dateOfInterview,
      victim_name: victimName.trim() || 'Confidential Client',
      victim_age: victimAge ? parseInt(victimAge, 10) : undefined,
      victim_gender: victimGender,
      victim_contact: victimContact.trim() || undefined,
      victim_address: victimAddress.trim() || undefined,
      barangay_id: barangayId,
      purok_sitio: victimAddress.trim() || undefined,
      perpetrator_name: hasPerpetrator ? perpetratorName.trim() || undefined : undefined,
      perpetrator_relationship: hasPerpetrator ? perpetratorRelationship.trim() || undefined : undefined,
      perpetrator_address: hasPerpetrator ? perpetratorAddress.trim() || undefined : undefined,
      assigned_worker_name: assignedWorker.trim() || undefined,
      case_summary: problemPresented.trim() || 'General intake recorded via MSWDO GIS Portal.',
      intake_notes: recommendationAction.trim() || undefined,
      resident_id: residentId,
      household_id: householdId,
      source: 'manual_intake',
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'pending',
      intake_sheet: {
        date_of_interview: dateOfInterview,
        client_category: clientCategory,
        sectors: sectors,
        case_category_type: caseCategoryType,
        case_category_other: caseCategoryType === 'other' ? caseCategoryOther : undefined,
        birthdate: birthdate || undefined,
        birthplace: birthplace.trim() || undefined,
        length_of_stay: lengthOfStay.trim() || undefined,
        civil_status: civilStatus || undefined,
        educational_attainment: educationalAttainment || undefined,
        religion: religion.trim() || undefined,
        occupation: occupation.trim() || undefined,
        monthly_income: monthlyIncome ? parseFloat(monthlyIncome) : undefined,
        house_occupancy: houseOccupancy,
        estimated_property_damage: estimatedPropertyDamage
          ? parseFloat(estimatedPropertyDamage)
          : undefined,
        family_members: filteredFamily,
        sources_of_income: sourcesOfIncome.trim() || undefined,
        total_family_income: computedTotalIncome,
        monthly_expenses: {
          food: parseFloat(foodExpense) || 0,
          water: parseFloat(waterExpense) || 0,
          electricity: parseFloat(electricityExpense) || 0,
          education: parseFloat(educationExpense) || 0,
          transportation: parseFloat(transportationExpense) || 0,
          house_rent: 0,
          medical: 0,
          other: parseFloat(otherExpense) || 0,
          total: computedTotalExpenses,
        },
        agricultural_profile: {
          has_land: hasLand,
          hectares: hasLand ? landHectares : undefined,
          crops_planted: hasLand ? cropsPlanted : undefined,
          area_location: hasLand ? landLocation : undefined,
        },
        other_sources_of_income: otherSourcesOfIncome.trim() || undefined,
        has_sought_outside_assistance: outsideAssistanceSought === 'yes',
        outside_assistance_details:
          outsideAssistanceSought === 'yes'
            ? `${agencyOrganization} - ${assistanceReceived}`
            : undefined,
        problem_presented: problemPresented.trim() || undefined,
        family_background: familyBackground.trim() || undefined,
        assessment: assessment.trim() || undefined,
        recommendation_action: recommendationAction.trim() || undefined,
        priority_assistance_for: basisForPrioritization.trim() || undefined,
        priority_rank: priorityLevel,
        date_interviewed: dateOfInterview,
        client_signature_name: (clientSignatureName || victimName).trim() || undefined,
        mswdo_worker_name: assignedWorker.trim() || undefined,
        noted_by_name: notedByName.trim() || undefined,
      },
    };
  }

  function handlePrintPreview() {
    const snapshot = buildCaseRecordSnapshot();
    printGeneralIntakeSheet(snapshot);
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[94vh] bg-slate-100 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* ================= MODAL HEADER ================= */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0f172a] text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ea580c] text-white font-bold shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
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
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-700 bg-white text-xs font-semibold text-slate-900 hover:bg-slate-100 transition shadow-xs"
              title="Print General Intake Sheet"
            >
              <Printer className="h-3.5 w-3.5 text-slate-700" />
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

        {/* ================= STEPPER BAR (4 CARDS) ================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-white border-b border-slate-200/80">
          {/* Step 1 */}
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border text-left transition',
              activeStep === 1
                ? 'bg-[#faf5ff] border-[#c084fc] ring-1 ring-[#c084fc] shadow-xs'
                : activeStep > 1
                ? 'bg-white border-slate-200 hover:border-slate-300'
                : 'bg-white border-slate-200/80 opacity-70 hover:opacity-100'
            )}
          >
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0',
                activeStep === 1
                  ? 'bg-[#7e22ce] text-white'
                  : activeStep > 1
                  ? 'bg-[#059669] text-white'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              )}
            >
              {activeStep > 1 ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : '1'}
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-[10px] font-bold leading-none',
                  activeStep === 1
                    ? 'text-[#7e22ce]'
                    : activeStep > 1
                    ? 'text-[#059669]'
                    : 'text-slate-400'
                )}
              >
                {activeStep === 1 ? 'Current step' : activeStep > 1 ? 'Completed' : 'Upcoming'}
              </p>
              <p className="text-xs font-bold text-slate-900 truncate mt-1">
                1. Client Info & Sectors
              </p>
            </div>
          </button>

          {/* Step 2 */}
          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border text-left transition',
              activeStep === 2
                ? 'bg-[#faf5ff] border-[#c084fc] ring-1 ring-[#c084fc] shadow-xs'
                : activeStep > 2
                ? 'bg-white border-slate-200 hover:border-slate-300'
                : 'bg-white border-slate-200/80 opacity-70 hover:opacity-100'
            )}
          >
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0',
                activeStep === 2
                  ? 'bg-[#7e22ce] text-white'
                  : activeStep > 2
                  ? 'bg-[#059669] text-white'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              )}
            >
              {activeStep > 2 ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : '2'}
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-[10px] font-bold leading-none',
                  activeStep === 2
                    ? 'text-[#7e22ce]'
                    : activeStep > 2
                    ? 'text-[#059669]'
                    : 'text-slate-400'
                )}
              >
                {activeStep === 2 ? 'Current step' : activeStep > 2 ? 'Completed' : 'Upcoming'}
              </p>
              <p className="text-xs font-bold text-slate-900 truncate mt-1">
                2. Family & Finances
              </p>
            </div>
          </button>

          {/* Step 3 */}
          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border text-left transition',
              activeStep === 3
                ? 'bg-[#faf5ff] border-[#c084fc] ring-1 ring-[#c084fc] shadow-xs'
                : activeStep > 3
                ? 'bg-white border-slate-200 hover:border-slate-300'
                : 'bg-white border-slate-200/80 opacity-70 hover:opacity-100'
            )}
          >
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0',
                activeStep === 3
                  ? 'bg-[#7e22ce] text-white'
                  : activeStep > 3
                  ? 'bg-[#059669] text-white'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              )}
            >
              {activeStep > 3 ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : '3'}
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-[10px] font-bold leading-none',
                  activeStep === 3
                    ? 'text-[#7e22ce]'
                    : activeStep > 3
                    ? 'text-[#059669]'
                    : 'text-slate-400'
                )}
              >
                {activeStep === 3 ? 'Current step' : activeStep > 3 ? 'Completed' : 'Upcoming'}
              </p>
              <p className="text-xs font-bold text-slate-900 truncate mt-1">
                3. Clinical Narrative (II–V)
              </p>
            </div>
          </button>

          {/* Step 4 */}
          <button
            type="button"
            onClick={() => setActiveStep(4)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border text-left transition',
              activeStep === 4
                ? 'bg-[#faf5ff] border-[#c084fc] ring-1 ring-[#c084fc] shadow-xs'
                : 'bg-white border-slate-200/80 opacity-70 hover:opacity-100'
            )}
          >
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0',
                activeStep === 4
                  ? 'bg-[#7e22ce] text-white'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              )}
            >
              4
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-[10px] font-bold leading-none',
                  activeStep === 4 ? 'text-[#7e22ce]' : 'text-slate-400'
                )}
              >
                {activeStep === 4 ? 'Current step' : 'Upcoming'}
              </p>
              <p className="text-xs font-bold text-slate-900 truncate mt-1">
                4. Priority & Signatures
              </p>
            </div>
          </button>
        </div>

        {/* ================= MODAL BODY / STEPS ================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* ================= STEP 1: CLIENT INFO & SECTORS ================= */}
          {activeStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Card 1: Case Classification */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <Tag className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      Case Classification
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Set the official admission route and case category before recording client information.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  {/* Category (Admission) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Category (Admission) *
                    </label>
                    <select
                      value={clientCategory}
                      onChange={(e) => setClientCategory(e.target.value as GeneralIntakeCategory)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      <option value="walk_in">Walk-in</option>
                      <option value="referred">Referred</option>
                      <option value="rescued">Rescued</option>
                    </select>
                  </div>

                  {/* Case Category */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Case Category *
                    </label>
                    <select
                      value={caseCategoryType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCaseCategoryType(val);
                        if (val === 'vawc_economic') setCaseType('vawc_economic');
                        else if (val === 'vawc_physical') setCaseType('vawc_physical');
                        else if (val === 'vawc_psychological') setCaseType('vawc_psychological');
                        else if (val === 'vawc_sexual') setCaseType('vawc_sexual');
                        else if (val === 'rape') setCaseType('rape');
                        else if (val === 'child_abuse') setCaseType('vac_abuse');
                        else if (val === 'child_custody' || val === 'child_support') setCaseType('vac_abuse');
                        else if (val === 'acts_of_lasciviousness') setCaseType('acts_of_lasciviousness');
                        else setCaseType('other');
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      <option value="vawc_economic">VAWC Economic</option>
                      <option value="vawc_physical">VAWC Physical</option>
                      <option value="vawc_psychological">VAWC Psychological</option>
                      <option value="vawc_sexual">VAWC Sexual</option>
                      <option value="child_abuse">Child Abuse (RA 7610)</option>
                      <option value="child_custody">Child Custody</option>
                      <option value="child_support">Child Support</option>
                      <option value="rape">Rape / Attempted Rape</option>
                      <option value="acts_of_lasciviousness">Acts of Lasciviousness</option>
                      <option value="other">Other / Special Cases</option>
                    </select>
                  </div>

                  {/* Case Number */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        Case Number *
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoGenerateNumber}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7e22ce] bg-[#f3e8ff] px-2 py-0.5 rounded-full hover:bg-purple-200 transition"
                      >
                        Auto
                      </button>
                    </div>
                    <input
                      type="text"
                      value={caseNumber}
                      onChange={(e) => setCaseNumber(e.target.value)}
                      placeholder="e.g. VAWC-2024-004"
                      className="w-full px-3 py-2 text-xs font-medium text-slate-900 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>
                </div>

                {caseCategoryType === 'other' && (
                  <div className="pt-1">
                    <input
                      type="text"
                      value={caseCategoryOther}
                      onChange={(e) => setCaseCategoryOther(e.target.value)}
                      placeholder="Specify other case category..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-purple-300 bg-purple-50/30 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>
                )}

                {/* Sectors Checklist */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-xs font-semibold text-slate-500 block">
                    Sectors · Select all that apply
                  </label>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                    {SECTOR_OPTIONS.map((sec) => (
                      <label
                        key={sec.id}
                        className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 select-none hover:text-slate-900"
                      >
                        <input
                          type="checkbox"
                          checked={sectors.includes(sec.id)}
                          onChange={() => toggleSector(sec.id)}
                          className="h-4 w-4 rounded border-slate-300 text-[#7e22ce] focus:ring-[#7e22ce] cursor-pointer"
                        />
                        <span>{sec.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: Applicant / Client Registry Search */}
              <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dcfce7] text-[#16a34a] shrink-0">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                        Applicant / Client Registry Search
                      </h4>
                      <p className="text-xs text-slate-500">
                        Search the municipal registry first to avoid duplicate client records.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {linkedResident && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100/80 border border-emerald-300 text-[11px] font-bold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Linked: {victimName}</span>
                        <button
                          type="button"
                          onClick={handleClearResident}
                          className="ml-1 text-slate-400 hover:text-rose-600 text-xs"
                          title="Clear link"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowRegistryDrawer(!showRegistryDrawer)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition shadow-2xs"
                    >
                      <Search className="h-3.5 w-3.5 text-slate-600" />
                      <span>Search Registry</span>
                    </button>
                  </div>
                </div>

                {/* Registry Search Drawer */}
                {showRegistryDrawer && (
                  <div className="mt-3 pt-3 border-t border-emerald-200/80 space-y-2 animate-in fade-in duration-150">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={registryQuery}
                        onChange={(e) => handleSearchResident(e.target.value)}
                        placeholder="Search resident by name (e.g. Reyes, Luzviminda)..."
                        className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {isSearchingResident && (
                        <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-emerald-600" />
                      )}
                    </div>

                    {residentSearchResults.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto shadow-sm">
                        {residentSearchResults.map((r) => (
                          <div
                            key={r.id}
                            className="p-2.5 flex items-center justify-between hover:bg-slate-50 transition"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-900">{r.full_name}</p>
                              <p className="text-[10px] text-slate-500">
                                Birthdate: {r.birthdate || 'N/A'} • {r.gender === 'F' ? 'Female' : 'Male'} •{' '}
                                {r.civil_status || 'Civil Status N/A'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectResident(r)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition"
                            >
                              Auto-fill
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card 3: I. Identifying Information */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      I. Identifying Information
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Applicant / Client details used for assessment, service coordination, and official records.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                  {/* Row 1 */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Name of Applicant / Client *
                    </label>
                    <input
                      type="text"
                      value={victimName}
                      onChange={(e) => {
                        setVictimName(e.target.value);
                        setClientSignatureName(e.target.value);
                      }}
                      placeholder="Full Name"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Age *</label>
                    <input
                      type="text"
                      value={victimAge}
                      onChange={(e) => setVictimAge(e.target.value)}
                      placeholder="Age"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Sex *</label>
                    <select
                      value={victimGender}
                      onChange={(e) => setVictimGender(e.target.value as Gender)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      <option value="F">Female</option>
                      <option value="M">Male</option>
                    </select>
                  </div>

                  {/* Row 2 */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Birthdate *</label>
                    <input
                      type="date"
                      value={birthdate}
                      onChange={(e) => setBirthdate(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Birthplace</label>
                    <input
                      type="text"
                      value={birthplace}
                      onChange={(e) => setBirthplace(e.target.value)}
                      placeholder="Birthplace"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Civil Status *</label>
                    <select
                      value={civilStatus}
                      onChange={(e) => setCivilStatus(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      <option value="Married">Married</option>
                      <option value="Single">Single</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Separated">Separated</option>
                      <option value="Cohabiting / Live-in">Cohabiting / Live-in</option>
                    </select>
                  </div>

                  {/* Row 3 */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Barangay *</label>
                    <select
                      value={barangayId}
                      onChange={(e) => setBarangayId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      {BARANGAY_REGISTRY.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Present Address / Purok *
                    </label>
                    <input
                      type="text"
                      value={victimAddress}
                      onChange={(e) => setVictimAddress(e.target.value)}
                      placeholder="e.g. Purok 3, Barangay Tagisan"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Length of Stay</label>
                    <input
                      type="text"
                      value={lengthOfStay}
                      onChange={(e) => setLengthOfStay(e.target.value)}
                      placeholder="e.g. 18 years"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  {/* Row 4 */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Highest Education
                    </label>
                    <select
                      value={educationalAttainment}
                      onChange={(e) => setEducationalAttainment(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      <option value="High School Graduate">High School Graduate</option>
                      <option value="Elementary Graduate">Elementary Graduate</option>
                      <option value="High School Undergraduate">High School Undergraduate</option>
                      <option value="College Undergraduate">College Undergraduate</option>
                      <option value="College Graduate">College Graduate</option>
                      <option value="Vocational / Tech">Vocational / Tech</option>
                      <option value="None">None</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Religion</label>
                    <input
                      type="text"
                      value={religion}
                      onChange={(e) => setReligion(e.target.value)}
                      placeholder="e.g. Roman Catholic"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Occupation</label>
                    <input
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      placeholder="e.g. House helper / Informal"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  {/* Row 5 */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Monthly Income
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">₱</span>
                      <input
                        type="number"
                        value={monthlyIncome}
                        onChange={(e) => setMonthlyIncome(e.target.value)}
                        placeholder="5,000"
                        className="w-full pl-7 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      House Occupancy
                    </label>
                    <select
                      value={houseOccupancy}
                      onChange={(e) => setHouseOccupancy(e.target.value as 'owner' | 'renter')}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      <option value="owner">Owner</option>
                      <option value="renter">Renter</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Contact Number
                    </label>
                    <input
                      type="text"
                      value={victimContact}
                      onChange={(e) => setVictimContact(e.target.value)}
                      placeholder="0917 123 4567"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>
                </div>

                {/* Estimated Property Damage */}
                <div className="space-y-1 pt-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Estimated Property Damage
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">₱</span>
                    <input
                      type="number"
                      value={estimatedPropertyDamage}
                      onChange={(e) => setEstimatedPropertyDamage(e.target.value)}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Enter the estimated amount only when property loss or damage is part of the case.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: FAMILY & FINANCES ================= */}
          {activeStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Card 1: Family Members Composition */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">
                        Family Members Composition
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        List household members and dependents. Up to 10 members may be recorded.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddFamilyMember}
                    disabled={familyMembers.length >= 10}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5 text-slate-600" />
                    <span>Add Member</span>
                  </button>
                </div>

                {/* Table */}
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#0f172a] text-white text-[11px] font-bold">
                          <th className="py-2.5 px-3 w-8">#</th>
                          <th className="py-2.5 px-3 min-w-[140px]">Name</th>
                          <th className="py-2.5 px-3 w-16">Age</th>
                          <th className="py-2.5 px-3 min-w-[100px]">Status</th>
                          <th className="py-2.5 px-3 min-w-[110px]">Relationship</th>
                          <th className="py-2.5 px-3 min-w-[110px]">Education</th>
                          <th className="py-2.5 px-3 min-w-[110px]">Occupation</th>
                          <th className="py-2.5 px-3 min-w-[90px]">Income</th>
                          <th className="py-2.5 px-2 w-8 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {familyMembers.map((member, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60 transition">
                            <td className="py-2 px-3 text-slate-500 font-bold">{idx + 1}</td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={member.name}
                                onChange={(e) => updateFamilyMember(idx, 'name', e.target.value)}
                                placeholder="Full Name"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white font-medium"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={member.age}
                                onChange={(e) => updateFamilyMember(idx, 'age', e.target.value)}
                                placeholder="Age"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-center font-medium"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={member.civil_status}
                                onChange={(e) => updateFamilyMember(idx, 'civil_status', e.target.value)}
                                placeholder="Civil Status"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white font-medium"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={member.relationship}
                                onChange={(e) => updateFamilyMember(idx, 'relationship', e.target.value)}
                                placeholder="Relationship"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white font-medium"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={member.educational_attainment}
                                onChange={(e) => updateFamilyMember(idx, 'educational_attainment', e.target.value)}
                                placeholder="Education"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white font-medium"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={member.occupation}
                                onChange={(e) => updateFamilyMember(idx, 'occupation', e.target.value)}
                                placeholder="Occupation"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white font-medium"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={member.income ? `₱${String(member.income).replace(/[^0-9]/g, '')}` : ''}
                                onChange={(e) => updateFamilyMember(idx, 'income', e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="₱0"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white font-medium"
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              {familyMembers.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFamilyMember(idx)}
                                  className="text-slate-300 hover:text-rose-600 transition"
                                  title="Remove member"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-slate-400 font-medium">
                  {familyMembers.length} of 10 family members recorded
                </p>
              </div>

              {/* Card 2 & 3: 2-Column Row (Finances) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Left: Sources of Income */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                        <Coins className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          Sources of Income
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Record regular and supplemental household income.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-1">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Primary Source of Income
                        </label>
                        <input
                          type="text"
                          value={sourcesOfIncome}
                          onChange={(e) => setSourcesOfIncome(e.target.value)}
                          placeholder="e.g. House helper / Informal work"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Other Sources of Income
                        </label>
                        <input
                          type="text"
                          value={otherSourcesOfIncome}
                          onChange={(e) => setOtherSourcesOfIncome(e.target.value)}
                          placeholder="Enter other household income, if any"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 pt-1 select-none">
                        <input
                          type="checkbox"
                          checked={hasLand}
                          onChange={(e) => setHasLand(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-[#7e22ce] focus:ring-[#7e22ce]"
                        />
                        <span>With agricultural land / livelihood</span>
                      </label>
                    </div>
                  </div>

                  {/* Total Family Income Box */}
                  <div className="rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] p-4 flex items-center justify-between mt-3">
                    <span className="text-xs font-bold text-[#065f46]">Total Family Income</span>
                    <span className="text-base sm:text-lg font-black text-[#064e3b]">
                      ₱{computedTotalIncome.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Right: Monthly Expense Breakdown */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          Monthly Expense Breakdown
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Enter the household&apos;s regular monthly obligations.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Food</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-500">₱</span>
                          <input
                            type="number"
                            value={foodExpense}
                            onChange={(e) => setFoodExpense(e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Water</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-500">₱</span>
                          <input
                            type="number"
                            value={waterExpense}
                            onChange={(e) => setWaterExpense(e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Electricity</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-500">₱</span>
                          <input
                            type="number"
                            value={electricityExpense}
                            onChange={(e) => setElectricityExpense(e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Education</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-500">₱</span>
                          <input
                            type="number"
                            value={educationExpense}
                            onChange={(e) => setEducationExpense(e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Transportation</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-500">₱</span>
                          <input
                            type="number"
                            value={transportationExpense}
                            onChange={(e) => setTransportationExpense(e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Other</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-500">₱</span>
                          <input
                            type="number"
                            value={otherExpense}
                            onChange={(e) => setOtherExpense(e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Total Monthly Expenses Box */}
                  <div className="rounded-xl bg-[#faf5ff] border border-[#e9d5ff] p-4 flex items-center justify-between mt-3">
                    <span className="text-xs font-bold text-[#6b21a8]">Total Monthly Expenses</span>
                    <span className="text-base sm:text-lg font-black text-[#581c87]">
                      ₱{computedTotalExpenses.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: Outside Assistance Sought */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <HandHeart className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      Outside Assistance Sought
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Indicate whether the family has sought support from another office, agency, or organization.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Outside Assistance Sought *
                    </label>
                    <select
                      value={outsideAssistanceSought}
                      onChange={(e) => {
                        const val = e.target.value as 'no' | 'yes';
                        setOutsideAssistanceSought(val);
                        if (val === 'no') {
                          setAgencyOrganization('Not applicable');
                          setAssistanceReceived('Not applicable');
                        } else {
                          setAgencyOrganization('');
                          setAssistanceReceived('');
                        }
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Agency / Organization
                    </label>
                    <input
                      type="text"
                      disabled={outsideAssistanceSought === 'no'}
                      value={agencyOrganization}
                      onChange={(e) => setAgencyOrganization(e.target.value)}
                      placeholder="Agency name"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Assistance Received
                    </label>
                    <input
                      type="text"
                      disabled={outsideAssistanceSought === 'no'}
                      value={assistanceReceived}
                      onChange={(e) => setAssistanceReceived(e.target.value)}
                      placeholder="Assistance received"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: CLINICAL NARRATIVE ================= */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Guidance Banner */}
              <div className="rounded-xl border border-blue-200 bg-[#eff6ff] p-3.5 flex items-start gap-3">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-blue-950">Clinical narrative guidance</h4>
                  <p className="text-xs text-blue-800/90 mt-0.5">
                    Complete all four required sections in clear, objective language. Distinguish client statements from professional assessment and avoid unnecessary identifying details.
                  </p>
                </div>
              </div>

              {/* II. Problem Presented */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      II. Problem Presented
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      State the client&apos;s presenting concern, immediate risks, and the reason assistance is being requested.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-slate-700">Problem Presented *</label>
                  <textarea
                    rows={4}
                    value={problemPresented}
                    onChange={(e) => setProblemPresented(e.target.value)}
                    placeholder="Describe the presenting problem, relevant dates, persons involved, and immediate safety or welfare concerns..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce] leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400">
                    Required • Record the client&apos;s account faithfully and indicate the source of information.
                  </p>
                </div>
              </div>

              {/* III. Family Background Information */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      III. Family Background Information
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Summarize household relationships, socioeconomic conditions, support systems, and relevant family history.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-slate-700">Family Background Information *</label>
                  <textarea
                    rows={4}
                    value={familyBackground}
                    onChange={(e) => setFamilyBackground(e.target.value)}
                    placeholder="Describe household composition, family dynamics, sources of support, living conditions, and prior interventions..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce] leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400">
                    Required • Include only information relevant to assessment and case planning.
                  </p>
                </div>
              </div>

              {/* IV. Social Worker's Assessment */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <Compass className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      IV. Social Worker&apos;s Assessment
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Provide a professional analysis of needs, strengths, risks, protective factors, and available resources.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-slate-700">Social Worker&apos;s Assessment *</label>
                  <textarea
                    rows={4}
                    value={assessment}
                    onChange={(e) => setAssessment(e.target.value)}
                    placeholder="Document your professional assessment, including risk and protective factors, needs, strengths, and service eligibility..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce] leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400">
                    Required • Use evidence from the interview, records, and verified collateral information.
                  </p>
                </div>
              </div>

              {/* V. Recommendation / Action Taken */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      V. Recommendation / Action Taken
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Record actions already completed and the recommended plan, referrals, or follow-up schedule.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-slate-700">Recommendation / Action Taken *</label>
                  <textarea
                    rows={4}
                    value={recommendationAction}
                    onChange={(e) => setRecommendationAction(e.target.value)}
                    placeholder="Enter immediate actions, referrals, agreed interventions, responsible persons, and target follow-up dates..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce] leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400">
                    Required • Recommendations should be specific, time-bound, and linked to the assessment.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 4: PRIORITY & SIGNATURES ================= */}
          {activeStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Success Banner */}
              <div className="rounded-xl border border-emerald-200 bg-[#ecfdf5] p-3.5 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-950">Steps 1–3 complete</h4>
                  <p className="text-xs text-emerald-800/90">
                    Review prioritization, verify the official signatories, and confirm the record before completing intake.
                  </p>
                </div>
              </div>

              {/* Card 1: Alleged Perpetrator / Respondent */}
              <div className="rounded-2xl border border-amber-200/90 bg-[#fffbeb] p-5 shadow-xs space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <UserX className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      Alleged Perpetrator / Respondent
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Include respondent information only when applicable to this case.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 pt-1 select-none">
                  <input
                    type="checkbox"
                    checked={hasPerpetrator}
                    onChange={(e) => setHasPerpetrator(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Alleged perpetrator / respondent information is applicable</span>
                </label>

                {hasPerpetrator && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Name</label>
                      <input
                        type="text"
                        value={perpetratorName}
                        onChange={(e) => setPerpetratorName(e.target.value)}
                        placeholder="Carlos Reyes"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Relationship to Client</label>
                      <input
                        type="text"
                        value={perpetratorRelationship}
                        onChange={(e) => setPerpetratorRelationship(e.target.value)}
                        placeholder="Husband"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Known Address</label>
                      <input
                        type="text"
                        value={perpetratorAddress}
                        onChange={(e) => setPerpetratorAddress(e.target.value)}
                        placeholder="Purok 3, Barangay Tagisan"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Case Prioritization & Ranking */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <ListOrdered className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      Case Prioritization & Ranking
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Use the assessed level to guide response time, referral urgency, and supervisory review.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Priority Level *</label>
                    <select
                      value={priorityLevel}
                      onChange={(e) => setPriorityLevel(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                      <option value="Urgent / Critical">Urgent / Critical</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Ranking Score *</label>
                    <input
                      type="text"
                      value={rankingScore}
                      onChange={(e) => setRankingScore(e.target.value)}
                      placeholder="3"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Date Assessed *</label>
                    <input
                      type="date"
                      value={dateAssessed}
                      onChange={(e) => setDateAssessed(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Basis for Prioritization *</label>
                  <input
                    type="text"
                    value={basisForPrioritization}
                    onChange={(e) => setBasisForPrioritization(e.target.value)}
                    placeholder="VAWC economic abuse affecting the subsistence and welfare of two minor children."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                  />
                </div>
              </div>

              {/* Card 3: Official Signatures & Casework Verification */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#7e22ce] shrink-0">
                    <PenTool className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      Official Signatures & Casework Verification
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      These entries form part of the official two-page GIS and casework record.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Applicant / Client *</label>
                    <input
                      type="text"
                      value={clientSignatureName}
                      onChange={(e) => setClientSignatureName(e.target.value)}
                      placeholder="Luzviminda Reyes"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Social Worker / Interviewer *</label>
                    <input
                      type="text"
                      value={assignedWorker}
                      onChange={(e) => setAssignedWorker(e.target.value)}
                      placeholder="Pedro Penduko, RSW"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Date of Interview *</label>
                    <input
                      type="date"
                      value={dateOfInterview}
                      onChange={(e) => setDateOfInterview(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">MSWDO Verification *</label>
                    <input
                      type="text"
                      value={mswdoVerification}
                      onChange={(e) => setMswdoVerification(e.target.value)}
                      placeholder="For review and signature"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7e22ce]"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 pt-2 select-none">
                  <input
                    type="checkbox"
                    checked={isRecordConfirmed}
                    onChange={(e) => setIsRecordConfirmed(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#7e22ce] focus:ring-[#7e22ce]"
                  />
                  <span>
                    I confirm that this intake record is complete, accurate to the information provided, and ready for official signature and casework verification.
                  </span>
                </label>
              </div>

              {/* Purple Alert Note */}
              <div className="rounded-xl border border-[#e9d5ff] bg-[#faf5ff] p-3.5 flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 text-[#7e22ce] shrink-0" />
                <p className="text-xs text-[#581c87] font-medium leading-relaxed">
                  Save & Complete Intake will finalize the current GIS record. Use Print 2-Page GIS only when a paper copy is required for the official case folder.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-slate-200">
          {activeStep === 1 && (
            <>
              <p className="text-xs text-slate-500 font-medium">
                Step 1 of 4 - Client identity and sector classification
              </p>
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold text-xs shadow-xs transition"
              >
                <span>Next: Family Composition & Finances</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {activeStep === 2 && (
            <>
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 transition shadow-2xs"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back to Step 1</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold text-xs shadow-xs transition"
              >
                <span>Next: Clinical Narrative</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {activeStep === 3 && (
            <>
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 transition shadow-2xs"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back to Step 2</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(4)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold text-xs shadow-xs transition"
              >
                <span>Next: Priority & Signatures</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {activeStep === 4 && (
            <>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 transition shadow-2xs"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back to Step 3</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintPreview}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 transition shadow-2xs"
                >
                  <Printer className="h-4 w-4 text-slate-600" />
                  <span>Print 2-Page GIS</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting || !isRecordConfirmed}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#6b21a8] hover:bg-[#581c87] text-white font-bold text-xs shadow-xs transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Record...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Save & Complete Intake</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

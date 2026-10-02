'use client';

import React, { useState, useEffect, useId, useMemo, useRef } from 'react';
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
  Search,
  UserCheck,
  Home,
  Hash,
  Edit3,
} from 'lucide-react';
import { BARANGAY_REGISTRY, getBarangayName } from '@/lib/mabini-barangays';
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
import { getResidents } from '@/lib/db/residents';
import { getHouseholds } from '@/lib/db/households';
import { calculateAge } from '@/lib/db/vulnerability';
import {
  getAicsDailyBudget,
  calculateAicsDailyBudgetSummary,
  formatAicsCurrency,
  type AicsDailyBudgetSummary,
} from '@/lib/db/aics-budget';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import { printPettyCashVoucher } from '@/lib/aics/voucher-printer';
import { amountToWords } from '@/lib/aics/amount-to-words';
import { getCurrentUser } from '@/lib/auth';
import { computeAicsCooldown, type AicsCooldownInfo } from '@/lib/aics/aics-cooldown';
import type {
  AicsRecord,
  AicsClientCategory,
  AicsAssistanceType,
  AicsIntakeCategory,
  AicsSector,
  CaseFamilyMember,
  Resident,
  Household,
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
  const [existingRecords, setExistingRecords] = useState<AicsRecord[]>([]);

  // Census Residents & Households Search State
  const [allResidents, setAllResidents] = useState<Resident[]>([]);
  const [allHouseholds, setAllHouseholds] = useState<Household[]>([]);
  const [isLoadingCensus, setIsLoadingCensus] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<Household | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingCensus(true);
      void Promise.all([
        getAicsDailyBudget(),
        getAicsRecords(),
        getResidents({ status: 'active' }),
        getHouseholds(),
      ])
        .then(([budget, recs, resList, hhList]) => {
          setBudgetSummary(calculateAicsDailyBudgetSummary(budget, recs));
          setExistingRecords(recs);
          setAllResidents(resList || []);
          setAllHouseholds(hhList || []);
        })
        .catch((err) => {
          console.error('Failed to load AICS census data:', err);
        })
        .finally(() => {
          setIsLoadingCensus(false);
        });
    } else {
      setSelectedResident(null);
      setSelectedHousehold(null);
      setIsSearchOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Form State - Identification & Intake
  const [controlNumber] = useState(generateAicsControlNumber());
  const [voucherNumber, setVoucherNumber] = useState('');
  const [intakeDate, setIntakeDate] = useState(new Date().toISOString().split('T')[0]);
  const [intakeCategory, setIntakeCategory] = useState<AicsIntakeCategory>('walk_in');
  const [sectors, setSectors] = useState<AicsSector[]>([]);
  const [clientCategory, setClientCategory] = useState<AicsClientCategory>('fhona');
  const [subCategory, setSubCategory] = useState<string>('Dialysis Patients');

  // Client Details
  const [clientName, setClientName] = useState('');
  const [clientAge, setClientAge] = useState<string>('');
  const [clientGender, setClientGender] = useState<'Male' | 'Female'>('Female');

  const householdsMap = useMemo(() => {
    const map = new Map<string, Household>();
    for (const hh of allHouseholds) {
      map.set(hh.id, hh);
    }
    return map;
  }, [allHouseholds]);

  // Compute 90-day (3-month) cooldown for typed applicant or selected resident
  const clientCooldown = useMemo(() => {
    const trimmed = clientName.trim().toLowerCase();
    if (!trimmed || existingRecords.length === 0) return null;
    const matching = existingRecords.filter((r) => {
      if (selectedResident && r.resident_id === selectedResident.id) return true;
      if (selectedHousehold && r.household_id === selectedHousehold.id) return true;
      const name = (r.client_name || '').trim().toLowerCase();
      return name === trimmed || (trimmed.length >= 4 && (name.includes(trimmed) || trimmed.includes(name)));
    });
    if (matching.length === 0) return null;
    return computeAicsCooldown(matching);
  }, [clientName, existingRecords, selectedResident, selectedHousehold]);

  interface CensusCandidate {
    id: string;
    resident?: Resident;
    household?: Household;
    fullName: string;
    isHouseholdHead: boolean;
    relationshipToHead: string;
    barangayId: string;
    barangayName: string;
    purokSitio: string;
    age: number | null;
    gender: string;
    civilStatus?: string;
    occupation?: string;
    cooldown: AicsCooldownInfo;
  }

  const filteredCandidates = useMemo(() => {
    const q = clientName.trim().toLowerCase();
    if (!q || selectedResident) return [];

    const tokens = q.split(/\s+/).filter(Boolean);
    const matched: CensusCandidate[] = [];

    // 1. Search across registered active residents
    for (const res of allResidents) {
      const hh = res.household_id ? householdsMap.get(res.household_id) : undefined;
      const brgyName = getBarangayName(hh?.barangay_id || (res as any).barangay_id || '');
      const purok = (res as any).purok_sitio || hh?.purok_sitio || hh?.street_address || '';
      const fullName = res.full_name || `${res.first_name || ''} ${res.last_name || ''}`.trim();
      const searchText = `${fullName} ${hh?.head_name || ''} ${purok} ${brgyName}`.toLowerCase();

      const matchesAllTokens = tokens.every((t) => searchText.includes(t));
      if (matchesAllTokens) {
        const isHead =
          res.relationship_to_head?.toLowerCase() === 'head' ||
          hh?.head_name?.trim().toLowerCase() === fullName.trim().toLowerCase();

        const resRecords = existingRecords.filter(
          (r) =>
            (r.resident_id && r.resident_id === res.id) ||
            (r.client_name && r.client_name.trim().toLowerCase() === fullName.trim().toLowerCase())
        );
        const cd = computeAicsCooldown(resRecords);
        const ageVal = res.birthdate ? calculateAge(res.birthdate) : null;

        matched.push({
          id: res.id,
          resident: res,
          household: hh,
          fullName,
          isHouseholdHead: Boolean(isHead),
          relationshipToHead: res.relationship_to_head || (isHead ? 'Head' : 'Member'),
          barangayId: hh?.barangay_id || (res as any).barangay_id || 'poblacion',
          barangayName: brgyName || 'Mabini',
          purokSitio: purok,
          age: isNaN(Number(ageVal)) ? null : ageVal,
          gender: res.gender === 'M' ? 'Male' : 'Female',
          civilStatus: res.civil_status,
          occupation: res.occupation,
          cooldown: cd,
        });
        if (matched.length >= 25) break;
      }
    }

    // 2. Also search household heads from allHouseholds if not already matched
    if (matched.length < 25) {
      for (const hh of allHouseholds) {
        if (!hh.head_name) continue;
        const brgyName = getBarangayName(hh.barangay_id || '');
        const purok = hh.purok_sitio || hh.street_address || '';
        const searchText = `${hh.head_name} ${purok} ${brgyName}`.toLowerCase();
        const matchesAllTokens = tokens.every((t) => searchText.includes(t));

        if (matchesAllTokens) {
          const alreadyIncluded = matched.some(
            (m) => m.fullName.trim().toLowerCase() === hh.head_name.trim().toLowerCase()
          );
          if (!alreadyIncluded) {
            const hhRecords = existingRecords.filter(
              (r) =>
                (r.household_id && r.household_id === hh.id) ||
                (r.client_name && r.client_name.trim().toLowerCase() === hh.head_name.trim().toLowerCase())
            );
            const cd = computeAicsCooldown(hhRecords);
            matched.push({
              id: `hh_head_${hh.id}`,
              household: hh,
              fullName: hh.head_name,
              isHouseholdHead: true,
              relationshipToHead: 'Head',
              barangayId: hh.barangay_id || 'poblacion',
              barangayName: brgyName || 'Mabini',
              purokSitio: purok,
              age: null,
              gender: 'Female',
              cooldown: cd,
            });
            if (matched.length >= 25) break;
          }
        }
      }
    }

    // Sort: household heads first, then alphabetical
    return matched
      .sort((a, b) => {
        if (a.isHouseholdHead && !b.isHouseholdHead) return -1;
        if (!a.isHouseholdHead && b.isHouseholdHead) return 1;
        return a.fullName.localeCompare(b.fullName);
      })
      .slice(0, 8);
  }, [clientName, allResidents, allHouseholds, householdsMap, existingRecords, selectedResident]);

  function handleSelectCandidate(candidate: CensusCandidate) {
    const res = candidate.resident;
    const hh = candidate.household || (res?.household_id ? householdsMap.get(res.household_id) : undefined);

    setSelectedResident(res || null);
    setSelectedHousehold(hh || null);
    setClientName(candidate.fullName);
    setIsSearchOpen(false);

    if (candidate.gender) {
      setClientGender(candidate.gender as 'Male' | 'Female');
    }
    if (res?.birthdate) {
      setBirthdate(res.birthdate);
      const calcAge = calculateAge(res.birthdate);
      if (!isNaN(calcAge)) {
        setClientAge(String(calcAge));
      }
    } else if (candidate.age !== null) {
      setClientAge(String(candidate.age));
    }

    if (candidate.barangayId) {
      setBarangayId(candidate.barangayId);
    }
    if (candidate.purokSitio) {
      setPurokSitio(candidate.purokSitio);
    }
    if (res?.contact_number || hh?.contact_number) {
      setContactNumber(res?.contact_number || hh?.contact_number || '');
    }
    if (res?.civil_status) {
      setCivilStatus(res.civil_status.toLowerCase());
    }
    if (res?.occupation) {
      setOccupation(res.occupation);
    }
    if (res?.income_level) {
      if (res.income_level === 'low') setMonthlyIncome('5000');
      else if (res.income_level === 'middle') setMonthlyIncome('15000');
      else if (res.income_level === 'high') setMonthlyIncome('30000');
    }

    // Auto-populate Step 3 Household Family Members if available
    const householdId = hh?.id || res?.household_id;
    if (householdId) {
      const otherMembers = allResidents.filter(
        (m) => m.household_id === householdId && m.id !== res?.id
      );
      if (otherMembers.length > 0) {
        const autoFamily: CaseFamilyMember[] = otherMembers.map((m) => {
          const age = calculateAge(m.birthdate);
          return {
            name: m.full_name,
            age: isNaN(age) ? '' : String(age),
            civil_status: (m.civil_status as any) || 'single',
            relationship: m.relationship_to_head || 'Household Member',
            educational_attainment: 'High School Graduate',
            occupation: m.occupation || 'None',
            income: '0',
            birthday: m.birthdate || '',
          };
        });
        setFamilyMembers(autoFamily);
      }
    }
  }

  function handleClearSelectedResident() {
    setSelectedResident(null);
    setSelectedHousehold(null);
    setIsSearchOpen(true);
  }
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
  const [sourceOfFund, setSourceOfFund] = useState('DSWD FUNDING');
  const [otherSupportText, setOtherSupportText] = useState('');
  const [customAmountInWords, setCustomAmountInWords] = useState('');
  const [isCustomWords, setIsCustomWords] = useState(false);

  const autoAmountInWords = useMemo(
    () => amountToWords(parseFloat(amountApproved) || 0),
    [amountApproved]
  );

  const amountInWords = isCustomWords && customAmountInWords.trim()
    ? customAmountInWords.toUpperCase()
    : autoAmountInWords;

  function handleGenerateVoucherNo() {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    setVoucherNumber(`PCV-${year}-${rand}`);
  }

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

  async function handleSave(printMode: 'gis' | 'voucher' | 'both' | boolean = false) {
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
        voucher_number: voucherNumber.trim() || controlNumber,
        source_of_fund: sourceOfFund.trim() || 'DSWD FUNDING',
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
        resident_id: selectedResident?.id,
        household_id: selectedHousehold?.id || selectedResident?.household_id,
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

      if (printMode === true || printMode === 'gis' || printMode === 'both') {
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

      if (printMode === 'voucher' || printMode === 'both') {
        printPettyCashVoucher({
          control_number: record.control_number,
          voucher_number: record.voucher_number || record.control_number,
          intake_date: record.intake_date,
          client_name: record.client_name,
          barangay_id: record.barangay_id,
          purok_sitio: record.purok_sitio,
          assistance_type: record.assistance_type,
          specific_assistance: record.specific_assistance,
          amount_approved: record.amount_approved,
          source_of_fund: record.source_of_fund || sourceOfFund,
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
                    Step 1: Client Intake & Assistance Voucher
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Sunda ang 3 ka hugna: (1) Client Information, (2) Petty Cash Voucher & Aid Amount, (3) Official MSWDO Category.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Step 1 of 5
                </span>
              </div>

              {/* -----------------------------------------------------------------
                  PART 1: CLIENT IDENTIFYING INFORMATION & INTAKE SETUP
                  ----------------------------------------------------------------- */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200/90 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-white text-[10px] font-black">1</span>
                    Client Identifying Information & Intake Mode
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Intake Mode:</span>
                    <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50">
                      {AICS_INTAKE_MODES.map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setIntakeCategory(mode.id)}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition cursor-pointer ${
                            intakeCategory === mode.id
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    {selectedResident ? (
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <label className="text-[11px] font-bold text-slate-800">
                            Name of Applicant / Client <span className="text-rose-600 font-black">*</span>
                          </label>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <UserCheck className="h-3 w-3" />
                            {selectedResident.relationship_to_head?.toLowerCase() === 'head'
                              ? 'Registered Household Head'
                              : 'Registered Resident'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearSelectedResident}
                          className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                        >
                          Change / Re-search
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                          <span>Name of Applicant / Client</span>
                          <span className="text-rose-600 font-black">*</span>
                          <span className="text-[10px] font-normal text-slate-500">
                            (Pangitaa sa census register o i-type)
                          </span>
                        </label>
                        {isLoadingCensus && (
                          <span className="text-[10px] text-teal-600 flex items-center gap-1 font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading census...
                          </span>
                        )}
                      </div>
                    )}

                    <div className="relative" ref={searchDropdownRef}>
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={clientName}
                          onChange={(e) => {
                            setClientName(e.target.value);
                            if (selectedResident && e.target.value !== selectedResident.full_name) {
                              setSelectedResident(null);
                              setSelectedHousehold(null);
                            }
                            setIsSearchOpen(true);
                          }}
                          onFocus={() => {
                            if (clientName.trim().length >= 1 && !selectedResident) {
                              setIsSearchOpen(true);
                            }
                          }}
                          placeholder="I-type ang ngalan sa aplikante o household head..."
                          className={`w-full pl-9 pr-9 py-2.5 text-xs rounded-xl border font-medium outline-none transition ${
                            selectedResident
                              ? 'border-emerald-500 bg-emerald-50/30 text-slate-900 ring-1 ring-emerald-400'
                              : 'border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white text-slate-900'
                          }`}
                        />
                        {selectedResident ? (
                          <div className="absolute right-3 top-2.5 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </div>
                        ) : clientName.trim().length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setClientName('');
                              handleClearSelectedResident();
                            }}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                            aria-label="Clear client name"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>

                      {/* Dropdown Results from Registered Census */}
                      {isSearchOpen && filteredCandidates.length > 0 && (
                        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-emerald-200/90 bg-white p-1.5 shadow-2xl space-y-1">
                          <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center justify-between border-b border-slate-100">
                            <span className="flex items-center gap-1 text-slate-700">
                              <Users className="h-3 w-3 text-teal-600" />
                              Mga Rehistradong Residente & Household ({filteredCandidates.length})
                            </span>
                            <span className="text-teal-700 font-semibold">Pilia aron ma-autofill</span>
                          </div>
                          {filteredCandidates.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => handleSelectCandidate(candidate)}
                              className="w-full text-left p-2.5 rounded-xl hover:bg-emerald-50/80 border border-transparent hover:border-emerald-200 transition flex items-center justify-between gap-3 cursor-pointer group"
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div
                                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                    candidate.isHouseholdHead
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-teal-100 text-teal-800 border border-teal-200'
                                  }`}
                                >
                                  {candidate.isHouseholdHead ? (
                                    <Home className="h-3.5 w-3.5" />
                                  ) : (
                                    <User className="h-3.5 w-3.5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-xs text-slate-900 group-hover:text-emerald-950">
                                      {candidate.fullName}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                        candidate.isHouseholdHead
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {candidate.isHouseholdHead
                                        ? 'Household Head'
                                        : `Member (${candidate.relationshipToHead})`}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                    📍 {candidate.purokSitio ? `${candidate.purokSitio}, ` : ''}Brgy.{' '}
                                    {candidate.barangayName}
                                    {candidate.age !== null ? ` • ${candidate.age} y/o` : ''} •{' '}
                                    {candidate.gender}
                                  </p>
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                {candidate.cooldown.isUnderCooldown ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    🔴 {candidate.cooldown.daysRemaining}d Cooldown
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    🟢 Pwede Makadawat
                                  </span>
                                )}
                                <p className="text-[9px] text-teal-700 font-semibold mt-0.5 group-hover:underline">
                                  Pilia & Autofill →
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Helper when typed name has no registered match */}
                      {isSearchOpen &&
                        clientName.trim().length >= 2 &&
                        filteredCandidates.length === 0 &&
                        !selectedResident && (
                          <div className="absolute left-0 right-0 z-50 mt-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl text-xs text-slate-600">
                            <p className="font-semibold text-slate-800">
                              Wala sa rehistro sa census si &quot;{clientName}&quot;
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Walay problema — pwede ra nimo ipadayon ang pag-fill out isip usa ka <strong>walk-in applicant</strong>.
                            </p>
                          </div>
                        )}
                    </div>
                    {clientCooldown?.isUnderCooldown && (
                      <div className="mt-2 p-3 rounded-2xl bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-rose-700">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                          <span>Pahibalo: Naka-dawat na sa miaging 90 ka adlaw ({clientCooldown.daysRemaining}d nahabilin)</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-rose-800">
                          {clientCooldown.explanationCeb}
                        </p>
                        <p className="text-[10px] text-rose-600 font-semibold">
                          ⚠️ Ubos sa standard policy, 3 ka buwan (90 ka adlaw) ang cooldown una makadawat og balik. Pwede ra ipadayon kon emergency exception.
                        </p>
                      </div>
                    )}
                    {clientCooldown && !clientCooldown.isUnderCooldown && (
                      <div className="mt-2 p-2.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="text-[11px] font-semibold text-emerald-800">
                          🟢 Kwalipikado: {clientCooldown.explanationCeb}
                        </span>
                      </div>
                    )}
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

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Date of Interview *</label>
                    <input
                      type="date"
                      value={intakeDate}
                      onChange={(e) => setIntakeDate(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:border-emerald-500 outline-none"
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

              {/* -----------------------------------------------------------------
                  PART 2: MUNICIPAL PETTY CASH VOUCHER & AID GRANT (INTERACTIVE PAPER VOUCHER)
                  ----------------------------------------------------------------- */}
              <div className="bg-white rounded-3xl border-2 border-slate-300 shadow-md p-4 sm:p-6 space-y-4 relative overflow-hidden">
                {/* Desk Mode Indicator */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-100 pb-3 bg-slate-50/70 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 px-4 sm:px-6 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-900 text-white text-[11px] font-black shadow-xs">
                      2
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-800" />
                        Municipal Petty Cash Voucher Encoder
                      </h4>
                      <p className="text-[10px] text-slate-500 font-medium">
                        Direkta i-encode ang Voucher No., Particulars, ug kantidad gikan sa physical booklet o slip
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        printPettyCashVoucher({
                          control_number: controlNumber,
                          voucher_number: voucherNumber.trim() || controlNumber,
                          intake_date: intakeDate,
                          client_name: clientName.trim() || 'Client / Applicant',
                          barangay_id: barangayId,
                          purok_sitio: purokSitio,
                          assistance_type: assistanceType,
                          specific_assistance: specificAssistance,
                          amount_approved: parseFloat(amountApproved) || 0,
                          source_of_fund: sourceOfFund,
                        });
                      }}
                      className="px-3 py-1.5 text-xs font-bold bg-blue-900 hover:bg-blue-800 text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                      title="I-preview o i-print ang official Petty Cash Voucher"
                    >
                      <Printer className="h-3.5 w-3.5 text-blue-300" />
                      Preview / Print Voucher
                    </button>
                  </div>
                </div>

                {/* PHYSICAL VOUCHER SHEET REPLICA */}
                <div className="border-2 border-slate-700/80 rounded-2xl p-4 sm:p-5 bg-white space-y-4 shadow-sm">
                  {/* Voucher Header (Logos, Title & Voucher No / Date) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center border-b-2 border-slate-200 pb-3">
                    <div className="md:col-span-8 flex items-center gap-3">
                      <div className="flex items-center gap-2 shrink-0">
                        <img
                          src="/davao-de-oro-logo.png"
                          alt="Mabini Seal"
                          className="h-11 w-11 object-contain drop-shadow-xs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <img
                          src="/mswdo-logo.png"
                          alt="MSWDO Seal"
                          className="h-11 w-11 object-contain drop-shadow-xs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9.5px] uppercase font-bold tracking-widest text-slate-500">
                          Republic of the Philippines
                        </p>
                        <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight uppercase leading-none">
                          Municipality of Mabini
                        </h3>
                        <p className="text-[10px] text-slate-600 font-medium">Province of Davao de Oro</p>
                        <p className="text-[9.5px] font-black text-emerald-800 uppercase tracking-tight">
                          Municipal Social Welfare and Development Office (MSWDO)
                        </p>
                      </div>
                    </div>

                    {/* Voucher No. & Date Block */}
                    <div className="md:col-span-4 flex flex-col items-start md:items-end gap-1.5">
                      <div className="bg-blue-900 text-white font-black text-[11px] tracking-wider px-3 py-1 rounded-sm uppercase shadow-xs">
                        Petty Cash Voucher
                      </div>

                      <div className="w-full flex items-center justify-between md:justify-end gap-1.5 text-xs">
                        <span className="font-bold text-slate-700 shrink-0 text-[11px]">Voucher No.:</span>
                        <div className="flex items-center gap-1 w-44">
                          <input
                            type="text"
                            value={voucherNumber}
                            onChange={(e) => setVoucherNumber(e.target.value)}
                            placeholder={controlNumber}
                            className="w-full px-2 py-0.5 text-xs font-mono font-bold text-blue-950 border-b-2 border-slate-600 focus:border-blue-700 bg-blue-50/50 outline-none transition rounded-t"
                            title="I-type ang numero gikan sa booklet slip (o ibilin nga blangko para sa auto-fill)"
                          />
                          <button
                            type="button"
                            onClick={handleGenerateVoucherNo}
                            className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded transition cursor-pointer shrink-0"
                            title="Generate PCV tracking number"
                          >
                            Auto
                          </button>
                        </div>
                      </div>

                      <div className="w-full flex items-center justify-between md:justify-end gap-1.5 text-xs">
                        <span className="font-bold text-slate-700 shrink-0 text-[11px]">Date:</span>
                        <input
                          type="date"
                          value={intakeDate}
                          onChange={(e) => setIntakeDate(e.target.value)}
                          className="w-44 px-2 py-0.5 text-xs font-semibold text-slate-800 border-b-2 border-slate-600 focus:border-blue-700 bg-blue-50/50 outline-none transition rounded-t"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Source of Fund, Payee & Address */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 bg-yellow-200/90 border-2 border-yellow-400 px-3 py-1.5 rounded-lg shadow-2xs">
                        <HeartHandshake className="h-4 w-4 text-amber-900 shrink-0" />
                        <span className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                          Source of Fund:
                        </span>
                        <select
                          value={sourceOfFund}
                          onChange={(e) => setSourceOfFund(e.target.value)}
                          className="bg-yellow-300 text-amber-950 font-black text-xs px-2 py-0.5 rounded border border-yellow-500 focus:outline-none cursor-pointer"
                        >
                          <option value="DSWD FUNDING">DSWD FUNDING</option>
                          <option value="LGU MABINI GENERAL FUND">LGU MABINI GENERAL FUND</option>
                          <option value="CALAMITY / QUICK RESPONSE">CALAMITY / QUICK RESPONSE</option>
                          <option value="TRUST FUND">TRUST FUND</option>
                        </select>
                      </div>

                      <div className="text-[10px] text-slate-500 font-medium">
                        (Palihug kumpirmaha ang pondo nga gigikanan sa tabang)
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                      <div className="sm:col-span-6 flex items-baseline gap-2">
                        <span className="font-bold text-slate-700 shrink-0 text-[11px]">Payee / Recipient:</span>
                        <input
                          type="text"
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          placeholder="Pangalan sa nakadawat o aplikante"
                          className="w-full px-2 py-1 font-black text-slate-900 border-b-2 border-slate-600 bg-transparent focus:border-blue-700 outline-none text-xs"
                        />
                      </div>

                      <div className="sm:col-span-6 flex items-baseline gap-2">
                        <span className="font-bold text-slate-700 shrink-0 text-[11px]">Address:</span>
                        <input
                          type="text"
                          value={purokSitio ? `${purokSitio}, ${getBarangayName(barangayId)}, Mabini` : `${getBarangayName(barangayId)}, Mabini`}
                          onChange={(e) => setPurokSitio(e.target.value)}
                          placeholder="Purok / Barangay, Mabini"
                          className="w-full px-2 py-1 font-semibold text-slate-800 border-b-2 border-slate-600 bg-transparent focus:border-blue-700 outline-none text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* PURPOSE / PARTICULARS (Exact 5 Pill checkboxes from physical voucher) */}
                  <div className="pt-2">
                    <div className="bg-blue-900 text-white px-3 py-1.5 rounded-t-lg flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider">
                        Purpose / Particulars (Please check):
                      </span>
                      <span className="text-[10px] text-blue-200">
                        {assistanceType === 'other' ? 'Other Support Selected' : 'Aid Category Selected'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-2.5 border-2 border-t-0 border-blue-900/30 rounded-b-lg bg-slate-50/50">
                      {/* 1. Medical Assistance */}
                      <button
                        type="button"
                        onClick={() => {
                          setAssistanceType('medical');
                          if (specificAssistance.toLowerCase().includes('support') || specificAssistance.toLowerCase().includes('funeral')) {
                            setSpecificAssistance('Medical / Treatment Assistance');
                          }
                        }}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                          assistanceType === 'medical'
                            ? 'bg-blue-100/90 border-blue-600 text-blue-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-blue-50/60'
                        }`}
                      >
                        <span className="text-base">➕</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black leading-tight">Medical Assistance</p>
                          <span className={`text-[9px] font-mono ${assistanceType === 'medical' ? 'text-blue-700 font-bold' : 'text-slate-400'}`}>
                            {assistanceType === 'medical' ? '☑ CHECKED' : '☐ Select'}
                          </span>
                        </div>
                      </button>

                      {/* 2. Burial Assistance */}
                      <button
                        type="button"
                        onClick={() => {
                          setAssistanceType('burial');
                          setSpecificAssistance('Funeral & Burial Assistance');
                        }}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                          assistanceType === 'burial'
                            ? 'bg-emerald-100/90 border-emerald-600 text-emerald-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-emerald-50/60'
                        }`}
                      >
                        <span className="text-base">🌿</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black leading-tight">Burial Assistance</p>
                          <span className={`text-[9px] font-mono ${assistanceType === 'burial' ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                            {assistanceType === 'burial' ? '☑ CHECKED' : '☐ Select'}
                          </span>
                        </div>
                      </button>

                      {/* 3. Transportation Assistance */}
                      <button
                        type="button"
                        onClick={() => {
                          setAssistanceType('food_transportation');
                          setSpecificAssistance('Transportation Fare / Stranded Assistance');
                        }}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                          assistanceType === 'food_transportation'
                            ? 'bg-amber-100/90 border-amber-600 text-amber-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-50/60'
                        }`}
                      >
                        <span className="text-base">🚌</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black leading-tight">Transportation</p>
                          <span className={`text-[9px] font-mono ${assistanceType === 'food_transportation' ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                            {assistanceType === 'food_transportation' ? '☑ CHECKED' : '☐ Select'}
                          </span>
                        </div>
                      </button>

                      {/* 4. Educational Assistance */}
                      <button
                        type="button"
                        onClick={() => {
                          setAssistanceType('educational');
                          setSpecificAssistance('School Supplies / Tuition Aid');
                        }}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                          assistanceType === 'educational'
                            ? 'bg-purple-100/90 border-purple-600 text-purple-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-purple-50/60'
                        }`}
                      >
                        <span className="text-base">🎓</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black leading-tight">Educational</p>
                          <span className={`text-[9px] font-mono ${assistanceType === 'educational' ? 'text-purple-700 font-bold' : 'text-slate-400'}`}>
                            {assistanceType === 'educational' ? '☑ CHECKED' : '☐ Select'}
                          </span>
                        </div>
                      </button>

                      {/* 5. Other Support (specify) */}
                      <div
                        onClick={() => {
                          setAssistanceType('other');
                        }}
                        className={`p-2 rounded-xl border flex flex-col justify-between transition cursor-pointer ${
                          assistanceType === 'other'
                            ? 'bg-rose-100/90 border-rose-600 text-rose-950 font-bold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-rose-50/60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">👥</span>
                          <span className="text-[11px] font-black leading-tight">Other Support:</span>
                        </div>
                        <input
                          type="text"
                          value={otherSupportText}
                          onFocus={() => setAssistanceType('other')}
                          onChange={(e) => {
                            setOtherSupportText(e.target.value);
                            setAssistanceType('other');
                            if (e.target.value.trim()) {
                              setSpecificAssistance(e.target.value.trim());
                            }
                          }}
                          placeholder="specify purpose..."
                          className="mt-1 w-full text-[10px] px-1.5 py-0.5 border-b border-slate-400 bg-white/70 focus:border-rose-600 outline-none rounded"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Specific Purpose Line */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-700 shrink-0 text-[11px]">
                      Specific Purpose / Details:
                    </span>
                    <input
                      type="text"
                      value={specificAssistance}
                      onChange={(e) => setSpecificAssistance(e.target.value)}
                      placeholder="e.g. Hemodialysis treatment, Laboratory diagnostic assistance"
                      className="w-full px-2 py-1 font-bold text-slate-800 border-b-2 border-slate-400 bg-blue-50/30 focus:border-blue-700 outline-none text-xs"
                    />
                  </div>

                  {/* VOUCHER AMOUNT TABLE (Matches physical voucher layout) */}
                  <div className="border-2 border-slate-800 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-12 bg-slate-800 text-white text-[10.5px] font-black uppercase tracking-wider py-1.5 px-3">
                      <div className="col-span-8 flex items-center justify-between">
                        <span>Amount in Words</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomWords(!isCustomWords);
                            if (!customAmountInWords) {
                              setCustomAmountInWords(autoAmountInWords);
                            }
                          }}
                          className="text-[9px] font-semibold text-blue-300 hover:text-white flex items-center gap-1 cursor-pointer bg-slate-700/80 px-1.5 py-0.5 rounded"
                          title="I-override o i-edit ang spelling sa kantidad"
                        >
                          <Edit3 className="h-3 w-3" />
                          {isCustomWords ? 'Gamita ang Auto Words' : 'I-type Manual'}
                        </button>
                      </div>
                      <div className="col-span-4 text-right">
                        <span>Amount (₱)</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 divide-x-2 divide-slate-800 bg-white">
                      {/* Left: Amount in Words */}
                      <div className="col-span-8 p-3 flex flex-col justify-center">
                        {isCustomWords ? (
                          <textarea
                            rows={2}
                            value={customAmountInWords}
                            onChange={(e) => setCustomAmountInWords(e.target.value)}
                            placeholder="I-TYPE ANG WORDS SA KANTIDAD..."
                            className="w-full p-2 text-xs font-black tracking-wide text-slate-900 border border-blue-400 rounded uppercase outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                          />
                        ) : (
                          <div>
                            <p className="text-xs sm:text-sm font-black text-slate-900 tracking-wide font-mono leading-snug">
                              {amountInWords}
                            </p>
                            <span className="text-[9.5px] text-slate-400 font-medium">
                              (Auto-generated gikan sa gi-encode nga kantidad)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right: Amount in Figures Input */}
                      <div className="col-span-4 p-3 bg-emerald-50/40 flex flex-col justify-center">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-black text-emerald-950">₱</span>
                          <input
                            type="number"
                            value={amountApproved}
                            onChange={(e) => setAmountApproved(e.target.value)}
                            placeholder="0"
                            className="w-full text-right text-base sm:text-lg font-black font-mono text-emerald-900 bg-white border-2 border-emerald-500 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
                          />
                        </div>
                        <span className="text-[9.5px] text-right text-emerald-700 font-bold mt-1">
                          Approved Assistance Grant
                        </span>
                      </div>
                    </div>

                    {/* Total Amount Bottom Row */}
                    <div className="grid grid-cols-12 divide-x-2 divide-slate-800 border-t-2 border-slate-800 bg-slate-100/90 text-xs font-black">
                      <div className="col-span-8 px-3 py-1.5 text-right uppercase tracking-wider text-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Disbursement Mode:</span>
                          <select
                            value={disbursementType}
                            onChange={(e) => setDisbursementType(e.target.value)}
                            className="bg-white border border-slate-300 rounded px-2 py-0.5 text-[11px] font-bold text-slate-800 cursor-pointer"
                          >
                            <option value="cash">Cash Pay-out (Municipal Treasury)</option>
                            <option value="guarantee_letter">Guarantee Letter (GL)</option>
                            <option value="cheque">Cheque Voucher</option>
                            <option value="food_pack">Food / In-Kind Goods</option>
                          </select>
                        </div>
                        <span className="text-xs font-black text-slate-900">Total Amount:</span>
                      </div>
                      <div className="col-span-4 px-3 py-1.5 text-right font-mono text-sm text-emerald-900 font-black">
                        ₱{(parseFloat(amountApproved) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Certification statement */}
                  <div className="text-center pt-1 text-[10.5px] text-slate-600 italic">
                    &quot;I hereby certify that the above expenses are necessary, valid and proper for official use and in accordance with existing rules and regulations.&quot;
                  </div>

                  {/* 4 Official Signatory Boxes matching paper voucher */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs pt-1">
                    <div className="p-2 rounded-xl border border-slate-300 bg-slate-50/50">
                      <span className="text-[9px] font-extrabold text-slate-500 uppercase block">Prepared by:</span>
                      <p className="font-black text-slate-900 text-[11px] mt-2">VIRGENCITA M. CHU, RSW, MPA</p>
                      <p className="text-[9.5px] text-slate-600 font-medium">MSWDO</p>
                    </div>

                    <div className="p-2 rounded-xl border border-slate-300 bg-slate-50/50">
                      <span className="text-[9px] font-extrabold text-slate-500 uppercase block">Paid by:</span>
                      <p className="font-black text-slate-900 text-[11px] mt-2">FLORITA B. BATIAO</p>
                      <p className="text-[9.5px] text-slate-600 font-medium">AO IV</p>
                    </div>

                    <div className="p-2 rounded-xl border border-slate-300 bg-slate-50/50">
                      <span className="text-[9px] font-extrabold text-slate-500 uppercase block">Approved by:</span>
                      <p className="font-black text-slate-900 text-[11px] mt-2">EMERSON L. LUEGO</p>
                      <p className="text-[9.5px] text-slate-600 font-medium">Municipal Mayor</p>
                    </div>

                    <div className="p-2 rounded-xl border border-slate-300 bg-slate-50/50">
                      <span className="text-[9px] font-extrabold text-slate-500 uppercase block">Received by (Client):</span>
                      <p className="font-black text-slate-900 text-[11px] mt-2 truncate">
                        {clientName.trim() || '____________________'}
                      </p>
                      <p className="text-[9px] text-slate-500 italic">(Signature Over Printed Name)</p>
                    </div>
                  </div>

                  {/* Voucher Footer Banner */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-200 pt-2 font-medium">
                    <span>📍 Mabini, Davao de Oro • LGU Mabini</span>
                    <span className="italic font-semibold text-slate-700">Malasakit • Pagkakaisa • Kaunlaran</span>
                  </div>
                </div>

                {/* Real-Time Daily Budget Feedback */}
                {budgetSummary && budgetSummary.hasBudgetSet && (
                  <div className="space-y-1 bg-blue-50/60 p-3 rounded-2xl border border-blue-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-semibold">Today's Remaining MSWDO Allocation:</span>
                      <span
                        className={`font-black font-mono ${
                          budgetSummary.remainingAmount > 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {formatAicsCurrency(budgetSummary.remainingAmount)}
                      </span>
                    </div>

                    {parseFloat(amountApproved || '0') > 0 && (
                      <div className="text-xs flex items-center justify-between border-t border-blue-100 pt-1.5">
                        <span className="text-slate-600">Balance after this voucher is released:</span>
                        <span
                          className={`font-black font-mono ${
                            budgetSummary.remainingAmount - parseFloat(amountApproved || '0') >= 0
                              ? 'text-teal-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {formatAicsCurrency(
                            budgetSummary.remainingAmount - parseFloat(amountApproved || '0')
                          )}
                        </span>
                      </div>
                    )}

                    {parseFloat(amountApproved || '0') > budgetSummary.remainingAmount && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-tight flex items-start gap-1.5 mt-1">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Soft Cap Warning:</strong> Nilapas sa pondo karon nga{' '}
                          {formatAicsCurrency(budgetSummary.remainingAmount)} og{' '}
                          {formatAicsCurrency(
                            parseFloat(amountApproved || '0') - budgetSummary.remainingAmount
                          )}
                          . Pwede gihapon i-proceed kon duna nay pag-tugot sa MSWDO supervisor.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* -----------------------------------------------------------------
                  PART 3: OFFICIAL MSWDO CATEGORY & TARGET CLIENT GROUP (3RD AS REQUESTED!)
                  ----------------------------------------------------------------- */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60 flex-wrap gap-2">
                  <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-white text-[11px] font-black shadow-xs">
                      3
                    </span>
                    <HeartHandshake className="h-4 w-4 text-emerald-700" />
                    Official MSWDO Category & Target Client Group
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    MSWDO Standard Matrix
                  </span>
                </div>

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

                {/* Specific Sub-Category & Beneficiary Sectors */}
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
                      Beneficiary Sectors (Cross-Cutting Sectors)
                    </label>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {AICS_SECTORS.map((sec) => {
                        const isSelected = sectors.includes(sec.id);
                        return (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => toggleSector(sec.id)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer border ${
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
                  {clientCooldown?.isUnderCooldown && (
                    <div className="mt-2 p-2.5 rounded-xl bg-rose-100/80 border border-rose-300 text-xs text-rose-900 space-y-0.5">
                      <div className="font-bold flex items-center gap-1 text-rose-800">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                        <span>3-Month Cooldown Active: {clientCooldown.daysRemaining}d left</span>
                      </div>
                      <p className="text-[10px] text-rose-700">
                        Naka-dawat niadtong {clientCooldown.lastDisbursedDate ? new Date(clientCooldown.lastDisbursedDate).toLocaleDateString() : 'recent'}. Processing as emergency exception.
                      </p>
                    </div>
                  )}
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

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                        Voucher No.
                      </span>
                      <p className="text-xs font-mono font-black text-slate-900">
                        {voucherNumber.trim() || controlNumber}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                        Source of Fund
                      </span>
                      <p className="text-xs font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded inline-block">
                        {sourceOfFund}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                      Specific Purpose
                    </span>
                    <p className="text-sm font-black text-emerald-950">
                      {specificAssistance || 'AICS Financial Grant'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-600 uppercase font-mono mt-0.5">
                      Words: {amountInWords}
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
                  onClick={() => handleSave('voucher')}
                  className="px-4 py-2.5 text-xs font-bold bg-blue-900 text-white hover:bg-blue-800 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Save record and print Municipal Petty Cash Voucher"
                >
                  <FileText className="h-3.5 w-3.5 text-blue-300" />
                  Save & Print Voucher
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleSave('gis')}
                  className="px-4 py-2.5 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Save record and print General Intake Sheet (GIS)"
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

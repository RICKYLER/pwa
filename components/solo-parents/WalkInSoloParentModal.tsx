'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Search,
  User,
  HeartHandshake,
  Users,
  CheckSquare,
  Square,
  FileCheck2,
  AlertCircle,
  Sparkles,
  Loader2,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  Camera,
  Upload,
  Eye,
  Maximize2,
  Image as ImageIcon,
} from 'lucide-react';
import type {
  Resident,
  Household,
  SoloParentRecord,
  SoloParentCategory,
  SoloParentDependent,
  SoloParentRequirementDocument,
} from '@/lib/db/schema';
import {
  compressDocumentPhoto,
  formatDocumentSize,
} from '@/lib/solo-parents/document-compressor';
import { getResidents } from '@/lib/db/residents';
import { getHouseholds } from '@/lib/db/households';
import {
  createSoloParent,
  generateSoloParentIdNumber,
  getSoloParentByResidentId,
} from '@/lib/db/solo-parents';
import { BARANGAY_REGISTRY, getBarangayName } from '@/lib/mabini-barangays';
import { getCurrentUser } from '@/lib/auth';
import { calculateAge } from '@/lib/db/vulnerability';
import { cn } from '@/lib/utils';

interface WalkInSoloParentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (created: SoloParentRecord) => void;
}

const CATEGORY_OPTIONS: { value: SoloParentCategory; label: string; desc: string }[] = [
  {
    value: 'death_of_spouse',
    label: 'Balo / Death of Spouse',
    desc: 'Due to death of spouse with minor or dependent children.',
  },
  {
    value: 'abandonment',
    label: 'Gibiyaan / Abandonment (>6 months)',
    desc: 'Spouse has abandoned family for at least 6 consecutive months.',
  },
  {
    value: 'unmarried',
    label: 'Wala Gikasal / Unmarried Parent',
    desc: 'Unmarried mother/father who kept and provides sole care for children.',
  },
  {
    value: 'legal_separation',
    label: 'Legal or De Facto Separation (>6 months)',
    desc: 'Separated from spouse for at least 6 months with custody of children.',
  },
  {
    value: 'spouse_detained',
    label: 'Napriso ang Kapikas / Spouse Detained (>3 months)',
    desc: 'Spouse is serving sentence or detained for at least 3 months.',
  },
  {
    value: 'spouse_incapacitated',
    label: 'Incapacitated / PWD Spouse',
    desc: 'Spouse has severe physical or mental disability preventing employment.',
  },
  {
    value: 'other_extenuating',
    label: 'Other Extenuating Circumstances (RA 11861)',
    desc: 'Legal guardian, foster parent, or relative providing sole care.',
  },
];

export default function WalkInSoloParentModal({
  isOpen,
  onClose,
  onSuccess,
}: WalkInSoloParentModalProps) {
  const currentUser = getCurrentUser();

  // Resident DB loading for instant search
  const [allResidents, setAllResidents] = useState<Resident[]>([]);
  const [allHouseholds, setAllHouseholds] = useState<Household[]>([]);
  const [isLoadingCensus, setIsLoadingCensus] = useState(false);

  // Search & Selected Applicant
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<Resident[]>([]);
  const [existingSoloParentWarning, setExistingSoloParentWarning] = useState<string | null>(null);

  // Form Fields
  const [idNumber, setIdNumber] = useState('');
  const [category, setCategory] = useState<SoloParentCategory>('unmarried');
  const [categoryNarrative, setCategoryNarrative] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState<number>(0);
  const [occupation, setOccupation] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('Self-employed');
  const [contactNumber, setContactNumber] = useState('');

  // Dependents List
  const [dependents, setDependents] = useState<SoloParentDependent[]>([]);

  // Manual Dependent Add
  const [manualName, setManualName] = useState('');
  const [manualBirthdate, setManualBirthdate] = useState('');
  const [manualRel, setManualRel] = useState('Son');

  // Requirements Submitted Checklist
  const [requirements, setRequirements] = useState({
    barangay_cert: true,
    birth_certificates: true,
    justification_proof: false,
    income_proof: true,
  });

  // Attached Scanned Physical Document Photos (Compressed for lightweight Supabase storage)
  const [attachedDocs, setAttachedDocs] = useState<SoloParentRequirementDocument[]>([]);
  const [isCompressingDoc, setIsCompressingDoc] = useState(false);
  const [docTypeToUpload, setDocTypeToUpload] = useState<string>('barangay_cert');
  const [compressionNotice, setCompressionNotice] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SoloParentRequirementDocument | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [manualInputError, setManualInputError] = useState<string | null>(null);

  // Section Refs for auto-scrolling to errors
  const applicantSectionRef = useRef<HTMLDivElement>(null);
  const dependentsSectionRef = useRef<HTMLDivElement>(null);
  const manualInputRef = useRef<HTMLDivElement>(null);

  // Load census records on mount
  useEffect(() => {
    if (isOpen) {
      loadCensusData();
      autoGenerateId();
      setAttachedDocs([]);
      setCompressionNotice(null);
      setPreviewDoc(null);
    }
  }, [isOpen]);

  async function autoGenerateId() {
    try {
      const generated = await generateSoloParentIdNumber();
      setIdNumber(generated);
    } catch {
      setIdNumber(`SP-${new Date().getFullYear()}-0001`);
    }
  }

  async function loadCensusData() {
    setIsLoadingCensus(true);
    try {
      const [resList, hhList] = await Promise.all([
        getResidents({ status: 'active' }),
        getHouseholds(),
      ]);
      setAllResidents(resList);
      setAllHouseholds(hhList);
    } catch (err) {
      console.error('Error loading census data:', err);
    } finally {
      setIsLoadingCensus(false);
    }
  }

  // Live filter residents by name or ID
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || selectedResident) return [];
    const q = searchQuery.toLowerCase().trim();
    return allResidents
      .filter((r) => r.full_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchQuery, allResidents, selectedResident]);

  // When a resident is selected
  async function handleSelectResident(res: Resident) {
    setSelectedResident(res);
    setSearchQuery(res.full_name);
    setContactNumber(res.contact_number || '');
    setOccupation(res.occupation || '');
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.applicant;
      return copy;
    });
    setError(null);

    // Check if already registered
    const existing = await getSoloParentByResidentId(res.id);
    if (existing) {
      setExistingSoloParentWarning(
        `Notice: ${res.full_name} is already registered under ID ${existing.id_number} (Status: ${existing.status}). Proceeding will create an updated renewal or new entry.`
      );
    } else {
      setExistingSoloParentWarning(null);
    }

    // Load household members to identify dependents
    const members = allResidents.filter(
      (m) => m.household_id === res.household_id && m.id !== res.id
    );
    setHouseholdMembers(members);

    // Auto-select children under 18 or students
    const autoDeps: SoloParentDependent[] = members
      .filter((m) => {
        const age = calculateAge(m.birthdate);
        return !isNaN(age) && age < 22;
      })
      .map((m) => {
        const age = calculateAge(m.birthdate);
        return {
          resident_id: m.id,
          full_name: m.full_name,
          birthdate: m.birthdate,
          age: isNaN(age) ? 0 : age,
          relationship: m.relationship_to_head || 'Child',
          is_studying: age <= 22,
          is_pwd: false,
        };
      });

    setDependents(autoDeps);
    if (autoDeps.length > 0) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy.dependents;
        return copy;
      });
    }
  }

  function handleClearResident() {
    setSelectedResident(null);
    setSearchQuery('');
    setHouseholdMembers([]);
    setDependents([]);
    setExistingSoloParentWarning(null);
  }

  // Toggle a household member as a dependent
  function handleToggleHouseholdMember(member: Resident) {
    const exists = dependents.find((d) => d.resident_id === member.id);
    if (exists) {
      const remaining = dependents.filter((d) => d.resident_id !== member.id);
      setDependents(remaining);
      if (remaining.length === 0) {
        setFieldErrors((prev) => ({
          ...prev,
          dependents: 'Kinahanglan og labing menos usa (1) ka anak o qualified dependent ubos sa RA 11861.',
        }));
      }
    } else {
      const age = calculateAge(member.birthdate);
      setDependents([
        ...dependents,
        {
          resident_id: member.id,
          full_name: member.full_name,
          birthdate: member.birthdate,
          age: isNaN(age) ? 0 : age,
          relationship: member.relationship_to_head || 'Child',
          is_studying: true,
          is_pwd: false,
        },
      ]);
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy.dependents;
        return copy;
      });
      setError(null);
    }
  }

  // Add manual dependent
  function handleAddManualDependent() {
    if (!manualName.trim()) {
      setManualInputError("Please enter the child's full name.");
      return;
    }
    if (!manualBirthdate) {
      setManualInputError("Please select the child's birthdate.");
      return;
    }
    const age = calculateAge(manualBirthdate);
    if (isNaN(age)) {
      setManualInputError('Invalid birthdate entered.');
      return;
    }
    setDependents([
      ...dependents,
      {
        full_name: manualName.trim(),
        birthdate: manualBirthdate,
        age: isNaN(age) ? 0 : age,
        relationship: manualRel,
        is_studying: true,
        is_pwd: false,
      },
    ]);
    setManualName('');
    setManualBirthdate('');
    setManualInputError(null);
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.dependents;
      delete copy.manualDependent;
      return copy;
    });
    setError(null);
  }

  function handleRemoveDependent(index: number) {
    const updated = dependents.filter((_, i) => i !== index);
    setDependents(updated);
    if (updated.length === 0) {
      setFieldErrors((prev) => ({
        ...prev,
        dependents: 'At least one (1) qualified dependent child is required under RA 11861.',
      }));
    }
  }

  // Process and compress files from either PC upload, drag-and-drop, or mobile camera
  async function processFiles(files: File[]) {
    if (files.length === 0) return;

    setIsCompressingDoc(true);
    setCompressionNotice(null);

    try {
      const compressedList: SoloParentRequirementDocument[] = [];
      let totalOriginal = 0;
      let totalCompressed = 0;

      for (const file of files) {
        const result = await compressDocumentPhoto(file, {
          documentType: docTypeToUpload,
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.7,
        });

        compressedList.push({
          id: result.id,
          name: result.name,
          document_type: result.document_type,
          file_url: result.file_url,
          file_size: result.file_size,
          original_size: result.original_size,
          uploaded_at: result.uploaded_at,
        });

        totalOriginal += result.original_size || 0;
        totalCompressed += result.file_size || 0;
      }

      setAttachedDocs((prev) => [...prev, ...compressedList]);

      // Auto-check corresponding physical checklist box
      if (docTypeToUpload === 'barangay_cert') {
        setRequirements((prev) => ({ ...prev, barangay_cert: true }));
      } else if (docTypeToUpload === 'birth_certificates') {
        setRequirements((prev) => ({ ...prev, birth_certificates: true }));
      } else if (docTypeToUpload === 'justification_proof') {
        setRequirements((prev) => ({ ...prev, justification_proof: true }));
      } else if (docTypeToUpload === 'income_proof') {
        setRequirements((prev) => ({ ...prev, income_proof: true }));
      }

      const savedPct =
        totalOriginal > 0
          ? Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 100)
          : 0;

      setCompressionNotice(
        `⚡ Compressed: ${formatDocumentSize(totalOriginal)} ➔ ${formatDocumentSize(
          totalCompressed
        )} (${savedPct}% space saved). Stored cleanly without database bloat.`
      );
    } catch (err) {
      console.error('Failed to compress document photo:', err);
    } finally {
      setIsCompressingDoc(false);
    }
  }

  function handleDocPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    processFiles(files);
    if (e.target) e.target.value = '';
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }

  function handleRemoveDoc(docId: string) {
    setAttachedDocs((prev) => prev.filter((d) => d.id !== docId));
  }

  // RA 11861 Subsidy Eligibility: <= ₱15,000 monthly income or minimum wage
  const isSubsidyEligible = monthlyIncome <= 15000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newFieldErrors: Record<string, string> = {};

    if (!selectedResident) {
      newFieldErrors.applicant = 'Please search and select the resident applicant from Census records above.';
    }

    let finalDependents = [...dependents];

    // Smart Auto-Add: If name and birthdate were typed but user forgot to click "+ Add":
    if (manualName.trim() && manualBirthdate) {
      const age = calculateAge(manualBirthdate);
      if (!isNaN(age)) {
        finalDependents.push({
          full_name: manualName.trim(),
          birthdate: manualBirthdate,
          age: isNaN(age) ? 0 : age,
          relationship: manualRel,
          is_studying: true,
          is_pwd: false,
        });
        setDependents(finalDependents);
        setManualName('');
        setManualBirthdate('');
        setManualInputError(null);
      }
    } else if (manualName.trim() && !manualBirthdate) {
      newFieldErrors.manualDependent = "Please enter the child's birthdate to compute age eligibility.";
    }

    if (finalDependents.length === 0) {
      newFieldErrors.dependents = 'At least one (1) qualified dependent child is required under RA 11861. Please select from household members or enter details below and click "+ Add".';
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      setError('Please review the highlighted fields in red below to complete registration.');

      // Auto-scroll to the offending section
      setTimeout(() => {
        if (newFieldErrors.applicant && applicantSectionRef.current) {
          applicantSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if ((newFieldErrors.dependents || newFieldErrors.manualDependent) && dependentsSectionRef.current) {
          dependentsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }

    if (!selectedResident) return;

    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const now = new Date();
      const oneYearLater = new Date(now);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

      // Find household for address
      const hh = allHouseholds.find((h) => h.id === selectedResident.household_id);

      const created = await createSoloParent({
        id_number: idNumber.trim() || `SP-${now.getFullYear()}-0001`,
        resident_id: selectedResident.id,
        household_id: selectedResident.household_id,
        full_name: selectedResident.full_name,
        first_name: selectedResident.first_name,
        middle_name: selectedResident.middle_name,
        last_name: selectedResident.last_name,
        birthdate: selectedResident.birthdate,
        age: calculateAge(selectedResident.birthdate) || 0,
        gender: selectedResident.gender,
        civil_status: selectedResident.civil_status,
        contact_number: contactNumber.trim() || selectedResident.contact_number,
        barangay_id: hh?.barangay_id || 'cadunan',
        purok_sitio: hh?.purok_sitio || '',
        street_address: hh?.street_address || '',

        category,
        category_narrative: categoryNarrative.trim(),
        monthly_income: Number(monthlyIncome) || 0,
        is_minimum_wage_or_below: isSubsidyEligible,
        occupation: occupation.trim(),
        employment_status: employmentStatus,

        dependents,
        requirements: {
          ...requirements,
          documents: attachedDocs,
        },

        issued_at: now.toISOString().slice(0, 10),
        expires_at: oneYearLater.toISOString().slice(0, 10),
        encoder_id: currentUser?.id,
        encoder_name: currentUser?.name || 'MSWDO Desk Officer',
        notes: notes.trim(),
        status: 'active',
      });

      onSuccess(created);
      onClose();
    } catch (err: any) {
      console.error('Failed to create solo parent record:', err);
      setError(err?.message || 'Failed to register solo parent. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-teal-900 to-cyan-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-teal-200 border border-white/20">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Walk-In Solo Parent Registration</h2>
              <p className="text-xs text-teal-100/80">
                RA 11861 Expanded Solo Parents Welfare Intake Desk
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {existingSoloParentWarning && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <span>{existingSoloParentWarning}</span>
            </div>
          )}

          {/* Section 1: Resident Search & Applicant Profile */}
          <div
            ref={applicantSectionRef}
            className={cn(
              'rounded-xl border p-4 space-y-3 transition-all duration-300',
              fieldErrors.applicant
                ? 'border-2 border-rose-500 bg-rose-50/70 ring-4 ring-rose-200/80 shadow-md'
                : 'border-slate-200/90 bg-slate-50/70'
            )}
          >
            <div className="flex items-center justify-between">
              <label
                className={cn(
                  'text-xs font-bold uppercase tracking-wider flex items-center gap-2',
                  fieldErrors.applicant ? 'text-rose-800' : 'text-slate-800'
                )}
              >
                <User className={cn('h-4 w-4', fieldErrors.applicant ? 'text-rose-600' : 'text-teal-700')} />
                1. Applicant Information (Census Search)
              </label>
              {selectedResident && (
                <button
                  type="button"
                  onClick={handleClearResident}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                >
                  Change Applicant
                </button>
              )}
            </div>

            {fieldErrors.applicant && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-100/90 border border-rose-300 px-3 py-2 text-xs font-bold text-rose-800 animate-in fade-in">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{fieldErrors.applicant}</span>
              </div>
            )}

            {!selectedResident ? (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type applicant full name to search Census records..."
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  {isLoadingCensus && (
                    <Loader2 className="absolute right-3.5 top-3 h-4 w-4 animate-spin text-teal-600" />
                  )}
                </div>

                {/* Dropdown Results */}
                {searchResults.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {searchResults.map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => handleSelectResident(res)}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs hover:bg-teal-50 transition"
                      >
                        <div>
                          <p className="font-bold text-slate-800">{res.full_name}</p>
                          <p className="text-[11px] text-slate-500">
                            Birthdate: {res.birthdate} ({calculateAge(res.birthdate)} y/o) • {res.gender === 'F' ? 'Female' : 'Male'} • Civil Status: {res.civil_status || 'Unspecified'}
                          </p>
                        </div>
                        <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                          Select
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.trim().length > 1 && searchResults.length === 0 && !isLoadingCensus && (
                  <p className="text-[11px] text-slate-500 italic mt-1.5">
                    No resident found with that name. Please check spelling or verify household registration.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-teal-200 bg-teal-50/50 p-3 text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 font-medium">Full Name:</span>
                  <p className="font-bold text-slate-900">{selectedResident.full_name}</p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-medium">Age & Gender:</span>
                  <p className="font-bold text-slate-900">
                    {calculateAge(selectedResident.birthdate)} y/o ({selectedResident.gender === 'F' ? 'Female' : 'Male'})
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-medium">Civil Status:</span>
                  <p className="font-bold text-slate-900 capitalize">
                    {selectedResident.civil_status || 'Single / Unmarried'}
                  </p>
                </div>
              </div>
            )}

            {/* Contact & Occupation Inputs */}
            {selectedResident && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700">Contact Number</label>
                  <input
                    type="text"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. 0912 345 6789"
                    className="w-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700">Occupation</label>
                  <input
                    type="text"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="e.g. Vendor, Farmer, Housewife"
                    className="w-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 2: RA 11861 Category & Subsidy Assessment */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 space-y-4">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-700" />
              2. RA 11861 Solo Parent Assessment
            </label>

            <div>
              <label className="text-xs font-semibold text-slate-700">
                Solo Parent Category (Legal Basis) <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SoloParentCategory)}
                className="w-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                {CATEGORY_OPTIONS.find((c) => c.value === category)?.desc}
              </p>
            </div>

            {/* Income & Subsidy Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Monthly Income (PHP) <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 py-1.5 text-xs font-bold text-slate-800 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Assigned Solo Parent ID #</label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono font-bold text-teal-800 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Dynamic Subsidy Badge */}
            <div
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                isSubsidyEligible
                  ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
                  : 'border-slate-200 bg-slate-100 text-slate-700'
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  isSubsidyEligible ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'
                }`}
              >
                <DollarSign className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold">
                  {isSubsidyEligible
                    ? 'Eligible for ₱1,000 Monthly Cash Subsidy (RA 11861)'
                    : 'Standard Solo Parent Benefits Only (Discounts, Leave, Subsidies)'}
                </p>
                <p className="text-[11px] opacity-80">
                  {isSubsidyEligible
                    ? 'Applicant earns minimum wage or below (₱15,000/mo or less). Entitled to municipal/national financial subsidy.'
                    : 'Applicant earns above minimum wage threshold. Entitled to 7-day parental leave, tax discount, and education priority.'}
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Qualified Dependents (<18 or in school) */}
          <div
            ref={dependentsSectionRef}
            className={cn(
              'rounded-xl border p-4 space-y-3 transition-all duration-300',
              fieldErrors.dependents || fieldErrors.manualDependent
                ? 'border-2 border-rose-500 bg-rose-50/70 ring-4 ring-rose-200/80 shadow-md'
                : 'border-slate-200/90 bg-slate-50/70'
            )}
          >
            <div className="flex items-center justify-between">
              <label
                className={cn(
                  'text-xs font-bold uppercase tracking-wider flex items-center gap-2',
                  fieldErrors.dependents || fieldErrors.manualDependent ? 'text-rose-800' : 'text-slate-800'
                )}
              >
                <Users
                  className={cn(
                    'h-4 w-4',
                    fieldErrors.dependents || fieldErrors.manualDependent ? 'text-rose-600' : 'text-teal-700'
                  )}
                />
                3. Qualified Dependent Children ({dependents.length})
              </label>
              {dependents.length > 0 && (
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-800">
                  {dependents.length} {dependents.length === 1 ? 'dependent' : 'dependents'} added
                </span>
              )}
            </div>

            {/* Prominent Error Banner when Dependents are missing */}
            {fieldErrors.dependents && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-100/90 p-3 text-xs font-bold text-rose-800 animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <div>
                  <p>{fieldErrors.dependents}</p>
                  {manualName.trim() && (
                    <p className="text-[11px] font-semibold text-rose-900 mt-1">
                      👉 You entered the name <u>"{manualName.trim()}"</u> below. Please click the green <strong>'+ Add'</strong> button to officially include this child on the card!
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Household members checkable list */}
            {householdMembers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-600">
                  Select from Household Members in Census:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {householdMembers.map((m) => {
                    const isChecked = dependents.some((d) => d.resident_id === m.id);
                    const age = calculateAge(m.birthdate);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleToggleHouseholdMember(m)}
                        className={`flex items-center gap-2.5 rounded-lg border p-2 text-left text-xs transition ${
                          isChecked
                            ? 'border-teal-400 bg-teal-50/90 text-teal-950 font-semibold shadow-xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-teal-700 shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <div className="truncate">
                          <p className="truncate">{m.full_name}</p>
                          <p className="text-[10px] text-slate-500">
                            {isNaN(age) ? 'Age N/A' : `${age} y/o`} • {m.relationship_to_head || 'Member'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Currently Selected Dependents Summary */}
            {dependents.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] font-bold text-slate-700 mb-1.5">
                  Confirmed Dependents to Print on Card:
                </p>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {dependents.map((dep, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{dep.full_name}</span>
                        <span className="text-[11px] text-slate-500">
                          ({dep.age} y/o • Born: {dep.birthdate} • {dep.relationship})
                        </span>
                        {dep.age >= 18 && (
                          <span className="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800">
                            Age {dep.age} (Verify Student/PWD)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDependent(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Remove dependent"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Manual Dependent Row */}
            <div
              ref={manualInputRef}
              className={cn(
                'pt-3 border-t rounded-xl p-3 transition-all',
                fieldErrors.manualDependent || manualInputError
                  ? 'border border-rose-300 bg-rose-100/60 ring-2 ring-rose-200'
                  : 'border-slate-200/80 bg-white/60'
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p
                  className={cn(
                    'text-[11px] font-bold',
                    fieldErrors.manualDependent || manualInputError ? 'text-rose-900' : 'text-slate-700'
                  )}
                >
                  Add Dependent Not in Household:
                </p>
                {(fieldErrors.manualDependent || manualInputError) && (
                  <span className="text-[11px] font-bold text-rose-700 flex items-center gap-1 animate-in fade-in">
                    <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                    {fieldErrors.manualDependent || manualInputError}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Child's full name"
                  value={manualName}
                  onChange={(e) => {
                    setManualName(e.target.value);
                    if (e.target.value.trim()) {
                      setManualInputError(null);
                    }
                  }}
                  className={cn(
                    'flex-1 min-w-[140px] rounded-lg border bg-white px-2.5 py-2 text-xs focus:outline-none transition',
                    manualInputError && !manualName.trim()
                      ? 'border-rose-500 ring-2 ring-rose-300'
                      : 'border-slate-200 focus:border-teal-500'
                  )}
                />
                <input
                  type="date"
                  value={manualBirthdate}
                  onChange={(e) => {
                    setManualBirthdate(e.target.value);
                    if (e.target.value) {
                      setManualInputError(null);
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.manualDependent;
                        return copy;
                      });
                    }
                  }}
                  className={cn(
                    'rounded-lg border bg-white px-2.5 py-2 text-xs focus:outline-none transition',
                    (manualInputError || fieldErrors.manualDependent) && !manualBirthdate
                      ? 'border-rose-500 ring-2 ring-rose-300'
                      : 'border-slate-200 focus:border-teal-500'
                  )}
                />
                <select
                  value={manualRel}
                  onChange={(e) => setManualRel(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-teal-500 focus:outline-none"
                >
                  <option value="Son">Son</option>
                  <option value="Daughter">Daughter</option>
                  <option value="Ward">Ward</option>
                  <option value="Foster Child">Foster Child</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddManualDependent}
                  className={cn(
                    'rounded-lg px-4 py-2 text-xs font-bold text-white transition flex items-center gap-1.5 shadow-sm',
                    manualName.trim()
                      ? 'bg-teal-700 hover:bg-teal-600 ring-2 ring-teal-400 font-extrabold animate-pulse'
                      : 'bg-teal-800 hover:bg-teal-700'
                  )}
                  title="Click to add this dependent to the card"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Physical Requirements Submitted */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-teal-700" />
              4. Physical Requirements Submitted (Walk-In Checklist)
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={requirements.barangay_cert}
                  onChange={(e) =>
                    setRequirements({ ...requirements, barangay_cert: e.target.checked })
                  }
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span className="font-medium text-slate-700">Barangay Cert of Solo Parent / Residency</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={requirements.birth_certificates}
                  onChange={(e) =>
                    setRequirements({ ...requirements, birth_certificates: e.target.checked })
                  }
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span className="font-medium text-slate-700">PSA Birth Certificates of Children</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={requirements.justification_proof}
                  onChange={(e) =>
                    setRequirements({ ...requirements, justification_proof: e.target.checked })
                  }
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span className="font-medium text-slate-700">Death Cert / Blotter / Court Order / Affidavit</span>
              </label>

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={requirements.income_proof}
                  onChange={(e) =>
                    setRequirements({ ...requirements, income_proof: e.target.checked })
                  }
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span className="font-medium text-slate-700">Proof of Income / Cert of Indigency</span>
              </label>
            </div>

            {/* Scanned Document Photos / Camera Upload (Auto-Compressed) */}
            <div className="pt-2 border-t border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-teal-700" />
                  Attach Scanned Photo of Physical Documents
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-medium">
                  ⚡ Auto-Compressed for Database Efficiency
                </span>
              </div>

              {/* Upload bar with Document Type selector & Dual PC/Mobile actions */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleFileDrop}
                className={cn(
                  'flex flex-col gap-2 p-3 rounded-xl border transition-all',
                  isDraggingFile
                    ? 'border-teal-500 bg-teal-50/80 ring-2 ring-teal-400'
                    : 'border-slate-200 bg-white shadow-2xs'
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={docTypeToUpload}
                    onChange={(e) => setDocTypeToUpload(e.target.value)}
                    className="text-xs rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-medium text-slate-700 focus:border-teal-500 focus:outline-none"
                  >
                    <option value="barangay_cert">📄 Barangay Certificate</option>
                    <option value="birth_certificates">👶 PSA Birth Certificate</option>
                    <option value="justification_proof">⚖️ Death / Blotter / Court Order</option>
                    <option value="income_proof">💵 Proof of Income / Indigency</option>
                    <option value="other">📎 Other Supporting Document</option>
                  </select>

                  {/* Option 1: Upload from PC / Scanner file */}
                  <label className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-xs">
                    <Upload className="w-3.5 h-3.5 text-teal-400" />
                    <span>Upload from PC / File</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      disabled={isCompressingDoc}
                      onChange={handleDocPhotoUpload}
                      className="hidden"
                    />
                  </label>

                  {/* Option 2: Mobile / Tablet Camera Capture */}
                  <label className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-xs">
                    <Camera className="w-3.5 h-3.5" />
                    <span>Take Camera Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      disabled={isCompressingDoc}
                      onChange={handleDocPhotoUpload}
                      className="hidden"
                    />
                  </label>

                  {isCompressingDoc && (
                    <span className="text-xs text-teal-700 font-semibold flex items-center gap-1 animate-pulse ml-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Compressing file...
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 pt-0.5 border-t border-slate-100">
                  <span>💻 <strong>PC Users:</strong> Click <em>&ldquo;Upload from PC / File&rdquo;</em> to pick files, or drag &amp; drop document scans directly into this box.</span>
                </div>
              </div>

              {/* Compression Success Notice */}
              {compressionNotice && (
                <div className="text-[10px] text-emerald-800 bg-emerald-50/90 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <span>{compressionNotice}</span>
                  <button
                    type="button"
                    onClick={() => setCompressionNotice(null)}
                    className="text-emerald-600 hover:text-emerald-900 text-xs font-bold"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Uploaded Documents Grid */}
              {attachedDocs.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                  {attachedDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="group relative rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs hover:shadow-sm transition-all"
                    >
                      <div className="h-24 w-full bg-slate-100 relative overflow-hidden flex items-center justify-center">
                        <img
                          src={doc.file_url}
                          alt={doc.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="p-1.5 bg-white text-slate-900 rounded-lg shadow-sm hover:bg-slate-100 cursor-pointer"
                            title="Preview Full Size"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDoc(doc.id)}
                            className="p-1.5 bg-rose-600 text-white rounded-lg shadow-sm hover:bg-rose-700 cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-2">
                        <p className="text-[10px] font-bold text-slate-800 truncate" title={doc.name}>
                          {doc.name}
                        </p>
                        <div className="flex items-center justify-between text-[9px] text-slate-500 mt-0.5">
                          <span className="uppercase font-semibold text-teal-700">
                            {doc.document_type?.replace('_', ' ') || 'Document'}
                          </span>
                          <span className="font-mono">{formatDocumentSize(doc.file_size)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600">Casework Notes / Observations</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes regarding the intake interview, special needs of children, etc."
                className="w-full mt-1 rounded-lg border border-slate-200 bg-white p-2 text-xs focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-teal-800 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving & Generating ID...
                </>
              ) : (
                <>
                  <HeartHandshake className="h-4 w-4" />
                  Issue & Register Solo Parent
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Lightbox for Document Scan Full Screen Preview */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/85 p-3 sm:p-5 backdrop-blur-sm">
          <div className="relative max-w-3xl w-full max-h-[92vh] bg-white rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <p className="text-xs font-bold truncate max-w-md">{previewDoc.name}</p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {formatDocumentSize(previewDoc.file_size)} · Compressed Photo Scan ({previewDoc.document_type?.replace('_', ' ')})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-100 min-h-[300px]">
              <img
                src={previewDoc.file_url}
                alt={previewDoc.name}
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

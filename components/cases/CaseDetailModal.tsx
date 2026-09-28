'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Calendar,
  User,
  MapPin,
  Phone,
  FileText,
  Paperclip,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Trash2,
  Plus,
  Loader2,
  Lock,
  ExternalLink,
  Users,
  Search,
  Printer,
} from 'lucide-react';
import type {
  CaseRecord,
  CaseAttachment,
  CaseNote,
  CaseStatus,
  CaseAttachmentType,
  Resident,
} from '@/lib/db/schema';
import {
  getCase,
  updateCase,
  getCaseAttachments,
  addCaseAttachment,
  deleteCaseAttachment,
  getCaseNotes,
  addCaseNote,
} from '@/lib/db/cases';
import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import { getCurrentUser } from '@/lib/auth';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import CaseIntakeSheetTab from '@/components/cases/CaseIntakeSheetTab';
import { cn } from '@/lib/utils';

interface CaseDetailModalProps {
  isOpen: boolean;
  caseId: string | null;
  onClose: () => void;
  onCaseUpdated?: () => void;
}

export default function CaseDetailModal({
  isOpen,
  caseId,
  onClose,
  onCaseUpdated,
}: CaseDetailModalProps) {
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [attachments, setAttachments] = useState<CaseAttachment[]>([]);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'intake_sheet' | 'attachments' | 'notes' | 'census'
  >('overview');
  const [isLoading, setIsLoading] = useState(false);

  // New Note state
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteAction, setNewNoteAction] = useState('');
  const [newNoteFollowUp, setNewNoteFollowUp] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Attachment upload state
  const [uploadDocType, setUploadDocType] = useState<CaseAttachmentType>('intake_sheet');
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Census Linking state
  const [linkedResident, setLinkedResident] = useState<Resident | null>(null);
  const [censusSearchQuery, setCensusSearchQuery] = useState('');
  const [censusSearchResults, setCensusSearchResults] = useState<Resident[]>([]);
  const [isSearchingCensus, setIsSearchingCensus] = useState(false);

  const currentUser = getCurrentUser();

  useEffect(() => {
    if (isOpen && caseId) {
      loadCaseData(caseId);
    } else {
      setCaseRecord(null);
      setAttachments([]);
      setNotes([]);
      setLinkedResident(null);
    }
  }, [isOpen, caseId]);

  async function loadCaseData(id: string) {
    setIsLoading(true);
    try {
      const record = await getCase(id);
      if (record) {
        setCaseRecord(record);
        const [atts, nts] = await Promise.all([
          getCaseAttachments(id),
          getCaseNotes(id),
        ]);
        setAttachments(atts);
        setNotes(nts);

        // Check if linked to resident
        if (record.resident_id) {
          const res = await db.get<Resident>(STORE_NAMES.residents, record.resident_id);
          if (res) setLinkedResident(res);
        } else {
          // Attempt auto-search in Census by victim name
          autoSearchCensus(record.victim_name);
        }
      }
    } catch (err) {
      console.error('Error loading case folder:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function autoSearchCensus(victimName: string) {
    if (!victimName) return;
    try {
      const allResidents = await db.getAll<Resident>(STORE_NAMES.residents);
      const cleanName = victimName.toLowerCase().trim();
      const match = allResidents.find(
        (r) =>
          r.first_name?.toLowerCase().includes(cleanName) ||
          r.last_name?.toLowerCase().includes(cleanName) ||
          `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase().includes(cleanName),
      );
      if (match) {
        setLinkedResident(match);
      }
    } catch (err) {
      console.error('Error auto-matching census resident:', err);
    }
  }

  async function handleStatusChange(newStatus: CaseStatus) {
    if (!caseRecord) return;
    try {
      const updated = await updateCase(caseRecord.id, { status: newStatus });
      setCaseRecord(updated);
      onCaseUpdated?.();
    } catch (err) {
      console.error('Failed to update case status:', err);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!caseRecord || !newNoteText.trim()) return;

    setIsSavingNote(true);
    try {
      const note = await addCaseNote(caseRecord.id, {
        worker_id: currentUser?.id,
        worker_name: currentUser?.name || 'Social Worker',
        date: new Date().toISOString().slice(0, 10),
        note: newNoteText.trim(),
        action_taken: newNoteAction.trim() || undefined,
        next_follow_up: newNoteFollowUp.trim() || undefined,
      });

      setNotes((prev) => [note, ...prev]);
      setNewNoteText('');
      setNewNoteAction('');
      setNewNoteFollowUp('');
      onCaseUpdated?.();
    } catch (err) {
      console.error('Error adding case note:', err);
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !caseRecord) return;

    setIsUploadingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const fileUrl = reader.result as string;
        const newAtt = await addCaseAttachment(caseRecord.id, {
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          file_url: fileUrl,
          document_type: uploadDocType,
          uploaded_by: currentUser?.name || 'Social Worker',
        });
        setAttachments((prev) => [newAtt, ...prev]);
        setIsUploadingFile(false);
        onCaseUpdated?.();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to attach file:', err);
      setIsUploadingFile(false);
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!confirm('Are you sure you want to remove this attached file?')) return;
    try {
      await deleteCaseAttachment(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      onCaseUpdated?.();
    } catch (err) {
      console.error('Error deleting attachment:', err);
    }
  }

  async function handleSearchCensus(q: string) {
    setCensusSearchQuery(q);
    if (!q.trim()) {
      setCensusSearchResults([]);
      return;
    }
    setIsSearchingCensus(true);
    try {
      const all = await db.getAll<Resident>(STORE_NAMES.residents);
      const clean = q.toLowerCase().trim();
      const results = all.filter((r) => {
        const fullName = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
        return fullName.includes(clean);
      });
      setCensusSearchResults(results.slice(0, 5));
    } finally {
      setIsSearchingCensus(false);
    }
  }

  async function handleLinkResident(resident: Resident) {
    if (!caseRecord) return;
    try {
      const updated = await updateCase(caseRecord.id, {
        resident_id: resident.id,
        household_id: resident.household_id,
      });
      setCaseRecord(updated);
      setLinkedResident(resident);
      setCensusSearchResults([]);
      setCensusSearchQuery('');
      onCaseUpdated?.();
    } catch (err) {
      console.error('Failed to link resident:', err);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Header */}
        <div className="flex flex-col border-b border-slate-200 bg-slate-50/90 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white font-mono font-bold shadow-sm">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold font-mono text-slate-900">
                    {caseRecord?.case_number || 'Loading Case...'}
                  </h2>
                  {caseRecord && (
                    <span
                      className={cn(
                        'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider',
                        caseRecord.case_type.includes('rape')
                          ? 'bg-rose-100 text-rose-800'
                          : caseRecord.case_type.includes('vac')
                            ? 'bg-amber-100 text-amber-800'
                            : caseRecord.case_type.includes('vawc')
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800',
                      )}
                    >
                      {caseRecord.case_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reported on {caseRecord?.reported_at} • Brgy. {caseRecord?.barangay_id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Quick Print Official GIS */}
              {caseRecord && (
                <button
                  type="button"
                  onClick={() => printGeneralIntakeSheet(caseRecord)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition"
                  title="Print Official 2-Page General Intake Sheet (GIS)"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Print GIS</span>
                </button>
              )}

              {/* Status Selector */}
              {caseRecord && (
                <select
                  value={caseRecord.status}
                  onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
                  aria-label="Case Status"
                  className={cn(
                    'text-xs font-bold rounded-xl px-3 py-1.5 border shadow-sm transition outline-none cursor-pointer',
                    caseRecord.status === 'active' && 'bg-amber-50 border-amber-200 text-amber-800',
                    caseRecord.status === 'under_bpo_tpo' && 'bg-indigo-50 border-indigo-200 text-indigo-800',
                    caseRecord.status === 'referred_pnp_wcpd' && 'bg-sky-50 border-sky-200 text-sky-800',
                    caseRecord.status === 'filed_in_court' && 'bg-violet-50 border-violet-200 text-violet-800',
                    caseRecord.status === 'resolved_closed' && 'bg-emerald-50 border-emerald-200 text-emerald-800',
                    caseRecord.status === 'monitoring' && 'bg-teal-50 border-teal-200 text-teal-800',
                  )}
                >
                  <option value="active">Active Case</option>
                  <option value="under_bpo_tpo">Under BPO / TPO</option>
                  <option value="referred_pnp_wcpd">Referred to PNP-WCPD</option>
                  <option value="filed_in_court">Filed in Court</option>
                  <option value="resolved_closed">Resolved / Closed</option>
                  <option value="monitoring">Monitoring</option>
                </select>
              )}

              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Confidentiality Alert Ribbon */}
          <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 text-[11px] font-semibold">
            <Shield className="h-3.5 w-3.5 text-amber-700 flex-shrink-0" />
            <span>CONFIDENTIAL CASE RECORD • Protected under RA 9262, RA 7610 & Data Privacy Act of 2012</span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 mt-4 -mb-4 border-b border-slate-200 text-xs font-semibold overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                'px-4 py-2.5 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap',
                activeTab === 'overview'
                  ? 'border-amber-600 text-amber-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              <FileText className="h-4 w-4" />
              Case Overview
            </button>
            <button
              onClick={() => setActiveTab('intake_sheet')}
              className={cn(
                'px-4 py-2.5 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap',
                activeTab === 'intake_sheet'
                  ? 'border-amber-600 text-amber-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              <FileText className="h-4 w-4 text-amber-600" />
              General Intake Sheet (GIS)
            </button>
            <button
              onClick={() => setActiveTab('attachments')}
              className={cn(
                'px-4 py-2.5 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap',
                activeTab === 'attachments'
                  ? 'border-amber-600 text-amber-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              <Paperclip className="h-4 w-4" />
              Scanned Files & BPO ({attachments.length})
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={cn(
                'px-4 py-2.5 border-b-2 transition flex items-center gap-1.5',
                activeTab === 'notes'
                  ? 'border-amber-600 text-amber-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              <Clock className="h-4 w-4" />
              Progress Notes ({notes.length})
            </button>
            <button
              onClick={() => setActiveTab('census')}
              className={cn(
                'px-4 py-2.5 border-b-2 transition flex items-center gap-1.5',
                activeTab === 'census'
                  ? 'border-amber-600 text-amber-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              <Users className="h-4 w-4" />
              Census Profile {linkedResident ? '✓' : ''}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mb-2 text-amber-600" />
              <p className="text-sm">Loading case folder details...</p>
            </div>
          ) : !caseRecord ? (
            <div className="text-center py-16 text-slate-400">Case record not found.</div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Parties Card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Victim Profile */}
                    <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
                        <User className="h-4 w-4" />
                        Victim / Complainant Profile
                      </div>
                      <p className="text-base font-bold text-slate-900">{caseRecord.victim_name}</p>
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>
                          <span className="font-semibold text-slate-700">Age & Gender:</span>{' '}
                          {caseRecord.victim_age ? `${caseRecord.victim_age} yrs old` : 'Not specified'} •{' '}
                          {caseRecord.victim_gender === 'F' ? 'Female' : 'Male'}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Barangay:</span>{' '}
                          <span className="capitalize">{caseRecord.barangay_id}</span>
                          {caseRecord.victim_address ? `, ${caseRecord.victim_address}` : ''}
                        </p>
                        {caseRecord.victim_contact && (
                          <p>
                            <span className="font-semibold text-slate-700">Contact:</span> {caseRecord.victim_contact}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Perpetrator Profile */}
                    <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/40 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-800">
                        <AlertTriangle className="h-4 w-4" />
                        Alleged Perpetrator / Respondent
                      </div>
                      <p className="text-base font-bold text-slate-900">
                        {caseRecord.perpetrator_name || 'Unidentified / Unknown'}
                      </p>
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>
                          <span className="font-semibold text-slate-700">Relationship to Victim:</span>{' '}
                          {caseRecord.perpetrator_relationship || 'Not specified'}
                        </p>
                        {caseRecord.perpetrator_address && (
                          <p>
                            <span className="font-semibold text-slate-700">Known Address:</span>{' '}
                            {caseRecord.perpetrator_address}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Incident Summary */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Incident Narrative & Details
                    </h3>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {caseRecord.case_summary || 'No incident narrative recorded.'}
                    </p>
                    {caseRecord.incident_date && (
                      <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                        Estimated Incident Date: {caseRecord.incident_date}
                      </p>
                    )}
                  </div>

                  {/* Intake & Case Worker Notes */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Initial Intake & Actions Taken
                    </h3>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {caseRecord.intake_notes || 'No initial intake notes recorded.'}
                    </p>
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                      <span>Assigned Social Worker: <strong>{caseRecord.assigned_worker_name || 'MSWDO Staff'}</strong></span>
                      <span>Source: {caseRecord.source === 'excel_import' ? 'Excel Import' : 'Direct Intake'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: GENERAL INTAKE SHEET (GIS) */}
              {activeTab === 'intake_sheet' && caseRecord && (
                <CaseIntakeSheetTab
                  caseRecord={caseRecord}
                  onCaseUpdated={(updated) => {
                    setCaseRecord(updated);
                    onCaseUpdated?.();
                  }}
                />
              )}

              {/* TAB 2: SCANNED ATTACHMENTS */}
              {activeTab === 'attachments' && (
                <div className="space-y-6">
                  {/* File Upload Box */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Upload Scanned Document / Photo
                    </h3>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <select
                        value={uploadDocType}
                        onChange={(e) => setUploadDocType(e.target.value as CaseAttachmentType)}
                        aria-label="Document Type"
                        className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                      >
                        <option value="intake_sheet">Intake Sheet / Assessment Form</option>
                        <option value="bpo_tpo">Barangay Protection Order (BPO / TPO)</option>
                        <option value="medico_legal">Medico-Legal Certificate</option>
                        <option value="pnp_blotter">PNP Police Blotter</option>
                        <option value="court_order">Court Order / Subpoena</option>
                        <option value="progress_report">Social Case Study Report (SCSR)</option>
                        <option value="other">Other Document / Photo</option>
                      </select>

                      <label className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 shadow-sm cursor-pointer transition">
                        {isUploadingFile ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Choose File to Attach
                        <input
                          type="file"
                          onChange={handleFileUpload}
                          disabled={isUploadingFile}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Scanned PDF, photos, and files are stored securely in local encrypted storage.
                    </p>
                  </div>

                  {/* Attachments List */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Attached Files ({attachments.length})
                    </h3>
                    {attachments.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400 border border-dashed rounded-xl">
                        No scanned documents attached yet. Upload BPO, Medico-legal, or Police blotter above.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-sm transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 flex-shrink-0">
                                <FileText className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{att.file_name}</p>
                                <p className="text-[10px] text-slate-500 capitalize">
                                  {att.document_type.replace(/_/g, ' ')} • {new Date(att.uploaded_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <a
                                href={att.file_url}
                                download={att.file_name}
                                className="p-1.5 text-slate-400 hover:text-amber-700 rounded-lg hover:bg-slate-100 transition"
                                title="Download / Open"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                              <button
                                onClick={() => handleDeleteAttachment(att.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition"
                                title="Delete Attachment"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: PROGRESS NOTES */}
              {activeTab === 'notes' && (
                <div className="space-y-6">
                  {/* New Note Form */}
                  <form onSubmit={handleAddNote} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Add Progress / Follow-Up Note
                    </h3>
                    <textarea
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Enter follow-up observations, counseling notes, or home visit summary..."
                      rows={3}
                      required
                      className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none resize-none bg-white"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={newNoteAction}
                        onChange={(e) => setNewNoteAction(e.target.value)}
                        placeholder="Action taken (e.g. Endorsed to WCPD, Home visit done)"
                        className="p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                      />
                      <input
                        type="date"
                        value={newNoteFollowUp}
                        onChange={(e) => setNewNoteFollowUp(e.target.value)}
                        placeholder="Next follow-up date"
                        className="p-2.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSavingNote || !newNoteText.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
                      >
                        {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Save Progress Note
                      </button>
                    </div>
                  </form>

                  {/* Notes Timeline */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Casework Timeline ({notes.length})
                    </h3>
                    {notes.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400 border border-dashed rounded-xl">
                        No progress notes recorded yet. Add follow-up notes using the form above.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notes.map((n) => (
                          <div
                            key={n.id}
                            className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-900">{n.worker_name}</span>
                              <span className="text-slate-400">{n.date}</span>
                            </div>
                            <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                              {n.note}
                            </p>
                            {(n.action_taken || n.next_follow_up) && (
                              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-4 text-[11px] text-slate-600">
                                {n.action_taken && (
                                  <span>
                                    <strong>Action:</strong> {n.action_taken}
                                  </span>
                                )}
                                {n.next_follow_up && (
                                  <span className="text-amber-800 font-semibold">
                                    Next Follow-up: {n.next_follow_up}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: CENSUS INTEGRATION */}
              {activeTab === 'census' && (
                <div className="space-y-6">
                  {linkedResident ? (
                    <div className="p-5 rounded-2xl border border-cyan-200 bg-cyan-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-cyan-900 uppercase">
                          <CheckCircle2 className="h-4 w-4 text-cyan-600" />
                          Matched Census Resident Record
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-200 text-cyan-800">
                          Census Linked
                        </span>
                      </div>
                      <p className="text-base font-bold text-slate-900">
                        {linkedResident.first_name} {linkedResident.last_name}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                        <p>
                          <span className="font-semibold">Civil Status:</span>{' '}
                          <span className="capitalize">{linkedResident.civil_status}</span>
                        </p>
                        <p>
                          <span className="font-semibold">Occupation:</span> {linkedResident.occupation || 'None / Homemaker'}
                        </p>
                        <p>
                          <span className="font-semibold">Birthdate:</span> {linkedResident.birthdate}
                        </p>
                        <p>
                          <span className="font-semibold">Relationship to Head:</span>{' '}
                          <span className="capitalize">{linkedResident.relationship_to_head || 'Head'}</span>
                        </p>
                        <p>
                          <span className="font-semibold">Census Verification:</span>{' '}
                          <span className="capitalize">{linkedResident.verification_status}</span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Link with Barangay Census</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Search Mabini Census records to link demographic and household background to this case.
                        </p>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={censusSearchQuery}
                          onChange={(e) => handleSearchCensus(e.target.value)}
                          placeholder="Search resident by first or last name..."
                          className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                        />
                      </div>

                      {censusSearchResults.length > 0 && (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                          {censusSearchResults.map((r) => (
                            <div
                              key={r.id}
                              className="p-3 flex items-center justify-between hover:bg-slate-50 transition"
                            >
                              <div>
                                <p className="text-xs font-bold text-slate-900">
                                  {r.first_name} {r.last_name}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {r.birthdate} • {r.gender === 'F' ? 'Female' : 'Male'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleLinkResident(r)}
                                className="px-3 py-1 text-xs font-bold rounded-lg bg-cyan-700 text-white hover:bg-cyan-800 transition"
                              >
                                Link Case
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
          <span>Confidentiality Protected under RA 9262 / RA 7610</span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
          >
            Close Folder
          </button>
        </div>
      </div>
    </div>
  );
}

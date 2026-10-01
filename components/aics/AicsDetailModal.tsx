'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Calendar,
  DollarSign,
  User,
  HeartHandshake,
  FileText,
  MapPin,
  CheckCircle2,
  FileCheck,
  Eye,
  Download,
  AlertCircle,
  ExternalLink,
  Check,
  Maximize2,
  Paperclip,
  ShieldCheck,
} from 'lucide-react';
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import { getBarangayName } from '@/lib/mabini-barangays';
import { AICS_CLIENT_CATEGORIES } from '@/lib/aics/aics-categories';
import {
  getAicsRequirementTemplates,
  type AicsRequirementTemplate,
  type AicsRequirementDocument,
} from '@/lib/aics/aics-requirements';
import { formatDocumentSize } from '@/lib/solo-parents/document-compressor';
import { updateAicsRecord } from '@/lib/db/aics';
import type { AicsRecord, GeneralIntakeSheetData, AicsStatus } from '@/lib/db/schema';

interface AicsDetailModalProps {
  record: AicsRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updated: AicsRecord) => void;
}

export default function AicsDetailModal({
  record,
  isOpen,
  onClose,
  onUpdate,
}: AicsDetailModalProps) {
  const [currentRecord, setCurrentRecord] = useState<AicsRecord | null>(record);
  const [activePreviewDoc, setActivePreviewDoc] = useState<AicsRequirementDocument | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setCurrentRecord(record);
  }, [record]);

  if (!isOpen || !currentRecord) return null;

  function handlePrint() {
    if (!currentRecord) return;
    printGeneralIntakeSheet({
      id: currentRecord.id,
      case_number: currentRecord.control_number,
      case_type: 'other' as any,
      reported_at: currentRecord.intake_date,
      victim_name: currentRecord.client_name,
      victim_age: currentRecord.client_age,
      victim_gender: currentRecord.client_gender === 'Male' ? 'M' : 'F',
      victim_contact: currentRecord.contact_number,
      barangay_id: currentRecord.barangay_id,
      purok_sitio: currentRecord.purok_sitio,
      status: 'active' as any,
      case_summary: `${currentRecord.specific_assistance} (₱${currentRecord.amount_approved.toLocaleString()})`,
      source: 'manual_intake',
      intake_sheet: currentRecord.intake_sheet,
      createdAt: currentRecord.createdAt,
      updatedAt: currentRecord.updatedAt,
    });
  }

  const categoryDef = AICS_CLIENT_CATEGORIES[currentRecord.client_category];

  // Requirements & Documents from currentRecord
  const intakeSheet: GeneralIntakeSheetData = currentRecord.intake_sheet || {
    date_of_interview: currentRecord.intake_date,
    client_category: currentRecord.intake_category,
    sectors: currentRecord.sectors as any,
    case_category_type: 'aics',
    family_members: [],
  };

  const reqData = intakeSheet.requirements || { checklist: {}, documents: [] };
  const checklist = reqData.checklist || {};
  const documents: AicsRequirementDocument[] = reqData.documents || [];

  const requirementTemplates = getAicsRequirementTemplates(
    currentRecord.assistance_type,
    currentRecord.client_category,
    currentRecord.sectors
  );

  const mandatoryCount = requirementTemplates.filter((r) => r.mandatory).length;
  const verifiedCount = requirementTemplates.filter(
    (r) => checklist[r.key] || documents.some((d) => d.requirement_key === r.key)
  ).length;



  // Handle toggling hard-copy verification status
  async function handleToggleHardCopy(reqKey: string) {
    if (!currentRecord) return;
    setIsUpdating(true);

    try {
      const isCurrentlyChecked = Boolean(checklist[reqKey]);
      const updatedChecklist = {
        ...checklist,
        [reqKey]: !isCurrentlyChecked,
      };

      const updatedSheet: GeneralIntakeSheetData = {
        ...intakeSheet,
        requirements: {
          ...reqData,
          checklist: updatedChecklist,
        },
      };

      const updatedRecord = await updateAicsRecord(currentRecord.id, {
        intake_sheet: updatedSheet,
      });

      setCurrentRecord(updatedRecord);
      onUpdate?.(updatedRecord);
    } catch (err) {
      console.error('Failed to update requirement checklist:', err);
    } finally {
      setIsUpdating(false);
    }
  }

  // Handle live status change (e.g. pending -> approved -> disbursed -> liquidated)
  async function handleStatusChange(newStatus: AicsStatus) {
    if (!currentRecord || newStatus === currentRecord.status) return;
    setIsUpdating(true);
    try {
      const updated = await updateAicsRecord(currentRecord.id, {
        status: newStatus,
      });
      setCurrentRecord(updated);
      onUpdate?.(updated);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setIsUpdating(false);
    }
  }

  // Download / View in new tab
  function handleDownload(doc: AicsRequirementDocument) {
    if (!doc.file_url) return;

    const link = document.createElement('a');
    link.href = doc.file_url;
    link.download = doc.name || `aics_doc_${doc.requirement_key}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 px-6 py-4 text-white flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              <HeartHandshake className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 font-mono font-bold">{currentRecord.control_number}</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/25 text-emerald-200 border border-emerald-400/30">
                  {currentRecord.intake_category.replace('_', ' ')}
                </span>
                <div className="relative inline-flex items-center">
                  <label htmlFor="aics-status-select" className="sr-only">Assistance Status</label>
                  <select
                    id="aics-status-select"
                    value={currentRecord.status}
                    disabled={isUpdating}
                    onChange={(e) => void handleStatusChange(e.target.value as AicsStatus)}
                    className="pl-2.5 pr-4 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/15 hover:bg-white/25 text-white border border-white/25 focus:outline-hidden focus:ring-2 focus:ring-emerald-400 cursor-pointer transition disabled:opacity-50"
                  >
                    <option value="pending" className="text-slate-900 bg-white">Status: Pending</option>
                    <option value="assessed" className="text-slate-900 bg-white">Status: Assessed</option>
                    <option value="approved" className="text-slate-900 bg-white">Status: Approved</option>
                    <option value="disbursed" className="text-slate-900 bg-white">Status: Disbursed</option>
                    <option value="liquidated" className="text-slate-900 bg-white">Status: Liquidated</option>
                  </select>
                </div>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                {currentRecord.client_name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-white/20 shadow-xs"
            >
              <Printer className="h-3.5 w-3.5 text-emerald-300" /> Print GIS
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Key Metric Highlights */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 shadow-xs">
              <p className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Amount Granted</p>
              <p className="text-xl font-black text-emerald-950 mt-0.5 font-mono">
                ₱{currentRecord.amount_approved.toLocaleString()}
              </p>
              <p className="text-[10px] text-emerald-700 capitalize font-medium">
                {currentRecord.disbursement_type.replace('_', ' ')}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200 shadow-xs">
              <p className="text-[10px] font-bold uppercase text-teal-800 tracking-wider">AICS Category</p>
              <p className="text-sm font-black text-teal-950 mt-0.5">
                {categoryDef?.shortLabel || currentRecord.client_category.toUpperCase()}
              </p>
              <p className="text-[10px] text-teal-700 font-medium line-clamp-1" title={currentRecord.sub_category}>
                {currentRecord.sub_category}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs">
              <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Assistance Type</p>
              <p className="text-sm font-black text-slate-900 mt-0.5 capitalize">
                {currentRecord.assistance_type.replace('_', ' ')}
              </p>
              <p className="text-[10px] text-slate-500 line-clamp-1">{currentRecord.specific_assistance}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs">
              <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Intake Date</p>
              <p className="text-sm font-black text-slate-900 mt-0.5 font-mono">{currentRecord.intake_date}</p>
              <p className="text-[10px] text-slate-500">Mabini MSWDO</p>
            </div>
          </div>

          {/* Demographic & Location Info */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-xs">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-emerald-800">
              <User className="h-4 w-4" /> Identifying Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Age & Gender</p>
                <p className="font-semibold text-slate-800">
                  {currentRecord.client_age} yrs old • {currentRecord.client_gender}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Barangay</p>
                <p className="font-semibold text-slate-800">{getBarangayName(currentRecord.barangay_id)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Purok / Sitio</p>
                <p className="font-semibold text-slate-800">{currentRecord.purok_sitio || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-bold">Contact Number</p>
                <p className="font-semibold text-slate-800 font-mono">{currentRecord.contact_number || 'None'}</p>
              </div>
            </div>

            {/* Sectors */}
            {currentRecord.sectors && currentRecord.sectors.length > 0 && (
              <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase text-slate-400">Sectors:</span>
                {currentRecord.sectors.map((s) => (
                  <span
                    key={s}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-50 text-teal-800 border border-teal-200"
                  >
                    {s.replace('_', ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* =========================================================================
              NEW: REQUIRED DOCUMENTS & DIGITAL ATTACHMENTS SECTION (USER REQUEST)
             ========================================================================= */}
          <div className="p-4 sm:p-5 rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/30 to-white space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <FileCheck className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    Requirements & Attached Documents
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Official documents on file for audit verification and executive review.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {verifiedCount} of {mandatoryCount} Mandatory Verified
                </span>
                {documents.length > 0 && (
                  <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-teal-100 text-teal-800 border border-teal-300 flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5 text-teal-600" />
                    {documents.length} Uploaded File{documents.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* List / Cards of Requirements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {requirementTemplates.map((req, idx) => {
                const isChecked = Boolean(checklist[req.key]);
                const doc = documents.find((d) => d.requirement_key === req.key);

                return (
                  <div
                    key={req.key}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                      doc
                        ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-500/20 shadow-xs'
                        : isChecked
                        ? 'bg-teal-50/40 border-teal-200'
                        : req.mandatory
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleToggleHardCopy(req.key)}
                            disabled={isUpdating}
                            className={`mt-0.5 w-4.5 h-4.5 rounded-md flex items-center justify-center border transition cursor-pointer shrink-0 ${
                              isChecked || doc
                                ? 'bg-emerald-600 border-emerald-700 text-white'
                                : 'bg-white border-slate-300 hover:border-emerald-500'
                            }`}
                            title="Toggle hard copy verification status"
                          >
                            {(isChecked || doc) && <Check className="h-3 w-3 stroke-[3]" />}
                          </button>

                          <div>
                            <span className="text-xs font-black text-slate-900 block leading-tight">
                              {idx + 1}. {req.label}
                            </span>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                              {req.description}
                            </p>
                          </div>
                        </div>

                        {req.mandatory ? (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                            Required
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                            Optional
                          </span>
                        )}
                      </div>

                      {/* Attached Document Visual Preview Card */}
                      {doc ? (
                        <div className="mt-3 p-2.5 rounded-xl bg-white border border-emerald-200 shadow-xs flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            {doc.file_url.startsWith('data:image/') ? (
                              <button
                                type="button"
                                onClick={() => setActivePreviewDoc(doc)}
                                className="w-11 h-11 rounded-lg overflow-hidden border border-emerald-200 shrink-0 cursor-pointer hover:opacity-85 transition relative group"
                                title="Click to view full photo"
                              >
                                <img
                                  src={doc.file_url}
                                  alt={doc.name}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                  <Maximize2 className="h-3.5 w-3.5 text-white" />
                                </div>
                              </button>
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                                <FileText className="h-5 w-5" />
                              </div>
                            )}

                            <div className="truncate">
                              <p className="text-xs font-bold text-slate-800 truncate" title={doc.name}>
                                {doc.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-semibold mt-0.5">
                                <span>{formatDocumentSize(doc.file_size)}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-slate-500 font-normal">
                                  {new Date(doc.uploaded_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Actions for Document */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActivePreviewDoc(doc)}
                              className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition cursor-pointer flex items-center gap-1"
                              title="Inspect Full Resolution"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>View</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDownload(doc)}
                              className="p-1.5 text-xs text-slate-600 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition cursor-pointer"
                              title="Download Document"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2.5 p-2 bg-slate-50/80 rounded-xl border border-dashed border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            {isChecked ? (
                              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" /> Hard Copy verified on folder
                              </span>
                            ) : (
                              <span>No document on file</span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400">Physical file</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Status (Strictly Read-Only Viewer) */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-500">
                        {doc ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Photo Attached
                          </span>
                        ) : isChecked ? (
                          <span className="text-teal-700 font-bold flex items-center gap-1">
                            <Check className="h-3 w-3" /> Hard Copy on File
                          </span>
                        ) : (
                          <span className="text-slate-400">Pending</span>
                        )}
                      </span>

                      {doc ? (
                        <button
                          type="button"
                          onClick={() => setActivePreviewDoc(doc)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer shadow-2xs"
                          title="Click to view full photo scan"
                        >
                          <Eye className="h-3 w-3 text-emerald-700" />
                          <span>View Scan</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">
                          {isChecked ? 'Verified Hard Copy' : 'No document attached'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Problem & Assessment Narratives */}
          <div className="space-y-3">
            {currentRecord.intake_sheet?.problem_presented && (
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 shadow-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  II. Problem Presented
                </p>
                <p className="text-xs text-slate-800 leading-relaxed font-medium">
                  {currentRecord.intake_sheet.problem_presented}
                </p>
              </div>
            )}

            {currentRecord.intake_sheet?.assessment && (
              <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 mb-1">
                  IV. Assessment & Social Evaluation
                </p>
                <p className="text-xs text-slate-800 leading-relaxed font-medium">
                  {currentRecord.intake_sheet.assessment}
                </p>
              </div>
            )}

            {currentRecord.intake_sheet?.recommendation_action && (
              <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/40 shadow-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800 mb-1">
                  V. Recommendation / Action Taken
                </p>
                <p className="text-xs text-slate-800 leading-relaxed font-medium">
                  {currentRecord.intake_sheet.recommendation_action}
                </p>
              </div>
            )}
          </div>

          {/* Family Members Count */}
          {currentRecord.intake_sheet?.family_members && currentRecord.intake_sheet.family_members.length > 0 && (
            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Enrolled Family Dependents ({currentRecord.intake_sheet.family_members.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {currentRecord.intake_sheet.family_members.map((m, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <span className="font-bold text-slate-800">{m.name}</span>
                    <span className="text-slate-500 text-[11px]">{m.relationship} • {m.age} yrs</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 shrink-0">
          <span>
            Processed by: <strong className="text-slate-800">{currentRecord.assigned_worker_name || 'AICS Desk Officer'}</strong>
          </span>
          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" /> Print 2-Page GIS Form
          </button>
        </div>
      </div>

      {/* Lightbox / High-Resolution Document Inspection Modal */}
      {activePreviewDoc && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-100">
          <div className="relative max-w-4xl w-full max-h-[92vh] flex flex-col bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
            {/* Lightbox Header */}
            <div className="p-4 bg-slate-800/90 text-white flex items-center justify-between border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-xl bg-emerald-600/30 text-emerald-300 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-bold truncate text-white">{activePreviewDoc.name}</p>
                  <p className="text-[10px] text-slate-400 flex items-center gap-2">
                    <span>{formatDocumentSize(activePreviewDoc.file_size)}</span>
                    <span>•</span>
                    <span>{new Date(activePreviewDoc.uploaded_at).toLocaleString()}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(activePreviewDoc)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-white/20"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Download</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActivePreviewDoc(null)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
                  aria-label="Close Preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Lightbox Image Container */}
            <div className="p-4 sm:p-6 overflow-auto flex items-center justify-center flex-1 bg-black/50">
              {activePreviewDoc.file_url.startsWith('data:image/') ? (
                <img
                  src={activePreviewDoc.file_url}
                  alt={activePreviewDoc.name}
                  className="max-h-[78vh] w-auto object-contain rounded-xl shadow-2xl"
                />
              ) : (
                <div className="text-center p-8 bg-slate-800 rounded-2xl max-w-md">
                  <FileText className="h-16 w-16 text-rose-400 mx-auto mb-3" />
                  <p className="text-sm font-bold text-white mb-1">{activePreviewDoc.name}</p>
                  <p className="text-xs text-slate-400 mb-4">PDF Document</p>
                  <button
                    type="button"
                    onClick={() => handleDownload(activePreviewDoc)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Download / Open PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

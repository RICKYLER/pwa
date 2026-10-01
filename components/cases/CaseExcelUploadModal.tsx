'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
  Database,
} from 'lucide-react';
import {
  parseAndCleanseCaseFile,
  downloadCaseExcelTemplate,
  downloadCaseCsvTemplate,
  downloadVacExcelTemplate,
  downloadVawcExcelTemplate,
  downloadCustodySupportExcelTemplate,
  type CaseImportResult,
} from '@/lib/cases/case-excel-importer';
import { bulkImportCases } from '@/lib/db/cases';
import { cn } from '@/lib/utils';

interface CaseExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

export default function CaseExcelUploadModal({
  isOpen,
  onClose,
  onSuccess,
}: CaseExcelUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<CaseImportResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleFileProcess(file: File) {
    setSelectedFile(file);
    setIsParsing(true);
    setErrorMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseAndCleanseCaseFile(buffer, file.name);
      setImportResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to parse file: ${msg}`);
      setImportResult(null);
    } finally {
      setIsParsing(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  }

  async function handleConfirmImport() {
    if (!importResult || importResult.cases.length === 0) return;

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const { importedCount, updatedCount } = await bulkImportCases(importResult.cases, {
        updateExisting,
      });

      const totalHandled = importedCount + updatedCount;
      onSuccess(totalHandled);
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Failed to save cases to database: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  }

  function handleClose() {
    setSelectedFile(null);
    setImportResult(null);
    setErrorMessage(null);
    setIsParsing(false);
    setIsImporting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Bulk Upload Case Records (Excel / CSV)</h2>
              <p className="text-xs text-slate-500">
                Import past VAWC, VAC & social welfare cases directly from spreadsheet
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Template Download Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-r from-blue-50/90 via-amber-50/80 to-emerald-50/70 border border-slate-200 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shrink-0 mt-0.5 shadow-xs">
                <FileSpreadsheet className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">Need official Excel templates?</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                    Official BCPC / DILG Format
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Download official MSWDO / DILG Excel templates with pre-configured color schemes, group headers, and column validation.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={downloadVacExcelTemplate}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-xs transition cursor-pointer"
                title="Download official VAC Monitoring Form with Blue & Green pastel color format (RA 7610)"
              >
                <Download className="h-3.5 w-3.5" />
                VAC (RA 7610)
              </button>
              <button
                type="button"
                onClick={downloadVawcExcelTemplate}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-purple-700 text-white hover:bg-purple-800 shadow-xs transition cursor-pointer"
                title="Download official VAWC Registry template (RA 9262)"
              >
                <Download className="h-3.5 w-3.5" />
                VAWC (RA 9262)
              </button>
              <button
                type="button"
                onClick={downloadCustodySupportExcelTemplate}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 shadow-xs transition cursor-pointer"
                title="Download Child Custody & Support Monitoring Registry"
              >
                <Download className="h-3.5 w-3.5" />
                Custody & Support
              </button>
              <button
                type="button"
                onClick={downloadCaseExcelTemplate}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                title="Download general MSWDO Master Case registry template"
              >
                <Download className="h-3.5 w-3.5" />
                Master (.xlsx)
              </button>
            </div>
          </div>

          {/* Drag & Drop Upload Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'group relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition text-center',
              isDragging
                ? 'border-amber-500 bg-amber-50/50'
                : 'border-slate-300 hover:border-amber-400 bg-slate-50/40 hover:bg-slate-50',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-200 group-hover:scale-105 transition-transform text-amber-600 mb-3">
              {isParsing ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Upload className="h-6 w-6" />
              )}
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {selectedFile ? selectedFile.name : 'Click to upload or drag & drop Excel / CSV file'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
            </p>
            {selectedFile && (
              <span className="mt-3 px-2.5 py-1 text-[11px] font-bold rounded-full bg-slate-200 text-slate-700">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Upload Error</p>
                <p className="text-xs mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Validation & Preview Summary */}
          {importResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{importResult.validCount} valid cases ready to import</span>
                </div>
                {importResult.warnings.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>{importResult.warnings.length} warnings (duplicates/auto-fixes)</span>
                  </div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                    <span>{importResult.errors.length} fatal errors</span>
                  </div>
                )}
              </div>

              {/* Warnings details if any */}
              {importResult.warnings.length > 0 && (
                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-900 max-h-28 overflow-y-auto space-y-1">
                  <p className="font-bold text-[11px] uppercase tracking-wide text-amber-800">
                    Warnings & Auto-Resolutions:
                  </p>
                  {importResult.warnings.slice(0, 5).map((w, idx) => (
                    <p key={idx} className="text-slate-700">
                      • {w}
                    </p>
                  ))}
                  {importResult.warnings.length > 5 && (
                    <p className="text-[11px] text-amber-700 italic">
                      + {importResult.warnings.length - 5} more warnings
                    </p>
                  )}
                </div>
              )}

              {/* Preview Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Detected Records Preview ({importResult.cases.length})
                  </span>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
                    />
                    <span>Update existing case if Case No. already exists</span>
                  </label>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                      <tr>
                        <th className="py-2 px-3">Case No</th>
                        <th className="py-2 px-3">Classification</th>
                        <th className="py-2 px-3">Victim / Client</th>
                        <th className="py-2 px-3">Barangay</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Assigned Worker</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {importResult.cases.slice(0, 10).map((c, i) => (
                        <tr key={i} className="hover:bg-slate-50/80 transition">
                          <td className="py-2 px-3 font-mono font-bold text-amber-800">{c.case_number}</td>
                          <td className="py-2 px-3 capitalize">{c.case_type.replace(/_/g, ' ')}</td>
                          <td className="py-2 px-3 font-semibold">{c.victim_name}</td>
                          <td className="py-2 px-3 capitalize">{c.barangay_id}</td>
                          <td className="py-2 px-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 capitalize">
                              {c.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-500">{c.assigned_worker_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importResult.cases.length > 10 && (
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 text-center">
                    Showing first 10 rows of {importResult.cases.length} records to be imported.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-500">
            Protected under MSWDO Confidentiality & RA 9262 / RA 7610
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isImporting}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!importResult || importResult.cases.length === 0 || isImporting}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 shadow-md shadow-amber-600/20 transition disabled:opacity-50 disabled:pointer-events-none"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing Cases...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Confirm & Import {importResult?.cases.length || 0} Cases
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

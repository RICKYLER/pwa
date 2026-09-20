'use client';

import React, { useState } from 'react';
import {
  X,
  History,
  FileSpreadsheet,
  Calendar,
  HardDrive,
  CheckCircle2,
  PlayCircle,
  Eye,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
  AlertCircle,
  Database,
  ArrowRight,
  ShieldCheck,
  Building2,
  Layers,
} from 'lucide-react';
import {
  ForecastingUploadRecord,
  activateDatasetUpload,
  deleteDatasetUpload,
} from '@/lib/forecasting/forecasting-upload-store';
import { formatBytes } from '@/lib/forecasting/compression-helper';
import { MSWDO_CONSTANTS } from '@/lib/forecasting/demand-predictor';
import { exportEventsToExcel } from '@/lib/forecasting/csv-importer';

interface ForecastingUploadHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  uploads: ForecastingUploadRecord[];
  activeUploadId?: string;
  onSelectDataset: (record: ForecastingUploadRecord) => void;
  onReloadHistory: () => void;
  currentStockpile?: number;
}

export function ForecastingUploadHistoryModal({
  isOpen,
  onClose,
  uploads,
  activeUploadId,
  onSelectDataset,
  onReloadHistory,
  currentStockpile = MSWDO_CONSTANTS.MDRRMO_BODEGA_STOCKPILE_BUFFER,
}: ForecastingUploadHistoryModalProps) {
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<ForecastingUploadRecord | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleActivate = async (record: ForecastingUploadRecord) => {
    setActionLoading(true);
    await activateDatasetUpload(record.id);
    onSelectDataset(record);
    onReloadHistory();
    setActionLoading(false);
  };

  const handleDelete = async (id: string) => {
    setActionLoading(true);
    await deleteDatasetUpload(id);
    if (selectedRecordForDetails?.id === id) {
      setSelectedRecordForDetails(null);
    }
    setDeleteConfirmId(null);
    onReloadHistory();
    setActionLoading(false);
  };

  const handleDownloadDataset = (record: ForecastingUploadRecord) => {
    exportEventsToExcel(record.dataset_events, record.file_name);
  };

  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  const getRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6 animate-in fade-in duration-200">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <History className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Disaster Dataset Upload History
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {uploads.length} {uploads.length === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Disaster relief historical records & demand forecasting accuracy evaluation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-slate-100 p-4 text-slate-400 dark:bg-slate-800">
                <FileSpreadsheet className="h-8 w-8" />
              </div>
              <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                No Uploaded Datasets Yet
              </h4>
              <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                When you upload historical Excel (.xlsx) or CSV disaster records, they will automatically be evaluated and logged here to power the demand forecasting model.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {uploads.map((upload) => {
                const isActive = activeUploadId === upload.id || upload.is_active;
                const isDetailsOpen = selectedRecordForDetails?.id === upload.id;

                return (
                  <div
                    key={upload.id}
                    className={`rounded-xl border transition-all ${
                      isActive
                        ? 'border-indigo-300 bg-indigo-50/40 shadow-xs dark:border-indigo-800 dark:bg-indigo-950/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60'
                    }`}
                  >
                    {/* Record Main Row */}
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      {/* Left: Icon & File Info */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`mt-0.5 rounded-lg p-2 ${
                          upload.file_type === 'csv'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          <FileSpreadsheet className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100" title={upload.file_name}>
                              {upload.file_name}
                            </h4>
                            {isActive && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                Active in Simulator
                              </span>
                            )}
                            <span className="uppercase text-[10px] font-bold tracking-wider text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {upload.file_type}
                            </span>
                          </div>

                          {/* Metadata Row: Date, Size, Records, Accuracy */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>{formatDateTime(upload.uploaded_at)}</span>
                              <span className="text-[11px] text-slate-400">({getRelativeTime(upload.uploaded_at)})</span>
                            </span>

                            <span className="inline-flex items-center gap-1">
                              <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                              <span>{formatBytes(upload.file_size_bytes)}</span>
                            </span>

                            <span className="inline-flex items-center gap-1">
                              <Layers className="h-3.5 w-3.5 text-slate-400" />
                              <span>{upload.records_count} records</span>
                            </span>

                            {upload.accuracy_rate > 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>{upload.accuracy_rate}% Acc ({upload.mape_percent}% MAPE)</span>
                              </span>
                            )}

                            <span className="text-slate-400">
                              By {upload.uploaded_by}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {!isActive && (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleActivate(upload)}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all"
                            title="Load this historical dataset into the active simulator"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            <span>Activate</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedRecordForDetails(isDetailsOpen ? null : upload)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            isDetailsOpen
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>{isDetailsOpen ? 'Hide Details' : 'View Details'}</span>
                          {isDetailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadDataset(upload)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          title="Download uploaded dataset as Excel (.xlsx)"
                        >
                          <Download className="h-3.5 w-3.5 text-emerald-600" />
                        </button>

                        {deleteConfirmId === upload.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(upload.id)}
                              className="rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-700"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(upload.id)}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-rose-950/40"
                            title="Delete dataset from history"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Detailed Breakdown Accordion */}
                    {isDetailsOpen && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-4">
                        {/* Summary Metrics Cards (Matching Forecasting Operational KPIs) */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                              Overall Accuracy
                            </span>
                            <p className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-400">
                              {upload.accuracy_rate}%
                            </p>
                            <span className="text-[10px] text-slate-400">Based on 100% - MAPE</span>
                          </div>

                          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                              MAPE Error Rate
                            </span>
                            <p className="mt-1 text-xl font-black text-indigo-600 dark:text-indigo-400">
                              {upload.mape_percent}%
                            </p>
                            <span className={`text-[10px] font-medium ${upload.mape_percent <= 1 ? 'text-emerald-600 dark:text-emerald-400' : upload.mape_percent <= 10 ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {upload.mape_percent <= 1 ? 'High precision (<1%)' : upload.mape_percent <= 10 ? 'Reliable (<10%)' : 'Moderate (>10%)'}
                            </span>
                          </div>

                          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                              Mean Abs Error (MAE)
                            </span>
                            <p className="mt-1 text-xl font-black text-slate-800 dark:text-slate-200">
                              ±{upload.mae_error}
                            </p>
                            <span className="text-[10px] text-slate-400">Packs deviation per event</span>
                          </div>

                          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                              Bodega Stockpile
                            </span>
                            <p className="mt-1 text-xl font-black text-amber-600 dark:text-amber-400">
                              {currentStockpile.toLocaleString()}
                            </p>
                            <span className="text-[10px] text-slate-400">MDRRMO Standby Buffer</span>
                          </div>
                        </div>

                        {/* Hazards and Barangays Breakdown */}
                        {upload.metadata && typeof upload.metadata === 'object' && (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">Hazards included:</span>
                              {upload.metadata && 'hazardsBreakdown' in upload.metadata && typeof upload.metadata.hazardsBreakdown === 'object' && upload.metadata.hazardsBreakdown ? (
                                Object.entries(upload.metadata.hazardsBreakdown as Record<string, number>).map(([h, count]) => (
                                  <span key={h} className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    <span className="capitalize">{h}</span>: <strong className="text-indigo-600 dark:text-indigo-400">{count}</strong>
                                  </span>
                                ))
                              ) : null}
                            </div>

                            {upload.metadata && 'barangaysCovered' in upload.metadata && Array.isArray(upload.metadata.barangaysCovered) && (
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">Barangays ({upload.metadata.barangaysCovered.length}):</span>
                                {upload.metadata.barangaysCovered.map((b) => (
                                  <span key={b} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Events Table Preview (first 5 events) */}
                        {upload.dataset_events && upload.dataset_events.length > 0 && (
                          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900">
                            <div className="bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-between">
                              <span>Event Sample Records ({upload.dataset_events.length} total)</span>
                              <span className="text-[10px] text-slate-500">Showing first 5 entries</span>
                            </div>
                            <table className="w-full text-left">
                              <thead className="border-b border-slate-100 text-[11px] text-slate-500 dark:border-slate-800">
                                <tr>
                                  <th className="p-2">Event</th>
                                  <th className="p-2">Date</th>
                                  <th className="p-2">Barangay</th>
                                  <th className="p-2 text-right">Households</th>
                                  <th className="p-2 text-right">Actual FFPs</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                                {upload.dataset_events.slice(0, 5).map((e, idx) => (
                                  <tr key={idx}>
                                    <td className="p-2 font-medium text-slate-900 dark:text-slate-100">{e.eventName}</td>
                                    <td className="p-2 text-slate-500">{e.date}</td>
                                    <td className="p-2">{e.barangayName}</td>
                                    <td className="p-2 text-right">{e.affectedHouseholds}</td>
                                    <td className="p-2 text-right font-semibold text-emerald-600">{e.actualDistributed?.familyFoodPacks || 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload limit: <strong>10 MB</strong> • Formats: <strong>.xlsx, .xls, .csv</strong> • Disaster Relief Historical Data
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

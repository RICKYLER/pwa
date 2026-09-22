'use client';

import React from 'react';
import {
  Layers,
  RefreshCw,
  PlusCircle,
  FileSpreadsheet,
  Calendar,
  X,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { formatBytes } from '@/lib/forecasting/compression-helper';

interface ForecastingUploadAppendModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileSizeBytes: number;
  incomingRecordsCount: number;
  detectedDates: string[];
  currentDatasetCount: number;
  currentEventName?: string;
  onConfirmAppend: () => void;
  onConfirmReplace: () => void;
  isProcessing?: boolean;
}

export function ForecastingUploadAppendModal({
  isOpen,
  onClose,
  fileName,
  fileSizeBytes,
  incomingRecordsCount,
  detectedDates,
  currentDatasetCount,
  currentEventName = 'Current Disaster Dataset',
  onConfirmAppend,
  onConfirmReplace,
  isProcessing = false,
}: ForecastingUploadAppendModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Choose Dataset Action
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dataset Upload & Progressive SitRep Aggregator
            </p>
          </div>
        </div>

        {/* Incoming File Badge */}
        <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-indigo-500 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {fileName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {formatBytes(fileSizeBytes)} · {incomingRecordsCount} records
                </p>
              </div>
            </div>
            {detectedDates.length > 0 && (
              <div className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shrink-0">
                <Calendar className="h-3 w-3" />
                <span>{detectedDates.slice(0, 2).join(', ')}{detectedDates.length > 2 ? ` +${detectedDates.length - 2}` : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="mt-5 space-y-3">
          {/* Option 1: Append (Recommended) */}
          <button
            type="button"
            onClick={onConfirmAppend}
            disabled={isProcessing}
            className="group relative flex w-full flex-col rounded-xl border-2 border-emerald-500 bg-emerald-50/40 p-4 text-left transition-all hover:bg-emerald-50 hover:shadow-md dark:border-emerald-500/80 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">
                  ✓
                </span>
                <span className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                  Append to Current Disaster Dataset
                </span>
              </div>
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Recommended
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-emerald-900/80 dark:text-emerald-300/80">
              <strong>Preserves</strong> existing {currentDatasetCount} records. Automatically merges and recalculates the <strong>Cumulative Running Total</strong> across all dates.
            </p>
          </button>

          {/* Option 2: Replace */}
          <button
            type="button"
            onClick={onConfirmReplace}
            disabled={isProcessing}
            className="flex w-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/50"
          >
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Replace Active Dataset (Start Fresh Baseline)
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Replaces the current records with this new file as a clean baseline.
            </p>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

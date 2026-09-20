'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Calculator,
  ChevronDown,
  ChevronUp,
  Building2,
  Package,
  FileCheck2,
  CheckCircle2,
  Upload,
  Download,
  RotateCcw,
  History,
  HardDrive,
  Loader2,
  Database,
} from 'lucide-react';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import {
  predictReliefDemand,
  MSWDO_CONSTANTS,
  type ForecastDemandResult,
} from '@/lib/forecasting/demand-predictor';
import {
  evaluateForecastingAccuracy,
  type ModelAccuracyReport,
} from '@/lib/forecasting/accuracy-metrics';
import {
  compareBaselineVsProposed,
  type BaselineComparisonSummary,
} from '@/lib/forecasting/baseline-model';
import {
  MABINI_SYNTHETIC_DISASTER_HISTORY,
  type HistoricalDisasterEvent,
} from '@/lib/forecasting/mabini-relief-dataset';
import {
  parseExcelOrCsvFile,
  downloadExcelTemplate,
  downloadCsvTemplate,
} from '@/lib/forecasting/csv-importer';
import {
  validateDatasetFile,
  compressJsonPayload,
  calculateDatasetSummary,
  formatBytes,
  MAX_FORECASTING_FILE_SIZE_MB,
} from '@/lib/forecasting/compression-helper';
import {
  fetchUploadHistory,
  saveDatasetUpload,
  type ForecastingUploadRecord,
} from '@/lib/forecasting/forecasting-upload-store';
import { ForecastingUploadHistoryModal } from './ForecastingUploadHistoryModal';

interface ForecastingInsightsCardProps {
  currentStockpile?: number;
  className?: string;
}

export function ForecastingInsightsCard({
  currentStockpile = MSWDO_CONSTANTS.MDRRMO_BODEGA_STOCKPILE_BUFFER,
  className = '',
}: ForecastingInsightsCardProps) {
  // Dataset State (default to synthetic, can be replaced by uploaded Excel/CSV)
  const [activeDataset, setActiveDataset] = useState<HistoricalDisasterEvent[]>(MABINI_SYNTHETIC_DISASTER_HISTORY);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [uploadHistory, setUploadHistory] = useState<ForecastingUploadRecord[]>([]);
  const [showUploadHistoryModal, setShowUploadHistoryModal] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<{
    message: string;
    isError?: boolean;
    compressionNote?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load upload history and restore active dataset on mount
  useEffect(() => {
    let isMounted = true;
    fetchUploadHistory().then((history) => {
      if (!isMounted) return;
      setUploadHistory(history);
      const activeRecord = history.find((h) => h.is_active);
      if (activeRecord && Array.isArray(activeRecord.dataset_events) && activeRecord.dataset_events.length > 0) {
        setActiveDataset(activeRecord.dataset_events);
        setActiveUploadId(activeRecord.id);
        setActiveFileName(activeRecord.file_name);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const refreshHistory = async () => {
    const history = await fetchUploadHistory();
    setUploadHistory(history);
  };

  // Simulator State
  const [selectedBarangay, setSelectedBarangay] = useState<string>('cadunan');
  const [householdsInput, setHouseholdsInput] = useState<number | ''>('');
  const [hazardType, setHazardType] = useState<'typhoon' | 'flashflood' | 'landslide' | 'earthquake'>('flashflood');
  const [severityLevel, setSeverityLevel] = useState<'low' | 'moderate' | 'severe' | 'critical'>('moderate');
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyTab, setHistoryTab] = useState<'baseline' | 'breakdown'>('baseline');

  // Compute live prediction
  const forecast: ForecastDemandResult = useMemo(() => {
    const brgy = BARANGAY_REGISTRY.find((b) => b.id === selectedBarangay);
    return predictReliefDemand({
      barangayId: selectedBarangay,
      barangayName: brgy?.label ?? selectedBarangay,
      affectedHouseholds: typeof householdsInput === 'number' ? householdsInput : 0,
      hazardType,
      severityLevel,
      currentBodegaStockpile: currentStockpile,
    });
  }, [selectedBarangay, householdsInput, hazardType, severityLevel, currentStockpile]);

  // Compute model accuracy metrics dynamically on the active dataset
  const accuracyReport: ModelAccuracyReport = useMemo(() => {
    return evaluateForecastingAccuracy(activeDataset);
  }, [activeDataset]);

  // Compute baseline comparison dynamically on the active dataset
  const baselineComparison: BaselineComparisonSummary = useMemo(() => {
    return compareBaselineVsProposed(activeDataset);
  }, [activeDataset]);

  // Handle Excel (.xlsx, .xls) / CSV upload with real Supabase storage, 10MB limit & compression
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected if needed
    e.target.value = '';

    // Step 1: File Size Limit Check (Max 10 MB)
    const sizeCheck = validateDatasetFile(file, MAX_FORECASTING_FILE_SIZE_MB);
    if (!sizeCheck.valid) {
      setImportStatus({
        message: sizeCheck.error || `File exceeds the ${MAX_FORECASTING_FILE_SIZE_MB} MB limit.`,
        isError: true,
      });
      return;
    }

    try {
      setIsUploading(true);
      setImportStatus({
        message: `Step 1/3: Cleansing "${file.name}" (${sizeCheck.sizeFormatted})...`,
        isError: false,
      });

      // Step 2: Parse & Cleanse Excel / CSV data
      const result = await parseExcelOrCsvFile(file);

      if (!result.success || result.events.length === 0) {
        setIsUploading(false);
        setImportStatus({
          message: result.errors[0] || 'Failed to parse file. Please verify column format.',
          isError: true,
        });
        return;
      }

      // Step 3: Compress Dataset via GZIP & calculate metrics
      setImportStatus({
        message: `Step 2/3: Compressing ${result.importedCount} records via GZIP...`,
        isError: false,
      });

      const compression = await compressJsonPayload(result.events);
      const summary = calculateDatasetSummary(result.events);
      const accuracyMetrics = evaluateForecastingAccuracy(result.events);

      // Step 4: Save to Supabase & local cache store
      setImportStatus({
        message: `Step 3/3: Saving to Supabase & logging to history...`,
        isError: false,
      });

      const ext = file.name.toLowerCase().endsWith('.csv')
        ? 'csv'
        : file.name.toLowerCase().endsWith('.xls')
        ? 'xls'
        : 'xlsx';

      const saved = await saveDatasetUpload({
        file_name: file.name,
        file_size_bytes: file.size,
        compressed_size_bytes: compression.compressedSizeBytes,
        file_type: ext,
        records_count: result.importedCount,
        accuracy_rate: accuracyMetrics.overallAccuracyRate,
        mape_percent: accuracyMetrics.meanAbsolutePercentageError,
        mae_error: accuracyMetrics.meanAbsoluteError,
        uploaded_by: 'MSWDO Staff',
        is_active: true,
        metadata: summary,
        dataset_events: result.events,
      });

      // Activate dataset in live engine
      setActiveDataset(result.events);
      setActiveUploadId(saved.id);
      setActiveFileName(file.name);
      await refreshHistory();

      setIsUploading(false);
      setImportStatus({
        message: `Successfully uploaded to Supabase! Loaded ${result.importedCount} cleansed records from "${file.name}".`,
        compressionNote: `GZIP Compression: ${formatBytes(file.size)} → ${formatBytes(compression.compressedSizeBytes)} (-${compression.savedPercentage}% saved)`,
        isError: false,
      });
      setShowHistoryModal(true);
    } catch (err: any) {
      setIsUploading(false);
      setImportStatus({
        message: err?.message || 'Error processing file upload.',
        isError: true,
      });
    }
  };

  const handleSelectHistoryDataset = (record: ForecastingUploadRecord) => {
    if (Array.isArray(record.dataset_events) && record.dataset_events.length > 0) {
      setActiveDataset(record.dataset_events);
      setActiveUploadId(record.id);
      setActiveFileName(record.file_name);
      setImportStatus({
        message: `Active Dataset: "${record.file_name}" (${record.records_count} records, ${record.accuracy_rate}% accuracy).`,
        compressionNote: `Storage size: ${formatBytes(record.compressed_size_bytes)}`,
        isError: false,
      });
    }
  };

  const handleResetToDefault = () => {
    setActiveDataset(MABINI_SYNTHETIC_DISASTER_HISTORY);
    setActiveUploadId(null);
    setActiveFileName(null);
    setImportStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isCustomDataset = activeDataset !== MABINI_SYNTHETIC_DISASTER_HISTORY;

  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {/* Hidden File Input for Excel (.xlsx, .xls) / CSV */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800/60">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              MSWDO Relief Demand Forecasting
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60">
              <CheckCircle2 className="h-3 w-3" />
              {accuracyReport.overallAccuracyRate}% Model Accuracy
            </span>
            {isCustomDataset && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200">
                <Database className="h-3 w-3" />
                {activeFileName || 'Custom File Active'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Standard 3 families per HH (1 HH = 3 FFPs) • 2,000 MDRRMO Bodega Buffer
          </p>
        </div>

        {/* Action Buttons: Template, Upload CSV, History, Accuracy */}
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={downloadExcelTemplate}
            title="Download formatted Excel (.xlsx) template"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/80"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            <span>Excel Template</span>
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            title={`Upload real MSWDO historical disaster data (Limit: ${MAX_FORECASTING_FILE_SIZE_MB} MB)`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-indigo-600" />
            )}
            <span>{isUploading ? 'Uploading...' : 'Upload Excel/CSV'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUploadHistoryModal(true)}
            title="View Supabase upload history & dataset details"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/80"
          >
            <History className="h-3.5 w-3.5 text-indigo-600" />
            <span>History</span>
            {uploadHistory.length > 0 && (
              <span className="rounded-full bg-indigo-100 px-1.5 py-0.2 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {uploadHistory.length}
              </span>
            )}
          </button>

          {isCustomDataset && (
            <button
              type="button"
              onClick={handleResetToDefault}
              title="Reset to default Mabini synthetic history"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowHistoryModal(!showHistoryModal)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/80"
          >
            <FileCheck2 className="h-3.5 w-3.5 text-indigo-500" />
            <span>{showHistoryModal ? 'Hide Proof' : 'View Accuracy (MAPE)'}</span>
            {showHistoryModal ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Import Status Alert */}
      {importStatus && (
        <div className={`mt-3 flex items-center justify-between rounded-xl p-3 text-xs border ${
          importStatus.isError
            ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900'
        }`}>
          <div className="flex items-center gap-2">
            {importStatus.isError ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <div>
              <p className="font-medium">{importStatus.message}</p>
              {importStatus.compressionNote && (
                <p className="text-[11px] font-semibold opacity-85 text-emerald-700 dark:text-emerald-300">
                  {importStatus.compressionNote}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImportStatus(null)}
            className="text-[11px] font-semibold underline hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Accuracy KPI Cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Overall Accuracy</span>
          <p className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-400">
            {accuracyReport.overallAccuracyRate}%
          </p>
          <span className="text-[10px] text-slate-400">Based on 100% - MAPE</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">MAPE Error Rate</span>
          <p className="mt-1 text-xl font-black text-indigo-600 dark:text-indigo-400">
            {accuracyReport.meanAbsolutePercentageError}%
          </p>
          <span className="text-[10px] text-emerald-600 font-medium">High precision (&lt;1%)</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mean Abs Error (MAE)</span>
          <p className="mt-1 text-xl font-black text-slate-800 dark:text-slate-200">
            ±{accuracyReport.meanAbsoluteError}
          </p>
          <span className="text-[10px] text-slate-400">Packs deviation per event</span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bodega Stockpile</span>
          <p className="mt-1 text-xl font-black text-amber-600 dark:text-amber-400">
            {currentStockpile.toLocaleString()}
          </p>
          <span className="text-[10px] text-slate-400">MDRRMO Standby Buffer</span>
        </div>
      </div>

      {/* Accuracy Evaluation Table & Baseline Comparison (collapsible) */}
      {showHistoryModal && (
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 dark:border-indigo-950 dark:bg-indigo-950/20">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryTab('baseline')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  historyTab === 'baseline'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Baseline (SMA-3) vs Proposed Model
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('breakdown')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  historyTab === 'breakdown'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Detailed Disaster Breakdown ({accuracyReport.totalEvaluatedEvents})
              </button>
            </div>
            <span className="text-xs text-indigo-700 dark:text-indigo-400">
              Formula: MAPE = (1/n) * Σ(|Actual - Forecast| / Actual) * 100
            </span>
          </div>

          {historyTab === 'baseline' ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="p-2.5">Statistical Metric</th>
                      <th className="p-2.5 text-amber-700 dark:text-amber-400">Baseline Model (SMA-3)</th>
                      <th className="p-2.5 text-emerald-700 dark:text-emerald-400">Proposed MSWDO Model</th>
                      <th className="p-2.5 text-right">Performance Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className="p-2.5 font-medium text-slate-900 dark:text-slate-100">Algorithm Type</td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-400">Rolling 3-Event Moving Average</td>
                      <td className="p-2.5 font-semibold text-indigo-600 dark:text-indigo-400">Multi-Factor (3 Families/HH + Buffer)</td>
                      <td className="p-2.5 text-right font-medium text-slate-500">Domain-Specific LGU Engine</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium text-slate-900 dark:text-slate-100">Mean Absolute Error (MAE)</td>
                      <td className="p-2.5 font-semibold text-rose-600">±{baselineComparison.baselineModel.meanAbsoluteError} packs</td>
                      <td className="p-2.5 font-bold text-emerald-600">±{baselineComparison.proposedModel.meanAbsoluteError} packs</td>
                      <td className="p-2.5 text-right font-semibold text-emerald-600">
                        -{(baselineComparison.baselineModel.meanAbsoluteError - baselineComparison.proposedModel.meanAbsoluteError).toFixed(1)} packs error
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium text-slate-900 dark:text-slate-100">Root Mean Squared (RMSE)</td>
                      <td className="p-2.5 font-semibold text-rose-600">{baselineComparison.baselineModel.rootMeanSquaredError}</td>
                      <td className="p-2.5 font-bold text-emerald-600">{baselineComparison.proposedModel.rootMeanSquaredError}</td>
                      <td className="p-2.5 text-right font-semibold text-emerald-600">Significant variance stability</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium text-slate-900 dark:text-slate-100">Mean Abs % Error (MAPE)</td>
                      <td className="p-2.5 font-semibold text-rose-600">{baselineComparison.baselineModel.mapePercent}%</td>
                      <td className="p-2.5 font-bold text-emerald-600">{baselineComparison.proposedModel.mapePercent}%</td>
                      <td className="p-2.5 text-right font-bold text-emerald-600">{baselineComparison.performanceComparison.errorReductionPercent}% Error Reduction</td>
                    </tr>
                    <tr className="bg-slate-50/50 dark:bg-slate-800/40">
                      <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">Overall Accuracy Rate</td>
                      <td className="p-2.5 text-base font-black text-rose-600">{baselineComparison.baselineModel.accuracyRate}%</td>
                      <td className="p-2.5 text-base font-black text-emerald-600">{baselineComparison.proposedModel.accuracyRate}%</td>
                      <td className="p-2.5 text-right font-bold text-emerald-600">+{baselineComparison.performanceComparison.accuracyImprovementPercent}% Accuracy</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                <p className="font-semibold">{baselineComparison.performanceComparison.verdict}</p>
              </div>
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-100 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="p-2">Barangay</th>
                    <th className="p-2">Hazard</th>
                    <th className="p-2 text-right">Affected HH</th>
                    <th className="p-2 text-right">Actual FFPs</th>
                    <th className="p-2 text-right">Predicted FFPs</th>
                    <th className="p-2 text-right">Error %</th>
                    <th className="p-2 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {accuracyReport.eventBreakdown.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                      <td className="p-2 font-medium text-slate-900 dark:text-slate-100">{e.barangayName}</td>
                      <td className="p-2 uppercase text-[11px] text-slate-500">{e.hazardType}</td>
                      <td className="p-2 text-right">{e.affectedHouseholds}</td>
                      <td className="p-2 text-right font-medium">{e.actualFFPs}</td>
                      <td className="p-2 text-right font-semibold text-indigo-600 dark:text-indigo-400">{e.predictedFFPs}</td>
                      <td className="p-2 text-right text-slate-500">{e.percentageError}%</td>
                      <td className="p-2 text-right font-semibold text-emerald-600">{e.accuracyPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Interactive Rapid Simulator */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="h-4 w-4 text-sky-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Disaster Scenario Simulator (MSWDO Allocation Rule)
          </h4>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Barangay
            </label>
            <select
              value={selectedBarangay}
              onChange={(e) => setSelectedBarangay(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {BARANGAY_REGISTRY.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Affected Households (HH)
            </label>
            <input
              type="number"
              min={1}
              max={1500}
              placeholder="e.g. 75"
              value={householdsInput}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setHouseholdsInput('');
                } else {
                  const num = Number(val);
                  setHouseholdsInput(isNaN(num) ? '' : num);
                }
              }}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Hazard Type
            </label>
            <select
              value={hazardType}
              onChange={(e) => setHazardType(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="flashflood">Flashflood / Shear Line</option>
              <option value="typhoon">Typhoon / Strong Winds</option>
              <option value="landslide">Landslide / Slope Hazard</option>
              <option value="earthquake">Earthquake Tremor</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Severity Level
            </label>
            <select
              value={severityLevel}
              onChange={(e) => setSeverityLevel(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="low">Low (Alert 1 / Minor)</option>
              <option value="moderate">Moderate (Alert 2)</option>
              <option value="severe">Severe (Alert 3 / Evacuation)</option>
              <option value="critical">Critical (State of Calamity)</option>
            </select>
          </div>
        </div>

        {/* Simulator Outputs */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-700/80 dark:bg-slate-900">
          <div>
            <span className="text-[11px] text-slate-500">Families Beneficiaries</span>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">
              {forecast.input.computedFamilies} families
            </p>
            <span className="text-[10px] text-slate-400">3 per household</span>
          </div>

          <div>
            <span className="text-[11px] text-slate-500">Forecasted FFPs</span>
            <p className="text-base font-bold text-indigo-600 dark:text-indigo-400">
              {forecast.predictedDemand.familyFoodPacks} packs
            </p>
            <span className="text-[10px] text-slate-400">
              +{forecast.predictedDemand.contingencyBufferPacks} buffer
            </span>
          </div>

          <div>
            <span className="text-[11px] text-slate-500">Kitchen Supplies</span>
            <p className="text-base font-bold text-amber-600 dark:text-amber-400">
              {forecast.predictedDemand.kitchenSets} sets
            </p>
            <span className="text-[10px] text-slate-400">1 per physical HH</span>
          </div>

          <div>
            <span className="text-[11px] text-slate-500">Bodega Status</span>
            <p className={`text-base font-bold ${forecast.bodegaStatus.requiresDswdAugmentation ? 'text-rose-600' : 'text-emerald-600'}`}>
              {forecast.bodegaStatus.requiresDswdAugmentation
                ? `-${forecast.bodegaStatus.deficitAugmentationNeeded} Deficit`
                : `${forecast.bodegaStatus.projectedRemaining} Remaining`}
            </p>
            <span className="text-[10px] text-slate-400">
              From {currentStockpile} stockpile
            </span>
          </div>
        </div>

        {/* Operational Warning / Alert note */}
        <div className={`mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs ${
          forecast.bodegaStatus.requiresDswdAugmentation
            ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
            : forecast.bodegaStatus.isBelowReorderThreshold
            ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900'
            : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
        }`}>
          {forecast.bodegaStatus.requiresDswdAugmentation ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          ) : (
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>{forecast.bodegaStatus.operationalNote}</span>
        </div>
      </div>

      {/* Upload History & Details Modal */}
      <ForecastingUploadHistoryModal
        isOpen={showUploadHistoryModal}
        onClose={() => setShowUploadHistoryModal(false)}
        uploads={uploadHistory}
        activeUploadId={activeUploadId || undefined}
        onSelectDataset={handleSelectHistoryDataset}
        onReloadHistory={refreshHistory}
      />
    </div>
  );
}

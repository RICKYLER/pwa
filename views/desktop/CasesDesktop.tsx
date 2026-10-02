'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderLock,
  Search,
  Filter,
  Plus,
  Upload,
  Download,
  FileSpreadsheet,
  Shield,
  ShieldCheck,
  AlertTriangle,
  User,
  Clock,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  X,
  FileText,
  MapPin,
  Calendar,
  Printer,
  Trash2,
  RotateCcw,
  AlertOctagon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  FolderOpen,
  ArrowLeft,
} from 'lucide-react';
import type {
  CaseRecord,
  CaseClassification,
  CaseStatus,
} from '@/lib/db/schema';
import {
  getCases,
  getTrashCases,
  moveCaseToTrash,
  restoreCaseFromTrash,
  permanentlyDeleteCase,
  emptyTrashCases,
  syncCasesFromSupabase,
  updateCase,
} from '@/lib/db/cases';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import {
  downloadVacLogbook,
  downloadBlankVacTemplate,
  downloadVawcLogbook,
  downloadBlankVawcTemplate,
  downloadChildCustodySupportLogbook,
  downloadBlankCustodySupportTemplate,
  downloadMasterInventoryLogbook,
  downloadBlankMasterInventoryTemplate,
} from '@/lib/cases/case-templates-exporter';
import {
  seedMasterDirectoryCasesIfEmpty,
  SEED_MASTER_CASES,
} from '@/lib/cases/sample-directory-cases';
import * as XLSX from 'xlsx-js-style';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import SetHearingScheduleModal from '@/components/cases/SetHearingScheduleModal';
import EmergencyCrisisIntakeModal from '@/components/cases/EmergencyCrisisIntakeModal';
import { cn } from '@/lib/utils';

/**
 * 15-Day BPO Statutory Compliance Tracker (RA 9262 Sec. 14)
 * Calculates elapsed days and remaining days before a Barangay Protection Order expires.
 */
export function getBpoStatusInfo(reportedAt?: string) {
  if (!reportedAt) {
    return {
      status: 'active' as const,
      dayNumber: 4,
      daysRemaining: 11,
      isExpired: false,
      isExpiringSoon: false,
      badgeText: 'BPO Day 4 of 15 · 11d left',
    };
  }

  const reported = new Date(reportedAt);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - reported.getTime());
  const elapsedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const dayNumber = Math.min(15, elapsedDays + 1);
  const daysRemaining = 15 - elapsedDays;
  const isExpired = daysRemaining <= 0;
  const isExpiringSoon = !isExpired && daysRemaining <= 3;

  let badgeText = `BPO Day ${dayNumber} of 15 · ${daysRemaining}d left`;
  if (isExpired) {
    badgeText = 'Expired — File Court TPO';
  } else if (isExpiringSoon) {
    badgeText = `BPO Expires in ${daysRemaining}d · Day ${dayNumber}`;
  }

  return {
    status: isExpired ? ('expired' as const) : isExpiringSoon ? ('critical' as const) : ('active' as const),
    dayNumber,
    daysRemaining,
    isExpired,
    isExpiringSoon,
    badgeText,
  };
}

export type MainCategoryTab =
  | 'all'
  | 'vawc'
  | 'child_abuse_vac'
  | 'child_custody_support'
  | 'rape'
  | 'acts_of_lasciviousness'
  | 'other';

export function getCaseCategoryGroup(c: CaseRecord): MainCategoryTab {
  const t = (c.case_type || '').toLowerCase();
  const gisType = (c.intake_sheet?.case_category_type || '').toLowerCase();
  const off = (c.display_offense || '').toLowerCase();
  const allNotes = (
    (c.case_summary || '') +
    ' ' +
    (c.intake_notes || '') +
    ' ' +
    (c.intake_sheet?.case_category_other || '') +
    ' ' +
    off
  ).toLowerCase();

  // 1. Rape / Attempted Rape
  if (t === 'rape' || gisType === 'rape' || allNotes.includes('rape') || allNotes.includes('sexual assault')) {
    return 'rape';
  }

  // 2. Acts of Lasciviousness
  if (
    t === 'acts_of_lasciviousness' ||
    gisType === 'acts_of_lasciviousness' ||
    allNotes.includes('lascivious') ||
    allNotes.includes('acts of lasciviousness')
  ) {
    return 'acts_of_lasciviousness';
  }

  // 3. Child Custody & Support
  if (
    gisType === 'child_custody' ||
    gisType === 'child_support' ||
    allNotes.includes('child support') ||
    allNotes.includes('custody') ||
    allNotes.includes('sustento') ||
    allNotes.includes('visitation')
  ) {
    return 'child_custody_support';
  }

  // 4. VAWC (RA 9262)
  if (
    t.startsWith('vawc') ||
    gisType === 'vawc' ||
    t === 'vawc_physical' ||
    t === 'vawc_psychological' ||
    t === 'vawc_economic' ||
    t === 'vawc_sexual' ||
    allNotes.includes('9262') ||
    allNotes.includes('vawc') ||
    allNotes.includes('bpo')
  ) {
    return 'vawc';
  }

  // 5. VAC (RA 7610)
  if (
    t.startsWith('vac') ||
    t === 'cicl' ||
    gisType === 'vac_abuse' ||
    gisType === 'vac_neglect' ||
    gisType === 'child_abuse' ||
    gisType === 'child_neglect' ||
    allNotes.includes('7610') ||
    allNotes.includes('child physical abuse')
  ) {
    return 'child_abuse_vac';
  }

  return 'other';
}

export function formatHumanDate(rawDate?: string): string {
  if (!rawDate) return '—';
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return rawDate;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  } catch {
    return rawDate;
  }
}

export const CATEGORY_TABS: {
  id: MainCategoryTab;
  label: string;
  shortLabel: string;
  badgeColor: string;
  activeColor: string;
}[] = [
  {
    id: 'all',
    label: 'All Inventory',
    shortLabel: 'All Inventory',
    badgeColor: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
    activeColor: 'bg-[#0f172a] text-white border-slate-900 shadow-2xs',
  },
  {
    id: 'vawc',
    label: 'VAWC Desk (RA 9262)',
    shortLabel: 'VAWC Desk',
    badgeColor: 'bg-white text-purple-900 border-purple-200/90 hover:bg-purple-50/50',
    activeColor: 'bg-[#581c87] text-white border-purple-900 shadow-2xs',
  },
  {
    id: 'child_abuse_vac',
    label: 'VAC Monitoring (RA 7610)',
    shortLabel: 'VAC Monitoring',
    badgeColor: 'bg-white text-blue-900 border-blue-200/90 hover:bg-blue-50/50',
    activeColor: 'bg-blue-900 text-white border-blue-900 shadow-2xs',
  },
  {
    id: 'child_custody_support',
    label: 'Custody & Support',
    shortLabel: 'Custody & Support',
    badgeColor: 'bg-white text-emerald-900 border-emerald-200/90 hover:bg-emerald-50/50',
    activeColor: 'bg-emerald-900 text-white border-emerald-900 shadow-2xs',
  },
  {
    id: 'rape',
    label: 'Rape & Crisis',
    shortLabel: 'Rape & Crisis',
    badgeColor: 'bg-white text-rose-900 border-rose-200/90 hover:bg-rose-50/50',
    activeColor: 'bg-rose-900 text-white border-rose-900 shadow-2xs',
  },
  {
    id: 'acts_of_lasciviousness',
    label: 'Lasciviousness & Others',
    shortLabel: 'Lasciviousness & Others',
    badgeColor: 'bg-white text-amber-950 border-amber-300/80 hover:bg-amber-50/50',
    activeColor: 'bg-amber-900 text-white border-amber-900 shadow-2xs',
  },
];

export default function CasesDesktop() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [trashCases, setTrashCases] = useState<CaseRecord[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<MainCategoryTab>('all');
  const [barangayFilter, setBarangayFilter] = useState<string>('all');
  const [yearMonthFilter, setYearMonthFilter] = useState<string>('all');

  // Pagination (10 per page matching Figma design)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Confidential Identity Masking State (defaults to unmasked as shown in Figma screenshot)
  const [revealedIdentities, setRevealedIdentities] = useState<Record<string, boolean>>({});

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [crisisModalOpen, setCrisisModalOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Schedule Modal
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleTargetCase, setScheduleTargetCase] = useState<CaseRecord | null>(null);

  // Trash & Permanent Delete Confirmation Modals
  const [caseToTrash, setCaseToTrash] = useState<CaseRecord | null>(null);
  const [caseToPermanentDelete, setCaseToPermanentDelete] = useState<CaseRecord | null>(null);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // Success Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('10:42 AM');

  useEffect(() => {
    void loadCases();

    function handleDataChanged(e: any) {
      if (
        !e.detail?.table ||
        e.detail.table === 'cases' ||
        e.detail.table === 'case_attachments' ||
        e.detail.table === 'case_notes'
      ) {
        void loadCases(false);
      }
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    window.addEventListener('mswdo:cases-changed', handleDataChanged);
    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
      window.removeEventListener('mswdo:cases-changed', handleDataChanged);
    };
  }, []);

  // Set real formatted sync time on mount
  useEffect(() => {
    try {
      const now = new Date();
      setLastSyncedTime(
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      );
    } catch {
      setLastSyncedTime('10:42 AM');
    }
  }, []);

  // Supabase Realtime synchronization on public.cases + periodic heartbeat
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

    if (supabase) {
      channel = supabase
        .channel('cases-realtime-directory-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cases' },
          async (payload) => {
            console.log('[Realtime Directory] Supabase cases updated:', payload);
            await syncCasesFromSupabase();
            void loadCases(false);
          }
        )
        .subscribe();
    }

    // Heartbeat auto-poll every 12 seconds to guarantee instant real-time sync with Supabase
    const interval = setInterval(() => {
      void syncCasesFromSupabase().then(() => loadCases(false));
    }, 12_000);

    return () => {
      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
      clearInterval(interval);
    };
  }, []);

  async function loadCases(force = false) {
    setIsLoading(true);
    try {
      if (force) {
        await syncCasesFromSupabase();
      }
      let [data, trashed] = await Promise.all([getCases(), getTrashCases()]);

      if (data.length === 0 && force) {
        const synced = await syncCasesFromSupabase();
        if (synced && synced.length > 0) {
          data = await getCases();
        }
      }

      setCases(data);
      setTrashCases(trashed);
      const now = new Date();
      setLastSyncedTime(
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      );
    } catch (err) {
      console.error('Failed to load cases:', err);
      setCases([]);
    } finally {
      setIsLoading(false);
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }

  function toggleIdentityReveal(caseId: string) {
    setRevealedIdentities((prev) => {
      const currentlyMasked = prev[caseId] === false;
      const nextState = { ...prev, [caseId]: currentlyMasked ? true : false };
      if (currentlyMasked) {
        showToast('👁️ Client identity revealed for authorized casework purpose (Audit Logged).');
      } else {
        showToast('🔒 Client identity masked for confidentiality.');
      }
      return nextState;
    });
  }

  async function handleMoveToTrash(c: CaseRecord) {
    setIsActionPending(true);
    try {
      await moveCaseToTrash(c.id);
      showToast(`🗑️ Case ${c.case_number} moved to Trash Bin. Click "Trash Bin" to view or restore.`);
      setCaseToTrash(null);
      await loadCases(true);
    } catch (err) {
      console.error('Error moving case to trash:', err);
      showToast('Failed to move case to trash.');
    } finally {
      setIsActionPending(false);
    }
  }

  async function handleRestoreFromTrash(c: CaseRecord) {
    setIsActionPending(true);
    try {
      await restoreCaseFromTrash(c.id);
      showToast(`✅ Case ${c.case_number} restored to Master Case Directory.`);
      await loadCases(true);
    } catch (err) {
      console.error('Error restoring case:', err);
      showToast('Failed to restore case.');
    } finally {
      setIsActionPending(false);
    }
  }

  async function handlePermanentDelete(c: CaseRecord) {
    setIsActionPending(true);
    try {
      await permanentlyDeleteCase(c.id);
      showToast(`🗑️ Case ${c.case_number} permanently deleted from database.`);
      setCaseToPermanentDelete(null);
      await loadCases(true);
    } catch (err) {
      console.error('Error permanently deleting case:', err);
      showToast('Failed to permanently delete case.');
    } finally {
      setIsActionPending(false);
    }
  }

  async function handleEmptyTrash() {
    setIsActionPending(true);
    try {
      const { deletedCount } = await emptyTrashCases();
      showToast(`Emptied ${deletedCount} case${deletedCount !== 1 ? 's' : ''} from Trash.`);
      setConfirmEmptyTrash(false);
      await loadCases(true);
    } catch (err) {
      console.error('Error emptying trash:', err);
      showToast('Failed to empty trash.');
    } finally {
      setIsActionPending(false);
    }
  }

  // Print Masterlist
  function handlePrintMasterlist() {
    window.print();
  }

  // Download Excel
  function handleDownloadExcel() {
    if (filteredCases.length === 0) {
      showToast('No cases to export.');
      return;
    }

    if (categoryFilter === 'vawc') {
      downloadVawcLogbook(filteredCases);
      showToast(`Exported ${filteredCases.length} cases to official VAWC Registry.`);
      return;
    }
    if (categoryFilter === 'child_abuse_vac') {
      downloadVacLogbook(filteredCases);
      showToast(`Exported ${filteredCases.length} cases to VAC Monitoring Form.`);
      return;
    }
    if (categoryFilter === 'child_custody_support') {
      downloadChildCustodySupportLogbook(filteredCases);
      showToast(`Exported ${filteredCases.length} cases to Child Custody & Support Registry.`);
      return;
    }
    downloadMasterInventoryLogbook(filteredCases);
    showToast(`Exported ${filteredCases.length} cases to Master Case Inventory.`);
  }

  // Filtered cases calculation
  const filteredCases = useMemo(() => {
    let result = cases;

    // 1. Category Tab Filter
    if (categoryFilter !== 'all') {
      result = result.filter((c) => {
        const catGroup = getCaseCategoryGroup(c);
        if (categoryFilter === 'acts_of_lasciviousness') {
          return catGroup === 'acts_of_lasciviousness' || catGroup === 'other';
        }
        return catGroup === categoryFilter;
      });
    }

    // 2. Status Filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => {
        if (c.status === statusFilter) return true;
        // Backward-compatible matching
        if (statusFilter === 'active' && (c.status === 'under_bpo_tpo' || (c.display_status || '').toLowerCase().includes('intake'))) {
          return true;
        }
        return false;
      });
    }

    // 3. Barangay Filter
    if (barangayFilter !== 'all') {
      const bNorm = barangayFilter.toLowerCase().replace(/[^a-z0-9]/g, '');
      result = result.filter((c) => {
        const cBarangay = (c.barangay_id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return cBarangay.includes(bNorm);
      });
    }

    // 4. Year / Month Filter
    if (yearMonthFilter !== 'all') {
      result = result.filter((c) => {
        const dateStr = c.reported_at || '';
        return dateStr.startsWith(yearMonthFilter);
      });
    }

    // 5. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((c) => {
        return (
          (c.case_number || '').toLowerCase().includes(q) ||
          (c.victim_name || '').toLowerCase().includes(q) ||
          (c.perpetrator_name && c.perpetrator_name.toLowerCase().includes(q)) ||
          (c.barangay_id && c.barangay_id.toLowerCase().includes(q)) ||
          (c.assigned_worker_name && c.assigned_worker_name.toLowerCase().includes(q)) ||
          (c.display_offense && c.display_offense.toLowerCase().includes(q)) ||
          (c.case_summary && c.case_summary.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [cases, categoryFilter, statusFilter, barangayFilter, yearMonthFilter, searchQuery]);

  // Trash filtered
  const filteredTrashCases = useMemo(() => {
    if (!searchQuery.trim()) return trashCases;
    const q = searchQuery.toLowerCase().trim();
    return trashCases.filter(
      (c) =>
        (c.case_number || '').toLowerCase().includes(q) ||
        (c.victim_name || '').toLowerCase().includes(q) ||
        (c.perpetrator_name && c.perpetrator_name.toLowerCase().includes(q)),
    );
  }, [trashCases, searchQuery]);

  // Dynamic counts for category tabs strictly based on actual real-time cases
  const categoryCounts = useMemo(() => {
    const total = cases.length;
    const vawc = cases.filter((c) => getCaseCategoryGroup(c) === 'vawc').length;
    const vac = cases.filter((c) => getCaseCategoryGroup(c) === 'child_abuse_vac').length;
    const custody = cases.filter((c) => getCaseCategoryGroup(c) === 'child_custody_support').length;
    const rape = cases.filter((c) => getCaseCategoryGroup(c) === 'rape').length;
    const other = cases.filter(
      (c) => getCaseCategoryGroup(c) === 'acts_of_lasciviousness' || getCaseCategoryGroup(c) === 'other'
    ).length;

    return {
      all: total,
      vawc,
      child_abuse_vac: vac,
      child_custody_support: custody,
      rape,
      acts_of_lasciviousness: other,
    };
  }, [cases]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredCases.length / pageSize));
  const paginatedCases = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCases.slice(start, start + pageSize);
  }, [filteredCases, currentPage]);

  // Helper to render BPO Statutory Tracker pill matching Figma design
  function renderBpoTracker(c: CaseRecord) {
    const text = c.bpo_tracker_display;

    if (text) {
      if (text.includes('BPO Day') || text.includes('Safety plan active')) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-emerald-500/70 bg-emerald-50/60 text-emerald-800">
            <ShieldCheck className="h-3 w-3 text-emerald-600 shrink-0" />
            <span>{text}</span>
          </span>
        );
      }
      if (text.includes('Expires')) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-amber-500/70 bg-amber-50/60 text-amber-900">
            <Clock className="h-3 w-3 text-amber-600 shrink-0" />
            <span>{text}</span>
          </span>
        );
      }
      if (text.includes('Expired')) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-rose-400 bg-rose-50/60 text-rose-800">
            <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
            <span>{text}</span>
          </span>
        );
      }
      return <span className="text-slate-500 text-xs font-medium">{text}</span>;
    }

    // Default computed fallback
    if (c.status === 'under_bpo_tpo') {
      const bpo = getBpoStatusInfo(c.reported_at);
      if (bpo.isExpired) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-rose-400 bg-rose-50/60 text-rose-800">
            <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
            <span>Expired — File Court TPO</span>
          </span>
        );
      }
      if (bpo.isExpiringSoon) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-amber-500/70 bg-amber-50/60 text-amber-900">
            <Clock className="h-3 w-3 text-amber-600 shrink-0" />
            <span>BPO Expires in {bpo.daysRemaining}d · Day {bpo.dayNumber}</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-emerald-500/70 bg-emerald-50/60 text-emerald-800">
          <ShieldCheck className="h-3 w-3 text-emerald-600 shrink-0" />
          <span>BPO Day {bpo.dayNumber} of 15 · {bpo.daysRemaining}d left</span>
        </span>
      );
    }

    const catGroup = getCaseCategoryGroup(c);
    if (catGroup === 'rape') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-emerald-500/70 bg-emerald-50/60 text-emerald-800">
          <ShieldCheck className="h-3 w-3 text-emerald-600 shrink-0" />
          <span>Safety plan active</span>
        </span>
      );
    }
    if (catGroup === 'child_abuse_vac') {
      return <span className="text-slate-500 text-xs font-medium">— Not applicable · VAC protocol</span>;
    }
    if (c.status === 'resolved_closed') {
      return <span className="text-slate-500 text-xs font-medium">— Case resolved · no BPO</span>;
    }
    return <span className="text-slate-500 text-xs font-medium">— No BPO requested</span>;
  }

  // Status configuration matching the official dropdown from Image 2
  const STATUS_CONFIG: Record<
    CaseStatus,
    { label: string; badgeClass: string }
  > = {
    active: {
      label: 'Active Case',
      badgeClass: 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100/70',
    },
    under_bpo_tpo: {
      label: 'Under BPO / TPO',
      badgeClass: 'bg-indigo-50 border-indigo-300 text-indigo-900 hover:bg-indigo-100/70',
    },
    referred_pnp_wcpd: {
      label: 'Referred to PNP-WCPD',
      badgeClass: 'bg-sky-50 border-sky-300 text-sky-900 hover:bg-sky-100/70',
    },
    filed_in_court: {
      label: 'Filed in Court',
      badgeClass: 'bg-violet-50 border-violet-300 text-violet-900 hover:bg-violet-100/70',
    },
    resolved_closed: {
      label: 'Resolved / Closed',
      badgeClass: 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100/70',
    },
    monitoring: {
      label: 'Monitoring',
      badgeClass: 'bg-teal-50 border-teal-300 text-teal-900 hover:bg-teal-100/70',
    },
  };

  async function handleInlineStatusChange(caseId: string, newStatus: CaseStatus) {
    try {
      await updateCase(caseId, { status: newStatus });
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? { ...c, status: newStatus } : c))
      );
      showToast(`Case status updated to "${STATUS_CONFIG[newStatus]?.label || newStatus}" and synced to Supabase.`);
    } catch (err) {
      console.error('Failed to update case status:', err);
      showToast('Failed to update status. Please try again.');
    }
  }

  // Render Status Selector Dropdown matching Image 2
  function renderStatusBadge(c: CaseRecord) {
    const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.active;

    return (
      <div onClick={(e) => e.stopPropagation()} className="inline-block">
        <select
          value={c.status}
          onChange={(e) => handleInlineStatusChange(c.id, e.target.value as CaseStatus)}
          aria-label={`Status for ${c.case_number}`}
          className={cn(
            'text-xs font-bold rounded-xl px-2.5 py-1.5 border shadow-2xs transition outline-none cursor-pointer whitespace-nowrap',
            config.badgeClass,
          )}
        >
          <option value="active">Active Case</option>
          <option value="under_bpo_tpo">Under BPO / TPO</option>
          <option value="referred_pnp_wcpd">Referred to PNP-WCPD</option>
          <option value="filed_in_court">Filed in Court</option>
          <option value="resolved_closed">Resolved / Closed</option>
          <option value="monitoring">Monitoring</option>
        </select>
      </div>
    );
  }

  // Helper to render Assigned Social Worker with initial avatar
  function renderSocialWorker(name?: string) {
    const displayName = name || 'A. Villanueva';
    const clean = displayName.replace(/[^a-zA-Z\s]/g, '').trim();
    const parts = clean.split(/\s+/);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : clean.substring(0, 2).toUpperCase() || 'SW';

    return (
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] flex items-center justify-center shrink-0">
          {initials}
        </div>
        <span className="text-xs font-medium text-slate-700 truncate">{displayName}</span>
      </div>
    );
  }

  function formatBarangay(b?: string): string {
    if (!b) return 'Unspecified Barangay';
    const clean = b.trim().toLowerCase();
    if (clean === 'poblacion') return 'Brgy. Poblacion';
    if (clean === 'cadunan') return 'Brgy. Cadunan';
    if (clean === 'san-isidro' || clean === 'san_isidro') return 'Brgy. San Isidro';
    if (clean === 'mabini') return 'Brgy. Mabini';
    if (clean === 'sta-cruz' || clean === 'sta_cruz') return 'Brgy. Sta. Cruz';
    if (clean === 'bagong-silang' || clean === 'bagong_silang') return 'Brgy. Bagong Silang';
    if (clean === 'rizal') return 'Brgy. Rizal';
    const title = b.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    return title.startsWith('Brgy') ? title : `Brgy. ${title}`;
  }

  // Helper to render Client name with Eye / EyeOff confidential masking toggle
  function renderClientName(c: CaseRecord) {
    const isMasked = revealedIdentities[c.id] === false;
    const rawName = c.victim_name?.trim() ? c.victim_name : 'Confidential Client';
    const displayName = isMasked
      ? rawName.replace(/([a-zA-Z]{1})[a-zA-Z]+/g, '$1***')
      : rawName;

    const barangayLabel = formatBarangay(c.barangay_id);

    return (
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-xs text-slate-900">{displayName}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleIdentityReveal(c.id);
            }}
            className="p-0.5 rounded text-purple-600 hover:text-purple-800 transition cursor-pointer"
            title={
              isMasked
                ? 'Reveal client identity (Audit Logged)'
                : 'Mask client identity for confidentiality'
            }
          >
            {isMasked ? (
              <Eye className="h-3.5 w-3.5 text-slate-400 hover:text-purple-600" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-purple-600 hover:text-purple-800" />
            )}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">{barangayLabel}</p>
      </div>
    );
  }

  // Helper to render Category & Offense
  function renderCategoryAndOffense(c: CaseRecord) {
    const catGroup = getCaseCategoryGroup(c);
    let categoryLabel = 'VAWC';
    let categoryClass = 'text-slate-900 font-bold';
    let offenseSubtext = c.display_offense || 'Physical Abuse (RA 9262)';

    if (catGroup === 'child_abuse_vac') {
      categoryLabel = 'VAC Monitoring';
      categoryClass = 'text-blue-600 font-bold';
      offenseSubtext = c.display_offense || 'Child Physical Abuse (RA 7610)';
    } else if (catGroup === 'child_custody_support') {
      categoryLabel = 'Custody & Support';
      categoryClass = 'text-slate-900 font-bold';
      offenseSubtext = c.display_offense || 'Child Support Neglect';
    } else if (catGroup === 'rape') {
      categoryLabel = 'Rape & Crisis';
      categoryClass = 'text-rose-600 font-bold';
      offenseSubtext = c.display_offense || 'Sexual Assault / Crisis Referral';
    } else if (catGroup === 'acts_of_lasciviousness') {
      categoryLabel = 'Lasciviousness & Others';
      categoryClass = 'text-amber-800 font-bold';
      offenseSubtext = c.display_offense || 'Acts of Lasciviousness';
    } else if (catGroup === 'other') {
      categoryLabel = c.display_offense?.includes('Custody') ? 'Custody & Support' : 'Special Protection';
      categoryClass = 'text-slate-900 font-bold';
    }

    return (
      <div>
        <p className={cn('text-xs', categoryClass)}>{categoryLabel}</p>
        <p className="text-[11.5px] text-slate-500 mt-0.5">{offenseSubtext}</p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto space-y-5 bg-slate-50/50 min-h-screen">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white shadow-xl text-xs font-semibold animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ================= BREADCRUMB & HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-purple-700 tracking-wider uppercase mb-1">
            MSWDO › CASE INVENTORY
          </p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Master Case Directory
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Confidential records are audit-logged. Reveal client identities only for an authorized case purpose.
          </p>
        </div>

        {/* Action Buttons on Right */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handlePrintMasterlist}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-98"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            <span>Print Masterlist</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-98"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Download Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setNewCaseModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#581c87] hover:bg-[#4a1572] text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-98"
          >
            <Plus className="h-4 w-4 text-white" />
            <span>New Case</span>
          </button>
        </div>
      </div>

      {/* ================= CATEGORY PILL TABS ================= */}
      {viewMode === 'active' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORY_TABS.map((tab) => {
            const isSelected = categoryFilter === tab.id;
            const count = categoryCounts[tab.id as keyof typeof categoryCounts] ?? 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(tab.id);
                  setCurrentPage(1);
                }}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-bold transition shrink-0 border cursor-pointer select-none',
                  isSelected && tab.id === 'all' && 'bg-[#0f172a] text-white border-transparent shadow-2xs',
                  isSelected && tab.id === 'vawc' && 'bg-[#581c87] text-white border-transparent shadow-2xs',
                  isSelected && tab.id === 'child_abuse_vac' && 'bg-blue-800 text-white border-transparent shadow-2xs',
                  isSelected && tab.id === 'child_custody_support' && 'bg-emerald-800 text-white border-transparent shadow-2xs',
                  isSelected && tab.id === 'rape' && 'bg-rose-800 text-white border-transparent shadow-2xs',
                  isSelected && tab.id === 'acts_of_lasciviousness' && 'bg-amber-800 text-white border-transparent shadow-2xs',
                  !isSelected && tab.id === 'all' && 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                  !isSelected && tab.id === 'vawc' && 'bg-white text-purple-700 border-purple-200/90 hover:bg-purple-50/50',
                  !isSelected && tab.id === 'child_abuse_vac' && 'bg-white text-blue-600 border-blue-200/90 hover:bg-blue-50/50',
                  !isSelected && tab.id === 'child_custody_support' && 'bg-white text-emerald-600 border-emerald-200/90 hover:bg-emerald-50/50',
                  !isSelected && tab.id === 'rape' && 'bg-white text-rose-600 border-rose-200/90 hover:bg-rose-50/50',
                  !isSelected && tab.id === 'acts_of_lasciviousness' && 'bg-white text-amber-700 border-amber-200/90 hover:bg-amber-50/50',
                )}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* ================= FILTER TOOLBAR ================= */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Filter by Case Docket, Victim, or Perpetrator..."
            className="w-full pl-10 pr-9 py-2.5 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dropdowns Row */}
        <div className="flex flex-wrap items-center gap-2.5">
          {viewMode === 'active' && (
            <>
              {/* Status Dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 cursor-pointer shadow-2xs"
              >
                <option value="all">Status: All Statuses</option>
                <option value="active">Active Case</option>
                <option value="under_bpo_tpo">Under BPO / TPO</option>
                <option value="referred_pnp_wcpd">Referred to PNP-WCPD</option>
                <option value="filed_in_court">Filed in Court</option>
                <option value="resolved_closed">Resolved / Closed</option>
                <option value="monitoring">Monitoring</option>
              </select>

              {/* Barangay Dropdown */}
              <select
                value={barangayFilter}
                onChange={(e) => {
                  setBarangayFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 cursor-pointer shadow-2xs"
              >
                <option value="all">Barangay: All 16 Barangays</option>
                <option value="poblacion">Poblacion</option>
                <option value="cadunan">Cadunan</option>
                <option value="san-isidro">San Isidro</option>
                <option value="mabini">Mabini</option>
                <option value="sta-cruz">Sta. Cruz</option>
                <option value="bagong-silang">Bagong Silang</option>
                <option value="rizal">Rizal</option>
                {BARANGAY_REGISTRY.map((b) => (
                  <option key={b.id} value={b.id}>
                    Brgy. {b.label}
                  </option>
                ))}
              </select>

              {/* Year / Month Dropdown */}
              <select
                value={yearMonthFilter}
                onChange={(e) => {
                  setYearMonthFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 cursor-pointer shadow-2xs"
              >
                <option value="all">Year / Month</option>
                <option value="2026-10">October 2026</option>
                <option value="2026-09">September 2026</option>
                <option value="2026-08">August 2026</option>
                <option value="2026">Year 2026</option>
                <option value="2025">Year 2025</option>
              </select>
            </>
          )}

          {/* Segmented Switcher (Active Cases / Trash Bin) */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200/80 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('active')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
                viewMode === 'active'
                  ? 'bg-white text-purple-950 shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-slate-800'
              )}
            >
              <FolderOpen className="h-3.5 w-3.5 text-purple-700" />
              <span>Active Cases</span>
              <span className="px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 text-[10.5px] font-black">
                {cases.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('trash')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
                viewMode === 'trash'
                  ? 'bg-white text-rose-700 shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-rose-700'
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Trash Bin</span>
              {trashCases.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 text-[10.5px] font-black">
                  {trashCases.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ================= TABLE CARD ================= */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {viewMode === 'trash' ? (
          /* TRASH VIEW: CLEAN ENTERPRISE DATA TABLE */
          <div>
            {/* Elegant Header Bar */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200/60 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Trash Bin Archive
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {trashCases.length} {trashCases.length === 1 ? 'case' : 'cases'} archived · You can restore cases to the active directory or permanently erase them.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('active')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />
                  <span>Back to Active Cases</span>
                </button>

                {trashCases.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmEmptyTrash(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition shadow-2xs cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Empty All Trash</span>
                  </button>
                )}
              </div>
            </div>

            {/* Trashed Cases Table */}
            {filteredTrashCases.length === 0 ? (
              <div className="py-16 text-center space-y-2.5">
                <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Trash2 className="h-5 w-5" />
                </div>
                <p className="text-xs font-bold text-slate-700">Trash Bin is empty</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  {searchQuery ? 'No trashed cases match your search query.' : 'No deleted cases found in this archive.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setViewMode('active');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition shadow-xs cursor-pointer mt-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Return to Active Directory</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#1e293b] text-white text-[11px] font-bold uppercase tracking-wider select-none">
                    <tr>
                      <th className="py-3 px-4 font-bold">DOCKET NUMBER &amp; DELETED AT</th>
                      <th className="py-3 px-4 font-bold">CLIENT / VICTIM</th>
                      <th className="py-3 px-4 font-bold">AGE / SEX</th>
                      <th className="py-3 px-4 font-bold">CASE CATEGORY &amp; OFFENSE</th>
                      <th className="py-3 px-4 font-bold">STATUS BEFORE TRASH</th>
                      <th className="py-3 px-4 font-bold text-center">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800 text-xs">
                    {filteredTrashCases.map((c) => {
                      const deletedDate = c.deleted_at
                        ? new Date(c.deleted_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'Recently';

                      const rawClientName = c.victim_name?.trim() ? c.victim_name : 'Confidential Client';
                      const isMasked = revealedIdentities[c.id] === false;
                      const clientName = isMasked
                        ? rawClientName.replace(/([a-zA-Z]{1})[a-zA-Z]+/g, '$1***')
                        : rawClientName;

                      const catGroup = getCaseCategoryGroup(c);
                      let categoryLabel = 'VAWC Desk (RA 9262)';
                      let categoryClass = 'text-purple-900 font-bold';
                      let offenseSubtext = c.display_offense || 'Physical Abuse (RA 9262)';

                      if (catGroup === 'child_abuse_vac') {
                        categoryLabel = 'VAC Monitoring (RA 7610)';
                        categoryClass = 'text-blue-700 font-bold';
                        offenseSubtext = c.display_offense || 'Child Protection';
                      } else if (catGroup === 'child_custody_support') {
                        categoryLabel = 'Custody & Support';
                        categoryClass = 'text-emerald-700 font-bold';
                        offenseSubtext = c.display_offense || 'Support Neglect';
                      } else if (catGroup === 'rape') {
                        categoryLabel = 'Rape & Crisis';
                        categoryClass = 'text-rose-700 font-bold';
                        offenseSubtext = c.display_offense || 'Crisis Referral';
                      } else if (catGroup === 'acts_of_lasciviousness') {
                        categoryLabel = 'Lasciviousness & Others';
                        categoryClass = 'text-amber-800 font-bold';
                        offenseSubtext = c.display_offense || 'Acts of Lasciviousness';
                      }

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition">
                          {/* Docket */}
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-xs text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200/60 inline-block shadow-2xs">
                              {c.case_number}
                            </span>
                            <span className="block text-[11px] text-slate-400 mt-1">
                              Deleted: {deletedDate}
                            </span>
                            {c.deleted_by && (
                              <span className="block text-[10px] text-slate-400">
                                By: {c.deleted_by}
                              </span>
                            )}
                          </td>

                          {/* Client / Victim */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-900">{clientName}</span>
                              <button
                                type="button"
                                onClick={() => toggleIdentityReveal(c.id)}
                                className="p-0.5 rounded text-purple-600 hover:text-purple-800 transition cursor-pointer"
                                title={isMasked ? 'Reveal client identity' : 'Mask client identity'}
                              >
                                {isMasked ? (
                                  <Eye className="h-3 w-3 text-slate-400 hover:text-purple-600" />
                                ) : (
                                  <EyeOff className="h-3 w-3 text-purple-600 hover:text-purple-800" />
                                )}
                              </button>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {formatBarangay(c.barangay_id)}
                            </div>
                          </td>

                          {/* Age / Sex */}
                          <td className="py-3.5 px-4 text-slate-600 font-medium">
                            {c.victim_age ? `${c.victim_age} yrs` : '—'} · {c.victim_gender === 'M' ? 'Male' : c.victim_gender === 'F' ? 'Female' : '—'}
                          </td>

                          {/* Category & Offense */}
                          <td className="py-3.5 px-4">
                            <div className={cn('text-xs', categoryClass)}>
                              {categoryLabel}
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-1 max-w-xs mt-0.5">
                              {offenseSubtext}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                              {(c.status || 'Active').replace(/_/g, ' ')}
                            </span>
                          </td>

                          {/* Actions: Refined Micro-Buttons */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Restore Button */}
                              <button
                                type="button"
                                disabled={isActionPending}
                                onClick={() => handleRestoreFromTrash(c)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                                title="Restore case to Active Directory"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Restore</span>
                              </button>

                              {/* Permanent Delete Button */}
                              <button
                                type="button"
                                disabled={isActionPending}
                                onClick={() => setCaseToPermanentDelete(c)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200/90 font-bold text-xs transition shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                                title="Permanently erase this record forever"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                <span>Delete</span>
                              </button>

                              {/* View Details */}
                              <button
                                type="button"
                                onClick={() => setSelectedCaseId(c.id)}
                                title="View details"
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-2xs cursor-pointer"
                              >
                                <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ACTIVE MASTER CASE DIRECTORY TABLE */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              {/* Dark Navy Table Header */}
              <thead className="bg-[#1e293b] text-white text-[11px] font-bold uppercase tracking-wider select-none">
                <tr>
                  <th className="py-3.5 px-4 font-bold">DOCKET NUMBER &amp; DATE</th>
                  <th className="py-3.5 px-4 font-bold">CLIENT / VICTIM</th>
                  <th className="py-3.5 px-4 font-bold">AGE</th>
                  <th className="py-3.5 px-4 font-bold">SEX</th>
                  <th className="py-3.5 px-4 font-bold">CASE CATEGORY &amp; OFFENSE</th>
                  <th className="py-3.5 px-4 font-bold">BPO STATUTORY TRACKER</th>
                  <th className="py-3.5 px-4 font-bold">ASSIGNED SOCIAL WORKER</th>
                  <th className="py-3.5 px-4 font-bold">STATUS</th>
                  <th className="py-3.5 px-4 font-bold text-center">ACTIONS</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-100 text-slate-800 text-xs">
                {paginatedCases.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-slate-400">
                      <FolderLock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-bold text-sm text-slate-700">No cases match your filter</p>
                      <p className="text-xs text-slate-400 mt-1">Try resetting the search or category filter</p>
                    </td>
                  </tr>
                ) : (
                  paginatedCases.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCaseId(c.id)}
                      className="hover:bg-slate-50/80 transition cursor-pointer"
                    >
                      {/* 1. Docket & Date */}
                      <td className="py-3.5 px-4">
                        <p className="font-mono font-bold text-xs text-[#6b21a8] hover:underline">
                          {c.case_number}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {formatHumanDate(c.reported_at)}
                        </p>
                      </td>

                      {/* 2. Client / Victim */}
                      <td className="py-3.5 px-4">
                        {renderClientName(c)}
                      </td>

                      {/* 3. Age */}
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {c.victim_age || '—'}
                      </td>

                      {/* 4. Sex */}
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {c.victim_gender === 'M' ? 'Male' : 'Female'}
                      </td>

                      {/* 5. Case Category & Offense */}
                      <td className="py-3.5 px-4">
                        {renderCategoryAndOffense(c)}
                      </td>

                      {/* 6. BPO Statutory Tracker */}
                      <td className="py-3.5 px-4">
                        {renderBpoTracker(c)}
                      </td>

                      {/* 7. Assigned Social Worker */}
                      <td className="py-3.5 px-4">
                        {renderSocialWorker(c.assigned_worker_name)}
                      </td>

                      {/* 8. Status */}
                      <td className="py-3.5 px-4">
                        {renderStatusBadge(c)}
                      </td>

                      {/* 9. Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div
                          className="flex items-center justify-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Dossier Book button */}
                          <button
                            type="button"
                            onClick={() => setSelectedCaseId(c.id)}
                            title="Open Case Dossier"
                            className="p-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-100 transition cursor-pointer"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                          </button>

                          {/* Hearing Schedule Calendar button */}
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleTargetCase(c);
                              setIsScheduleModalOpen(true);
                            }}
                            title="Set Client Return & Hearing Schedule"
                            className="p-1.5 rounded-lg bg-slate-50 text-slate-600 hover:text-purple-700 hover:bg-purple-50 border border-slate-200/80 transition cursor-pointer"
                          >
                            <Calendar className="h-3.5 w-3.5" />
                          </button>

                          {/* Trash button */}
                          <button
                            type="button"
                            onClick={() => setCaseToTrash(c)}
                            title="Move to Trash"
                            className="p-1.5 rounded-lg bg-rose-50/60 text-rose-500 hover:text-rose-700 hover:bg-rose-100 border border-rose-100 transition cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ================= FOOTER WITH PAGINATION ================= */}
        {viewMode === 'active' && filteredCases.length > 0 && (
          <div className="px-6 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-white">
            <div>
              Showing {Math.min((currentPage - 1) * pageSize + 1, filteredCases.length)}–
              {Math.min(currentPage * pageSize, filteredCases.length)} of {filteredCases.length} cases{' '}
              <span className="text-slate-300">•</span> Last synced {lastSyncedTime}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                if (
                  pageNum === 1 ||
                  pageNum === totalPages ||
                  (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                ) {
                  const isActive = currentPage === pageNum;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        'h-7 min-w-[28px] px-2 rounded-lg text-xs font-bold transition cursor-pointer',
                        isActive
                          ? 'bg-[#581c87] text-white shadow-2xs'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                }

                if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                  return (
                    <span key={pageNum} className="text-slate-400 px-1 text-xs">
                      …
                    </span>
                  );
                }

                return null;
              })}

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= MODALS ================= */}

      {/* Hearing Schedule Modal */}
      <SetHearingScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setScheduleTargetCase(null);
        }}
        caseRecord={scheduleTargetCase || cases[0] || null}
        allCases={cases}
        onScheduleCreated={(created) => {
          showToast(`Hearing schedule created for ${created.client_name}`);
          void loadCases(false);
        }}
      />

      {/* Excel Upload Modal */}
      <CaseExcelUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={(count) => {
          void loadCases(true);
          showToast(`Successfully imported ${count} cases into MSWDO Case Directory!`);
        }}
      />

      {/* New Case Modal */}
      <NewCaseModal
        isOpen={newCaseModalOpen}
        onClose={() => setNewCaseModalOpen(false)}
        onSuccess={(newCase) => {
          void loadCases(true);
          showToast(`New case ${newCase.case_number} recorded successfully!`);
          setSelectedCaseId(newCase.id);
        }}
      />

      {/* Emergency Crisis Intake Modal */}
      <EmergencyCrisisIntakeModal
        isOpen={crisisModalOpen}
        onClose={() => setCrisisModalOpen(false)}
        onSuccess={(createdCase) => {
          void loadCases(true);
          showToast(`🚨 Crisis walk-in logged: ${createdCase.case_number} (${createdCase.victim_name})`);
          setSelectedCaseId(createdCase.id);
        }}
      />

      {/* Case Detail Modal */}
      <CaseDetailModal
        isOpen={Boolean(selectedCaseId)}
        caseId={selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        onCaseUpdated={() => void loadCases(true)}
      />

      {/* Move to Trash Modal */}
      {caseToTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Move Case to Trash?</h3>
                <p className="text-xs text-slate-500 font-mono">{caseToTrash.case_number}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-700 space-y-1.5">
              <p>
                <span className="font-semibold text-slate-500">Client / Victim:</span>{' '}
                <strong className="text-slate-900">{caseToTrash.victim_name?.trim() || 'Confidential Client'}</strong>
              </p>
              <p>
                <span className="font-semibold text-slate-500">Classification:</span>{' '}
                <span className="capitalize">{caseToTrash.case_type.replace(/_/g, ' ')}</span>
              </p>
              <p className="text-[11px] text-amber-800 mt-2 bg-amber-50 p-2.5 rounded-lg border border-amber-200 leading-relaxed">
                ℹ️ This case will be hidden from the active directory. You can restore it anytime from the Trash Bin.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isActionPending}
                onClick={() => setCaseToTrash(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionPending}
                onClick={() => handleMoveToTrash(caseToTrash)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isActionPending ? 'Moving...' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Modal */}
      {caseToPermanentDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 shrink-0">
                <AlertOctagon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Permanently Delete Case?</h3>
                <p className="text-xs text-rose-600 font-mono font-bold">{caseToPermanentDelete.case_number}</p>
              </div>
            </div>

            <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 text-xs text-rose-950 space-y-2">
              <p>
                <span className="font-semibold text-rose-700">Client / Victim:</span>{' '}
                <strong className="text-rose-950">{caseToPermanentDelete.victim_name?.trim() || 'Confidential Client'}</strong>
              </p>
              <p className="text-[11px] font-semibold text-rose-800 leading-relaxed bg-white/90 p-2.5 rounded-lg border border-rose-200">
                ⚠️ <strong>WARNING:</strong> This action cannot be undone. All confidential records, notes, attachments, and the General Intake Sheet (GIS) will be permanently erased.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isActionPending}
                onClick={() => setCaseToPermanentDelete(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionPending}
                onClick={() => handlePermanentDelete(caseToPermanentDelete)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition shadow-xs cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isActionPending ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty Trash Confirmation Modal */}
      {confirmEmptyTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Empty Trash Bin?</h3>
                <p className="text-xs text-rose-600 font-bold">{trashCases.length} cases will be deleted</p>
              </div>
            </div>

            <p className="text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200 leading-relaxed">
              ⚠️ Are you sure you want to permanently delete all <strong>{trashCases.length}</strong> cases currently in Trash? This will purge all associated files, notes, and records forever.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isActionPending}
                onClick={() => setConfirmEmptyTrash(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionPending}
                onClick={handleEmptyTrash}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition shadow-xs cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isActionPending ? 'Purging...' : 'Empty All Trash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

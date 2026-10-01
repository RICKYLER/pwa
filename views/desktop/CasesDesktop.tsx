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
  AlertTriangle,
  User,
  Clock,
  CheckCircle2,
  Lock,
  Eye,
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
} from '@/lib/db/cases';
import { BARANGAY_REGISTRY } from '@/lib/mabini-barangays';
import {
  downloadCaseExcelTemplate,
  downloadCaseCsvTemplate,
} from '@/lib/cases/case-excel-importer';
import * as XLSX from 'xlsx-js-style';
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
import { printGeneralIntakeSheet } from '@/lib/cases/gis-printer';
import CaseExcelUploadModal from '@/components/cases/CaseExcelUploadModal';
import CaseDetailModal from '@/components/cases/CaseDetailModal';
import NewCaseModal from '@/components/cases/NewCaseModal';
import CaseNavigationHeader from '@/components/cases/CaseNavigationHeader';
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
      dayNumber: 1,
      daysRemaining: 15,
      isExpired: false,
      isExpiringSoon: false,
      badgeText: 'BPO Day 1 of 15',
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

  let badgeText = `BPO Day ${dayNumber} of 15 (${daysRemaining}d left)`;
  if (isExpired) {
    const expiredDaysAgo = Math.abs(daysRemaining);
    badgeText =
      expiredDaysAgo === 0
        ? 'BPO Expired Today - File Court TPO'
        : `BPO Expired ${expiredDaysAgo}d ago - File Court TPO`;
  } else if (isExpiringSoon) {
    badgeText = `⚠️ BPO Expires in ${daysRemaining}d (Day ${dayNumber} of 15)`;
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
  const allNotes = (
    (c.case_summary || '') +
    ' ' +
    (c.intake_notes || '') +
    ' ' +
    (c.intake_sheet?.case_category_other || '')
  ).toLowerCase();

  // 1. Rape / Attempted Rape
  if (t === 'rape' || gisType === 'rape') return 'rape';

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
    allNotes.includes('child abuse')
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
      day: 'numeric',
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
    label: 'Master Inventory of Cases',
    shortLabel: 'All Inventory',
    badgeColor: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
    activeColor: 'bg-slate-900 text-white border-slate-900 shadow-2xs',
  },
  {
    id: 'vawc',
    label: 'VAWC Desk (RA 9262)',
    shortLabel: 'VAWC (RA 9262)',
    badgeColor: 'bg-white text-purple-900 border-purple-200/90 hover:bg-purple-50/50',
    activeColor: 'bg-purple-900 text-white border-purple-900 shadow-2xs',
  },
  {
    id: 'child_abuse_vac',
    label: 'VAC Monitoring (RA 7610)',
    shortLabel: 'VAC (RA 7610)',
    badgeColor: 'bg-white text-blue-900 border-blue-200/90 hover:bg-blue-50/50',
    activeColor: 'bg-blue-900 text-white border-blue-900 shadow-2xs',
  },
  {
    id: 'child_custody_support',
    label: 'Child Custody & Support',
    shortLabel: 'Custody & Support',
    badgeColor: 'bg-white text-emerald-900 border-emerald-200/90 hover:bg-emerald-50/50',
    activeColor: 'bg-emerald-900 text-white border-emerald-900 shadow-2xs',
  },
  {
    id: 'rape',
    label: 'Rape / Attempted Rape',
    shortLabel: 'Rape',
    badgeColor: 'bg-white text-rose-900 border-rose-200/90 hover:bg-rose-50/50',
    activeColor: 'bg-rose-900 text-white border-rose-900 shadow-2xs',
  },
  {
    id: 'acts_of_lasciviousness',
    label: 'Acts of Lasciviousness',
    shortLabel: 'Lasciviousness',
    badgeColor: 'bg-white text-amber-950 border-amber-300/80 hover:bg-amber-50/50',
    activeColor: 'bg-amber-900 text-white border-amber-900 shadow-2xs',
  },
  {
    id: 'other',
    label: 'Others / Special Cases',
    shortLabel: 'Others',
    badgeColor: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
    activeColor: 'bg-slate-800 text-white border-slate-800 shadow-2xs',
  },
];

export default function CasesDesktop() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [trashCases, setTrashCases] = useState<CaseRecord[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<MainCategoryTab>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [barangayFilter, setBarangayFilter] = useState<string>('all');

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [crisisModalOpen, setCrisisModalOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Trash & Permanent Delete Confirmation Modals
  const [caseToTrash, setCaseToTrash] = useState<CaseRecord | null>(null);
  const [caseToPermanentDelete, setCaseToPermanentDelete] = useState<CaseRecord | null>(null);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // Success Toast & Export Menu
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    loadCases();

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

  // ── Supabase Realtime: Live multi-device sync for Cases ──
  useEffect(() => {
    let activeChannel: any = null;
    let isCancelled = false;

    async function setupRealtime() {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
      const { bootstrapSupabaseTables } = await import('@/lib/supabase/bootstrap');
      const supabase = getSupabaseBrowserClient();
      if (!supabase || isCancelled) return;

      activeChannel = supabase
        .channel('cases-realtime-directory')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cases' },
          async () => {
            try {
              await bootstrapSupabaseTables(['cases'], { force: true });
              void loadCases(false);
            } catch (err) {
              console.warn('Realtime cases directory refresh failed:', err);
            }
          },
        )
        .subscribe();
    }

    void setupRealtime();

    return () => {
      isCancelled = true;
      if (activeChannel) {
        import('@/lib/supabase/client').then(({ getSupabaseBrowserClient }) => {
          const supabase = getSupabaseBrowserClient();
          if (supabase && activeChannel) {
            void supabase.removeChannel(activeChannel);
          }
        });
      }
    };
  }, []);

  async function loadCases(force = false) {
    setIsLoading(true);
    try {
      if (force) {
        const { bootstrapPathnameData } = await import('@/lib/supabase/route-bootstrap');
        await bootstrapPathnameData('/cases', true);
      }
      const [data, trashed] = await Promise.all([
        getCases(),
        getTrashCases(),
      ]);
      setCases(data);
      setTrashCases(trashed);
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMoveToTrash(c: CaseRecord) {
    setIsActionPending(true);
    try {
      await moveCaseToTrash(c.id);
      showToast(`Case ${c.case_number} moved to Trash.`);
      setCaseToTrash(null);
      await loadCases();
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
      showToast(`Case ${c.case_number} restored to active directory.`);
      await loadCases();
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
      showToast(`Case ${c.case_number} permanently deleted.`);
      setCaseToPermanentDelete(null);
      await loadCases();
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
      await loadCases();
    } catch (err) {
      console.error('Error emptying trash:', err);
      showToast('Failed to empty trash.');
    } finally {
      setIsActionPending(false);
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }

  function handleDownloadVacMonitoringForm() {
    const vacCases = cases.filter((c) => {
      const g = getCaseCategoryGroup(c);
      return g === 'child_abuse_vac' || c.case_type.startsWith('vac');
    });
    if (vacCases.length > 0) {
      downloadVacLogbook(vacCases);
      showToast(`Exported ${vacCases.length} case${vacCases.length !== 1 ? 's' : ''} to official VAC Monitoring Form.`);
    } else {
      downloadBlankVacTemplate();
      showToast('Downloaded blank VAC Monitoring Form template with colors.');
    }
  }

  function handleDownloadVawcForm() {
    const vawcCases = cases.filter((c) => getCaseCategoryGroup(c) === 'vawc');
    if (vawcCases.length > 0) {
      downloadVawcLogbook(vawcCases);
      showToast(`Exported ${vawcCases.length} case${vawcCases.length !== 1 ? 's' : ''} to official VAWC Registry (RA 9262).`);
    } else {
      downloadBlankVawcTemplate();
      showToast('Downloaded blank VAWC Registry template (RA 9262).');
    }
  }

  function handleDownloadCustodySupportForm() {
    const custodyCases = cases.filter((c) => getCaseCategoryGroup(c) === 'child_custody_support');
    if (custodyCases.length > 0) {
      downloadChildCustodySupportLogbook(custodyCases);
      showToast(`Exported ${custodyCases.length} case${custodyCases.length !== 1 ? 's' : ''} to Child Custody & Support Registry.`);
    } else {
      downloadBlankCustodySupportTemplate();
      showToast('Downloaded blank Child Custody & Support template.');
    }
  }

  function handleDownloadMasterInventory() {
    if (cases.length > 0) {
      downloadMasterInventoryLogbook(cases);
      showToast(`Exported ${cases.length} case${cases.length !== 1 ? 's' : ''} to Master Case Inventory.`);
    } else {
      downloadBlankMasterInventoryTemplate();
      showToast('Downloaded blank Master Case Inventory template.');
    }
  }

  function handleExportCurrentView() {
    if (filteredCases.length === 0) {
      showToast('No cases to export.');
      return;
    }

    // Smart template routing based on current active tab
    if (categoryFilter === 'child_abuse_vac') {
      downloadVacLogbook(filteredCases);
      showToast(`Downloaded ${filteredCases.length} case${filteredCases.length !== 1 ? 's' : ''} to official VAC Monitoring Form.`);
      return;
    }

    if (categoryFilter === 'vawc') {
      downloadVawcLogbook(filteredCases);
      showToast(`Downloaded ${filteredCases.length} case${filteredCases.length !== 1 ? 's' : ''} to official VAWC Registry.`);
      return;
    }

    if (categoryFilter === 'child_custody_support') {
      downloadChildCustodySupportLogbook(filteredCases);
      showToast(`Downloaded ${filteredCases.length} case${filteredCases.length !== 1 ? 's' : ''} to Child Custody & Support Registry.`);
      return;
    }

    if (categoryFilter === 'all') {
      downloadMasterInventoryLogbook(filteredCases);
      showToast(`Downloaded ${filteredCases.length} case${filteredCases.length !== 1 ? 's' : ''} to Master Case Inventory.`);
      return;
    }

    try {
      const headers = [
        'No.',
        'Case Number',
        'Classification',
        'Victim / Client',
        'Age',
        'Gender',
        'Contact',
        'Purok / Address',
        'Barangay',
        'Alleged Perpetrator',
        'Relationship to Victim',
        'Status',
        'Date Reported',
        'Date of Incident',
        'Assigned Social Worker',
        'Case Summary',
        'Intake Notes / Actions Taken',
      ];

      const borderThin = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
      };

      const ws: XLSX.WorkSheet = {};

      // Style header row with light emerald fill and crisp border
      headers.forEach((h, c) => {
        const ref = XLSX.utils.encode_cell({ r: 0, c });
        ws[ref] = {
          v: h,
          t: 's',
          s: {
            font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: '065F46' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            fill: { fgColor: { rgb: 'D1FAE5' } },
            border: borderThin,
          },
        };
      });

      // Data rows
      filteredCases.forEach((c, rIdx) => {
        const r = rIdx + 1;
        const rowVals: (string | number)[] = [
          rIdx + 1,
          c.case_number,
          c.case_type.replace(/_/g, ' ').toUpperCase(),
          c.victim_name,
          c.victim_age ?? '',
          c.victim_gender ?? '',
          c.victim_contact ?? '',
          c.victim_address ?? '',
          c.barangay_id,
          c.perpetrator_name ?? '',
          c.perpetrator_relationship ?? '',
          c.status.replace(/_/g, ' ').toUpperCase(),
          c.reported_at ? new Date(c.reported_at).toLocaleDateString('en-PH') : '',
          c.incident_date ? new Date(c.incident_date).toLocaleDateString('en-PH') : '',
          c.assigned_worker_name ?? '',
          c.case_summary ?? '',
          c.intake_notes ?? '',
        ];

        rowVals.forEach((val, cIdx) => {
          const ref = XLSX.utils.encode_cell({ r, c: cIdx });
          const isNum = typeof val === 'number';
          ws[ref] = {
            v: val,
            t: isNum ? 'n' : 's',
            s: {
              font: { name: 'Calibri', sz: 9 },
              alignment: {
                horizontal: isNum || cIdx === 0 || cIdx === 4 || cIdx === 5 || cIdx === 12 || cIdx === 13 ? 'center' : 'left',
                vertical: 'center',
              },
              border: borderThin,
            },
          };
        });
      });

      ws['!cols'] = [
        { wch: 5 }, { wch: 18 }, { wch: 22 }, { wch: 24 }, { wch: 6 }, { wch: 8 },
        { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 20 },
        { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 45 }, { wch: 45 },
      ];
      ws['!rows'] = [{ hpx: 28 }, ...filteredCases.map(() => ({ hpx: 20 }))];
      ws['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: filteredCases.length, c: headers.length - 1 },
      });

      const wb = XLSX.utils.book_new();
      const label = CATEGORY_TABS.find((t) => t.id === categoryFilter)?.shortLabel ?? 'Cases';
      XLSX.utils.book_append_sheet(wb, ws, label.substring(0, 31));

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `MSWDO_Cases_${label.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.xlsx`);
      showToast(`Downloaded ${filteredCases.length} case${filteredCases.length !== 1 ? 's' : ''} to Excel.`);
    } catch (err) {
      console.error('Export error:', err);
      showToast('Export failed. Please try again.');
    }
  }

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<MainCategoryTab, number> = {
      all: cases.length,
      vawc: 0,
      child_abuse_vac: 0,
      child_custody_support: 0,
      rape: 0,
      acts_of_lasciviousness: 0,
      other: 0,
    };
    for (const c of cases) {
      const group = getCaseCategoryGroup(c);
      if (counts[group] !== undefined) {
        counts[group]++;
      } else {
        counts.other++;
      }
    }
    return counts;
  }, [cases]);

  // Filtered Category Tabs for the Category Search bar
  const visibleCategoryTabs = useMemo(() => {
    if (!categorySearchQuery.trim()) return CATEGORY_TABS;
    const q = categorySearchQuery.toLowerCase().trim();
    return CATEGORY_TABS.filter((cat) => {
      if (cat.id === 'all') return true;
      return (
        cat.label.toLowerCase().includes(q) ||
        cat.shortLabel.toLowerCase().includes(q) ||
        cat.id.toLowerCase().includes(q)
      );
    });
  }, [categorySearchQuery]);

  // Filtered cases calculation
  const filteredCases = useMemo(() => {
    let result = cases;

    // 1. Explicit Category tab filter
    if (categoryFilter !== 'all') {
      result = result.filter((c) => getCaseCategoryGroup(c) === categoryFilter);
    }

    // 2. Category Search Query (filters cases directly when typing in Category search)
    if (categorySearchQuery.trim()) {
      const cq = categorySearchQuery.toLowerCase().trim();
      result = result.filter((c) => {
        const catGroup = getCaseCategoryGroup(c);
        const catTab = CATEGORY_TABS.find((t) => t.id === catGroup);
        const caseType = (c.case_type || '').toLowerCase();
        const gisType = (c.intake_sheet?.case_category_type || '').toLowerCase();
        const otherDetail = (c.intake_sheet?.case_category_other || '').toLowerCase();

        return (
          caseType.includes(cq) ||
          gisType.includes(cq) ||
          otherDetail.includes(cq) ||
          (catTab && catTab.label.toLowerCase().includes(cq)) ||
          (catTab && catTab.shortLabel.toLowerCase().includes(cq)) ||
          (catTab && catTab.id.toLowerCase().includes(cq))
        );
      });
    }

    // 3. Status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    // 4. Type filter (dropdown)
    if (typeFilter !== 'all') {
      result = result.filter((c) => c.case_type === typeFilter);
    }

    // 5. Barangay filter
    if (barangayFilter !== 'all') {
      result = result.filter((c) => c.barangay_id.toLowerCase() === barangayFilter.toLowerCase());
    }

    // 6. Main Search Query (also searches category and classification names)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((c) => {
        const catGroup = getCaseCategoryGroup(c);
        const catTab = CATEGORY_TABS.find((t) => t.id === catGroup);
        const matchesCategory =
          (c.case_type && c.case_type.toLowerCase().includes(q)) ||
          (c.intake_sheet?.case_category_type && c.intake_sheet.case_category_type.toLowerCase().includes(q)) ||
          (c.intake_sheet?.case_category_other && c.intake_sheet.case_category_other.toLowerCase().includes(q)) ||
          (catTab && catTab.label.toLowerCase().includes(q)) ||
          (catTab && catTab.shortLabel.toLowerCase().includes(q));

        return (
          matchesCategory ||
          c.case_number.toLowerCase().includes(q) ||
          c.victim_name.toLowerCase().includes(q) ||
          (c.perpetrator_name && c.perpetrator_name.toLowerCase().includes(q)) ||
          (c.assigned_worker_name && c.assigned_worker_name.toLowerCase().includes(q)) ||
          (c.case_summary && c.case_summary.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [cases, searchQuery, categoryFilter, categorySearchQuery, statusFilter, typeFilter, barangayFilter]);

  // Filtered trash cases calculation
  const filteredTrashCases = useMemo(() => {
    if (!searchQuery.trim()) return trashCases;
    const q = searchQuery.toLowerCase().trim();
    return trashCases.filter((c) =>
      c.case_number.toLowerCase().includes(q) ||
      c.victim_name.toLowerCase().includes(q) ||
      (c.perpetrator_name && c.perpetrator_name.toLowerCase().includes(q)) ||
      (c.case_summary && c.case_summary.toLowerCase().includes(q))
    );
  }, [trashCases, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = cases.length;
    const active = cases.filter((c) => c.status === 'active').length;
    const bpo = cases.filter((c) => c.status === 'under_bpo_tpo').length;
    const pnpOrCourt = cases.filter(
      (c) => c.status === 'referred_pnp_wcpd' || c.status === 'filed_in_court',
    ).length;
    const resolved = cases.filter((c) => c.status === 'resolved_closed').length;
    return { total, active, bpo, pnpOrCourt, resolved };
  }, [cases]);

  // Cases under BPO/TPO that are expiring or expired (RA 9262 Sec. 14)
  const bpoExpiringCases = useMemo(() => {
    return cases.filter((c) => {
      if (c.status !== 'under_bpo_tpo') return false;
      const bpo = getBpoStatusInfo(c.reported_at);
      return bpo.isExpired || bpo.isExpiringSoon;
    });
  }, [cases]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-900 text-white shadow-xl text-xs font-semibold animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Header with Switcher Tabs */}
      <CaseNavigationHeader
        totalCases={cases.length}
        onNewCase={() => setNewCaseModalOpen(true)}
        onUploadExcel={() => setUploadModalOpen(true)}
      />

      {/* Statistics Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Total Dossiers</span>
            <div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
              <FolderLock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{stats.total}</span>
            <span className="text-[10.5px] text-slate-400 font-medium">All recorded</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">Active Proceedings</span>
            <div className="h-6 w-6 rounded-lg bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-700">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{stats.active}</span>
            <span className="text-[10.5px] text-amber-700 font-bold">Ongoing</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-indigo-700">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">Under BPO / TPO</span>
            <div className="h-6 w-6 rounded-lg bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700">
              <Shield className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{stats.bpo}</span>
            <span className="text-[10.5px] text-indigo-700 font-bold">Protected</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-sky-700">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">Referred to PNP / Court</span>
            <div className="h-6 w-6 rounded-lg bg-sky-50 border border-sky-200/60 flex items-center justify-center text-sky-700">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{stats.pnpOrCourt}</span>
            <span className="text-[10.5px] text-sky-700 font-bold">Escalated</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">Resolved / Closed</span>
            <div className="h-6 w-6 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{stats.resolved}</span>
            <span className="text-[10.5px] text-emerald-700 font-bold">Concluded</span>
          </div>
        </div>
      </div>

      {/* Statutory 15-Day BPO Expiry Alert (RA 9262 Sec. 14) */}
      {bpoExpiringCases.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-200/80 text-amber-900 shrink-0">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-950">
                Statutory 15-Day BPO Compliance Alert (RA 9262 Sec. 14)
              </p>
              <p className="text-xs text-amber-900 leading-relaxed">
                <strong>{bpoExpiringCases.length} case{bpoExpiringCases.length !== 1 ? 's' : ''}</strong> under Barangay Protection Order are expired or near 15-day expiration. Court TPO application or MTC referral may be urgently warranted.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('under_bpo_tpo');
              setCategoryFilter('all');
            }}
            className="text-xs font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 border border-amber-300/80 px-3.5 py-2 rounded-xl transition shrink-0 cursor-pointer self-start sm:self-auto shadow-2xs"
          >
            Review BPO Cases ({bpoExpiringCases.length}) →
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar (Senior & Office-Friendly) */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-3.5">
        <div className="flex flex-col lg:flex-row items-center gap-3">
          {/* Prominent Large Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Client Name, Case Number (e.g. VAWC-2024-001), or Barangay..."
              className="w-full pl-11 pr-10 py-3 text-sm rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none transition bg-white font-medium placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="Clear Search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Barangay Dropdown (Large & Readable) */}
          <select
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
            aria-label="Filter by Barangay"
            className="w-full lg:w-56 py-3 px-3.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none capitalize cursor-pointer shadow-2xs"
          >
            <option value="all">📍 All Barangays (11)</option>
            {BARANGAY_REGISTRY.map((b) => (
              <option key={b.id} value={b.id}>
                Brgy. {b.label}
              </option>
            ))}
          </select>

          {/* Category Dropdown (Large & Readable) */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as MainCategoryTab)}
            aria-label="Filter by Category"
            className="w-full lg:w-64 py-3 px-3.5 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none cursor-pointer shadow-2xs"
          >
            <option value="all">⚖️ All Classifications</option>
            <option value="vawc">VAWC Desk (RA 9262)</option>
            <option value="child_abuse_vac">VAC Child Abuse (RA 7610)</option>
            <option value="child_custody_support">Child Custody &amp; Support</option>
            <option value="rape">Rape / Attempted Rape</option>
            <option value="acts_of_lasciviousness">Acts of Lasciviousness</option>
            <option value="other">Special Protection / Others</option>
          </select>

          <button
            type="button"
            onClick={() => void loadCases(true)}
            className="p-3 rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition shadow-2xs shrink-0 cursor-pointer"
            title="Refresh Case Directory"
          >
            <RefreshCw className={cn('h-5 w-5', isLoading && 'animate-spin')} />
          </button>
        </div>

        {/* Clear High-Contrast Status Tabs (1 Row, English) */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
            Status:
          </span>
          {[
            { id: 'all', label: `All Cases (${cases.length})`, icon: FolderLock },
            { id: 'active', label: `Active / Ongoing (${stats.active})`, icon: Clock },
            { id: 'under_bpo_tpo', label: `Under BPO / TPO (${stats.bpo})`, icon: Shield },
            { id: 'referred_pnp_wcpd', label: `PNP & Court (${stats.pnpOrCourt})`, icon: AlertTriangle },
            { id: 'resolved_closed', label: `Resolved / Closed (${stats.resolved})`, icon: CheckCircle2 },
          ].map((s) => {
            const Icon = s.icon;
            const isActive = statusFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id)}
                className={cn(
                  'px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer border',
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-emerald-400' : 'text-slate-500')} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cases Table Container */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {/* Table Card Header with Active / Trash Switcher */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* View Mode Switcher */}
            <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setViewMode('active')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
                  viewMode === 'active'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <FolderLock className="h-3.5 w-3.5 text-slate-700" />
                <span>Active Cases</span>
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
                  {cases.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('trash')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer',
                  viewMode === 'trash'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-rose-600',
                )}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Trash Bin</span>
                {trashCases.length > 0 && (
                  <span
                    className={cn(
                      'ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                      viewMode === 'trash'
                        ? 'bg-white text-rose-700'
                        : 'bg-rose-100 text-rose-700',
                    )}
                  >
                    {trashCases.length}
                  </span>
                )}
              </button>
            </div>

            {viewMode === 'trash' ? (
              <span className="text-xs text-rose-700 font-semibold flex items-center gap-1 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                <AlertOctagon className="h-3.5 w-3.5" />
                Deleted cases can be restored or permanently removed
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {categorySearchQuery.trim()
                    ? `Category Search: "${categorySearchQuery}"`
                    : categoryFilter === 'all'
                      ? 'All Case Records Directory'
                      : `${CATEGORY_TABS.find((t) => t.id === categoryFilter)?.label || 'Case'} Directory`}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  {filteredCases.length} {filteredCases.length === 1 ? 'case' : 'cases'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {searchQuery && (
              <p className="text-xs text-slate-500">
                Filtered by: &ldquo;<strong className="text-slate-800">{searchQuery}</strong>&rdquo;
              </p>
            )}

            {viewMode === 'active' && filteredCases.length > 0 && (
              <div className="relative flex items-center gap-1.5">
                {/* Context-Aware Primary Export Button */}
                <button
                  type="button"
                  onClick={handleExportCurrentView}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer',
                    categoryFilter === 'vawc'
                      ? 'bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 border border-purple-200'
                      : categoryFilter === 'child_abuse_vac'
                        ? 'bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200'
                        : categoryFilter === 'child_custody_support'
                          ? 'bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 border border-emerald-200'
                          : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-900',
                  )}
                  title={`Export ${filteredCases.length} visible case${filteredCases.length !== 1 ? 's' : ''}`}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>
                    {categoryFilter === 'vawc'
                      ? 'Export VAWC Registry'
                      : categoryFilter === 'child_abuse_vac'
                        ? 'Export VAC Form'
                        : categoryFilter === 'child_custody_support'
                          ? 'Export Custody & Support'
                          : categoryFilter === 'all'
                            ? 'Export Master Inventory'
                            : `Export to Excel (${filteredCases.length})`}
                  </span>
                </button>

                {/* All Official Forms Dropdown Toggle */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((prev) => !prev)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs transition cursor-pointer"
                    title="View and download all official DILG / MSWDO templates"
                  >
                    <span>Forms</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', exportMenuOpen && 'rotate-180')} />
                  </button>

                  {exportMenuOpen && (
                    <>
                      {/* Backdrop to close */}
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setExportMenuOpen(false)}
                      />

                      {/* Dropdown Menu */}
                      <div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl bg-white border border-slate-200 shadow-xl z-40 p-1.5 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Official Excel Formats & Registry
                        </div>

                        {/* VAC Monitoring Form */}
                        <button
                          type="button"
                          onClick={() => {
                            handleDownloadVacMonitoringForm();
                            setExportMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 text-slate-800 transition flex items-start gap-2.5 group cursor-pointer"
                        >
                          <span className="p-1 rounded bg-blue-100 text-blue-700 mt-0.5 shrink-0">
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-blue-700">
                              VAC Monitoring Form (RA 7610)
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Official Two-Tier layout with Pastel Blue & Green styling
                            </p>
                          </div>
                        </button>

                        {/* VAWC Registry */}
                        <button
                          type="button"
                          onClick={() => {
                            handleDownloadVawcForm();
                            setExportMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-purple-50 text-slate-800 transition flex items-start gap-2.5 group cursor-pointer"
                        >
                          <span className="p-1 rounded bg-purple-100 text-purple-700 mt-0.5 shrink-0">
                            <Shield className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-purple-700">
                              VAWC Registry & Logbook (RA 9262)
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Barangay VAWC Desk format with BPO/TPO tracking
                            </p>
                          </div>
                        </button>

                        {/* Child Custody & Support */}
                        <button
                          type="button"
                          onClick={() => {
                            handleDownloadCustodySupportForm();
                            setExportMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-slate-800 transition flex items-start gap-2.5 group cursor-pointer"
                        >
                          <span className="p-1 rounded bg-emerald-100 text-emerald-700 mt-0.5 shrink-0">
                            <User className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-emerald-700">
                              Child Custody & Support Registry
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Conciliation agreements, monthly support & custody terms
                            </p>
                          </div>
                        </button>

                        {/* Master Inventory */}
                        <button
                          type="button"
                          onClick={() => {
                            handleDownloadMasterInventory();
                            setExportMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-800 transition flex items-start gap-2.5 group cursor-pointer"
                        >
                          <span className="p-1 rounded bg-slate-100 text-slate-700 mt-0.5 shrink-0">
                            <FileText className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-slate-900">
                              Master Inventory of Cases (.xlsx)
                            </p>
                            <p className="text-[10px] text-slate-500">
                              All categories with DILG quarterly summary sheet
                            </p>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {viewMode === 'trash' && trashCases.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmEmptyTrash(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-200 transition shadow-xs cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Empty Trash ({trashCases.length})
              </button>
            )}
          </div>
        </div>

        {/* ACTIVE CASES VIEW */}
        {viewMode === 'active' && (
          filteredCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-3">
                <FolderLock className="h-7 w-7" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {categoryFilter !== 'all'
                  ? `No ${CATEGORY_TABS.find((t) => t.id === categoryFilter)?.shortLabel} cases found`
                  : 'No cases found'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                {categoryFilter !== 'all'
                  ? `There are currently 0 cases recorded under ${CATEGORY_TABS.find((t) => t.id === categoryFilter)?.label}. Select another category or click "New Case Intake".`
                  : searchQuery || statusFilter !== 'all' || barangayFilter !== 'all'
                    ? 'No matching cases for the active filter. Try resetting search parameters.'
                    : 'Your case registry is empty. Upload your existing MSWDO Excel logbook or create a new case intake.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {categoryFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    View All Categories ({cases.length})
                  </button>
                )}
                <button
                  onClick={() => setUploadModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition cursor-pointer shadow-2xs"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Excel Sheet
                </button>
                <button
                  onClick={() => setNewCaseModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Intake
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 uppercase font-bold text-xs tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Case Number</th>
                    <th className="py-3.5 px-4">Classification</th>
                    <th className="py-3.5 px-4">Victim / Client</th>
                    <th className="py-3.5 px-4">Barangay</th>
                    <th className="py-3.5 px-4">Alleged Perpetrator</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Date Reported</th>
                    <th className="py-3.5 px-4">Assigned Worker</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredCases.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCaseId(c.id)}
                      className="hover:bg-slate-50/90 transition cursor-pointer group"
                    >
                      <td className="py-4 px-4 font-mono font-black text-sm text-slate-900 flex items-center gap-2">
                        <Lock className="h-4 w-4 text-slate-500 shrink-0" />
                        <span>{c.case_number}</span>
                      </td>
                      <td className="py-4 px-4">
                        {(() => {
                          const catGroup = getCaseCategoryGroup(c);
                          const label =
                            c.case_type === 'rape' || c.intake_sheet?.case_category_type === 'rape'
                              ? 'Rape'
                              : c.case_type === 'acts_of_lasciviousness' || c.intake_sheet?.case_category_type === 'acts_of_lasciviousness'
                                ? 'Acts of Lasciviousness'
                                : c.case_type.startsWith('vawc') || c.intake_sheet?.case_category_type === 'vawc'
                                  ? c.case_type.replace(/_/g, ' ')
                                  : c.intake_sheet?.case_category_type
                                    ? c.intake_sheet.case_category_type.replace(/_/g, ' ')
                                    : c.case_type.replace(/_/g, ' ');

                          return (
                            <div className="space-y-0.5">
                              <span
                                className={cn(
                                  'inline-flex px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider',
                                  catGroup === 'rape' && 'bg-rose-100 text-rose-800 border border-rose-200',
                                  catGroup === 'acts_of_lasciviousness' && 'bg-amber-100 text-amber-900 border border-amber-200',
                                  catGroup === 'vawc' && 'bg-purple-100 text-purple-800 border border-purple-200',
                                  catGroup === 'child_abuse_vac' && 'bg-blue-100 text-blue-800 border border-blue-200',
                                  catGroup === 'child_custody_support' && 'bg-emerald-100 text-emerald-800 border border-emerald-200',
                                  catGroup === 'other' && 'bg-slate-100 text-slate-800 border border-slate-200',
                                )}
                              >
                                {label}
                              </span>
                              {c.intake_sheet?.case_category_other && (
                                <p className="text-xs text-slate-500 italic max-w-[150px] truncate" title={c.intake_sheet.case_category_other}>
                                  {c.intake_sheet.case_category_other}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-bold text-sm text-slate-900">{c.victim_name}</p>
                        {c.victim_age && (
                          <p className="text-xs text-slate-500 font-medium">
                            {c.victim_age} yrs • {c.victim_gender === 'F' ? 'Female' : 'Male'}
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-4 capitalize font-bold text-sm text-slate-800">
                        Brgy. {c.barangay_id}
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-semibold text-sm text-slate-800">{c.perpetrator_name || '—'}</p>
                        {c.perpetrator_relationship && (
                          <p className="text-xs text-slate-400">({c.perpetrator_relationship})</p>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span
                            className={cn(
                              'inline-flex px-3 py-1 rounded-lg text-xs font-bold capitalize',
                              c.status === 'active' && 'bg-slate-100 text-slate-800 border border-slate-200',
                              c.status === 'under_bpo_tpo' && 'bg-indigo-50 text-indigo-800 border border-indigo-200/80',
                              c.status === 'referred_pnp_wcpd' && 'bg-sky-50 text-sky-800 border border-sky-200/80',
                              c.status === 'filed_in_court' && 'bg-purple-50 text-purple-800 border border-purple-200/80',
                              c.status === 'resolved_closed' && 'bg-emerald-50 text-emerald-800 border border-emerald-200/80',
                              c.status === 'monitoring' && 'bg-teal-50 text-teal-800 border border-teal-200/80',
                            )}
                          >
                            {c.status.replace(/_/g, ' ')}
                          </span>

                          {c.status === 'under_bpo_tpo' && (() => {
                            const bpo = getBpoStatusInfo(c.reported_at);
                            return (
                              <div
                                className={cn(
                                  'text-[10px] px-2 py-0.5 rounded-md border font-semibold flex items-center gap-1 w-fit max-w-[210px] leading-tight',
                                  bpo.isExpired
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : bpo.isExpiringSoon
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
                                    : 'bg-indigo-50/70 text-indigo-700 border-indigo-200/60'
                                )}
                                title="Barangay Protection Order (BPO) under RA 9262 is valid for 15 days"
                              >
                                <span>{bpo.badgeText}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm font-semibold text-slate-800 whitespace-nowrap">
                        {formatHumanDate(c.reported_at)}
                      </td>
                      <td className="py-4 px-4 text-xs font-bold text-slate-700 truncate max-w-[130px]">
                        {c.assigned_worker_name || 'MSWDO Staff'}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              printGeneralIntakeSheet(c);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm transition shadow-2xs border border-slate-300 cursor-pointer"
                            title="Print 2-Page General Intake Sheet (GIS)"
                          >
                            <Printer className="h-4 w-4 text-slate-600" />
                            <span className="hidden xl:inline">Print GIS</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCaseId(c.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm transition shadow-2xs cursor-pointer active:scale-98"
                          >
                            <Eye className="h-4 w-4" />
                            <span>Open Folder</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCaseToTrash(c);
                            }}
                            className="inline-flex items-center p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-700 transition shadow-2xs border border-slate-300 cursor-pointer"
                            title="Move case to Trash"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* TRASH BIN VIEW */}
        {viewMode === 'trash' && (
          filteredTrashCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 mb-3">
                <Trash2 className="h-7 w-7" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Trash Bin is Empty</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                No deleted cases in Trash. When you delete a case from the active directory, it will appear here where you can restore it or permanently delete it.
              </p>
              <button
                type="button"
                onClick={() => setViewMode('active')}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Back to Active Cases ({cases.length})
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-rose-50/50 border-b border-rose-100 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Case Number</th>
                    <th className="py-3 px-4">Classification</th>
                    <th className="py-3 px-4">Victim / Client</th>
                    <th className="py-3 px-4">Barangay</th>
                    <th className="py-3 px-4">Deleted When</th>
                    <th className="py-3 px-4">Previous Status</th>
                    <th className="py-3 px-4 text-right">Trash Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredTrashCases.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCaseId(c.id)}
                      className="hover:bg-rose-50/30 transition cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-rose-900 flex items-center gap-2">
                        <Trash2 className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                        <span className="line-through opacity-80">{c.case_number}</span>
                      </td>
                      <td className="py-3.5 px-4 capitalize font-medium text-slate-700">
                        {c.case_type.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900">{c.victim_name}</p>
                        {c.victim_age && (
                          <p className="text-[10px] text-slate-400">
                            {c.victim_age} yrs • {c.victim_gender === 'F' ? 'Female' : 'Male'}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 capitalize font-medium text-slate-700">
                        {c.barangay_id}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        <p>{c.deleted_at ? new Date(c.deleted_at).toLocaleDateString() : 'Archived'}</p>
                        <p className="text-[10px] text-slate-400">by {c.deleted_by || 'MSWDO'}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize bg-slate-100 text-slate-600">
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRestoreFromTrash(c);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-800 font-bold transition shadow-xs border border-emerald-200 cursor-pointer"
                            title="Restore case to active directory"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Restore</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCaseToPermanentDelete(c);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition shadow-xs cursor-pointer"
                            title="Permanently purge this record forever"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Permanent Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Modals */}
      <CaseExcelUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={(count) => {
          void loadCases(true);
          showToast(`Successfully imported ${count} cases into MSWDO Case Directory!`);
        }}
      />

      <NewCaseModal
        isOpen={newCaseModalOpen}
        onClose={() => setNewCaseModalOpen(false)}
        onSuccess={(newCase) => {
          void loadCases(true);
          showToast(`New case ${newCase.case_number} recorded successfully!`);
          setSelectedCaseId(newCase.id);
        }}
      />

      <EmergencyCrisisIntakeModal
        isOpen={crisisModalOpen}
        onClose={() => setCrisisModalOpen(false)}
        onSuccess={(createdCase) => {
          void loadCases(true);
          showToast(`🚨 Crisis walk-in logged: ${createdCase.case_number} (${createdCase.victim_name})`);
          setSelectedCaseId(createdCase.id);
        }}
      />

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
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 flex-shrink-0">
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
                <strong className="text-slate-900">{caseToTrash.victim_name}</strong>
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
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 flex-shrink-0">
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
                <strong className="text-rose-950">{caseToPermanentDelete.victim_name}</strong>
              </p>
              <p className="text-[11px] font-semibold text-rose-800 leading-relaxed bg-white/90 p-2.5 rounded-lg border border-rose-200">
                ⚠️ <strong>WARNING:</strong> This action cannot be undone. All confidential records, notes, attachments, and the General Intake Sheet (GIS) will be permanently erased from both local storage and the database.
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
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 flex-shrink-0">
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

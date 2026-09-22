'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Baby,
  BadgeCheck,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  Download,
  ExternalLink,
  FileText,
  HeartHandshake,
  Home,
  IdCard,
  LogOut,
  MapPin,
  Phone,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Scan,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TentTree,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {
  CivicBadge,
  CivicHero,
  CivicKpiCard,
  CivicPanel,
  CivicSectionHeading,
} from '@/components/ui/civic-primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getBarangayLabel } from '@/lib/barangays';
import {
  getEvacuationCenters,
  setEvacuationCenterStatus,
  saveEvacuationCenters,
} from '@/lib/db/evacuation-centers';
import { getHouseholds } from '@/lib/db/households';
import { getResidents } from '@/lib/db/residents';
import { getCurrentVulnerabilityFlagsMapForResidents } from '@/lib/db/vulnerability';
import {
  checkInHouseholdToEvacuationCenter,
  checkOutEvacueeRecord,
  getEvacueeRecords,
  type EvacueeRecord,
} from '@/lib/db/evacuees';
import type { EvacuationCenter, EvacuationCenterStatus, Household, Resident, VulnerabilityFlags } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import EvacuationQrScannerModal from '@/components/EvacuationQrScannerModal';
import EvacuationCenterPosterModal from '@/components/EvacuationCenterPosterModal';
import ResidentMasterQrModal from '@/components/ResidentMasterQrModal';

function formatTimestamp(isoStr?: string) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat('ceb-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoStr;
  }
}

export default function EvacuationPage() {
  const currentUser = getCurrentUser();
  const [centers, setCenters] = useState<EvacuationCenter[]>([]);
  const [evacuees, setEvacuees] = useState<EvacueeRecord[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [flagsByResidentId, setFlagsByResidentId] = useState<Map<string, VulnerabilityFlags>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCenterFilter, setSelectedCenterFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'sheltered' | 'all'>('sheltered');

  // Check-in Desk Form State
  const [checkInSearch, setCheckInSearch] = useState('');
  const [selectedHouseholdForCheckIn, setSelectedHouseholdForCheckIn] = useState<Household | null>(null);
  const [selectedCenterId, setSelectedCenterId] = useState<string>('');
  const [checkInNotes, setCheckInNotes] = useState('');
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);
  const [checkInSuccessMsg, setCheckInSuccessMsg] = useState('');

  // Modals
  const [showAddCenterModal, setShowAddCenterModal] = useState(false);
  const [newCenterName, setNewCenterName] = useState('');
  const [newCenterBarangay, setNewCenterBarangay] = useState('cuambog');
  const [newCenterCapacity, setNewCenterCapacity] = useState<number | ''>(50);
  const [newCenterNotes, setNewCenterNotes] = useState('');
  const [isSavingCenter, setIsSavingCenter] = useState(false);
  const [showDromicModal, setShowDromicModal] = useState(false);

  // QR Scanner & Poster Modals
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [selectedCenterForPoster, setSelectedCenterForPoster] = useState<EvacuationCenter | null>(null);
  const [selectedHouseholdForQrModal, setSelectedHouseholdForQrModal] = useState<Household | null>(null);

  // Handle successful QR scan from camera or uploaded image
  function handleScannedPayload(decodedText: string) {
    const raw = decodedText.trim();
    let matchedHh: Household | undefined;

    // 1. Try parse JSON QR payload (Master Evac QR format)
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.hh_id) {
          matchedHh = households.find(
            (h) => h.id === parsed.hh_id || h.id.toLowerCase() === parsed.hh_id.toLowerCase(),
          );
        }
        if (!matchedHh && parsed.head_name) {
          matchedHh = households.find(
            (h) => h.head_name.toLowerCase().includes(parsed.head_name.toLowerCase()),
          );
        }
      } catch {
        // Continue to string matching
      }
    }

    // 2. Direct string match on ID or Head Name
    if (!matchedHh) {
      const q = raw.toLowerCase();
      matchedHh = households.find(
        (h) =>
          h.id.toLowerCase() === q ||
          h.id.toLowerCase().includes(q) ||
          h.head_name.toLowerCase().includes(q),
      );
    }

    if (matchedHh) {
      setSelectedHouseholdForCheckIn(matchedHh);
      setCheckInSearch(matchedHh.head_name);
      setCheckInSuccessMsg(`Master Evac QR na-scan! Napili si ${matchedHh.head_name}. I-review ug i-click ang Check-in.`);
    } else {
      setCheckInSearch(raw);
      alert(`Na-scan ang QR data: "${raw}", apan walay nakit-ang panimalay nga nagtugma. Palihog i-type ang pangalan o susiha ang database.`);
    }
  }

  // Load Data
  async function loadAllData() {
    try {
      setIsLoading(true);
      const [loadedCenters, loadedEvacuees, loadedHouseholds, loadedResidents] = await Promise.all([
        getEvacuationCenters(),
        getEvacueeRecords(),
        getHouseholds(),
        getResidents({ status: 'active' }),
      ]);

      setCenters(loadedCenters);
      setEvacuees(loadedEvacuees);
      setHouseholds(loadedHouseholds);
      setResidents(loadedResidents);

      if (loadedCenters.length > 0 && !selectedCenterId) {
        const firstOpen = loadedCenters.find((c) => c.status === 'open') || loadedCenters[0];
        setSelectedCenterId(firstOpen.id);
      }

      if (loadedResidents.length > 0 && loadedHouseholds.length > 0) {
        const flagsMap = await getCurrentVulnerabilityFlagsMapForResidents(loadedResidents, loadedHouseholds).catch(
          () => new Map(),
        );
        setFlagsByResidentId(flagsMap);
      }
    } catch (err) {
      console.error('Failed to load evacuation data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAllData();

    function handleEvacueesChanged() {
      void getEvacueeRecords().then(setEvacuees);
    }
    window.addEventListener('mswdo-evacuees-changed', handleEvacueesChanged);
    return () => {
      window.removeEventListener('mswdo-evacuees-changed', handleEvacueesChanged);
    };
  }, []);

  // Compute Active Sheltered Evacuees
  const activeSheltered = useMemo(() => {
    return evacuees.filter((r) => r.status === 'sheltered');
  }, [evacuees]);

  // Statistics
  const stats = useMemo(() => {
    const openCentersCount = centers.filter((c) => c.status === 'open').length;
    const shelteredFamiliesCount = activeSheltered.length;
    const totalIndividualsCount = activeSheltered.reduce((acc, r) => acc + (r.family_members_count || 1), 0);

    const totalVulnerableCount = activeSheltered.reduce((acc, r) => {
      return (
        acc +
        (r.vulnerabilities?.seniors || 0) +
        (r.vulnerabilities?.infants || 0) +
        (r.vulnerabilities?.pwds || 0) +
        (r.vulnerabilities?.pregnant || 0)
      );
    }, 0);

    const totalCapacity = centers.reduce((acc, c) => acc + (c.capacity || 0), 0);
    const occupancyRate = totalCapacity > 0 ? Math.min(100, Math.round((shelteredFamiliesCount / totalCapacity) * 100)) : 0;

    return {
      openCentersCount,
      totalCentersCount: centers.length,
      shelteredFamiliesCount,
      totalIndividualsCount,
      totalVulnerableCount,
      totalCapacity,
      occupancyRate,
    };
  }, [centers, activeSheltered]);

  // Handle Search in Check-in Desk (Handles QR token, Household ID, or Name)
  const searchResults = useMemo(() => {
    const q = checkInSearch.trim().toLowerCase();
    if (!q) return [];

    // Check if input is a scanned QR code JSON
    if (q.startsWith('{') && q.includes('hh_id')) {
      try {
        const parsed = JSON.parse(q);
        if (parsed.hh_id) {
          const match = households.find(
            (h) => h.id === parsed.hh_id || h.id.toLowerCase().includes(parsed.hh_id.toLowerCase()),
          );
          if (match) return [match];
        }
      } catch {
        // ignore json parse error, fall through to text match
      }
    }

    return households
      .filter((h) => {
        const headMatch = h.head_name?.toLowerCase().includes(q);
        const idMatch = h.id?.toLowerCase().includes(q);
        const purokMatch = h.purok_sitio?.toLowerCase().includes(q);
        return headMatch || idMatch || purokMatch;
      })
      .slice(0, 5);
  }, [checkInSearch, households]);

  // Get details of selected household for check-in
  const selectedHhResidents = useMemo(() => {
    if (!selectedHouseholdForCheckIn) return [];
    return residents.filter((r) => r.household_id === selectedHouseholdForCheckIn.id);
  }, [selectedHouseholdForCheckIn, residents]);

  const selectedHhVulnerabilities = useMemo(() => {
    if (!selectedHouseholdForCheckIn || selectedHhResidents.length === 0) {
      return { infants: 0, children: 0, seniors: 0, pwds: 0, pregnant: 0 };
    }
    let infants = 0;
    let children = 0;
    let seniors = 0;
    let pwds = 0;
    let pregnant = 0;

    selectedHhResidents.forEach((res) => {
      const flags = flagsByResidentId.get(res.id);
      if (flags?.is_infant) infants++;
      if (flags?.is_child) children++;
      if (flags?.is_senior) seniors++;
      if (flags?.is_pwd) pwds++;
      if (flags?.is_pregnant) pregnant++;
    });

    return { infants, children, seniors, pwds, pregnant };
  }, [selectedHouseholdForCheckIn, selectedHhResidents, flagsByResidentId]);

  // Check if selected household is already checked in
  const alreadyCheckedInRecord = useMemo(() => {
    if (!selectedHouseholdForCheckIn) return null;
    return activeSheltered.find((r) => r.household_id === selectedHouseholdForCheckIn.id) || null;
  }, [selectedHouseholdForCheckIn, activeSheltered]);

  // Execute Check-in
  async function handleCheckInSubmit() {
    if (!selectedHouseholdForCheckIn || !selectedCenterId) return;
    const targetCenter = centers.find((c) => c.id === selectedCenterId);
    if (!targetCenter) return;

    setIsSubmittingCheckIn(true);
    try {
      const rec = await checkInHouseholdToEvacuationCenter({
        household_id: selectedHouseholdForCheckIn.id,
        head_name: selectedHouseholdForCheckIn.head_name,
        evacuation_center_id: targetCenter.id,
        evacuation_center_name: targetCenter.name,
        barangay_id: selectedHouseholdForCheckIn.barangay_id,
        barangay_name: selectedHouseholdForCheckIn.barangay_name || 'Cuambog',
        purok_sitio: selectedHouseholdForCheckIn.purok_sitio,
        family_members_count: Math.max(1, selectedHhResidents.length || 1),
        contact_number: selectedHouseholdForCheckIn.contact_number,
        vulnerabilities: selectedHhVulnerabilities,
        checked_in_by: currentUser?.email || 'MSWDO Desk Officer',
        notes: checkInNotes,
      });

      setCheckInSuccessMsg(`Malampusong na-check-in si ${rec.head_name} sa ${rec.evacuation_center_name}!`);
      setSelectedHouseholdForCheckIn(null);
      setCheckInSearch('');
      setCheckInNotes('');
      setTimeout(() => setCheckInSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Failed to check in household:', err);
    } finally {
      setIsSubmittingCheckIn(false);
    }
  }

  // Execute Check-out
  async function handleCheckOut(recordId: string) {
    if (!confirm('Sigurado ka ba nga i-check out (nakapauli na sa ilang balay) kini nga pamilya?')) {
      return;
    }
    try {
      await checkOutEvacueeRecord(recordId);
    } catch (err) {
      console.error('Failed to check out evacuee:', err);
    }
  }

  // Toggle Center Status (Open/Closed)
  async function handleToggleCenterStatus(centerId: string, currentStatus: EvacuationCenterStatus) {
    const nextStatus: EvacuationCenterStatus = currentStatus === 'open' ? 'closed' : 'open';
    try {
      await setEvacuationCenterStatus({ center_id: centerId, status: nextStatus });
      setCenters((prev) => prev.map((c) => (c.id === centerId ? { ...c, status: nextStatus } : c)));
    } catch (err) {
      console.error('Failed to toggle center status:', err);
    }
  }

  // Add new evacuation center
  async function handleAddCenterSubmit() {
    if (!newCenterName.trim()) return;
    setIsSavingCenter(true);
    try {
      await saveEvacuationCenters({
        centers: [
          {
            name: newCenterName.trim(),
            barangay_id: newCenterBarangay,
            capacity: typeof newCenterCapacity === 'number' ? newCenterCapacity : undefined,
            notes: newCenterNotes.trim(),
          },
        ],
      });
      setShowAddCenterModal(false);
      setNewCenterName('');
      setNewCenterNotes('');
      void getEvacuationCenters().then(setCenters);
    } catch (err) {
      console.error('Failed to save new evacuation center:', err);
    } finally {
      setIsSavingCenter(false);
    }
  }

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    return evacuees.filter((r) => {
      // Status filter
      if (selectedStatusFilter === 'sheltered' && r.status !== 'sheltered') {
        return false;
      }
      // Center filter
      if (selectedCenterFilter !== 'all' && r.evacuation_center_id !== selectedCenterFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const headMatch = r.head_name.toLowerCase().includes(q);
        const centerMatch = r.evacuation_center_name.toLowerCase().includes(q);
        const purokMatch = r.purok_sitio.toLowerCase().includes(q);
        return headMatch || centerMatch || purokMatch;
      }
      return true;
    });
  }, [evacuees, selectedStatusFilter, selectedCenterFilter, searchQuery]);

  return (
    <AppShell title="Evacuation Operations">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <CivicHero
          eyebrow="Disaster Response Operations · MSWDO & MDRRMO"
          title="Evacuation Center & Evacuee Management"
          description="I-scan ang Master Evac QR Code sa mga residente, i-monitor ang gidaghanon sa bakwit, ug dumalaha ang mga Evacuation Centers sa Munisipyo."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDromicModal(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
              >
                <FileText className="h-4 w-4 text-emerald-600" />
                <span>DROMIC Report</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddCenterModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-2 text-xs font-black text-white shadow-md transition hover:from-emerald-700 hover:to-teal-800 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>Bag-ong Evacuation Center</span>
              </button>
            </div>
          }
        />

        {/* 1. KPI Cards Row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <CivicKpiCard
            label="Open Evac Centers"
            value={`${stats.openCentersCount} / ${stats.totalCentersCount}`}
            hint={stats.openCentersCount > 0 ? 'Aktibo karon' : 'Walay open'}
            icon={Building2}
            tone={stats.openCentersCount > 0 ? 'emerald' : 'slate'}
          />
          <CivicKpiCard
            label="Sheltered Families"
            value={stats.shelteredFamiliesCount}
            hint="Mga Panimalay"
            icon={Home}
            tone="teal"
          />
          <CivicKpiCard
            label="Total Evacuees"
            value={stats.totalIndividualsCount}
            hint="Mga Indibidwal"
            icon={Users}
            tone="navy"
          />
          <CivicKpiCard
            label="Vulnerable Sector"
            value={stats.totalVulnerableCount}
            hint="Seniors, PWD, Bata"
            icon={Baby}
            tone={stats.totalVulnerableCount > 0 ? 'amber' : 'slate'}
          />
          <CivicKpiCard
            label="Total Capacity Usage"
            value={`${stats.occupancyRate}%`}
            hint={`${stats.shelteredFamiliesCount} / ${stats.totalCapacity || 100} slots`}
            icon={TentTree}
            tone={stats.occupancyRate > 80 ? 'rose' : stats.occupancyRate > 50 ? 'amber' : 'emerald'}
          />
        </div>

        {/* 2. MASTER EVAC QR CHECK-IN DESK */}
        <div className="mt-6">
          <CivicPanel className="relative overflow-hidden border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/40 p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-900">
                  <Scan className="h-3.5 w-3.5 text-emerald-700" />
                  Master Evac QR Check-in Desk
                </div>
                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  I-check-in ang Arriving nga mga Residente
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  I-scan ang <strong>Master Evac Pass QR</strong> sa resident o i-type ang Household ID / Ngalan sa Ulo sa
                  Panimalay aron ma-rehistro dayon sa evacuation center.
                </p>

                {/* Prominent Camera QR Scanner and View QR Buttons */}
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowScannerModal(true)}
                    className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 px-5 py-3 text-xs font-black text-white shadow-lg shadow-emerald-700/20 transition hover:from-emerald-700 hover:to-teal-800 active:scale-95"
                  >
                    <Camera className="h-4 w-4 text-emerald-200" />
                    <span>I-scan ang QR (Camera Scanner)</span>
                  </button>

                  {households.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedHouseholdForCheckIn || households.find((h) => h.head_name.includes('Ricky')) || households[0];
                        setSelectedHouseholdForQrModal(target);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-black text-emerald-900 shadow-sm transition hover:bg-emerald-100 active:scale-95"
                      title="Tan-awa ang sample Master Evac QR Pass sa Residente"
                    >
                      <QrCode className="h-4 w-4 text-emerald-700" />
                      <span>Tan-awa ang Master QR Pass</span>
                    </button>
                  )}
                </div>

                {/* Friendly QR Guidance Banner */}
                <div className="mt-3.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3 text-xs text-emerald-950 flex items-start gap-2.5">
                  <QrCode className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-slate-950">Asa makita sa mga Residente ilang QR Code?</p>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      Ang matag residente adunay opisyal nga <strong>Master Evac Pass QR</strong> sulod sa ilang <strong>Resident Portal &rarr; Profile</strong> (icon sa taas sa tuo). Pwede kini ipakita sa cellphone o gi-print nga ID card, ug dali kining ma-detect sa imong camera.
                    </p>
                  </div>
                </div>

                {/* Input box for QR Scan or Search */}
                <div className="relative mt-4">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={checkInSearch}
                    onChange={(e) => {
                      setCheckInSearch(e.target.value);
                      setSelectedHouseholdForCheckIn(null);
                    }}
                    placeholder="I-paste ang QR data, o type: Ricky Layno Contiga, HH-HH_17884..."
                    className="w-full rounded-2xl border-2 border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  />
                </div>

                {/* Autocomplete / Search Match Results */}
                {checkInSearch && !selectedHouseholdForCheckIn ? (
                  <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-lg">
                    {searchResults.length > 0 ? (
                      searchResults.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => {
                            setSelectedHouseholdForCheckIn(h);
                            setCheckInSearch(h.head_name);
                          }}
                          className="flex w-full items-center justify-between p-3.5 text-left transition hover:bg-emerald-50"
                        >
                          <div>
                            <p className="text-sm font-black text-slate-950">{h.head_name}</p>
                            <p className="text-xs text-slate-500">
                              Purok {h.purok_sitio}, Brgy. {h.barangay_name || 'Cuambog'} · ID: {h.id.slice(0, 12)}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                            Pilia <ArrowRight className="h-3 w-3" />
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs font-bold text-slate-400">
                        Walay nakitang panimalay nga tugma sa imong gipangita.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Check-in Target Selection & Confirmation Area */}
              <div className="w-full lg:max-w-md rounded-2xl border border-emerald-200/90 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Evacuation Center Destination:
                </p>
                <select
                  value={selectedCenterId}
                  onChange={(e) => setSelectedCenterId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 px-3 text-xs font-bold text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none"
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status === 'open' ? '🟢 Open' : '⚪ Closed'}) — {getBarangayLabel(c.barangay_id)}
                    </option>
                  ))}
                </select>

                {/* Selected Household Preview Card */}
                {selectedHouseholdForCheckIn ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                          Residente nga I-Check-in:
                        </span>
                        <h4 className="text-lg font-black text-slate-950">
                          {selectedHouseholdForCheckIn.head_name}
                        </h4>
                        <p className="text-xs text-slate-600">
                          Purok {selectedHouseholdForCheckIn.purok_sitio}, Brgy. {selectedHouseholdForCheckIn.barangay_name || 'Cuambog'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-black text-white">
                          <Users className="h-3 w-3" />
                          {selectedHhResidents.length || 1} katawo
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedHouseholdForQrModal(selectedHouseholdForCheckIn)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-800 shadow-xs hover:bg-emerald-50 active:scale-95"
                          title="Ipakita ang QR Pass sa Residente"
                        >
                          <QrCode className="h-3 w-3 text-emerald-600" />
                          <span>Ipakita ang QR</span>
                        </button>
                      </div>
                    </div>

                    {/* Sectoral Flags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedHhVulnerabilities.seniors > 0 ? (
                        <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          👴 {selectedHhVulnerabilities.seniors} Senior
                        </span>
                      ) : null}
                      {selectedHhVulnerabilities.infants > 0 ? (
                        <span className="rounded-md bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-900">
                          👶 {selectedHhVulnerabilities.infants} Infant
                        </span>
                      ) : null}
                      {selectedHhVulnerabilities.pwds > 0 ? (
                        <span className="rounded-md bg-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-900">
                          ♿ {selectedHhVulnerabilities.pwds} PWD
                        </span>
                      ) : null}
                      {selectedHhVulnerabilities.pregnant > 0 ? (
                        <span className="rounded-md bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-900">
                          🤰 {selectedHhVulnerabilities.pregnant} Mabdos
                        </span>
                      ) : null}
                    </div>

                    {/* Already Sheltered Warning */}
                    {alreadyCheckedInRecord ? (
                      <div className="rounded-lg bg-amber-100 p-2.5 text-xs font-bold text-amber-900 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>Kini nga pamilya kasamtangang naka-check-in na sa {alreadyCheckedInRecord.evacuation_center_name}!</span>
                      </div>
                    ) : null}

                    {/* Check-in Notes input */}
                    <input
                      type="text"
                      value={checkInNotes}
                      onChange={(e) => setCheckInNotes(e.target.value)}
                      placeholder="Espesyal nga pahimangno o medikal nga notes (optional)..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                    />

                    {/* Submit Check-in Button */}
                    <button
                      type="button"
                      onClick={() => void handleCheckInSubmit()}
                      disabled={isSubmittingCheckIn}
                      className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4 text-xs font-black text-white shadow-md transition hover:from-emerald-700 hover:to-teal-800 active:scale-95 disabled:opacity-50"
                    >
                      <UserCheck className="h-4 w-4" />
                      {isSubmittingCheckIn
                        ? 'Gisave ang check-in...'
                        : alreadyCheckedInRecord
                        ? 'I-balhin og Evac Center'
                        : 'I-Check-in Kini nga Panimalay'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 font-medium">
                    I-type ang ngalan o i-scan ang Master Evac QR sa wala aron mo-gawas ang pamilya nga i-check-in.
                  </div>
                )}

                {checkInSuccessMsg ? (
                  <div className="mt-3 rounded-xl bg-emerald-100 p-3 text-xs font-bold text-emerald-900 flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span>{checkInSuccessMsg}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </CivicPanel>
        </div>

        {/* 3. EVACUATION CENTERS STATUS OVERVIEW */}
        <div className="mt-8">
          <CivicSectionHeading
            title="Mga Evacuation Center sa Munisipyo"
            description="I-monitor ang kapasidad, aktibong pamilya, ug i-abli o i-sira ang mga designated evacuation centers."
          />

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {centers.map((center) => {
              const centerEvacuees = activeSheltered.filter((r) => r.evacuation_center_id === center.id);
              const familiesCount = centerEvacuees.length;
              const peopleCount = centerEvacuees.reduce((acc, r) => acc + (r.family_members_count || 1), 0);
              const capacity = center.capacity || 50;
              const fillPercent = Math.min(100, Math.round((familiesCount / capacity) * 100));

              return (
                <div
                  key={center.id}
                  className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            center.status === 'open' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                          }`}
                        />
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider ${
                            center.status === 'open' ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {center.status === 'open' ? 'Bukas (Open)' : 'Sirado (Closed)'}
                        </span>
                      </div>
                      <h3 className="mt-1 text-base font-black text-slate-950">{center.name}</h3>
                      <p className="text-xs text-slate-500">{getBarangayLabel(center.barangay_id)}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedCenterForPoster(center)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-emerald-700 active:scale-95"
                        title="I-display o I-print ang Opisyal nga QR Poster sa Center"
                      >
                        <QrCode className="h-3 w-3 text-emerald-600" />
                        <span>QR Poster</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleCenterStatus(center.id, center.status)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${
                          center.status === 'open'
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title={center.status === 'open' ? 'Isira kini nga center' : 'Ablihan kini nga center'}
                      >
                        {center.status === 'open' ? (
                          <>
                            <DoorClosed className="h-3 w-3" />
                            Isira
                          </>
                        ) : (
                          <>
                            <DoorOpen className="h-3 w-3" />
                            Ablihan
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Capacity Bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span>{familiesCount} Families / {peopleCount} Katawo</span>
                      <span>{fillPercent}% (Max: {capacity})</span>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          fillPercent > 80 ? 'bg-rose-500' : fillPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${fillPercent}%` }}
                      />
                    </div>
                  </div>

                  {center.notes ? (
                    <p className="mt-3 text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg italic">
                      "{center.notes}"
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. LIVE EVACUEE MASTERLIST ROSTER */}
        <div className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CivicSectionHeading
              title={`Masterlist sa mga Bakwit / Evacuees (${filteredRoster.length})`}
              description="Opisyal nga listahan sa mga pamilya nga kasamtangang nagpasilong sa mga evacuation centers."
            />

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCenterFilter}
                onChange={(e) => setSelectedCenterFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm focus:outline-none"
              >
                <option value="all">Tanang Evac Centers</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm focus:outline-none"
              >
                <option value="sheltered">Kasamtangang Sheltered Lamang</option>
                <option value="all">Tanang Rekord (Apil Nakapauli)</option>
              </select>
            </div>
          </div>

          {/* Roster Table Card */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pangitaa pinaagi sa ngalan, purok, o evacuation center..."
                className="w-full text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-black uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="py-3.5 px-4">Ulo sa Panimalay</th>
                    <th className="py-3.5 px-4">Evacuation Center</th>
                    <th className="py-3.5 px-4">Purok & Barangay</th>
                    <th className="py-3.5 px-4">Gidaghanon</th>
                    <th className="py-3.5 px-4">Vulnerable Sector</th>
                    <th className="py-3.5 px-4">Oras sa Check-in</th>
                    <th className="py-3.5 px-4 text-right">Aksyon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredRoster.length > 0 ? (
                    filteredRoster.map((row) => (
                      <tr key={row.id} className="transition hover:bg-slate-50/80">
                        <td className="py-3.5 px-4 font-bold text-slate-950">
                          <div className="flex items-center gap-2">
                            <span>{row.head_name}</span>
                            {row.status === 'sheltered' ? (
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Aktibong Sheltered" />
                            ) : (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">Nakapauli</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                          {row.evacuation_center_name}
                        </td>
                        <td className="py-3.5 px-4">
                          {row.purok_sitio}, {row.barangay_name}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {row.family_members_count} katawo
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1">
                            {row.vulnerabilities.seniors > 0 ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                {row.vulnerabilities.seniors} Senior
                              </span>
                            ) : null}
                            {row.vulnerabilities.infants > 0 ? (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                {row.vulnerabilities.infants} Infant
                              </span>
                            ) : null}
                            {row.vulnerabilities.pwds > 0 ? (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
                                {row.vulnerabilities.pwds} PWD
                              </span>
                            ) : null}
                            {row.vulnerabilities.pregnant > 0 ? (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                {row.vulnerabilities.pregnant} Mabdos
                              </span>
                            ) : null}
                            {row.vulnerabilities.seniors === 0 &&
                            row.vulnerabilities.infants === 0 &&
                            row.vulnerabilities.pwds === 0 &&
                            row.vulnerabilities.pregnant === 0 ? (
                              <span className="text-slate-400 italic">Walay na-tag</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {formatTimestamp(row.checked_in_at)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const hh = households.find((h) => h.id === row.household_id);
                                if (hh) {
                                  setSelectedHouseholdForQrModal(hh);
                                } else {
                                  setSelectedHouseholdForQrModal({
                                    id: row.household_id,
                                    head_name: row.head_name,
                                    barangay_id: row.barangay_id,
                                    barangay_name: row.barangay_name,
                                    purok_sitio: row.purok_sitio,
                                    contact_number: row.contact_number,
                                    applicant_email: row.checked_in_by,
                                    status: 'active',
                                    created_at: row.checked_in_at,
                                  } as unknown as Household);
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 active:scale-95"
                              title="Tan-awa ang Master Evac QR Pass niining bakwit"
                            >
                              <QrCode className="h-3.5 w-3.5 text-emerald-600" />
                              <span className="hidden sm:inline">QR Pass</span>
                            </button>

                            {row.status === 'sheltered' ? (
                              <button
                                type="button"
                                onClick={() => void handleCheckOut(row.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 active:scale-95"
                                title="I-marka nga nakapauli na sa ilang panimalay"
                              >
                                <LogOut className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Check-out</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Checked out ({formatTimestamp(row.checked_out_at)})
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        Walay nakitang mga bakwit sa kasamtangang filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* MODAL 1: ADD NEW EVACUATION CENTER */}
        <Dialog open={showAddCenterModal} onOpenChange={setShowAddCenterModal}>
          <DialogContent className="max-w-md rounded-3xl border-slate-200 bg-white p-6 shadow-xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-950">
                Bag-ong Evacuation Center
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Idugang ang bag-ong designated gym, eskwelahan, o pasilidad alang sa pagbakwit sa Mabini.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700">Ngalan sa Evacuation Center *</label>
                <input
                  type="text"
                  value={newCenterName}
                  onChange={(e) => setNewCenterName(e.target.value)}
                  placeholder="e.g. San Roque Multi-Purpose Gym"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Barangay Jurisdiction *</label>
                <select
                  value={newCenterBarangay}
                  onChange={(e) => setNewCenterBarangay(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-semibold text-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="cuambog">Cuambog</option>
                  <option value="poblacion">Poblacion</option>
                  <option value="san_roque">San Roque</option>
                  <option value="cadunan">Cadunan</option>
                  <option value="del_pilar">Del Pilar</option>
                  <option value="anza">Anza</option>
                  <option value="pangabuan">Pangabuan</option>
                  <option value="tagnanan">Tagnanan</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700">Kapasidad sa Pamilya (Estimated Max Families)</label>
                <input
                  type="number"
                  value={newCenterCapacity}
                  onChange={(e) => setNewCenterCapacity(e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 50"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-semibold text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Deskripsyon o Dugang Pahibalo (Notes)</label>
                <textarea
                  value={newCenterNotes}
                  onChange={(e) => setNewCenterNotes(e.target.value)}
                  placeholder="e.g. Naay generator, 4 ka kasilyas, duol sa municipal water supply..."
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <DialogFooter className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddCenterModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Kanselahon
              </button>
              <button
                type="button"
                onClick={() => void handleAddCenterSubmit()}
                disabled={isSavingCenter || !newCenterName.trim()}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white shadow hover:bg-emerald-700 disabled:opacity-50"
              >
                {isSavingCenter ? 'Gisave...' : 'I-save ang Center'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL 2: DROMIC REPORT PRINT PREVIEW */}
        <Dialog open={showDromicModal} onOpenChange={setShowDromicModal}>
          <DialogContent className="max-w-2xl rounded-3xl border-slate-200 bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-800">
                    DSWD / MSWDO Disaster Incident Monitoring
                  </p>
                  <DialogTitle className="text-xl font-black text-slate-950">
                    DROMIC Evacuation Summary Report
                  </DialogTitle>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>I-print</span>
                </button>
              </div>
            </DialogHeader>

            <div className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <p className="text-slate-500 font-bold">Lungsod / Munisipyo:</p>
                  <p className="text-sm font-black text-slate-900">Mabini, Davao de Oro</p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold">Petsa ug Oras sa Report:</p>
                  <p className="text-sm font-black text-slate-900">{formatTimestamp(new Date().toISOString())}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold">Aktibong mga Evac Centers:</p>
                  <p className="text-sm font-black text-emerald-700">{stats.openCentersCount} Open Centers</p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold">Total Displaced Families:</p>
                  <p className="text-sm font-black text-slate-900">
                    {stats.shelteredFamiliesCount} Pamilya ({stats.totalIndividualsCount} Indibidwal)
                  </p>
                </div>
              </div>

              {/* Breakdown by center */}
              <div>
                <h4 className="font-black text-slate-900 uppercase tracking-wider text-[11px]">
                  Breakdown Kada Evacuation Center:
                </h4>
                <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {centers.map((c) => {
                    const cEvac = activeSheltered.filter((r) => r.evacuation_center_id === c.id);
                    const pCount = cEvac.reduce((acc, r) => acc + (r.family_members_count || 1), 0);
                    return (
                      <div key={c.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900">{c.name}</p>
                          <p className="text-[11px] text-slate-500">{getBarangayLabel(c.barangay_id)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-slate-950">{cEvac.length} Pamilya</p>
                          <p className="text-[11px] text-slate-500">{pCount} ka tawo (Max: {c.capacity || 50})</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <button
                type="button"
                onClick={() => setShowDromicModal(false)}
                className="w-full sm:w-auto rounded-xl border border-slate-200 px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Isira / Close
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL 3: LIVE CAMERA QR SCANNER */}
        <EvacuationQrScannerModal
          open={showScannerModal}
          onOpenChange={setShowScannerModal}
          onScanSuccess={handleScannedPayload}
        />

        {/* MODAL 4: EVACUATION CENTER OFFICIAL QR POSTER */}
        <EvacuationCenterPosterModal
          open={!!selectedCenterForPoster}
          onOpenChange={(open) => {
            if (!open) setSelectedCenterForPoster(null);
          }}
          center={selectedCenterForPoster}
        />

        {/* MODAL 5: RESIDENT MASTER EVAC PASS QR PREVIEW & PRINT */}
        <ResidentMasterQrModal
          open={!!selectedHouseholdForQrModal}
          onOpenChange={(open) => {
            if (!open) setSelectedHouseholdForQrModal(null);
          }}
          household={selectedHouseholdForQrModal}
          familyMembersCount={
            selectedHouseholdForQrModal
              ? residents.filter((r) => r.household_id === selectedHouseholdForQrModal.id).length || 1
              : 1
          }
          vulnerabilities={
            selectedHouseholdForQrModal ? selectedHhVulnerabilities : undefined
          }
          onSimulateScan={(hh) => {
            setSelectedHouseholdForCheckIn(hh);
            setCheckInSearch(hh.head_name);
            setCheckInSuccessMsg(`Master Evac QR ni ${hh.head_name} napili! Pwede na kining i-check-in.`);
          }}
        />
      </div>
    </AppShell>
  );
}

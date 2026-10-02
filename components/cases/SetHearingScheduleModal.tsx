'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  X,
  Check,
  ShieldAlert,
  Folder,
  ArrowUpDown,
  FileText,
  Mail,
  Send,
  Printer,
  Sparkles,
  Info,
  CheckCircle2,
  CalendarCheck,
  Loader2,
} from 'lucide-react';
import type { CaseRecord } from '@/lib/db/schema';
import {
  CaseScheduleItem,
  addCaseSchedule,
  VENUE_OPTIONS,
} from '@/lib/cases/case-schedules';
import { getCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface SetHearingScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseRecord?: CaseRecord | null;
  allCases?: CaseRecord[];
  onScheduleCreated?: (created: CaseScheduleItem) => void;
}

export default function SetHearingScheduleModal({
  isOpen,
  onClose,
  caseRecord,
  allCases = [],
  onScheduleCreated,
}: SetHearingScheduleModalProps) {
  const currentUser = getCurrentUser();

  // Case selection state
  const [selectedCaseOverride, setSelectedCaseOverride] = useState<CaseRecord | null>(null);
  const selectedCase = selectedCaseOverride || caseRecord || allCases[0] || null;
  const [showCaseSelector, setShowCaseSelector] = useState(false);

  // Form Fields
  const [hearingType, setHearingType] = useState('Conciliation Hearing');
  const [returnDate, setReturnDate] = useState('2026-10-01');
  const [startTime, setStartTime] = useState('09:30 AM');
  const [endTime, setEndTime] = useState('10:30 AM');
  const [venue, setVenue] = useState('MSWDO Mediation Room · 2nd Floor, Municipal Hall');
  const [assignedWorker, setAssignedWorker] = useState(
    currentUser?.name
      ? `${currentUser.name} - Social Welfare Officer II`
      : 'Pedro Penduko - Social Welfare Officer II'
  );
  const [noticeRequirements, setNoticeRequirements] = useState(
    'Bring valid government ID, Barangay BPO resolution, and proof of monthly income.'
  );

  // Automated Gmail Reminder
  const [enableGmailReminder, setEnableGmailReminder] = useState(true);
  const [recipientEmailOverride, setRecipientEmailOverride] = useState<string | null>(null);
  const defaultRecipientEmail = useMemo(() => {
    if (!selectedCase) return 'luzviminda.reyes@email.com';
    const contact = selectedCase.victim_contact || '';
    if (contact.includes('@')) return contact.trim();
    const nameClean = (selectedCase.victim_name || 'client')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '.');
    return `${nameClean}@email.com`;
  }, [selectedCase]);
  const recipientEmail = recipientEmailOverride ?? defaultRecipientEmail;

  const [sendTiming, setSendTiming] = useState('1 day before');
  const [customSubject, setCustomSubject] = useState<string | null>(null);
  const defaultSubject = useMemo(() => {
    try {
      const d = new Date(returnDate + 'T00:00:00');
      const monthShort = isNaN(d.getTime())
        ? 'Oct 1'
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `Reminder: ${hearingType} on ${monthShort}`;
    } catch {
      return `Reminder: ${hearingType} on Oct 1, 2026`;
    }
  }, [hearingType, returnDate]);
  const emailSubject = customSubject ?? defaultSubject;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState(false);

  // Format human friendly date for summary (e.g. Thursday, October 1, 2026)
  const formattedSummaryDate = useMemo(() => {
    try {
      if (!returnDate) return 'Thursday, October 1, 2026';
      const d = new Date(returnDate + 'T00:00:00');
      if (isNaN(d.getTime())) return returnDate;
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Thursday, October 1, 2026';
    }
  }, [returnDate]);

  // Dynamic Message Template
  const dynamicMessageTemplate = useMemo(() => {
    const clientName = selectedCase?.victim_name || 'Luzviminda Reyes';
    return `Dear ${clientName},

This is a reminder of your ${hearingType} on ${formattedSummaryDate} from ${startTime} to ${endTime} at ${venue}.

Please bring:
${noticeRequirements
  .split('\n')
  .filter(Boolean)
  .map((line) => (line.startsWith('•') ? line : `• ${line}`))
  .join('\n') || '• Valid government ID'}`;
  }, [selectedCase, hearingType, formattedSummaryDate, startTime, endTime, venue, noticeRequirements]);

  if (!isOpen) return null;

  async function handleConfirmSchedule(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const caseId = selectedCase?.id || 'demo-case-1';
      const caseNumber = selectedCase?.case_number || 'VAWC-2024-004';
      const clientName = selectedCase?.victim_name || 'Luzviminda Reyes';

      let eventType: CaseScheduleItem['event_type'] = 'conciliation';
      if (hearingType.toLowerCase().includes('settlement')) eventType = 'settlement';
      else if (hearingType.toLowerCase().includes('court')) eventType = 'court_hearing';
      else if (hearingType.toLowerCase().includes('return') || hearingType.toLowerCase().includes('bpo'))
        eventType = 'follow_up';

      const created = await addCaseSchedule({
        case_id: caseId,
        case_number: caseNumber,
        client_name: clientName,
        event_type: eventType,
        title: hearingType,
        date: returnDate,
        time_start: startTime,
        time_end: endTime,
        venue: venue,
        assigned_worker: assignedWorker,
        status: 'scheduled',
        notes: noticeRequirements,
      });

      setSuccessToast(true);
      if (onScheduleCreated) {
        onScheduleCreated(created);
      }

      setTimeout(() => {
        setSuccessToast(false);
        setIsSubmitting(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Failed to create hearing schedule:', err);
      setIsSubmitting(false);
    }
  }

  const activeDocketNumber = selectedCase?.case_number || 'VAWC-2024-004';
  const activeClientName = selectedCase?.victim_name || 'Luzviminda Reyes';
  const activeBarangay = selectedCase?.barangay_id
    ? `Brgy. ${selectedCase.barangay_id}`
    : 'Brgy. Tagaytay';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[94vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* ================= MODAL HEADER ================= */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200/90">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 border border-teal-100 text-teal-700 shadow-2xs">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Set Client Return &amp; Hearing Schedule
              </h2>
              <p className="text-xs text-slate-500">
                Create the official MSWDO appointment for parties and assigned social workers.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ================= SELECTED CASE RECORD STRIP ================= */}
        <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200/90">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#0f172a] text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Folder className="h-4 w-4 text-teal-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                    SELECTED CASE RECORD
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                    ACTIVE · VAWC
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-900">
                  {activeDocketNumber} · {activeClientName} ({activeBarangay})
                </p>
              </div>
            </div>

            {/* Change Case Button */}
            {allCases.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCaseSelector(!showCaseSelector)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition shadow-2xs self-start"
                >
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                  <span>Change case</span>
                </button>

                {showCaseSelector && (
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-slate-200 shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {allCases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCaseOverride(c);
                          setShowCaseSelector(false);
                        }}
                        className="w-full text-left p-2.5 hover:bg-slate-50 text-xs transition"
                      >
                        <p className="font-bold text-slate-900">{c.victim_name}</p>
                        <p className="text-[10.5px] text-slate-400 font-mono">
                          {c.case_number} • Brgy. {c.barangay_id}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= MODAL BODY (2 COLUMNS) ================= */}
        <form
          id="hearing-schedule-form"
          onSubmit={handleConfirmSchedule}
          className="flex-1 overflow-y-auto p-4 sm:p-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* ================= LEFT COLUMN: FORM SECTIONS (7 Cols) ================= */}
            <div className="lg:col-span-7 space-y-5">
              
              {/* SECTION 1: Appointment details */}
              <div className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                      Appointment details
                    </h3>
                    <p className="text-xs text-slate-400">
                      Define the purpose and exact return window.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Hearing / agenda type *
                    </label>
                    <select
                      value={hearingType}
                      onChange={(e) => setHearingType(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="Conciliation Hearing">Conciliation Hearing</option>
                      <option value="Settlement Conference">Settlement Conference</option>
                      <option value="Client Return - RA 9262">Client Return - RA 9262</option>
                      <option value="Post-BPO Safety Monitoring">Post-BPO Safety Monitoring</option>
                      <option value="Court Hearing & Appearance">Court Hearing &amp; Appearance</option>
                      <option value="Child Safety Plan Review">Child Safety Plan Review</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Return date *
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Start time *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        placeholder="09:30 AM"
                        className="w-full pl-3 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        required
                      />
                      <Clock className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      End time *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        placeholder="10:30 AM"
                        className="w-full pl-3 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        required
                      />
                      <Clock className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-slate-400">Duration: 1 hour</p>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Venue & assignment */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                      Venue &amp; assignment
                    </h3>
                    <p className="text-xs text-slate-400">
                      Confirm where the hearing occurs and who will facilitate it.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Venue / hearing room *
                    </label>
                    <input
                      type="text"
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      placeholder="Enter venue / hearing room"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Assigned social worker / mediator *
                    </label>
                    <input
                      type="text"
                      value={assignedWorker}
                      onChange={(e) => setAssignedWorker(e.target.value)}
                      placeholder="Enter assigned social worker / mediator"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: Client preparation & notice */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                      Client preparation &amp; notice
                    </h3>
                    <p className="text-xs text-slate-400">
                      List what the client must bring and choose the next step.
                    </p>
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Notice / requirements for client
                  </label>
                  <textarea
                    rows={3}
                    value={noticeRequirements}
                    onChange={(e) => setNoticeRequirements(e.target.value)}
                    placeholder="e.g. Bring valid government ID, Barangay BPO resolution..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400">
                    This note will appear on the printable appointment slip.
                  </p>
                </div>
              </div>

              {/* SECTION 4: Automated Gmail reminder */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                      Automated Gmail reminder
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Send a professional reminder email to the client with the appointment details automatically inserted.
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={enableGmailReminder}
                      onChange={(e) => setEnableGmailReminder(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                  </label>
                </div>

                {enableGmailReminder && (
                  <div className="space-y-3 pt-2 border-t border-slate-100 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Recipient email</label>
                        <input
                          type="email"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmailOverride(e.target.value)}
                          placeholder="client@email.com"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Send timing</label>
                        <select
                          value={sendTiming}
                          onChange={(e) => setSendTiming(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                        >
                          <option value="1 day before">1 day before</option>
                          <option value="2 days before">2 days before</option>
                          <option value="Immediately on save">Immediately on save</option>
                          <option value="Same day (Morning)">Same day (Morning)</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Subject</label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setCustomSubject(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Message template</label>
                      <textarea
                        readOnly
                        rows={7}
                        value={dynamicMessageTemplate}
                        className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-slate-50/70 font-mono text-slate-700 leading-relaxed focus:outline-none"
                      />
                      <p className="text-[11px] text-slate-400">
                        The subject and message template will automatically include the client&apos;s schedule details.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ================= RIGHT COLUMN: PREVIEW SIDEBAR (5 Cols) ================= */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* 1. Dark Teal Summary Card */}
              <div className="bg-[#0b2930] text-white rounded-2xl p-5 shadow-md space-y-4 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block">
                      APPOINTMENT PREVIEW
                    </span>
                    <h3 className="text-base font-bold text-white tracking-tight mt-0.5">
                      Schedule summary
                    </h3>
                  </div>

                  <div className="h-9 w-9 rounded-xl bg-[#115e59] text-teal-300 flex items-center justify-center shrink-0">
                    <Calendar className="h-4 w-4" />
                  </div>
                </div>

                <div className="space-y-3.5 pt-2 text-xs">
                  {/* Date */}
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-teal-900/60 text-teal-300 flex items-center justify-center shrink-0 mt-0.5">
                      <Calendar className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">DATE</p>
                      <p className="text-xs font-semibold text-white mt-0.5">
                        {formattedSummaryDate}
                      </p>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-teal-900/60 text-teal-300 flex items-center justify-center shrink-0 mt-0.5">
                      <Clock className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">TIME</p>
                      <p className="text-xs font-semibold text-white mt-0.5">
                        {startTime} – {endTime} · 1 hour
                      </p>
                    </div>
                  </div>

                  {/* Agenda */}
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-teal-900/60 text-teal-300 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">AGENDA</p>
                      <p className="text-xs font-semibold text-white mt-0.5">
                        {hearingType}
                      </p>
                    </div>
                  </div>

                  {/* Venue */}
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-teal-900/60 text-teal-300 flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">VENUE</p>
                      <p className="text-xs font-semibold text-white mt-0.5 leading-snug">
                        {venue}
                      </p>
                    </div>
                  </div>

                  {/* Assigned Worker */}
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-teal-900/60 text-teal-300 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">ASSIGNED WORKER</p>
                      <p className="text-xs font-semibold text-white mt-0.5 leading-snug">
                        {assignedWorker}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Pill */}
                <div className="pt-2">
                  <div className="w-full py-2 px-3 rounded-xl bg-[#0d6b5e] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-2xs">
                    <CheckCircle2 className="h-4 w-4 text-teal-200" />
                    <span>Required schedule details complete</span>
                  </div>
                </div>
              </div>

              {/* 2. Confidential Case Record Callout */}
              <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-xl p-3.5 flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-950">Confidential case record</h4>
                  <p className="text-[11px] text-amber-900/90 mt-0.5 leading-relaxed">
                    Notice content will include only the minimum appointment details required for the client.
                  </p>
                </div>
              </div>

              {/* 3. After you confirm Card */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-3 shadow-2xs">
                <h4 className="text-xs font-bold text-slate-900">After you confirm</h4>
                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 rounded-full bg-teal-50 text-teal-700 font-bold items-center justify-center text-[10.5px] shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="leading-snug">The appointment is added to the case record.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 rounded-full bg-teal-50 text-teal-700 font-bold items-center justify-center text-[10.5px] shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="leading-snug">The email notice opens for review.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 rounded-full bg-teal-50 text-teal-700 font-bold items-center justify-center text-[10.5px] shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="leading-snug">A printable appointment slip is prepared.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* ================= MODAL FOOTER ================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 bg-white border-t border-slate-200/90">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Info className="h-3.5 w-3.5 text-slate-400" />
            <span>Fields marked * are required</span>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="hearing-schedule-form"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0d766e] hover:bg-[#0f6b64] active:scale-98 text-white font-bold text-xs shadow-xs transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving Schedule...</span>
                </>
              ) : (
                <>
                  <CalendarCheck className="h-4 w-4" />
                  <span>Confirm schedule</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Success Toast */}
        {successToast && (
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <CheckCircle2 className="h-4 w-4" />
            <span>Official hearing appointment confirmed!</span>
          </div>
        )}
      </div>
    </div>
  );
}

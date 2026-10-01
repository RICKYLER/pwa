'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  User,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  MessageSquare,
  Copy,
  Check,
  Printer,
  Send,
  Mail,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type { CaseRecord } from '@/lib/db/schema';
import { addCaseNote } from '@/lib/db/cases';
import {
  CaseScheduleItem,
  getStoredSchedules,
  seedDefaultSchedulesIfEmpty,
  addCaseSchedule,
  updateScheduleStatus,
  VENUE_OPTIONS,
  EVENT_TYPES,
} from '@/lib/cases/case-schedules';
import { cn } from '@/lib/utils';

interface CaseScheduleWidgetProps {
  cases: CaseRecord[];
  onOpenCaseFolder?: (caseId: string) => void;
}

type ScheduleTab = 'all' | 'conciliation' | 'settlement' | 'home_visit' | 'follow_up';

export default function CaseScheduleWidget({
  cases,
  onOpenCaseFolder,
}: CaseScheduleWidgetProps) {
  const [schedules, setSchedules] = useState<CaseScheduleItem[]>([]);
  const [activeTab, setActiveTab] = useState<ScheduleTab>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [modalOpen, setModalOpen] = useState(false);

  // Form state for adding schedule
  const [formCaseId, setFormCaseId] = useState('');
  const [formEventType, setFormEventType] = useState<CaseScheduleItem['event_type']>('conciliation');
  const [formTitle, setFormTitle] = useState('Conciliation & Settlement Hearing');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTimeStart, setFormTimeStart] = useState('09:30 AM');
  const [formTimeEnd, setFormTimeEnd] = useState('10:30 AM');
  const [formVenue, setFormVenue] = useState(VENUE_OPTIONS[0]);
  const [formWorker, setFormWorker] = useState('Pedro Penduko (SW II)');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Notice Modal state (Gmail SMTP + Manual)
  const [noticeModalItem, setNoticeModalItem] = useState<CaseScheduleItem | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSendSuccess, setEmailSendSuccess] = useState<string | null>(null);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);
  const [noticeCopied, setNoticeCopied] = useState(false);
  const [openNoticeAfterSave, setOpenNoticeAfterSave] = useState(true);

  // Sync recipient email when modal opens
  useEffect(() => {
    if (noticeModalItem) {
      const targetCase = cases.find((c) => c.id === noticeModalItem.case_id);
      const contact = targetCase?.victim_contact || '';
      if (contact.includes('@')) {
        setRecipientEmail(contact.trim());
      } else {
        setRecipientEmail('');
      }
      setEmailSendSuccess(null);
      setEmailSendError(null);
      setNoticeCopied(false);
    }
  }, [noticeModalItem, cases]);

  // Send Notice via Gmail SMTP API
  async function handleSendGmailNotice() {
    if (!noticeModalItem) return;
    if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
      setEmailSendError('Please provide a valid recipient email address (e.g. client@gmail.com).');
      return;
    }

    setIsSendingEmail(true);
    setEmailSendSuccess(null);
    setEmailSendError(null);

    try {
      const res = await fetch('/api/cases/send-hearing-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail.trim(),
          clientName: noticeModalItem.client_name,
          caseNumber: noticeModalItem.case_number,
          title: noticeModalItem.title,
          date: noticeModalItem.date,
          timeStart: noticeModalItem.time_start,
          timeEnd: noticeModalItem.time_end,
          venue: noticeModalItem.venue,
          assignedWorker: noticeModalItem.assigned_worker,
          notes: noticeModalItem.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch email via SMTP');
      }

      // Record in case notes for audit trail
      try {
        await addCaseNote(noticeModalItem.case_id, {
          worker_name: noticeModalItem.assigned_worker || 'MSWDO Caseworker',
          date: new Date().toISOString().split('T')[0],
          note: `[EMAIL NOTICE DISPATCHED VIA GMAIL SMTP]: Official Hearing Notice emailed to ${recipientEmail.trim()} for ${noticeModalItem.title} on ${noticeModalItem.date} at ${noticeModalItem.venue}.`,
        });
      } catch (noteErr) {
        console.warn('Note audit log skipped:', noteErr);
      }

      setEmailSendSuccess(`✓ Hearing notice sent to ${recipientEmail.trim()} via your configured Gmail SMTP!`);
    } catch (err: any) {
      console.error('Email dispatch error:', err);
      setEmailSendError(err.message || 'Failed to send email. Check SMTP settings in .env.local.');
    } finally {
      setIsSendingEmail(false);
    }
  }

  // Pre-formatted Gmail Web Compose link for manual dispatch
  const gmailWebComposeUrl = useMemo(() => {
    if (!noticeModalItem) return '#';
    const subject = encodeURIComponent(
      `OFFICIAL NOTICE OF HEARING: Case Docket ${noticeModalItem.case_number} - ${noticeModalItem.title}`
    );
    const body = encodeURIComponent(
      `Dear ${noticeModalItem.client_name},\n\nThis is an official notice of appearance from the Municipal Social Welfare and Development Office (MSWDO).\n\nYou are scheduled to appear for:\nAgenda: ${noticeModalItem.title}\nDate: ${noticeModalItem.date}\nTime: ${noticeModalItem.time_start} - ${noticeModalItem.time_end}\nVenue: ${noticeModalItem.venue}\nAssigned Social Worker: ${noticeModalItem.assigned_worker}\n${noticeModalItem.notes ? `Instructions: ${noticeModalItem.notes}\n` : ''}\nPlease arrive 15 minutes before your schedule and bring a valid government ID.\n\nRespectfully,\n${noticeModalItem.assigned_worker}\nMSWDO Casework Unit`
    );
    const to = encodeURIComponent(recipientEmail.trim() || '');
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
  }, [noticeModalItem, recipientEmail]);

  // Official Printable Notice Slip Generator
  function handlePrintNoticeSlip(item: CaseScheduleItem, victimContact?: string) {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('Please allow popups to print notice slip.');
      return;
    }
    const dateFormatted = new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Notice of Appearance - ${item.case_number}</title>
        <style>
          body { font-family: 'Times New Roman', Times, serif; padding: 40px; color: #111; line-height: 1.5; font-size: 14px; }
          .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #333; padding-bottom: 12px; }
          .header p { margin: 2px 0; font-size: 13px; text-transform: uppercase; }
          .header h2 { margin: 5px 0; font-size: 17px; font-weight: bold; }
          .title { text-align: center; margin: 25px 0 20px; font-size: 18px; font-weight: bold; text-decoration: underline; text-transform: uppercase; }
          .details-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .details-table td { padding: 6px 4px; vertical-align: top; }
          .details-table td.label { font-weight: bold; width: 180px; }
          .content { font-size: 14px; margin-bottom: 25px; text-align: justify; text-indent: 30px; }
          .signatures { margin-top: 50px; display: flex; justify-content: space-between; font-size: 13px; }
          .sig-block { width: 45%; text-align: center; }
          .sig-line { border-top: 1px solid #111; margin-top: 45px; padding-top: 4px; font-weight: bold; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <p>Republic of the Philippines</p>
          <p>Province of Davao del Sur &bull; Municipality of Bansalan</p>
          <h2>MUNICIPAL SOCIAL WELFARE AND DEVELOPMENT OFFICE (MSWDO)</h2>
          <p>Women &amp; Children Protection Desk / Social Casework Unit</p>
        </div>

        <div class="title">Official Notice of Appearance &amp; Hearing</div>

        <table class="details-table">
          <tr><td class="label">Docket / Case No.:</td><td><strong>${item.case_number}</strong></td></tr>
          <tr><td class="label">Client / Party Name:</td><td><strong>${item.client_name}</strong> ${victimContact ? `(${victimContact})` : ''}</td></tr>
          <tr><td class="label">Agenda / Session:</td><td><strong>${item.title}</strong></td></tr>
          <tr><td class="label">Hearing Date:</td><td><strong>${dateFormatted}</strong></td></tr>
          <tr><td class="label">Time:</td><td><strong>${item.time_start} &ndash; ${item.time_end}</strong></td></tr>
          <tr><td class="label">Venue / Room:</td><td><strong>${item.venue}</strong></td></tr>
          <tr><td class="label">Assigned Worker:</td><td><strong>${item.assigned_worker}</strong></td></tr>
          ${item.notes ? `<tr><td class="label">Required Documents / Instructions:</td><td>${item.notes}</td></tr>` : ''}
        </table>

        <div class="content">
          Please be informed that your presence is respectfully requested at the specified venue and time for the official proceeding stated above. Kindly bring a valid government-issued ID and any relevant documents pertinent to your case dossier. Failure to appear without prior written notification may cause delay in the settlement and resolution of your case.
        </div>

        <div class="signatures">
          <div class="sig-block">
            <p>Issued by:</p>
            <div class="sig-line">${item.assigned_worker}</div>
            <p>Social Worker / Case Mediator</p>
          </div>
          <div class="sig-block">
            <p>Copy Received by:</p>
            <div class="sig-line">${item.client_name}</div>
            <p>Client / Authorized Representative<br><small>Date Received: ____________________</small></p>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // Load and seed schedules
  useEffect(() => {
    function refresh() {
      const items = seedDefaultSchedulesIfEmpty(cases);
      setSchedules([...items]);
    }
    refresh();

    function handleScheduleChange() {
      setSchedules([...getStoredSchedules()]);
    }

    window.addEventListener('mswdo-case-schedules-changed', handleScheduleChange);
    return () => {
      window.removeEventListener('mswdo-case-schedules-changed', handleScheduleChange);
    };
  }, [cases]);

  // Selected date formatting
  const dateFormatted = useMemo(() => {
    return selectedDate.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [selectedDate]);

  const dateYMD = useMemo(() => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;
  }, [selectedDate]);

  // Navigate date
  function handlePrevDay() {
    setSelectedDate(new Date(selectedDate.getTime() - 86400000));
  }

  function handleNextDay() {
    setSelectedDate(new Date(selectedDate.getTime() + 86400000));
  }

  function handleToday() {
    setSelectedDate(new Date());
  }

  // Filtered schedules for view
  const visibleSchedules = useMemo(() => {
    return schedules.filter((item) => {
      // Filter by tab
      if (activeTab !== 'all' && item.event_type !== activeTab) {
        return false;
      }
      return true;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [schedules, activeTab]);

  // Selected case object for modal auto-filling
  const selectedCaseObj = useMemo(() => {
    return cases.find((c) => c.id === formCaseId) || cases[0];
  }, [cases, formCaseId]);

  // Handle submit new return schedule
  async function handleSubmitSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCaseObj) return;

    setIsSubmitting(true);
    try {
      const createdItem = await addCaseSchedule({
        case_id: selectedCaseObj.id,
        case_number: selectedCaseObj.case_number,
        client_name: selectedCaseObj.victim_name,
        event_type: formEventType,
        title: formTitle,
        date: formDate,
        time_start: formTimeStart,
        time_end: formTimeEnd,
        venue: formVenue,
        assigned_worker: formWorker,
        status: 'scheduled',
        notes: formNotes,
      });

      setModalOpen(false);
      setFormNotes('');

      if (openNoticeAfterSave) {
        setNoticeModalItem(createdItem);
      }
    } catch (err) {
      console.error('Failed to create return schedule:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            Schedule of Client Return &amp; Settlement
          </h3>
          <p className="text-xs text-slate-400 font-medium">
            Hearing calendar, amicable conciliations, and follow-ups
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (cases.length > 0 && !formCaseId) {
              setFormCaseId(cases[0].id);
            }
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-2xs cursor-pointer active:scale-98"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Set Schedule</span>
        </button>
      </div>

      {/* Date Navigator Bar (Aspire reference style: < 10 Nov 2025 >) */}
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl p-1.5 text-xs font-bold">
        <button
          type="button"
          onClick={handlePrevDay}
          className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition cursor-pointer"
          title="Previous Day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          <CalendarIcon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-slate-900 font-mono tracking-tight">{dateFormatted}</span>
          <button
            type="button"
            onClick={handleToday}
            className="text-[10.5px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer shadow-2xs"
          >
            Today
          </button>
        </div>

        <button
          type="button"
          onClick={handleNextDay}
          className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition cursor-pointer"
          title="Next Day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Category Tabs (Aspire style: Events, Celebrations, Holiday) */}
      <div className="flex items-center gap-1 border-b border-slate-100 pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={cn(
            'px-3 py-1 rounded-lg font-bold transition cursor-pointer',
            activeTab === 'all'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          )}
        >
          All Sessions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('conciliation')}
          className={cn(
            'px-3 py-1 rounded-lg font-bold transition cursor-pointer',
            activeTab === 'conciliation'
              ? 'bg-emerald-700 text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          )}
        >
          Conciliation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settlement')}
          className={cn(
            'px-3 py-1 rounded-lg font-bold transition cursor-pointer',
            activeTab === 'settlement'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          )}
        >
          Settlement
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('follow_up')}
          className={cn(
            'px-3 py-1 rounded-lg font-bold transition cursor-pointer',
            activeTab === 'follow_up'
              ? 'bg-indigo-700 text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          )}
        >
          Follow-up
        </button>
      </div>

      {/* Vertical Timeline Event Cards (Aspire Schedule layout) */}
      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
        {visibleSchedules.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No hearing or settlement schedule found for this filter.
          </div>
        ) : (
          visibleSchedules.map((item) => {
            const isToday = item.date === dateYMD;
            return (
              <div
                key={item.id}
                className={cn(
                  'p-3.5 rounded-xl border transition-all flex items-start gap-3.5 group',
                  isToday
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : 'bg-white border-slate-200/80 hover:border-slate-300'
                )}
              >
                {/* Time Column on Left */}
                <div className="text-right shrink-0 w-20 space-y-0.5 pt-0.5">
                  <p className="text-xs font-black text-slate-900 font-mono tracking-tight">
                    {item.time_start}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono font-medium">
                    {item.time_end}
                  </p>
                </div>

                {/* Vertical Accent Color Indicator */}
                <div
                  className={cn(
                    'w-1 self-stretch rounded-full shrink-0',
                    item.event_type === 'conciliation' && 'bg-emerald-500',
                    item.event_type === 'settlement' && 'bg-amber-500',
                    item.event_type === 'home_visit' && 'bg-blue-500',
                    item.event_type === 'follow_up' && 'bg-indigo-500',
                    item.event_type === 'court_hearing' && 'bg-purple-500'
                  )}
                />

                {/* Details Column */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {item.title}
                    </p>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider shrink-0',
                        item.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-800 animate-pulse'
                          : 'bg-slate-100 text-slate-700'
                      )}
                    >
                      {item.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Case Number & Client */}
                  <p className="text-xs text-slate-700 font-medium truncate">
                    <strong className="font-mono text-slate-900">{item.case_number}:</strong>{' '}
                    <span>{item.client_name}</span>
                  </p>

                  {/* Venue & Assigned Worker */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                    <span className="flex items-center gap-1 text-slate-600 font-semibold truncate" title={item.venue}>
                      <MapPin className="h-3 w-3 text-emerald-600 shrink-0" />
                      <span className="truncate">{item.venue}</span>
                    </span>
                    <span className="flex items-center gap-1 truncate text-slate-500">
                      <User className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{item.assigned_worker}</span>
                    </span>
                  </div>

                  {/* Quick Actions Row */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 mt-1">
                    <div>
                      {onOpenCaseFolder && (
                        <button
                          type="button"
                          onClick={() => onOpenCaseFolder(item.case_id)}
                          className="text-[11.5px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                        >
                          Open Case Dossier →
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setNoticeModalItem(item);
                        }}
                        className="text-[11px] font-bold text-slate-700 hover:text-indigo-900 bg-slate-100 hover:bg-indigo-50 border border-slate-200/90 hover:border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition active:scale-95 shadow-2xs"
                        title="Send Official Notice via Gmail SMTP or Print Hearing Slip"
                      >
                        <Mail className="h-3 w-3 text-indigo-600" />
                        <span>Notice (Gmail / Slip)</span>
                      </button>

                      {item.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => updateScheduleStatus(item.id, 'completed')}
                          className="text-[11px] font-bold text-slate-500 hover:text-emerald-800 flex items-center gap-1 cursor-pointer px-2 py-1 rounded-lg hover:bg-emerald-50 transition"
                          title="Mark hearing session concluded"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Concluded</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Set Return / Settlement Schedule */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Set Client Return &amp; Hearing Schedule
                </h3>
                <p className="text-xs text-slate-500">
                  Official MSWDO appointment notice for parties and social workers
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSchedule} className="space-y-3.5 text-xs">
              {/* Case Record Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Select Case Record / Docket:
                </label>
                <select
                  value={formCaseId}
                  onChange={(e) => setFormCaseId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none cursor-pointer"
                  required
                >
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.case_number} — {c.victim_name} (Brgy. {c.barangay_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Event / Session Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Hearing / Agenda Type:
                  </label>
                  <select
                    value={formEventType}
                    onChange={(e) => {
                      const val = e.target.value as CaseScheduleItem['event_type'];
                      setFormEventType(val);
                      const matching = EVENT_TYPES.find((t) => t.id === val);
                      if (matching) setFormTitle(matching.label);
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none cursor-pointer"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Return Date:
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Time Slots */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Time Start:
                  </label>
                  <input
                    type="text"
                    value={formTimeStart}
                    onChange={(e) => setFormTimeStart(e.target.value)}
                    placeholder="09:30 AM"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Time End:
                  </label>
                  <input
                    type="text"
                    value={formTimeEnd}
                    onChange={(e) => setFormTimeEnd(e.target.value)}
                    placeholder="10:30 AM"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Venue / Hearing Room Location */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Venue / Hearing Room Location:
                </label>
                <select
                  value={formVenue}
                  onChange={(e) => setFormVenue(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none cursor-pointer"
                >
                  {VENUE_OPTIONS.map((v, i) => (
                    <option key={i} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned Worker */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Assigned Social Worker / Mediator:
                </label>
                <input
                  type="text"
                  value={formWorker}
                  onChange={(e) => setFormWorker(e.target.value)}
                  placeholder="e.g. Pedro Penduko (SW II)"
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none"
                  required
                />
              </div>

              {/* Instructions / Notes for Client */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Notice / Requirements for Client:
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Bring valid government ID, Barangay BPO resolution, and proof of monthly income."
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none resize-none"
                />
              </div>

              {/* Checkbox for auto-opening notice slip */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={openNoticeAfterSave}
                    onChange={(e) => setOpenNoticeAfterSave(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Open Gmail Notice &amp; Printable Slip immediately after saving
                  </span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition shadow-xs cursor-pointer active:scale-98"
                >
                  {isSubmitting ? 'Saving...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Official Hearing Notice & Gmail SMTP Dispatch Helper */}
      {noticeModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-emerald-700" />
                  <span>Official Hearing Notice &amp; Gmail Dispatch</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Automatic dispatch via your configured Gmail SMTP, plus manual webmail &amp; printable slip
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNoticeModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Target Case & Client Information */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Case Docket:</span>
                <span className="font-mono font-bold text-slate-900">{noticeModalItem.case_number}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Client / Recipient:</span>
                <span className="font-bold text-slate-900">{noticeModalItem.client_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Date &amp; Time:</span>
                <span className="font-semibold text-slate-800">
                  {new Date(noticeModalItem.date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  &bull; {noticeModalItem.time_start} - {noticeModalItem.time_end}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Venue:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[280px]" title={noticeModalItem.venue}>
                  {noticeModalItem.venue}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Assigned Officer:</span>
                <span className="font-semibold text-slate-800">
                  {noticeModalItem.assigned_worker}
                </span>
              </div>
            </div>

            {/* Recipient Email Address Input */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">
                Recipient Email Address (Client / Relative):
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="e.g. client@gmail.com or authorized_party@gmail.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 text-xs focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none transition"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Connected to your Gmail SMTP server (no SMS API key or mobile credits required).
              </p>
            </div>

            {/* Feedback Alerts */}
            {emailSendSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{emailSendSuccess}</span>
              </div>
            )}
            {emailSendError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{emailSendError}</span>
              </div>
            )}

            {/* Official Notice Text Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-slate-700">Official Notice Content:</label>
                <span className="text-slate-400 text-[11px]">Republic of the Philippines &bull; MSWDO</span>
              </div>
              <div className="relative">
                <textarea
                  readOnly
                  rows={5}
                  value={`OFFICIAL NOTICE OF HEARING - MSWDO PROTECTION DESK\nCase Docket: ${noticeModalItem.case_number}\nClient: ${noticeModalItem.client_name}\n\nDear ${noticeModalItem.client_name},\n\nYou are respectfully requested to attend your scheduled ${noticeModalItem.title}:\nDate: ${new Date(noticeModalItem.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\nTime: ${noticeModalItem.time_start} - ${noticeModalItem.time_end}\nVenue: ${noticeModalItem.venue}\nAssigned Social Worker: ${noticeModalItem.assigned_worker}\n${noticeModalItem.notes ? `Instructions: ${noticeModalItem.notes}\n` : ''}\nPlease arrive 15 minutes before your schedule and bring valid government ID.\nMSWDO Casework Unit`}
                  className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50/70 font-mono text-[11.5px] leading-relaxed text-slate-800 outline-none resize-none select-all"
                />
              </div>
            </div>

            {/* Action Buttons: Automatic SMTP + Manual Options */}
            <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-100">
              {/* Row 1: Primary 1-Click Automatic Send via Gmail SMTP */}
              <button
                type="button"
                onClick={handleSendGmailNotice}
                disabled={isSendingEmail}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-xs cursor-pointer active:scale-98 disabled:opacity-60"
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Dispatching via Gmail SMTP...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>⚡ Send Automatically via Gmail SMTP</span>
                  </>
                )}
              </button>

              {/* Row 2: Manual Dispatch Alternatives */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {/* Manual Open in Gmail Web */}
                  <a
                    href={gmailWebComposeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    title="Open Gmail web compose tab with pre-filled notice"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                    <span>Open in Gmail Web</span>
                  </a>

                  {/* Manual Copy Notice Text */}
                  <button
                    type="button"
                    onClick={async () => {
                      const text = `OFFICIAL NOTICE OF HEARING - MSWDO PROTECTION DESK\nCase Docket: ${noticeModalItem.case_number}\nClient: ${noticeModalItem.client_name}\n\nDear ${noticeModalItem.client_name},\n\nYou are respectfully requested to attend your scheduled ${noticeModalItem.title}:\nDate: ${new Date(noticeModalItem.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\nTime: ${noticeModalItem.time_start} - ${noticeModalItem.time_end}\nVenue: ${noticeModalItem.venue}\nAssigned Social Worker: ${noticeModalItem.assigned_worker}\n${noticeModalItem.notes ? `Instructions: ${noticeModalItem.notes}\n` : ''}\nPlease arrive 15 minutes before your schedule and bring valid government ID.\nMSWDO Casework Unit`;
                      try {
                        await navigator.clipboard.writeText(text);
                        setNoticeCopied(true);
                        setTimeout(() => setNoticeCopied(false), 3000);
                      } catch (err) {
                        console.error('Failed to copy notice:', err);
                      }
                    }}
                    className={cn(
                      'px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border',
                      noticeCopied
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                    )}
                  >
                    {noticeCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-700" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                        <span>Copy Notice Text</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Print Physical Hearing Notice Slip */}
                <button
                  type="button"
                  onClick={() =>
                    handlePrintNoticeSlip(
                      noticeModalItem,
                      cases.find((c) => c.id === noticeModalItem.case_id)?.victim_contact
                    )
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ml-auto"
                  title="Print Official Notice of Appearance Slip"
                >
                  <Printer className="h-3.5 w-3.5 text-slate-500" />
                  <span>Print Paper Slip</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

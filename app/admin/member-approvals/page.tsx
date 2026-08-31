'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  Home,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
  UserRound,
  UserX,
  Users,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { getCurrentUser } from '@/lib/auth';
import {
  getMemberApprovalHistory,
  getPendingMemberApprovals,
  type MemberApprovalHistoryEntry,
  type PendingMemberApproval,
} from '@/lib/db/member-approvals';
import { rejectResident, verifyResident } from '@/lib/db/residents';
import { calculateAge, hasValidResidentBirthdate } from '@/lib/db/vulnerability';
import { hasSensitiveHealthData, logSensitiveDataView } from '@/lib/audit-view';
import type { CivilStatus, IncomeLevel, PWDType, VulnerabilityFlags } from '@/lib/db/schema';
import { bootstrapSupabaseTables } from '@/lib/supabase/bootstrap';
import { CivicBadge } from '@/components/ui/civic-primitives';
import { cn } from '@/lib/utils';

const BOOTSTRAP_TABLES = ['households', 'residents', 'audit_logs'] as const;
const WATCHED_TABLES = ['households', 'residents', 'audit_logs'];

type HistoryFilter = 'all' | 'approved' | 'rejected';

interface ToastState {
  type: 'success' | 'error';
  msg: string;
}

interface HouseholdGroup {
  householdId: string;
  headName: string;
  location: string;
  contactNumber?: string;
  applicantEmail?: string;
  members: PendingMemberApproval[];
}

function formatAge(birthdate: string): string | null {
  if (!hasValidResidentBirthdate(birthdate)) {
    return null;
  }
  return `${calculateAge(birthdate)} yrs old`;
}

function formatDecisionDate(value: number): string {
  if (!value) {
    return 'Not recorded';
  }
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatMemberDetails(entry: MemberApprovalHistoryEntry): string {
  const parts: string[] = [];
  if (entry.birthdate && hasValidResidentBirthdate(entry.birthdate)) {
    parts.push(`${calculateAge(entry.birthdate)} yrs old`);
  }
  if (entry.gender) {
    parts.push(entry.gender === 'M' ? 'Male' : 'Female');
  }
  return parts.join(' · ');
}

const CIVIL_STATUS_LABELS: Record<CivilStatus, string> = {
  single: 'Single',
  married: 'Married',
  widowed: 'Widowed',
  separated: 'Separated',
};

const INCOME_LABELS: Record<IncomeLevel, string> = {
  low: 'Low income',
  middle: 'Middle income',
  high: 'High income',
};

const PWD_TYPE_LABELS: Record<PWDType, string> = {
  physical: 'Physical',
  visual: 'Visual',
  hearing: 'Hearing',
  intellectual: 'Intellectual',
  psychosocial: 'Psychosocial',
};

function formatDateOnly(value?: string): string | null {
  if (!value || !hasValidResidentBirthdate(value)) {
    return null;
  }
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
}

function formatSubmittedAt(value?: Date): string {
  if (!value) {
    return 'Not recorded';
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not recorded';
  }
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

/**
 * Collapse the health fields the add-member form collected (pregnancy, PWD)
 * into one human-readable summary line, e.g. "Pregnant · 5 mo · EDD Jan 15" or
 * "PWD — Physical". Returns null when the member reported none of these.
 */
function formatHealthSummary(flags?: VulnerabilityFlags): string | null {
  if (!flags) {
    return null;
  }
  const parts: string[] = [];
  if (flags.is_pregnant) {
    let pregnancy = 'Pregnant';
    if (typeof flags.pregnancy_months === 'number') {
      pregnancy += ` · ${flags.pregnancy_months} mo`;
    }
    const edd = formatDateOnly(flags.expected_delivery_date);
    if (edd) {
      pregnancy += ` · EDD ${edd}`;
    }
    parts.push(pregnancy);
  }
  if (flags.is_pwd) {
    parts.push(flags.pwd_type ? `PWD — ${PWD_TYPE_LABELS[flags.pwd_type]}` : 'PWD');
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export default function AdminMemberApprovalsPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [isLoading, setIsLoading] = useState(true);
  const [approvals, setApprovals] = useState<PendingMemberApproval[]>([]);
  const [history, setHistory] = useState<MemberApprovalHistoryEntry[]>([]);
  const [optimisticHistory, setOptimisticHistory] = useState<MemberApprovalHistoryEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [actionResidentId, setActionResidentId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((type: ToastState['type'], msg: string) => {
    setToast({ type, msg });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (background = false) => {
    if (!background) {
      setIsLoading(true);
    }
    try {
      const [pending, historyEntries] = await Promise.all([
        getPendingMemberApprovals(),
        getMemberApprovalHistory(),
      ]);
      setApprovals(pending);
      setHistory(historyEntries);
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to load member approvals.');
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  }, [showToast]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    void (async () => {
      await bootstrapSupabaseTables([...BOOTSTRAP_TABLES], { force: true });
      await load();
    })();
  }, [load, router, user]);

  useEffect(() => {
    function handleDataChanged(event: Event) {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail && !WATCHED_TABLES.includes(detail.table || '')) {
        return;
      }
      void load(true);
    }

    window.addEventListener('mswdo-data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('mswdo-data-changed', handleDataChanged);
    };
  }, [load]);

  const groups = useMemo<HouseholdGroup[]>(() => {
    const byHousehold = new Map<string, HouseholdGroup>();
    approvals.forEach((approval) => {
      const { household } = approval;
      const existing = byHousehold.get(household.id);
      if (existing) {
        existing.members.push(approval);
        return;
      }
      byHousehold.set(household.id, {
        householdId: household.id,
        headName: household.head_name,
        location: [household.purok_sitio, household.street_address].filter(Boolean).join(' · '),
        contactNumber: household.contact_number?.trim() || undefined,
        applicantEmail: household.applicant_email?.trim() || undefined,
        members: [approval],
      });
    });
    return Array.from(byHousehold.values());
  }, [approvals]);

  // The store is the source of truth; optimistic entries bridge the gap between a
  // decision and the next background reload so a just-decided member appears at once.
  const mergedHistory = useMemo(() => {
    const byKey = new Map<string, MemberApprovalHistoryEntry>();
    optimisticHistory.forEach((entry) => byKey.set(entry.key, entry));
    history.forEach((entry) => byKey.set(entry.key, entry));
    return Array.from(byKey.values()).sort((left, right) => right.decidedAt - left.decidedAt);
  }, [history, optimisticHistory]);

  const approvedCount = useMemo(
    () => mergedHistory.filter((entry) => entry.decision === 'approved').length,
    [mergedHistory],
  );
  const rejectedCount = useMemo(
    () => mergedHistory.filter((entry) => entry.decision === 'rejected').length,
    [mergedHistory],
  );

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') {
      return mergedHistory;
    }
    return mergedHistory.filter((entry) => entry.decision === historyFilter);
  }, [historyFilter, mergedHistory]);

  const totalPending = approvals.length;

  function rememberDecision(entry: MemberApprovalHistoryEntry) {
    setOptimisticHistory((prev) => [entry, ...prev.filter((item) => item.key !== entry.key)]);
  }

  async function handleAccept(approval: PendingMemberApproval) {
    const { resident, household } = approval;
    setActionResidentId(resident.id);
    try {
      await verifyResident(resident.id);
      setApprovals((prev) => prev.filter((item) => item.resident.id !== resident.id));
      rememberDecision({
        key: `approved:${resident.id}`,
        residentId: resident.id,
        memberName: resident.full_name,
        relationship: resident.relationship_to_head || undefined,
        birthdate: resident.birthdate,
        gender: resident.gender,
        decision: 'approved',
        decidedAt: Date.now(),
        household: {
          id: household.id,
          headName: household.head_name,
          location: [household.purok_sitio, household.street_address].filter(Boolean).join(' · '),
          contactNumber: household.contact_number?.trim() || undefined,
          applicantEmail: household.applicant_email?.trim() || undefined,
        },
      });
      showToast('success', `${resident.full_name} approved and verified.`);
    } catch (error) {
      console.error(error);
      showToast('error', `Could not approve ${resident.full_name}.`);
    } finally {
      setActionResidentId(null);
    }
  }

  function openReject(residentId: string) {
    setRejectingId(residentId);
    setRejectReason('');
  }

  function cancelReject() {
    setRejectingId(null);
    setRejectReason('');
  }

  function toggleDetails(approval: PendingMemberApproval) {
    const { resident, flags } = approval;
    const wasExpanded = expandedIds.has(resident.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resident.id)) {
        next.delete(resident.id);
      } else {
        next.add(resident.id);
      }
      return next;
    });
    // Expanding a member whose details include sensitive health fields
    // (pregnancy, disability, chronic illness) is a protected-data access — log
    // it so the view is auditable. Collapsing never audits.
    if (!wasExpanded && hasSensitiveHealthData(flags)) {
      logSensitiveDataView(resident.id);
    }
  }

  async function confirmReject(approval: PendingMemberApproval) {
    const { resident, household } = approval;
    const reason = rejectReason.trim();
    setActionResidentId(resident.id);
    try {
      await rejectResident(resident.id, rejectReason);
      setApprovals((prev) => prev.filter((item) => item.resident.id !== resident.id));
      rememberDecision({
        key: `rejected:${resident.id}`,
        residentId: resident.id,
        memberName: resident.full_name,
        decision: 'rejected',
        decidedAt: Date.now(),
        reason: reason || undefined,
        household: {
          id: household.id,
          headName: household.head_name,
          location: [household.purok_sitio, household.street_address].filter(Boolean).join(' · '),
          contactNumber: household.contact_number?.trim() || undefined,
          applicantEmail: household.applicant_email?.trim() || undefined,
        },
      });
      setRejectingId(null);
      setRejectReason('');
      showToast('success', `${resident.full_name} was rejected.`);
    } catch (error) {
      console.error(error);
      showToast('error', `Could not reject ${resident.full_name}.`);
    } finally {
      setActionResidentId(null);
    }
  }

  return (
    <AppShell title="Member Approvals">
      <div className="mx-auto max-w-[1040px] space-y-6 p-4 sm:p-6 lg:p-8">
        {toast && (
          <div
            className={cn(
              'fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg',
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white',
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.msg}
          </div>
        )}

        <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Administration</p>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-[2rem]">Member Approvals</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                New household members that residents added and that still need review. Each card shows the household
                leader who added them — approve to verify a member, or reject to decline them and notify the resident.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-950 text-white shadow-sm">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-3xl font-black tracking-tight text-slate-950">{totalPending}</p>
                <p className="text-xs font-semibold text-slate-500">Awaiting review</p>
              </div>
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-500 shadow-sm">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading member approvals…
          </div>
        ) : totalPending === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-bold text-slate-900">You&rsquo;re all caught up</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              No new household members are waiting for approval. New members that residents add will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <section
                key={group.householdId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <header className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-900">
                        <Home className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-800">
                          Household Leader
                        </p>
                        <p className="truncate text-sm font-bold text-slate-950">{group.headName}</p>
                        {group.location ? (
                          <p className="truncate text-xs text-slate-500">{group.location}</p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {group.contactNumber ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              {group.contactNumber}
                            </span>
                          ) : null}
                          {group.applicantEmail ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5 text-slate-400" />
                              {group.applicantEmail}
                            </span>
                          ) : null}
                          <Link
                            href={`/households/${group.householdId}`}
                            className="inline-flex items-center gap-1 font-semibold text-cyan-800 hover:text-cyan-900"
                          >
                            Open household
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                    <CivicBadge tone="amber" label={`${group.members.length} pending`} />
                  </div>
                </header>

                <div className="flex items-center gap-2 px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <UserRound className="h-3.5 w-3.5" />
                  Members added — awaiting your review
                </div>

                <ul className="divide-y divide-slate-100">
                  {group.members.map((approval) => {
                    const { resident } = approval;
                    const busy = actionResidentId === resident.id;
                    const isRejecting = rejectingId === resident.id;
                    const age = formatAge(resident.birthdate);
                    const isExpanded = expandedIds.has(resident.id);
                    const birthdateDisplay = formatDateOnly(resident.birthdate);
                    const healthSummary = formatHealthSummary(approval.flags);

                    return (
                      <li key={resident.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 shrink-0 text-slate-400" />
                              <p className="truncate text-sm font-semibold text-slate-900">{resident.full_name}</p>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {resident.relationship_to_head ? (
                                <CivicBadge tone="slate" label={resident.relationship_to_head} />
                              ) : null}
                              {age ? <CivicBadge tone="slate" label={age} /> : null}
                              {resident.gender ? (
                                <CivicBadge tone="slate" label={resident.gender === 'M' ? 'Male' : 'Female'} />
                              ) : null}
                            </div>
                          </div>

                          {!isRejecting ? (
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAccept(approval)}
                                disabled={busy}
                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => openReject(resident.id)}
                                disabled={busy}
                                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60"
                              >
                                <UserX className="h-4 w-4" />
                                Reject
                              </button>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => toggleDetails(approval)}
                            className="inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-cyan-800 transition hover:text-cyan-900"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {isExpanded ? 'Hide details' : 'View full details'}
                          </button>
                        </div>

                        {isExpanded ? (
                          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-3">
                            <DetailItem label="Birthdate">
                              {birthdateDisplay ? (
                                <>
                                  {birthdateDisplay}
                                  {age ? <span className="text-slate-500"> · {age}</span> : null}
                                </>
                              ) : (
                                <span className="text-slate-400">Not provided</span>
                              )}
                            </DetailItem>
                            <DetailItem label="Gender">
                              {resident.gender ? (resident.gender === 'M' ? 'Male' : 'Female') : (
                                <span className="text-slate-400">Not provided</span>
                              )}
                            </DetailItem>
                            <DetailItem label="Relationship to head">
                              {resident.relationship_to_head || <span className="text-slate-400">Not provided</span>}
                            </DetailItem>
                            <DetailItem label="Civil status">
                              {resident.civil_status ? (
                                CIVIL_STATUS_LABELS[resident.civil_status]
                              ) : (
                                <span className="text-slate-400">Not provided</span>
                              )}
                            </DetailItem>
                            <DetailItem label="Occupation">
                              {resident.occupation?.trim() || <span className="text-slate-400">Not provided</span>}
                            </DetailItem>
                            <DetailItem label="Income level">
                              {resident.income_level ? (
                                INCOME_LABELS[resident.income_level]
                              ) : (
                                <span className="text-slate-400">Not provided</span>
                              )}
                            </DetailItem>
                            <DetailItem label="Contact number">
                              {resident.contact_number?.trim() || <span className="text-slate-400">Not provided</span>}
                            </DetailItem>
                            <DetailItem label="Submitted">
                              {formatSubmittedAt(resident.createdAt)}
                            </DetailItem>
                            <DetailItem label="Health details">
                              {healthSummary ? (
                                <span className="font-semibold text-rose-700">{healthSummary}</span>
                              ) : (
                                <span className="text-slate-400">None reported</span>
                              )}
                            </DetailItem>
                          </dl>
                        ) : null}

                        {isRejecting ? (
                          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                            <label className="text-xs font-semibold text-rose-800" htmlFor={`reason-${resident.id}`}>
                              Reason for rejecting {resident.full_name} (optional)
                            </label>
                            <textarea
                              id={`reason-${resident.id}`}
                              value={rejectReason}
                              onChange={(event) => setRejectReason(event.target.value)}
                              rows={2}
                              placeholder="e.g. Duplicate entry, or member does not belong to this household."
                              className="mt-2 w-full resize-none rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                            />
                            <div className="mt-3 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelReject}
                                disabled={busy}
                                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => confirmReject(approval)}
                                disabled={busy}
                                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                              >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                                Reject member
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {!isLoading ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-500" />
                  <h2 className="text-base font-bold text-slate-900">Member Approval History</h2>
                </div>
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                  Every member you approved or rejected, and the household leader who added them. Most recent first.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                <Clock3 className="h-3.5 w-3.5" />
                {mergedHistory.length} record{mergedHistory.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  { key: 'all', label: `All (${mergedHistory.length})` },
                  { key: 'approved', label: `Approved (${approvedCount})` },
                  { key: 'rejected', label: `Rejected (${rejectedCount})` },
                ] as { key: HistoryFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setHistoryFilter(tab.key)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                    historyFilter === tab.key
                      ? 'bg-cyan-950 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">Member</th>
                    <th className="px-3 py-3">Household Leader</th>
                    <th className="px-3 py-3">Relationship</th>
                    <th className="px-3 py-3">Details</th>
                    <th className="px-3 py-3">Location</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Decision Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {filteredHistory.map((entry) => {
                    const details = formatMemberDetails(entry);
                    return (
                      <tr key={entry.key} className="align-top">
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-900">{entry.memberName}</p>
                          {entry.decision === 'rejected' && entry.reason ? (
                            <p className="mt-0.5 max-w-xs text-xs text-rose-600">Reason: {entry.reason}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          {entry.household ? (
                            <Link
                              href={`/households/${entry.household.id}`}
                              className="font-medium text-cyan-800 hover:text-cyan-900"
                            >
                              {entry.household.headName}
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {entry.relationship || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {details || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {entry.household?.location || <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {entry.decision === 'approved' ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                              <UserX className="h-3.5 w-3.5" />
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {formatDecisionDate(entry.decidedAt)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">
                        {historyFilter === 'all'
                          ? 'No member decisions yet. Approved and rejected members will appear here.'
                          : `No ${historyFilter} members yet.`}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { restoreSession } from '@/lib/auth';
import type { User, UserRole } from '@/lib/db/schema';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Edit2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

const ROLES: { key: UserRole; label: string; desc: string; color: string; bg: string }[] = [
  { key: 'admin', label: 'Admin', desc: 'Full system access', color: 'text-violet-700', bg: 'bg-violet-50 ring-violet-200' },
  { key: 'encoder', label: 'Encoder', desc: 'Add and edit census records', color: 'text-blue-700', bg: 'bg-blue-50 ring-blue-200' },
  { key: 'health_worker', label: 'Health Worker', desc: 'Manage health vulnerability flags', color: 'text-emerald-700', bg: 'bg-emerald-50 ring-emerald-200' },
  { key: 'responder', label: 'Responder', desc: 'Respond to incidents and operations', color: 'text-rose-700', bg: 'bg-rose-50 ring-rose-200' },
];

const BLANK_FORM = {
  name: '',
  email: '',
  role: 'encoder' as UserRole,
  barangay_id: '',
};

interface ToastState {
  type: 'success' | 'error' | 'info';
  msg: string;
}

function normalizeUser(user: User): User {
  return {
    ...user,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const user = restoreSession();
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    setMe(user);
    void loadUsers();
  }, [router]);

  async function loadUsers() {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load users.');
      }

      setUsers((payload.users as User[]).map(normalizeUser));
    } catch (error) {
      setToast({
        type: 'error',
        msg: error instanceof Error ? error.message : 'Failed to load users.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function showToast(type: ToastState['type'], msg: string, duration = 4500) {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), duration);
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      ...BLANK_FORM,
      barangay_id: me?.barangay_id ?? '',
    });
    setShowForm(true);
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      barangay_id: user.barangay_id,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK_FORM);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(
        editingId ? `/api/admin/users/${editingId}` : '/api/admin/users',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save account.');
      }

      closeForm();
      await loadUsers();

      if (editingId) {
        showToast('success', `Account for ${form.name} updated.`);
      } else if (payload.inviteEmailSent) {
        showToast('success', `Account created. A password setup link was emailed to ${form.email}.`, 6000);
      } else {
        if (payload.setupLink) {
          window.prompt('Copy the password setup link for manual sharing:', payload.setupLink);
        }
        showToast(
          'info',
          `Account created, but the setup email could not be sent: ${payload.inviteEmailError || 'unknown error'}`,
          7000,
        );
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Unable to save account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(userId: string) {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to delete account.');
      }

      setDeleteConfirm(null);
      await loadUsers();
      showToast('success', 'Account deleted.');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Unable to delete account.');
    }
  }

  return (
    <AppShell title="User Management">
      <div className="mx-auto max-w-[1100px] space-y-5 p-4 sm:p-6 lg:p-8">
        {toast && (
          <div
            className={`fixed right-5 top-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium text-white shadow-2xl ${
              toast.type === 'success'
                ? 'bg-emerald-600'
                : toast.type === 'info'
                  ? 'bg-indigo-600'
                  : 'bg-red-600'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            ) : toast.type === 'info' ? (
              <KeyRound className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            )}
            <span className="leading-snug">{toast.msg}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-auto flex-shrink-0 opacity-70 transition hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 lg:text-2xl">User Accounts</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {isLoading ? 'Loading…' : `${users.length} account${users.length === 1 ? '' : 's'} registered`}
            </p>
          </div>
          {!showForm && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:-translate-y-px hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" />
              Create Account
            </button>
          )}
        </div>

        {showForm && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-700 px-6 py-4">
              <div className="flex items-center gap-3 text-white">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold">{editingId ? 'Edit Account' : 'Create New Account'}</p>
                  <p className="text-[11px] text-indigo-200">
                    {editingId
                      ? 'Update the account details below.'
                      : 'The user will receive a one-time password setup link by email.'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeForm}
                className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <UserIcon className="h-3 w-3" />
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    placeholder="e.g. Juan dela Cruz"
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Mail className="h-3 w-3" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    disabled={Boolean(editingId)}
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="e.g. juan@gmail.com"
                  />
                  {editingId && (
                    <p className="mt-1 text-[10px] text-slate-400">Email cannot be changed after creation.</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Building2 className="h-3 w-3" />
                    Barangay ID
                  </label>
                  <input
                    type="text"
                    required
                    value={form.barangay_id}
                    onChange={(event) => setForm((current) => ({ ...current, barangay_id: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    placeholder="e.g. barangay-1"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <ShieldCheck className="h-3 w-3" />
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ROLES.map((role) => (
                    <button
                      key={role.key}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, role: role.key }))}
                      className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition ${
                        form.role === role.key
                          ? `${role.bg} border-transparent ring-2 ${role.color}`
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-xs font-bold">{role.label}</p>
                      <p className="text-[10px] leading-tight opacity-70">{role.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {!editingId && (
                <div className="flex items-start gap-3 rounded-xl border border-indigo-200/60 bg-indigo-50/70 p-3.5">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                    <KeyRound className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-indigo-800">Password setup link will be sent automatically</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-indigo-600">
                      The new user creates their password through a one-time setup link.
                      No temporary password is emailed or stored in the browser.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:opacity-90 disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Saving…' : editingId ? 'Save Changes' : 'Create & Send Setup Link'}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl border border-slate-200/60 bg-white p-5" />
            ))}
          </div>
        ) : users.length > 0 ? (
          <div className="space-y-2">
            {users.map((user) => {
              const roleInfo = ROLES.find((role) => role.key === user.role) || ROLES[1];
              const isMe = user.id === me?.id;
              const isDeleteConfirm = deleteConfirm === user.id;

              return (
                <div
                  key={user.id}
                  className={`group flex items-center gap-4 rounded-2xl border px-5 py-4 transition ${
                    isMe
                      ? 'border-indigo-200 bg-indigo-50/30'
                      : 'border-slate-200/60 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      isMe
                        ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30'
                        : 'bg-gradient-to-br from-slate-200 to-slate-300 text-slate-600'
                    }`}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                      {isMe && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                          You
                        </span>
                      )}
                      {user.must_change_password && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          Setup Pending
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{user.email}</span>
                      <span className="text-slate-200">·</span>
                      <Building2 className="h-3 w-3 flex-shrink-0" />
                      {user.barangay_id}
                    </p>
                  </div>

                  <span className={`hidden flex-shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 sm:inline-flex ${roleInfo.bg} ${roleInfo.color}`}>
                    {roleInfo.label}
                  </span>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    {isDeleteConfirm ? (
                      <>
                        <span className="mr-1 text-xs font-semibold text-red-600">Delete?</span>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-red-700"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500"
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => openEdit(user)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {!isMe && (
                          <button
                            onClick={() => setDeleteConfirm(user.id)}
                            className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="mb-1 font-semibold text-slate-700">No user accounts yet</p>
            <p className="mb-5 text-sm text-slate-400">Create the first account to get started</p>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" />
              Create First Account
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200/60 bg-slate-50/80 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Role Permissions Reference
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROLES.map((role) => (
              <div key={role.key} className={`rounded-xl px-3 py-2.5 ring-1 ${role.bg}`}>
                <p className={`text-xs font-bold ${role.color}`}>{role.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{role.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { restoreSession } from '@/lib/auth';
import { db } from '@/lib/db/indexeddb';
import { getAllUsers, createUser, deleteUser, updateUser } from '@/lib/db/users';
import { User, UserRole } from '@/lib/db/schema';
import {
    UserPlus, Trash2, Edit2, X, Eye, EyeOff,
    ShieldCheck, Users, AlertTriangle, CheckCircle2,
    Mail, Lock, User as UserIcon, Building2, Send, Loader2,
} from 'lucide-react';
import AppShell from '@/components/AppShell';

const ROLES: { key: UserRole; label: string; desc: string; color: string; bg: string }[] = [
    { key: 'admin', label: 'Admin', desc: 'Full system access', color: 'text-violet-700', bg: 'bg-violet-50 ring-violet-200' },
    { key: 'encoder', label: 'Encoder', desc: 'Add/edit households', color: 'text-blue-700', bg: 'bg-blue-50 ring-blue-200' },
    { key: 'health_worker', label: 'Health Worker', desc: 'View & update health data', color: 'text-emerald-700', bg: 'bg-emerald-50 ring-emerald-200' },
    { key: 'responder', label: 'Responder', desc: 'Incidents & disaster ops', color: 'text-rose-700', bg: 'bg-rose-50 ring-rose-200' },
];

const BLANK = { name: '', email: '', password: '', role: 'encoder' as UserRole, barangay_id: '' };

interface Toast { type: 'success' | 'error' | 'info'; msg: string }

export default function AdminUsersPage() {
    const router = useRouter();
    const [me, setMe] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [form, setForm] = useState(BLANK);
    const [showPw, setShowPw] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [toast, setToast] = useState<Toast | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => {
        async function init() {
            await db.init();
            const u = restoreSession();
            if (!u) { router.push('/login'); return; }
            if (u.role !== 'admin') { router.push('/dashboard'); return; }
            setMe(u);
            await load();
        }
        init();
    }, [router]);

    async function load() {
        setIsLoading(true);
        setUsers(await getAllUsers());
        setIsLoading(false);
    }

    function showToast(type: Toast['type'], msg: string, duration = 4000) {
        setToast({ type, msg });
        setTimeout(() => setToast(null), duration);
    }

    function openCreate() {
        setForm({ ...BLANK, barangay_id: me?.barangay_id ?? '' });
        setEditingId(null);
        setShowForm(true);
    }
    function openEdit(u: User) {
        setForm({ name: u.name, email: u.email, password: '', role: u.role, barangay_id: u.barangay_id });
        setEditingId(u.id);
        setShowForm(true);
    }
    function closeForm() {
        setShowForm(false);
        setEditingId(null);
        setForm(BLANK);
        setShowPw(false);
    }

    async function sendWelcomeEmail(to: string, name: string, email: string, password: string, role: string) {
        setIsSendingEmail(true);
        try {
            const res = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to,
                    name,
                    email,
                    password,
                    role,
                    loginUrl: `${window.location.origin}/login`,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Email failed');
            showToast('success', `✅ Account created & welcome email sent to ${to}`, 5000);
        } catch (err) {
            // Account was still created — just log the email error
            showToast('info', `Account created, but email could not be sent: ${err instanceof Error ? err.message : 'unknown error'}`, 6000);
        } finally {
            setIsSendingEmail(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name || !form.email) return;
        if (!editingId && !form.password) { showToast('error', 'Password is required for new accounts.'); return; }
        setIsSubmitting(true);
        try {
            if (editingId) {
                await updateUser(editingId, {
                    name: form.name,
                    role: form.role,
                    barangay_id: form.barangay_id,
                    ...(form.password ? { password: form.password } : {}),
                });
                showToast('success', `Account for ${form.name} updated.`);
                closeForm();
                await load();
            } else {
                await createUser({
                    name: form.name,
                    email: form.email,
                    password: form.password,
                    role: form.role,
                    barangay_id: form.barangay_id,
                });
                closeForm();
                await load();
                // Send email after account is saved
                await sendWelcomeEmail(form.email, form.name, form.email, form.password, form.role);
            }
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleDelete(id: string) {
        if (id === me?.id) { showToast('error', 'You cannot delete your own account.'); return; }
        await deleteUser(id);
        setDeleteConfirm(null);
        showToast('success', 'Account deleted.');
        await load();
    }

    return (
        <AppShell title="User Management">
            <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">

                {/* ── Toast ── */}
                {toast && (
                    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-2xl text-sm font-medium max-w-sm animate-fade-in
            ${toast.type === 'success' ? 'bg-emerald-600 text-white'
                            : toast.type === 'info' ? 'bg-indigo-600 text-white'
                                : 'bg-red-600 text-white'}`}>
                        {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            : toast.type === 'info' ? <Mail className="w-4 h-4 flex-shrink-0" />
                                : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                        <span className="leading-snug">{toast.msg}</span>
                        <button onClick={() => setToast(null)} className="ml-auto flex-shrink-0 opacity-70 hover:opacity-100">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* ── Header ── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">User Accounts</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {isLoading ? 'Loading…' : `${users.length} account${users.length !== 1 ? 's' : ''} registered`}
                        </p>
                    </div>
                    {!showForm && (
                        <button onClick={openCreate}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-md shadow-indigo-500/25 hover:-translate-y-px">
                            <UserPlus className="w-4 h-4" />Create Account
                        </button>
                    )}
                </div>

                {/* ── Create / Edit Form ── */}
                {showForm && (
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xl overflow-hidden">
                        {/* Form header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-700">
                            <div className="flex items-center gap-3 text-white">
                                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                                    <UserPlus className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="font-bold text-sm">{editingId ? 'Edit Account' : 'Create New Account'}</p>
                                    <p className="text-indigo-200 text-[11px]">
                                        {editingId ? 'Update the details below' : 'A welcome email with credentials will be sent automatically'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={closeForm} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Name */}
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                                        <UserIcon className="w-3 h-3" />Full Name *
                                    </label>
                                    <input type="text" required placeholder="e.g. Juan Dela Cruz" value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                                        <Mail className="w-3 h-3" />Email Address *
                                        {!editingId && <span className="ml-1 text-indigo-400 font-medium normal-case">(credentials sent here)</span>}
                                    </label>
                                    <input type="email" required placeholder="e.g. juan@gmail.com" value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                        disabled={!!editingId}
                                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed" />
                                    {editingId
                                        ? <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed after creation.</p>
                                        : <p className="text-[10px] text-indigo-500 mt-1 flex items-center gap-1"><Send className="w-2.5 h-2.5" />A welcome email will be sent to this address.</p>
                                    }
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                                        <Lock className="w-3 h-3" />{editingId ? 'New Password (optional)' : 'Password *'}
                                    </label>
                                    <div className="relative">
                                        <input type={showPw ? 'text' : 'password'}
                                            placeholder={editingId ? 'Leave blank to keep current' : 'Set a strong password'}
                                            value={form.password}
                                            onChange={e => setForm({ ...form, password: e.target.value })}
                                            className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
                                        <button type="button" onClick={() => setShowPw(!showPw)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Barangay */}
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                                        <Building2 className="w-3 h-3" />Barangay ID *
                                    </label>
                                    <input type="text" required placeholder="e.g. brgy_001" value={form.barangay_id}
                                        onChange={e => setForm({ ...form, barangay_id: e.target.value })}
                                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
                                </div>
                            </div>

                            {/* Role selector */}
                            <div>
                                <label className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                                    <ShieldCheck className="w-3 h-3" />Role *
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {ROLES.map(r => (
                                        <button key={r.key} type="button" onClick={() => setForm({ ...form, role: r.key })}
                                            className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all
                        ${form.role === r.key ? `${r.bg} ring-2 border-transparent ${r.color}` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                                            <p className="text-xs font-bold">{r.label}</p>
                                            <p className="text-[10px] opacity-70 leading-tight">{r.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Email preview banner (create mode only) */}
                            {!editingId && (
                                <div className="flex items-start gap-3 p-3.5 bg-indigo-50/70 border border-indigo-200/60 rounded-xl">
                                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Mail className="w-3.5 h-3.5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-indigo-800">Email will be sent automatically</p>
                                        <p className="text-[11px] text-indigo-600 mt-0.5 leading-snug">
                                            After creating the account, a welcome email with the login credentials will be
                                            delivered to <strong>{form.email || 'the email address you enter'}</strong>.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-1">
                                <button type="submit" disabled={isSubmitting || isSendingEmail}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-md shadow-indigo-500/20 disabled:opacity-60">
                                    {(isSubmitting || isSendingEmail) && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isSubmitting ? 'Creating…' : isSendingEmail ? 'Sending email…' : (editingId ? 'Save Changes' : 'Create & Send Email')}
                                </button>
                                <button type="button" onClick={closeForm}
                                    className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-xl transition-all">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ── User List ── */}
                {isLoading ? (
                    <div className="space-y-2">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-slate-200/60 p-5 animate-pulse h-20" />
                        ))}
                    </div>
                ) : users.length > 0 ? (
                    <div className="space-y-2">
                        {users.map(u => {
                            const roleInfo = ROLES.find(r => r.key === u.role) || ROLES[1];
                            const isMe = u.id === me?.id;
                            const isDelConfirm = deleteConfirm === u.id;
                            return (
                                <div key={u.id}
                                    className={`group bg-white border rounded-2xl px-5 py-4 flex items-center gap-4 transition-all
                    ${isMe ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200/60 hover:border-slate-300 hover:shadow-sm'}`}>
                                    {/* Avatar */}
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                    ${isMe ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30'
                                            : 'bg-gradient-to-br from-slate-200 to-slate-300 text-slate-600'}`}>
                                        {u.name.charAt(0).toUpperCase()}
                                    </div>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-slate-900 text-sm">{u.name}</p>
                                            {isMe && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">You</span>}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
                                            <Mail className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">{u.email}</span>
                                            <span className="text-slate-200 flex-shrink-0">·</span>
                                            <Building2 className="w-3 h-3 flex-shrink-0" />{u.barangay_id}
                                        </p>
                                    </div>
                                    {/* Role badge */}
                                    <span className={`flex-shrink-0 hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ${roleInfo.bg} ${roleInfo.color}`}>
                                        {roleInfo.label}
                                    </span>
                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {isDelConfirm ? (
                                            <>
                                                <span className="text-xs text-red-600 font-semibold mr-1">Delete?</span>
                                                <button onClick={() => handleDelete(u.id)} className="px-2.5 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Yes</button>
                                                <button onClick={() => setDeleteConfirm(null)} className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg">No</button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => openEdit(u)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                {!isMe && (
                                                    <button onClick={() => setDeleteConfirm(u.id)}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                                                        <Trash2 className="w-4 h-4" />
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
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                        <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-700 font-semibold mb-1">No user accounts yet</p>
                        <p className="text-slate-400 text-sm mb-5">Create the first account to get started</p>
                        <button onClick={openCreate}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-md hover:opacity-90 transition-all">
                            <UserPlus className="w-4 h-4" />Create First Account
                        </button>
                    </div>
                )}

                {/* ── Role Legend ── */}
                <div className="bg-slate-50/80 border border-slate-200/60 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Role Permissions Reference</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ROLES.map(r => (
                            <div key={r.key} className={`px-3 py-2.5 rounded-xl ring-1 ${r.bg}`}>
                                <p className={`text-xs font-bold ${r.color}`}>{r.label}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">{r.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </AppShell>
    );
}

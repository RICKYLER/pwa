'use client';

import { FormEvent, useState } from 'react';
import type { Household } from '@/lib/db/schema';
import { Plus, Trash2, User } from 'lucide-react';

// Partial resident data collected before the household ID is known
export interface MemberDraft {
  full_name: string;
  birthdate: string;
  gender: 'M' | 'F';
  relationship_to_head: string;
  civil_status: 'single' | 'married' | 'widowed' | 'separated';
  occupation: string;
  income_level: 'low' | 'middle' | 'high';
}

interface HouseholdFormProps {
  initialData?: Household;
  onSubmit: (
    data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
    members: MemberDraft[]
  ) => Promise<void>;
  isLoading?: boolean;
}

const EMPTY_MEMBER: MemberDraft = {
  full_name: '',
  birthdate: '',
  gender: 'M',
  relationship_to_head: '',
  civil_status: 'single',
  occupation: '',
  income_level: 'low',
};

function calculateAge(birthdate: string): number {
  if (!birthdate) return 0;
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function HouseholdForm({ initialData, onSubmit, isLoading = false }: HouseholdFormProps) {
  const [formData, setFormData] = useState({
    head_name: initialData?.head_name || '',
    barangay_id: initialData?.barangay_id || 'barangay-1',
    purok_sitio: initialData?.purok_sitio || '',
    street_address: initialData?.street_address || '',
    contact_number: initialData?.contact_number || '',
    status: (initialData?.status || 'active') as Household['status'],
    gps_lat: initialData?.gps_lat || undefined,
    gps_long: initialData?.gps_long || undefined,
  });

  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberDraft, setMemberDraft] = useState<MemberDraft>({ ...EMPTY_MEMBER });
  const [memberError, setMemberError] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      await onSubmit(formData, members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save household');
    }
  }

  function handleAddMember() {
    setMemberError('');
    if (!memberDraft.full_name.trim()) {
      setMemberError('Full name is required');
      return;
    }
    if (!memberDraft.birthdate) {
      setMemberError('Birthdate is required');
      return;
    }
    if (!memberDraft.relationship_to_head.trim()) {
      setMemberError('Relationship to head is required');
      return;
    }
    setMembers((prev) => [...prev, { ...memberDraft }]);
    setMemberDraft({ ...EMPTY_MEMBER });
    setShowMemberForm(false);
  }

  function handleRemoveMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* ── Household Info ── */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4 pb-2 border-b border-border">
          Household Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Head Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Household Head Name *
            </label>
            <input
              type="text"
              required
              value={formData.head_name}
              onChange={(e) => setFormData({ ...formData, head_name: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Juan Dela Cruz"
              disabled={isLoading}
            />
          </div>

          {/* Purok/Sitio */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Purok/Sitio *
            </label>
            <input
              type="text"
              required
              value={formData.purok_sitio}
              onChange={(e) => setFormData({ ...formData, purok_sitio: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Purok 1"
              disabled={isLoading}
            />
          </div>

          {/* Street Address */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-2">
              Street Address *
            </label>
            <input
              type="text"
              required
              value={formData.street_address}
              onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., 123 Main Street"
              disabled={isLoading}
            />
          </div>

          {/* Contact Number */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Contact Number
            </label>
            <input
              type="tel"
              value={formData.contact_number}
              onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., 09171234567"
              disabled={isLoading}
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            >
              <option value="active">Active</option>
              <option value="moved_out">Moved Out</option>
              <option value="deceased">Deceased</option>
            </select>
          </div>

          {/* GPS Coordinates */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              GPS Latitude (Optional)
            </label>
            <input
              type="number"
              step="0.0001"
              value={formData.gps_lat || ''}
              onChange={(e) =>
                setFormData({ ...formData, gps_lat: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Latitude"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              GPS Longitude (Optional)
            </label>
            <input
              type="number"
              step="0.0001"
              value={formData.gps_long || ''}
              onChange={(e) =>
                setFormData({ ...formData, gps_long: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Longitude"
              disabled={isLoading}
            />
          </div>
        </div>
      </div>

      {/* ── Household Members ── */}
      <div>
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            Household Members
            {members.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-primary text-primary-foreground font-bold">
                {members.length}
              </span>
            )}
          </h2>
          {!showMemberForm && (
            <button
              type="button"
              onClick={() => { setShowMemberForm(true); setMemberError(''); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              disabled={isLoading}
            >
              <Plus className="w-4 h-4" />
              Add Member
            </button>
          )}
        </div>

        {/* Member Entry Form */}
        {showMemberForm && (
          <div className="mb-4 p-4 bg-accent/5 border border-accent/20 rounded-lg space-y-3">
            <p className="text-sm font-medium text-foreground">New Member</p>

            {memberError && (
              <p className="text-xs text-destructive">{memberError}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Maria Dela Cruz"
                  value={memberDraft.full_name}
                  onChange={(e) => setMemberDraft({ ...memberDraft, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Birthdate *</label>
                <input
                  type="date"
                  value={memberDraft.birthdate}
                  onChange={(e) => setMemberDraft({ ...memberDraft, birthdate: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Gender</label>
                <select
                  value={memberDraft.gender}
                  onChange={(e) => setMemberDraft({ ...memberDraft, gender: e.target.value as 'M' | 'F' })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Relationship to Head *</label>
                <input
                  type="text"
                  placeholder="e.g., Spouse, Child, Parent"
                  value={memberDraft.relationship_to_head}
                  onChange={(e) => setMemberDraft({ ...memberDraft, relationship_to_head: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Civil Status</label>
                <select
                  value={memberDraft.civil_status}
                  onChange={(e) => setMemberDraft({ ...memberDraft, civil_status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="widowed">Widowed</option>
                  <option value="separated">Separated</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Occupation</label>
                <input
                  type="text"
                  placeholder="e.g., Farmer, Student"
                  value={memberDraft.occupation}
                  onChange={(e) => setMemberDraft({ ...memberDraft, occupation: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Income Level</label>
                <select
                  value={memberDraft.income_level}
                  onChange={(e) => setMemberDraft({ ...memberDraft, income_level: e.target.value as any })}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="low">Low</option>
                  <option value="middle">Middle</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleAddMember}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:opacity-90 transition-opacity"
              >
                Add to List
              </button>
              <button
                type="button"
                onClick={() => { setShowMemberForm(false); setMemberDraft({ ...EMPTY_MEMBER }); setMemberError(''); }}
                className="px-4 py-2 border border-border text-foreground text-sm rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Members Preview List */}
        {members.length > 0 ? (
          <div className="space-y-2">
            {members.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 bg-card border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.relationship_to_head}
                      {m.birthdate && ` · Age ${calculateAge(m.birthdate)}`}
                      {' · '}
                      {m.gender === 'M' ? 'Male' : 'Female'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMember(i)}
                  className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors group"
                  title="Remove member"
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground group-hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          !showMemberForm && (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <User className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">No members added yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Add Member" to add household members</p>
            </div>
          )
        )}
      </div>

      {/* ── Submit ── */}
      <div className="flex gap-4 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
        >
          {isLoading
            ? 'Saving...'
            : `Save Household${members.length > 0 ? ` & ${members.length} Member${members.length > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>
    </form>
  );
}

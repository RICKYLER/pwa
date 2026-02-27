'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getHousehold, updateHousehold } from '@/lib/db/households';
import { getResidentsInHousehold, createResident, updateResident, deleteResident, getResidentVulnerabilityFlags } from '@/lib/db/residents';
import { calculateAge } from '@/lib/db/vulnerability';
import { Household, Resident, VulnerabilityFlags } from '@/lib/db/schema';
import { ArrowLeft, Plus, Edit2, Trash2 } from 'lucide-react';

interface ResidentWithFlags {
  resident: Resident;
  flags: VulnerabilityFlags | undefined;
}

export default function HouseholdDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const user = getCurrentUser();
  const householdId = params.id as string;

  const [household, setHousehold] = useState<Household | null>(null);
  const [residents, setResidents] = useState<ResidentWithFlags[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddResident, setShowAddResident] = useState(false);
  const [editingResident, setEditingResident] = useState<string | null>(null);
  const [newResidentForm, setNewResidentForm] = useState({
    full_name: '',
    birthdate: '',
    gender: 'M' as const,
    relationship_to_head: '',
    civil_status: 'single' as const,
    occupation: '',
  });

  useEffect(() => {
    if (!user || !hasPermission('view_households')) {
      router.push('/households');
      return;
    }

    async function loadData() {
      try {
        setIsLoading(true);
        const hh = await getHousehold(householdId);
        if (!hh) {
          router.push('/households');
          return;
        }

        setHousehold(hh);

        const residentList = await getResidentsInHousehold(householdId);
        const withFlags = await Promise.all(
          residentList.map(async (resident) => ({
            resident,
            flags: await getResidentVulnerabilityFlags(resident.id),
          }))
        );

        setResidents(withFlags);
      } catch (error) {
        console.error('[v0] Error loading household:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [user, router, householdId]);

  async function handleAddResident(e: React.FormEvent) {
    e.preventDefault();
    if (!newResidentForm.full_name || !newResidentForm.birthdate) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const resident = await createResident({
        household_id: householdId,
        ...newResidentForm,
        status: 'active',
      });

      const flags = await getResidentVulnerabilityFlags(resident.id);
      setResidents([...residents, { resident, flags }]);
      setNewResidentForm({
        full_name: '',
        birthdate: '',
        gender: 'M',
        relationship_to_head: '',
        civil_status: 'single',
        occupation: '',
      });
      setShowAddResident(false);
    } catch (error) {
      console.error('[v0] Error adding resident:', error);
      alert('Failed to add resident');
    }
  }

  if (!user || isLoading) return null;

  if (!household) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Household not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link
            href="/households"
            className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Households
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{household.head_name}</h1>
          <p className="text-sm text-muted-foreground">{household.street_address}</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Household Info */}
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Household Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Household Head</p>
              <p className="font-medium text-foreground">{household.head_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Address</p>
              <p className="font-medium text-foreground">{household.street_address}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Purok/Sitio</p>
              <p className="font-medium text-foreground">{household.purok_sitio}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contact Number</p>
              <p className="font-medium text-foreground">{household.contact_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                household.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : household.status === 'moved_out'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {household.status === 'moved_out' ? 'Moved Out' : household.status.charAt(0).toUpperCase() + household.status.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Residents */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Household Members</h2>
            {hasPermission('update_resident') && (
              <button
                onClick={() => setShowAddResident(!showAddResident)}
                className="flex items-center gap-2 px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Add Member
              </button>
            )}
          </div>

          {/* Add Resident Form */}
          {showAddResident && (
            <form onSubmit={handleAddResident} className="mb-6 p-4 bg-accent/5 border border-accent/20 rounded-lg space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Full Name *"
                  value={newResidentForm.full_name}
                  onChange={(e) => setNewResidentForm({ ...newResidentForm, full_name: e.target.value })}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                  required
                />
                <input
                  type="date"
                  placeholder="Birthdate *"
                  value={newResidentForm.birthdate}
                  onChange={(e) => setNewResidentForm({ ...newResidentForm, birthdate: e.target.value })}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                  required
                />
                <select
                  value={newResidentForm.gender}
                  onChange={(e) => setNewResidentForm({ ...newResidentForm, gender: e.target.value as 'M' | 'F' })}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
                <input
                  type="text"
                  placeholder="Relationship to Head"
                  value={newResidentForm.relationship_to_head}
                  onChange={(e) => setNewResidentForm({ ...newResidentForm, relationship_to_head: e.target.value })}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                />
                <input
                  type="text"
                  placeholder="Occupation"
                  value={newResidentForm.occupation}
                  onChange={(e) => setNewResidentForm({ ...newResidentForm, occupation: e.target.value })}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                />
                <select
                  value={newResidentForm.civil_status}
                  onChange={(e) => setNewResidentForm({ ...newResidentForm, civil_status: e.target.value as any })}
                  className="px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm"
                >
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="widowed">Widowed</option>
                  <option value="separated">Separated</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:opacity-90 transition-opacity"
                >
                  Save Member
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddResident(false)}
                  className="px-4 py-2 border border-border text-foreground text-sm rounded-md hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Residents List */}
          {residents.length > 0 ? (
            <div className="space-y-3">
              {residents.map(({ resident, flags }) => {
                const age = calculateAge(resident.birthdate);
                const vulnerabilities = [];
                if (flags?.is_child) vulnerabilities.push('Child');
                if (flags?.is_senior) vulnerabilities.push('Senior');
                if (flags?.is_pwd) vulnerabilities.push('PWD');
                if (flags?.is_pregnant) vulnerabilities.push('Pregnant');
                if (flags?.has_chronic_illness) vulnerabilities.push('Chronic');

                return (
                  <div key={resident.id} className="flex items-start justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{resident.full_name}</h3>
                        <span className="text-xs text-muted-foreground">({age} yrs)</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{resident.relationship_to_head}</p>
                      {vulnerabilities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {vulnerabilities.map(v => (
                            <span key={v} className="inline-block px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-md">
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {hasPermission('update_resident') && (
                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-muted rounded-md transition-colors">
                          <Edit2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button className="p-2 hover:bg-destructive/10 rounded-md transition-colors">
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No members added yet</p>
          )}
        </div>
      </main>
    </div>
  );
}

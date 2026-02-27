'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getHouseholds, getAllPuroks } from '@/lib/db/households';
import { getResidentsInHousehold } from '@/lib/db/residents';
import { Household } from '@/lib/db/schema';
import { Plus, Search, Filter, Users } from 'lucide-react';

export default function HouseholdsPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [filtered, setFiltered] = useState<Household[]>([]);
  const [puroks, setPuroks] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filterPurok, setFilterPurok] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'moved_out' | 'deceased'>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user || !hasPermission('view_households')) {
      router.push('/dashboard');
      return;
    }

    async function loadData() {
      try {
        setIsLoading(true);
        const allHouseholds = await getHouseholds({ barangay_id: user.barangay_id });
        setHouseholds(allHouseholds);

        // Load member counts
        const counts: Record<string, number> = {};
        for (const household of allHouseholds) {
          const members = await getResidentsInHousehold(household.id);
          counts[household.id] = members.length;
        }
        setMemberCounts(counts);

        // Load puroks
        const purokList = await getAllPuroks(user.barangay_id);
        setPuroks(purokList);
      } catch (error) {
        console.error('[v0] Error loading households:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [user, router]);

  // Filter households
  useEffect(() => {
    let result = households;

    if (filterStatus !== 'all') {
      result = result.filter(h => h.status === filterStatus);
    }

    if (filterPurok !== 'all') {
      result = result.filter(h => h.purok_sitio === filterPurok);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(h =>
        h.head_name.toLowerCase().includes(q) ||
        h.street_address.toLowerCase().includes(q) ||
        h.id.toLowerCase().includes(q)
      );
    }

    setFiltered(result);
  }, [households, search, filterPurok, filterStatus]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Households</h1>
              <p className="text-sm text-muted-foreground">{filtered.length} households</p>
            </div>
            {hasPermission('create_household') && (
              <Link
                href="/households/new"
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Add Household
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Head name, address..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Filter by Purok */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Purok/Sitio</label>
              <select
                value={filterPurok}
                onChange={(e) => setFilterPurok(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Puroks</option>
                {puroks.map(purok => (
                  <option key={purok} value={purok}>{purok}</option>
                ))}
              </select>
            </div>

            {/* Filter by Status */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="moved_out">Moved Out</option>
                <option value="deceased">Deceased</option>
              </select>
            </div>
          </div>
        </div>

        {/* Households List */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading households...</p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(household => (
              <Link
                key={household.id}
                href={`/households/${household.id}`}
                className="block bg-card border border-border rounded-lg p-4 hover:border-primary hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{household.head_name}</h3>
                    <p className="text-sm text-muted-foreground">{household.street_address}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{household.purok_sitio}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {memberCounts[household.id] || 0} members
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
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
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-card border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground mb-4">No households found</p>
            {hasPermission('create_household') && (
              <Link
                href="/households/new"
                className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              >
                Add First Household
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

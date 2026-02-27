'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { getDistributionEvents } from '@/lib/db/distribution';
import { DistributionEvent } from '@/lib/db/schema';
import { Plus, Calendar, MapPin, Users } from 'lucide-react';

export default function DistributionPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [filtered, setFiltered] = useState<DistributionEvent[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'planned' | 'ongoing' | 'completed'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !hasPermission('view_reports')) {
      router.push('/dashboard');
      return;
    }

    loadData();
  }, [user, router]);

  async function loadData() {
    try {
      setIsLoading(true);
      const allEvents = await getDistributionEvents();
      setEvents(allEvents);
    } catch (error) {
      console.error('[v0] Error loading distribution events:', error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let result = events;
    if (filterStatus !== 'all') {
      result = result.filter(e => e.status === filterStatus);
    }
    setFiltered(result);
  }, [events, filterStatus]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Relief Distribution</h1>
              <p className="text-sm text-muted-foreground">{events.length} events</p>
            </div>
            {hasPermission('manage_inventory') && (
              <Link
                href="/distribution/new"
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                New Event
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Filter */}
        <div className="mb-6">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Status</option>
            <option value="planned">Planned</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Events List */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading distribution events...</p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-4">
            {filtered.map(event => (
              <Link
                key={event.id}
                href={`/distribution/${event.id}`}
                className="block bg-card border border-border rounded-lg p-6 hover:shadow-lg hover:border-primary transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{event.event_name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {event.location}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    event.status === 'completed'
                      ? 'bg-green-100 text-green-700'
                      : event.status === 'ongoing'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-muted-foreground text-xs">Type</p>
                    <p className="font-medium text-foreground">{event.type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Scheduled Date</p>
                    <p className="font-medium text-foreground flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(event.scheduled_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Beneficiaries</p>
                    <p className="font-medium text-foreground text-primary">View Details →</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-card border border-dashed border-border rounded-lg">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground mb-4">No distribution events yet</p>
            {hasPermission('manage_inventory') && (
              <Link
                href="/distribution/new"
                className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              >
                Create First Event
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

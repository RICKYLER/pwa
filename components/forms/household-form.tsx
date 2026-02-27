'use client';

import { FormEvent, useState } from 'react';
import type { Household } from '@/lib/db/schema';

interface HouseholdFormProps {
  initialData?: Household;
  onSubmit: (data: Omit<Household, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => Promise<void>;
  isLoading?: boolean;
}

export function HouseholdForm({ initialData, onSubmit, isLoading = false }: HouseholdFormProps) {
  const [formData, setFormData] = useState({
    head_name: initialData?.head_name || '',
    barangay_id: initialData?.barangay_id || 'barangay-1',
    purok_sitio: initialData?.purok_sitio || '',
    street_address: initialData?.street_address || '',
    contact_number: initialData?.contact_number || '',
    status: initialData?.status || 'active' as const,
    gps_lat: initialData?.gps_lat || undefined,
    gps_long: initialData?.gps_long || undefined,
  });

  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save household');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

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
          <label className="block text-sm font-medium text-foreground mb-2">
            Status
          </label>
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

        {/* GPS Coordinates (Optional) */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            GPS Latitude (Optional)
          </label>
          <input
            type="number"
            step="0.0001"
            value={formData.gps_lat || ''}
            onChange={(e) => setFormData({ ...formData, gps_lat: e.target.value ? parseFloat(e.target.value) : undefined })}
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
            onChange={(e) => setFormData({ ...formData, gps_long: e.target.value ? parseFloat(e.target.value) : undefined })}
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Longitude"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
        >
          {isLoading ? 'Saving...' : 'Save Household'}
        </button>
      </div>
    </form>
  );
}

'use client';

import { HistoricalDisasterEvent } from './mabini-relief-dataset';
import { DatasetMetadataSummary } from './compression-helper';

export interface ForecastingUploadRecord {
  id: string;
  file_name: string;
  file_size_bytes: number;
  compressed_size_bytes: number;
  file_type: 'xlsx' | 'xls' | 'csv';
  storage_path?: string;
  records_count: number;
  accuracy_rate: number;
  mape_percent: number;
  mae_error: number;
  uploaded_by: string;
  uploaded_at: string;
  is_active: boolean;
  metadata: DatasetMetadataSummary | Record<string, unknown>;
  dataset_events: HistoricalDisasterEvent[];
}

const LOCAL_STORAGE_KEY = 'mswdo_forecasting_upload_history';

/**
 * Reads local cached uploads from localStorage
 */
export function getLocalCachedUploads(): ForecastingUploadRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves local cached uploads to localStorage
 */
export function setLocalCachedUploads(records: ForecastingUploadRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('[ForecastingUploadStore] Failed to write localStorage fallback:', err);
  }
}

/**
 * Fetches all upload history records from API and merges with local fallback
 */
export async function fetchUploadHistory(): Promise<ForecastingUploadRecord[]> {
  const localRecords = getLocalCachedUploads();

  try {
    const res = await fetch('/api/forecasting/uploads', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return localRecords;
    }

    const data = await res.json();
    if (data.success && Array.isArray(data.uploads) && data.uploads.length > 0) {
      // Merge: Keep remote, but don't drop any local records not yet synced
      const remoteMap = new Map<string, ForecastingUploadRecord>();
      for (const item of data.uploads) {
        remoteMap.set(item.id, item);
      }

      for (const local of localRecords) {
        if (!remoteMap.has(local.id)) {
          remoteMap.set(local.id, local);
        }
      }

      const merged = Array.from(remoteMap.values()).sort(
        (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
      );

      setLocalCachedUploads(merged);
      return merged;
    }
  } catch (err) {
    console.warn('[ForecastingUploadStore] API fetch failed, using local cache:', err);
  }

  return localRecords;
}

/**
 * Persists a new dataset upload to Supabase and local cache
 */
export async function saveDatasetUpload(
  payload: Omit<ForecastingUploadRecord, 'id' | 'uploaded_at'>
): Promise<ForecastingUploadRecord> {
  const newId = `fdu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const record: ForecastingUploadRecord = {
    ...payload,
    id: newId,
    uploaded_at: now,
    is_active: payload.is_active ?? true,
  };

  // Immediate local cache update
  const current = getLocalCachedUploads();
  const updated = [
    record,
    ...current.map((item) => ({
      ...item,
      is_active: record.is_active ? false : item.is_active,
    })),
  ];
  setLocalCachedUploads(updated);

  // Sync to API / Supabase
  try {
    const res = await fetch('/api/forecasting/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.upload) {
        return data.upload;
      }
    }
  } catch (err) {
    console.warn('[ForecastingUploadStore] Network error while saving to Supabase:', err);
  }

  return record;
}

/**
 * Activates a historical dataset, making it the active engine dataset
 */
export async function activateDatasetUpload(id: string): Promise<boolean> {
  const current = getLocalCachedUploads();
  const updated = current.map((item) => ({
    ...item,
    is_active: item.id === id,
  }));
  setLocalCachedUploads(updated);

  try {
    await fetch('/api/forecasting/uploads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: true }),
    });
    return true;
  } catch {
    return true; // Local update already applied
  }
}

/**
 * Deletes a dataset upload from history
 */
export async function deleteDatasetUpload(id: string): Promise<boolean> {
  const current = getLocalCachedUploads();
  const updated = current.filter((item) => item.id !== id);
  setLocalCachedUploads(updated);

  try {
    await fetch(`/api/forecasting/uploads?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return true;
  }
}

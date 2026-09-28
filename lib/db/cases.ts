import { db, STORE_NAMES } from './indexeddb';
import type {
  CaseRecord,
  CaseStatus,
  CaseClassification,
  CaseAttachment,
  CaseNote,
} from './schema';

function generateCaseId(): string {
  return `case_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateAttachmentId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateNoteId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export interface CaseQueryFilters {
  query?: string;
  status?: CaseStatus;
  case_type?: CaseClassification;
  barangay_id?: string;
}

/**
 * Fetch cases from IndexedDB with optional instant search query & filters.
 * Query matches against case_number, victim_name, perpetrator_name, and summary.
 */
export async function getCases(filters?: CaseQueryFilters): Promise<CaseRecord[]> {
  try {
    const allCases = await db.getAll<CaseRecord>(STORE_NAMES.cases);

    let filtered = allCases;

    if (filters?.status) {
      filtered = filtered.filter((c) => c.status === filters.status);
    }

    if (filters?.case_type) {
      filtered = filtered.filter((c) => c.case_type === filters.case_type);
    }

    if (filters?.barangay_id) {
      filtered = filtered.filter((c) => c.barangay_id.toLowerCase() === filters.barangay_id?.toLowerCase());
    }

    if (filters?.query && filters.query.trim()) {
      const q = filters.query.trim().toLowerCase();
      filtered = filtered.filter((c) => {
        return (
          c.case_number.toLowerCase().includes(q) ||
          c.victim_name.toLowerCase().includes(q) ||
          (c.perpetrator_name && c.perpetrator_name.toLowerCase().includes(q)) ||
          (c.purok_sitio && c.purok_sitio.toLowerCase().includes(q)) ||
          (c.case_summary && c.case_summary.toLowerCase().includes(q)) ||
          (c.assigned_worker_name && c.assigned_worker_name.toLowerCase().includes(q))
        );
      });
    }

    // Sort by reported_at desc, fallback to createdAt
    return filtered.sort((a, b) => {
      const timeA = new Date(a.reported_at || a.createdAt).getTime();
      const timeB = new Date(b.reported_at || b.createdAt).getTime();
      return timeB - timeA;
    });
  } catch (error) {
    console.error('Error fetching cases from store:', error);
    return [];
  }
}

/**
 * Fetch a single case by ID
 */
export async function getCase(id: string): Promise<CaseRecord | undefined> {
  try {
    return await db.get<CaseRecord>(STORE_NAMES.cases, id);
  } catch (error) {
    console.error(`Error fetching case ${id}:`, error);
    return undefined;
  }
}

/**
 * Fetch a case by exact or case-insensitive case_number
 */
export async function getCaseByNumber(caseNumber: string): Promise<CaseRecord | undefined> {
  try {
    const all = await db.getAll<CaseRecord>(STORE_NAMES.cases);
    const normalized = caseNumber.trim().toLowerCase();
    return all.find((c) => c.case_number.trim().toLowerCase() === normalized);
  } catch (error) {
    console.error(`Error fetching case by number ${caseNumber}:`, error);
    return undefined;
  }
}

/**
 * Create a new case
 */
export async function createCase(
  data: Omit<CaseRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<CaseRecord> {
  const now = new Date();
  const newCase: CaseRecord = {
    ...data,
    id: data.id || generateCaseId(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  await db.put(STORE_NAMES.cases, newCase);
  return newCase;
}

/**
 * Update an existing case
 */
export async function updateCase(
  id: string,
  updates: Partial<Omit<CaseRecord, 'id' | 'createdAt'>>,
): Promise<CaseRecord> {
  const existing = await db.get<CaseRecord>(STORE_NAMES.cases, id);
  if (!existing) {
    throw new Error(`Case with ID ${id} not found`);
  }

  const updated: CaseRecord = {
    ...existing,
    ...updates,
    updatedAt: new Date(),
    syncStatus: 'pending',
  };

  await db.put(STORE_NAMES.cases, updated);
  return updated;
}

/**
 * Delete a case and its associated attachments & notes
 */
export async function deleteCase(id: string): Promise<void> {
  await db.delete(STORE_NAMES.cases, id);

  // Clean up notes
  const notes = await getCaseNotes(id);
  await Promise.all(notes.map((n) => db.deleteSilently(STORE_NAMES.case_notes, n.id)));

  // Clean up attachments
  const attachments = await getCaseAttachments(id);
  await Promise.all(attachments.map((a) => db.deleteSilently(STORE_NAMES.case_attachments, a.id)));
}

/**
 * Bulk import multiple cases (from Excel or CSV)
 * If a case_number already exists, it can update or skip depending on options.
 */
export async function bulkImportCases(
  records: Array<Omit<CaseRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }>,
  options: { updateExisting?: boolean } = { updateExisting: true },
): Promise<{ importedCount: number; updatedCount: number; skippedCount: number }> {
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const existingCases = await db.getAll<CaseRecord>(STORE_NAMES.cases);
  const existingMap = new Map<string, CaseRecord>();
  for (const c of existingCases) {
    existingMap.set(c.case_number.trim().toLowerCase(), c);
  }

  const now = new Date();

  for (const record of records) {
    const key = record.case_number.trim().toLowerCase();
    const existing = existingMap.get(key);

    if (existing) {
      if (options.updateExisting) {
        const updated: CaseRecord = {
          ...existing,
          ...record,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: now,
          syncStatus: 'pending',
        };
        await db.put(STORE_NAMES.cases, updated);
        existingMap.set(key, updated);
        updatedCount++;
      } else {
        skippedCount++;
      }
    } else {
      const newCase: CaseRecord = {
        ...record,
        id: record.id || generateCaseId(),
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      };
      await db.put(STORE_NAMES.cases, newCase);
      existingMap.set(key, newCase);
      importedCount++;
    }
  }

  return { importedCount, updatedCount, skippedCount };
}

/**
 * Get all notes for a specific case
 */
export async function getCaseNotes(caseId: string): Promise<CaseNote[]> {
  try {
    const allNotes = await db.getAll<CaseNote>(STORE_NAMES.case_notes);
    return allNotes
      .filter((n) => n.case_id === caseId)
      .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
  } catch (error) {
    console.error(`Error fetching notes for case ${caseId}:`, error);
    return [];
  }
}

/**
 * Add a follow-up or progress note to a case
 */
export async function addCaseNote(
  caseId: string,
  noteData: Omit<CaseNote, 'id' | 'case_id' | 'createdAt'>,
): Promise<CaseNote> {
  const newNote: CaseNote = {
    ...noteData,
    id: generateNoteId(),
    case_id: caseId,
    createdAt: new Date().toISOString(),
  };

  await db.put(STORE_NAMES.case_notes, newNote);
  return newNote;
}

/**
 * Get all attachments for a specific case
 */
export async function getCaseAttachments(caseId: string): Promise<CaseAttachment[]> {
  try {
    const allAtts = await db.getAll<CaseAttachment>(STORE_NAMES.case_attachments);
    return allAtts
      .filter((a) => a.case_id === caseId)
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
  } catch (error) {
    console.error(`Error fetching attachments for case ${caseId}:`, error);
    return [];
  }
}

/**
 * Add a file attachment (scanned intake sheet, BPO, court order, etc.)
 */
export async function addCaseAttachment(
  caseId: string,
  data: Omit<CaseAttachment, 'id' | 'case_id' | 'uploaded_at'>,
): Promise<CaseAttachment> {
  const newAttachment: CaseAttachment = {
    ...data,
    id: generateAttachmentId(),
    case_id: caseId,
    uploaded_at: new Date().toISOString(),
  };

  await db.put(STORE_NAMES.case_attachments, newAttachment);
  return newAttachment;
}

/**
 * Delete a specific attachment
 */
export async function deleteCaseAttachment(attachmentId: string): Promise<void> {
  await db.delete(STORE_NAMES.case_attachments, attachmentId);
}

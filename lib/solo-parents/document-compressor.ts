import type { SoloParentRequirementDocument } from '@/lib/db/schema';

export interface CompressDocumentOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  documentType?: string;
}

export interface CompressResult extends SoloParentRequirementDocument {
  saved_percentage: number;
}

/**
 * Formats byte size into human readable string (e.g. 48.5 KB)
 */
export function formatDocumentSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Client-side camera / photo compressor for physical requirement documents.
 * Compresses raw camera photos (often 5-10 MB) into lightweight high-contrast JPEG (~40-80 KB),
 * preventing database bloat in Supabase and IndexedDB while keeping text crystal clear.
 */
export async function compressDocumentPhoto(
  file: File,
  options: CompressDocumentOptions = {}
): Promise<CompressResult> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.7,
    documentType = 'barangay_cert',
  } = options;

  const originalSize = file.size;
  const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // If file is not an image (e.g. PDF), read as data URL directly
  if (!file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve({
          id: docId,
          name: file.name,
          document_type: documentType,
          file_url: result,
          file_size: originalSize,
          original_size: originalSize,
          uploaded_at: new Date().toISOString(),
          saved_percentage: 0,
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate proportional scale down
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }

        // Fill white background (in case of PNG with transparency)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Draw and compress image
        ctx.drawImage(img, 0, 0, width, height);

        // Export as optimized JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

        // Estimate compressed size from base64 string
        const base64Length = compressedDataUrl.length - (compressedDataUrl.indexOf(',') + 1);
        const compressedBytes = Math.round((base64Length * 3) / 4);

        const savedPct = originalSize > 0
          ? Math.max(0, Math.round(((originalSize - compressedBytes) / originalSize) * 100))
          : 0;

        resolve({
          id: docId,
          name: file.name,
          document_type: documentType,
          file_url: compressedDataUrl,
          file_size: compressedBytes,
          original_size: originalSize,
          uploaded_at: new Date().toISOString(),
          saved_percentage: savedPct,
        });
      };
      img.onerror = (err) => reject(err);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Centralized image handling utilities
 * - HEIC type detection
 * - Image preview creation with proper object URL lifecycle
 * - Image validation
 * - Object URL tracking and cleanup
 */

export const IMAGE_TYPES = {
  HEIC: ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'],
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  ALL: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
} as const;

export function isHeicType(file: File): boolean {
  return IMAGE_TYPES.HEIC.includes(file.type as any) || /\.heic$/i.test(file.name);
}

export function isImageType(file: File): boolean {
  return IMAGE_TYPES.IMAGE.includes(file.type as any) || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name);
}

/**
 * Creates an image preview URL for display.
 * For HEIC files, converts to JPEG before creating preview.
 * Returns the preview URL - caller is responsible for tracking and cleanup.
 */
export async function createImagePreview(file: File): Promise<{ preview: string; converted: boolean }> {
  const originalUrl = URL.createObjectURL(file);

  if (!isHeicType(file)) {
    return { preview: originalUrl, converted: false };
  }

  return new Promise((resolve) => {
    const img = document.createElement('img');

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve({ preview: originalUrl, converted: false });
        return;
      }

      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(originalUrl);
        if (blob) {
          resolve({ preview: URL.createObjectURL(blob), converted: true });
        } else {
          resolve({ preview: originalUrl, converted: false });
        }
      }, 'image/jpeg', 0.85);
    };

    img.onerror = () => {
      resolve({ preview: originalUrl, converted: false });
    };

    img.src = originalUrl;
  });
}

/**
 * Validates that an image file can be loaded by the browser.
 * Returns validation result with any warnings.
 */
export async function validateImageFile(file: File): Promise<{ valid: boolean; warning?: string }> {
  if (!isHeicType(file)) {
    return { valid: true };
  }

  return new Promise((resolve) => {
    const img = document.createElement('img');
    const testUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(testUrl);
      resolve({ valid: true });
    };

    img.onerror = () => {
      URL.revokeObjectURL(testUrl);
      resolve({
        valid: false,
        warning: `${file.name}: Formato HEIC no soportado por este navegador. Convierte a JPG o PNG.`
      });
    };

    img.src = testUrl;
  });
}

/**
 * Staged file interface for camera flow staging
 */
export interface StagedFile {
  file: File;
  preview: string;
  id: string;
  error?: string;
}

/**
 * Creates a staged file with preview.
 * Processes files sequentially to handle HEIC conversion properly.
 */
export async function createStagedFile(file: File): Promise<StagedFile> {
  const id = `staged-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { preview, converted } = await createImagePreview(file);

  return {
    file,
    preview,
    id,
    error: converted ? undefined : isHeicType(file) ? 'HEIC no convertido' : undefined,
  };
}

/**
 * Processes multiple files into staged files.
 * Returns all successfully staged files.
 */
export async function processFilesForStaging(
  files: File[],
  maxFiles: number,
  existingCount: number
): Promise<StagedFile[]> {
  const remaining = maxFiles - existingCount;
  if (remaining <= 0) return [];

  const toProcess = Array.from(files).slice(0, remaining);
  const results: StagedFile[] = [];

  for (const file of toProcess) {
    const staged = await createStagedFile(file);
    results.push(staged);
  }

  return results;
}

/**
 * Checks if any HEIC files failed to convert properly
 */
export function checkHeicWarnings(stagedFiles: StagedFile[], originalFiles: File[]): string | null {
  const heicFiles = originalFiles.filter(isHeicType);
  const failedHeics = stagedFiles.filter(s => s.error && isHeicType(s.file));

  if (heicFiles.length > 0 && failedHeics.length > 0) {
    return 'Algunas fotos HEIC no pudieron ser procesadas. Conviértelas a JPG para mejor calidad.';
  }

  return null;
}

/**
 * URL Tracker class for managing object URL lifecycle
 * Ensures all created URLs are eventually cleaned up
 */
export class URLTracker {
  private urls: Set<string> = new Set();

  create(url: string): string {
    this.urls.add(url);
    return url;
  }

  revoke(url: string): void {
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }

  revokeAll(): void {
    this.urls.forEach(url => URL.revokeObjectURL(url));
    this.urls.clear();
  }

  cleanup(urlsToRemove: string[]): void {
    urlsToRemove.forEach(url => this.revoke(url));
  }

  get size(): number {
    return this.urls.size;
  }
}

/**
 * React hook for tracking object URLs with automatic cleanup
 */
import { useRef, useEffect, useCallback } from 'react';

export function useURLTracker() {
  const trackerRef = useRef(new URLTracker());

  useEffect(() => {
    return () => {
      trackerRef.current.revokeAll();
    };
  }, []);

  const track = useCallback((url: string) => {
    return trackerRef.current.create(url);
  }, []);

  const revoke = useCallback((url: string) => {
    trackerRef.current.revoke(url);
  }, []);

  const revokeAll = useCallback(() => {
    trackerRef.current.revokeAll();
  }, []);

  return { track, revoke, revokeAll, tracker: trackerRef.current };
}

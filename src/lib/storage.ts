/**
 * Sistema de Persistencia de Documentos Originales
 * 
 * Arquitectura:
 * 1. Storage en Supabase para documentos originales
 * 2. Fallback a Base64 en memoria para sesiones activas
 * 3. Preview generation para visualización rápida
 */

import { supabase } from './supabase';

const BUCKET_NAME = 'facturas-originales';

export interface StorageResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

/**
 * Inicializa el bucket de storage si no existe
 */
export async function ensureStorageBucket(): Promise<boolean> {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.find(b => b.name === BUCKET_NAME);
    
    if (!exists) {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false,
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
      });
      
      if (error) {
        console.error('Error creating storage bucket:', error);
        return false;
      }
    }
    
    return true;
  } catch (e) {
    console.error('Error checking storage bucket:', e);
    return false;
  }
}

/**
 * Sube un documento original a Storage
 */
export async function uploadOriginalDocument(
  userId: string,
  projectId: string,
  billId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<StorageResult> {
  try {
    await ensureStorageBucket();
    
    const extension = fileName.split('.').pop() || 'pdf';
    const storagePath = `${userId}/${projectId}/${billId}/original.${extension}`;
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });
    
    if (error) {
      console.error('Error uploading to storage:', error);
      return { success: false, error: error.message };
    }
    
    // Obtener URL pública (temporal para preview)
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);
    
    return {
      success: true,
      path: storagePath,
      url: urlData.publicUrl
    };
  } catch (e: any) {
    console.error('Error in uploadOriginalDocument:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Obtiene un documento desde Storage
 */
export async function getOriginalDocument(
  storagePath: string
): Promise<{ data: ArrayBuffer | null; error: string | null }> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath);
    
    if (error) {
      return { data: null, error: error.message };
    }
    
    const arrayBuffer = await data.arrayBuffer();
    return { data: arrayBuffer, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

/**
 * Genera un hash del archivo para verificación
 */
export async function generateFileHash(buffer: Buffer): Promise<string> {
  // Client-side: Simple hash using SubtleCrypto
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const uint8Array = new Uint8Array(buffer);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', uint8Array);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Server-side fallback
  const nodeCrypto = await import('crypto');
  return nodeCrypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Verifica si un documento ya existe (por hash)
 */
export async function documentExists(
  userId: string,
  projectId: string,
  fileHash: string
): Promise<{ exists: boolean; billId?: string }> {
  try {
    // Buscar en bills por hash
    const { data: bills } = await supabase
      .from('bills')
      .select('id, raw_data')
      .eq('project_id', projectId)
      .eq('user_id', userId);
    
    const existing = bills?.find(b => {
      const rawData = b.raw_data as any;
      return rawData?.fileHash === fileHash;
    });
    
    return {
      exists: !!existing,
      billId: existing?.id
    };
  } catch (e) {
    return { exists: false };
  }
}

/**
 * Convierte ArrayBuffer a Base64 para preview en memoria
 */
export function arrayBufferToBase64(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Obtiene el documento para preview (Storage → Base64)
 */
export async function getDocumentForPreview(
  storagePath: string,
  fallbackBase64?: string
): Promise<string | null> {
  try {
    const { data, error } = await getOriginalDocument(storagePath);
    
    if (error || !data) {
      // Fallback a Base64 en memoria
      return fallbackBase64 || null;
    }
    
    // Obtener mime type del path
    const extension = storagePath.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp'
    };
    const mimeType = mimeTypes[extension || 'pdf'] || 'application/pdf';
    
    return arrayBufferToBase64(data, mimeType);
  } catch (e) {
    console.error('Error getting document for preview:', e);
    return fallbackBase64 || null;
  }
}

/**
 * Elimina un documento del storage
 */
export async function deleteDocument(storagePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);
    
    if (error) {
      console.error('Error deleting document:', error);
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

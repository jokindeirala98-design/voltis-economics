"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload, X, FileText, Zap, Flame, CheckCircle, AlertTriangle,
  Loader, Trash2, FolderOpen, ChevronRight, ChevronDown,
  Package, Layers, ArrowRight, Clock, Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PoolFile, PoolGroup, PoolSession, ExtractedBill, isGasBill } from '@/lib/types';
import { importFlexibleExcel } from '@/lib/import-flexible';
import { preSplitMultiInvoicePdfs } from '@/lib/pdf-split';
import JSZip from 'jszip';

interface PoolUploadProps {
  onClose: () => void;
  onComplete: (
    projects: { name: string; bills: ExtractedBill[] }[],
    folderName: string
  ) => void;
  existingCups: Set<string>;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
};

// Supported extensions for files inside zip archives
const SUPPORTED_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];

const BATCH_SIZE = 5;
const FILE_TIMEOUT_MS = 150000; // 150s — enough for server maxDuration=120s + network

async function processFileWithTimeout(file: File): Promise<{ bill: ExtractedBill | null; error?: string }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ bill: null, error: 'Timeout - archivo demasiado grande o tardado' });
    }, FILE_TIMEOUT_MS);

    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/extract', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeout);
        if (data.status === 'success') {
          resolve({ bill: data.bill as ExtractedBill });
        } else {
          resolve({ bill: null, error: data.error || 'Error en extracción' });
        }
      })
      .catch(err => {
        clearTimeout(timeout);
        resolve({ bill: null, error: err.message || 'Error de red' });
      });
  });
}

/**
 * Extract files from a .zip archive, returning only supported file types.
 */
async function extractFilesFromZip(zipFile: File): Promise<File[]> {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const extractedFiles: File[] = [];

  const entries = Object.entries(zip.files).filter(([_, entry]) => !entry.dir);

  for (const [path, entry] of entries) {
    const fileName = path.split('/').pop() || path;
    // Skip hidden/system files
    if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) continue;

    const ext = '.' + fileName.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;

    const blob = await entry.async('blob');
    const mimeType = getMimeType(ext);
    const file = new File([blob], fileName, { type: mimeType });
    extractedFiles.push(file);
  }

  return extractedFiles;
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
  };
  return map[ext] || 'application/octet-stream';
}

export default function PoolUpload({ onClose, onComplete, existingCups }: PoolUploadProps) {
  const [session, setSession] = useState<PoolSession | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFilesToProcess, setTotalFilesToProcess] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [extractingZip, setExtractingZip] = useState(false);
  // While true, we're pre-analysing PDFs to detect multi-invoice documents
  // and splitting them into one Sub-PDF per factura BEFORE the normal
  // extraction pipeline starts. Mirrors the "extractingZip" UX.
  const [splittingPdfs, setSplittingPdfs] = useState(false);
  const [splittingProgress, setSplittingProgress] = useState<{
    current: number; total: number; fileName: string;
  }>({ current: 0, total: 0, fileName: '' });
  // NEW: ask for the parent project (folder) name before the user can drop anything.
  // Every supply detected in the pool will land inside this folder.
  const [folderName, setFolderName] = useState('');
  const [folderConfirmed, setFolderConfirmed] = useState(false);
  const processingRef = useRef(false);

  const handleDrop = useCallback(async (acceptedFiles: File[]) => {
    console.log('[Pool] Files dropped:', acceptedFiles.length);

    // Separate zip files from regular files
    const zipFiles = acceptedFiles.filter(f =>
      f.type === 'application/zip' ||
      f.type === 'application/x-zip-compressed' ||
      f.name.toLowerCase().endsWith('.zip')
    );
    const regularFiles = acceptedFiles.filter(f =>
      f.type !== 'application/zip' &&
      f.type !== 'application/x-zip-compressed' &&
      !f.name.toLowerCase().endsWith('.zip')
    );

    let allFiles = [...regularFiles];

    // Extract files from zips
    if (zipFiles.length > 0) {
      setExtractingZip(true);
      for (const zipFile of zipFiles) {
        try {
          console.log(`[Pool] Extracting zip: ${zipFile.name}`);
          const extracted = await extractFilesFromZip(zipFile);
          console.log(`[Pool] Extracted ${extracted.length} files from ${zipFile.name}`);
          allFiles.push(...extracted);
        } catch (err) {
          console.error(`[Pool] Failed to extract zip: ${zipFile.name}`, err);
        }
      }
      setExtractingZip(false);
    }

    if (allFiles.length === 0) {
      console.warn('[Pool] No valid files found after extraction');
      return;
    }

    // Split Excel spreadsheets out: each sheet can carry multiple supplies (CUPS),
    // so we parse them up-front via importFlexibleExcel and synthesise one
    // PoolFile per invoice. They land in the session already classified.
    const excelFiles = allFiles.filter(f =>
      f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')
    );
    const nonExcelFiles = allFiles.filter(f =>
      !f.name.toLowerCase().endsWith('.xlsx') && !f.name.toLowerCase().endsWith('.xls')
    );

    const preClassified: PoolFile[] = [];
    for (const xls of excelFiles) {
      try {
        console.log('[Pool] Parsing Excel:', xls.name);
        const result = await importFlexibleExcel(xls);
        result.bills.forEach((bill, bIdx) => {
          preClassified.push({
            id: `xls-${Date.now()}-${bIdx}-${Math.random().toString(36).slice(2, 6)}`,
            file: xls,
            status: 'classified',
            extractedBill: { ...bill, fileName: bill.fileName || `${xls.name}#${bIdx + 1}` },
          });
        });
        console.log(`[Pool] Excel ${xls.name} produced ${result.bills.length} facturas`);
      } catch (err) {
        console.error('[Pool] Excel import failed:', xls.name, err);
        // fallback: treat as a single error PoolFile so the user sees it
        preClassified.push({
          id: `xls-err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          file: xls,
          status: 'error',
          error: err instanceof Error ? err.message : 'Error leyendo Excel',
        });
      }
    }

    // NEW — Multi-invoice PDF pre-split:
    // Before creating PoolFiles for the regular (non-Excel) pipeline, walk
    // the PDFs and ask the backend whether each one contains multiple
    // invoices. If so, slice it into N single-invoice sub-PDFs on the
    // client using pdf-lib. Non-PDFs (images) pass through untouched.
    //
    // This is intentionally the ONLY new step in the flow: the resulting
    // Files enter the existing per-file /api/extract pipeline exactly as
    // before, so extraction / classification / grouping logic is unchanged.
    let preparedFiles: File[] = nonExcelFiles;
    const pdfCount = nonExcelFiles.filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    ).length;
    if (pdfCount > 0) {
      setSplittingPdfs(true);
      setSplittingProgress({ current: 0, total: pdfCount, fileName: '' });
      try {
        preparedFiles = await preSplitMultiInvoicePdfs(nonExcelFiles, info => {
          setSplittingProgress({
            current: info.index,
            total: info.total,
            fileName: info.fileName,
          });
          if (info.detectedCount && info.detectedCount > 1) {
            console.log(`[Pool] ${info.fileName} contiene ${info.detectedCount} facturas → dividiendo`);
          }
        });
        console.log(`[Pool] Pre-split: ${nonExcelFiles.length} archivo(s) → ${preparedFiles.length} archivo(s) tras dividir`);
      } catch (err) {
        // If anything goes wrong we simply fall back to the original files
        // — preserves the pre-existing behaviour (1 PDF = 1 factura).
        console.error('[Pool] Pre-split failed, using originals:', err);
        preparedFiles = nonExcelFiles;
      } finally {
        setSplittingPdfs(false);
      }
    }

    const regularPoolFiles: PoolFile[] = preparedFiles.map((file, idx) => ({
      id: `file-${Date.now()}-${idx}`,
      file,
      status: 'pending' as const,
    }));

    const newSession: PoolSession = {
      id: `pool-${Date.now()}`,
      startedAt: Date.now(),
      files: [...preClassified, ...regularPoolFiles],
      groups: [],
      unassigned: [],
      status: 'uploading',
    };

    console.log('[Pool] Session created with', newSession.files.length, 'files (', preClassified.length, 'pre-classified from Excel)');
    setSession(newSession);
    setCurrentFileIndex(0);
    setTotalFilesToProcess(regularPoolFiles.length);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPTED_TYPES,
    disabled: session?.status === 'processing' || extractingZip || splittingPdfs
  });

  // Process files with batch processing
  // FIX: use a ref to capture files at start, avoid re-triggering via deps
  useEffect(() => {
    if (!session || session.status !== 'uploading') return;
    if (session.files.length === 0) {
      setSession(prev => prev ? { ...prev, status: 'ready' } : null);
      return;
    }
    if (processingRef.current) return;

    processingRef.current = true;

    // Snapshot files at the moment processing starts — immune to state changes.
    // Excel-derived PoolFiles already arrive with status 'classified' and an
    // extractedBill; we don't want to re-send them through /api/extract.
    const snapshot = [...session.files];
    const filesToProcess = snapshot.filter(f => f.status !== 'classified');
    const preDone = snapshot.filter(f => f.status === 'classified');
    const totalFiles = filesToProcess.length;

    console.log('[Pool] Starting processing of', totalFiles, 'files (+', preDone.length, 'pre-classified)');
    setTotalFilesToProcess(totalFiles);
    setSession(prev => prev ? { ...prev, status: 'processing' } : null);

    const processAllFiles = async () => {
      const results: PoolFile[] = [...preDone];

      for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
        const batch = filesToProcess.slice(i, i + BATCH_SIZE);
        console.log(`[Pool] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, files ${i + 1}-${Math.min(i + BATCH_SIZE, totalFiles)}`);

        const batchPromises = batch.map(async (poolFile, batchIdx) => {
          const globalIndex = i + batchIdx;
          // FIX: update progress atomically per file start
          setCurrentFileIndex(globalIndex + 1);
          setCurrentFileName(poolFile.file.name);
          console.log(`[Pool] Processing file ${globalIndex + 1}/${totalFiles}:`, poolFile.file.name);

          try {
            const result = await processFileWithTimeout(poolFile.file);

            if (result.bill) {
              console.log(`[Pool] Success:`, poolFile.file.name, '->', result.bill.energyType, result.bill.cups);
              return {
                ...poolFile,
                status: 'classified' as const,
                extractedBill: { ...result.bill, fileName: poolFile.file.name },
                error: undefined
              };
            } else {
              console.log(`[Pool] Error:`, poolFile.file.name, '->', result.error);
              return {
                ...poolFile,
                status: 'error' as const,
                error: result.error || 'No se pudo extraer'
              };
            }
          } catch (err) {
            console.error(`[Pool] Exception:`, poolFile.file.name, err);
            return {
              ...poolFile,
              status: 'error' as const,
              error: err instanceof Error ? err.message : 'Error desconocido'
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Update UI with progress after each batch
        const processedSoFar = results.length - preDone.length;
        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            files: [
              ...results,
              ...filesToProcess.slice(processedSoFar).map(f => ({ ...f, status: 'pending' as const })),
            ],
          };
        });
      }

      console.log('[Pool] All files processed. Grouping by CUPS/supply name...');

      // Group by CUPS + supply type. When CUPS is missing (typical in Excel
      // imports reconstructed from the client's messy sheets) we fall back to
      // the bill's titular or filename prefix so the user still gets one
      // subproject per supply instead of every row dumped into "unassigned".
      const groups: Record<string, PoolGroup> = {};
      const unassigned: PoolFile[] = [];

      const titularPrefix = (s: string | undefined): string => {
        if (!s) return '';
        const m = String(s).match(/^(.*?)_\d{4}-\d{2}-\d{2}/);
        return (m ? m[1] : s).trim();
      };

      results.forEach(pf => {
        if (pf.status !== 'classified' || !pf.extractedBill) {
          unassigned.push(pf);
          return;
        }

        const bill = pf.extractedBill;
        const cups = bill.cups?.replace(/\s+/g, '').toUpperCase() || '';
        const supplyType = bill.energyType;

        // Derive a grouping key: prefer CUPS, fall back to titular / fileName prefix
        const fallbackLabel = (bill.titular || titularPrefix(bill.fileName)).trim();
        let key: string;
        let displayCups = cups;
        if (cups && cups.startsWith('ES')) {
          key = `${supplyType}-${cups}`;
        } else if (fallbackLabel) {
          key = `${supplyType}-NOCUPS-${fallbackLabel.toUpperCase()}`;
          displayCups = cups || 'SIN CUPS';
        } else {
          unassigned.push(pf);
          return;
        }

        if (!groups[key]) {
          const groupIndex = Object.keys(groups).length + 1;
          const supplyName = (bill.titular && bill.titular.trim())
            || fallbackLabel
            || generateProjectName(displayCups, supplyType, groupIndex);
          groups[key] = {
            id: `group-${Date.now()}-${groupIndex}`,
            key,
            supplyType,
            cups: displayCups,
            bills: [],
            projectName: supplyName.toUpperCase().slice(0, 80),
          };
        }

        groups[key].bills.push(pf);
      });

      console.log('[Pool] Grouping complete:', {
        groups: Object.keys(groups).length,
        unassigned: unassigned.length,
        results: results.length
      });

      setSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          files: results,
          groups: Object.values(groups),
          unassigned,
          status: 'ready'
        };
      });

      setCurrentFileIndex(0);
      setCurrentFileName('');
      processingRef.current = false;
    };

    processAllFiles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  const generateProjectName = (cups: string, supplyType: string, index: number): string => {
    const suffix = cups.slice(-4);
    const type = supplyType === 'gas' ? 'GAS' : 'ELEC';
    return `${type}-${suffix}-${String(index).padStart(2, '0')}`;
  };

  const updateProjectName = (groupId: string, newName: string) => {
    setSession(prev => prev ? {
      ...prev,
      groups: prev.groups.map(g => g.id === groupId ? { ...g, projectName: newName.toUpperCase() } : g)
    } : null);
  };

  const removeFile = (fileId: string) => {
    setSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        files: prev.files.filter(f => f.id !== fileId)
      };
    });
  };

  const handleCreateProjects = async () => {
    if (!session) return;

    const projects = session.groups.map(group => ({
      name: group.projectName,
      bills: group.bills
        .filter(pf => pf.extractedBill)
        .map(pf => ({ ...pf.extractedBill!, projectId: group.id }))
    }));

    onComplete(projects, folderName.trim().toUpperCase());
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const stats = useMemo(() => {
    if (!session) return { total: 0, processed: 0, classified: 0, errors: 0, unassigned: 0, electricity: 0, gas: 0 };

    return {
      total: session.files.length,
      processed: session.files.filter(f => f.status !== 'pending').length,
      classified: session.files.filter(f => f.status === 'classified').length,
      errors: session.files.filter(f => f.status === 'error').length,
      unassigned: session.unassigned.length,
      electricity: session.groups.filter(g => g.supplyType === 'electricity').length,
      gas: session.groups.filter(g => g.supplyType === 'gas').length
    };
  }, [session]);

  // FIX: progress uses totalFilesToProcess (snapshot) instead of stats.total (reactive)
  const progress = totalFilesToProcess > 0 ? Math.round((currentFileIndex / totalFilesToProcess) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 md:p-8"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-[#0a0f1d] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Pool de Facturación</h2>
              <p className="text-[10px] text-slate-500 font-medium">Carga masiva y organización automática</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!session ? (
            !folderConfirmed ? (
              /* Step 1: ask for the project / folder name */
              <div className="p-10 rounded-2xl border border-white/10 bg-white/[0.02] max-w-xl mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-purple-600/10 flex items-center justify-center mb-5">
                  <FolderOpen className="w-7 h-7 text-purple-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">¿Cómo se llama este proyecto?</h3>
                <p className="text-sm text-slate-500 mb-5">
                  Se creará una carpeta con este nombre y cada suministro detectado se guardará dentro.
                  <br />
                  <span className="text-[11px] text-slate-600">Ejemplo: Ayuntamiento de Estella</span>
                </p>
                <input
                  autoFocus
                  type="text"
                  value={folderName}
                  onChange={e => setFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && folderName.trim()) setFolderConfirmed(true);
                  }}
                  placeholder="Nombre del proyecto / cliente"
                  className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-purple-500 text-white placeholder:text-slate-600 text-sm font-medium focus:outline-none"
                />
                <div className="flex justify-end gap-3 mt-5">
                  <button
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 font-bold text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={!folderName.trim()}
                    onClick={() => setFolderConfirmed(true)}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors flex items-center gap-2"
                  >
                    Continuar <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              /* Step 2: Upload area */
              <div className="space-y-4">
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-4 h-4 text-purple-400" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Proyecto</p>
                      <p className="text-sm font-bold text-white">{folderName.toUpperCase()}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFolderConfirmed(false)}
                    className="text-[10px] font-bold text-purple-400 hover:text-purple-300 uppercase"
                  >
                    Cambiar
                  </button>
                </div>
                <div
                  {...getRootProps()}
                  className={`
                    border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
                    ${isDragActive ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 hover:border-purple-500/50 hover:bg-white/5'}
                  `}
                >
                  <input {...getInputProps()} />

                  {extractingZip ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center mx-auto mb-4">
                        <Archive className="w-8 h-8 text-purple-400 animate-pulse" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">Extrayendo archivos del ZIP...</h3>
                      <p className="text-sm text-slate-500">Esto puede tardar unos segundos</p>
                    </>
                  ) : splittingPdfs ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center mx-auto mb-4">
                        <Layers className="w-8 h-8 text-purple-400 animate-pulse" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">
                        Analizando PDFs en busca de múltiples facturas...
                      </h3>
                      <p className="text-sm text-slate-500">
                        {splittingProgress.total > 0
                          ? `${splittingProgress.current} / ${splittingProgress.total}${splittingProgress.fileName ? ` · ${splittingProgress.fileName}` : ''}`
                          : 'Preparando archivos'}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center mx-auto mb-4">
                        <Upload className={`w-8 h-8 ${isDragActive ? 'text-purple-400' : 'text-slate-500'}`} />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">Arrastra facturas aquí</h3>
                      <p className="text-sm text-slate-500 mb-4">
                        PDFs de distintos suministros, o un Excel consolidado
                      </p>
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider">PDF · Imagen · Excel · ZIP</p>
                    </>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-6">
              {/* Stats Bar */}
              <div className="flex flex-wrap gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                <StatBadge label="Total" value={stats.total} icon={<FileText className="w-3 h-3" />} />
                <StatBadge label="Clasificadas" value={stats.classified} icon={<CheckCircle className="w-3 h-3" />} color="emerald" />
                <StatBadge label="Electricidad" value={stats.electricity} icon={<Zap className="w-3 h-3" />} color="blue" />
                <StatBadge label="Gas" value={stats.gas} icon={<Flame className="w-3 h-3" />} color="orange" />
                {stats.errors > 0 && (
                  <StatBadge label="Errores" value={stats.errors} icon={<AlertTriangle className="w-3 h-3" />} color="red" />
                )}
              </div>

              {/* Processing Progress */}
              {session.status === 'processing' && (
                <div className="space-y-3 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader className="w-5 h-5 text-purple-400 animate-spin" />
                      <span className="text-sm font-medium text-purple-300">
                        Procesando {currentFileIndex} / {totalFilesToProcess}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-purple-400/60">{progress}%</span>
                  </div>

                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-purple-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span className="truncate max-w-[300px]">{currentFileName}</span>
                  </div>
                </div>
              )}

              {/* File List */}
              {session.files.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Archivos ({stats.processed} / {stats.total})
                  </h4>
                  <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar">
                    {session.files.map(pf => (
                      <div key={pf.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {pf.status === 'processing' ? (
                            <Loader className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />
                          ) : pf.status === 'classified' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          ) : pf.status === 'error' ? (
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-slate-600 flex-shrink-0" />
                          )}
                          <span className="text-xs text-white truncate">{pf.file.name}</span>
                          {pf.status === 'classified' && pf.extractedBill && (
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                              isGasBill(pf.extractedBill) ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {isGasBill(pf.extractedBill) ? 'GAS' : 'ELEC'}
                            </span>
                          )}
                          {pf.status === 'error' && pf.error && (
                            <span className="text-[9px] text-red-400 truncate max-w-[150px]" title={pf.error}>
                              {pf.error}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeFile(pf.id)}
                          className="p-1 hover:bg-red-500/20 rounded text-slate-600 hover:text-red-400 flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Groups */}
              {session.groups.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-3 h-3" /> Proyectos a crear ({session.groups.length})
                  </h4>
                  <div className="space-y-2">
                    {session.groups.map(group => (
                      <div key={group.id} className="rounded-xl border border-white/5 overflow-hidden">
                        {/* Group Header */}
                        <div
                          className="flex items-center justify-between p-4 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                          onClick={() => toggleGroup(group.id)}
                        >
                          <div className="flex items-center gap-3">
                            {group.supplyType === 'gas' ? (
                              <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                                <Flame className="w-4 h-4 text-orange-400" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                <Zap className="w-4 h-4 text-blue-400" />
                              </div>
                            )}
                            <div>
                              <input
                                type="text"
                                value={group.projectName}
                                onChange={e => updateProjectName(group.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-purple-500 text-sm font-bold text-white uppercase focus:outline-none"
                              />
                              <p className="text-[9px] text-slate-500 font-mono">{group.cups}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-slate-500">{group.bills.length} factura{group.bills.length > 1 ? 's' : ''}</span>
                            {expandedGroups.has(group.id) ? (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                        </div>

                        {/* Group Files */}
                        <AnimatePresence>
                          {expandedGroups.has(group.id) && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-3 space-y-1 border-t border-white/5">
                                {group.bills.map(pf => (
                                  <div key={pf.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                                    <FileText className="w-3 h-3 text-slate-600" />
                                    <span className="text-[10px] text-slate-400 truncate flex-1">{pf.file.name}</span>
                                    {pf.extractedBill && (
                                      <span className="text-[9px] text-slate-600">
                                        {pf.extractedBill.fechaFin}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unassigned Files */}
              {session.unassigned.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3" /> Requiere revisión ({session.unassigned.length})
                  </h4>
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                    <p className="text-[10px] text-amber-400">
                      Estas facturas no tienen un CUPS válido o no pudieron ser procesadas.
                    </p>
                    {session.unassigned.map(pf => (
                      <div key={pf.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-amber-500/50" />
                          <span className="text-xs text-slate-300">{pf.file.name}</span>
                        </div>
                        <span className="text-[9px] text-amber-500">
                          {pf.error || 'Sin CUPS detectado'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {session && session.status === 'ready' && (
          <div className="flex items-center justify-between gap-4 p-6 border-t border-white/5 bg-white/[0.02]">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 font-bold text-sm transition-colors"
            >
              Cancelar
            </button>
            <div className="flex items-center gap-3">
              {session.groups.length > 0 && (
                <button
                  onClick={handleCreateProjects}
                  className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-colors flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  Crear {session.groups.length} proyecto{session.groups.length > 1 ? 's' : ''}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function StatBadge({ label, value, icon, color = 'slate' }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: 'slate' | 'emerald' | 'blue' | 'orange' | 'red' | 'amber';
}) {
  const colorClasses = {
    slate: 'text-slate-400',
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
    amber: 'text-amber-400'
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5">
      <span className={colorClasses[color]}>{icon}</span>
      <span className="text-[10px] font-bold text-slate-500 uppercase">{label}:</span>
      <span className={`text-[11px] font-black ${colorClasses[color]}`}>{value}</span>
    </div>
  );
}

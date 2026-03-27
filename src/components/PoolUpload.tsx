"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, X, FileText, Zap, Flame, CheckCircle, AlertTriangle, 
  Loader, Trash2, FolderOpen, ChevronRight, ChevronDown,
  Package, Layers, ArrowRight, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PoolFile, PoolGroup, PoolSession, ExtractedBill, isGasBill } from '@/lib/types';

interface PoolUploadProps {
  onClose: () => void;
  onComplete: (projects: { name: string; bills: ExtractedBill[] }[]) => void;
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
  'image/heif': ['.heif']
};

const BATCH_SIZE = 2;
const FILE_TIMEOUT_MS = 60000;

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

export default function PoolUpload({ onClose, onComplete, existingCups }: PoolUploadProps) {
  const [session, setSession] = useState<PoolSession | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const processingRef = useRef(false);
  const sessionRef = useRef<PoolSession | null>(null);

  // Keep sessionRef in sync
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const handleDrop = useCallback(async (acceptedFiles: File[]) => {
    console.log('[Pool] Files dropped:', acceptedFiles.length);
    
    const newSession: PoolSession = {
      id: `pool-${Date.now()}`,
      startedAt: Date.now(),
      files: acceptedFiles.map((file, idx) => ({
        id: `file-${Date.now()}-${idx}`,
        file,
        status: 'pending' as const
      })),
      groups: [],
      unassigned: [],
      status: 'uploading'
    };

    console.log('[Pool] Session created with', newSession.files.length, 'files');
    setSession(newSession);
    setCurrentFileIndex(0);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPTED_TYPES,
    disabled: session?.status === 'processing'
  });

  // Process files with batch processing
  useEffect(() => {
    if (!session || session.status !== 'uploading') return;
    if (session.files.length === 0) {
      setSession(prev => prev ? { ...prev, status: 'ready' } : null);
      return;
    }
    if (processingRef.current) return;

    processingRef.current = true;
    console.log('[Pool] Starting processing of', session.files.length, 'files');
    
    setSession(prev => prev ? { ...prev, status: 'processing' } : null);

    const processAllFiles = async () => {
      const files = [...session.files];
      const results: PoolFile[] = [];
      let processedCount = 0;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        console.log(`[Pool] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, files ${i + 1}-${Math.min(i + BATCH_SIZE, files.length)}`);
        
        const batchPromises = batch.map(async (poolFile, batchIdx) => {
          const globalIndex = i + batchIdx;
          setCurrentFileIndex(globalIndex + 1);
          setCurrentFileName(poolFile.file.name);
          console.log(`[Pool] Processing file ${globalIndex + 1}/${files.length}:`, poolFile.file.name);

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
        processedCount += batch.length;

        // Update UI with progress after each batch
        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            files: results
          };
        });
      }

      console.log('[Pool] All files processed. Grouping by CUPS...');

      // Group by CUPS + supply type
      const groups: Record<string, PoolGroup> = {};
      const unassigned: PoolFile[] = [];

      results.forEach(pf => {
        if (pf.status !== 'classified' || !pf.extractedBill) {
          unassigned.push(pf);
          return;
        }

        const bill = pf.extractedBill;
        const cups = bill.cups?.replace(/\s+/g, '').toUpperCase() || '';
        const supplyType = bill.energyType;

        if (!cups || !cups.startsWith('ES')) {
          unassigned.push(pf);
          return;
        }

        const key = `${supplyType}-${cups}`;
        
        if (!groups[key]) {
          const groupIndex = Object.keys(groups).length + 1;
          groups[key] = {
            id: `group-${Date.now()}-${groupIndex}`,
            key,
            supplyType,
            cups,
            bills: [],
            projectName: generateProjectName(cups, supplyType, groupIndex)
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
  }, [session?.status, session?.files?.length]);

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

    onComplete(projects);
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

  const progress = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

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
            /* Upload Area */
            <div 
              {...getRootProps()} 
              className={`
                border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
                ${isDragActive ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 hover:border-purple-500/50 hover:bg-white/5'}
              `}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center mx-auto mb-4">
                <Upload className={`w-8 h-8 ${isDragActive ? 'text-purple-400' : 'text-slate-500'}`} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Arrastra facturas aquí</h3>
              <p className="text-sm text-slate-500 mb-4">o haz clic para seleccionar archivos</p>
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">PDF, Imagen, Excel</p>
            </div>
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
                        Procesando {currentFileIndex} / {stats.total}
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

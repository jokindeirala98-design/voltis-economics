"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, Upload, Trash2, Download, AlertTriangle, 
  CheckCircle, Plus, FolderOpen, Edit2, 
  BarChart3, LayoutDashboard, Settings, LogOut,
  ChevronRight, Sparkles, Zap, Smartphone, Layers, X,
  Loader, FileSpreadsheet, Check, AlertCircle, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { ExtractedBill, ProjectWorkspace, QueueItem, isGasBill, ProjectFolder } from '@/lib/types';
import FileTable from '@/components/FileTable';
import { exportBillsToExcel } from '@/lib/export';
import { importBillsFromExcel } from '@/lib/import-bills';
import { importFlexibleExcel, FlexibleImportResult } from '@/lib/import-flexible';
import { 
  exportBillsToCorrectionExcel, 
  parseCorrectionExcel, 
  detectCorrectionChanges, 
  applyCorrectionChanges,
  formatChangesForDisplay,
  CorrectionChange,
  CorrectionResult
} from '@/lib/excel-correction';
import ReportView from '@/components/ReportView';
import { GasReportView } from '@/components/GasReportView';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  fetchAllProjectsFromDB, 
  syncProjectToDB, 
  deleteProjectFromDB, 
  saveAuditLog,
  fetchAllFoldersFromDB,
  syncFolderToDB,
  deleteFolderFromDB
} from '@/lib/supabase-sync';
import { getAssignedMonth } from '@/lib/date-utils';
import LoginScreen from '@/components/LoginScreen';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

const StatusItem = ({ label, status }: { label: string; status: boolean }) => (
  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{label}</span>
    <div className={`w-2 h-2 rounded-full ${status ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`} />
  </div>
);

function EnergyBillsAppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [allBills, setAllBills] = useState<Record<string, ExtractedBill[]>>({});
  const [allCustomOCs, setAllCustomOCs] = useState<Record<string, Record<string, { concepto: string; total: number }[]>>>({});
  const [allExtractionQueues, setAllExtractionQueues] = useState<Record<string, QueueItem[]>>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string>('default');
  const [savedProjects, setSavedProjects] = useState<ProjectWorkspace[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  
  // Debug: log when showNewProjectModal changes to true
  useEffect(() => {
    if (showNewProjectModal === true) {
      console.log('[DEBUG-MODAL-OPEN] showNewProjectModal changed to TRUE');
      console.trace('[DEBUG-MODAL-OPEN] Stack trace for modal open');
    }
  }, [showNewProjectModal]);
  
  const [fileRefs, setFileRefs] = useState<Record<string, File>>({}); 
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'local'>('local');
  const [showDiag, setShowDiag] = useState(false);
  const [diagInfo, setDiagInfo] = useState<any>(null);
  const [isCheckingDiag, setIsCheckingDiag] = useState(false);
  const [previewBillId, setPreviewBillId] = useState<string | null>(null);
  const [refiningBill, setRefiningBill] = useState<ExtractedBill | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [fileBase64Refs, setFileBase64Refs] = useState<Record<string, { data: string, type: string }>>({});
  
  // Excel Correction State
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionFile, setCorrectionFile] = useState<File | null>(null);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [isProcessingCorrection, setIsProcessingCorrection] = useState(false);

  const parseDate = (d?: string) => {
    if (!d) return 0;
    if (d.includes('-')) return new Date(d).getTime() || 0;
    if (d.includes('/')) {
      const [day, month, year] = d.split('/').map(Number);
      return new Date(year, month - 1, day).getTime() || 0;
    }
    return new Date(d).getTime() || 0;
  };

  const runDiagnostic = async () => {
    setIsCheckingDiag(true);
    try {
      const res = await fetch('/api/diag');
      const data = await res.json();
      setDiagInfo(data);
    } catch (e) {
      setDiagInfo({ error: 'Fallo al conectar con el servidor de diagnóstico' });
    }
    setIsCheckingDiag(false);
  };

  const bills = useMemo(() => {
    const b = allBills[currentProjectId] || [];
    return [...b].sort((a, b) => {
      const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
      const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
      if (am.year !== bm.year) return am.year - bm.year;
      if (am.month !== bm.month) return am.month - bm.month;
      return (a.fileName || '').localeCompare(b.fileName || '');
    });
  }, [allBills, currentProjectId]);

  const extractionQueue = allExtractionQueues[currentProjectId] || [];
  const customOCs = allCustomOCs[currentProjectId] || {};

  // Initialization: Check local auth and Sync Cloud -> Local
  useEffect(() => {
    const checkAuth = () => {
      const loggedIn = localStorage.getItem('voltis_logged_in') === 'true';
      if (loggedIn) setIsAuthenticated(true);
      setIsAuthLoading(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const initStorage = async () => {
      if (!isAuthenticated) return;
      
      const userId = 'voltis_user_global';
      console.log(`[SYNC_TRACE] Iniciando carga de datos para usuario: ${userId}`);
      setCloudSyncStatus('syncing');

      try {
        const [dbProjects, dbFolders] = await Promise.all([
          fetchAllProjectsFromDB(userId),
          fetchAllFoldersFromDB(userId)
        ]);
        
        console.log(`[SYNC_TRACE] Supabase devolvió ${dbProjects?.length || 0} proyectos y ${dbFolders?.length || 0} carpetas`);
        
        // Populate folders with project IDs
        const populatedFolders = dbFolders.map(f => ({
          ...f,
          projectIds: dbProjects.filter(p => p.folderId === f.id).map(p => p.id)
        }));
        setFolders(populatedFolders);

        if (dbProjects && dbProjects.length > 0) {
          setSavedProjects(dbProjects);

          const billsAcc: Record<string, ExtractedBill[]> = {};
          const ocsAcc: Record<string, any> = {};

          dbProjects.forEach(p => {
            billsAcc[p.id] = (p.bills || []).sort((a, b) => {
              const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
              const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
              if (am.year !== bm.year) return am.year - bm.year;
              return am.month - bm.month;
            });
            ocsAcc[p.id] = p.customOCs || {};
          });

          const lastId = localStorage.getItem(`voltis_last_project`) || dbProjects[0].id;
          const activeProj = dbProjects.find(p => p.id === lastId) || dbProjects[0];
          
          if (activeProj.folderId) setActiveFolderId(activeProj.folderId);

          setAllBills(prev => {
            const merged = { ...prev };
            Object.keys(billsAcc).forEach(pid => {
              merged[pid] = billsAcc[pid];
            });

            const defaultBills = merged['default'] || [];
            const activeBills = merged[lastId] || [];

            if (defaultBills.length > 0) {
              console.log(`[SYNC_TRACE] Detectados ${defaultBills.length} facturas huérfanas en 'default'`);
              const activeKeys = new Set(activeBills.map(b => `${b.cups}-${b.fechaInicio}-${b.fechaFin}`));
              const toMigrate = defaultBills.filter(b => !activeKeys.has(`${b.cups}-${b.fechaInicio}-${b.fechaFin}`));

              if (toMigrate.length > 0) {
                console.log(`[SYNC_TRACE] Migrando ${toMigrate.length} facturas de local → nube (Proyecto: ${lastId})`);
                merged[lastId] = [...activeBills, ...toMigrate];
                
                setTimeout(() => {
                  const migratedProject = {
                    ...dbProjects.find(p => p.id === lastId),
                    id: lastId,
                    bills: merged[lastId],
                    customOCs: { ...(ocsAcc[lastId] || {}), ...(prev['default'] || {}) },
                    updatedAt: Date.now(),
                  };
                  syncProjectToDB(migratedProject as ProjectWorkspace, userId)
                    .then(success => {
                        if (success) console.log(`[SYNC_TRACE] Migración existosa a la nube`);
                        else console.error(`[SYNC_TRACE] Falló la migración automática a la nube`);
                    });
                }, 100);
              }
              delete merged['default'];
            }
            return merged;
          });

          setAllCustomOCs(prev => {
            const merged = { ...prev };
            Object.keys(ocsAcc).forEach(pid => { merged[pid] = ocsAcc[pid]; });
            if (prev['default']) {
              merged[lastId] = { ...(merged[lastId] || {}), ...(prev['default'] || {}) };
              delete merged['default'];
            }
            return merged;
          });

          setCurrentProjectId(lastId);
          setCloudSyncStatus('synced');
          console.log(`[SYNC_TRACE] Estado de la aplicación sincronizado con la nube`);
        } else {
          // Handle clean state or restored projects
          setCloudSyncStatus('synced');
        }
      } catch (e: any) {
        console.error(`[LOCAL_FALLBACK_TRACE] Error en sincronización inicial:`, e.message);
        setCloudSyncStatus('error');
        toast.error('Error de conexión con la nube. Operando en modo local.');
      }
    };
    initStorage();
  }, [isAuthenticated]);

  const handleLogin = (password: string) => {
    if (password.toLowerCase() === 'voltis2026') {
      setIsAuthenticated(true);
      setAuthError(null);
      localStorage.setItem('voltis_logged_in', 'true');
      toast.success('Acceso concedido');
    } else {
      setAuthError('Contraseña incorrecta');
      toast.error('Acceso denegado');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('voltis_logged_in');
    toast.success('Sesión cerrada');
  };

  const handleManualSync = async () => {
    if (cloudSyncStatus === 'syncing') return;
    setCloudSyncStatus('syncing');
    const userId = 'voltis_user_global';
    console.log(`[SYNC_TRACE] Iniciando sincronización manual de todos los datos locales...`);
    
    try {
      let totalMigrated = 0;
      for (const proj of savedProjects) {
        console.log(`[SYNC_TRACE] Sincronizando proyecto: ${proj.name} (${proj.id})`);
        const success = await syncProjectToDB(proj, userId);
        if (success) totalMigrated++;
      }
      
      if (totalMigrated > 0) {
        setCloudSyncStatus('synced');
        toast.success(`Se sincronizaron ${totalMigrated} proyectos con la nube`);
        console.log(`[SYNC_TRACE] Sincronización manual completada: ${totalMigrated} proyectos`);
      } else {
        setCloudSyncStatus('error');
        toast.error('No se pudo sincronizar ningún proyecto con la nube');
      }
    } catch (e: any) {
      console.error(`[SYNC_TRACE] Error en sincronización manual:`, e.message);
      setCloudSyncStatus('error');
      toast.error('Error durante la sincronización');
    }
  };

  const saveToDisk = useCallback(async (updatedBills: ExtractedBill[], updatedOCs: Record<string, { concepto: string; total: number }[]>, targetProjectId?: string) => {
    if (!isAuthenticated) return;
    const userId = 'voltis_user_global';
    const projectId = targetProjectId || currentProjectId;
    
    // Save to localStorage as immediate backup
    try {
      const localKey = `voltis_bills_backup_${projectId}`;
      localStorage.setItem(localKey, JSON.stringify({
        bills: updatedBills,
        customOCs: updatedOCs,
        savedAt: Date.now()
      }));
    } catch (e) {
      console.warn('[Backup] Could not save to localStorage:', e);
    }
    
    setSavedProjects(prev => {
      const next = prev.map(p => p.id === projectId ? { 
        ...p, bills: updatedBills, customOCs: updatedOCs, updatedAt: Date.now() 
      } : p);
      
      const activeProject = next.find(p => p.id === projectId);
      if (activeProject) {
        setCloudSyncStatus('syncing');
        syncProjectToDB(activeProject, userId)
          .then((success) => {
            if (success) {
              setCloudSyncStatus('synced');
            } else {
              setCloudSyncStatus('error');
              toast.error('Error al guardar en la nube. Datos guardados localmente.');
            }
          })
          .catch(() => {
            setCloudSyncStatus('error');
            toast.error('Error de sincronización. Datos guardados localmente.');
          });
      }
      return next;
    });
  }, [currentProjectId, isAuthenticated]);

  const processFile = useCallback(async (file: File, queueId: string, targetProjectId: string, userInstruction?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (userInstruction) formData.append('userInstruction', userInstruction);

    try {
      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.status === 'pending_review') {
        console.warn(`[REPORT ROUTING][${file.name}] Pending review: ${data.error}`);
        setAllExtractionQueues(prev => ({
          ...prev,
          [targetProjectId]: (prev[targetProjectId] || []).map(item =>
            item.id === queueId ? { ...item, status: 'error' as const, error: data.error } : item
          )
        }));
        toast.warning(`⚠️ Clasificación ambigua para "${file.name}". ${data.error}`);
        return;
      }

      if (data.status === 'success') {
        const newBill: ExtractedBill = data.bill;
        const fileData = fileBase64Refs[queueId];

        console.log(`[REPORT ROUTING][${file.name}] Classification: type=${data.classification?.energyType}, confidence=${data.classification?.confidence?.toFixed(2)}, isLowConfidence=${data.classification?.isLowConfidence}`);
        console.log(`[REPORT ROUTING][${file.name}] Final bill: energyType=${newBill.energyType}, hasGasConsumption=${!!newBill.gasConsumption}, hasGasPricing=${!!newBill.gasPricing}, hasTarifaRL=${!!newBill.tarifaRL}, hasConsumo=${!!(newBill as any).consumo}, total=${newBill.totalFactura}`);

        if (data.classification?.isLowConfidence) {
          toast.warning(`Factura "${file.name}" clasificada con baja confianza (${(data.classification.confidence * 100).toFixed(0)}%). Por favor, revisa que los datos sean correctos.`);
        }

        if (data.classification?.warnings?.length > 0) {
          console.warn(`[REPORT ROUTING][${file.name}] Classification warnings:`, data.classification.warnings);
        }

        // Attach original file if available
        if (fileData) {
          newBill.originalFileBase64 = fileData.data;
          newBill.fileMimeType = fileData.type;
        }

        // Update project-keyed bills
        setAllBills(prev => {
          const projectBills = prev[targetProjectId] || [];
          const isDuplicate = projectBills.some(b =>
            b.cups && newBill.cups &&
            b.cups === newBill.cups &&
            b.fechaInicio === newBill.fechaInicio &&
            b.fechaFin === newBill.fechaFin
          );

          if (isDuplicate) {
            setAllExtractionQueues(q => ({
              ...q,
              [targetProjectId]: (q[targetProjectId] || []).map(item =>
                item.id === queueId ? { ...item, status: 'error' as const, error: 'Factura duplicada en este proyecto' } : item
              )
            }));
            return prev;
          }

          const billWithProject = { ...newBill, projectId: targetProjectId };
          const nextBills = [...projectBills, billWithProject].sort((a, b) => {
            const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
            const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
            if (am.year !== bm.year) return am.year - bm.year;
            return am.month - bm.month;
          });
          const next = { ...prev, [targetProjectId]: nextBills };

          const projectCustomOCs = allCustomOCs[targetProjectId] || {};
          saveToDisk(nextBills, projectCustomOCs, targetProjectId);

          return next;
        });

        setAllExtractionQueues(prev => ({
          ...prev,
          [targetProjectId]: (prev[targetProjectId] || []).map(item =>
            item.id === queueId ? { ...item, status: 'success' as const } : item
          )
        }));
      } else {
        // Handle extraction failure
        const isRetryable = data.retryable === true;
        const errorMsg = data.error || 'Error desconocido';

        console.error(`[REPORT ROUTING][${file.name}] Extraction failed: ${errorMsg}`, {
          retryable: isRetryable,
          classification: data.classification,
        });

        setAllExtractionQueues(prev => ({
          ...prev,
          [targetProjectId]: (prev[targetProjectId] || []).map(item =>
            item.id === queueId ? { ...item, status: 'error' as const, error: errorMsg } : item
          )
        }));

        if (isRetryable) {
          toast.error(`⚠️ ${errorMsg} Intenta de nuevo en unos segundos.`);
        } else {
          toast.error(`Error en ${file.name}: ${errorMsg}`);
        }
      }
    } catch (err) {
      console.error(`[REPORT ROUTING][${file.name}] Network error:`, err);
      setAllExtractionQueues(prev => ({
        ...prev,
        [targetProjectId]: (prev[targetProjectId] || []).map(item =>
          item.id === queueId ? { ...item, status: 'error' as const, error: 'Error de red' } : item
        )
      }));
      toast.error(`Error de red en ${file.name}`);
    }
  }, [allCustomOCs, saveToDisk]);
  const handleRefine = async () => {
    if (!refiningBill || !refineInstruction.trim()) return;
    
    const file = fileRefs[refiningBill.id];
    if (!file) {
      toast.error('Archivo original no encontrado en memoria. Por favor, vuelve a subirlo.');
      setRefiningBill(null);
      return;
    }

    setIsRefining(true);
    const queueId = `refine-${Date.now()}`;
    
    // Add to queue as loading
    setAllExtractionQueues(prev => ({
      ...prev,
      [currentProjectId]: [...(prev[currentProjectId] || []), {
        id: queueId,
        fileName: file.name,
        status: 'loading',
        addedAt: Date.now()
      }]
    }));

    // We remove the old bill first to replace it with the refined one
    const updatedBills = (allBills[currentProjectId] || []).filter(b => b.id !== refiningBill.id);
    setAllBills(prev => ({ ...prev, [currentProjectId]: updatedBills }));

    await processFile(file, queueId, currentProjectId, refineInstruction);
    
    setIsRefining(false);
    setRefiningBill(null);
    setRefineInstruction('');
    toast.success('Solicitud de refinamiento enviada');
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const targetProjectId = currentProjectId;
    const excelFiles = acceptedFiles.filter(f => f.name.endsWith('.xlsx'));
    if (excelFiles.length > 0) {
      const file = excelFiles[0];
      
      // Use flexible import for better detection
      try {
        const result = await importFlexibleExcel(file);
        
        if (result.imported === 0) {
          toast.error('No se detectaron facturas en el archivo Excel');
          if (result.warnings.length > 0) {
            console.warn('Import warnings:', result.warnings);
          }
          return;
        }
        
        // Merge with existing bills (avoid duplicates)
        const existingBills = allBills[targetProjectId] || [];
        const newBills = result.bills.filter(newBill => {
          return !existingBills.some(existing => 
            existing.cups === newBill.cups && 
            existing.fechaFin === newBill.fechaFin
          );
        });
        
        const mergedBills = [...existingBills, ...newBills].sort((a, b) => {
          const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
          const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
          if (am.year !== bm.year) return am.year - bm.year;
          return am.month - bm.month;
        });
        
        setAllBills(prev => ({ ...prev, [targetProjectId]: mergedBills }));
        setAllCustomOCs(prev => ({ ...prev, [targetProjectId]: result.customOCs || {} }));
        saveToDisk(mergedBills, result.customOCs || {}, targetProjectId);
        
        // Show result summary
        const message = `${result.imported} factura${result.imported > 1 ? 's' : ''} importada${result.imported > 1 ? 's' : ''} de Excel`;
        toast.success(message);
        
        if (result.warnings.length > 0) {
          toast.warning(`${result.warnings.length} advertencia${result.warnings.length > 1 ? 's' : ''} durante la importación`);
        }
        
      } catch (err: any) {
        toast.error('Error al importar Excel: ' + err.message);
      }
      return;
    }

    const currentBills = allBills[targetProjectId] || [];
    const validFiles = acceptedFiles.filter(file => {
      const isDupp = currentBills.some(b => b.fileName === file.name);
      if (isDupp) {
        toast.warning(`La factura "${file.name}" ya ha sido escaneada en este proyecto.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      setIsExtracting(false);
      return;
    }

    const newItems: QueueItem[] = validFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      projectId: targetProjectId,
      fileName: file.name,
      fileSize: file.size,
      status: 'loading' as const,
      addedAt: Date.now(),
    }));
    
    setFileRefs(prev => {
      const next = { ...prev };
      validFiles.forEach((file, i) => { next[newItems[i].id] = file; });
      return next;
    });

    // Start Base64 conversions in parallel
    validFiles.forEach(async (file, i) => {
      try {
        const b64 = await fileToBase64(file);
        setFileBase64Refs(prev => ({ 
          ...prev, 
          [newItems[i].id]: { data: b64, type: file.type } 
        }));
      } catch (e) {
        console.error('Error converting file to base64:', e);
      }
    });

    setAllExtractionQueues(prev => {
      const next = {
        ...prev,
        [targetProjectId]: [...newItems, ...(prev[targetProjectId] || [])]
      };
      
      // Persist queue immediately
      setSavedProjects(projects => {
        const updated = projects.map(p => p.id === targetProjectId ? { ...p, queueItems: next[targetProjectId] } : p);
        localStorage.setItem('voltis_saved_projects', JSON.stringify(updated));
        return updated;
      });
      
      return next;
    });

    // Process files with bounded concurrency (limit 2)
    const queue = [...validFiles.map((file, i) => ({ file, id: newItems[i].id }))];
    const concurrencyLimit = 2;
    const workers = Array(Math.min(concurrencyLimit, queue.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            await processFile(item.file, item.id, targetProjectId);
          }
        }
      });

    await Promise.all(workers);
    setIsExtracting(false);
    toast.success('Extracción completada. Todos los datos han sido guardados en el histórico.');
  }, [currentProjectId, saveToDisk, processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } 
  });

  const createNewProject = async (name: string, folderId?: string) => {
    // Debug logging
    console.log('[Project Creation] Iniciando creación:', { nameLength: name.trim().length, isAuthenticated, folderId });

    if (!name.trim()) {
      toast.error('El nombre del proyecto no puede estar vacío');
      return;
    }

    if (!isAuthenticated) {
      toast.error('Tu sesión no está disponible. Recarga la página o vuelve a iniciar sesión.');
      console.warn('[Project Creation] Abortado: No hay sesión activa');
      return;
    }

    const userId = 'voltis_user_global';
    
    // Robust UUID fallback
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('[Project Creation] Generando proyecto:', { newId, userId, folderId: folderId || activeFolderId });

    const project: ProjectWorkspace = { 
      id: newId, 
      name: name.toUpperCase(), 
      folderId: folderId || (activeFolderId || undefined), // NEW: Associate with active folder
      bills: [], 
      customOCs: {}, 
      updatedAt: Date.now() 
    };
    
    // 1. Local State Update
    setSavedProjects(prev => {
      const isDupp = prev.some(p => p.id === project.id);
      if (isDupp) return prev;
      return [...prev, project];
    });

    if (project.folderId) {
      setFolders(prev => prev.map(f => f.id === project.folderId ? { ...f, projectIds: [...f.projectIds, project.id] } : f));
    }

    setAllBills(prev => ({ ...prev, [project.id]: [] }));
    setAllCustomOCs(prev => ({ ...prev, [project.id]: {} }));
    setAllExtractionQueues(prev => ({ ...prev, [project.id]: [] }));
    
    loadWorkspace(project);
    setShowNewProjectModal(false);
    setNewProjectName('');

    // 2. Database Sync (outside the state updater)
    setCloudSyncStatus('syncing');
    try {
      const success = await syncProjectToDB(project, userId);
      if (success) {
        setCloudSyncStatus('synced');
        toast.success('Proyecto creado y sincronizado en la nube');
      } else {
        setCloudSyncStatus('error');
        toast.error('Proyecto creado localmente, pero falló la sincronización. Verifica tu conexión.');
      }
    } catch (err) {
      console.error('[Project Creation] Error fatal en la sincronización:', err);
      setCloudSyncStatus('error');
      toast.error('Error al guardar en la nube. Revisa la consola para más detalles.');
    }
  };

  // ============================================
  // FOLDER CRUD FUNCTIONS
  // ============================================

  const createFolder = async (name: string) => {
    if (!name.trim()) return;
    const userId = 'voltis_user_global';
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `folder-${Date.now()}`;
    
    const newFolder: ProjectFolder = {
      id: newId,
      name: name.toUpperCase(),
      user_id: userId,
      projectIds: [],
      updatedAt: Date.now()
    };

    setFolders(prev => [...prev, newFolder]);
    setShowNewFolderModal(false);
    setNewFolderName('');
    
    const success = await syncFolderToDB(newFolder, userId);
    if (success) toast.success('Carpeta creada');
    else toast.error('Error al crear carpeta en la nube');
  };

  const deleteFolder = async (folderId: string) => {
    if (!confirm('¿Eliminar esta carpeta? Los proyectos asociados no se borrarán, quedarán sin carpeta.')) return;
    const userId = 'voltis_user_global';
    
    setFolders(prev => prev.filter(f => f.id !== folderId));
    setSavedProjects(prev => prev.map(p => p.folderId === folderId ? { ...p, folderId: undefined } : p));
    if (activeFolderId === folderId) setActiveFolderId(null);
    
    await deleteFolderFromDB(folderId, userId);
    toast.success('Carpeta eliminada');
  };

  const renameFolder = async (folderId: string, newName: string) => {
    if (!newName.trim()) return;
    const userId = 'voltis_user_global';
    const upperName = newName.toUpperCase();
    
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: upperName, updatedAt: Date.now() } : f));
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      await syncFolderToDB({ ...folder, name: upperName, updatedAt: Date.now() }, userId);
    }
    setRenamingFolderId(null);
  };

  const moveProjectToFolder = async (projectId: string, folderId: string | null) => {
    const userId = 'voltis_user_global';
    
    // Update local state
    setSavedProjects(prev => prev.map(p => p.id === projectId ? { ...p, folderId: folderId || undefined } : p));
    
    // Update folders state
    setFolders(prev => prev.map(f => {
      // Remove from old folder if present
      const withoutProject = f.projectIds.filter(id => id !== projectId);
      // Add to new folder if matches
      if (f.id === folderId) {
        return { ...f, projectIds: [...withoutProject, projectId] };
      }
      return { ...f, projectIds: withoutProject };
    }));

    // Sync to DB
    const project = savedProjects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, folderId: folderId || undefined };
      setCloudSyncStatus('syncing');
      const success = await syncProjectToDB(updated, userId);
      if (success) {
        setCloudSyncStatus('synced');
        toast.success(folderId ? 'Proyecto movido a la carpeta' : 'Proyecto sacado de la carpeta');
      } else {
        setCloudSyncStatus('error');
      }
    }
  };

  const loadWorkspace = (proj: ProjectWorkspace) => {
    setCurrentProjectId(proj.id);
    setFileRefs({}); // Clear in-memory file refs when switching projects
    localStorage.setItem('voltis_last_project', proj.id);
    setShowReport(false);
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    const userId = 'voltis_user_global';

    if (confirm('¿Eliminar este proyecto permanentemente de la nube?')) {
      const next = savedProjects.filter(p => p.id !== id);
      setSavedProjects(next);
      
      setCloudSyncStatus('syncing');
      deleteProjectFromDB(id, userId).then(() => setCloudSyncStatus('synced')).catch(() => setCloudSyncStatus('error'));
      
      setAllBills(prev => { const n = { ...prev }; delete n[id]; return n; });
      setAllCustomOCs(prev => { const n = { ...prev }; delete n[id]; return n; });
      setAllExtractionQueues(prev => { const n = { ...prev }; delete n[id]; return n; });

      if (currentProjectId === id && next.length > 0) loadWorkspace(next[0]);
      toast.success('Proyecto eliminado');
    }
  };

  const clearProjectBills = () => {
    if (confirm('¿Estás seguro de que quieres eliminar TODAS las facturas de este proyecto? Esta acción no se puede deshacer.')) {
      setAllBills(prev => ({ ...prev, [currentProjectId]: [] }));
      setAllCustomOCs(prev => ({ ...prev, [currentProjectId]: {} }));
      setAllExtractionQueues(prev => ({ ...prev, [currentProjectId]: [] }));
      saveToDisk([], {}, currentProjectId);
      toast.success('Proyecto vaciado correctamente');
    }
  };

  const renameProject = async (id: string, newName: string) => {
    if (!newName.trim() || !isAuthenticated) return;
    const userId = 'voltis_user_global';
    const upperName = newName.toUpperCase();
    setSavedProjects(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name: upperName, updatedAt: Date.now() } : p);
      const updated = next.find(p => p.id === id);
      if (updated) {
        setCloudSyncStatus('syncing');
        syncProjectToDB(updated, userId).then(() => setCloudSyncStatus('synced')).catch(() => setCloudSyncStatus('error'));
      }
      return next;
    });
    toast.success('Nombre actualizado');
    setRenamingProjectId(null);
  };

  const handleUpdateBills = (newBills: ExtractedBill[]) => {
    const sorted = [...newBills].sort((a, b) => {
      const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
      const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
      if (am.year !== bm.year) return am.year - bm.year;
      return am.month - bm.month;
    });
    setAllBills(prev => ({ ...prev, [currentProjectId]: sorted }));
    saveToDisk(sorted, customOCs, currentProjectId);
  };

  const handleUpdateOCs = (billId: string, ocs: { concepto: string; total: number }[]) => {
    setAllCustomOCs(prev => {
      const projectOCs = prev[currentProjectId] || {};
      const nextOCs = { ...projectOCs, [billId]: ocs };
      const next = { ...prev, [currentProjectId]: nextOCs };
      saveToDisk(bills, nextOCs, currentProjectId);
      return next;
    });
  };

  const repairProjects = () => {
    if (!confirm('Esta acción intentará mover facturas mal ubicadas a su proyecto correspondiente basándose en su CUPS. ¿Continuar?')) return;
    
    setAllBills(prev => {
      const allBillsFlat: ExtractedBill[] = Object.values(prev).flat();
      const next: Record<string, ExtractedBill[]> = {};
      
      // Initialize next with existing project IDs
      Object.keys(prev).forEach(id => next[id] = []);
      
      // Map CUPS to the project ID where it's most common
      const cupsToProjectMap: Record<string, string> = {};
      const cupsCounts: Record<string, Record<string, number>> = {};
      
      allBillsFlat.forEach(bill => {
        if (!bill.cups) return;
        if (!cupsCounts[bill.cups]) cupsCounts[bill.cups] = {};
        // Find which project this bill *currently* is in to count it
        const currentPid = Object.entries(prev).find(([pid, bills]) => bills.some(b => b.id === bill.id))?.[0];
        if (currentPid) {
          cupsCounts[bill.cups][currentPid] = (cupsCounts[bill.cups][currentPid] || 0) + 1;
        }
      });
      
      Object.entries(cupsCounts).forEach(([cups, counts]) => {
        const winner = Object.entries(counts).sort((a,b) => b[1] - a[1])[0][0];
        cupsToProjectMap[cups] = winner;
      });
      
      // Redistribute
      allBillsFlat.forEach(bill => {
        let targetId = bill.projectId;
        if (bill.cups && cupsToProjectMap[bill.cups]) {
          targetId = cupsToProjectMap[bill.cups];
        } else {
          // If no CUPS or no map, keep in current project
          targetId = Object.entries(prev).find(([pid, bills]) => bills.some(b => b.id === bill.id))?.[0] || 'default';
        }
        
        if (!next[targetId]) next[targetId] = [];
        if (!next[targetId].some(b => b.id === bill.id)) {
          next[targetId].push({ ...bill, projectId: targetId });
        }
      });
      
      // Sort each project results
      Object.keys(next).forEach(pid => {
        next[pid].sort((a, b) => {
          const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
          const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
          if (am.year !== bm.year) return am.year - bm.year;
          return am.month - bm.month;
        });
        saveToDisk(next[pid], allCustomOCs[pid] || {}, pid);
      });
      
      toast.success('Reparación completada. Facturas redistribuidas por CUPS.');
      return next;
    });
  };

  const handleExport = () => {
    // Export with correction format (re-importable)
    exportBillsToCorrectionExcel(bills, customOCs);
  };

  // Excel Correction Handlers
  const handleCorrectionFileSelect = (file: File) => {
    setCorrectionFile(file);
    setIsProcessingCorrection(true);
    
    parseCorrectionExcel(file)
      .then(({ rows, billIds }) => {
        const result = detectCorrectionChanges(rows, bills, customOCs);
        setCorrectionResult(result);
        setIsProcessingCorrection(false);
        setShowCorrectionModal(true);
      })
      .catch(err => {
        toast.error('Error al procesar Excel: ' + err.message);
        setIsProcessingCorrection(false);
        setCorrectionFile(null);
      });
  };

  const handleApplyCorrections = async () => {
    if (!correctionResult || correctionResult.totalChanges === 0) {
      toast.warning('No hay cambios para aplicar');
      return;
    }

    const { updatedBills, updatedCustomOCs, appliedChanges, skippedChanges } = applyCorrectionChanges(
      bills, 
      customOCs, 
      correctionResult.changes
    );

    // Update state
    setAllBills(prev => ({
      ...prev,
      [currentProjectId]: updatedBills
    }));
    setAllCustomOCs(prev => ({
      ...prev,
      [currentProjectId]: updatedCustomOCs
    }));

    // Persist to Supabase
    saveToDisk(updatedBills, updatedCustomOCs, currentProjectId);

    // Persist audit logs to Supabase
    if (appliedChanges.length > 0) {
      const auditEntries = appliedChanges.map(change => ({
        bill_id: change.billId,
        project_id: currentProjectId,
        field_changed: change.conceptKey,
        old_value: String(change.oldValue),
        new_value: String(change.newValue),
        change_source: 'excel_import' as const,
        change_reason: `Corrección desde Excel: ${change.conceptName}`
      }));
      
      await saveAuditLog(auditEntries);
    }

    // Build message
    let message = '';
    if (appliedChanges.length > 0) {
      message += `${appliedChanges.length} cambio${appliedChanges.length > 1 ? 's' : ''} aplicado${appliedChanges.length > 1 ? 's' : ''}`;
    }
    if (skippedChanges.length > 0) {
      if (message) message += ', ';
      message += `${skippedChanges.length} campo${skippedChanges.length > 1 ? 's' : ''} solo lectura omitido${skippedChanges.length > 1 ? 's' : ''}`;
    }

    toast.success(message || 'Sin cambios por aplicar');
    
    // Close modal
    setShowCorrectionModal(false);
    setCorrectionFile(null);
    setCorrectionResult(null);
  };

  const handleCancelCorrections = () => {
    setShowCorrectionModal(false);
    setCorrectionFile(null);
    setCorrectionResult(null);
  };

  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} error={authError} />;

  if (showReport) {
    const reportBills = bills.filter(b => b.includeInReport !== false);
    const reportCustomOCs: Record<string, { concepto: string; total: number }[]> = {};
    reportBills.forEach(b => {
      if (customOCs[b.id]) {
        reportCustomOCs[b.id] = customOCs[b.id];
      }
    });
    
    // Check if we have gas bills
    const hasGasBills = reportBills.some(b => isGasBill(b));
    const hasElectricityBills = reportBills.some(b => !isGasBill(b));
    
    // Separate bills by type
    const electricityBills = reportBills.filter(b => !isGasBill(b));
    const gasOnlyBills = reportBills.filter(b => isGasBill(b));
    
    const projectName = savedProjects.find(p => p.id === currentProjectId)?.name || 'PROYECTO';
    
    return (
      <div className="fixed inset-0 z-[60] bg-[#020617] overflow-hidden">
        {/* Gas-only report */}
        {hasGasBills && !hasElectricityBills && (
          <GasReportView
            bills={gasOnlyBills}
            onBack={() => setShowReport(false)}
            projectName={projectName}
            projectId={currentProjectId}
          />
        )}
        
        {/* Electricity-only or mixed report */}
        {hasElectricityBills && (
          <ReportView 
            bills={electricityBills} 
            customOCs={reportCustomOCs} 
            onBack={() => setShowReport(false)} 
            projectName={projectName}
            projectId={currentProjectId}
            onPreviewBill={(id) => setPreviewBillId(id)}
          />
        )}
        
        {/* Show gas bills summary if mixed */}
        {hasGasBills && hasElectricityBills && (
          <div className="fixed bottom-4 right-4 z-[70] glass p-4 rounded-2xl border border-orange-500/30 bg-[#020617]/90">
            <p className="text-xs font-bold text-orange-400">📄 {gasOnlyBills.length} factura{gasOnlyBills.length !== 1 ? 's' : ''} de gas detected{gasOnlyBills.length !== 1 ? 'as' : ''}</p>
            <p className="text-[10px] text-slate-500 mt-1">Ver Informe de Gas pendiente</p>
          </div>
        )}
        
        {/* MODAL PREVIEW FACTURA ORIGINAL */}
        <AnimatePresence>
          {previewBillId && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-md p-8 sm:p-12" onClick={() => setPreviewBillId(null)}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full h-full max-w-6xl bg-[#0a0f1d] rounded-[48px] overflow-hidden border border-white/10 relative shadow-2xl flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <div className="h-20 border-b border-white/5 bg-slate-900/50 backdrop-blur-xl flex items-center justify-between px-10 shrink-0">
                  <div>
                    <h3 className="text-white font-black tracking-tighter italic uppercase">Vista Previa · Factura Original</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                      {bills.find(b => b.id === previewBillId)?.fileName}
                    </p>
                  </div>
                  <button onClick={() => setPreviewBillId(null)} className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all hover:scale-105">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex-1 bg-black/40 overflow-hidden">
                  {(() => {
                    const bill = bills.find(b => b.id === previewBillId);
                    if (!bill || !bill.originalFileBase64) return (
                      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                        <FileText className="w-12 h-12 opacity-20" />
                        <p className="text-sm font-medium">Documento no disponible (solo disponible para facturas subidas en esta sesión o migradas con persistencia)</p>
                      </div>
                    );
                    return (
                      <iframe 
                        src={bill.originalFileBase64} 
                        className="w-full h-full border-none" 
                        title="Invoice Preview"
                      />
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }



  // Excel Correction Modal
  const CorrectionModal = () => (
    <AnimatePresence>
      {showCorrectionModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="glass-card border border-white/20 rounded-3xl p-8 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Correcciones desde Excel</h3>
                  <p className="text-xs text-slate-400">{correctionFile?.name}</p>
                </div>
              </div>
              <button onClick={handleCancelCorrections} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {isProcessingCorrection ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader className="w-8 h-8 text-blue-400 animate-spin mb-4" />
                <p className="text-sm text-slate-400">Analizando cambios...</p>
              </div>
            ) : correctionResult ? (
              <div className="flex-1 overflow-y-auto">
                {correctionResult.totalChanges === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <CheckCircle className="w-12 h-12 text-emerald-400 mb-4" />
                    <p className="text-white font-bold">No se detectaron cambios</p>
                    <p className="text-sm text-slate-400 mt-2">El archivo Excel coincide con los datos actuales</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                      <AlertCircle className="w-5 h-5 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">
                        {correctionResult.totalChanges} cambio{correctionResult.totalChanges > 1 ? 's' : ''} detectado{correctionResult.totalChanges > 1 ? 's' : ''}
                      </span>
                      <span className="text-slate-400 text-sm">
                        en {correctionResult.affectedBills.length} factura{correctionResult.affectedBills.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {formatChangesForDisplay(correctionResult.changes).map((line, idx) => (
                        <div 
                          key={idx} 
                          className={`text-sm font-mono px-3 py-2 rounded-lg ${
                            line.startsWith('Bill:') 
                              ? 'bg-white/5 text-blue-400 font-bold' 
                              : 'text-slate-300'
                          }`}
                        >
                          {line}
                        </div>
                      ))}
                    </div>

                    {correctionResult.errors.length > 0 && (
                      <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <p className="text-amber-400 text-xs font-bold mb-2">Advertencias:</p>
                        {correctionResult.errors.map((err, idx) => (
                          <p key={idx} className="text-amber-300 text-xs">{err}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {correctionResult && correctionResult.totalChanges > 0 && (
              <div className="flex gap-3 pt-6 mt-4 border-t border-white/10">
                <button
                  onClick={handleCancelCorrections}
                  className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-colors font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleApplyCorrections}
                  className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" /> Aplicar Cambios
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Excel Correction Dropzone (accepts only .xlsx files)
  const CorrectionDropzone = ({ onFile }: { onFile: (file: File) => void }) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      accept: {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/vnd.ms-excel': ['.xls']
      },
      multiple: false,
      onDrop: (acceptedFiles) => {
        if (acceptedFiles.length > 0) {
          onFile(acceptedFiles[0]);
        }
      }
    });

    return (
      <div
        {...getRootProps()}
        className={`p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
          isDragActive 
            ? 'border-emerald-500 bg-emerald-500/10' 
            : 'border-white/10 hover:border-emerald-500/50 hover:bg-white/5'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center gap-3">
          <FileSpreadsheet className={`w-5 h-5 ${isDragActive ? 'text-emerald-400' : 'text-slate-500'}`} />
          <div>
            <p className="text-sm text-slate-400">
              {isDragActive ? 'Suelta el archivo de correcciones' : 'Arrastra Excel de correcciones'}
            </p>
            <p className="text-[10px] text-slate-500">.xlsx, .xls</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden font-inter text-slate-100 selection:bg-blue-500/30">
      
      {/* SIDEBAR - HIGH END DARK */}
      <aside className="w-80 bg-black flex flex-col border-r border-white/5 z-30 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[300px] bg-blue-600/5 blur-[100px] pointer-events-none" />
        
        <div className="px-8 pt-10 pb-6 flex flex-col gap-8 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl font-black tracking-tighter italic text-white flex items-center gap-2">VOLTIS</h2>
              <span className="text-[10px] font-bold text-blue-400 tracking-[0.2em] uppercase opacity-60">Anual Economics</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                <Layers className="w-3 h-3" /> Organización
              </h3>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => { setShowNewFolderModal(true); setNewFolderName(''); }}
                  className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg transition-all"
                  title="Nueva Carpeta"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => { setShowNewProjectModal(true); setNewProjectName(''); }}
                  className="p-1.5 hover:bg-white/5 text-blue-500 rounded-lg transition-all"
                  title="Nuevo Proyecto"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-4 overflow-y-auto max-h-[65vh] pr-2 custom-scrollbar">
              {/* FOLDERS SECTION */}
              {folders.sort((a,b) => b.updatedAt - a.updatedAt).map(folder => {
                const folderProjects = savedProjects.filter(p => p.folderId === folder.id);
                const isExpanded = activeFolderId === folder.id;
                
                return (
                  <div key={folder.id} className="flex flex-col gap-1">
                    <div 
                      onClick={() => setActiveFolderId(isExpanded ? null : folder.id)}
                      className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                        isExpanded ? 'bg-white/5 border-white/10' : 'bg-transparent border-transparent hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FolderOpen className={`w-4 h-4 ${isExpanded ? 'text-blue-400' : 'text-slate-500'}`} />
                        {renamingFolderId === folder.id ? (
                          <input
                            autoFocus
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') renameFolder(folder.id, newFolderName);
                              if (e.key === 'Escape') setRenamingFolderId(null);
                            }}
                            onBlur={() => renameFolder(folder.id, newFolderName)}
                            className="bg-transparent border-b border-blue-500 text-blue-300 font-bold text-[11px] uppercase focus:outline-none"
                          />
                        ) : (
                          <span className={`font-bold truncate text-[11px] uppercase tracking-wider ${isExpanded ? 'text-white' : 'text-slate-500'}`}>
                            {folder.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setRenamingFolderId(folder.id); setNewFolderName(folder.name); }}
                          className="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded-lg"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                          className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="flex flex-col gap-1 ml-4 pl-3 border-l border-white/5 mt-1">
                        {folderProjects.length === 0 ? (
                          <span className="text-[10px] text-slate-600 italic py-2">Sin proyectos</span>
                        ) : (
                          folderProjects.map(proj => (
                            <ProjectItem 
                              key={proj.id} 
                              proj={proj} 
                              isActive={proj.id === currentProjectId} 
                              onLoad={() => loadWorkspace(proj)}
                              onRename={() => { setRenamingProjectId(proj.id); setRenameValue(proj.name); }}
                              onDelete={(e: React.MouseEvent) => deleteProject(proj.id, e)}
                              onMove={(fid: string | null) => moveProjectToFolder(proj.id, fid)}
                              folders={folders}
                            />
                          ))
                        )}
                        <button 
                          onClick={() => { setShowNewProjectModal(true); setNewProjectName(''); }}
                          className="flex items-center gap-2 p-2 rounded-lg text-blue-500/60 hover:text-blue-400 hover:bg-blue-500/5 transition-all text-[10px] font-bold uppercase tracking-wider mt-1"
                        >
                          <Plus className="w-3 h-3" /> Nuevo Proyecto
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* PROJECTS WITHOUT FOLDER */}
              <div className="mt-4 flex flex-col gap-2">
                <h4 className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] pl-1">Sin Carpeta</h4>
                {savedProjects.filter(p => !p.folderId).sort((a,b) => b.updatedAt - a.updatedAt).map(proj => (
                  <ProjectItem 
                    key={proj.id} 
                    proj={proj} 
                    isActive={proj.id === currentProjectId} 
                    onLoad={() => loadWorkspace(proj)}
                    onRename={() => { setRenamingProjectId(proj.id); setRenameValue(proj.name); }}
                    onDelete={(e: React.MouseEvent) => deleteProject(proj.id, e)}
                    onMove={(fid: string | null) => moveProjectToFolder(proj.id, fid)}
                    folders={folders}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

          <div className="mt-auto px-8 pb-10 flex flex-col gap-4 relative z-10">
            <button 
              onClick={() => { setShowDiag(true); runDiagnostic(); }}
              className="glass p-3 rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-slate-500 group-hover:text-blue-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sistema</span>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full ${cloudSyncStatus === 'synced' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            </button>
            <div className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between group relative">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex flex-col overflow-hidden max-w-[120px]">
                    <span className="text-xs font-bold text-white uppercase tracking-tight truncate">COMERCIAL</span>
                    <span className="text-[10px] text-slate-500 tracking-wider truncate">Plan Expert</span>
                  </div>
                </div>
                <button 
                  onClick={() => handleLogout()}
                  className="p-2 hover:bg-red-500/10 text-slate-600 hover:text-red-400 rounded-lg transition-all"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
             </div>
          </div>
      </aside>

      {/* MAIN CONTENT CANVAS */}
      <main className="flex-1 relative overflow-y-auto overflow-x-hidden flex flex-col scroll-smooth">
        
        {/* Animated Background Highlights */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

        {false ? (
          <div className="p-20 text-center opacity-50 underline decoration-blue-500 cursor-pointer" onClick={() => setShowReport(false)}>
            Cargando informe...
          </div>
        ) : (
          <div className="px-8 md:px-16 py-12 flex flex-col gap-10 max-w-7xl mx-auto w-full relative z-10">
            
            <header className="flex flex-col md:flex-row items-end justify-between gap-8">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 mb-2">
                   <div className={`w-2 h-2 rounded-full ${
                    cloudSyncStatus === 'synced' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                    cloudSyncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' :
                    cloudSyncStatus === 'error' ? 'bg-red-500' : 'bg-slate-500'
                  }`} />
                  <span className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">
                    {cloudSyncStatus === 'synced' ? 'Cloud Synced' :
                     cloudSyncStatus === 'syncing' ? 'Syncing...' :
                     cloudSyncStatus === 'error' ? 'Cloud Error' : 
                     cloudSyncStatus === 'local' ? 'Datos Locales' : 'Offline Mode'}
                  </span>
                  {cloudSyncStatus === 'local' && (
                    <button 
                      onClick={handleManualSync}
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-black text-blue-400 hover:bg-blue-500/20 transition-all uppercase animate-pulse"
                      title="Sincronizar datos locales con la nube ahora"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      Sincronizar ahora
                    </button>
                  )}
                </div>
                <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-blue-500 leading-none py-2">
                  VOLTIS ANUAL <br/> ECONOMICS
                </h1>
                <div className="flex items-center gap-3">
                   <div className="h-1 w-12 bg-blue-500 rounded-full" />
                   <span className="text-sm font-bold text-blue-400 tracking-[0.3em] uppercase opacity-80 flex items-center gap-3">
                     {savedProjects.find(p => p.id === currentProjectId)?.name}
                     <button 
                       onClick={clearProjectBills}
                       className="p-1 hover:bg-white/10 rounded-md transition-colors text-slate-500 hover:text-red-400"
                       title="Vaciar todas las facturas de este proyecto"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </span>
                </div>
              </div>

              <div className="flex items-center gap-4 no-print">
                <button 
                  onClick={() => { 
                    console.log('[DEBUG-REPORT-BTN] Clicked report button'); 
                    console.log('[DEBUG-STATE] showNewProjectModal before:', showNewProjectModal); 
                    console.log('[DEBUG-STATE] showReport before:', showReport); 
                    setShowReport(true); 
                    console.log('[DEBUG-STATE] showReport after setShowReport(true)'); 
                  }}
                  disabled={bills.length === 0}
                  className="group relative px-8 py-4 bg-white text-black font-black text-xs uppercase tracking-widest rounded-full hover:scale-105 transition-all disabled:opacity-20 flex items-center gap-3 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-10 transition-opacity" />
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  Informe Visual IA
                </button>
                <button 
                  onClick={handleExport}
                  disabled={bills.length === 0}
                  className="px-8 py-4 bg-slate-900 border border-white/10 text-white font-black text-xs uppercase tracking-widest rounded-full hover:bg-slate-800 transition-all disabled:opacity-20 flex items-center gap-3"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  Exportar Excel
                </button>
                <label 
                  className="px-6 py-4 bg-emerald-900/30 border border-emerald-500/20 text-emerald-400 font-black text-xs uppercase tracking-widest rounded-full hover:bg-emerald-900/50 transition-all disabled:opacity-20 flex items-center gap-2 cursor-pointer"
                  title="Subir correcciones desde Excel"
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCorrectionFileSelect(file);
                      e.target.value = '';
                    }}
                    disabled={bills.length === 0}
                  />
                  <FileSpreadsheet className="w-4 h-4" />
                  Importar Correcciones
                </label>
              </div>
            </header>

            {/* FUTURISTIC SCANNER DROPZONE */}
            <div 
              {...getRootProps()} 
              className={`
                relative group cursor-pointer transition-all duration-500
                ${isDragActive ? 'scale-[1.02]' : 'hover:scale-[1.01]'}
              `}
            >
              <input {...getInputProps()} />
              <div className={`
                glass-card p-14 rounded-[40px] border text-center flex flex-col items-center gap-6 overflow-hidden
                ${isDragActive ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/5 hover:border-white/10'}
              `}>
                {isDragActive && (
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent animate-scan pointer-events-none" />
                )}
                <div className="w-20 h-20 rounded-3xl bg-blue-600/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500 mb-2">
                   {isExtracting ? (
                     <Loader className="w-10 h-10 text-blue-400 animate-spin" />
                   ) : (
                     <Upload className={`w-10 h-10 transition-colors ${isDragActive ? 'text-blue-400' : 'text-slate-400'}`} />
                   )}
                </div>
                <div className="flex flex-col gap-2">
                   <h3 className="text-xl font-black text-white tracking-tight">ARRASTRA TUS FACTURAS</h3>
                   <p className="text-slate-500 text-sm font-medium tracking-wide">Compatible con PDF y Excel sincronizado</p>
                </div>
              </div>
            </div>
            
            {/* EXTRACTION QUEUE UI */}
            <AnimatePresence>
              {extractionQueue.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between">
                     <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Cola de Procesamiento
                     </h3>
                     <button 
                      onClick={() => {
                        setAllExtractionQueues(prev => ({ ...prev, [currentProjectId]: [] }));
                      }}
                      className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                     >
                       Limpiar Cola
                     </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {extractionQueue.map((item) => (
                      <motion.div 
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`glass p-4 rounded-2xl border flex items-center justify-between transition-all ${
                          item.status === 'loading' ? 'border-blue-500/20 bg-blue-500/5' :
                          item.status === 'success' ? 'border-emerald-500/20 bg-emerald-500/5' :
                          'border-red-500/20 bg-red-500/5'
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={`p-2 rounded-lg ${
                            item.status === 'loading' ? 'bg-blue-500/10 text-blue-400' :
                            item.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                            'bg-red-500/10 text-red-400'
                          }`}>
                            {item.status === 'loading' ? <Loader className="w-4 h-4 animate-spin" /> :
                             item.status === 'success' ? <CheckCircle className="w-4 h-4" /> :
                             <X className="w-4 h-4" />}
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-xs font-bold text-white truncate">{item.fileName}</span>
                            {item.error && <span className="text-[10px] text-red-400 font-medium truncate">{item.error}</span>}
                            {item.status === 'success' && <span className="text-[10px] text-emerald-400 font-medium">Extraída correctamente</span>}
                            {item.status === 'loading' && <span className="text-[10px] text-blue-400 font-medium animate-pulse">Analizando con Voltis AI...</span>}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {item.status === 'error' && fileRefs[item.id] && (
                            <button 
                              onClick={() => {
                                setAllExtractionQueues(prev => ({
                                  ...prev,
                                  [currentProjectId]: (prev[currentProjectId] || []).map(q => 
                                    q.id === item.id ? { ...q, status: 'loading' as const, error: undefined } : q
                                  )
                                }));
                                processFile(fileRefs[item.id], item.id, currentProjectId);
                              }}
                              className="px-3 py-1 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-lg border border-blue-500/30 hover:bg-blue-600/40 transition-all uppercase tracking-tighter"
                            >
                              Reintentar
                            </button>
                          )}
                          {item.status !== 'loading' && (
                            <button 
                              onClick={() => {
                                if (item.status === 'success') {
                                  const linked = bills.find(b => b.fileName === item.fileName);
                                  if (linked) { 
                                    const nb = bills.filter(b => b.id !== linked.id); 
                                    setAllBills(prev => ({ ...prev, [currentProjectId]: nb }));
                                    saveToDisk(nb, customOCs, currentProjectId); 
                                  }
                                }
                                setAllExtractionQueues(prev => ({
                                  ...prev,
                                  [currentProjectId]: (prev[currentProjectId] || []).filter(q => q.id !== item.id)
                                }));
                              }}
                              className="p-1 hover:bg-white/10 rounded-md text-slate-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {bills.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-6 mb-20"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-6">
                     <h2 className="text-2xl font-black tracking-tight flex items-center gap-4">
                       DATOS EXTRAÍDOS <span className="bg-white/5 text-blue-400 text-sm px-4 py-1 rounded-full">{bills.length}</span>
                     </h2>
                     <div className="text-[10px] items-center gap-6 text-slate-500 font-bold tracking-widest hidden md:flex">
                        <span className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-emerald-500" /> AI VERIFIED</span>
                        <span className="flex items-center gap-2"><Smartphone className="w-3 h-3 text-blue-500" /> MOBILE SYNC</span>
                     </div>
                  </div>

                  <div className="glass-card rounded-[40px] border border-white/5 overflow-hidden shadow-3xl">
                    <FileTable 
                      bills={bills} 
                      onUpdateBills={handleUpdateBills} 
                      onUpdateOCs={handleUpdateOCs}
                      customOCs={customOCs}
                      onRefine={(bill) => {
                        setRefiningBill(bill);
                        setRefineInstruction('');
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}
      </main>

      {/* DIAGNOSTIC MODAL */}
      <AnimatePresence>
        {showDiag && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-card w-full max-w-lg rounded-[40px] p-10 border border-white/10 shadow-3xl text-white relative"
            >
              <button onClick={() => setShowDiag(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white">
                <X className="w-6 h-6" />
              </button>

              <div className="flex flex-col gap-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-2xl">
                    <Settings className="w-8 h-8 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tighter italic">DIAGNÓSTICO DE SISTEMAS</h2>
                    <p className="text-xs font-bold text-blue-400 tracking-widest uppercase opacity-60">Auditoría Técnica en Vivo</p>
                  </div>
                </div>

                {isCheckingDiag ? (
                  <div className="flex flex-col items-center gap-4 py-12">
                     <Loader className="w-10 h-10 text-blue-500 animate-spin" />
                     <span className="text-xs font-black tracking-widest">ANALIZANDO CONEXIONES...</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    {/* ENTORNO */}
                    <div className="flex flex-col gap-3">
                       <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Llaves de API (Variables Vercel)</h3>
                       <div className="grid grid-cols-2 gap-4">
                          <StatusItem label="Groq AI" status={diagInfo?.env?.has_groq_key} />
                          <StatusItem label="Supabase URL" status={diagInfo?.env?.has_supabase_url} />
                          <StatusItem label="Supabase Key" status={diagInfo?.env?.has_supabase_key} />
                          <StatusItem label="Gemini AI" status={diagInfo?.env?.has_gemini_key} />
                          <StatusItem label="DATABASE" status={diagInfo?.db_connected || false} />
                       </div>
                    </div>

                    <button
                      onClick={repairProjects}
                      className="w-full mt-2 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Zap className="w-4 h-4" /> Reparar Integridad de Proyectos
                    </button>

                    {/* BASE DE DATOS */}
                    <div className="flex flex-col gap-3 mt-4">
                       <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Base de Datos (Supabase)</h3>
                       <div className={`p-4 rounded-2xl border ${diagInfo?.database?.status === 'connected' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-[12px] font-bold">Estado del Enlace Cloud</span>
                             <span className={`text-[10px] font-black px-3 py-1 rounded-full ${diagInfo?.database?.status === 'connected' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                {diagInfo?.database?.status?.toUpperCase() || 'DESCONECTADO'}
                             </span>
                          </div>
                          {diagInfo?.database?.error && (
                            <p className="text-[10px] text-red-300 font-mono bg-red-950/30 p-2 rounded-lg mt-2 break-all">
                               {diagInfo.database.error}
                            </p>
                          )}
                          <p className="text-[10px] opacity-40 mt-2">
                             Este indicador verifica si la app puede leer/escribir proyectos en la nube.
                          </p>
                       </div>
                    </div>
                    
                    <button 
                      onClick={runDiagnostic}
                      className="w-full py-4 bg-white text-black font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" /> Re-Scanear
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NEW PROJECT MODAL */}
      <AnimatePresence>
        {showNewProjectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl no-print"
            onClick={() => setShowNewProjectModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card border border-white/10 rounded-[40px] w-full max-w-md p-10 flex flex-col gap-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight text-white">Nuevo Proyecto</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Introduce un nombre identificador</p>
                </div>
              </div>

              <input
                autoFocus
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createNewProject(newProjectName);
                  if (e.key === 'Escape') setShowNewProjectModal(false);
                }}
                placeholder="Ej: AOIZ, PAMPLONA..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold text-sm placeholder:normal-case placeholder:font-normal placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewProjectModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/10 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => createNewProject(newProjectName)}
                  disabled={!newProjectName.trim()}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Crear
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BILL PREVIEW MODAL */}
      <AnimatePresence>
        {previewBillId && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-8 bg-black/95 backdrop-blur-xl no-print" onClick={() => setPreviewBillId(null)}>
            <div className="absolute top-0 left-0 w-full h-[300px] bg-blue-600/10 blur-[120px] pointer-events-none" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0f172a] border border-white/10 rounded-[48px] w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl relative z-10"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-10 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-white">
                      {bills.find(b => b.id === previewBillId)?.fileName}
                    </h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Audit Control • Original Document</p>
                  </div>
                </div>
                <button onClick={() => setPreviewBillId(null)} className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 bg-black/40 p-6 overflow-hidden">
                {fileRefs[previewBillId] ? (
                  <iframe 
                    src={URL.createObjectURL(fileRefs[previewBillId])} 
                    className="w-full h-full rounded-2xl border-none"
                    title="Bill Preview"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-6 text-slate-500 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.02]">
                    <AlertTriangle className="w-16 h-16 text-amber-500/50" />
                    <div className="text-center space-y-2">
                      <p className="text-xl font-black text-white uppercase tracking-tight">Archivo no disponible</p>
                      <p className="text-sm font-medium text-slate-500 max-w-xs mx-auto">El archivo original solo está disponible en la sesión en la que se subió.</p>
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-blue-400/50 font-black">Precisión Voltis IA</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REFINE WITH AI MODAL */}
      <AnimatePresence>
        {refiningBill && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-card w-full max-w-lg rounded-[40px] p-10 border border-white/10 shadow-3xl text-white relative"
            >
              <button onClick={() => setRefiningBill(null)} className="absolute top-8 right-8 text-slate-500 hover:text-white">
                <X className="w-6 h-6" />
              </button>

              <div className="flex flex-col gap-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-2xl">
                    <Sparkles className="w-8 h-8 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tighter italic">REFINAR CON INTELIGENCIA</h2>
                    <p className="text-xs font-bold text-blue-400 tracking-widest uppercase opacity-60">Instrucciones de Corrección</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <p className="text-sm text-slate-400 font-medium leading-relaxed">
                    Indica qué datos faltan o deben corregirse en la factura <span className="text-white font-bold">{refiningBill.fileName}</span>.
                  </p>
                  
                  <textarea
                    autoFocus
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder="Ej: 'Extrae el exceso de potencia de P4, P5 y P6 que falta' o 'El total no coincide, busca el bono social'..."
                    className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-5 text-white font-medium text-sm focus:outline-none focus:border-blue-500/50 transition-all resize-none"
                  />
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => setRefiningBill(null)}
                    disabled={isRefining}
                    className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleRefine}
                    disabled={isRefining || !refineInstruction.trim()}
                    className="flex-[2] py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] flex items-center justify-center gap-2"
                  >
                    {isRefining ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isRefining ? 'PROCESANDO...' : 'REFINAR EXTRACCIÓN'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Excel Correction Modal */}
      <CorrectionModal />

      {/* NEW PROJECT MODAL */}
      <AnimatePresence>
        {showNewProjectModal && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-card w-full max-w-md rounded-[32px] p-8 border border-white/10 shadow-3xl text-white relative"
            >
              <button onClick={() => setShowNewProjectModal(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight italic">NUEVO PROYECTO</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Crear espacio de trabajo</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nombre del Proyecto</label>
                  <input
                    autoFocus
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createNewProject(newProjectName)}
                    placeholder="CLIENTE - SEDE - AÑO..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-bold uppercase tracking-wider text-sm focus:outline-none focus:border-blue-500/50 transition-all"
                  />
                  {activeFolderId && (
                    <div className="flex items-center gap-2 mt-1 ml-1">
                      <FolderOpen className="w-3 h-3 text-blue-400" />
                      <span className="text-[10px] text-blue-400/60 font-medium">Se creará dentro de: <span className="font-bold">{folders.find(f => f.id === activeFolderId)?.name}</span></span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => createNewProject(newProjectName)}
                  disabled={!newProjectName.trim()}
                  className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20"
                >
                  CREAR PROYECTO
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NEW FOLDER MODAL */}
      <AnimatePresence>
        {showNewFolderModal && (
          <div className="fixed inset-0 z-[510] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-card w-full max-w-md rounded-[32px] p-8 border border-white/10 shadow-3xl text-white relative"
            >
              <button onClick={() => setShowNewFolderModal(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-500/10 rounded-xl text-orange-400">
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight italic">NUEVA CARPETA</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Organizar proyectos</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nombre de la Carpeta</label>
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createFolder(newFolderName)}
                    placeholder="CLIENTE GRUPO..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-bold uppercase tracking-wider text-sm focus:outline-none focus:border-orange-500/50 transition-all"
                  />
                </div>

                <button
                  onClick={() => createFolder(newFolderName)}
                  disabled={!newFolderName.trim()}
                  className="w-full py-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-orange-900/20"
                >
                  CREAR CARPETA
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.2); }
      `}</style>
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

const ProjectItem = ({ proj, isActive, onLoad, onRename, onDelete, onMove, folders }: any) => {
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  return (
    <div className="relative">
      <motion.div 
        whileHover={{ x: 2 }}
        onClick={onLoad}
        className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
          isActive 
            ? 'bg-blue-600/10 border-blue-500/30 text-white' 
            : 'bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
        }`}
      >
        <div className="flex flex-col gap-0.5 overflow-hidden flex-1 min-w-0">
          <span className={`font-bold truncate text-[10px] uppercase tracking-wider ${isActive ? 'text-blue-400' : ''}`}>{proj.name}</span>
          <span className="text-[9px] opacity-40 font-medium tracking-tight">{(proj.bills || []).length} Facturas</span>
        </div>
        
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); setShowMoveMenu(!showMoveMenu); }}
            className={`p-1.5 rounded-lg transition-colors ${showMoveMenu ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-slate-500 hover:text-white'}`}
            title="Mover a carpeta"
          >
            <Layers className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(e); }} className="p-1.5 hover:bg-red-500/20 text-red-500/60 hover:text-red-500 rounded-lg">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </motion.div>

      {showMoveMenu && (
        <div 
          className="absolute left-full ml-2 top-0 z-50 w-48 glass-card border border-white/10 rounded-xl p-2 shadow-2xl"
          onMouseLeave={() => setShowMoveMenu(false)}
        >
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-2 py-1 border-b border-white/5 mb-1">Mover a...</p>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto custom-scrollbar">
            <button 
              onClick={(e) => { e.stopPropagation(); onMove(null); setShowMoveMenu(false); }}
              className={`text-left px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-colors ${!proj.folderId ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:bg-white/5'}`}
            >
              Sin Carpeta
            </button>
            {folders.map((f: any) => (
              <button 
                key={f.id}
                onClick={(e) => { e.stopPropagation(); onMove(f.id); setShowMoveMenu(false); }}
                className={`text-left px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-colors ${proj.folderId === f.id ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:bg-white/5'}`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function EnergyBillsApp() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const loggedIn = localStorage.getItem('voltis_logged_in') === 'true';
    if (loggedIn) setIsAuthenticated(true);
    setIsAuthLoading(false);
  }, []);

  if (isAuthLoading) {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center">
        <Loader className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  const handleLogin = (password: string) => {
    if (password.toLowerCase() === 'voltis2026') {
      setIsAuthenticated(true);
      setAuthError(null);
      localStorage.setItem('voltis_logged_in', 'true');
      toast.success('Acceso concedido');
    } else {
      setAuthError('Contraseña incorrecta');
      toast.error('Acceso denegado');
    }
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} error={authError} />;
  }

  return <EnergyBillsAppContent />;
}

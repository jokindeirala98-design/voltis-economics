"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, Upload, Trash2, Download, AlertTriangle, 
  CheckCircle, Plus, FolderOpen, Edit2, 
  BarChart3, LayoutDashboard, Settings, LogOut,
  ChevronRight, Sparkles, Zap, Smartphone, Layers, X, Search,
  Loader, FileSpreadsheet, Check, AlertCircle, RefreshCw, Package
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
import { MobileUploadButton } from '@/components/MobileUploadButton';
import PoolUpload from '@/components/PoolUpload';
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
import { useFolderExport } from '@/hooks/useFolderExport';
import { uploadOriginalDocument, generateFileHash, getDocumentForPreview } from '@/lib/storage';
import DocumentViewer from '@/components/DocumentViewer';

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
  const [activeReportTab, setActiveReportTab] = useState<'electricity' | 'gas'>('electricity');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectFolderId, setNewProjectFolderId] = useState<string | null>(null); // Track target folder for new project
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set()); // Track expanded folders
  
  // Reset activeReportTab when opening a new report or switching projects
  useEffect(() => {
    if (showReport) {
      const projectBills = allBills[currentProjectId] || [];
      const hasGas = projectBills.some(b => isGasBill(b));
      const hasElec = projectBills.some(b => !isGasBill(b));
      
      if (hasGas && !hasElec) {
        setActiveReportTab('gas');
      } else {
        setActiveReportTab('electricity');
      }
    }
  }, [showReport, currentProjectId, allBills]);
  
  const [fileRefs, setFileRefs] = useState<Record<string, File>>({}); 
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'local'>('local');
  const [showDiag, setShowDiag] = useState(false);
  const [diagInfo, setDiagInfo] = useState<any>(null);
  const [isCheckingDiag, setIsCheckingDiag] = useState(false);
  const [previewBillId, setPreviewBillId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewType, setPreviewType] = useState<'pdf' | 'image'>('pdf');
  const [refiningBill, setRefiningBill] = useState<ExtractedBill | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fileBase64Refs, setFileBase64Refs] = useState<Record<string, { data: string, type: string }>>({});
  
  // Excel Correction State
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionFile, setCorrectionFile] = useState<File | null>(null);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResult | null>(null);
  const [isProcessingCorrection, setIsProcessingCorrection] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [showPool, setShowPool] = useState(false);
  const [activeSidebarWidth, setActiveSidebarWidth] = useState(320);

  // Scroll lock when any modal is open
  useEffect(() => {
    const anyModalOpen = showNewProjectModal || showNewFolderModal || previewBillId || refiningBill || showCorrectionModal || showDiag || showReport || showPool;
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showNewProjectModal, showNewFolderModal, previewBillId, refiningBill, showCorrectionModal, showDiag, showReport, showPool]);

  // Sync search input with current project name
  useEffect(() => {
    const currentProject = savedProjects.find(p => p.id === currentProjectId);
    if (currentProject && !isSearchActive) {
      setSearchQuery(currentProject.name);
    }
  }, [currentProjectId, savedProjects, isSearchActive]);



  const { progress: exportProgress, downloadFolderZIP } = useFolderExport();

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
      return (a.fileName || '').localeCompare(b.fileName || '');
    });
  }, [allBills, currentProjectId]);

  const allBillsFlat = useMemo(() => Object.values(allBills).flat(), [allBills]);

  // Load preview document
  useEffect(() => {
    const loadPreview = async () => {
      console.log(`[PREVIEW_DEBUG][EFFECT] loadPreview trigger for billId: ${previewBillId || 'NULL'}`);
      
      if (!previewBillId) {
        setPreviewUrl(null);
        setPreviewError(null);
        return;
      }

      setIsPreviewLoading(true);
      setPreviewError(null);
      
      try {
        // 1. Check in-memory session Refs first (fastest)
        if (fileRefs[previewBillId]) {
          console.log(`[PREVIEW_DEBUG][FILE_REF] Found matching File object in memory (fileRefs)`);
          const file = fileRefs[previewBillId];
          const url = URL.createObjectURL(file);
          console.log(`[PREVIEW_DEBUG][PAYLOAD] Preview source: Blob URL generated from memory. type: ${file.type}`);
          setPreviewUrl(url);
          setPreviewType(file.type === 'application/pdf' ? 'pdf' : 'image');
          setIsPreviewLoading(false);
          return;
        }

        // 2. Fetch from storage or memory backup
        console.log(`[PREVIEW_DEBUG][LOOKUP] Searching for billId: ${previewBillId} in allBillsFlat (${allBillsFlat.length} bills total)`);
        
        const bill = allBillsFlat.find(b => b.id === previewBillId);
        
        if (bill) {
          console.log(`[PREVIEW_DEBUG][FILE_REF] Bill object found with following keys:`, {
            id: bill.id,
            fileName: bill.fileName,
            storagePath: bill.storagePath,
            originalFileUrl: (bill as any).originalFileUrl || 'NOT_PRESENT',
            originalFileName: (bill as any).originalFileName || 'NOT_PRESENT',
            hasBase64: !!bill.originalFileBase64
          });
          
          const type = (bill.fileMimeType === 'application/pdf' || bill.fileName?.toLowerCase().endsWith('.pdf')) ? 'pdf' : 'image';
          setPreviewType(type as 'pdf' | 'image');
          
          let effectivePath = bill.storagePath;

          // FALLBACK STRATEGY: If storagePath is missing, try to construct it using PROJECT_ID/FILENAME
          // This solves the issue for bills where the storage_path column is null but the file exists in the bucket
          if (!effectivePath && !(bill as any).originalFileUrl && !bill.originalFileBase64) {
            console.warn(`[PREVIEW_DEBUG][FILE_REF] storagePath missing. Attempting fallback...`);
            if (bill.projectId && bill.fileName) {
              effectivePath = `${bill.projectId}/${bill.fileName}`;
              console.log(`[PREVIEW_DEBUG][FILE_REF] Fallback path constructed: ${effectivePath}`);
            }
          }

          if (effectivePath) {
            console.log(`[PREVIEW_DEBUG][STORAGE] Initiating Supabase Storage fetch for: ${effectivePath}`);
            const result = await getDocumentForPreview(effectivePath, bill.originalFileBase64);
            
            if (result) {
              console.log(`[PREVIEW_DEBUG][PAYLOAD] Preview source: Supabase Storage data URL (length: ${result.length})`);
              setPreviewUrl(result);
            } else {
              console.error(`[PREVIEW_DEBUG][STORAGE] Failed to fetch or convert document from: ${effectivePath}`);
            }
          } else if (bill.originalFileBase64) {
            console.log(`[PREVIEW_DEBUG][PAYLOAD] Preview source: Falling back to local Base64 (length: ${bill.originalFileBase64.length})`);
            setPreviewUrl(bill.originalFileBase64);
          } else {
            console.error(`[PREVIEW_DEBUG][FILE_REF] CRITICAL: Bill found but lacks both storagePath (even after fallback) and base64.`, {
              requestedId: previewBillId,
              projectId: bill.projectId,
              fileName: bill.fileName,
              availableKeys: Object.keys(bill)
            });
            setPreviewError('Archivo original no vinculado en base de datos');
          }
        } else {
          console.error(`[PREVIEW_DEBUG][LOOKUP] CRITICAL: Bill with ID ${previewBillId} NOT FOUND in allBillsFlat. Check state synchronization.`);
        }
      } catch (err) {
        console.error('[PREVIEW_DEBUG][ERROR] Fatal error in loadPreview chain:', err);
      } finally {
        setIsPreviewLoading(false);
      }
    };

    loadPreview();
  }, [previewBillId, fileRefs, allBillsFlat]);

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

  // Auto-sync on visibility change (tab switch, window focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        console.log(`[SYNC_TRACE] App became visible - scheduling background sync`);
        // Debounced background sync - small delay to not block UI
        setTimeout(() => {
          if (cloudSyncStatus !== 'syncing') {
            setCloudSyncStatus('syncing');
            const userId = 'voltis_user_global';
            Promise.all([
              fetchAllProjectsFromDB(userId),
              fetchAllFoldersFromDB(userId)
            ]).then(([dbProjects, dbFolders]) => {
              // Merge with local data - local takes precedence for recent changes
              setCloudSyncStatus('synced');
              console.log(`[SYNC_TRACE] Background sync completed - ${dbProjects?.length || 0} projects loaded`);
            }).catch(() => {
              setCloudSyncStatus('error');
            });
          }
        }, 2000); // 2 second delay to not interfere with user interaction
      }
    };

    const handleFocus = () => {
      if (isAuthenticated && document.visibilityState === 'visible') {
        console.log(`[SYNC_TRACE] Window gained focus - checking sync status`);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, cloudSyncStatus]);

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
          // Handle clean state or restored projects
          setCloudSyncStatus('synced');
          if (dbProjects.length === 0) {
            console.log(`[SYNC_TRACE] DB vacía, nada que cargar.`);
          }
        }
      } catch (e: any) {
        console.error(`[LOCAL_FALLBACK_TRACE] Error en sincronización inicial:`, e.message);
        setCloudSyncStatus('error');
        toast.error(`Conexión limitada: ${e.message || 'Error de base de datos'}. Operando en modo local.`);
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

  const processFile = useCallback(async (file: File, queueId: string, targetProjectId: string, userInstruction?: string): Promise<'success' | 'error' | 'duplicate'> => {
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
        return 'error';
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

        // NEW: Persist original document to storage
        const userId = 'voltis_user_global';
        try {
          const fileHash = await generateFileHash(file);
          newBill.fileHash = fileHash;
          
          const uploadRes = await uploadOriginalDocument(
            userId,
            targetProjectId,
            newBill.id,
            file,
            file.name,
            file.type
          );
          
          if (uploadRes.success && uploadRes.path) {
            newBill.storagePath = uploadRes.path;
            console.log(`[STORAGE][${file.name}] Persisted to: ${newBill.storagePath}`);
          } else if (uploadRes.error) {
            console.warn(`[STORAGE][${file.name}] Upload warning: ${uploadRes.error}`);
          }
        } catch (storageErr) {
          console.error(`[STORAGE][${file.name}] Critical storage error:`, storageErr);
        }

        // Attach original file if available (session fallback)
        if (fileData) {
          newBill.originalFileBase64 = fileData.data;
          newBill.fileMimeType = fileData.type;
        }

        // Use functional updater to avoid stale closure when processing concurrently
        const billWithProject = { ...newBill, projectId: targetProjectId };
        let wasDuplicate = false;

        setAllBills(prev => {
          const projectBills = prev[targetProjectId] || [];

          // Check for duplicate using the latest state
          const isDuplicate = projectBills.some(b =>
            b.cups && newBill.cups &&
            b.cups === newBill.cups &&
            b.fechaInicio === newBill.fechaInicio &&
            b.fechaFin === newBill.fechaFin
          );

          if (isDuplicate) {
            wasDuplicate = true;
            return prev; // No changes
          }

          const nextBills = [...projectBills, billWithProject].sort((a, b) => {
            const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
            const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
            if (am.year !== bm.year) return am.year - bm.year;
            return am.month - bm.month;
          });

          // Schedule saveToDisk with the freshly computed bills
          const projectCustomOCs = allCustomOCs[targetProjectId] || {};
          setTimeout(() => saveToDisk(nextBills, projectCustomOCs, targetProjectId), 0);

          return { ...prev, [targetProjectId]: nextBills };
        });

        if (wasDuplicate) {
          console.log(`[REPORT ROUTING][${file.name}] Duplicate detected`);
          setAllExtractionQueues(q => ({
            ...q,
            [targetProjectId]: (q[targetProjectId] || []).map(item =>
              item.id === queueId ? { ...item, status: 'error' as const, error: 'Factura duplicada en este proyecto' } : item
            )
          }));
          toast.warning(`Factura "${file.name}" ya existe en este proyecto`);
          return 'duplicate';
        }

        setAllExtractionQueues(prev => ({
          ...prev,
          [targetProjectId]: (prev[targetProjectId] || []).map(item =>
            item.id === queueId ? { ...item, status: 'success' as const } : item
          )
        }));

        console.log(`[REPORT ROUTING][${file.name}] Success - bill saved`);
        return 'success';
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
        return 'error';
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
      return 'error';
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
    
    // Track results for final toast
    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    
    const workers = Array(Math.min(concurrencyLimit, queue.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            const result = await processFile(item.file, item.id, targetProjectId);
            if (result === 'success') successCount++;
            else if (result === 'duplicate') duplicateCount++;
            else errorCount++;
          }
        }
      });

    await Promise.all(workers);
    setIsExtracting(false);
    
    // Show contextual success/error message
    const total = validFiles.length;
    if (errorCount === 0 && duplicateCount === 0) {
      toast.success(`Extracción completada. ${successCount} factura${successCount > 1 ? 's' : ''} guardada${successCount > 1 ? 's' : ''} correctamente.`);
    } else if (errorCount === 0 && duplicateCount > 0) {
      toast.warning(`${duplicateCount} factura${duplicateCount > 1 ? 's' : ''} duplicada${duplicateCount > 1 ? 's' : ''}, ${successCount} guardada${successCount > 1 ? 's' : ''}.`);
    } else if (errorCount > 0 && successCount > 0) {
      toast.error(`${errorCount} error${errorCount > 1 ? 'es' : ''}, ${successCount} guardada${successCount > 1 ? 's' : ''}. Revisa las facturas marcadas en rojo.`);
    } else {
      toast.error(`Error en todas las facturas. Por favor, inténtalo de nuevo.`);
    }
  }, [currentProjectId, saveToDisk, processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 
      'application/pdf': ['.pdf'], 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif']
    } 
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

    console.log('[Project Creation] Generando proyecto:', { newId, userId, folderId: newProjectFolderId });

    const project: ProjectWorkspace = { 
      id: newId, 
      name: name.toUpperCase(), 
      folderId: newProjectFolderId || undefined, // Use the explicit target folder
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

  const moveProjectToFolder = async (projectId: string, folderId: any) => {
    const userId = 'voltis_user_global';
    
    // Check if we need to create a new folder first
    let targetFolderId = folderId;
    if (folderId && typeof folderId === 'object' && folderId.createNew) {
      const name = folderId.name;
      const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `folder-${Date.now()}`;
      const newFolder: ProjectFolder = {
        id: newId,
        name: name.toUpperCase(),
        user_id: userId,
        projectIds: [projectId],
        updatedAt: Date.now()
      };
      setFolders(prev => [...prev, newFolder]);
      await syncFolderToDB(newFolder, userId);
      targetFolderId = newId;
    }

    // Update local state
    setSavedProjects(prev => prev.map(p => p.id === projectId ? { ...p, folderId: targetFolderId || undefined } : p));
    
    // Update folders state
    setFolders(prev => prev.map(f => {
      // Remove from old folder if present
      const withoutProject = f.projectIds.filter(id => id !== projectId);
      // Add to new folder if matches
      if (f.id === targetFolderId) {
        return { ...f, projectIds: [...withoutProject, projectId] };
      }
      return { ...f, projectIds: withoutProject };
    }));

    // Sync to DB
    const project = savedProjects.find(p => p.id === projectId);
    if (project) {
      const updated = { ...project, folderId: targetFolderId || undefined };
      setCloudSyncStatus('syncing');
      const success = await syncProjectToDB(updated, userId);
      if (success) {
        setCloudSyncStatus('synced');
        toast.success(targetFolderId ? 'Proyecto movido a la carpeta' : 'Proyecto sacado de la carpeta');
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

  const handlePoolComplete = async (
    projects: { name: string; bills: ExtractedBill[] }[],
    folderNameRaw?: string
  ) => {
    const userId = 'voltis_user_global';
    setCloudSyncStatus('syncing');

    try {
      // Auto-create (or reuse) a parent folder for this pool so every supply
      // subproject lands inside a single visible container.
      const folderName = (folderNameRaw || '').trim().toUpperCase();
      let folderId: string | undefined;
      if (folderName) {
        const existing = folders.find(f => f.name === folderName);
        if (existing) {
          folderId = existing.id;
        } else {
          const newFolderId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `folder-${Date.now()}`;
          const newFolder: ProjectFolder = {
            id: newFolderId,
            name: folderName,
            user_id: userId,
            projectIds: [],
            updatedAt: Date.now(),
          };
          setFolders(prev => [...prev, newFolder]);
          await syncFolderToDB(newFolder, userId);
          folderId = newFolderId;
        }
      }

      const createdIds: string[] = [];
      for (const proj of projects) {
        const newId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const project: ProjectWorkspace = {
          id: newId,
          name: proj.name,
          folderId,
          bills: proj.bills,
          customOCs: {},
          updatedAt: Date.now()
        };

        // Add to local state
        setSavedProjects(prev => [...prev, project]);
        setAllBills(prev => ({ ...prev, [newId]: proj.bills }));
        setAllCustomOCs(prev => ({ ...prev, [newId]: {} }));

        // Sync to database
        await syncProjectToDB(project, userId);
        createdIds.push(newId);
      }

      // Attach the newly created projects to the folder's projectIds list
      if (folderId && createdIds.length > 0) {
        setFolders(prev => prev.map(f =>
          f.id === folderId
            ? { ...f, projectIds: Array.from(new Set([...f.projectIds, ...createdIds])), updatedAt: Date.now() }
            : f
        ));
        const updatedFolder = folders.find(f => f.id === folderId);
        if (updatedFolder) {
          await syncFolderToDB(
            { ...updatedFolder, projectIds: Array.from(new Set([...updatedFolder.projectIds, ...createdIds])), updatedAt: Date.now() },
            userId
          );
        }
      }

      setCloudSyncStatus('synced');
      toast.success(
        folderName
          ? `${projects.length} suministro${projects.length > 1 ? 's' : ''} creado${projects.length > 1 ? 's' : ''} en "${folderName}"`
          : `${projects.length} proyecto${projects.length > 1 ? 's' : ''} creado${projects.length > 1 ? 's' : ''} desde Pool`
      );
    } catch (err) {
      console.error('Pool creation error:', err);
      setCloudSyncStatus('error');
      toast.error('Error al crear proyectos desde Pool');
    }
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

  const handleProjectSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setIsSearchActive(false);
      return;
    }

    const matches = savedProjects.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (matches.length === 1) {
      loadWorkspace(matches[0]);
      setIsSearchActive(false);
      setSearchQuery(matches[0].name);
      toast.success(`Cargando proyecto: ${matches[0].name}`);
    } else if (matches.length > 1) {
      setIsSearchActive(true);
      setIsSidebarOpen(true);
      toast.info(`Se han encontrado ${matches.length} coincidencias`);
    } else {
      setIsSearchActive(true);
      setIsSidebarOpen(true); // Open to show "no results" in sidebar or just toast
      toast.error('No se ha encontrado ningún proyecto');
    }
  };

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
     
    const isMixedProject = hasGasBills && hasElectricityBills;
    const isElectricityOnly = hasElectricityBills && !hasGasBills;
    const isGasOnly = hasGasBills && !hasElectricityBills;
    
    return (
      <div className="fixed inset-0 z-[60] bg-[#020617] overflow-hidden">
        {/* Tab navigation for mixed projects */}
        {isMixedProject && (
          <div className="fixed top-0 left-0 right-0 z-[70] bg-slate-900/95 backdrop-blur-xl border-b border-white/10">
            <div className="flex items-center justify-center gap-8 px-4 py-3">
              <button
                onClick={() => setActiveReportTab('electricity')}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  activeReportTab === 'electricity'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                ⚡ Electricidad ({electricityBills.length})
              </button>
              <button
                onClick={() => setActiveReportTab('gas')}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  activeReportTab === 'gas'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                🔥 Gas ({gasOnlyBills.length})
              </button>
            </div>
          </div>
        )}
        
        {/* Gas-only report */}
        {isGasOnly && (
          <GasReportView
            bills={gasOnlyBills}
            onBack={() => setShowReport(false)}
            projectName={projectName}
            projectId={currentProjectId}
            onPreviewBill={(id) => {
              console.log(`[PREVIEW_DEBUG][STATE] setPreviewBillId (Gas Only): ${previewBillId} -> ${id}`);
              setPreviewBillId(id);
            }}
          />
        )}
        
        {/* Electricity-only report */}
        {isElectricityOnly && (
          <ReportView 
            bills={electricityBills} 
            customOCs={reportCustomOCs} 
            onBack={() => setShowReport(false)} 
            projectName={projectName}
            projectId={currentProjectId}
            onPreviewBill={(id) => {
              console.log(`[PREVIEW_DEBUG][STATE] setPreviewBillId (Elec Only): ${previewBillId} -> ${id}`);
              setPreviewBillId(id);
            }}
          />
        )}
        
        {/* Mixed report - show selected tab only */}
        {isMixedProject && activeReportTab === 'electricity' && (
          <ReportView 
            bills={electricityBills} 
            customOCs={reportCustomOCs} 
            onBack={() => setShowReport(false)} 
            projectName={`${projectName} - Electricidad`}
            projectId={currentProjectId}
            onPreviewBill={(id) => {
              console.log(`[PREVIEW_DEBUG][STATE] setPreviewBillId (Mixed Elec): ${previewBillId} -> ${id}`);
              setPreviewBillId(id);
            }}
          />
        )}
        
        {isMixedProject && activeReportTab === 'gas' && (
          <GasReportView 
            bills={gasOnlyBills}
            onBack={() => setShowReport(false)}
            projectName={`${projectName} - Gas`}
            projectId={currentProjectId}
            onPreviewBill={(id) => {
              console.log(`[PREVIEW_DEBUG][STATE] setPreviewBillId (Mixed Gas): ${previewBillId} -> ${id}`);
              setPreviewBillId(id);
            }}
          />
        )}

        {/* BILL PREVIEW MODAL - Rendered inside report view */}
        <AnimatePresence>
          {previewBillId && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-xl no-print" onClick={() => setPreviewBillId(null)}>
              <div className="absolute top-0 left-0 w-full h-[300px] bg-blue-600/10 blur-[120px] pointer-events-none" />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#0f172a] border border-white/10 rounded-2xl md:rounded-[48px] w-full max-w-6xl h-[85vh] md:h-[90vh] flex flex-col overflow-hidden shadow-2xl relative z-10 mobile-modal"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-4 md:p-10 border-b border-white/5 flex items-center justify-between bg-white/5 gap-4">
                  <div className="flex items-center gap-3 md:gap-5 min-w-0 flex-1">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base md:text-2xl font-black uppercase tracking-tight text-white truncate">
                        {reportBills.find(b => b.id === previewBillId)?.fileName}
                      </h3>
                      <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5 md:mt-1 hidden sm:block">Audit Control • Original Document</p>
                    </div>
                  </div>
                  <button onClick={() => setPreviewBillId(null)} className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10 flex-shrink-0 touch-target">
                    <X className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                </div>
                
                <div className="flex-1 bg-black/40 overflow-hidden relative">
                  {previewUrl ? (
                    <DocumentViewer 
                      src={previewUrl} 
                      type={previewType} 
                      fileName={reportBills.find(b => b.id === previewBillId)?.fileName}
                      onClose={() => setPreviewBillId(null)}
                    />
                  ) : isPreviewLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                      <Loader className="w-8 h-8 text-blue-500 animate-spin" />
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recuperando documento...</p>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 md:gap-6 text-slate-500 border-2 border-dashed border-white/5 rounded-2xl md:rounded-[40px] bg-white/[0.02] p-4 text-center">
                      <AlertTriangle className="w-12 h-12 md:w-16 md:h-16 text-amber-500/50" />
                      <div className="space-y-2">
                        <p className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Archivo no disponible</p>
                        <p className="text-xs md:text-sm font-medium text-slate-500 max-w-xs mx-auto">Este documento histórico no tiene una copia digital vinculada o guardada en el almacenamiento persistente.</p>
                      </div>
                    </div>
                  )}
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
       {/* Sidebar - Mobile overlay, CSS-animated */}
       {/* Backdrop - separate for smooth fade-out */}
       <AnimatePresence>
         {isSidebarOpen && (
           <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             transition={{ duration: 0.2 }}
             onClick={() => setIsSidebarOpen(false)}
             className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
           />
         )}
       </AnimatePresence>
       
       {/* Mobile Sidebar - Animated */}
       <AnimatePresence>
         {isSidebarOpen && (
           <motion.aside
             initial={{ x: -activeSidebarWidth }}
             animate={{ x: 0 }}
             exit={{ x: -activeSidebarWidth }}
             onViewportEnter={(entry) => {
               if (entry && entry.target instanceof HTMLElement) {
                 const w = entry.target.offsetWidth;
                 setActiveSidebarWidth(w);
                 console.log(`[SIDEBAR_DEBUG] Mobile Sidebar Rendered. Width: ${w}`);
               }
             }}
             transition={{ type: 'spring', damping: 25, stiffness: 200 }}
             className="md:hidden fixed inset-y-0 left-0 z-50 w-80 bg-black border-r border-white/5 flex flex-col shadow-2xl"
           >
        <div className="absolute top-0 left-0 w-full h-[300px] bg-blue-600/5 blur-[100px] pointer-events-none" />
        
        <div className="px-8 pt-10 pb-6 flex flex-col gap-8 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 flex items-center justify-center relative">
                <img 
                  src="/mascota-transparente.png" 
                  alt="Voltis Mascot" 
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="flex flex-col">
                <h2 className="text-lg font-black tracking-tighter text-white uppercase italic leading-none">Voltis</h2>
                <span className="text-[10px] font-bold tracking-[0.3em] text-slate-500 uppercase mt-1">Energy • v2.0-SUPABASE</span>
              </div>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 hover:bg-white/5 text-slate-500 rounded-lg transition-colors touch-target"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">
                Proyectos
              </h3>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => { setShowNewFolderModal(true); setNewFolderName(''); }}
                  className="p-1 hover:bg-white/5 text-slate-500 hover:text-white rounded transition-all"
                  title="Nueva Carpeta"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => { setNewProjectFolderId(null); setShowNewProjectModal(true); setNewProjectName(''); }}
                  className="p-1 hover:bg-white/5 text-slate-500 hover:text-white rounded transition-all"
                  title="Nuevo Proyecto"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setShowPool(true)}
                  className="p-2 hover:bg-purple-500/20 text-slate-500 hover:text-purple-400 rounded transition-all touch-target"
                  title="Pool - Carga Masiva"
                >
                  <Package className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-4 overflow-y-auto max-h-[65vh] pr-2 custom-scrollbar">
              {/* FOLDERS SECTION */}
              {folders
                .filter(f => {
                  if (!isSearchActive || !searchQuery) return true;
                  const folderMatches = f.name.toLowerCase().includes(searchQuery.toLowerCase());
                  const hasMatchingProject = savedProjects.some(p => 
                    p.folderId === f.id && p.name.toLowerCase().includes(searchQuery.toLowerCase())
                  );
                  return folderMatches || hasMatchingProject;
                })
                .sort((a,b) => b.updatedAt - a.updatedAt)
                .map(folder => {
                  const folderProjects = savedProjects.filter(p => {
                    const isChild = p.folderId === folder.id;
                    if (!isSearchActive || !searchQuery) return isChild;
                    return isChild && p.name.toLowerCase().includes(searchQuery.toLowerCase());
                  });
                  const isExpanded = expandedFolders.has(folder.id) || (isSearchActive && searchQuery !== '');
                  const toggleFolder = () => {
                    setExpandedFolders(prev => {
                      const next = new Set(prev);
                      if (next.has(folder.id)) {
                        next.delete(folder.id);
                      } else {
                        next.add(folder.id);
                      }
                      return next;
                    });
                  };
                
                return (
                  <div key={folder.id} className="flex flex-col gap-1">
                    <div 
                      onClick={toggleFolder}
                      className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
                        isExpanded ? 'text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                        >
                          <ChevronRight className={`w-3 h-3 ${isExpanded ? 'text-blue-400' : 'text-slate-600'}`} />
                        </motion.div>
                        <FolderOpen className={`w-3.5 h-3.5 ${isExpanded ? 'text-blue-400' : 'text-slate-600'}`} />
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
                          <span className={`font-bold truncate text-xs uppercase tracking-tight ${isExpanded ? 'text-white' : 'text-slate-500'}`}>
                            {folder.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-100 md:opacity-100">
                        <button 
                          onClick={(e) => { e.stopPropagation(); downloadFolderZIP(folder.name, folderProjects); }}
                          className={`p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all touch-target ${exportProgress.status !== 'idle' ? 'opacity-30 cursor-wait' : ''}`}
                          title="Descargar ZIP"
                          disabled={exportProgress.status !== 'idle'}
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setRenamingFolderId(folder.id); setNewFolderName(folder.name); }}
                          className="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded-lg touch-target"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                          className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg touch-target"
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
                          onClick={() => { setNewProjectFolderId(folder.id); setShowNewProjectModal(true); setNewProjectName(''); }}
                          className="flex items-center gap-2 p-2 rounded-lg text-blue-500/60 hover:text-blue-400 hover:bg-blue-500/5 transition-all text-[10px] font-bold uppercase tracking-wider mt-1 touch-target"
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
                {savedProjects
                  .filter(p => {
                    const noFolder = !p.folderId;
                    if (!isSearchActive || !searchQuery) return noFolder;
                    return noFolder && p.name.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .sort((a,b) => b.updatedAt - a.updatedAt)
                  .map(proj => (
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
                
                {isSearchActive && searchQuery && 
                 savedProjects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3 bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <Search className="w-5 h-5 text-slate-600 opacity-50" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                      No se han encontrado proyectos que coincidan con "{searchQuery}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

          <div className="mt-auto px-8 pb-10 flex flex-col gap-4 relative z-10">
            <div className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between group relative">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white uppercase tracking-tight">COMERCIAL</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Plan Expert</span>
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
           </motion.aside>
         )}
       </AnimatePresence>

       {/* Desktop Sidebar - Always visible when open */}
      {isSidebarOpen && (
        <aside 
          className="hidden md:flex fixed inset-y-0 left-0 z-50 w-80 bg-black border-r border-white/5 flex flex-col shadow-2xl"
          ref={(el) => {
            if (el) console.log(`[SIDEBAR_DEBUG] Desktop Sidebar Rendered. OffsetWidth: ${el.offsetWidth}`);
          }}
        >
          <div className="absolute top-0 left-0 w-full h-[300px] bg-blue-600/5 blur-[100px] pointer-events-none" />
          <div className="px-8 pt-10 pb-6 flex flex-col gap-6 relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center relative">
                  <img src="/mascota-transparente.png" alt="Voltis Mascot" className="w-8 h-8 object-contain" />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-base font-black tracking-tighter text-white uppercase italic leading-none">Voltis</h2>
                  <span className="text-[10px] font-bold tracking-[0.3em] text-slate-500 uppercase mt-0.5">Energy • v2.0-SUPABASE</span>
                </div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 text-slate-500 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Desktop Sidebar Content - Projects List */}
            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">
                  Proyectos
                </h3>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => { setShowNewFolderModal(true); setNewFolderName(''); }}
                    className="p-1 hover:bg-white/5 text-slate-500 hover:text-white rounded transition-all"
                    title="Nueva Carpeta"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => { setNewProjectFolderId(null); setShowNewProjectModal(true); setNewProjectName(''); }}
                    className="p-1 hover:bg-white/5 text-slate-500 hover:text-white rounded transition-all"
                    title="Nuevo Proyecto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => setShowPool(true)}
                    className="p-2 hover:bg-purple-500/20 text-slate-500 hover:text-purple-400 rounded transition-all"
                    title="Pool - Carga Masiva"
                  >
                    <Package className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                {/* FOLDERS SECTION */}
                {folders
                  .filter(f => {
                    if (!isSearchActive || !searchQuery) return true;
                    const folderMatches = f.name.toLowerCase().includes(searchQuery.toLowerCase());
                    const hasMatchingProject = savedProjects.some(p => 
                      p.folderId === f.id && p.name.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                    return folderMatches || hasMatchingProject;
                  })
                  .sort((a,b) => b.updatedAt - a.updatedAt)
                  .map(folder => {
                    const folderProjects = savedProjects.filter(p => {
                      const isChild = p.folderId === folder.id;
                      if (!isSearchActive || !searchQuery) return isChild;
                      return isChild && p.name.toLowerCase().includes(searchQuery.toLowerCase());
                    });
                    const isExpanded = expandedFolders.has(folder.id) || (isSearchActive && searchQuery !== '');
                    const toggleFolder = () => {
                      setExpandedFolders(prev => {
                        const next = new Set(prev);
                        if (next.has(folder.id)) {
                          next.delete(folder.id);
                        } else {
                          next.add(folder.id);
                        }
                        return next;
                      });
                    };
                  
                    return (
                      <div key={folder.id} className="flex flex-col gap-1">
                        <div 
                          onClick={toggleFolder}
                          className={`group flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
                            isExpanded ? 'text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <motion.div
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                            >
                              <ChevronRight className={`w-3 h-3 ${isExpanded ? 'text-blue-400' : 'text-slate-600'}`} />
                            </motion.div>
                            <FolderOpen className={`w-3.5 h-3.5 ${isExpanded ? 'text-blue-400' : 'text-slate-600'}`} />
                            <span className={`font-bold truncate text-xs uppercase tracking-tight ${isExpanded ? 'text-white' : 'text-slate-500'}`}>
                              {folder.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); downloadFolderZIP(folder.name, folderProjects); }}
                              className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all"
                              title="Descargar ZIP"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setRenamingFolderId(folder.id); setNewFolderName(folder.name); }}
                              className="p-1.5 hover:bg-white/10 text-slate-500 hover:text-white rounded-lg transition-all"
                              title="Renombrar"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                              className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-all"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="ml-6 flex flex-col gap-0.5">
                            {folderProjects
                              .sort((a, b) => b.updatedAt - a.updatedAt)
                              .map(project => (
                                <div
                                  key={project.id}
                                  onClick={() => loadWorkspace(project)}
                                  className={`group py-1.5 px-2 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                                    project.id === currentProjectId
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <Zap className={`w-3 h-3 flex-shrink-0 ${project.id === currentProjectId ? 'text-blue-400' : 'text-slate-600'}`} />
                                    <span className="text-xs font-medium truncate">{project.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-100">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setRenamingProjectId(project.id); setNewProjectName(project.name); }}
                                      className="p-1 hover:bg-white/10 rounded"
                                      title="Renombrar"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); deleteProject(project.id, e); }}
                                      className="p-1 hover:bg-red-500/10 text-slate-500 hover:text-red-500 rounded"
                                      title="Eliminar"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                
                {/* UNFOLDERED PROJECTS */}
                {savedProjects
                  .filter(p => !p.folderId)
                  .filter(p => {
                    if (!isSearchActive || !searchQuery) return true;
                    return p.name.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map(project => (
                    <div
                      key={project.id}
                      onClick={() => loadWorkspace(project)}
                      className={`group py-1.5 px-2 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                        project.id === currentProjectId
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Zap className={`w-3 h-3 flex-shrink-0 ${project.id === currentProjectId ? 'text-blue-400' : 'text-slate-600'}`} />
                        <span className="text-xs font-medium truncate">{project.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-100">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setRenamingProjectId(project.id); setNewProjectName(project.name); }}
                          className="p-1 hover:bg-white/10 rounded"
                          title="Renombrar"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteProject(project.id, e); }}
                          className="p-1 hover:bg-red-500/10 text-slate-500 hover:text-red-500 rounded"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                
                {savedProjects.filter(p => !p.folderId).length === 0 && !isSearchActive && (
                  <span className="text-[10px] text-slate-600 italic py-2">Sin proyectos</span>
                )}
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-[#020617] scroll-smooth min-h-screen">
        {/* Animated Background Highlights */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

        {!isAuthenticated ? (
          <LoginScreen onLogin={() => setIsAuthenticated(true)} isLoading={isAuthLoading} error={authError} />
        ) : (
          <div className="px-4 md:px-8 lg:px-16 py-6 md:py-12 flex flex-col gap-8 md:gap-10 max-w-7xl mx-auto w-full relative z-10">
            
            <header className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 md:gap-6 border-b border-white/5 pb-6 mobile-header">
              <div className="flex items-center gap-3 md:gap-4">
                <button 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/5 transition-all group touch-target flex-shrink-0"
                  title={isSidebarOpen ? "Cerrar menú" : "Abrir menú"}
                >
                  <LayoutDashboard className={`w-5 h-5 transition-transform duration-300 ${isSidebarOpen ? 'rotate-90 text-blue-400' : 'text-slate-400 group-hover:text-white'}`} />
                </button>
                <form 
                  onSubmit={handleProjectSearch}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 group focus-within:border-blue-500/50 focus-within:bg-white/10 transition-all w-full max-w-[240px] md:max-w-[240px]"
                >
                  <Search className="w-3.5 h-3.5 text-slate-500 group-focus-within:text-blue-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (!e.target.value) setIsSearchActive(false);
                    }}
                    placeholder="Buscar proyecto..."
                    className="bg-transparent border-none text-xs font-bold text-white placeholder-slate-600 focus:outline-none w-full uppercase tracking-tight"
                  />
                  <div className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      cloudSyncStatus === 'synced' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                      cloudSyncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'
                    }`} />
                    <span className={`text-[9px] font-medium shrink-0 ${
                      cloudSyncStatus === 'synced' ? 'text-emerald-400' :
                      cloudSyncStatus === 'syncing' ? 'text-blue-400' : 'text-amber-400'
                    }`}>
                      {cloudSyncStatus === 'synced' ? '✓' : cloudSyncStatus === 'syncing' ? '···' : '!'}
                    </span>
                  </div>
                </form>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:gap-3 no-print">
                <button 
                  onClick={() => setShowReport(true)}
                  disabled={bills.length === 0}
                  className="btn-primary h-12 px-6 text-xs md:text-sm whitespace-nowrap shadow-xl"
                >
                  <Sparkles className="w-5 h-5 md:w-4 md:h-4" />
                  Generar informe
                </button>
                <button 
                  onClick={handleExport}
                  disabled={bills.length === 0}
                  className="btn-secondary h-12 px-5 text-xs md:text-sm whitespace-nowrap"
                >
                  <Download className="w-5 h-5 md:w-4 md:h-4 text-emerald-400" />
                  Excel
                </button>
                <label 
                  className="btn-outline h-12 px-5 cursor-pointer text-xs md:text-sm whitespace-nowrap flex items-center justify-center gap-2"
                  title="Importar correcciones"
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
                  <FileSpreadsheet className="w-5 h-5 md:w-4 md:h-4 text-blue-400" />
                  Importar
                </label>
              </div>
            </header>

            {/* FUTURISTIC SCANNER DROPZONE */}
            {/* Mobile: Show dedicated upload button */}
            <div className="md:hidden">
              <MobileUploadButton
                onFilesSelected={(files) => onDrop(files)}
                maxFiles={10}
                disabled={isExtracting}
              />
            </div>
            
            {/* Desktop: Show dropzone */}
            <div 
              {...getRootProps()} 
              className={`
                hidden md:flex premium-card p-8 group cursor-pointer text-center flex flex-col items-center gap-4
                ${isDragActive ? 'border-blue-500/50 bg-blue-500/5' : ''}
              `}
            >
              <input {...getInputProps()} />
              <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                 {isExtracting ? (
                   <Loader className="w-6 h-6 text-blue-400 animate-spin" />
                 ) : (
                   <Upload className={`w-6 h-6 transition-colors ${isDragActive ? 'text-blue-400' : 'text-slate-500'}`} />
                 )}
              </div>
               <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight">Cargar Facturas</h3>
                  <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">PDF, Imagen o Excel • Arrastra o haz clic para subir</p>
               </div>
            </div>
            
            {/* Mobile hint */}
            <p className="md:hidden text-slate-500 text-xs font-medium text-center mt-2">
              O arrastra archivos aquí en escritorio
            </p>
            
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
                     <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Cola de Procesamiento
                     </h3>
                     <button 
                      onClick={() => {
                        setAllExtractionQueues(prev => ({ ...prev, [currentProjectId]: [] }));
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest p-2 touch-target"
                     >
                       Limpiar Cola
                     </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {extractionQueue.map((item) => (
                      <motion.div 
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`premium-card p-3 flex items-center justify-between ${
                          item.status === 'loading' ? 'border-blue-500/20' :
                          item.status === 'success' ? 'border-emerald-500/20' : 'border-red-500/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-[11px] font-bold text-white truncate">{item.fileName}</span>
                            <span className={`text-[10px] font-bold uppercase tracking-tight ${
                              item.status === 'loading' ? 'text-blue-400 animate-pulse' :
                              item.status === 'success' ? 'text-emerald-500' : 'text-red-400'
                            }`}>
                              {item.status === 'loading' ? 'Procesando...' :
                               item.status === 'success' ? 'Completado' : 'Error'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
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
                            className="p-1 hover:bg-white/10 rounded text-slate-500 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
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
                  className="flex flex-col gap-5 md:gap-6 mb-16 md:mb-20"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4 border-b border-white/5 pb-4 relative">
                     <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2 md:gap-3">
                       Datos Extraídos <span className="text-xs bg-white/5 text-blue-400 px-3 py-1 rounded-full border border-white/5">{bills.length}</span>
                     </h2>

                     {/* Project Name - Centered on desktop, below title on mobile */}
                     <div className="md:absolute md:left-1/2 md:-translate-x-1/2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em]">
                          {savedProjects.find(p => p.id === currentProjectId)?.name}
                        </span>
                     </div>

                     <div className="hidden md:flex items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> AI Verified</span>
                        <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-blue-500" /> Sync Safe</span>
                     </div>
                  </div>

                  <div className="glass-card rounded-2xl md:rounded-[40px] border border-white/5 overflow-hidden shadow-3xl">
                    <FileTable 
                      bills={bills} 
                      onUpdateBills={handleUpdateBills} 
                      onUpdateOCs={handleUpdateOCs}
                      customOCs={customOCs}
                      onRefine={(bill) => {
                        setRefiningBill(bill);
                        setRefineInstruction('');
                      }}
                      onPreviewBill={(id) => {
                        console.log(`[PREVIEW_DEBUG][STATE] setPreviewBillId (Main Table): ${previewBillId} -> ${id}`);
                        setPreviewBillId(id);
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
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-card w-full max-w-lg rounded-2xl md:rounded-[40px] p-6 md:p-10 border border-white/10 shadow-3xl text-white relative mobile-modal max-h-[90vh] overflow-y-auto"
            >
              <button onClick={() => setShowDiag(false)} className="absolute top-4 right-4 md:top-8 md:right-8 text-slate-500 hover:text-white p-2">
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>

              <div className="flex flex-col gap-6 md:gap-8">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="p-2 md:p-3 bg-blue-500/10 rounded-xl md:rounded-2xl">
                    <Settings className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg md:text-2xl font-black tracking-tighter italic">DIAGNÓSTICO DE SISTEMAS</h2>
                    <p className="text-[10px] md:text-xs font-bold text-blue-400 tracking-widest uppercase opacity-60">Auditoría Técnica en Vivo</p>
                  </div>
                </div>

                {isCheckingDiag ? (
                  <div className="flex flex-col items-center gap-4 py-8 md:py-12">
                     <Loader className="w-8 h-8 md:w-10 md:h-10 text-blue-500 animate-spin" />
                     <span className="text-[10px] md:text-xs font-black tracking-widest">ANALIZANDO CONEXIONES...</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 md:gap-6">
                    {/* ENTORNO */}
                    <div className="flex flex-col gap-2 md:gap-3">
                       <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Llaves de API (Variables Vercel)</h3>
                       <div className="grid grid-cols-2 gap-2 md:gap-4">
                          <StatusItem label="Groq AI" status={diagInfo?.env?.has_groq_key} />
                          <StatusItem label="Supabase URL" status={diagInfo?.env?.has_supabase_url} />
                          <StatusItem label="Supabase Key" status={diagInfo?.env?.has_supabase_key} />
                          <StatusItem label="Gemini AI" status={diagInfo?.env?.has_gemini_key} />
                          <StatusItem label="DATABASE" status={diagInfo?.db_connected || false} />
                       </div>
                    </div>

                    <button
                      onClick={repairProjects}
                      className="w-full mt-1 md:mt-2 p-3 md:p-4 rounded-xl md:rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2 touch-target"
                    >
                      <Zap className="w-4 h-4" /> Reparar Integridad de Proyectos
                    </button>

                    {/* BASE DE DATOS */}
                    <div className="flex flex-col gap-2 md:gap-3 mt-2 md:mt-4">
                       <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Base de Datos (Supabase)</h3>
                       <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl border ${diagInfo?.database?.status === 'connected' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                          <div className="flex items-center justify-between mb-1 md:mb-2">
                             <span className="text-[11px] md:text-[12px] font-bold">Estado del Enlace Cloud</span>
                             <span className={`text-[9px] md:text-[10px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded-full ${diagInfo?.database?.status === 'connected' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                {diagInfo?.database?.status?.toUpperCase() || 'DESCONECTADO'}
                             </span>
                          </div>
                          {diagInfo?.database?.error && (
                            <p className="text-[9px] md:text-[10px] text-red-300 font-mono bg-red-950/30 p-2 rounded-lg mt-1 md:mt-2 break-all">
                               {diagInfo.database.error}
                            </p>
                          )}
                          <p className="text-[9px] md:text-[10px] opacity-40 mt-1 md:mt-2">
                             Este indicador verifica si la app puede leer/escribir proyectos en la nube.
                          </p>
                       </div>
                    </div>
                    
                    <button 
                      onClick={runDiagnostic}
                      className="w-full py-3 md:py-4 bg-white text-black font-black text-xs uppercase tracking-widest rounded-xl md:rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2 touch-target"
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
            className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xl no-print"
            onClick={() => setShowNewProjectModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card border border-white/10 rounded-t-2xl sm:rounded-2xl md:rounded-[40px] w-full sm:max-w-md p-6 md:p-10 flex flex-col gap-6 md:gap-8 mobile-modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl md:rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Plus className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-black tracking-tight text-white">Nuevo Proyecto</h3>
                  <p className="text-[10px] md:text-[11px] text-slate-500 font-medium">
                    {newProjectFolderId 
                      ? `En carpeta: ${folders.find(f => f.id === newProjectFolderId)?.name || 'Desconocida'}`
                      : 'Sin carpeta (proyecto independiente)'}
                  </p>
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
                className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-white font-bold text-sm placeholder:normal-case placeholder:font-normal placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
              />

              <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
                <button
                  onClick={() => setShowNewProjectModal(false)}
                  className="flex-1 py-3 rounded-xl md:rounded-2xl border border-white/10 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all touch-target"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => createNewProject(newProjectName)}
                  disabled={!newProjectName.trim()}
                  className="flex-1 py-3 rounded-xl md:rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 touch-target"
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
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-xl no-print" onClick={() => setPreviewBillId(null)}>
            <div className="absolute top-0 left-0 w-full h-[300px] bg-blue-600/10 blur-[120px] pointer-events-none" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0f172a] border border-white/10 rounded-2xl md:rounded-[48px] w-full max-w-6xl h-[85vh] md:h-[90vh] flex flex-col overflow-hidden shadow-2xl relative z-10 mobile-modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 md:p-10 border-b border-white/5 flex items-center justify-between bg-white/5 gap-4">
                <div className="flex items-center gap-3 md:gap-5 min-w-0 flex-1">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base md:text-2xl font-black uppercase tracking-tight text-white truncate">
                      {bills.find(b => b.id === previewBillId)?.fileName}
                    </h3>
                    <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5 md:mt-1 hidden sm:block">Audit Control • Original Document</p>
                  </div>
                </div>
                <button onClick={() => setPreviewBillId(null)} className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10 flex-shrink-0 touch-target">
                  <X className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>
              
              <div className="flex-1 bg-black/40 overflow-hidden relative">
                {previewUrl ? (
                  <>
                    {console.log(`[PREVIEW_DEBUG][MODAL] Rendering DocumentViewer with valid previewUrl (length: ${previewUrl.length})`)}
                    <DocumentViewer 
                      src={previewUrl} 
                      type={previewType} 
                      fileName={bills.find(b => b.id === previewBillId)?.fileName}
                      onClose={() => setPreviewBillId(null)}
                    />
                  </>
                ) : isPreviewLoading ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                    <Loader className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recuperando documento...</p>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 md:gap-6 text-slate-500 border-2 border-dashed border-white/5 rounded-2xl md:rounded-[40px] bg-white/[0.02] p-4 text-center">
                    <AlertTriangle className="w-12 h-12 md:w-16 md:h-16 text-amber-500/50" />
                    <div className="space-y-2">
                      <p className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Archivo no disponible</p>
                      <p className="text-xs md:text-sm font-medium text-slate-500 max-w-xs mx-auto">Este documento histórico no tiene una copia digital vinculada o guardada en el almacenamiento persistente.</p>
                    </div>
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
            className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-card w-full max-w-lg rounded-t-2xl sm:rounded-2xl md:rounded-[40px] p-6 md:p-10 border border-white/10 shadow-3xl text-white relative mobile-modal"
            >
              <button onClick={() => setRefiningBill(null)} className="absolute top-4 right-4 md:top-8 md:right-8 text-slate-500 hover:text-white p-2">
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>

              <div className="flex flex-col gap-4 md:gap-8">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="p-2 md:p-3 bg-blue-500/10 rounded-xl md:rounded-2xl">
                    <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg md:text-2xl font-black tracking-tighter italic">REFINAR CON IA</h2>
                    <p className="text-[10px] md:text-xs font-bold text-blue-400 tracking-widest uppercase opacity-60">Instrucciones de Corrección</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:gap-4">
                  <p className="text-xs md:text-sm text-slate-400 font-medium leading-relaxed">
                    Indica qué datos faltan o deben corregirse en la factura <span className="text-white font-bold truncate block max-w-full">{refiningBill.fileName}</span>.
                  </p>
                  
                  <textarea
                    autoFocus
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder="Ej: 'Extrae el exceso de potencia de P4, P5 y P6 que falta' o 'El total no coincide, busca el bono social'..."
                    className="w-full h-32 md:h-40 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-5 text-white font-medium text-sm focus:outline-none focus:border-blue-500/50 transition-all resize-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 md:gap-3 mt-1 md:mt-2">
                  <button
                    onClick={() => setRefiningBill(null)}
                    disabled={isRefining}
                    className="flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl border border-white/10 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all touch-target"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleRefine}
                    disabled={isRefining || !refineInstruction.trim()}
                    className="flex-[2] py-3 md:py-4 rounded-xl md:rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] flex items-center justify-center gap-2 touch-target"
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
                  {newProjectFolderId && (
                    <div className="flex items-center gap-2 mt-1 ml-1">
                      <FolderOpen className="w-3 h-3 text-blue-400" />
                      <span className="text-[10px] text-blue-400/60 font-medium">En carpeta: <span className="font-bold">{folders.find(f => f.id === newProjectFolderId)?.name}</span></span>
                    </div>
                  )}
                  {!newProjectFolderId && (
                    <div className="flex items-center gap-2 mt-1 ml-1">
                      <FolderOpen className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] text-slate-500 font-medium">Proyecto independiente (sin carpeta)</span>
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
          <div className="fixed inset-0 z-[510] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl md:rounded-[32px] p-6 md:p-8 border border-white/10 shadow-3xl text-white relative mobile-modal"
            >
              <button onClick={() => setShowNewFolderModal(false)} className="absolute top-4 right-4 md:top-6 md:right-6 text-slate-500 hover:text-white p-2">
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col gap-4 md:gap-6">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="p-2 md:p-3 bg-orange-500/10 rounded-xl text-orange-400">
                    <FolderOpen className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg md:text-xl font-black uppercase tracking-tight italic">NUEVA CARPETA</h2>
                    <p className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest">Organizar proyectos</p>
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 md:p-4 text-white font-bold uppercase tracking-wider text-sm focus:outline-none focus:border-orange-500/50 transition-all"
                  />
                </div>

                <button
                  onClick={() => createFolder(newFolderName)}
                  disabled={!newFolderName.trim()}
                  className="w-full py-3 md:py-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-orange-900/20 touch-target"
                >
                  CREAR CARPETA
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POOL UPLOAD MODAL */}
      <AnimatePresence>
        {showPool && (
          <PoolUpload
            onClose={() => setShowPool(false)}
            onComplete={(projects, folderName) => {
              handlePoolComplete(projects, folderName);
              setShowPool(false);
            }}
            existingCups={new Set(
              Object.values(allBills)
                .flat()
                .filter(b => b.cups)
                .map(b => b.cups!.replace(/\s+/g, '').toUpperCase())
            )}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {exportProgress.status !== 'idle' && exportProgress.status !== 'completed' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 glass-card border border-blue-500/30 shadow-2xl flex items-center gap-4 min-w-[300px]"
          >
            <div className={`p-2 rounded-xl ${exportProgress.status === 'error' ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
              {exportProgress.status === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-400" />
              ) : (
                <Loader className="w-5 h-5 text-blue-400 animate-spin" />
              )}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Exportando Carpeta</span>
               <span className="text-xs font-bold text-white truncate">{exportProgress.message}</span>
               {exportProgress.total > 0 && (
                 <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                   <motion.div 
                     className="h-full bg-blue-500"
                     initial={{ width: 0 }}
                     animate={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                   />
                 </div>
               )}
            </div>
          </motion.div>
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false);
      }
    };
    if (showMoveMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoveMenu]);

  return (
    <div className="relative" ref={menuRef}>
      <div 
        onClick={onLoad}
        className={`sidebar-item group ${
          isActive 
            ? 'sidebar-item-active' 
            : 'sidebar-item-inactive'
        }`}
      >
        <div className="flex flex-col gap-0.5 overflow-hidden flex-1 min-w-0">
          <span className="truncate">{proj.name}</span>
          <span className="text-[9px] opacity-50 font-medium tracking-tight">{(proj.bills || []).length} items</span>
        </div>
        
        <div className="flex items-center gap-1 opacity-100 md:opacity-100">
          <button 
            onClick={(e) => { e.stopPropagation(); setShowMoveMenu(!showMoveMenu); }}
            className={`p-1.5 rounded transition-colors touch-target ${showMoveMenu ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-slate-500 hover:text-white'}`}
            title="Mover a carpeta"
          >
            <Layers className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(e); }} className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-500 rounded touch-target">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showMoveMenu && (
        <div 
          className="absolute left-full ml-2 top-0 z-50 w-56 glass-card border border-white/20 rounded-2xl p-3 shadow-2xl overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-[60px] bg-blue-600/5 blur-xl pointer-events-none" />
          <div className="flex items-center justify-between mb-2 relative z-10">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1 py-1">Mover a carpeta</p>
            <button 
              onClick={() => setShowMoveMenu(false)}
              className="p-1 hover:bg-white/10 rounded touch-target"
            >
              <X className="w-3 h-3 text-slate-500" />
            </button>
          </div>
          
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto custom-scrollbar relative z-10">
            <button 
              onClick={(e) => { e.stopPropagation(); onMove(null); setShowMoveMenu(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all touch-target ${!proj.folderId ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:bg-white/5'}`}
            >
              <X className="w-3 h-3 opacity-40" /> Sin Carpeta
            </button>
            <div className="h-px bg-white/5 my-1" />
            {folders.map((f: any) => (
              <button 
                key={f.id}
                onClick={(e) => { e.stopPropagation(); onMove(f.id); setShowMoveMenu(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all touch-target ${proj.folderId === f.id ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:bg-white/5'}`}
              >
                <FolderOpen className={`w-3 h-3 ${proj.folderId === f.id ? 'text-blue-400' : 'opacity-40'}`} />
                <span className="truncate">{f.name}</span>
                {proj.folderId === f.id && <Check className="w-3 h-3 ml-auto text-blue-400" />}
              </button>
            ))}
            
            <div className="h-px bg-white/5 my-1" />
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                const name = prompt('Nombre de la nueva carpeta:');
                if (name) {
                  onMove({ createNew: true, name });
                }
                setShowMoveMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-tight text-blue-400 hover:bg-blue-500/10 transition-all border border-blue-500/10 touch-target"
            >
              <Plus className="w-3 h-3" /> Crear Carpeta
            </button>
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

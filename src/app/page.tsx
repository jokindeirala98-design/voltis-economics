"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, Upload, Trash2, Download, AlertTriangle, 
  CheckCircle, Plus, FolderOpen, Edit2, 
  BarChart3, LayoutDashboard, Settings, LogOut,
  ChevronRight, Sparkles, Zap, Smartphone, Layers, X,
  Loader
} from 'lucide-react';
import { toast } from 'sonner';
import { ExtractedBill, ProjectWorkspace, QueueItem } from '@/lib/types';
import FileTable from '@/components/FileTable';
import { exportBillsToExcel } from '@/lib/export';
import { importBillsFromExcel } from '@/lib/import-bills';
import ReportView from '@/components/ReportView';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchAllProjectsFromDB, syncProjectToDB, deleteProjectFromDB } from '@/lib/supabase-sync';
import { getAssignedMonth } from '@/lib/date-utils';
import LoginScreen from '@/components/LoginScreen';

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
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [fileRefs, setFileRefs] = useState<Record<string, File>>({}); 
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'local'>('local');
  const [showDiag, setShowDiag] = useState(false);
  const [diagInfo, setDiagInfo] = useState<any>(null);
  const [isCheckingDiag, setIsCheckingDiag] = useState(false);
  const [previewBillId, setPreviewBillId] = useState<string | null>(null);

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
      setCloudSyncStatus('syncing');
      try {
        const dbProjects = await fetchAllProjectsFromDB(userId);
        
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
          
          setAllBills(billsAcc);
          setAllCustomOCs(ocsAcc);
          
          const lastId = localStorage.getItem(`voltis_last_project`) || dbProjects[0].id;
          setCurrentProjectId(lastId);
          setCloudSyncStatus('synced');
        } else {
          setCloudSyncStatus('synced');
        }
      } catch (e) {
        console.error('Initial sync error', e);
        setCloudSyncStatus('error');
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

  const saveToDisk = useCallback(async (updatedBills: ExtractedBill[], updatedOCs: Record<string, { concepto: string; total: number }[]>, targetProjectId?: string) => {
    if (!isAuthenticated) return;
    const userId = 'voltis_user_global';
    const projectId = targetProjectId || currentProjectId;
    
    setSavedProjects(prev => {
      const next = prev.map(p => p.id === projectId ? { 
        ...p, bills: updatedBills, customOCs: updatedOCs, updatedAt: Date.now() 
      } : p);
      
      const activeProject = next.find(p => p.id === projectId);
      if (activeProject) {
        setCloudSyncStatus('syncing');
        syncProjectToDB(activeProject, userId)
          .then(() => setCloudSyncStatus('synced'))
          .catch(() => setCloudSyncStatus('error'));
      }
      return next;
    });
  }, [currentProjectId, isAuthenticated]);

  const processFile = useCallback(async (file: File, queueId: string, targetProjectId: string) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (data.status === 'success') {
        const newBill = data.bill;

        // 1. Update project-keyed bills
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
          
          // Sync to storage
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
        setAllExtractionQueues(prev => ({
          ...prev,
          [targetProjectId]: (prev[targetProjectId] || []).map(item => 
            item.id === queueId ? { ...item, status: 'error' as const, error: data.error } : item
          )
        }));
        toast.error(`Error en ${file.name}: ${data.error}`);
      }
    } catch (err) {
      setAllExtractionQueues(prev => ({
        ...prev,
        [targetProjectId]: (prev[targetProjectId] || []).map(item => 
          item.id === queueId ? { ...item, status: 'error' as const, error: 'Error de red' } : item
        )
      }));
      toast.error(`Error de red en ${file.name}`);
    }
  }, [allCustomOCs, saveToDisk]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const targetProjectId = currentProjectId;
    const excelFiles = acceptedFiles.filter(f => f.name.endsWith('.xlsx'));
    if (excelFiles.length > 0) {
      const file = excelFiles[0];
      const result = await importBillsFromExcel(file);
      if (result) {
        setAllBills(prev => ({ ...prev, [targetProjectId]: result.bills }));
        setAllCustomOCs(prev => ({ ...prev, [targetProjectId]: result.customOCs }));
        saveToDisk(result.bills, result.customOCs, targetProjectId);
        toast.success('Proyecto sincronizado desde Excel');
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

  const createNewProject = async (name: string) => {
    // Debug logging
    console.log('[Project Creation] Iniciando creación:', { nameLength: name.trim().length, isAuthenticated });

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

    console.log('[Project Creation] Generando proyecto:', { newId, userId });

    const project: ProjectWorkspace = { 
      id: newId, 
      name: name.toUpperCase(), 
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
    // 1. Unified concepts
    const allOCNames = new Set<string>();
    bills.forEach(b => {
      b.otrosConceptos?.forEach(oc => allOCNames.add(oc.concepto));
      customOCs[b.id]?.forEach(oc => allOCNames.add(oc.concepto));
    });

    const concepts: any[] = [
      { key: 'fileName', label: 'Nombre Archivo' },
      { key: 'comercializadora', label: 'Compañía' },
      { key: 'titular', label: 'Titular' },
      { key: 'cups', label: 'CUPS' },
      { key: 'tarifa', label: 'Tarifa' },
      { key: 'fechaInicio', label: 'Fecha Inicio' },
      { key: 'fechaFin', label: 'Fecha Fin' },
      { key: 'divider1', label: 'Energía', isSeparator: true },
      { key: 'consumoTotalKwh', label: 'TOTAL CONSUMO (kWh)' },
      ...['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => ({ key: `cons_${p}`, label: `Consumo ${p} (kWh)` })),
      { key: 'costeTotalConsumo', label: 'TOTAL COSTE CONSUMO (€)' },
      { key: 'costeMedioKwh', label: 'COSTE MEDIO (€/kWh)' },
      { key: 'divider2', label: 'Potencia', isSeparator: true },
      { key: 'costeTotalPotencia', label: 'TOTAL COSTE POTENCIA (€)' },
      ...['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => ({ key: `pot_${p}`, label: `Potencia ${p} (€)` })),
      { key: 'divider3', label: 'Otros Conceptos', isSeparator: true },
      ...Array.from(allOCNames).map(name => ({ key: `oc_${name}`, label: name })),
      { key: 'divider4', label: 'Totales', isSeparator: true },
      { key: 'totalFactura', label: 'TOTAL FACTURA (€)' },
    ];

    const getVal = (bill: ExtractedBill, key: string): string | number => {
      if (key.startsWith('cons_')) {
        const p = key.split('_')[1];
        return bill.consumo?.find(c => c.periodo === p)?.kwh || 0;
      }
      if (key.startsWith('pot_')) {
        const p = key.split('_')[1];
        return bill.potencia?.find(c => c.periodo === p)?.total || 0;
      }
      if (key.startsWith('oc_')) {
        const name = key.substring(3);
        const ocVal = bill.otrosConceptos?.find(c => c.concepto === name)?.total || 0;
        const cVal = customOCs[bill.id]?.find(c => c.concepto === name)?.total || 0;
        return ocVal + cVal;
      }
      if (key === 'totalFactura') {
        const e = bill.costeTotalConsumo || 0;
        const p = bill.costeTotalPotencia || 0;
        let ocs = 0;
        bill.otrosConceptos?.forEach(oc => ocs += oc.total);
        customOCs[bill.id]?.forEach(oc => ocs += oc.total);
        return e + p + ocs;
      }
      return (bill as any)[key] || 0;
    };

    exportBillsToExcel(bills, concepts, getVal);
  };

  if (showReport) {
    const activeProject = savedProjects.find(p => p.id === currentProjectId);
    const projectName = activeProject?.name || 'PROYECTO';
    return (
      <div className="min-h-screen bg-[#020617] p-8 md:p-16">
        <ReportView 
          bills={bills} 
          customOCs={customOCs} 
          onBack={() => setShowReport(false)} 
          projectName={projectName}
          projectId={currentProjectId}
          onPreviewBill={(id) => setPreviewBillId(id)}
        />
      </div>
    );
  }


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
                <Layers className="w-3 h-3" /> Proyectos Activos
              </h3>
              <button 
                onClick={() => { setShowNewProjectModal(true); setNewProjectName(''); }}
                className="p-1.5 hover:bg-white/5 text-blue-500 rounded-lg transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[50vh] pr-2 custom-scrollbar">
              {savedProjects.sort((a,b) => b.updatedAt - a.updatedAt).map(proj => {
                const isActive = proj.id === currentProjectId;
                return (
                   <motion.div 
                    key={proj.id}
                    whileHover={{ x: renamingProjectId === proj.id ? 0 : 4 }}
                    onClick={() => renamingProjectId !== proj.id && loadWorkspace(proj)}
                    className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border ${
                      isActive 
                        ? 'bg-blue-600/10 border-blue-500/30 text-white shadow-xl shadow-blue-900/10' 
                        : 'bg-transparent border-transparent text-slate-500 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex flex-col gap-1 overflow-hidden flex-1 min-w-0">
                      {renamingProjectId === proj.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameProject(proj.id, renameValue);
                            if (e.key === 'Escape') setRenamingProjectId(null);
                          }}
                          onBlur={() => renameProject(proj.id, renameValue)}
                          className="bg-transparent border-b border-blue-500 text-blue-300 font-bold text-[12px] uppercase tracking-wider focus:outline-none w-full"
                        />
                      ) : (
                        <span className={`font-bold truncate text-[12px] uppercase tracking-wider ${isActive ? 'text-blue-400' : ''}`}>{proj.name}</span>
                      )}
                      <span className="text-[10px] opacity-40 font-medium">{proj.bills?.length || 0} Facturas</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); setRenamingProjectId(proj.id); setRenameValue(proj.name); }}
                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {isActive && (
                        <button onClick={(e) => deleteProject(proj.id, e)} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
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
                   cloudSyncStatus === 'error' ? 'Cloud Error' : 'Offline Mode'}
                </span>
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
                onClick={() => setShowReport(true)}
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
              glass-card p-14 rounded-[40px] border border-white/5 text-center flex flex-col items-center gap-6 overflow-hidden scanner-glow
              ${isDragActive ? 'border-blue-500/50 bg-blue-500/5' : 'hover:border-white/10'}
            `}>
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
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
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

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.2); }
      `}</style>
    </div>
  );
}

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

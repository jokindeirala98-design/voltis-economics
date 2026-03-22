"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, Upload, Trash2, Download, AlertTriangle, 
  CheckCircle, Loader2, Plus, FolderOpen, Edit2, 
  BarChart3, LayoutDashboard, Settings, LogOut,
  ChevronRight, Sparkles, Zap, Smartphone, Layers, X
} from 'lucide-react';
import { toast } from 'sonner';
import { ExtractedBill, ProjectWorkspace } from '@/lib/types';
import FileTable from '@/components/FileTable';
import { exportBillsToExcel } from '@/lib/export';
import { importBillsFromExcel } from '@/lib/import-bills';
import ReportView from '@/components/ReportView';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchAllProjectsFromDB, syncProjectToDB, deleteProjectFromDB } from '@/lib/supabase-sync';

export default function EnergyBillsApp() {
  const [bills, setBills] = useState<ExtractedBill[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string>('default');
  const [savedProjects, setSavedProjects] = useState<ProjectWorkspace[]>([]);
  const [customOCs, setCustomOCs] = useState<Record<string, { concepto: string; total: number }[]>>({});
  const [showReport, setShowReport] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [extractionQueue, setExtractionQueue] = useState<{ id: string; fileName: string; status: 'loading' | 'success' | 'error'; error?: string; file?: File }[]>([]);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'local'>('local');

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('voltis_auth') === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const masterPassword = process.env.NEXT_PUBLIC_APP_PASSWORD || 'voltis2026';
    if (password === masterPassword) {
      setIsAuthenticated(true);
      sessionStorage.setItem('voltis_auth', 'true');
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

  // Multi-layer Initialization (LocalStorage -> Cloud)
  useEffect(() => {
    const initStorage = async () => {
      // 1. Load from LocalStorage (Immediate feedback)
      const localData = localStorage.getItem('voltis_saved_projects');
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (parsed && parsed.length > 0) {
            setSavedProjects(parsed);
            const lastId = localStorage.getItem('voltis_last_project') || parsed[0].id;
            setCurrentProjectId(lastId);
            const active = parsed.find((p: any) => p.id === lastId) || parsed[0];
            setBills(active.bills || []);
            setCustomOCs(active.customOCs || {});
          }
        } catch (e) { console.warn('Local storage parse error', e); }
      }

      // 2. Sync from Cloud (Background)
      setCloudSyncStatus('syncing');
      const dbProjects = await fetchAllProjectsFromDB();
      if (dbProjects && dbProjects.length > 0) {
        setSavedProjects(dbProjects);
        localStorage.setItem('voltis_saved_projects', JSON.stringify(dbProjects));
        
        // Update view if cloud is newer or if we had no local data
        const lastId = localStorage.getItem('voltis_last_project') || dbProjects[0].id;
        const active = dbProjects.find(p => p.id === lastId) || dbProjects[0];
        if (active) {
          setBills(active.bills || []);
          setCustomOCs(active.customOCs || {});
        }
        setCloudSyncStatus('synced');
      } else if (dbProjects) {
        setCloudSyncStatus('synced');
      } else {
        setCloudSyncStatus('error');
      }
    };
    initStorage();
  }, []);

  const saveToDisk = useCallback(async (updatedBills: ExtractedBill[], updatedOCs: Record<string, any>) => {
    setSavedProjects(prev => {
      const next = prev.map(p => p.id === currentProjectId ? { 
        ...p, bills: updatedBills, customOCs: updatedOCs, updatedAt: Date.now() 
      } : p);
      
      // Immediate Local Save
      localStorage.setItem('voltis_saved_projects', JSON.stringify(next));

      // Background Cloud Sync
      const activeProject = next.find(p => p.id === currentProjectId);
      if (activeProject) {
        setCloudSyncStatus('syncing');
        syncProjectToDB(activeProject)
          .then(() => setCloudSyncStatus('synced'))
          .catch(() => setCloudSyncStatus('error'));
      }
      return next;
    });
  }, [currentProjectId]);

  const processFile = useCallback(async (file: File, queueId: string) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (data.status === 'success') {
        setBills(prev => {
          const next = [...prev, data.bill];
          saveToDisk(next, customOCs);
          return next;
        });
        setExtractionQueue(prev => prev.map(item => 
          item.id === queueId ? { ...item, status: 'success' } : item
        ));
      } else {
        setExtractionQueue(prev => prev.map(item => 
          item.id === queueId ? { ...item, status: 'error', error: data.error } : item
        ));
        toast.error(`Error en ${file.name}: ${data.error}`);
      }
    } catch (err) {
      setExtractionQueue(prev => prev.map(item => 
        item.id === queueId ? { ...item, status: 'error', error: 'Error de red' } : item
      ));
      toast.error(`Error de red en ${file.name}`);
    }
  }, [customOCs, saveToDisk]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const excelFiles = acceptedFiles.filter(f => f.name.endsWith('.xlsx'));
    if (excelFiles.length > 0) {
      const file = excelFiles[0];
      const result = await importBillsFromExcel(file);
      if (result) {
        setBills(result.bills);
        setCustomOCs(result.customOCs);
        saveToDisk(result.bills, result.customOCs);
        toast.success('Proyecto sincronizado desde Excel');
      }
      return;
    }

    setIsExtracting(true);
    
    // Initialize queue with all dropped files
    const newItems = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      fileName: file.name,
      status: 'loading' as const,
      file // Store raw file for retries
    }));
    setExtractionQueue(prev => [...newItems, ...prev]);

    for (let i = 0; i < acceptedFiles.length; i++) {
       await processFile(acceptedFiles[i], newItems[i].id);
    }
    setIsExtracting(false);
  }, [customOCs, saveToDisk, processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } 
  });

  const createNewProject = async () => {
    const name = prompt('Nombre del nuevo proyecto:');
    if (!name) return;
    const project: ProjectWorkspace = { id: crypto.randomUUID(), name: name.toUpperCase(), bills: [], customOCs: {}, updatedAt: Date.now() };
    
    setSavedProjects(prev => {
      const next = [...prev, project];
      localStorage.setItem('voltis_saved_projects', JSON.stringify(next));
      setCloudSyncStatus('syncing');
      syncProjectToDB(project).then(() => setCloudSyncStatus('synced')).catch(() => setCloudSyncStatus('error'));
      return next;
    });
    
    loadWorkspace(project);
    toast.success('Proyecto creado localmente y sincronizando...');
  };

  const loadWorkspace = (proj: ProjectWorkspace) => {
    setCurrentProjectId(proj.id);
    setBills(proj.bills || []);
    setCustomOCs(proj.customOCs || {});
    localStorage.setItem('voltis_last_project', proj.id);
    setShowReport(false);
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('¿Eliminar este proyecto permanentemente de la nube y del navegador?')) {
      const next = savedProjects.filter(p => p.id !== id);
      setSavedProjects(next);
      localStorage.setItem('voltis_saved_projects', JSON.stringify(next));
      
      setCloudSyncStatus('syncing');
      deleteProjectFromDB(id).then(() => setCloudSyncStatus('synced')).catch(() => setCloudSyncStatus('error'));
      
      if (currentProjectId === id) loadWorkspace(next[0] || { id: crypto.randomUUID(), name: 'HUÉRFANO', bills: [] });
      toast.success('Proyecto eliminado');
    }
  };

  const renameProject = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    const upperName = newName.toUpperCase();
    setSavedProjects(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name: upperName, updatedAt: Date.now() } : p);
      localStorage.setItem('voltis_saved_projects', JSON.stringify(next));
      
      const updated = next.find(p => p.id === id);
      if (updated) {
        setCloudSyncStatus('syncing');
        syncProjectToDB(updated).then(() => setCloudSyncStatus('synced')).catch(() => setCloudSyncStatus('error'));
      }
      return next;
    });
    toast.success('Nombre actualizado');
    setRenamingProjectId(null);
  };

  const handleUpdateBills = (newBills: ExtractedBill[]) => {
    setBills(newBills);
    saveToDisk(newBills, customOCs);
  };

  const handleUpdateOCs = (billId: string, ocs: { concepto: string; total: number }[]) => {
    setCustomOCs(prev => {
      const next = { ...prev, [billId]: ocs };
      saveToDisk(bills, next);
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
      { key: 'comercializadora', label: 'Compañía' },
      { key: 'titular', label: 'Titular' },
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

  if (showReport) return <div className="min-h-screen bg-[#020617] p-8 md:p-16"><ReportView bills={bills} customOCs={customOCs} onBack={() => setShowReport(false)} /></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 font-inter text-slate-100 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-10 rounded-[32px] border border-white/10 w-full max-w-md flex flex-col items-center gap-8 relative z-10"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="w-8 h-8 text-white" />
          </div>
          
          <div className="text-center flex flex-col gap-2">
            <h1 className="text-3xl font-black tracking-tighter text-white">ACCESO VOLTIS</h1>
            <p className="text-sm text-slate-400 font-medium">Introduce la clave maestra de acceso</p>
          </div>

          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <input 
                type="password" 
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAuthError(false); }}
                placeholder="Contraseña..."
                className={`w-full bg-black/50 border ${authError ? 'border-red-500/50' : 'border-white/10'} rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors`}
              />
              {authError && <span className="text-xs text-red-400 font-medium px-1">Contraseña incorrecta</span>}
            </div>
            
            <button 
              type="submit"
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
            >
              Entrar al Sistema <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        </motion.div>
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
                onClick={createNewProject}
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
          <div className="glass p-4 rounded-2xl border border-white/5 flex items-center gap-4">
             <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10" />
             <div className="flex flex-col">
               <span className="text-xs font-bold text-white uppercase tracking-tight">User Admin</span>
               <span className="text-[10px] text-slate-500 tracking-wider">Plan Premium</span>
             </div>
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
                 <span className="text-sm font-bold text-blue-400 tracking-[0.3em] uppercase opacity-80">
                   {savedProjects.find(p => p.id === currentProjectId)?.name}
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
                   <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
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
                    onClick={() => setExtractionQueue([])}
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
                          {item.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                           item.status === 'success' ? <CheckCircle className="w-4 h-4" /> :
                           <X className="w-4 h-4" />}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-xs font-bold text-white truncate">{item.fileName}</span>
                          {item.error && <span className="text-[10px] text-red-400 font-medium truncate">{item.error}</span>}
                          {item.status === 'success' && <span className="text-[10px] text-emerald-400 font-medium">Extraída correctamente</span>}
                          {item.status === 'loading' && <span className="text-[10px] text-blue-400 font-medium animate-pulse">Analizando con Llama 3.3...</span>}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {item.status === 'error' && item.file && (
                          <button 
                            onClick={() => {
                              setExtractionQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'loading' as const, error: undefined } : q));
                              processFile(item.file!, item.id);
                            }}
                            className="px-3 py-1 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-lg border border-blue-500/30 hover:bg-blue-600/40 transition-all uppercase tracking-tighter"
                          >
                            Reintentar
                          </button>
                        )}
                        {item.status !== 'loading' && (
                          <button 
                            onClick={() => setExtractionQueue(prev => prev.filter(q => q.id !== item.id))}
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

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.2); }
      `}</style>
    </div>
  );
}

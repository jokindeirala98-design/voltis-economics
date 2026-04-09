"use client";

import React from 'react';
import { 
  Folder, 
  Plus, 
  ChevronRight, 
  Box, 
  Trash2, 
  RefreshCw,
  LayoutDashboard
} from 'lucide-react';

interface SidebarContentProps {
  projects: any[];
  folders: any[];
  currentProjectId: string;
  onProjectSelect: (id: string) => void;
  onFolderSelect: (id: string | null) => void;
  onNewProject: () => void;
  onNewFolder: () => void;
  onDeleteProject: (id: string, name: string) => void;
  onManualSync: () => void;
  isSyncing: boolean;
  currentFolderId: string | null;
}

export default function SidebarContent({
  projects,
  folders,
  currentProjectId,
  onProjectSelect,
  onFolderSelect,
  onNewProject,
  onNewFolder,
  onDeleteProject,
  onManualSync,
  isSyncing,
  currentFolderId
}: SidebarContentProps) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2 space-y-6">
      {/* Sync Control */}
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Sincronización</span>
        <button 
          onClick={onManualSync}
          disabled={isSyncing}
          className={`p-1.5 rounded-lg hover:bg-white/5 transition-all ${isSyncing ? 'text-blue-400' : 'text-slate-500'}`}
          title="Sincronizar ahora"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Folders Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Carpetas</span>
          <button onClick={onNewFolder} className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded transition-colors touch-target">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        
        <button
          onClick={() => onFolderSelect(null)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${!currentFolderId ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-white/5'}`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Todos los Proyectos</span>
        </button>

        {folders.map(folder => (
          <button
            key={folder.id}
            onClick={() => onFolderSelect(folder.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${currentFolderId === folder.id ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-white/5'}`}
          >
            <Folder className={`w-4 h-4 ${currentFolderId === folder.id ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
            <span className="text-xs font-bold uppercase tracking-wider truncate flex-1 text-left">{folder.name}</span>
          </button>
        ))}
      </div>

      {/* Projects Section */}
      <div className="space-y-2 pb-10">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Proyectos</span>
          <button onClick={onNewProject} className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded transition-colors touch-target">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="px-2 py-4 text-center border-2 border-dashed border-white/5 rounded-2xl">
            <Box className="w-6 h-6 text-slate-700 mx-auto mb-2" />
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Sin proyectos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {projects.map(project => (
              <div key={project.id} className="group relative">
                <button
                  onClick={() => onProjectSelect(project.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${currentProjectId === project.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-white/5'}`}
                >
                  <Box className={`w-4 h-4 flex-shrink-0 ${currentProjectId === project.id ? 'text-white' : 'text-slate-600 group-hover:text-slate-400'}`} />
                  <span className="text-[11px] font-black uppercase tracking-widest truncate flex-1 text-left">
                    {project.name}
                  </span>
                  {currentProjectId === project.id ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(project.id, project.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-slate-600 hover:text-red-400 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

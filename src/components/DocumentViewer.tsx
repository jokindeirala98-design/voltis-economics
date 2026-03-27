"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { 
  ZoomIn, ZoomOut, RotateCcw, Download, 
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  FileText, ImageIcon, X, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DocumentViewerProps {
  src: string;
  type: 'pdf' | 'image';
  fileName?: string;
  onClose?: () => void;
}

export default function DocumentViewer({ src, type, fileName, onClose }: DocumentViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };

  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = src;
    link.download = fileName || (type === 'pdf' ? 'factura.pdf' : 'factura.jpg');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [src, fileName, type]);

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  // Base64 check to handle both URLs and Base64 strings
  const isBase64 = src.startsWith('data:');

  return (
    <div className={`relative flex flex-col w-full h-full bg-slate-950/50 overflow-hidden ${isFullScreen ? 'fixed inset-0 z-[1000]' : ''}`}>
      {/* Header Controls */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-white/10 bg-black/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg ${type === 'pdf' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
            {type === 'pdf' ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">{fileName || 'Documento'}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              {type === 'pdf' ? 'Archivo PDF' : 'Imagen'} • {Math.round(scale * 100)}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-1 mr-2 hidden md:flex">
            <button 
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all touch-target"
              title="Alejar"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button 
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all touch-target"
              title="Acercar"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button 
              onClick={handleReset}
              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all touch-target"
              title="Resetear"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={handleDownload}
            className="p-2 md:p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-600/20 touch-target"
            title="Descargar"
          >
            <Download className="w-4 h-4 md:w-5 h-5" />
          </button>

          {onClose && (
            <button 
              onClick={onClose}
              className="p-2 md:p-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl border border-white/10 transition-all touch-target"
              title="Cerrar"
            >
              <X className="w-4 h-4 md:w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-auto bg-slate-900/40 design-scrollbar flex items-center justify-center p-4">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20 backdrop-blur-sm z-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando factura...</p>
            </div>
          </div>
        )}

        <div 
          className="transition-transform duration-200 ease-out origin-center"
          style={{ 
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            width: type === 'pdf' ? '100%' : 'auto',
            height: type === 'pdf' ? '100%' : 'auto'
          }}
        >
          {type === 'pdf' ? (
            <iframe 
              src={`${src}#toolbar=0&navpanes=0&scrollbar=0`}
              className="w-full h-full min-h-[60vh] md:min-h-[80vh] rounded-xl shadow-2xl bg-white border-none"
              title="PDF Viewer"
              onLoad={() => setIsLoading(false)}
            />
          ) : (
            <img 
              src={src} 
              alt={fileName || 'Document preview'} 
              className="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain border border-white/10 bg-white"
              onLoad={() => setIsLoading(false)}
            />
          )}
        </div>
      </div>

      {/* Floating Mobile Controls (Zoom) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 md:hidden flex items-center gap-1 bg-black/60 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl shadow-2xl z-20">
        <button 
          onClick={handleZoomOut}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-white/60 active:scale-95 transition-all"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/10 mx-1" />
        <span className="text-[10px] font-black text-white/40 w-10 text-center uppercase">
          {Math.round(scale * 100)}%
        </span>
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button 
          onClick={handleZoomIn}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-white active:scale-95 transition-all"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button 
          onClick={handleReset}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-white/60 active:scale-95 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Pagination (Future enhancement or simulated if possible) */}
      {type === 'pdf' && (
        <div className="absolute bottom-6 right-6 hidden md:flex items-center gap-3 bg-black/60 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl z-20">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2">Navegación nativa activada</p>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Camera, Image, X, Check, Trash2, Plus, ChevronLeft, 
  Loader, AlertCircle, FileText, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CameraFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
}

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];

export default function CameraFlowModal({ isOpen, onClose, onFilesSelected, maxFiles = 10 }: CameraFlowModalProps) {
  const [stagedFiles, setStagedFiles] = useState<{ file: File; preview: string; id: string }[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [heicWarning, setHeicWarning] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      stagedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    };
  }, []);

  const createPreview = useCallback((file: File): Promise<string> => {
    return new Promise((resolve) => {
      // Check if HEIC
      const isHeic = HEIC_TYPES.includes(file.type) || /\.heic$/i.test(file.name);
      
      if (isHeic) {
        // Try to create preview
        const img = document.createElement('img');
        const objectUrl = URL.createObjectURL(file);
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(URL.createObjectURL(blob));
              } else {
                resolve(objectUrl);
              }
            }, 'image/jpeg', 0.8);
          } else {
            resolve(objectUrl);
          }
          URL.revokeObjectURL(objectUrl);
        };
        
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          // Return a placeholder
          resolve('');
        };
        
        img.src = objectUrl;
      } else {
        resolve(URL.createObjectURL(file));
      }
    });
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const remaining = maxFiles - stagedFiles.length;
    if (remaining <= 0) return;
    
    const toAdd = Array.from(files).slice(0, remaining);
    const newStaged: { file: File; preview: string; id: string }[] = [];
    
    for (const file of toAdd) {
      const preview = await createPreview(file);
      newStaged.push({
        file,
        preview,
        id: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
    }
    
    setStagedFiles(prev => [...prev, ...newStaged]);
    
    // Check for HEIC files that couldn't be previewed
    const heicFiles = toAdd.filter(f => 
      HEIC_TYPES.includes(f.type) || /\.heic$/i.test(f.name)
    );
    
    if (heicFiles.length > 0 && newStaged.some(s => !s.preview)) {
      setHeicWarning('Algunas fotos HEIC no pudieron ser procesadas. Conviértelas a JPG para mejor calidad.');
    }
  }, [stagedFiles.length, maxFiles, createPreview]);

  const removeFile = useCallback((id: string) => {
    setStagedFiles(prev => {
      const removed = prev.find(f => f.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  }, []);

  const handleCameraCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFiles(files);
    }
    // Reset input
    if (e.target) e.target.value = '';
    setShowCamera(false);
  }, [addFiles]);

  const handleGallerySelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFiles(files);
    }
    if (e.target) e.target.value = '';
  }, [addFiles]);

  const handleProcess = useCallback(async () => {
    if (stagedFiles.length === 0) return;
    
    setIsProcessing(true);
    
    // Give a moment for UI feedback
    await new Promise(resolve => setTimeout(resolve, 300));
    
    onFilesSelected(stagedFiles.map(s => s.file));
    
    // Clean up previews
    stagedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    setStagedFiles([]);
    setIsProcessing(false);
  }, [stagedFiles, onFilesSelected]);

  const handleClose = useCallback(() => {
    // Clean up previews
    stagedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    setStagedFiles([]);
    setShowCamera(false);
    onClose();
  }, [stagedFiles, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[700] bg-black flex flex-col"
    >
      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        onChange={handleGallerySelect}
        className="hidden"
      />

      {/* HEIC Warning */}
      <AnimatePresence>
        {heicWarning && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-4 right-4 z-10 bg-amber-500/95 backdrop-blur text-black px-4 py-3 rounded-xl text-xs font-medium flex items-start gap-2 shadow-xl"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Formato HEIC detectado</p>
              <p className="text-amber-900">{heicWarning}</p>
            </div>
            <button onClick={() => setHeicWarning(null)} className="flex-shrink-0 p-1">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/50">
        <button 
          onClick={handleClose}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors touch-target"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Cancelar</span>
        </button>
        
        <div className="text-center">
          <span className="text-white font-bold text-sm">
            {stagedFiles.length > 0 ? `${stagedFiles.length} foto${stagedFiles.length > 1 ? 's' : ''}` : 'Nueva factura'}
          </span>
        </div>
        
        <div className="w-20" /> {/* Spacer for centering */}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {stagedFiles.length === 0 ? (
          /* Empty State - Show Capture Options */
          <div className="h-full flex flex-col items-center justify-center gap-6">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
              <Camera className="w-10 h-10 text-white/30" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-lg mb-1">Sube tus facturas</p>
              <p className="text-white/40 text-sm">Toma una foto o selecciona de tu galería</p>
            </div>
            
            <div className="w-full max-w-xs space-y-3 mt-4">
              {/* Take Photo */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-blue-600 text-white font-bold transition-all active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold">Hacer foto</p>
                  <p className="text-xs text-white/60">Usar la cámara</p>
                </div>
              </button>
              
              {/* Gallery */}
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-white font-medium transition-all active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                  <Image className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold">Galería</p>
                  <p className="text-xs text-white/60">Seleccionar de archivos</p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Staged Files - Show Previews */
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {stagedFiles.map((staged) => (
                <motion.div
                  key={staged.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-white/5 border border-white/10"
                >
                  {staged.preview ? (
                    <img 
                      src={staged.preview} 
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText className="w-8 h-8 text-white/20" />
                    </div>
                  )}
                  
                  {/* Remove Button */}
                  <button
                    onClick={() => removeFile(staged.id)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white/80 hover:text-white hover:bg-red-500/80 transition-all touch-target"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  
                  {/* File Name */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-[10px] text-white/60 truncate">{staged.file.name}</p>
                  </div>
                </motion.div>
              ))}
              
              {/* Add More Button */}
              {stagedFiles.length < maxFiles && (
                <button
                  onClick={() => setShowCamera(true)}
                  className="aspect-[3/4] rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 text-white/40 hover:border-white/40 hover:text-white/60 transition-all touch-target"
                >
                  <Plus className="w-8 h-8" />
                  <span className="text-xs font-medium">Añadir más</span>
                </button>
              )}
            </div>
            
            {/* File List */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                {stagedFiles.length} archivo{stagedFiles.length > 1 ? 's' : ''} listo{stagedFiles.length > 1 ? 's' : ''}
              </p>
              {stagedFiles.map((staged, idx) => (
                <div key={staged.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
                    {staged.preview ? (
                      <img src={staged.preview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="w-5 h-5 text-white/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{staged.file.name}</p>
                    <p className="text-[10px] text-white/40">{(staged.file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={() => removeFile(staged.id)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors touch-target"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add More Options (when files are staged) */}
      <AnimatePresence>
        {showCamera && stagedFiles.length > 0 && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="absolute bottom-0 left-0 right-0 bg-slate-900 rounded-t-3xl p-6 pb-safe border-t border-white/10"
          >
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-blue-600 text-white font-bold transition-all active:scale-[0.98]"
              >
                <Camera className="w-5 h-5" />
                <span>Hacer otra foto</span>
              </button>
              
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-white/10 text-white font-medium transition-all active:scale-[0.98]"
              >
                <Image className="w-5 h-5" />
                <span>Añadir de galería</span>
              </button>
            </div>
            
            <button
              onClick={() => setShowCamera(false)}
              className="w-full mt-3 py-3 text-sm text-white/40 hover:text-white transition-colors"
            >
              Cerrar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer - Process Button */}
      {stagedFiles.length > 0 && !showCamera && (
        <div className="p-4 border-t border-white/10 bg-black/50 safe-area-bottom">
          <button
            onClick={handleProcess}
            disabled={isProcessing || stagedFiles.length === 0}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-blue-600 text-white font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] touch-target"
          >
            {isProcessing ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Procesando...</span>
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                <span>Procesar {stagedFiles.length} foto{stagedFiles.length > 1 ? 's' : ''}</span>
              </>
            )}
          </button>
          
          {stagedFiles.length < maxFiles && (
            <button
              onClick={() => setShowCamera(true)}
              className="w-full mt-2 py-3 text-sm text-white/60 hover:text-white transition-colors flex items-center justify-center gap-2 touch-target"
            >
              <Plus className="w-4 h-4" />
              <span>Añadir más fotos</span>
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

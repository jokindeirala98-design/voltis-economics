"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Image, FileText, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CameraFlowModal from './CameraFlowModal';
import { validateImageFile } from '@/lib/image-utils';

interface MobileUploadOptions {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  accept?: string;
  disabled?: boolean;
}

export function MobileUploadButton({ onFilesSelected, maxFiles = 10, accept, disabled }: MobileUploadOptions) {
  const [showOptions, setShowOptions] = useState(false);
  const [showCameraFlow, setShowCameraFlow] = useState(false);
  const [heicWarning, setHeicWarning] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isTouchDevice || isMobileUA);
    };
    checkMobile();
  }, []);

  const handleFileSelection = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate all files asynchronously
    const validationResults = await Promise.all(
      files.map(async (file) => {
        const result = await validateImageFile(file);
        return { file, ...result };
      })
    );

    // Separate valid and invalid files
    const validFiles = validationResults
      .filter(r => r.valid)
      .map(r => r.file);
    
    const warnings = validationResults
      .filter(r => !r.valid && r.warning)
      .map(r => r.warning!);

    // Show warning if any files failed validation
    if (warnings.length > 0) {
      setHeicWarning(warnings.slice(0, 3).join('\n'));
      setTimeout(() => setHeicWarning(null), 5000);
    }
    
    // Pass valid files to parent
    if (validFiles.length > 0) {
      onFilesSelected(validFiles.slice(0, maxFiles));
    }

    if (e.target) e.target.value = '';
    setShowOptions(false);
  }, [onFilesSelected, maxFiles]);

  const handleGallerySelect = () => {
    galleryInputRef.current?.click();
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleCameraSelect = () => {
    setShowOptions(false);
    setShowCameraFlow(true);
  };

  const handleCameraFlowClose = () => {
    setShowCameraFlow(false);
  };

  const handleFilesFromCameraFlow = (files: File[]) => {
    onFilesSelected(files);
    setShowCameraFlow(false);
  };

  // Desktop: Return hidden input only (desktop uses dropzone)
  if (!isMobile) {
    return (
      <input
        ref={fileInputRef}
        type="file"
        accept={accept || '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.xlsx,.xls'}
        multiple
        onChange={handleFileSelection}
        className="hidden"
        disabled={disabled}
      />
    );
  }

  const standardAccept = accept || '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.xlsx,.xls';
  const imageAccept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

  return (
    <>
      {/* Camera Flow Modal - Full screen camera experience */}
      <CameraFlowModal
        isOpen={showCameraFlow}
        onClose={handleCameraFlowClose}
        onFilesSelected={handleFilesFromCameraFlow}
        maxFiles={maxFiles}
      />
      
      <div className="w-full">
        {/* Hidden file inputs */}
        <input
          ref={galleryInputRef}
          type="file"
          accept={imageAccept}
          multiple
          onChange={handleFileSelection}
          className="hidden"
          disabled={disabled}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={standardAccept}
          multiple
          onChange={handleFileSelection}
          className="hidden"
          disabled={disabled}
        />

        {/* HEIC Warning Toast */}
        <AnimatePresence>
          {heicWarning && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-4 left-4 right-4 z-[100] bg-amber-500/95 backdrop-blur text-black px-4 py-3 rounded-xl text-xs font-medium flex items-start gap-2 shadow-xl"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Formato no soportado</p>
                <p className="text-amber-900">{heicWarning}</p>
              </div>
              <button onClick={() => setHeicWarning(null)} className="flex-shrink-0 p-1">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Upload Options Modal */}
        <AnimatePresence>
          {showOptions && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
              onClick={() => setShowOptions(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-slate-900 w-full max-w-md rounded-t-3xl p-6 pb-8 border-t border-slate-800"
                onClick={e => e.stopPropagation()}
              >
                {/* Handle bar */}
                <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-6" />
                
                <h3 className="text-lg font-bold text-white text-center mb-6">
                  Seleccionar factura
                </h3>

                <div className="grid grid-cols-3 gap-3">
                  {/* Camera Option - Opens CameraFlowModal */}
                  <button
                    onClick={handleCameraSelect}
                    disabled={disabled}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 active:bg-slate-700 transition-all disabled:opacity-50 min-h-[90px]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center">
                      <Camera className="w-6 h-6 text-blue-400" />
                    </div>
                    <span className="text-xs font-bold text-white text-center leading-tight">Hacer foto</span>
                  </button>

                  {/* Gallery Option */}
                  <button
                    onClick={handleGallerySelect}
                    disabled={disabled}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 active:bg-slate-700 transition-all disabled:opacity-50 min-h-[90px]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-emerald-600/20 flex items-center justify-center">
                      <Image className="w-6 h-6 text-emerald-400" />
                    </div>
                    <span className="text-xs font-bold text-white text-center leading-tight">Galería</span>
                  </button>

                  {/* Files Option */}
                  <button
                    onClick={handleFileSelect}
                    disabled={disabled}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 active:bg-slate-700 transition-all disabled:opacity-50 min-h-[90px]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-purple-400" />
                    </div>
                    <span className="text-xs font-bold text-white text-center leading-tight">Archivos</span>
                  </button>
                </div>

                <p className="text-center text-slate-500 text-xs mt-4">
                  PDF, JPG, PNG, WEBP, HEIC, Excel
                </p>

                <button
                  onClick={() => setShowOptions(false)}
                  className="w-full mt-4 py-3 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Trigger Button */}
        <button
          onClick={() => setShowOptions(true)}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-base transition-all disabled:opacity-50 shadow-lg shadow-blue-600/25"
        >
          <Camera className="w-5 h-5" />
          <span>Subir factura</span>
        </button>
      </div>
    </>
  );
}

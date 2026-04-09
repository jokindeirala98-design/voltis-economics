import { useState } from 'react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { ProjectWorkspace } from '@/lib/types';

export interface ExportProgress {
  total: number;
  current: number;
  status: 'idle' | 'preparing' | 'generating' | 'zipping' | 'completed' | 'error';
  message: string;
}

export function useFolderExport() {
  const [progress, setProgress] = useState<ExportProgress>({
    total: 0,
    current: 0,
    status: 'idle',
    message: ''
  });

  const downloadFolderZIP = async (folderName: string, projects: ProjectWorkspace[]) => {
    if (projects.length === 0) {
      toast.error('La carpeta está vacía');
      return;
    }

    const projectsWithBills = projects.filter(p => p.bills && p.bills.length > 0);
    if (projectsWithBills.length === 0) {
      toast.error('No hay informes PDF disponibles para descargar en esta carpeta');
      return;
    }

    setProgress({
      total: projectsWithBills.length,
      current: 0,
      status: 'preparing',
      message: `Preparando descarga de ${projectsWithBills.length} informes...`
    });

    const zip = new JSZip();
    let successCount = 0;
    let failCount = 0;

    try {
      // Process in small batches or one by one to avoid overwhelming the serverless function
      // but still provide some concurrency.
      const CONCURRENCY = 2;
      
      for (let i = 0; i < projectsWithBills.length; i += CONCURRENCY) {
        const batch = projectsWithBills.slice(i, i + CONCURRENCY);
        
        await Promise.all(batch.map(async (project) => {
          try {
            setProgress(prev => ({
              ...prev,
              status: 'generating',
              message: `Generando PDF: ${project.name}...`
            }));

            // We use POST with the bills if available, or GET if we want to rely on DB
            // POST is safer since we have the latest state in the frontend.
            const response = await fetch('/api/export-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId: project.id,
                projectName: project.name,
                bills: project.bills,
                customOCs: project.customOCs,
                format: 'pdf'
              })
            });

            if (!response.ok) throw new Error(`Status ${response.status}`);

            const blob = await response.blob();
            // Sanitize filename
            const fileName = project.name.replace(/[^a-z0-9]/gi, '_').toUpperCase() + '.pdf';
            zip.file(fileName, blob);
            
            successCount++;
            setProgress(prev => ({
              ...prev,
              current: prev.current + 1,
              message: `Generado ${prev.current + 1}/${projectsWithBills.length}: ${project.name}`
            }));
          } catch (err) {
            console.error(`Failed to export project ${project.name}:`, err);
            failCount++;
          }
        }));
      }

      if (successCount === 0) {
        throw new Error('No se pudo generar ningún PDF');
      }

      setProgress(prev => ({ ...prev, status: 'zipping', message: 'Comprimiendo archivos...' }));
      const content = await zip.generateAsync({ type: 'blob' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${folderName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_INFORMES.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setProgress({
         total: projectsWithBills.length,
         current: successCount,
         status: 'completed',
         message: `Descarga completada: ${successCount} PDFs incluidos${failCount > 0 ? `, ${failCount} fallidos` : ''}`
      });
      
      if (failCount > 0) {
        toast.warning(`Descarga parcial: ${successCount} exitosos, ${failCount} fallidos.`);
      } else {
        toast.success(`¡Descarga completada! ${successCount} informes.`);
      }

    } catch (err: any) {
      console.error('ZIP generation failed:', err);
      setProgress(prev => ({ ...prev, status: 'error', message: `Error: ${err.message}` }));
      toast.error('Fallo al generar el archivo ZIP');
    } finally {
      // Auto-reset after a delay
      setTimeout(() => {
        setProgress(prev => prev.status === 'completed' ? { ...prev, status: 'idle' } : prev);
      }, 5000);
    }
  };

  return { progress, downloadFolderZIP };
}

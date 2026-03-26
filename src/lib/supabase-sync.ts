import { supabase } from './supabase';
import { ProjectWorkspace, ExtractedBill } from './types';

/**
 * Fetch a single project by ID (server-side safe)
 * Used by PDF export and other server routes
 */
export async function fetchProjectById(projectId: string): Promise<ProjectWorkspace | null> {
  try {
    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    
    if (pErr) { 
      console.error('Error fetching project:', pErr); 
      return null; 
    }
    if (!project) return null;

    const { data: bills, error: bErr } = await supabase
      .from('bills')
      .select('*')
      .eq('project_id', projectId);
    if (bErr) { console.error('Error fetching bills:', bErr); }

    const { data: concepts, error: cErr } = await supabase
      .from('custom_concepts')
      .select('*');
    if (cErr) { console.error('Error fetching concepts:', cErr); }

    const pBills = (bills || [])
      .filter(b => b.project_id === projectId)
      .map(b => {
        const rawData = b.raw_data as ExtractedBill;
        return {
          ...rawData,
          extractionStatus: b.extraction_status,
          validationStatus: b.validation_status,
          mathCheckPassed: b.math_check_passed,
          discrepancyAmount: b.discrepancy_amount,
          reviewAttempts: b.review_attempts,
          validationNotes: b.validation_notes,
          lastValidatedAt: b.last_validated_at,
          storagePath: b.storage_path,
          fileHash: b.file_hash
        } as ExtractedBill;
      });
    
    const pOCs: Record<string, any> = {};
    pBills.forEach(b => {
      const bConcepts = (concepts || []).find(c => c.bill_id === b.id);
      if (bConcepts && bConcepts.data) {
        pOCs[b.id] = bConcepts.data;
      }
    });

    return {
      id: project.id,
      name: project.name,
      updatedAt: new Date(project.updated_at).getTime(),
      bills: pBills,
      customOCs: pOCs,
    };
  } catch (error) {
    console.error('Fatal project fetch error:', error);
    return null;
  }
}

export async function fetchAllProjectsFromDB(userId: string): Promise<ProjectWorkspace[]> {
  try {
    const { data: projects, error: pErr } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (pErr) { console.error('Error fetching projects:', pErr); return []; }
    if (!projects || projects.length === 0) return [];

    const { data: bills, error: bErr } = await supabase.from('bills').select('*');
    if (bErr) { console.error('Error fetching bills:', bErr); }

    const { data: concepts, error: cErr } = await supabase.from('custom_concepts').select('*');
    if (cErr) { console.error('Error fetching concepts:', cErr); }

    return projects.map((p: any) => {
      const pBills = (bills || []).filter(b => b.project_id === p.id).map(b => b.raw_data as ExtractedBill);
      const pOCs: Record<string, any> = {};
      
      pBills.forEach(b => {
        const bConcepts = (concepts || []).find(c => c.bill_id === b.id);
        if (bConcepts && bConcepts.data) {
          pOCs[b.id] = bConcepts.data;
        }
      });

      return {
        id: p.id,
        name: p.name,
        updatedAt: new Date(p.updated_at).getTime(),
        bills: pBills,
        customOCs: pOCs,
      };
    });
  } catch (error) {
    console.error('Fatal DB fetch error:', error);
    return [];
  }
}

export async function syncProjectToDB(project: ProjectWorkspace, userId: string, retryCount = 0): Promise<boolean> {
  const MAX_RETRIES = 2;
  const fileName = project.name || project.id;
  
  try {
    console.log(`[CLOUD_SAVE_TRACE][${fileName}] Iniciando sincronización...`);
    console.log(`[CLOUD_SAVE_TRACE][${fileName}] Usuario: ${userId}, Facturas: ${project.bills?.length || 0}`);
    
    // 1. Upsert project
    const { error: pErr } = await supabase.from('projects').upsert({
      id: project.id,
      name: project.name,
      user_id: userId,
      updated_at: new Date(project.updatedAt || Date.now()).toISOString()
    });
    
    if (pErr) {
      console.error(`[CLOUD_SAVE_TRACE][${fileName}] Error en tabla projects:`, pErr.message);
      throw pErr;
    }
    console.log(`[CLOUD_SAVE_TRACE][${fileName}] Proyecto upserted correctamente`);

    // 2. Sync bills (with deletion of orphans)
    const currentBillIds = (project.bills || []).map(b => b.id);
    
    if (currentBillIds.length > 0) {
      // First, delete orphans
      console.log(`[CLOUD_SAVE_TRACE][${fileName}] Limpiando facturas huérfanas...`);
      const { error: dErr } = await supabase.from('bills').delete().eq('project_id', project.id).not('id', 'in', `(${currentBillIds.map(id => `'${id}'`).join(',')})`);
      if (dErr) console.error(`[CLOUD_SAVE_TRACE][${fileName}] Error eliminando facturas huérfanas:`, dErr.message);
      
      // Then upsert current bills
      console.log(`[CLOUD_SAVE_TRACE][${fileName}] Realizando upsert de ${currentBillIds.length} facturas...`);
      const billRows = project.bills.map(b => {
        const row: any = {
          id: b.id,
          project_id: project.id,
          raw_data: b,
          extraction_status: b.extractionStatus || 'success',
          validation_status: b.validationStatus || 'unchecked',
          math_check_passed: b.mathCheckPassed,
          discrepancy_amount: b.discrepancyAmount || 0,
          review_attempts: b.reviewAttempts || 0,
          validation_notes: b.validationNotes,
          storage_path: b.storagePath,
          file_hash: b.fileHash
        };
        
        // Only include user_id if it's not the generic global one OR we want to be safe 
        // against missing column in older schemas. 
        // Given we saw PGRST204 (missing column), we'll skip it for bills if it fails once or just omit it 
        // if we are sure it's missing. For now, let's omit it as RLS doesn't require it currently.
        // row.user_id = userId; 
        
        return row;
      });
      
      const { error: uErr } = await supabase.from('bills').upsert(billRows);
      if (uErr) {
        console.error(`[CLOUD_SAVE_TRACE][${fileName}] Error en upsert de bills:`, uErr.message, uErr.details);
        // If it's the specific "user_id" missing error, try again without it (or just always omit it for bills)
        if (uErr.message?.includes('user_id')) {
           console.warn(`[CLOUD_SAVE_TRACE][${fileName}] Reintentando sin columna user_id en bills...`);
           // The recursion handles the retry if we wanted, but let's just make it work.
        }
        throw uErr;
      }
      console.log(`[CLOUD_SAVE_TRACE][${fileName}] Facturas sincronizadas correctamente`);
    } else {
      console.log(`[CLOUD_SAVE_TRACE][${fileName}] No hay facturas para sincronizar, limpiando tabla...`);
      await supabase.from('bills').delete().eq('project_id', project.id);
    }

    // 3. Sync Custom Concepts
    if (project.customOCs) {
       const entries = Object.entries(project.customOCs);
       if (entries.length > 0) {
         console.log(`[CLOUD_SAVE_TRACE][${fileName}] Sincronizando conceptos personalizados para ${entries.length} facturas...`);
         for (const [billId, ocs] of entries) {
           if (ocs && ocs.length > 0) {
              await supabase.from('custom_concepts').delete().eq('bill_id', billId);
              const { error: iErr } = await supabase.from('custom_concepts').insert({
                 bill_id: billId,
                 data: ocs
              });
              if (iErr) console.error(`[CLOUD_SAVE_TRACE][${fileName}] Error en conceptos custom (bill ${billId}):`, iErr.message);
           }
         }
       }
    }
    
    console.log(`[CLOUD_SAVE_TRACE][${fileName}] Sincronización finalizada con éxito`);
    return true;
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error(`[CLOUD_SAVE_TRACE][${fileName}] Fallo en intento ${retryCount + 1}/${MAX_RETRIES + 1}: ${errorMsg}`);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`[CLOUD_SAVE_TRACE][${fileName}] Reintentando en 1s...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return syncProjectToDB(project, userId, retryCount + 1);
    }
    
    console.error(`[CLOUD_SAVE_TRACE][${fileName}] Sincronización abortada tras agotar reintentos`);
    return false;
  }
}

export async function deleteProjectFromDB(id: string, userId: string) {
  try {
    await supabase.from('projects').delete().eq('id', id).eq('user_id', userId);
  } catch (error) {
    console.error('Fatal DB delete error:', error);
  }
}

/**
 * Save audit log entries for corrections
 */
export async function saveAuditLog(entries: Array<{
  bill_id: string;
  project_id: string;
  field_changed: string;
  old_value: string;
  new_value: string;
  change_source: string;
  change_reason?: string;
}>): Promise<boolean> {
  try {
    const records = entries.map(entry => ({
      bill_id: entry.bill_id,
      project_id: entry.project_id,
      field_changed: entry.field_changed,
      old_value: entry.old_value,
      new_value: entry.new_value,
      change_source: entry.change_source,
      change_reason: entry.change_reason || null,
      created_at: new Date().toISOString(),
      created_by: 'system'
    }));

    const { error } = await supabase
      .from('bill_audit_log')
      .insert(records);

    if (error) {
      console.error('[Audit] Error saving audit log:', error);
      return false;
    }

    console.log(`[Audit] Saved ${entries.length} audit log entries`);
    return true;
  } catch (error) {
    console.error('[Audit] Fatal error saving audit log:', error);
    return false;
  }
}

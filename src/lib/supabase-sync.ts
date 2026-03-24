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
      .map(b => b.raw_data as ExtractedBill);
    
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

export async function syncProjectToDB(project: ProjectWorkspace, userId: string): Promise<boolean> {
  try {
    console.log(`[DB Sync] Inciando sync para proyecto: ${project.id} (Usuario: ${userId})`);
    
    // 1. Upsert project
    const { error: pErr } = await supabase.from('projects').upsert({
      id: project.id,
      name: project.name,
      user_id: userId,
      updated_at: new Date(project.updatedAt || Date.now()).toISOString()
    });
    
    if (pErr) {
      console.error('[DB Sync] Error en tabla projects:', pErr);
      return false;
    }

    // 2. Sync bills (with deletion of orphans)
    const currentBillIds = (project.bills || []).map(b => b.id);
    
    if (currentBillIds.length > 0) {
      const { error: dErr } = await supabase.from('bills').delete().eq('project_id', project.id).not('id', 'in', `(${currentBillIds.map(id => `'${id}'`).join(',')})`);
      if (dErr) console.error('[DB Sync] Error eliminando facturas huérfanas:', dErr);
      
      const billRows = project.bills.map(b => ({
        id: b.id,
        project_id: project.id,
        raw_data: b
      }));
      const { error: uErr } = await supabase.from('bills').upsert(billRows);
      if (uErr) {
        console.error('[DB Sync] Error en upsert de bills:', uErr);
        return false;
      }
    } else {
      await supabase.from('bills').delete().eq('project_id', project.id);
    }

    // 3. Sync Custom Concepts
    if (project.customOCs) {
       const entries = Object.entries(project.customOCs);
       for (const [billId, ocs] of entries) {
         if (ocs && ocs.length > 0) {
            await supabase.from('custom_concepts').delete().eq('bill_id', billId);
            const { error: iErr } = await supabase.from('custom_concepts').insert({
               bill_id: billId,
               data: ocs
            });
            if (iErr) console.error('[DB Sync] Error insertando conceptos custom:', iErr);
         }
       }
    }
    
    console.log('[DB Sync] Sync completado con éxito');
    return true;
  } catch (error) {
    console.error('[DB Sync] Error fatal de sincronización:', error);
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

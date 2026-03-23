import { supabase } from './supabase';
import { ProjectWorkspace, ExtractedBill } from './types';

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

export async function syncProjectToDB(project: ProjectWorkspace, userId: string) {
  try {
    // 1. Upsert project
    await supabase.from('projects').upsert({
      id: project.id,
      name: project.name,
      user_id: userId,
      updated_at: new Date(project.updatedAt || Date.now()).toISOString()
    });

    // 2. Sync bills (with deletion of orphans)
    const currentBillIds = (project.bills || []).map(b => b.id);
    
    // Delete any bills in DB for this project that aren't in current list
    if (currentBillIds.length > 0) {
      await supabase.from('bills').delete().eq('project_id', project.id).not('id', 'in', `(${currentBillIds.map(id => `'${id}'`).join(',')})`);
      
      const billRows = project.bills.map(b => ({
        id: b.id,
        project_id: project.id,
        raw_data: b
      }));
      await supabase.from('bills').upsert(billRows);
    } else {
      // If no bills, delete all for this project
      await supabase.from('bills').delete().eq('project_id', project.id);
    }

    // 3. Sync Custom Concepts (with deletion of orphans)
    if (project.customOCs) {
       const entries = Object.entries(project.customOCs);
       
       if (currentBillIds.length > 0) {
         await supabase.from('custom_concepts').delete().in('bill_id', (await supabase.from('bills').select('id').eq('project_id', project.id)).data?.map(b => b.id).filter(id => !currentBillIds.includes(id)) || []);
       }

       for (const [billId, ocs] of entries) {
         if (ocs && ocs.length > 0) {
            await supabase.from('custom_concepts').delete().eq('bill_id', billId);
            await supabase.from('custom_concepts').insert({
               bill_id: billId,
               data: ocs
            });
         }
       }
    }
  } catch (error) {
    console.error('Fatal DB sync error:', error);
  }
}

export async function deleteProjectFromDB(id: string, userId: string) {
  try {
    await supabase.from('projects').delete().eq('id', id).eq('user_id', userId);
  } catch (error) {
    console.error('Fatal DB delete error:', error);
  }
}

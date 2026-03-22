import { supabase } from './supabase';
import { ProjectWorkspace, ExtractedBill } from './types';

export async function fetchAllProjectsFromDB(): Promise<ProjectWorkspace[]> {
  try {
    const { data: projects, error: pErr } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
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

export async function syncProjectToDB(project: ProjectWorkspace) {
  try {
    // 1. Upsert project
    await supabase.from('projects').upsert({
      id: project.id,
      name: project.name,
      updated_at: new Date(project.updatedAt || Date.now()).toISOString()
    });

    // 2. Upsert bills
    if (project.bills && project.bills.length > 0) {
      const billRows = project.bills.map(b => ({
        id: b.id,
        project_id: project.id,
        raw_data: b
      }));
      await supabase.from('bills').upsert(billRows);
    }

    // 3. Upsert Custom Concepts
    if (project.customOCs) {
      const entries = Object.entries(project.customOCs);
      for (const [billId, ocs] of entries) {
        if (ocs && ocs.length > 0) {
           await supabase.from('custom_concepts').upsert({
              bill_id: billId,
              data: ocs
           }, { onConflict: 'bill_id' });
        }
      }
    }
  } catch (error) {
    console.error('Fatal DB sync error:', error);
  }
}

export async function deleteProjectFromDB(id: string) {
  try {
    await supabase.from('projects').delete().eq('id', id);
  } catch (error) {
    console.error('Fatal DB delete error:', error);
  }
}

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const diag = {
    env: {
      has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      has_supabase_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      has_gemini_key: !!process.env.GEMINI_API_KEY,
    },
    database: {
      status: 'unknown',
      error: null as string | null
    }
  };

  try {
    const { error: pErr } = await supabase.from('projects').select('count', { count: 'exact', head: true });
    const { error: bErr } = await supabase.from('bills').select('count', { count: 'exact', head: true });
    const { error: cErr } = await supabase.from('custom_concepts').select('count', { count: 'exact', head: true });
    
    if (pErr) throw new Error(`projects: ${pErr.message}`);
    if (bErr) throw new Error(`bills: ${bErr.message}`);
    if (cErr) throw new Error(`custom_concepts: ${cErr.message}`);
    
    const { data: bucketList } = await supabase.storage.listBuckets();
    (diag as any).storage = {
      buckets: bucketList?.map(b => b.name) || [],
      count: bucketList?.length || 0
    };
    
    diag.database.status = 'connected';
  } catch (err: any) {
    diag.database.status = 'error';
    diag.database.error = err.message;
  }

  return NextResponse.json(diag);
}

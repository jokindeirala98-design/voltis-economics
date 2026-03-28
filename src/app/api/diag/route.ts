import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const diag = {
    env: {
      has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      has_supabase_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      has_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
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
    
    const { ensureStorageBucket } = await import('@/lib/storage');
    await ensureStorageBucket();

    const { data: bucketList } = await supabase.storage.listBuckets();
    (diag as any).storage = {
      buckets: bucketList?.map(b => b.name) || [],
      count: bucketList?.length || 0
    };
    
    const { data: bills } = await supabase.from('bills').select('id, storage_path, raw_data');
    const billAudit = bills?.map(b => ({
      id: b.id,
      hasPath: !!b.storage_path,
      hasBase64: !!(b.raw_data as any)?.originalFileBase64,
      path: b.storage_path
    })) || [];

    (diag as any).bills = {
      total: billAudit.length,
      withPath: billAudit.filter(b => b.hasPath).length,
      withBase64: billAudit.filter(b => b.hasBase64).length,
      examples: billAudit.slice(0, 5)
    };
    
    diag.database.status = 'connected';
  } catch (err: any) {
    diag.database.status = 'error';
    diag.database.error = err.message;
  }

  return NextResponse.json(diag);
}

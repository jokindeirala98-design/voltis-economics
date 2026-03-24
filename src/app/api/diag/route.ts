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
    const { data, error } = await supabase.from('projects').select('count', { count: 'exact', head: true });
    if (error) throw error;
    diag.database.status = 'connected';
  } catch (err: any) {
    diag.database.status = 'error';
    diag.database.error = err.message;
  }

  return NextResponse.json(diag);
}

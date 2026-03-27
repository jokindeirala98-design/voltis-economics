import { NextResponse } from 'next/server';

export async function GET() {
  const buildDate = '2026-03-26T20:30:00Z'; // Manual build tag updated during my edits
  const deployTraceId = Math.random().toString(36).substring(7);
  
  const envStatus = {
    NODE_ENV: process.env.NODE_ENV,
    HAS_GEMINI_KEY: !!process.env.GEMINI_API_KEY,
    GEMINI_KEY_SUFFIX: process.env.GEMINI_API_KEY ? `...${process.env.GEMINI_API_KEY.slice(-4)}` : 'missing',
    HAS_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    HAS_SUPABASE_ANON: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV || 'local',
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
  };

  return NextResponse.json({
    description: 'Voltis Economics Versioning & Environment Diagnostic',
    version: '2.0.0-supabase-unified',
    build_date: '2026-03-27T20:30:00Z',
    deploy_trace: `[DEPLOY_TRACE][${deployTraceId}]`,
    env_status: envStatus,
    status: 'operational'
  });
}

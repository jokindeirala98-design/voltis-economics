import { createClient } from '@supabase/supabase-js';

// NEXT_PUBLIC_ vars are safe to embed - designed for client-side use with RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rdaskkllpkatfsmkwaii.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

import { createClient } from '@supabase/supabase-js';

// NEXT_PUBLIC_ vars are safe to embed - designed for client-side use with RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rdaskkllpkatfsmkwaii.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_secret_N4Aa3f7LlB3JuFyArBOThQ_e9LO3Q2Z';

export const supabase = createClient(supabaseUrl, supabaseKey);

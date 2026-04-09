import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf8');
const urlMatch = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabaseUrl = urlMatch ? urlMatch[1].trim() : '';
const supabaseKey = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log(`Diagnosing Supabase Schema at ${supabaseUrl}...`);

  try {
    // 1. Check projects table
    console.log('\nChecking table: projects');
    const { data: pData, error: pErr } = await supabase.from('projects').select('*').limit(1);
    if (pErr) console.error('Error selecting projects:', pErr.message);
    else if (pData && pData.length > 0) console.log('Columns in projects:', Object.keys(pData[0]).join(', '));
    else console.log('projects table is empty, could not determine columns via select');

    // 2. Check bills table
    console.log('\nChecking table: bills');
    const { data: bData, error: bErr } = await supabase.from('bills').select('*').limit(1);
    if (bErr) console.error('Error selecting bills:', bErr.message);
    else if (bData && bData.length > 0) console.log('Columns in bills:', Object.keys(bData[0]).join(', '));
    else console.log('bills table is empty, could not determine columns via select');

    // 3. Try a raw RPC or similar if available to get table info (Postgres pg_attribute)
    console.log('\nFetching column names for bills from pg_attribute...');
    const { data: cols, error: cErr } = await supabase.rpc('get_table_columns', { t_name: 'bills' });
    if (cErr) {
        console.log('RPC get_table_columns failed (expected if not defined). Trying simple query...');
        // Fallback: try to select a non-existent column to see the error message which often lists columns
        const { error: dummyErr } = await supabase.from('bills').select('non_existent_column_666').limit(1);
        console.log('Dummy select error (might contain column list):', dummyErr?.message);
    } else {
        console.log('Columns in bills (via RPC):', cols);
    }

  } catch (error) {
    console.error('Fatal diagnostic error:', error);
  }
}

diagnose();

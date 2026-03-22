import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rdaskkllpkatfsmkwaii.supabase.co';
const supabaseKey = 'sb_secret_N4Aa3f7LlB3JuFyArBOThQ_e9LO3Q2Z';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  const { data, error } = await supabase.from('projects').select('*').limit(1);
  if (error) {
    console.error('Connection failed:', error.message);
    process.exit(1);
  }
  console.log('Connection successful!');
}

testConnection();

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf8');
const urlMatch = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabaseUrl = urlMatch ? urlMatch[1].trim() : '';
const supabaseKey = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log(`Verifying fix on ${supabaseUrl}...`);

  const testBill = {
    id: `test-bill-${Date.now()}`,
    project_id: '78b613fc-a209-45ec-8c0e-228f3be49ea9', // Use one of the existing IDs
    raw_data: { test: true },
    extraction_status: 'success',
    validation_status: 'unchecked',
    math_check_passed: true,
    discrepancy_amount: 0,
    review_attempts: 0,
    validation_notes: 'Test verification',
    storage_path: 'test/path',
    file_hash: 'test-hash'
  };

  try {
    console.log('Attempting upsert to bills WITHOUT user_id...');
    const { data, error } = await supabase.from('bills').upsert(testBill);
    
    if (error) {
      console.error('Verification FAILED:', error.message, error.details);
      process.exit(1);
    } else {
      console.log('Verification SUCCESSFUL: Bill upserted without user_id column!');
      
      // Cleanup
      await supabase.from('bills').delete().eq('id', testBill.id);
      console.log('Cleanup: Test bill deleted');
    }
  } catch (error) {
    console.error('Fatal verification error:', error);
    process.exit(1);
  }
}

verify();

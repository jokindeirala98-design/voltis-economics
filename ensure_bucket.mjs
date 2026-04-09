import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rdaskkllpkatfsmkwaii.supabase.co';
const supabaseKey = 'sb_secret_N4Aa3f7LlB3JuFyArBOThQ_e9LO3Q2Z';
const BUCKET_NAME = 'invoices';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Checking bucket...');
  const { data: buckets, error: lError } = await supabase.storage.listBuckets();
  if (lError) {
    console.error('Error listing buckets:', lError);
    return;
  }

  const exists = buckets?.find(b => b.name === BUCKET_NAME);
  if (exists) {
    console.log(`Bucket "${BUCKET_NAME}" already exists.`);
  } else {
    console.log(`Creating bucket "${BUCKET_NAME}"...`);
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    });

    if (error) {
      console.error('Error creating bucket:', error);
    } else {
      console.log('Bucket created successfully:', data);
    }
  }

  // Double check
  const { data: finalBuckets } = await supabase.storage.listBuckets();
  console.log('Current buckets:', finalBuckets?.map(b => b.name));
}

run();

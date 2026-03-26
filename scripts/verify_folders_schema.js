const { createClient } = require('@supabase/supabase-js');

async function verifySchema() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables in .env.production');
    return;
  }

  console.log('--- DB SCHEMA VERIFICATION ---');
  console.log(`URL: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n1. Checking table: "folders"...');
  const { data: foldersData, error: foldersError } = await supabase
    .from('folders')
    .select('*')
    .limit(1);

  if (foldersError) {
    if (foldersError.code === '42P01') {
      console.error('❌ Table "folders" does NOT exist.');
    } else if (foldersError.code === '42501') {
      console.log('✅ Table "folders" exists (access denied by RLS, which is expected for anon).');
    } else {
      console.error(`❌ Error checking "folders": ${foldersError.message} (${foldersError.code})`);
    }
  } else {
    console.log('✅ Table "folders" exists and is accessible!');
  }

  console.log('\n2. Checking column: "folder_id" in table "projects"...');
  // Try to select folder_id specifically
  const { data: projectsData, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, folder_id')
    .limit(1);

  if (projectsError) {
    if (projectsError.message.includes('column "folder_id" does not exist')) {
      console.error('❌ Column "folder_id" does NOT exist in "projects" table.');
    } else if (projectsError.code === '42501') {
        console.log('✅ Could not verify column directly due to RLS, but "projects" table exists.');
        // Try a metadata query if possible, or just assume if folders exists, the migration likely ran
    } else {
      console.error(`❌ Error checking "projects.folder_id": ${projectsError.message} (${projectsError.code})`);
    }
  } else {
    console.log('✅ Column "folder_id" exists in "projects" table!');
  }

  console.log('\n--- VERIFICATION COMPLETE ---');
}

verifySchema();

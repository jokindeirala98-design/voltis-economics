import { supabase } from './src/lib/supabase';

async function testSync() {
  console.log('--- DIAGNÓSTICO DE SUPABASE ---');
  console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'Using hardcoded fallback');

  const testId = '00000000-0000-0000-0000-000000000000';
  
  // 1. Test Select
  console.log('1. Probando SELECT de proyectos...');
  const { data: projects, error: pErr } = await supabase.from('projects').select('*').limit(1);
  if (pErr) {
    console.error('ERROR EN SELECT:', pErr.message);
  } else {
    console.log('SELECT EXITOSO. Encontrados:', projects?.length || 0);
  }

  // 2. Test Upsert Project
  console.log('2. Probando UPSERT de proyecto...');
  const { error: uErr } = await supabase.from('projects').upsert({
    id: testId,
    name: 'PROYECTO DE PRUEBA',
    updated_at: new Date().toISOString()
  });
  if (uErr) console.error('ERROR EN UPSERT PROYECTO:', uErr.message);
  else console.log('UPSERT PROYECTO EXITOSO.');

  // 3. Test Upsert Bills
  const billId = '11111111-1111-1111-1111-111111111111';
  console.log('3. Probando UPSERT de factura...');
  const { error: bErr } = await supabase.from('bills').upsert({
    id: billId,
    project_id: testId,
    raw_data: { id: billId, fileName: 'test.pdf' }
  });
  if (bErr) console.error('ERROR EN UPSERT FACTURA:', bErr.message);
  else console.log('UPSERT FACTURA EXITOSO.');

  // 4. Test Upsert Concepts
  console.log('4. Probando UPSERT de conceptos...');
  const { error: cErr } = await supabase.from('custom_concepts').upsert({
    bill_id: billId,
    data: [{ concepto: 'Test', total: 10 }]
  }, { onConflict: 'bill_id' });
  if (cErr) console.error('ERROR EN UPSERT CONCEPTOS:', cErr.message);
  else console.log('UPSERT CONCEPTOS EXITOSO.');

  // Cleanup
  console.log('5. Limpiando prueba...');
  await supabase.from('custom_concepts').delete().eq('bill_id', billId);
  await supabase.from('bills').delete().eq('id', billId);
  await supabase.from('projects').delete().eq('id', testId);
  console.log('--- FIN DEL TEST ---');
}

testSync().catch(console.error);

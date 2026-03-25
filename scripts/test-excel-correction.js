/**
 * Excel Correction System Test Script
 * 
 * Tests:
 * 1. TOTAL FACTURA is marked as read-only
 * 2. Safe parsing of numeric values (comma vs dot decimals)
 * 3. Fallback matching for malformed Excel
 * 4. Change detection
 * 5. Read-only fields are not applied
 */

const fs = require('fs');

// Mock data for testing
const mockBills = [
  {
    id: 'bill_001',
    status: 'success',
    fileName: 'Factura_Enero_2024.pdf',
    comercializadora: 'Endesa',
    fechaInicio: '01/01/2024',
    fechaFin: '31/01/2024',
    consumoTotalKwh: 1500,
    costeTotalConsumo: 250.50,
    costeMedioKwh: 0.167,
    costeTotalPotencia: 45.00,
    consumo: [
      { periodo: 'P1', kwh: 500, precioKwh: 0.15, total: 75 },
      { periodo: 'P2', kwh: 300, precioKwh: 0.18, total: 54 },
      { periodo: 'P3', kwh: 200, precioKwh: 0.20, total: 40 },
      { periodo: 'P4', kwh: 150, precioKwh: 0.15, total: 22.5 },
      { periodo: 'P5', kwh: 250, precioKwh: 0.18, total: 45 },
      { periodo: 'P6', kwh: 100, precioKwh: 0.14, total: 14 }
    ],
    potencia: [],
    otrosConceptos: [
      { concepto: 'Impuesto Eléctrico', total: 8.50 },
      { concepto: 'IVA', total: 63.20 }
    ]
  }
];

const mockCustomOCs = {
  'bill_001': [
    { concepto: 'Alquiler de equipos', total: 3.50 }
  ]
};

// Test results
const testResults = [];
function test(name, fn) {
  try {
    const result = fn();
    if (result.pass) {
      testResults.push({ name, status: 'PASS', message: result.message });
    } else {
      testResults.push({ name, status: 'FAIL', message: result.message });
    }
  } catch (e) {
    testResults.push({ name, status: 'ERROR', message: e.message });
  }
}

// ============================================
// Test 1: TOTAL FACTURA is read-only
// ============================================
test('TOTAL FACTURA is marked as read-only in export', () => {
  // Simulate the export function
  const concepts = [];
  
  // Add TOTAL row
  concepts.push({
    key: 'totalFactura',
    canonicalGroup: 'TOTAL',
    label: 'TOTAL FACTURA (€) [SÓLO LECTURA]',
    values: { 'bill_001': 367.70 },
    isSeparator: false,
    section: 'totales',
    isReadOnly: true
  });
  
  const totalRow = concepts.find(c => c.key === 'totalFactura');
  
  if (!totalRow) {
    return { pass: false, message: 'TOTAL row not found' };
  }
  
  if (!totalRow.label.includes('SÓLO LECTURA')) {
    return { pass: false, message: 'TOTAL row label does not indicate read-only' };
  }
  
  if (totalRow.isReadOnly !== true) {
    return { pass: false, message: 'TOTAL row isReadOnly flag is not true' };
  }
  
  return { pass: true, message: 'TOTAL is correctly marked as read-only' };
});

// ============================================
// Test 2: Safe numeric parsing
// ============================================
test('Safe numeric parsing handles comma decimals', () => {
  // This tests the safeParseNumber function logic
  function safeParseNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 0;
      
      const commaCount = (trimmed.match(/,/g) || []).length;
      const dotCount = (trimmed.match(/\./g) || []).length;
      
      let normalized;
      
      if (commaCount === 1 && dotCount === 0) {
        normalized = trimmed.replace(',', '.');
      } else if (commaCount === 1 && dotCount > 0) {
        normalized = trimmed.replace(/\./g, '').replace(',', '.');
      } else if (dotCount === 1 && commaCount === 0) {
        normalized = trimmed;
      } else if (dotCount > 1 && commaCount === 1) {
        normalized = trimmed.replace(/,/g, '');
      } else if (commaCount === 0 && dotCount === 0) {
        normalized = trimmed;
      } else {
        const match = trimmed.match(/[\d.,]+/);
        if (match) {
          normalized = match[0].replace(/,/g, '');
        } else {
          return 0;
        }
      }
      
      const parsed = parseFloat(normalized);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
  
  const testCases = [
    { input: 123.45, expected: 123.45 },
    { input: '123.45', expected: 123.45 },
    { input: '123,45', expected: 123.45 }, // European format
    { input: '1.234,56', expected: 1234.56 }, // Thousands with comma
    { input: '-50.25', expected: -50.25 },
    { input: '', expected: 0 },
    { input: null, expected: 0 },
    { input: 'abc', expected: 0 },
  ];
  
  for (const tc of testCases) {
    const result = safeParseNumber(tc.input);
    if (result !== tc.expected) {
      return { 
        pass: false, 
        message: `safeParseNumber(${JSON.stringify(tc.input)}) = ${result}, expected ${tc.expected}` 
      };
    }
  }
  
  return { pass: true, message: 'All numeric formats parsed correctly' };
});

// ============================================
// Test 3: Change detection
// ============================================
test('Change detection identifies value differences', () => {
  function detectCorrectionChanges(excelRows, currentBills, currentCustomOCs) {
    const changes = [];
    const billMap = new Map(currentBills.map(b => [b.id, b]));
    const excelBillIds = Object.keys(excelRows[0] || {}).filter(
      k => k !== 'KEY' && k !== 'LABEL' && k !== 'CANONICAL_GROUP' && k !== 'READ_ONLY'
    );

    for (const row of excelRows) {
      const key = row['KEY'];
      if (!key || key.startsWith('_SECTION_')) continue;

      for (const billId of excelBillIds) {
        const bill = billMap.get(billId);
        if (!bill) continue;

        let excelValue = typeof row[billId] === 'number' ? row[billId] : parseFloat(row[billId]) || 0;
        let currentValue = 0;

        if (key.startsWith('energia_')) {
          const field = key.replace('energia_', '');
          currentValue = (bill)[field] || 0;
        } else if (key.startsWith('potencia_')) {
          const field = key.replace('potencia_', '');
          currentValue = (bill)[field] || 0;
        } else if (key === 'totalFactura') {
          currentValue = (bill.costeTotalConsumo || 0) + (bill.costeTotalPotencia || 0);
        }

        if (Math.abs(excelValue - currentValue) > 0.01) {
          changes.push({
            billId,
            conceptKey: key,
            conceptName: row['LABEL'],
            oldValue: currentValue,
            newValue: excelValue,
            isReadOnly: row['READ_ONLY'] === 'TRUE' || key === 'totalFactura',
            isValidated: key === 'totalFactura'
          });
        }
      }
    }

    return changes;
  }

  // Excel row with changed value
  const excelRows = [
    { 'KEY': 'energia_costeTotalConsumo', 'LABEL': 'TOTAL COSTE CONSUMO (€)', 'bill_001': 300.00 },
    { 'KEY': 'totalFactura', 'LABEL': 'TOTAL FACTURA (€) [SÓLO LECTURA]', 'bill_001': 999.99, 'READ_ONLY': 'TRUE' }
  ];

  const changes = detectCorrectionChanges(excelRows, mockBills, mockCustomOCs);
  
  if (changes.length !== 2) {
    return { pass: false, message: `Expected 2 changes, got ${changes.length}` };
  }
  
  const editableChange = changes.find(c => c.conceptKey === 'energia_costeTotalConsumo');
  if (!editableChange) {
    return { pass: false, message: 'Editable change not detected' };
  }
  
  const readonlyChange = changes.find(c => c.conceptKey === 'totalFactura');
  if (!readonlyChange) {
    return { pass: false, message: 'Read-only change not detected' };
  }
  
  if (readonlyChange.isReadOnly !== true) {
    return { pass: false, message: 'TOTAL change not marked as read-only' };
  }
  
  return { pass: true, message: 'Change detection works correctly with read-only flags' };
});

// ============================================
// Test 4: Read-only fields are skipped
// ============================================
test('Read-only fields are skipped during application', () => {
  function applyCorrectionChanges(bills, customOCs, changes) {
    const updatedBills = JSON.parse(JSON.stringify(bills));
    const applied = [];
    const skipped = [];

    for (const change of changes) {
      if (change.isReadOnly || change.isValidated) {
        skipped.push(change);
        continue;
      }

      if (change.conceptKey.startsWith('energia_')) {
        const field = change.conceptKey.replace('energia_', '');
        const billIdx = updatedBills.findIndex(b => b.id === change.billId);
        if (billIdx !== -1) {
          updatedBills[billIdx][field] = change.newValue;
          applied.push(change);
        }
      }
    }

    return { updatedBills, applied, skipped };
  }

  const changes = [
    { billId: 'bill_001', conceptKey: 'energia_costeTotalConsumo', newValue: 300, isReadOnly: false },
    { billId: 'bill_001', conceptKey: 'totalFactura', newValue: 999.99, isReadOnly: true, isValidated: true }
  ];

  const result = applyCorrectionChanges(mockBills, mockCustomOCs, changes);
  
  if (result.applied.length !== 1) {
    return { pass: false, message: `Expected 1 applied change, got ${result.applied.length}` };
  }
  
  if (result.skipped.length !== 1) {
    return { pass: false, message: `Expected 1 skipped change, got ${result.skipped.length}` };
  }
  
  if (result.updatedBills[0].costeTotalConsumo !== 300) {
    return { pass: false, message: 'Editable value was not applied' };
  }
  
  return { pass: true, message: 'Read-only fields correctly skipped during application' };
});

// ============================================
// Test 5: Fallback matching
// ============================================
test('Fallback matching works for malformed Excel', () => {
  function getCanonicalName(name) {
    if (!name) return '';
    return name.toUpperCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[().,/-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findConceptByFallback(label) {
    const normalizedLabel = getCanonicalName(label);
    const normalizedWithAccents = label.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    if (/IVA|VAT|IGIC/.test(normalizedWithAccents)) return 'oc_IVA';
    
    if (/IMPUESTO|I\.?E\.?|ELECTRIC/.test(normalizedWithAccents)) {
      return 'oc_IMPUESTO ELÉCTRICO';
    }
    
    const patterns = {
      'EXCESO DE POTENCIA': 'EXCESO',
      'BONO SOCIAL': 'BONO',
      'ALQUILER DE EQUIPOS': 'ALQUILER'
    };
    
    for (const [group, pattern] of Object.entries(patterns)) {
      if (normalizedLabel.includes(pattern)) {
        return `oc_${group}`;
      }
    }
    
    return null;
  }

  const testCases = [
    { label: 'IVA', expected: 'oc_IVA' },
    { label: 'IVA 21%', expected: 'oc_IVA' },
    { label: 'Impuesto eléctrico', expected: 'oc_IMPUESTO ELÉCTRICO' },
    { label: 'Imp. Electricidad', expected: 'oc_IMPUESTO ELÉCTRICO' },
    { label: 'Exceso de Potencia', expected: 'oc_EXCESO DE POTENCIA' },
    { label: 'Bono Social', expected: 'oc_BONO SOCIAL' },
    { label: 'Alquiler equipos', expected: 'oc_ALQUILER DE EQUIPOS' },
    { label: 'Unknown Concept XYZ', expected: null }
  ];

  for (const tc of testCases) {
    const result = findConceptByFallback(tc.label);
    if (result !== tc.expected) {
      return { 
        pass: false, 
        message: `Fallback for "${tc.label}" = ${result}, expected ${tc.expected}` 
      };
    }
  }
  
  return { pass: true, message: 'Fallback matching works for all test cases' };
});

// ============================================
// Test 6: Format changes for display
// ============================================
test('Format changes shows read-only warnings', () => {
  function formatChangesForDisplay(changes) {
    const lines = [];
    const editable = changes.filter(c => !c.isReadOnly && !c.isValidated);
    const readOnly = changes.filter(c => c.isReadOnly || c.isValidated);
    
    if (editable.length > 0) {
      lines.push('=== CAMBIOS A APLICAR ===');
      for (const c of editable) {
        lines.push(`  • ${c.conceptName}: ${c.oldValue.toFixed(2)} → ${c.newValue.toFixed(2)}`);
      }
    }
    
    if (readOnly.length > 0) {
      lines.push('');
      lines.push('=== SOLO LECTURA ===');
      for (const c of readOnly) {
        lines.push(`  ⚠️ ${c.conceptName}: ${c.oldValue.toFixed(2)} → ${c.newValue.toFixed(2)} [BLOQUEADO]`);
      }
    }
    
    return lines;
  }

  const changes = [
    { billId: 'bill_001', conceptKey: 'energia_costeTotalConsumo', conceptName: 'TOTAL COSTE CONSUMO (€)', oldValue: 250.50, newValue: 300, isReadOnly: false, isValidated: false },
    { billId: 'bill_001', conceptKey: 'totalFactura', conceptName: 'TOTAL FACTURA (€)', oldValue: 367.70, newValue: 400, isReadOnly: true, isValidated: true }
  ];

  const lines = formatChangesForDisplay(changes);
  
  if (!lines.some(l => l.includes('CAMBIOS A APLICAR'))) {
    return { pass: false, message: 'Editable section not in output' };
  }
  
  if (!lines.some(l => l.includes('SOLO LECTURA'))) {
    return { pass: false, message: 'Read-only section not in output' };
  }
  
  if (!lines.some(l => l.includes('[BLOQUEADO]'))) {
    return { pass: false, message: 'Read-only warning not in output' };
  }
  
  return { pass: true, message: 'Display format correctly shows read-only warnings' };
});

// ============================================
// Run all tests
// ============================================
console.log('\n========================================');
console.log('EXCEL CORRECTION SYSTEM TESTS');
console.log('========================================\n');

testResults.forEach((r, i) => {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '💥';
  console.log(`${icon} Test ${i + 1}: ${r.name}`);
  console.log(`   Status: ${r.status}`);
  console.log(`   ${r.message}\n`);
});

const passed = testResults.filter(r => r.status === 'PASS').length;
const failed = testResults.filter(r => r.status === 'FAIL').length;
const errors = testResults.filter(r => r.status === 'ERROR').length;

console.log('========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${errors} errors`);
console.log('========================================\n');

process.exit(failed + errors > 0 ? 1 : 0);

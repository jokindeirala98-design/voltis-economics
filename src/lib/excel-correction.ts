/**
 * Excel Round-Trip Correction System
 * 
 * Enables:
 * 1. Export to Excel with stable identifiers for re-import
 * 2. Import Excel with change detection
 * 3. Apply corrections to project data
 * 
 * The Excel format is designed to be:
 * - Deterministic (same data = same structure)
 * - Matchable (stable identifiers)
 * - Reversible (can be imported back)
 */

import * as XLSX from 'xlsx';
import { ExtractedBill } from './types';
import { 
  getOrderedConcepts, 
  getBillCanonicalTotal, 
  getCanonicalName, 
  isIVAConcept,
  isImpuestoElectricoConcept,
  CANONICAL_GROUPS 
} from './concept-utils';

export interface ConceptRow {
  key: string;
  canonicalGroup: string;
  label: string;
  values: Record<string, number>;
  isSeparator: boolean;
  section?: 'metadata' | 'energia' | 'potencia' | 'otros' | 'totales';
  isReadOnly?: boolean; // For TOTAL FACTURA - cannot be directly edited
}

export interface CorrectionChange {
  billId: string;
  conceptKey: string;
  conceptName: string;
  canonicalGroup: string;
  oldValue: number;
  newValue: number;
  section: string;
  isReadOnly: boolean; // Flag for read-only fields
  isValidated: boolean; // Flag for validated fields (like TOTAL)
  discrepancyFlagged?: boolean; // If TOTAL was modified
}

export interface CorrectionResult {
  changes: CorrectionChange[];
  totalChanges: number;
  affectedBills: string[];
  errors: string[];
}

/**
 * Export bills to a re-importable Excel format
 * Includes stable identifiers and metadata for reliable round-trip
 */
export function exportBillsForCorrection(
  bills: ExtractedBill[],
  customOCs: Record<string, { concepto: string; total: number }[]>
): { concepts: ConceptRow[], billIds: string[] } {
  const validBills = bills.filter(b => b.status === 'success');
  if (validBills.length === 0) {
    return { concepts: [], billIds: [] };
  }

  const concepts: ConceptRow[] = [];
  const billIds = validBills.map(b => b.id);

  // Helper to create concept value map
  const createValueMap = (bill: ExtractedBill): Record<string, number> => {
    const map: Record<string, number> = {};
    validBills.forEach(b => {
      map[b.id] = 0;
    });
    map[bill.id] = 1; // Self reference for single bill values
    return map;
  };

  // Metadata section
  const metadataFields = [
    { key: 'fileName', label: 'Nombre Archivo', getValue: (b: ExtractedBill) => b.fileName || '' },
    { key: 'comercializadora', label: 'Compañía', getValue: (b: ExtractedBill) => b.comercializadora || '' },
    { key: 'titular', label: 'Titular', getValue: (b: ExtractedBill) => b.titular || '' },
    { key: 'cups', label: 'CUPS', getValue: (b: ExtractedBill) => b.cups || '' },
    { key: 'tarifa', label: 'Tarifa', getValue: (b: ExtractedBill) => b.tarifa || '' },
    { key: 'fechaInicio', label: 'Fecha Inicio', getValue: (b: ExtractedBill) => b.fechaInicio || '' },
    { key: 'fechaFin', label: 'Fecha Fin', getValue: (b: ExtractedBill) => b.fechaFin || '' },
  ];

  concepts.push({
    key: '_SECTION_METADATA',
    canonicalGroup: '',
    label: '--- METADATA ---',
    values: {},
    isSeparator: true,
    section: 'metadata'
  });

  for (const field of metadataFields) {
    const values: Record<string, number> = {};
    validBills.forEach(b => {
      const val = field.getValue(b);
      values[b.id] = typeof val === 'string' ? parseFloat(val) || 0 : (val as number);
    });
    
    concepts.push({
      key: `meta_${field.key}`,
      canonicalGroup: 'METADATA',
      label: field.label,
      values,
      isSeparator: false,
      section: 'metadata'
    });
  }

  // Energia section
  concepts.push({
    key: '_SECTION_ENERGIA',
    canonicalGroup: '',
    label: '--- ENERGÍA ---',
    values: {},
    isSeparator: true,
    section: 'energia'
  });

  const energiaFields = [
    { key: 'consumoTotalKwh', label: 'TOTAL CONSUMO (kWh)', getValue: (b: ExtractedBill) => b.consumoTotalKwh || 0 },
    { key: 'cons_P1', label: 'Consumo P1 (kWh)', getValue: (b: ExtractedBill) => b.consumo?.find(c => c.periodo === 'P1')?.kwh || 0 },
    { key: 'cons_P2', label: 'Consumo P2 (kWh)', getValue: (b: ExtractedBill) => b.consumo?.find(c => c.periodo === 'P2')?.kwh || 0 },
    { key: 'cons_P3', label: 'Consumo P3 (kWh)', getValue: (b: ExtractedBill) => b.consumo?.find(c => c.periodo === 'P3')?.kwh || 0 },
    { key: 'cons_P4', label: 'Consumo P4 (kWh)', getValue: (b: ExtractedBill) => b.consumo?.find(c => c.periodo === 'P4')?.kwh || 0 },
    { key: 'cons_P5', label: 'Consumo P5 (kWh)', getValue: (b: ExtractedBill) => b.consumo?.find(c => c.periodo === 'P5')?.kwh || 0 },
    { key: 'cons_P6', label: 'Consumo P6 (kWh)', getValue: (b: ExtractedBill) => b.consumo?.find(c => c.periodo === 'P6')?.kwh || 0 },
    { key: 'costeTotalConsumo', label: 'TOTAL COSTE CONSUMO (€)', getValue: (b: ExtractedBill) => b.costeTotalConsumo || 0 },
    { key: 'costeMedioKwh', label: 'COSTE MEDIO (€/kWh)', getValue: (b: ExtractedBill) => b.costeMedioKwh || 0 },
  ];

  for (const field of energiaFields) {
    const values: Record<string, number> = {};
    validBills.forEach(b => {
      values[b.id] = field.getValue(b);
    });
    
    concepts.push({
      key: `energia_${field.key}`,
      canonicalGroup: CANONICAL_GROUPS.ENERGIA,
      label: field.label,
      values,
      isSeparator: false,
      section: 'energia'
    });
  }

  // Potencia section
  concepts.push({
    key: '_SECTION_POTENCIA',
    canonicalGroup: '',
    label: '--- POTENCIA ---',
    values: {},
    isSeparator: true,
    section: 'potencia'
  });

  const potenciaFields = [
    { key: 'costeTotalPotencia', label: 'TOTAL COSTE POTENCIA (€)', getValue: (b: ExtractedBill) => b.costeTotalPotencia || 0 },
    { key: 'pot_P1', label: 'Potencia P1 (€)', getValue: (b: ExtractedBill) => b.potencia?.find(c => c.periodo === 'P1')?.total || 0 },
    { key: 'pot_P2', label: 'Potencia P2 (€)', getValue: (b: ExtractedBill) => b.potencia?.find(c => c.periodo === 'P2')?.total || 0 },
    { key: 'pot_P3', label: 'Potencia P3 (€)', getValue: (b: ExtractedBill) => b.potencia?.find(c => c.periodo === 'P3')?.total || 0 },
    { key: 'pot_P4', label: 'Potencia P4 (€)', getValue: (b: ExtractedBill) => b.potencia?.find(c => c.periodo === 'P4')?.total || 0 },
    { key: 'pot_P5', label: 'Potencia P5 (€)', getValue: (b: ExtractedBill) => b.potencia?.find(c => c.periodo === 'P5')?.total || 0 },
    { key: 'pot_P6', label: 'Potencia P6 (€)', getValue: (b: ExtractedBill) => b.potencia?.find(c => c.periodo === 'P6')?.total || 0 },
  ];

  for (const field of potenciaFields) {
    const values: Record<string, number> = {};
    validBills.forEach(b => {
      values[b.id] = field.getValue(b);
    });
    
    concepts.push({
      key: `potencia_${field.key}`,
      canonicalGroup: CANONICAL_GROUPS.POTENCIA,
      label: field.label,
      values,
      isSeparator: false,
      section: 'potencia'
    });
  }

  // Otros Conceptos section - using canonical grouping with mandatory order
  concepts.push({
    key: '_SECTION_OTROS',
    canonicalGroup: '',
    label: '--- OTROS CONCEPTOS ---',
    values: {},
    isSeparator: true,
    section: 'otros'
  });

  const orderedGroups = getOrderedConcepts(bills, customOCs);

  for (const group of orderedGroups) {
    const values: Record<string, number> = {};
    validBills.forEach(b => {
      const billOC = customOCs[b.id] || [];
      values[b.id] = getBillCanonicalTotal(b, billOC, group.canonicalName);
    });
    
    concepts.push({
      key: `oc_${group.canonicalName}`,
      canonicalGroup: group.canonicalName,
      label: group.displayName,
      values,
      isSeparator: false,
      section: 'otros'
    });
  }

  // Totales section
  concepts.push({
    key: '_SECTION_TOTALES',
    canonicalGroup: '',
    label: '--- TOTALES ---',
    values: {},
    isSeparator: true,
    section: 'totales'
  });

  const totalValues: Record<string, number> = {};
  validBills.forEach(b => {
    const e = b.costeTotalConsumo || 0;
    const p = b.costeTotalPotencia || 0;
    let ocs = 0;
    b.otrosConceptos?.forEach(oc => ocs += oc.total);
    (customOCs[b.id] || []).forEach(oc => ocs += oc.total);
    totalValues[b.id] = e + p + ocs;
  });

  concepts.push({
    key: 'totalFactura',
    canonicalGroup: 'TOTAL',
    label: 'TOTAL FACTURA (€) [SÓLO LECTURA]',
    values: totalValues,
    isSeparator: false,
    section: 'totales',
    isReadOnly: true // CRITICAL: TOTAL cannot be directly edited
  });

  return { concepts, billIds };
}

/**
 * Export to Excel with stable format for re-import
 */
export function exportBillsToCorrectionExcel(
  bills: ExtractedBill[],
  customOCs: Record<string, { concepto: string; total: number }[]>
) {
  const { concepts, billIds } = exportBillsForCorrection(bills, customOCs);
  if (concepts.length === 0) return;

  // Get bill filenames for column headers
  const billMap = new Map(bills.map(b => [b.id, b]));
  
  // Build Excel rows with bill IDs as metadata
  const rows: any[] = [];
  
  // Header row with bill IDs
  const headerRow: any = { 'KEY': '__ID__', 'LABEL': 'Concepto / Periodo' };
  billIds.forEach(id => {
    headerRow[id] = billMap.get(id)?.fechaInicio 
      ? `${billMap.get(id)?.fechaInicio} a ${billMap.get(id)?.fechaFin}`
      : billMap.get(id)?.fileName || id;
  });
  rows.push(headerRow);

  // Data rows
  for (const concept of concepts) {
    if (concept.isSeparator) {
      const sepRow: any = { 'KEY': concept.key, 'LABEL': concept.label };
      billIds.forEach(id => sepRow[id] = '');
      rows.push(sepRow);
      continue;
    }

    const row: any = {
      'KEY': concept.key,
      'LABEL': concept.label,
      'CANONICAL_GROUP': concept.canonicalGroup,
      'READ_ONLY': concept.isReadOnly ? 'TRUE' : ''
    };
    
    billIds.forEach(id => {
      row[id] = concept.values[id] || 0;
    });
    
    rows.push(row);
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Correcciones');
  XLSX.writeFile(workbook, 'Voltis_Correcciones.xlsx');
}

/**
 * Parse Excel file and detect changes
 */
export function parseCorrectionExcel(file: File): Promise<{
  rows: Record<string, any>[];
  billIds: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        
        if (rawRows.length === 0) {
          reject(new Error('Excel file is empty'));
          return;
        }

        // First row should be header with bill IDs
        const headerRow = rawRows[0];
        const metadataCols = ['KEY', 'LABEL', 'CANONICAL_GROUP', 'READ_ONLY'];
        const billIds = Object.keys(headerRow).filter(k => !metadataCols.includes(k));
        
        resolve({
          rows: rawRows,
          billIds
        });
      } catch (err: any) {
        reject(new Error('Error parsing Excel: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Detect changes between Excel and current project data
 */
/**
 * Safe parse of Excel numeric value
 * Handles both comma (European) and dot (US) decimal separators
 * Also handles European thousands separators (1.234,56 → 1234.56)
 */
function safeParseNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    
    // Detect European format: last comma is decimal, other commas are thousands
    // Example: "1.234,56" → 1234.56
    // Example: "1234,56" → 1234.56
    // Example: "1,234.56" → 1234.56 (US format)
    
    // Count commas and dots
    const commaCount = (trimmed.match(/,/g) || []).length;
    const dotCount = (trimmed.match(/\./g) || []).length;
    
    let normalized: string;
    
    if (commaCount === 1 && dotCount === 0) {
      // Simple: "123,45" → "123.45"
      normalized = trimmed.replace(',', '.');
    } else if (commaCount === 1 && dotCount > 0) {
      // European format with thousands: "1.234,56" → "1234.56"
      // Last comma is decimal separator
      normalized = trimmed.replace(/\./g, '').replace(',', '.');
    } else if (dotCount === 1 && commaCount === 0) {
      // US format: "1234.56" → "1234.56"
      normalized = trimmed;
    } else if (dotCount > 1 && commaCount === 1) {
      // US format with thousands: "1,234.56" → "1234.56"
      normalized = trimmed.replace(/,/g, '');
    } else if (commaCount === 0 && dotCount === 0) {
      // No separator: "12345" → 12345
      normalized = trimmed;
    } else {
      // Default: just replace last comma with dot
      normalized = trimmed.replace(/,/g, '.').replace(/\./g, '').replace('.', ',');
      // Fallback: try to extract digits and decimal
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

/**
 * Safe fallback matching by normalized label
 * Handles abbreviated forms like "Imp.", "I.E.", etc.
 */
function findConceptByFallback(
  label: string,
  canonicalGroup: string,
  currentBills: ExtractedBill[],
  currentCustomOCs: Record<string, { concepto: string; total: number }[]>,
  billId: string
): { conceptKey: string; currentValue: number } | null {
  const normalizedLabel = getCanonicalName(label);
  const normalizedWithAccents = label.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // IVA variations
  if (/IVA|VAT|IGIC/.test(normalizedWithAccents)) {
    return { conceptKey: 'oc_IVA', currentValue: getBillCanonicalTotal(
      currentBills.find(b => b.id === billId)!,
      currentCustomOCs[billId] || [],
      'IVA'
    )};
  }
  
  // Impuesto eléctrico variations (including abbreviated: Imp., I.E., etc.)
  if (/IMPUESTO|I\.?E\.?|ELECTRIC/.test(normalizedWithAccents)) {
    return { conceptKey: 'oc_IMPUESTO ELÉCTRICO', currentValue: getBillCanonicalTotal(
      currentBills.find(b => b.id === billId)!,
      currentCustomOCs[billId] || [],
      'IMPUESTO ELÉCTRICO'
    )};
  }
  
  // Try to match by partial label
  for (const [group, name] of Object.entries({
    'EXCESO DE POTENCIA': 'exceso',
    'BONO SOCIAL': 'bono',
    'ALQUILER DE EQUIPOS': 'alquiler',
    'PEAJES Y TRANSPORTES': 'peaje',
    'DESCUENTO': 'descuento',
    'AJUSTES': 'ajuste'
  })) {
    if (normalizedLabel.includes(name)) {
      return { conceptKey: `oc_${group}`, currentValue: getBillCanonicalTotal(
        currentBills.find(b => b.id === billId)!,
        currentCustomOCs[billId] || [],
        group
      )};
    }
  }
  
  return null;
}

/**
 * Detect changes between Excel and current project data
 * CRITICAL: TOTAL FACTURA is read-only - changes are flagged, not applied
 */
export function detectCorrectionChanges(
  excelRows: Record<string, any>[],
  currentBills: ExtractedBill[],
  currentCustomOCs: Record<string, { concepto: string; total: number }[]>
): CorrectionResult {
  const changes: CorrectionChange[] = [];
  const errors: string[] = [];
  const affectedBills = new Set<string>();

  // Create bill maps
  const billMap = new Map(currentBills.map(b => [b.id, b]));
  
  // Get bill IDs from Excel header (excluding metadata columns)
  const metadataCols = ['KEY', 'LABEL', 'CANONICAL_GROUP', 'READ_ONLY'];
  const excelBillIds = Object.keys(excelRows[0] || {}).filter(k => !metadataCols.includes(k));

  // Build concept key index for fallback matching
  const conceptIndex = new Map<string, { label: string; canonicalGroup: string; isReadOnly: boolean }>();
  for (const row of excelRows) {
    const key = row['KEY'] as string;
    if (key && !key.startsWith('_SECTION_')) {
      conceptIndex.set(key, {
        label: row['LABEL'] as string || '',
        canonicalGroup: row['CANONICAL_GROUP'] as string || '',
        isReadOnly: row['READ_ONLY'] === 'TRUE'
      });
    }
  }

  for (const row of excelRows) {
    const key = row['KEY'] as string;
    const label = row['LABEL'] as string;
    
    // Skip separator rows
    if (!key || key.startsWith('_SECTION_')) continue;
    
    // Skip rows without a key (malformed rows)
    if (!key.trim()) continue;

    const conceptInfo = conceptIndex.get(key);
    const isReadOnly = conceptInfo?.isReadOnly || row['READ_ONLY'] === 'TRUE';

    // For each bill in the Excel
    for (const billId of excelBillIds) {
      const bill = billMap.get(billId);
      if (!bill) {
        // Try to find bill by filename/date match
        const fallbackBill = currentBills.find(b => 
          b.fileName?.includes(billId) || 
          b.fechaInicio?.includes(billId)
        );
        if (fallbackBill) {
          // Use fallback bill ID
          errors.push(`Using fallback match for bill: ${billId} → ${fallbackBill.id}`);
        } else {
          errors.push(`Bill not found: ${billId}`);
          continue;
        }
      }

      const actualBillId = bill?.id || billId;
      const actualBill = bill || currentBills.find(b => b.id === billId);
      if (!actualBill) continue;

      // Parse value safely (handles comma/decimals)
      const excelValue = safeParseNumber(row[billId]);
      let currentValue = 0;

      // Get current value based on key
      try {
        if (key.startsWith('energia_')) {
          const field = key.replace('energia_', '');
          currentValue = (actualBill as any)[field] || 0;
        } else if (key.startsWith('potencia_')) {
          const field = key.replace('potencia_', '');
          currentValue = (actualBill as any)[field] || 0;
        } else if (key.startsWith('oc_')) {
          const canonicalGroup = key.replace('oc_', '');
          const billOC = currentCustomOCs[actualBillId] || [];
          currentValue = getBillCanonicalTotal(actualBill, billOC, canonicalGroup);
        } else if (key === 'totalFactura') {
          // Calculate theoretical total
          const e = actualBill.costeTotalConsumo || 0;
          const p = actualBill.costeTotalPotencia || 0;
          let ocs = 0;
          actualBill.otrosConceptos?.forEach(oc => ocs += oc.total);
          (currentCustomOCs[actualBillId] || []).forEach(oc => ocs += oc.total);
          currentValue = e + p + ocs;
        } else {
          // Fallback matching for malformed Excel
          const fallback = findConceptByFallback(label, row['CANONICAL_GROUP'] || '', currentBills, currentCustomOCs, actualBillId);
          if (fallback) {
            currentValue = fallback.currentValue;
          } else {
            errors.push(`Unknown concept key: ${key} (${label})`);
            continue;
          }
        }
      } catch (e) {
        errors.push(`Error getting value for ${key}: ${e}`);
        continue;
      }

      // Check if value changed (with small tolerance for floating point)
      if (Math.abs(excelValue - currentValue) > 0.01) {
        const isTotalesSection = key === 'totalFactura';
        
        changes.push({
          billId: actualBillId,
          conceptKey: key,
          conceptName: label,
          canonicalGroup: row['CANONICAL_GROUP'] || '',
          oldValue: currentValue,
          newValue: excelValue,
          section: getSectionFromKey(key),
          isReadOnly: isReadOnly || isTotalesSection,
          isValidated: isTotalesSection,
          discrepancyFlagged: isTotalesSection && Math.abs(excelValue - currentValue) > 0.01
        });
        affectedBills.add(actualBillId);
      }
    }
  }

  return {
    changes,
    totalChanges: changes.length,
    affectedBills: Array.from(affectedBills),
    errors
  };
}

/**
 * Apply detected changes to project data
 * CRITICAL: Skips read-only fields (like TOTAL FACTURA)
 */
export function applyCorrectionChanges(
  bills: ExtractedBill[],
  customOCs: Record<string, { concepto: string; total: number }[]>,
  changes: CorrectionChange[]
): { 
  updatedBills: ExtractedBill[], 
  updatedCustomOCs: Record<string, { concepto: string; total: number }[]>,
  appliedChanges: CorrectionChange[],
  skippedChanges: CorrectionChange[]
} {
  const updatedBills = [...bills];
  const updatedCustomOCs = JSON.parse(JSON.stringify(customOCs)) as Record<string, { concepto: string; total: number }[]>;
  const appliedChanges: CorrectionChange[] = [];
  const skippedChanges: CorrectionChange[] = [];

  for (const change of changes) {
    const billIdx = updatedBills.findIndex(b => b.id === change.billId);
    if (billIdx === -1) continue;

    const bill = updatedBills[billIdx];

    // CRITICAL: Skip read-only fields
    if (change.isReadOnly || change.isValidated) {
      skippedChanges.push(change);
      continue;
    }

    if (change.conceptKey.startsWith('energia_')) {
      const field = change.conceptKey.replace('energia_', '');
      (bill as any)[field] = change.newValue;
      appliedChanges.push(change);
    } else if (change.conceptKey.startsWith('potencia_')) {
      const field = change.conceptKey.replace('potencia_', '');
      (bill as any)[field] = change.newValue;
      appliedChanges.push(change);
    } else if (change.conceptKey.startsWith('oc_')) {
      const canonicalGroup = change.conceptKey.replace('oc_', '');
      
      if (!updatedCustomOCs[change.billId]) {
        updatedCustomOCs[change.billId] = [];
      }
      
      // Find existing concept with same canonical group
      const existingIdx = updatedCustomOCs[change.billId].findIndex(
        oc => getCanonicalName(oc.concepto) === canonicalGroup
      );

      if (existingIdx !== -1) {
        if (change.newValue === 0) {
          updatedCustomOCs[change.billId].splice(existingIdx, 1);
        } else {
          updatedCustomOCs[change.billId][existingIdx].total = change.newValue;
        }
        appliedChanges.push(change);
      } else if (change.newValue !== 0) {
        updatedCustomOCs[change.billId].push({
          concepto: change.conceptName,
          total: change.newValue
        });
        appliedChanges.push(change);
      }
    }
    // TOTAL FACTURA is explicitly NOT applied - it's read-only
  }

  return { updatedBills, updatedCustomOCs, appliedChanges, skippedChanges };
}

/**
 * Generate audit log entries for applied changes
 */
export function generateAuditLogEntries(
  changes: CorrectionChange[],
  projectId: string
): Array<{
  bill_id: string;
  project_id: string;
  field_changed: string;
  old_value: string;
  new_value: string;
  change_source: string;
  change_reason: string;
  created_at: string;
}> {
  return changes.map(change => ({
    bill_id: change.billId,
    project_id: projectId,
    field_changed: change.conceptKey,
    old_value: String(change.oldValue),
    new_value: String(change.newValue),
    change_source: 'excel_import',
    change_reason: `Corrección desde Excel: ${change.conceptName}`,
    created_at: new Date().toISOString()
  }));
}

function getSectionFromKey(key: string): string {
  if (key.startsWith('energia_')) return 'energia';
  if (key.startsWith('potencia_')) return 'potencia';
  if (key.startsWith('oc_')) return 'otros';
  if (key === 'totalFactura') return 'totales';
  return 'metadata';
}

/**
 * Format changes for display with read-only warnings
 */
export function formatChangesForDisplay(changes: CorrectionChange[]): string[] {
  const lines: string[] = [];
  
  // Separate read-only from editable changes
  const editable = changes.filter(c => !c.isReadOnly && !c.isValidated);
  const readOnly = changes.filter(c => c.isReadOnly || c.isValidated);
  
  // Group editable changes by bill
  if (editable.length > 0) {
    lines.push('=== CAMBIOS A APLICAR ===');
    const byBill = new Map<string, CorrectionChange[]>();
    for (const change of editable) {
      if (!byBill.has(change.billId)) {
        byBill.set(change.billId, []);
      }
      byBill.get(change.billId)!.push(change);
    }

    for (const [billId, billChanges] of byBill) {
      lines.push(`Factura: ${billId}`);
      for (const change of billChanges) {
        lines.push(`  • ${change.conceptName}: ${change.oldValue.toFixed(2)} → ${change.newValue.toFixed(2)}`);
      }
    }
  }
  
  // Show read-only warnings
  if (readOnly.length > 0) {
    lines.push('');
    lines.push('=== SOLO LECTURA (no se aplicarán) ===');
    const byBill = new Map<string, CorrectionChange[]>();
    for (const change of readOnly) {
      if (!byBill.has(change.billId)) {
        byBill.set(change.billId, []);
      }
      byBill.get(change.billId)!.push(change);
    }

    for (const [billId, billChanges] of byBill) {
      lines.push(`Factura: ${billId}`);
      for (const change of billChanges) {
        if (change.discrepancyFlagged) {
          lines.push(`  ⚠️ ${change.conceptName}: ${change.oldValue.toFixed(2)} ≠ ${change.newValue.toFixed(2)} (diferencia detectada)`);
        } else {
          lines.push(`  🔒 ${change.conceptName}: ${change.oldValue.toFixed(2)} → ${change.newValue.toFixed(2)} [BLOQUEADO]`);
        }
      }
    }
  }

  return lines;
}

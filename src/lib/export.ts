import * as XLSX from 'xlsx';
import { ExtractedBill } from './types';
import { getOrderedConcepts, getBillCanonicalTotal } from './concept-utils';

export interface ConceptDefinition {
  key: string;
  label: string;
  isSeparator?: boolean;
  highlight?: boolean;
  isCustomOC?: boolean;
  sources?: string[];
}

export function exportBillsToExcel(
  bills: ExtractedBill[], 
  customOCs: Record<string, { concepto: string; total: number }[]>,
  concepts?: ConceptDefinition[], 
  getVal?: (bill: ExtractedBill, conceptKey: string) => string | number
) {
  const validBills = bills.filter(b => b.status === 'success');
  if (validBills.length === 0) return;

  // If concepts and getVal are provided, use them (backward compatibility)
  if (concepts && getVal) {
    exportWithCustomConcepts(validBills, concepts, getVal);
    return;
  }

  // Use canonical grouping for fidelity with FileTable display
  exportWithCanonicalGrouping(validBills, customOCs);
}

function exportWithCustomConcepts(
  bills: ExtractedBill[],
  concepts: ConceptDefinition[],
  getVal: (bill: ExtractedBill, conceptKey: string) => string | number
) {
  const rows = concepts.map(concept => {
    if (concept.isSeparator) {
      const separatorRow: any = { 'Concepto / Periodo': `--- ${concept.label.toUpperCase()} ---` };
      bills.forEach(bill => {
        const colTitle = bill.fechaInicio ? `${bill.fechaInicio} a ${bill.fechaFin}` : bill.fileName;
        separatorRow[colTitle] = '';
      });
      return separatorRow;
    }

    const rowObj: any = { 'Concepto / Periodo': concept.label };

    bills.forEach(bill => {
      let colTitle = bill.fechaInicio ? `${bill.fechaInicio} a ${bill.fechaFin}` : bill.fileName;
      let val = getVal(bill, concept.key);
      
      if (typeof val === 'string' && val !== '-' && !isNaN(Number(val))) {
        val = Number(val);
      }
      rowObj[colTitle] = val;
    });

    return rowObj;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Facturas (Transpuesta)');
  XLSX.writeFile(workbook, 'Analisis_Avanzado_Facturas.xlsx');
}

function exportWithCanonicalGrouping(
  bills: ExtractedBill[],
  customOCs: Record<string, { concepto: string; total: number }[]>
) {
  // Build rows exactly as they appear in FileTable
  const rows: any[] = [];

  // Fixed concept definitions (matches FileTable structure)
  const fixedConcepts = [
    { key: 'fileName', label: 'Nombre Archivo' },
    { key: 'comercializadora', label: 'Compañía' },
    { key: 'titular', label: 'Titular' },
    { key: 'cups', label: 'CUPS' },
    { key: 'tarifa', label: 'Tarifa' },
    { key: 'fechaInicio', label: 'Fecha Inicio' },
    { key: 'fechaFin', label: 'Fecha Fin' },
  ];

  const divider = (label: string) => ({ isSeparator: true, label });

  const energiaConcepts = [
    { key: 'consumoTotalKwh', label: 'TOTAL CONSUMO (kWh)' },
    { key: 'cons_P1', label: 'Consumo P1 (kWh)' },
    { key: 'cons_P2', label: 'Consumo P2 (kWh)' },
    { key: 'cons_P3', label: 'Consumo P3 (kWh)' },
    { key: 'cons_P4', label: 'Consumo P4 (kWh)' },
    { key: 'cons_P5', label: 'Consumo P5 (kWh)' },
    { key: 'cons_P6', label: 'Consumo P6 (kWh)' },
    { key: 'costeTotalConsumo', label: 'TOTAL COSTE CONSUMO (€)' },
    { key: 'costeMedioKwh', label: 'COSTE MEDIO (€/kWh)' },
  ];

  const potenciaConcepts = [
    { key: 'costeTotalPotencia', label: 'TOTAL COSTE POTENCIA (€)' },
    { key: 'pot_P1', label: 'Potencia P1 (€)' },
    { key: 'pot_P2', label: 'Potencia P2 (€)' },
    { key: 'pot_P3', label: 'Potencia P3 (€)' },
    { key: 'pot_P4', label: 'Potencia P4 (€)' },
    { key: 'pot_P5', label: 'Potencia P5 (€)' },
    { key: 'pot_P6', label: 'Potencia P6 (€)' },
  ];

  // Get ordered canonical groups (matches FileTable exactly)
  const orderedGroups = getOrderedConcepts(bills, customOCs);

  // Helper to get bill value
  const getBillVal = (bill: ExtractedBill, key: string): number => {
    if (key.startsWith('cons_')) {
      const p = key.split('_')[1];
      return bill.consumo?.find(c => c.periodo === p)?.kwh || 0;
    }
    if (key.startsWith('pot_')) {
      const p = key.split('_')[1];
      return bill.potencia?.find(c => c.periodo === p)?.total || 0;
    }
    return (bill as any)[key] || 0;
  };

  // Column headers
  const colHeaders = bills.map(bill => 
    bill.fechaInicio ? `${bill.fechaInicio} a ${bill.fechaFin}` : bill.fileName
  );

  // Add fixed concepts
  for (const concept of fixedConcepts) {
    const row: any = { 'Concepto / Periodo': concept.label };
    colHeaders.forEach((col, i) => {
      row[col] = getBillVal(bills[i], concept.key);
    });
    rows.push(row);
  }

  // Divider: Energia
  rows.push({
    'Concepto / Periodo': '--- ENERGÍA ---',
    ...Object.fromEntries(colHeaders.map(c => [c, '']))
  });

  // Energia concepts
  for (const concept of energiaConcepts) {
    const row: any = { 'Concepto / Periodo': concept.label };
    colHeaders.forEach((col, i) => {
      row[col] = getBillVal(bills[i], concept.key);
    });
    rows.push(row);
  }

  // Divider: Potencia
  rows.push({
    'Concepto / Periodo': '--- POTENCIA ---',
    ...Object.fromEntries(colHeaders.map(c => [c, '']))
  });

  // Potencia concepts
  for (const concept of potenciaConcepts) {
    const row: any = { 'Concepto / Periodo': concept.label };
    colHeaders.forEach((col, i) => {
      row[col] = getBillVal(bills[i], concept.key);
    });
    rows.push(row);
  }

  // Divider: Otros Conceptos
  rows.push({
    'Concepto / Periodo': '--- OTROS CONCEPTOS ---',
    ...Object.fromEntries(colHeaders.map(c => [c, '']))
  });

  // Canonical grouped concepts (matches FileTable display)
  for (const group of orderedGroups) {
    const row: any = { 'Concepto / Periodo': group.displayName };
    colHeaders.forEach((col, i) => {
      const billOC = customOCs[bills[i].id] || [];
      row[col] = getBillCanonicalTotal(bills[i], billOC, group.canonicalName);
    });
    rows.push(row);
  }

  // Divider: Totales
  rows.push({
    'Concepto / Periodo': '--- TOTALES ---',
    ...Object.fromEntries(colHeaders.map(c => [c, '']))
  });

  // Total factura
  const totalRow: any = { 'Concepto / Periodo': 'TOTAL FACTURA (€)' };
  colHeaders.forEach((col, i) => {
    const e = bills[i].costeTotalConsumo || 0;
    const p = bills[i].costeTotalPotencia || 0;
    let ocs = 0;
    bills[i].otrosConceptos?.forEach(oc => ocs += oc.total);
    (customOCs[bills[i].id] || []).forEach(oc => ocs += oc.total);
    totalRow[col] = e + p + ocs;
  });
  rows.push(totalRow);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Facturas (Transpuesta)');
  XLSX.writeFile(workbook, 'Analisis_Avanzado_Facturas.xlsx');
}

import * as XLSX from 'xlsx';
import { ExtractedBill } from './types';

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
  concepts: ConceptDefinition[], 
  getVal: (bill: ExtractedBill, conceptKey: string) => string | number
) {
  const validBills = bills.filter(b => b.status === 'success');
  if (validBills.length === 0) return;

  // Build rows exactly as they appear in the UI
  const rows = concepts.map(concept => {
    if (concept.isSeparator) {
      // For separator rows, just put the label in the first column and leave the rest blank
      const separatorRow: any = { 'Concepto / Periodo': `--- ${concept.label.toUpperCase()} ---` };
      validBills.forEach(bill => {
        const colTitle = bill.fechaInicio ? `${bill.fechaInicio} a ${bill.fechaFin}` : bill.fileName;
        separatorRow[colTitle] = '';
      });
      return separatorRow;
    }

    const rowObj: any = { 'Concepto / Periodo': concept.label };

    validBills.forEach(bill => {
      let colTitle = bill.fechaInicio ? `${bill.fechaInicio} a ${bill.fechaFin}` : bill.fileName;
      // In case of duplicate column titles, XLSX might overwrite. Append invisible space if needed.
      let val = getVal(bill, concept.key);
      
      // Attempt to convert string numbers to actual numbers for Excel formulas
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

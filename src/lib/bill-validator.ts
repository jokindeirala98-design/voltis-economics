/**
 * Sistema de Validación Matemática de Facturas
 * 
 * Responsabilidades:
 * 1. Extraer total impreso de la factura
 * 2. Calcular suma teórica de todos los conceptos
 * 3. Comparar y detectar discrepancias
 * 4. Gestionar estados de validación
 */

import { ExtractedBill } from './types';

export type ValidationStatus = 'unchecked' | 'pending' | 'validated' | 'discrepancy' | 'failed';
export type ExtractionStatus = 'pending' | 'success' | 'error' | 'partial';

export interface ValidationResult {
  printedTotal: number;
  calculatedTotal: number;
  discrepancy: number;
  discrepancyPercent: number;
  isValid: boolean;
  tolerance: number;
  details: ValidationDetail[];
}

export interface ValidationDetail {
  category: string;
  amount: number;
  included: boolean;
}

export interface BillValidation {
  billId: string;
  extractionStatus: ExtractionStatus;
  validationStatus: ValidationStatus;
  mathCheckPassed: boolean | null;
  discrepancyAmount: number;
  reviewAttempts: number;
  validationNotes: string;
  lastValidatedAt?: Date;
}

/**
 * Calcula el total teóretico de una factura
 */
export function calculateTheoreticalTotal(bill: ExtractedBill): number {
  let total = 0;
  
  // 1. Energía (coste consumo)
  if (bill.costeTotalConsumo) {
    total += bill.costeTotalConsumo;
  }
  
  // 2. Potencia (término fijo)
  if (bill.costeTotalPotencia) {
    total += bill.costeTotalPotencia;
  }
  
  // 3. Otros conceptos
  if (bill.otrosConceptos) {
    for (const oc of bill.otrosConceptos) {
      if (oc.total) {
        total += oc.total;
      }
    }
  }
  
  return Math.round(total * 100) / 100; // Redondear a 2 decimales
}

/**
 * Desglosa los componentes del total
 */
export function getTotalBreakdown(bill: ExtractedBill): ValidationDetail[] {
  const details: ValidationDetail[] = [];
  
  if (bill.costeTotalConsumo) {
    details.push({
      category: 'Energía',
      amount: bill.costeTotalConsumo,
      included: true
    });
  }
  
  if (bill.costeTotalPotencia) {
    details.push({
      category: 'Potencia',
      amount: bill.costeTotalPotencia,
      included: true
    });
  }
  
  if (bill.otrosConceptos) {
    for (const oc of bill.otrosConceptos) {
      details.push({
        category: oc.concepto,
        amount: oc.total || 0,
        included: true
      });
    }
  }
  
  return details;
}

/**
 * Valida matemáticamente una factura
 */
export function validateBill(
  bill: ExtractedBill,
  toleranceEuros: number = 0.10
): ValidationResult {
  const printedTotal = bill.totalFactura || 0;
  const calculatedTotal = calculateTheoreticalTotal(bill);
  const discrepancy = Math.abs(printedTotal - calculatedTotal);
  const discrepancyPercent = printedTotal > 0 
    ? (discrepancy / printedTotal) * 100 
    : 0;
  
  const isValid = discrepancy <= toleranceEuros;
  
  return {
    printedTotal,
    calculatedTotal,
    discrepancy,
    discrepancyPercent,
    isValid,
    tolerance: toleranceEuros,
    details: getTotalBreakdown(bill)
  };
}

/**
 * Determina el estado de validación basado en el resultado
 */
export function determineValidationStatus(
  result: ValidationResult,
  reviewAttempts: number
): ValidationStatus {
  if (reviewAttempts >= 3) {
    return 'failed';
  }
  
  if (result.isValid) {
    return 'validated';
  }
  
  if (result.discrepancy > result.tolerance * 5) {
    return 'failed';
  }
  
  if (reviewAttempts > 0) {
    return 'pending';
  }
  
  return 'discrepancy';
}

/**
 * Genera mensaje de error para discrepancy
 */
export function getValidationMessage(result: ValidationResult): string {
  if (result.isValid) {
    return 'Factura validada correctamente ✓';
  }
  
  const diff = result.discrepancy.toFixed(2);
  const pct = result.discrepancyPercent.toFixed(1);
  
  if (result.discrepancyPercent > 5) {
    return `⚠️ Discrepancia significativa: ${diff}€ (${pct}%)`;
  }
  
  return `ℹ️ Discrepancia menor: ${diff}€ (${pct}%)`;
}

/**
 * Compara dos facturas para detectar cambios tras corrección
 */
export function compareBillFields(
  original: Partial<ExtractedBill>,
  corrected: Partial<ExtractedBill>
): Array<{ field: string; oldValue: any; newValue: any }> {
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
  
  const fieldsToCompare: Array<keyof ExtractedBill> = [
    'costeTotalConsumo',
    'costeTotalPotencia', 
    'costeMedioKwh',
    'consumoTotalKwh',
    'totalFactura'
  ];
  
  for (const field of fieldsToCompare) {
    const oldVal = original[field];
    const newVal = corrected[field];
    
    if (oldVal !== newVal) {
      changes.push({
        field,
        oldValue: oldVal,
        newValue: newVal
      });
    }
  }
  
  return changes;
}

/**
 * Tipo de cambio para auditoría
 */
export type ChangeSource = 'ai_extraction' | 'manual_edit' | 'import_correction' | 'ai_refine';

/**
 * Interfaz para registro de auditoría
 */
export interface AuditLogEntry {
  billId: string;
  fieldChanged: string;
  oldValue: string | number | null;
  newValue: string | number | null;
  changeSource: ChangeSource;
  changedAt: Date;
  changedBy?: string;
}

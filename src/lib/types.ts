export interface ConsumoItem {
  periodo: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | string;
  kwh: number;
  precioKwh: number;
  total: number;
  precioEstimated?: boolean;
  isAggregate?: boolean;
}

export interface PotenciaItem {
  periodo: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | string;
  kw: number;
  precioKwDia: number;
  dias: number;
  total: number;
}

export interface OtroConcepto {
  concepto: string;
  total: number;
}

export interface PowerExcess {
  periodo: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | string;
  kwRegistered: number;
  kwContracted: number;
  kwExcess: number;
  precioExcess: number;
  total: number;
  diasFacturados?: number;
}

export interface ExtractedBillExcessData {
  hasExcess: boolean;
  totalExcess: number;
  details: PowerExcess[];
}

export function isPowerExcessConcept(concepto: string): boolean {
  const lower = concepto.toLowerCase();
  
  // EXCESS/CHARGE indicators - must be present
  const excessIndicators = [
    'exceso',
    'penalizacion',
    'penalización',
    'recargo'
  ];
  
  // POWER indicators - must be present
  const powerIndicators = [
    'potencia',
    'kw',
    'pot'
  ];
  
  // Combined patterns that indicate excess without explicit "exceso"
  const combinedPatterns = [
    { excess: 'demanda', power: 'potencia' },  // "Potencia demandada" = excess
    { excess: 'maximetro', power: 'kw' },      // "Exceso Maxímetro KW"  
  ];
  
  // Check for explicit excess + power
  const hasExcess = excessIndicators.some(ind => lower.includes(ind));
  const hasPower = powerIndicators.some(ind => lower.includes(ind));
  
  if (hasExcess && hasPower) {
    return true;
  }
  
  // Check combined patterns (e.g., "demanda" + "potencia" together)
  for (const pattern of combinedPatterns) {
    if (lower.includes(pattern.excess) && lower.includes(pattern.power)) {
      return true;
    }
  }
  
  return false;
}

export function getExcessAmountFromBill(bill: { otrosConceptos?: OtroConcepto[] }): { totalExcess: number; concepts: OtroConcepto[] } {
  if (!bill.otrosConceptos || bill.otrosConceptos.length === 0) {
    return { totalExcess: 0, concepts: [] };
  }
  const excessConcepts = bill.otrosConceptos.filter(oc => isPowerExcessConcept(oc.concepto));
  const totalExcess = excessConcepts.reduce((sum, oc) => sum + (oc.total || 0), 0);
  return { totalExcess, concepts: excessConcepts };
}

// ============================================================
// GAS BILL INTERFACES
// ============================================================

export interface GasConsumption {
  kwh: number;
  m3?: number;
  factorConversion?: number;
  tipoLectura?: 'real' | 'estimada' | 'media';
  lecturaAnterior?: number;
  lecturaActual?: number;
}

export interface GasAdjustment {
  concepto: string;
  kwh: number;
  euros: number;
}

export interface GasPricing {
  precioKwh: number;
  precioKwhEstimated?: boolean;
  terminoFijoDiario: number;
  diasFacturados: number;
  terminoFijoTotal: number;
  impuestoHidrocarbTotal: number;
  alquilerTotal: number;
  ivaPorcentaje: number;
  ivaTotal: number;
  descuentoTerminoFijo?: number; // Categoria 2
  descuentoOtros?: number;       // Categoria 3
}

// ============================================================
// UNIFIED BILL TYPE
// ============================================================

export type EnergyType = 'electricity' | 'gas';

export interface ExtractedBill {
  id: string;
  projectId?: string;
  fileName: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
  
  // Energy type discriminator (NEW)
  energyType: EnergyType;
  
  // Common fields
  comercializadora?: string;
  titular?: string;
  cups?: string;
  fechaInicio?: string;
  fechaFin?: string;
  
  // Electricity-specific fields
  tarifa?: string;
  consumo?: ConsumoItem[];
  potencia?: PotenciaItem[];
  otrosConceptos?: OtroConcepto[];
  consumoTotalKwh?: number;
  costeTotalConsumo?: number;
  costeMedioKwh?: number;
  costeTotalPotencia?: number;
  
  // Structured energy costs (NEW)
  costeBrutoConsumo?: number;
  descuentoEnergia?: number;
  costeNetoConsumo?: number;
  costeMedioKwhNeto?: number;
  
  // Gas-specific fields (NEW)
  tarifaRL?: string;
  gasConsumption?: GasConsumption;
  gasPricing?: GasPricing;
  gasAdjustments?: GasAdjustment[];
  
  // Common totals
  totalFactura?: number;
  originalFileBase64?: string;
  fileMimeType?: string;
  
  // Validación y trazabilidad
  extractionStatus?: 'pending' | 'success' | 'error' | 'partial';
  validationStatus?: 'unchecked' | 'pending' | 'validated' | 'discrepancy' | 'failed';
  mathCheckPassed?: boolean | null;
  discrepancyAmount?: number;
  reviewAttempts?: number;
  validationNotes?: string;
  lastValidatedAt?: string;
  
  // Report inclusion
  includeInReport?: boolean;
  
  // Storage
  storagePath?: string;
  fileHash?: string;
  
  // Extraction warnings (NEW)
  extractionWarnings?: string[];
  
  // Power excess tracking
  excessData?: ExtractedBillExcessData;
}

// Helper type guards
export function isGasBill(bill: ExtractedBill): bill is ExtractedBill & { energyType: 'gas' } {
  return bill.energyType === 'gas';
}

export function isElectricityBill(bill: ExtractedBill): bill is ExtractedBill & { energyType: 'electricity' } {
  return bill.energyType === 'electricity';
}

// Default values for backwards compatibility
export const DEFAULT_BILL_ENERGY_TYPE: EnergyType = 'electricity';

export interface QueueItem {
  id: string;
  projectId?: string;
  fileName: string;
  fileSize?: number;
  status: 'loading' | 'success' | 'error';
  error?: string;
  addedAt: number;
}

export interface ProjectFolder {
  id: string;
  name: string;
  user_id?: string;
  projectIds: string[];
  updatedAt: number;
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  folderId?: string; // NEW: Relationship to folder
  bills: ExtractedBill[];
  customOCs: Record<string, any>;
  queueItems?: QueueItem[];
  updatedAt: number;
}

export interface BillAuditLog {
  id: string;
  billId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changeSource: 'ai_extraction' | 'manual_edit' | 'import_correction' | 'ai_refine';
  changedAt: string;
  changedBy?: string;
}

export interface ConceptNormalization {
  id: string;
  original_text: string;
  normalized_text: string;
  canonical_group: string;
  confidence: number;
  source_scope: 'global' | 'commercial' | 'project';
  is_system: boolean;
  created_at: string;
  created_by?: string;
}

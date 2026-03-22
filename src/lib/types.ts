export interface ConsumoItem {
  periodo: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | string;
  kwh: number;
  precioKwh: number;
  total: number;
  precioEstimado?: boolean;
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

export interface ExtractedBill {
  id: string;
  fileName: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
  
  comercializadora?: string;
  titular?: string;
  cups?: string;
  fechaInicio?: string;
  fechaFin?: string;
  tarifa?: string;
  
  consumo?: ConsumoItem[];
  potencia?: PotenciaItem[];
  otrosConceptos?: OtroConcepto[];
  
  consumoTotalKwh?: number;
  costeTotalConsumo?: number;
  costeMedioKwh?: number;
  costeTotalPotencia?: number;
  
  totalFactura?: number;
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  bills: ExtractedBill[];
  customOCs: Record<string, any>;
  updatedAt: number;
}

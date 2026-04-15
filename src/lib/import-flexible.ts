import * as XLSX from 'xlsx';
import { ExtractedBill } from './types';

export interface FlexibleImportResult {
  bills: ExtractedBill[];
  customOCs: Record<string, { concepto: string; total: number }[]>;
  warnings: string[];
  imported: number;
  skipped: number;
  format: 'transposed' | 'rows' | 'detected' | 'unknown' | 'monthly-matrix';
}

export interface FieldMapping {
  original: string;
  normalized: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Concept row patterns for monthly matrix import
 * These map Excel row labels to internal bill fields
 */
type ConceptPattern = { patterns: RegExp[]; field: string; category: 'potencia' | 'energia' | 'impuestos' | 'ajuste' };
const MATRIX_CONCEPT_PATTERNS: Record<string, ConceptPattern[]> = {
  terminoPotencia: [
    { patterns: [/termino.*potencia/i, /potencia.*fijo/i, /termino.*fijo/i], field: 'terminoPotencia', category: 'potencia' }
  ],
  peajeEnergia: [
    { patterns: [/peaje.*acceso/i, /acceso.*red/i, /peaje.*energia/i], field: 'peajeEnergia', category: 'energia' }
  ],
  cargosEnergia: [
    { patterns: [/cargo.*energia/i, /cargos.*energia/i, /cargo.*sistema/i], field: 'cargosEnergia', category: 'energia' }
  ],
  precioMercado: [
    { patterns: [/precio.*coste.*mercado/i, /coste.*mercado/i, /pcm/i, /precio.*mercado/i, /energia.*pcm/i], field: 'precioMercado', category: 'energia' }
  ],
  reactivas: [
    { patterns: [/reactiva/i, /energia.*reactiva/i], field: 'reactivas', category: 'energia' }
  ],
  excesosPotencia: [
    { patterns: [/exceso.*potencia/i, /excesos.*potencia/i, /penalizacion.*potencia/i], field: 'excesosPotencia', category: 'potencia' }
  ],
  impuestosElectricos: [
    { patterns: [/impuesto.*electrico/i, /impuestos.*electricos/i, /ie.*€/i], field: 'impuestosElectricos', category: 'impuestos' }
  ],
  remuneracionComercial: [
    { patterns: [/remuneracion.*comercial/i, /comercializadora/i, /margen.*comercial/i], field: 'remuneracionComercial', category: 'ajuste' }
  ],
  ajusteAdenda: [
    { patterns: [/ajuste.*adenda/i, /adenda/i, /ajuste.*rdl/i], field: 'ajusteAdenda', category: 'ajuste' }
  ],
  excedentePlacas: [
    { patterns: [/excedente.*placas/i, /excedentes/i, /compensacion/i, /autoconsumo/i], field: 'excedentePlacas', category: 'ajuste' }
  ],
  totalFactura: [
    { patterns: [/^total.*€/i, /total.*€.*$/i, /total\s*$/i, /base.*imponible/i], field: 'totalFactura', category: 'ajuste' }
  ],
  totalConsumoKwh: [
    { patterns: [/total.*kwh/i, /consumo.*total.*kwh/i, /kwh.*total/i], field: 'consumoTotalKwh', category: 'energia' }
  ],
  iva: [
    { patterns: [/^iva$/i, /iva.*%/i, /impuesto.*valor/i], field: 'iva', category: 'impuestos' }
  ]
};

/**
 * Month column detection patterns
 * Matches formats like: "febrero 25", "marzo 2025", "Feb 25", "ene-25", etc.
 */
const MONTH_COLUMN_PATTERNS: RegExp[] = [
  /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*'?(\d{2,4})?$/i,
  /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[.\-]?\s*'?(\d{2,4})?$/i,
  /^\d{1,2}\/\d{1,2}\/(\d{2,4})$/,
  /^(q[1-4]|t[1-4])[\s\-]?(\d{2,4})?$/i
];

/**
 * Period row detection patterns (P1-P6)
 */
const PERIOD_ROW_PATTERNS: [RegExp, string][] = [
  [/\b(punta|p1)\b/i, 'P1'],
  [/\b(llano|p2)\b/i, 'P2'],
  [/\b(valle|p3)\b/i, 'P3'],
  [/\b(p4)\b/i, 'P4'],
  [/\b(p5)\b/i, 'P5'],
  [/\b(p6)\b/i, 'P6'],
  [/\btotal\b/i, 'TOTAL']
];

/**
 * Header normalization patterns for fuzzy matching
 */
const NORMALIZATION_PATTERNS: Record<string, RegExp[]> = {
  cups: [/cups/i, /cod/i, /punto/i, /referencia/i],
  fechaInicio: [/inicio/i, /desde/i, /fecha.*ini/i, /periodo.*ini/i, /desde.*fecha/i],
  fechaFin: [/fin/i, /hasta/i, /fecha.*fin/i, /periodo.*fin/i, /hasta.*fecha/i],
  consumoTotalKwh: [/consumo.*total/i, /total.*consumo/i, /kwh.*total/i, /total.*kwh/i, /energia.*kwh/i, /kwh/i],
  costeTotalConsumo: [/coste.*consumo/i, /consumo.*coste/i, /importe.*consumo/i, /total.*energia/i, /coste.*energia/i],
  costeTotalPotencia: [/coste.*potencia/i, /potencia.*coste/i, /importe.*potencia/i, /total.*potencia/i],
  totalFactura: [/total/i, /factura/i, /importe/i, /base.*imponible/i, /total.*pagar/i, /total.*euros/i],
  precioMedio: [/medio/i, /precio.*medio/i, /medio.*precio/i, /eur.*kwh/i, /preciokwh/i, /precio/i],
  empresa: [/empresa/i, /compañia/i, /comercial/i, /comercializadora/i, /distribuidora/i],
  titular: [/titular/i, /cliente/i, /nombre/i, /razon/i],
  tarifa: [/tarifa/i, /contrato/i, /modalidad/i],
};

/**
 * Month detection patterns
 */
const MONTH_PATTERNS: [RegExp, number][] = [
  [/enero|january|jan\.?\s/i, 0],
  [/febrero|february|feb\.?\s/i, 1],
  [/marzo|march|mar\.?\s/i, 2],
  [/abril|april|apr\.?\s/i, 3],
  [/mayo|may/i, 4],
  [/junio|june|jun\.?\s/i, 5],
  [/julio|july|jul\.?\s/i, 6],
  [/agosto|august|aug\.?\s/i, 7],
  [/septiembre|september|sep\.?\s/i, 8],
  [/octubre|october|oct\.?\s/i, 9],
  [/noviembre|november|nov\.?\s/i, 10],
  [/diciembre|december|dec\.?\s/i, 11],
];

/**
 * Period detection patterns
 */
const PERIOD_PATTERNS: [RegExp, string][] = [
  [/\bP1\b|punta|p1/i, 'P1'],
  [/\bP2\b|llano|p2/i, 'P2'],
  [/\bP3\b|valle|p3/i, 'P3'],
  [/\bP4\b|p4/i, 'P4'],
  [/\bP5\b|p5/i, 'P5'],
  [/\bP6\b|p6/i, 'P6'],
];

/**
 * Normalize a header string for comparison
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find best matching field for a header
 */
function matchField(header: string): { field: string; confidence: 'high' | 'medium' | 'low' } | null {
  const normalized = normalizeHeader(header);
  
  for (const [field, patterns] of Object.entries(NORMALIZATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalized) || pattern.test(header)) {
        const confidence = pattern.toString().startsWith('/^') ? 'high' : 'medium';
        return { field, confidence };
      }
    }
  }
  return null;
}

/**
 * Detect month from a string
 */
function detectMonth(value: string | number): number | null {
  const str = String(value);
  
  for (const [pattern, monthIdx] of MONTH_PATTERNS) {
    if (pattern.test(str)) return monthIdx;
  }
  
  // Try to parse as date
  const dateMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dateMatch) {
    const month = parseInt(dateMatch[2], 10) - 1;
    if (month >= 0 && month <= 11) return month;
  }
  
  return null;
}

/**
 * Parse a date string
 */
function parseFlexibleDate(value: string | number): { inicio?: string; fin?: string } {
  const str = String(value);
  const result: { inicio?: string; fin?: string } = {};
  
  // Try various date formats
  const formats = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/,
  ];
  
  for (const format of formats) {
    const match = str.match(format);
    if (match) {
      let day, month, year;
      if (match[1].length === 4) {
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10) - 1;
        day = parseInt(match[3], 10);
      } else {
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10) - 1;
        year = parseInt(match[3], 10);
        if (year < 100) year += 2000;
      }
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (str.toLowerCase().includes('inicio') || str.toLowerCase().includes('desde')) {
          result.inicio = isoDate;
        } else if (str.toLowerCase().includes('fin') || str.toLowerCase().includes('hasta')) {
          result.fin = isoDate;
        } else {
          result.inicio = isoDate;
        }
      }
      break;
    }
  }
  
  return result;
}

/**
 * Detect period (P1-P6) from header
 */
function detectPeriod(header: string): string | null {
  for (const [pattern, period] of PERIOD_PATTERNS) {
    if (pattern.test(header)) return period;
  }
  return null;
}

/**
 * Parse month column header to extract month index and year
 * Returns { month: 0-11, year: 4-digit year } or null if not a month column
 */
function parseMonthColumnHeader(header: string): { month: number; year: number } | null {
  const normalized = header.toLowerCase().trim();
  
  // Direct month name patterns
  const monthMap: Record<string, number> = {
    'enero': 0, 'ene': 0, 'jan': 0, 'january': 0,
    'febrero': 1, 'feb': 1, 'febuary': 1,
    'marzo': 2, 'mar': 2, 'march': 2,
    'abril': 3, 'abr': 3, 'apr': 3, 'april': 3,
    'mayo': 4, 'may': 4,
    'junio': 5, 'jun': 5, 'june': 5,
    'julio': 6, 'jul': 6, 'july': 6,
    'agosto': 7, 'ago': 7, 'aug': 7, 'august': 7,
    'septiembre': 8, 'sep': 8, 'sept': 8, 'september': 8,
    'octubre': 9, 'oct': 9, 'october': 9,
    'noviembre': 10, 'nov': 10, 'november': 10,
    'diciembre': 11, 'dic': 11, 'dec': 11, 'december': 11
  };
  
  // Try to extract month and year from formats like "febrero 25", "marzo 2025", "ene-25"
  const match = normalized.match(/^([a-záéíóú]+)[\s\-\.]*('?(\d{2,4}))?$/);
  if (match) {
    const monthStr = match[1];
    const yearStr = match[3];
    const monthIdx = monthMap[monthStr];
    
    if (monthIdx !== undefined) {
      // Determine year
      let year = new Date().getFullYear();
      if (yearStr) {
        year = parseInt(yearStr);
        if (year < 100) year += 2000;
      }
      return { month: monthIdx, year };
    }
  }
  
  return null;
}

/**
 * Match a concept row label to internal field
 */
function matchMatrixConcept(label: string): { field: string; category: string } | null {
  const normalized = label.toLowerCase().trim();
  
  // Define patterns inline to avoid TypeScript inference issues
  const patterns: Array<{ regex?: RegExp; str?: string; field: string; category: string }> = [
    // Término potencia
    { str: 'termino potencia', field: 'terminoPotencia', category: 'potencia' },
    { str: 'potencia fijo', field: 'terminoPotencia', category: 'potencia' },
    { str: 'termino fijo', field: 'terminoPotencia', category: 'potencia' },
    // Peaje energía
    { str: 'peaje acceso', field: 'peajeEnergia', category: 'energia' },
    { str: 'acceso red', field: 'peajeEnergia', category: 'energia' },
    // Cargos energía
    { str: 'cargo energia', field: 'cargosEnergia', category: 'energia' },
    { str: 'cargo sistema', field: 'cargosEnergia', category: 'energia' },
    // Precio mercado
    { regex: /precio.*coste.*mercado/i, field: 'precioMercado', category: 'energia' },
    { regex: /coste.*mercado/i, field: 'precioMercado', category: 'energia' },
    { regex: /pcm/i, field: 'precioMercado', category: 'energia' },
    // Reactivas
    { str: 'reactiva', field: 'reactivas', category: 'energia' },
    // Excesos potencia
    { str: 'exceso potencia', field: 'excesosPotencia', category: 'potencia' },
    { str: 'excesos potencia', field: 'excesosPotencia', category: 'potencia' },
    // Impuestos eléctricos
    { str: 'impuesto electrico', field: 'impuestosElectricos', category: 'impuestos' },
    { str: 'impuestos electricos', field: 'impuestosElectricos', category: 'impuestos' },
    // Remuneración comercial
    { str: 'remuneracion comercial', field: 'remuneracionComercial', category: 'ajuste' },
    { str: 'comercializadora', field: 'remuneracionComercial', category: 'ajuste' },
    // Ajuste adenda
    { str: 'ajuste adenda', field: 'ajusteAdenda', category: 'ajuste' },
    { str: 'adenda', field: 'ajusteAdenda', category: 'ajuste' },
    // Excedente placas
    { str: 'excedente placas', field: 'excedentePlacas', category: 'ajuste' },
    { str: 'excedentes', field: 'excedentePlacas', category: 'ajuste' },
    { str: 'compensacion', field: 'excedentePlacas', category: 'ajuste' },
    // Total
    { regex: /^total.*€/i, field: 'totalFactura', category: 'ajuste' },
    { regex: /total\s*$/i, field: 'totalFactura', category: 'ajuste' },
    { regex: /base.*imponible/i, field: 'totalFactura', category: 'ajuste' },
    // IVA
    { str: 'iva', field: 'iva', category: 'impuestos' },
  ];
  
  for (const p of patterns) {
    if (p.regex) {
      if (p.regex.test(normalized)) {
        return { field: p.field, category: p.category };
      }
    } else if (p.str) {
      if (normalized.includes(p.str)) {
        return { field: p.field, category: p.category };
      }
    }
  }
  
  return null;
}

/**
 * Import monthly matrix format (columns = months, rows = concepts)
 */
function importMonthlyMatrixFormat(
  workbook: XLSX.WorkBook,
  warnings: string[]
): FlexibleImportResult {
  const bills: ExtractedBill[] = [];
  const customOCs: Record<string, { concepto: string; total: number }[]> = {};
  
  // Structure to hold cost data per month (includes custom OCs as nested object)
  const monthCosts: Record<string, Record<string, number | Record<string, number>>> = {};
  // Structure to hold consumption data per month
  const monthConsumption: Record<string, Record<string, number>> = {};
  // Structure to hold period prices per month (€/kWh)
  const monthPrices: Record<string, Record<string, number>> = {};
  
  // Extract metadata from workbook
  let metadata: { company?: string; tariff?: string; titular?: string; cups?: string } = {};
  
  // Scan all sheets for metadata
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    
    // Look for metadata in first few rows
    for (const row of rows.slice(0, 10)) {
      const keys = Object.keys(row);
      for (const key of keys) {
        const value = String(row[key] || '').toLowerCase();
        
        // Detect company
        if (!metadata.company && (
          value.includes('compañia') || value.includes('comercializadora') || 
          value.includes('empresa') || value.includes('distribuidora')
        )) {
          const val = String(row[key]).replace(/^[^:]+:\s*/i, '');
          if (val && val.length > 1 && val !== key) {
            metadata.company = val.trim();
          }
        }
        
        // Detect tariff
        if (!metadata.tariff && (
          value.includes('tarifa') || value.includes('contrato')
        )) {
          const val = String(row[key]).replace(/^[^:]+:\s*/i, '');
          if (val && val.length > 1 && val !== key) {
            metadata.tariff = val.trim();
          }
        }
        
        // Detect titular
        if (!metadata.titular && (
          value.includes('titular') || value.includes('cliente') || value.includes('nombre')
        )) {
          const val = String(row[key]).replace(/^[^:]+:\s*/i, '');
          if (val && val.length > 1 && val !== key) {
            metadata.titular = val.trim();
          }
        }
        
        // Detect CUPS
        if (!metadata.cups && (
          value.includes('cups') || /^es[a-z0-9]{18,22}$/i.test(value.replace(/\s/g, ''))
        )) {
          const cupsMatch = String(row[key]).match(/es[a-z0-9]{18,22}/i);
          if (cupsMatch) {
            metadata.cups = cupsMatch[0].toUpperCase();
          }
        }
      }
    }
  }
  
  // Use default tariff if not found
  if (!metadata.tariff) {
    metadata.tariff = '3.0TD';
  }
  
  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    
    if (rows.length === 0) continue;
    
    // Get column headers
    const headers = Object.keys(rows[0] || {});
    
    // Check if this sheet has month columns
    const monthColumns: { header: string; month: number; year: number }[] = [];
    for (const header of headers) {
      const parsed = parseMonthColumnHeader(header);
      if (parsed) {
        monthColumns.push({ header, ...parsed });
      }
    }
    
    // If we found month columns, this is a matrix sheet
    if (monthColumns.length > 0) {
      const firstColumn = headers[0] || '';
      
      // Check if this is a consumption sheet (has P1-P6 rows)
      const hasPeriodRows = rows.some(row => {
        const label = String(row[firstColumn] || '').trim();
        return PERIOD_ROW_PATTERNS.some(([pattern]) => pattern.test(label));
      });
      
      // Also check for kWh headers
      const hasKwhColumns = headers.some(h => /kwh|kwh/i.test(h));
      
      if (hasPeriodRows || sheetName.toLowerCase().includes('consum') || hasKwhColumns) {
        // This is a consumption matrix sheet
        for (const row of rows) {
          const label = String(row[firstColumn] || '').trim();
          
          // Detect period
          for (const [pattern, period] of PERIOD_ROW_PATTERNS) {
            if (pattern.test(label) && period !== 'TOTAL') {
              // This row contains period data
              for (const col of monthColumns) {
                if (!monthConsumption[col.header]) {
                  monthConsumption[col.header] = {};
                }
                if (!monthPrices[col.header]) {
                  monthPrices[col.header] = {};
                }
                const value = parseNumber(row[col.header]);
                if (value > 0) {
                  monthConsumption[col.header][period] = value;
                }
              }
              break;
            }
          }
          
          // Look for price row (€/kWh)
          if (/precio|kwh|€.*kwh/i.test(label)) {
            for (const col of monthColumns) {
              if (!monthPrices[col.header]) {
                monthPrices[col.header] = {};
              }
              const value = parseNumber(row[col.header]);
              // Try to detect which period this price belongs to
              for (let p = 1; p <= 6; p++) {
                if (label.toLowerCase().includes(`p${p}`) || label.toLowerCase().includes(`periodo ${p}`)) {
                  monthPrices[col.header][`P${p}`] = value;
                }
              }
            }
          }
        }
      } else {
        // This is a cost/economic matrix sheet
        for (const row of rows) {
          const label = String(row[firstColumn] || '').trim();
          if (!label) continue;
          
          // Try to match this row to a known concept
          const match = matchMatrixConcept(label);
          
          if (match) {
            for (const col of monthColumns) {
              if (!monthCosts[col.header]) {
                monthCosts[col.header] = {};
              }
              const value = parseNumber(row[col.header]);
              if (value !== 0) {
                monthCosts[col.header][match.field] = value;
              }
            }
          } else if (label.toLowerCase() !== 'total' && !label.startsWith('-') && label.length > 1) {
            // Unmapped concept - add as custom OC for all months
            warnings.push(`Concepto no mapeado: "${label}" - añadido como concepto personalizado`);
            for (const col of monthColumns) {
              if (!monthCosts[col.header]) {
                monthCosts[col.header] = {};
              }
              const value = parseNumber(row[col.header]);
                if (value !== 0) {
                const customOCs = (monthCosts[col.header]['_customOCs'] as Record<string, number>) || {};
                customOCs[label] = value;
                (monthCosts[col.header] as any)['_customOCs'] = customOCs;
              }
            }
          }
        }
      }
    }
  }
  
  // Build monthly bills from collected data
  const allMonths = new Set([
    ...Object.keys(monthCosts),
    ...Object.keys(monthConsumption)
  ]);
  
  for (const monthHeader of allMonths) {
    const parsed = parseMonthColumnHeader(monthHeader);
    if (!parsed) continue;
    
    const { month, year } = parsed;
    const costs = monthCosts[monthHeader] || {};
    const consumption = monthConsumption[monthHeader] || {};
    const prices = monthPrices[monthHeader] || {};
    
    // Build the bill
    const billId = `matrix_${year}_${String(month + 1).padStart(2, '0')}`;
    
    // Helper to safely get number from costs
    const getCost = (key: string): number => {
      const val = costs[key];
      return typeof val === 'number' ? val : 0;
    };
    
    // Calculate totals
    // In Spanish billing, "costeTotalConsumo" typically includes all energy-related costs
    const costeEnergia = getCost('precioMercado') + getCost('peajeEnergia') + getCost('cargosEnergia');
    const costePotencia = getCost('terminoPotencia');
    const impuestosElectricos = getCost('impuestosElectricos');
    const iva = getCost('iva');
    const totalImpuestos = impuestosElectricos + iva;
    
    const otrosConceptos: { concepto: string; total: number }[] = [];
    
    // Add unmapped concepts as custom OCs
    const reactivas = getCost('reactivas');
    const excesosPotencia = getCost('excesosPotencia');
    const remuneracionComercial = getCost('remuneracionComercial');
    const ajusteAdenda = getCost('ajusteAdenda');
    const excedentePlacas = getCost('excedentePlacas');
    
    if (reactivas > 0) otrosConceptos.push({ concepto: 'Energía Reactiva', total: reactivas });
    if (excesosPotencia > 0) otrosConceptos.push({ concepto: 'Excesos de Potencia', total: excesosPotencia });
    if (remuneracionComercial > 0) otrosConceptos.push({ concepto: 'Remuneración Comercial', total: remuneracionComercial });
    if (ajusteAdenda > 0) otrosConceptos.push({ concepto: 'Ajuste Adenda', total: ajusteAdenda });
    if (excedentePlacas > 0) otrosConceptos.push({ concepto: 'Excedente Placas', total: excedentePlacas });
    if (totalImpuestos > 0) otrosConceptos.push({ concepto: 'Impuestos Eléctricos', total: totalImpuestos });
    
    // Add any unmapped custom OCs from this month
    const customOCsData = costs._customOCs as Record<string, number> | undefined;
    if (customOCsData) {
      for (const [conceptName, value] of Object.entries(customOCsData)) {
        if (value > 0 && !conceptName.toLowerCase().includes('total')) {
          otrosConceptos.push({ concepto: conceptName, total: value });
        }
      }
    }
    
    // Calculate total consumption from P1-P6 values
    let totalKwh = 0;
    for (let p = 1; p <= 6; p++) {
      totalKwh += consumption[`P${p}`] || 0;
    }
    
    // Build consumption array (P1-P6) with proper pricing
    const consumo: ExtractedBill['consumo'] = [];
    for (let p = 1; p <= 6; p++) {
      const periodKey = `P${p}`;
      const kwh = consumption[periodKey] || 0;
      
      // Determine price: use explicit price if available, otherwise derive from total
      let precioKwh = prices[periodKey] || 0;
      
      if (kwh > 0 && precioKwh === 0 && costeEnergia > 0 && totalKwh > 0) {
        // Derive average price: costeEnergia / totalKwh
        precioKwh = costeEnergia / totalKwh;
      }
      
      if (kwh > 0 || precioKwh > 0) {
        consumo.push({
          periodo: periodKey,
          kwh,
          precioKwh,
          total: kwh * precioKwh
        });
      }
    }
    
    // Total factura - use explicit total if available, otherwise sum all components
    let totalFactura = getCost('totalFactura');
    if (totalFactura === 0) {
      // Sum all cost components
      totalFactura = costeEnergia + costePotencia + totalImpuestos + 
        otrosConceptos.reduce((sum, oc) => sum + oc.total, 0);
    }
    
    // Calculate proper average price per kWh
    const avgPricePerKwh = totalKwh > 0 ? costeEnergia / totalKwh : 0;
    
    // Calculate dates correctly
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const fechaInicio = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const fechaFin = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    
    const bill: ExtractedBill = {
      id: billId,
      fileName: `Mes_${String(month + 1).padStart(2, '0')}_${year}.xlsx`,
      status: 'success',
      energyType: 'electricity',
      comercializadora: metadata.company,
      titular: metadata.titular,
      cups: metadata.cups,
      tarifa: metadata.tariff,
      fechaInicio,
      fechaFin,
      consumo,
      potencia: [],
      otrosConceptos,
      consumoTotalKwh: totalKwh,
      costeTotalConsumo: costeEnergia,
      costeTotalPotencia: costePotencia,
      costeMedioKwh: avgPricePerKwh,
      totalFactura,
    };
    
    bills.push(bill);
    customOCs[billId] = otrosConceptos;
    
    // Log warnings for debugging
    if (costeEnergia === 0 && totalKwh > 0) {
      warnings.push(`Mes ${monthHeader}: Energía sin coste definido`);
    }
    if (totalKwh === 0 && costeEnergia > 0) {
      warnings.push(`Mes ${monthHeader}: Consumo sin datos`);
    }
  }
  
  // Sort bills by date
  bills.sort((a, b) => {
    const dateA = a.fechaFin || '';
    const dateB = b.fechaFin || '';
    return dateA.localeCompare(dateB);
  });
  
  // Add metadata warnings
  if (!metadata.company) warnings.push('Compañía no detectada en el workbook');
  if (!metadata.tariff) warnings.push('Tarifa no detectada en el workbook');
  
  return {
    bills,
    customOCs,
    warnings,
    imported: bills.length,
    skipped: 0,
    format: 'monthly-matrix'
  };
}

/**
 * Parse number from any format
 */
function parseNumber(value: any): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,\-]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

/**
 * Auto-detect Excel format and import
 */
export async function importFlexibleExcel(file: File): Promise<FlexibleImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const warnings: string[] = [];
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        if (workbook.SheetNames.length === 0) {
          throw new Error('El archivo Excel no contiene hojas.');
        }
        
        // FIRST: Check for monthly matrix format (columns = months)
        // This format has multiple sheets with month columns
        let hasMonthColumns = false;
        let hasPeriodRows = false;
        
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
          
          if (rows.length === 0) continue;
          
          const headers = Object.keys(rows[0] || {});
          
          // Check for month columns
          for (const header of headers) {
            if (parseMonthColumnHeader(header)) {
              hasMonthColumns = true;
              break;
            }
          }
          
          // Check for period rows (P1-P6)
          const firstCol = headers[0] || '';
          for (const row of rows) {
            const label = String(row[firstCol] || '').trim();
            for (const [pattern] of PERIOD_ROW_PATTERNS) {
              if (pattern.test(label)) {
                hasPeriodRows = true;
                break;
              }
            }
            if (hasPeriodRows) break;
          }
        }
        
        // If we detect matrix format, use specialized importer
        if (hasMonthColumns) {
          const result = importMonthlyMatrixFormat(workbook, warnings);
          resolve(result);
          return;
        }
        
        // Otherwise, fall back to traditional format detection
        let bestSheet: string | null = null;
        let bestRowCount = 0;
        let detectedFormat: FlexibleImportResult['format'] = 'unknown';
        
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
          
          if (rows.length > bestRowCount) {
            bestRowCount = rows.length;
            bestSheet = sheetName;
            
            // Detect format
            const headers = Object.keys(rows[0] || {});
            if (headers[0]?.includes('Concepto') || headers[0]?.toLowerCase().includes('periodo')) {
              detectedFormat = 'transposed';
            } else if (headers.some(h => /kwh|kwh/i.test(h) || /consumo/i.test(h))) {
              detectedFormat = 'rows';
            } else {
              detectedFormat = 'detected';
            }
          }
        }
        
        if (!bestSheet) {
          throw new Error('No se encontró ninguna hoja con datos.');
        }
        
        const worksheet = workbook.Sheets[bestSheet];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        
        const result = detectFormatAndImport(rows, detectedFormat, warnings);
        result.format = detectedFormat;
        result.warnings = warnings;
        
        resolve(result);
        
      } catch (err: any) {
        reject(new Error('Error leyendo Excel: ' + err.message));
      }
    };
    
    reader.onerror = () => reject(new Error('Fallo al leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Detect format and import based on structure
 */
function detectFormatAndImport(
  rows: Record<string, any>[],
  format: FlexibleImportResult['format'],
  warnings: string[]
): FlexibleImportResult {
  
  if (format === 'transposed' || rows[0] && 
      (rows[0]['Concepto / Periodo'] || Object.keys(rows[0])[0]?.includes('Concepto'))) {
    return importTransposedFormat(rows, warnings);
  }
  
  // Try row-based format
  const rowResult = importRowBasedFormat(rows, warnings);
  if (rowResult.imported > 0) {
    return rowResult;
  }
  
  // Fallback: try generic import
  return importGenericFormat(rows, warnings);
}

/**
 * Import from transposed format (Concepto / Periodo as rows)
 */
function importTransposedFormat(
  rows: Record<string, any>[],
  warnings: string[]
): FlexibleImportResult {
  const firstRow = rows[0];
  const invoiceKeys = Object.keys(firstRow).filter(k => 
    k !== 'Concepto / Periodo' && k !== 'Concepto' && k.trim() !== ''
  );
  
  if (invoiceKeys.length === 0) {
    throw new Error('No se encontraron columnas de facturas válidas.');
  }
  
  const getCell = (conceptLabel: string, invoiceKey: string): any => {
    const row = rows.find(r =>
      r['Concepto / Periodo'] === conceptLabel ||
      r['Concepto'] === conceptLabel
    );
    return row ? row[invoiceKey] : null;
  };

  // Detect dynamic "Otros Conceptos" rows between the OTROS CONCEPTOS separator
  // and the FINAL separator (mirrors importBillsFromExcel behaviour)
  const labelOf = (r: Record<string, any>) =>
    String(r['Concepto / Periodo'] ?? r['Concepto'] ?? '');
  const otrosIndex = rows.findIndex(r => labelOf(r).toUpperCase().includes('OTROS CONCEPTOS'));
  const finalSeparatorIndex = rows.findIndex(r => labelOf(r).toUpperCase().includes('FINAL'));

  const fixedOcLabels = new Set([
    'Impuesto Eléctrico (€)',
    'IVA / IGIC (€)',
  ]);
  const customOcLabels: string[] = [];
  if (otrosIndex !== -1) {
    const end = finalSeparatorIndex !== -1 ? finalSeparatorIndex : rows.length;
    for (let i = otrosIndex + 1; i < end; i++) {
      const lbl = labelOf(rows[i]);
      if (!lbl || lbl.startsWith('---')) continue;
      if (fixedOcLabels.has(lbl)) continue;
      customOcLabels.push(lbl);
    }
  }

  // Detect gas vs electricity by presence of gas-specific labels anywhere in the sheet
  const gasLabelSet = new Set([
    'Impuesto sobre Hidrocarburos',
    'Término Fijo Total',
    'Término Fijo Diario',
    'Consumo M3',
    'Tarifa RL',
    'Factor Conversión',
    'Alquiler de Contador',
  ]);
  const isGasSheet = rows.some(r => gasLabelSet.has(labelOf(r)));

  const bills: ExtractedBill[] = invoiceKeys.map((invKey, idx) => {
    const fechaInicio = getCell('Fecha Inicio', invKey) || getCell('Fecha', invKey);
    const fechaFin = getCell('Fecha Fin', invKey) || getCell('Fecha', invKey);

    const bill: ExtractedBill = {
      id: `import_${Date.now()}_${idx}`,
      fileName: getCell('Nombre Archivo', invKey) || `Factura_Excel_${idx + 1}`,
      status: 'success',
      energyType: isGasSheet ? 'gas' : 'electricity',
      fechaInicio: fechaInicio ? String(fechaInicio).substring(0, 10) : undefined,
      fechaFin: fechaFin ? String(fechaFin).substring(0, 10) : undefined,
      cups: getCell('CUPS', invKey) || undefined,
      tarifa: isGasSheet
        ? (getCell('Tarifa', invKey) || getCell('Tarifa RL', invKey) || undefined)
        : (getCell('Tarifa', invKey) || '3.0TD'),
      comercializadora: getCell('Compañía', invKey) || getCell('Empresa', invKey) || undefined,
      titular: getCell('Titular', invKey) || undefined,
      consumo: [],
      potencia: [],
      otrosConceptos: [],
      consumoTotalKwh: parseNumber(getCell('TOTAL CONSUMO (kWh)', invKey)),
      costeTotalConsumo: parseNumber(getCell('TOTAL COSTE CONSUMO (€)', invKey)) || parseNumber(getCell('Coste Neto Consumo', invKey)) || parseNumber(getCell('Coste Bruto Consumo', invKey)),
      costeTotalPotencia: parseNumber(getCell('TOTAL COSTE POTENCIA (€)', invKey)),
      totalFactura: parseNumber(getCell('TOTAL FACTURA (€)', invKey)),
    };

    if (isGasSheet) {
      // Populate gas-specific fields
      const kwh = parseNumber(getCell('TOTAL CONSUMO (kWh)', invKey));
      const m3 = parseNumber(getCell('Consumo M3', invKey));
      const factor = parseNumber(getCell('Factor Conversión', invKey));
      const lectAnt = parseNumber(getCell('Lectura Anterior', invKey));
      const lectAct = parseNumber(getCell('Lectura Actual', invKey));
      const tipoLecturaRaw = String(getCell('Tipo Lectura', invKey) || '').toLowerCase();
      let tipoLectura: 'real' | 'estimada' | 'media' | undefined;
      if (tipoLecturaRaw.includes('real')) tipoLectura = 'real';
      else if (tipoLecturaRaw.includes('estim')) tipoLectura = 'estimada';
      else if (tipoLecturaRaw.includes('media')) tipoLectura = 'media';

      bill.gasConsumption = {
        kwh,
        m3: m3 > 0 ? m3 : undefined,
        factorConversion: factor > 0 ? factor : undefined,
        tipoLectura,
        lecturaAnterior: lectAnt > 0 ? lectAnt : undefined,
        lecturaActual: lectAct > 0 ? lectAct : undefined,
      };

      const precioKwh = parseNumber(getCell('Precio kWh', invKey));
      const tfDiario = parseNumber(getCell('Término Fijo Diario', invKey));
      const dias = parseNumber(getCell('Días Facturados', invKey));
      const tfTotal = parseNumber(getCell('Término Fijo Total', invKey));
      const impHC = parseNumber(getCell('Impuesto sobre Hidrocarburos', invKey));
      const alquiler = parseNumber(getCell('Alquiler de Contador', invKey));
      const ivaPct = parseNumber(getCell('IVA %', invKey)) || 21;
      const ivaTotal = parseNumber(getCell('IVA Total', invKey)) || parseNumber(getCell('IVA / IGIC (€)', invKey));
      const descTF = parseNumber(getCell('Descuento Término Fijo', invKey));
      const descOtros = parseNumber(getCell('Descuento Otros', invKey));

      bill.gasPricing = {
        precioKwh,
        terminoFijoDiario: tfDiario,
        diasFacturados: dias,
        terminoFijoTotal: tfTotal,
        impuestoHidrocarbTotal: impHC,
        alquilerTotal: alquiler,
        ivaPorcentaje: ivaPct,
        ivaTotal,
        descuentoTerminoFijo: descTF > 0 ? descTF : undefined,
        descuentoOtros: descOtros > 0 ? descOtros : undefined,
      };

      bill.tarifaRL = getCell('Tarifa RL', invKey) || undefined;
      bill.costeBrutoConsumo = parseNumber(getCell('Coste Bruto Consumo', invKey)) || undefined;
      bill.descuentoEnergia = parseNumber(getCell('Descuento Energía', invKey)) || undefined;
      bill.costeNetoConsumo = parseNumber(getCell('Coste Neto Consumo', invKey)) || undefined;
      if (bill.consumoTotalKwh && bill.consumoTotalKwh > 0 && bill.costeNetoConsumo) {
        bill.costeMedioKwhNeto = bill.costeNetoConsumo / bill.consumoTotalKwh;
      }

      return bill;
    }

    // Parse period consumption
    for (let p = 1; p <= 6; p++) {
      const kwh = parseNumber(getCell(`Consumo P${p} (kWh)`, invKey));
      const precio = parseNumber(getCell(`Precio P${p} (€/kWh)`, invKey));
      if (kwh > 0) {
        bill.consumo!.push({
          periodo: `P${p}`,
          kwh,
          precioKwh: precio,
          total: kwh * precio,
        });
      }
    }

    // Parse period power (kW + €)
    for (let p = 1; p <= 6; p++) {
      const kw = parseNumber(getCell(`Potencia P${p} (kW)`, invKey));
      const eur = parseNumber(getCell(`Potencia P${p} (€)`, invKey));
      if (kw > 0 || eur > 0) {
        bill.potencia!.push({
          periodo: `P${p}`,
          kw,
          precioKwDia: 0,
          dias: 0,
          total: eur,
        });
      }
    }

    // Add fixed taxes if found
    const impEl = parseNumber(getCell('Impuesto Eléctrico (€)', invKey));
    if (impEl > 0) bill.otrosConceptos!.push({ concepto: 'Impuesto Eléctrico', total: impEl });

    const iva = parseNumber(getCell('IVA / IGIC (€)', invKey));
    if (iva > 0) bill.otrosConceptos!.push({ concepto: 'IVA / IGIC', total: iva });

    // Add every dynamic "Otros Conceptos" row detected between separators
    for (const lbl of customOcLabels) {
      const val = parseNumber(getCell(lbl, invKey));
      if (val > 0) {
        const pureLabel = lbl.endsWith(' (€)') ? lbl.substring(0, lbl.length - 4) : lbl;
        bill.otrosConceptos!.push({ concepto: pureLabel, total: val });
      }
    }

    return bill;
  });
  
  return {
    bills,
    customOCs: {},
    warnings,
    imported: bills.length,
    skipped: 0,
    format: 'transposed',
  };
}

/**
 * Import from row-based format (each row is a bill/invoice)
 */
function importRowBasedFormat(
  rows: Record<string, any>[],
  warnings: string[]
): FlexibleImportResult {
  const headers = Object.keys(rows[0] || {});
  
  // Build field mapping
  const fieldMap: Record<string, string> = {};
  const unmappedHeaders: string[] = [];
  
  for (const header of headers) {
    const match = matchField(header);
    if (match) {
      if (fieldMap[match.field]) {
        warnings.push(`Campo duplicado detectado: "${header}" -> ${match.field}`);
      }
      fieldMap[match.field] = header;
    } else {
      // Check for period-specific headers
      const period = detectPeriod(header);
      if (!period) {
        unmappedHeaders.push(header);
      }
    }
  }
  
  if (unmappedHeaders.length > 0 && unmappedHeaders.length > headers.length / 2) {
    warnings.push(`${unmappedHeaders.length} columnas no pudieron ser mapeadas automáticamente.`);
  }
  
  const bills: ExtractedBill[] = [];
  let skipped = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      const bill: ExtractedBill = {
        id: `import_${Date.now()}_${i}`,
        fileName: `Factura_Excel_${i + 1}.pdf`,
        status: 'success',
        energyType: 'electricity',
        consumo: [],
        potencia: [],
        otrosConceptos: [],
      };
      
      // Map known fields
      if (fieldMap.cups) {
        bill.cups = String(row[fieldMap.cups] || '').trim();
      }
      
      if (fieldMap.tarifa) {
        bill.tarifa = String(row[fieldMap.tarifa] || '3.0TD');
      }
      
      if (fieldMap.empresa) {
        bill.comercializadora = String(row[fieldMap.empresa] || '');
      }
      
      if (fieldMap.titular) {
        bill.titular = String(row[fieldMap.titular] || '');
      }
      
      // Date fields
      const fechaInicioHeader = fieldMap.fechaInicio;
      const fechaFinHeader = fieldMap.fechaFin;
      
      if (fechaInicioHeader) {
        const parsed = parseFlexibleDate(row[fechaInicioHeader]);
        if (parsed.inicio) bill.fechaInicio = parsed.inicio;
        if (parsed.fin) bill.fechaFin = parsed.fin;
      }
      
      if (fechaFinHeader && !fechaInicioHeader) {
        const parsed = parseFlexibleDate(row[fechaFinHeader]);
        if (parsed.fin) bill.fechaFin = parsed.fin;
      }
      
      // Totals
      if (fieldMap.consumoTotalKwh) {
        bill.consumoTotalKwh = parseNumber(row[fieldMap.consumoTotalKwh]);
      }
      
      if (fieldMap.costeTotalConsumo) {
        bill.costeTotalConsumo = parseNumber(row[fieldMap.costeTotalConsumo]);
      }
      
      if (fieldMap.costeTotalPotencia) {
        bill.costeTotalPotencia = parseNumber(row[fieldMap.costeTotalPotencia]);
      }
      
      if (fieldMap.totalFactura) {
        bill.totalFactura = parseNumber(row[fieldMap.totalFactura]);
      }
      
      // Try to detect month from any date field
      if (!bill.fechaFin && (bill.fechaInicio || Object.values(row).some(v => detectMonth(v) !== null))) {
        const dateValue = bill.fechaInicio || Object.values(row).find(v => detectMonth(v) !== null);
        if (dateValue) {
          const month = detectMonth(dateValue);
          if (month !== null) {
            const year = new Date().getFullYear();
            bill.fechaFin = `${year}-${String(month + 1).padStart(2, '0')}-28`;
          }
        }
      }
      
      // Parse period consumption from headers
      for (const header of headers) {
        const period = detectPeriod(header);
        if (period) {
          const kwhMatch = header.match(/(kwh|kw|kwh|consumo)/i);
          if (kwhMatch) {
            const kwh = parseNumber(row[header]);
            if (kwh > 0) {
              bill.consumo!.push({
                periodo: period,
                kwh,
                precioKwh: 0,
                total: 0,
              });
            }
          }
        }
      }
      
      // Calculate totals if not present
      if (!bill.consumoTotalKwh && bill.consumo!.length > 0) {
        bill.consumoTotalKwh = bill.consumo!.reduce((sum, c) => sum + c.kwh, 0);
      }
      
      if (!bill.totalFactura && bill.costeTotalConsumo && bill.costeTotalPotencia !== undefined) {
        bill.totalFactura = (bill.costeTotalConsumo || 0) + (bill.costeTotalPotencia || 0);
      }
      
      // Validate minimum required data
      if (!bill.consumoTotalKwh && !bill.totalFactura) {
        warnings.push(`Fila ${i + 1}: Sin datos de consumo ni total - omitida`);
        skipped++;
        continue;
      }
      
      bills.push(bill);
      
    } catch (err: any) {
      warnings.push(`Fila ${i + 1}: Error - ${err.message}`);
      skipped++;
    }
  }
  
  if (bills.length === 0 && skipped === 0) {
    warnings.push('No se detectaron facturas en el formato esperado.');
  }
  
  return {
    bills,
    customOCs: {},
    warnings,
    imported: bills.length,
    skipped,
    format: 'rows',
  };
}

/**
 * Generic fallback import - tries best effort
 */
function importGenericFormat(
  rows: Record<string, any>[],
  warnings: string[]
): FlexibleImportResult {
  warnings.push('Usando importación genérica. Algunos campos pueden no detectarse correctamente.');
  
  const bills: ExtractedBill[] = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values = Object.values(row).filter(v => v !== '' && v !== null);
    
    if (values.length < 2) {
      continue;
    }
    
    // Try to find numeric values that could be consumption or totals
    const numericValues = Object.entries(row)
      .map(([k, v]) => ({ key: k, value: parseNumber(v) }))
      .filter(x => x.value > 0);
    
    const totalKwh = numericValues.find(x => 
      /kwh|consumo|energia/i.test(x.key) && x.value > 100
    )?.value || 0;
    
    const totalEur = numericValues.find(x => 
      /total|factura|importe|euro/i.test(x.key)
    )?.value || 0;
    
    if (totalKwh > 0 || totalEur > 0) {
      const bill: ExtractedBill = {
        id: `import_${Date.now()}_${i}`,
        fileName: `Factura_Excel_${i + 1}.pdf`,
        status: 'success',
        energyType: 'electricity',
        consumoTotalKwh: totalKwh,
        totalFactura: totalEur,
        costeTotalConsumo: totalEur,
        consumo: [],
        potencia: [],
        otrosConceptos: [],
      };
      
      // Try to find dates
      for (const [key, value] of Object.entries(row)) {
        if (/fecha|date/i.test(key)) {
          const parsed = parseFlexibleDate(value);
          if (parsed.fin) {
            bill.fechaFin = parsed.fin;
            bill.fechaInicio = parsed.inicio || parsed.fin;
          }
        }
      }
      
      // Try to find CUPS
      const cupsValue = Object.values(row).find(v => 
        typeof v === 'string' && /^ES[A-Z0-9]{20,}$/i.test(String(v).replace(/\s/g, ''))
      );
      if (cupsValue) {
        bill.cups = String(cupsValue).replace(/\s/g, '');
      }
      
      bills.push(bill);
    }
  }
  
  return {
    bills,
    customOCs: {},
    warnings,
    imported: bills.length,
    skipped: rows.length - bills.length,
    format: 'unknown',
  };
}

// Re-export the original function for backward compatibility
import { importBillsFromExcel as importOriginal } from './import-bills-original';

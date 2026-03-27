
/**
 * Utility to parse Spanish dates (DD/MM/YYYY) or ISO dates (YYYY-MM-DD)
 */
export const parseSpanishDate = (d?: string): Date | null => {
  if (!d) return null;
  if (d.includes('-')) {
    const ds = new Date(d);
    return isNaN(ds.getTime()) ? null : ds;
  }
  if (d.includes('/')) {
    const parts = d.split('/');
    if (parts.length < 3) return null;
    const [day, month, year] = parts.map(Number);
    const ds = new Date(year, month - 1, day);
    return isNaN(ds.getTime()) ? null : ds;
  }
  const ds = new Date(d);
  return isNaN(ds.getTime()) ? null : ds;
};

/**
 * Returns the month/year that has the most days in the given billing period.
 */
export const getAssignedMonth = (startStr?: string, endStr?: string): { month: number; year: number } => {
  const start = parseSpanishDate(startStr);
  const end = parseSpanishDate(endStr);
  
  if (!start || !end) return { month: 0, year: 0 };
  
  const counts: Record<string, number> = {};
  const current = new Date(start);
  // Important: Use a loop that counts actual days (midnight normalized)
  while (current <= end) {
    const key = `${current.getFullYear()}-${current.getMonth()}`;
    counts[key] = (counts[key] || 0) + 1;
    current.setDate(current.getDate() + 1);
  }
  
  let maxDays = 0;
  let winner = { month: start.getMonth(), year: start.getFullYear() };
  
  // Sort keys to be deterministic in case of tie (we use the first one logically if ties happen)
  Object.keys(counts).sort().forEach(key => {
    if (counts[key] > maxDays) {
      maxDays = counts[key];
      const [y, m] = key.split('-').map(Number);
      winner = { month: m, year: y };
    }
  });
  
  return winner;
};

/**
 * Comparison helper for sorting by assigned month.
 */
export const compareAssignedMonths = (aStart?: string, aEnd?: string, bStart?: string, bEnd?: string) => {
  const am = getAssignedMonth(aStart, aEnd);
  const bm = getAssignedMonth(bStart, bEnd);
  
  if (am.year !== bm.year) return am.year - bm.year;
  return am.month - bm.month;
};

/**
 * CANONICAL 12-MONTH SYSTEM
 * Always use these constants for monthly aggregation
 */
export const CANONICAL_MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
] as const;

export const CANONICAL_MONTHS_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
] as const;

export interface MonthlyAggregatedData {
  monthIndex: number;
  label: string;
  labelFull: string;
  totalFactura: number;
  energia: number;
  energiaBruta: number;
  descuentoEnergia: number;
  potencia: number;
  otros: number;
  totalKwh: number;
  billsCount: number;
}

/**
 * Aggregates bills into canonical 12-month structure.
 * Returns exactly 12 entries (one per month), with 0 for missing months.
 * 
 * @param bills - Array of ExtractedBill to aggregate
 * @param customOCs - Optional custom OCs map by bill ID
 * @returns Array of 12 MonthlyAggregatedData entries
 */
export function getMonthlyAggregatedData(
  bills: Array<{ 
    fechaInicio?: string; 
    fechaFin?: string; 
    costeTotalConsumo?: number; 
    costeBrutoConsumo?: number;
    descuentoEnergia?: number;
    costeTotalPotencia?: number;
    consumoTotalKwh?: number;
    otrosConceptos?: Array<{ concepto: string; total: number }>;
  }>,
  customOCs?: Record<string, Array<{ concepto: string; total: number }>>
): MonthlyAggregatedData[] {
  // Initialize 12 slots with zeros
  const monthlyTotals: MonthlyAggregatedData[] = CANONICAL_MONTHS.map((label, i) => ({
    monthIndex: i,
    label,
    labelFull: CANONICAL_MONTHS_FULL[i],
    totalFactura: 0,
    energia: 0,
    energiaBruta: 0,
    descuentoEnergia: 0,
    potencia: 0,
    otros: 0,
    totalKwh: 0,
    billsCount: 0
  }));

  // Aggregate each bill to its canonical month
  bills.forEach(bill => {
    const { month, year } = getAssignedMonth(bill.fechaInicio, bill.fechaFin);
    const monthIdx = month; // 0-11
    
    if (monthIdx < 0 || monthIdx > 11) return; // Skip invalid months

    const energia = bill.costeTotalConsumo || 0;
    const energiaBruta = bill.costeBrutoConsumo || bill.costeTotalConsumo || 0;
    const descuentoEnergia = bill.descuentoEnergia || 0;
    const potencia = bill.costeTotalPotencia || 0;
    const totalKwh = bill.consumoTotalKwh || 0;
    
    let imp = 0, others = 0;
    [...(bill.otrosConceptos || [])].forEach(oc => {
      if (oc.concepto?.toLowerCase().includes('impuesto') || oc.concepto?.toLowerCase().includes('iva')) {
        imp += oc.total;
      } else {
        others += oc.total;
      }
    });

    const totalF = energia + potencia + imp + others;

    // Accumulate into canonical month slot
    monthlyTotals[monthIdx].totalFactura += totalF;
    monthlyTotals[monthIdx].energia += energia;
    monthlyTotals[monthIdx].energiaBruta += energiaBruta;
    monthlyTotals[monthIdx].descuentoEnergia += descuentoEnergia;
    monthlyTotals[monthIdx].potencia += potencia;
    monthlyTotals[monthIdx].otros += (imp + others);
    monthlyTotals[monthIdx].totalKwh += totalKwh;
    monthlyTotals[monthIdx].billsCount += 1;
  });

  return monthlyTotals;
}

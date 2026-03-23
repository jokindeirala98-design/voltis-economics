
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

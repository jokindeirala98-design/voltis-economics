/**
 * Shared Concept Utilities
 * 
 * These utilities are used by both FileTable (UI) and export (Excel)
 * to ensure consistent concept grouping and display.
 */

import { CanonicalGroup, CANONICAL_GROUPS } from './concept-normalizer';

export { CANONICAL_GROUPS, type CanonicalGroup } from './concept-normalizer';

/**
 * Hardcoded canonical names for critical concept groups
 */
const CANONICAL_LABELS: Record<string, string> = {
  'EXCESO DE POTENCIA': 'Exceso de Potencia',
  'BONO SOCIAL': 'Bono Social',
  'ALQUILER DE EQUIPOS': 'Alquiler de Equipos',
  'PEAJES Y TRANSPORTES': 'Peajes y Cargos',
  'COMPENSACIÓN EXCEDENTES': 'Compensación Excedentes',
  'IMPUESTO ELÉCTRICO': 'Impuesto Eléctrico',
  'IVA / IGIC': 'IVA / IGIC',
  'IVA': 'IVA',
  'DESCUENTO': 'Descuento',
  'AJUSTES': 'Ajustes',
  'OTROS': 'Otros'
};

/**
 * Priority order for canonical name selection
 */
const PRIORITY_CANONICAL_NAMES = [
  'EXCESO DE POTENCIA',
  'BONO SOCIAL',
  'ALQUILER DE EQUIPOS',
  'PEAJES Y TRANSPORTES',
  'COMPENSACIÓN EXCEDENTES',
  'IMPUESTO ELÉCTRICO',
  'IVA / IGIC',
  'IVA',
  'DESCUENTO',
  'AJUSTES'
];

/**
 * Normalizes a concept name to its canonical form
 * Used for grouping similar concepts across bills
 */
export function getCanonicalName(name: string): string {
  if (!name) return "";
  
  const n = name.toUpperCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[().,/-]/g, " ") // Remove punctuation
    .replace(/\s+/g, " ") // Single spaces
    .replace(/\b(DE|DEL|LA|EL|EN|UN|UNA|POR|AL)\b/g, "") // Remove stop words
    .trim();
  
  // Hardcoded overrides (Mission Critical)
  if (n.includes('EXCESO') && n.includes('POTENCIA')) return 'EXCESO DE POTENCIA';
  if (n.includes('BONO SOCIAL')) return 'BONO SOCIAL';
  if (n.includes('ALQUILER') || n.includes('EQUIPO')) return 'ALQUILER DE EQUIPOS';
  if (n.includes('PEAJE') || n.includes('TRANSPORTE')) return 'PEAJES Y TRANSPORTES';
  if (n.includes('EXCEDENTE')) return 'COMPENSACIÓN EXCEDENTES';
  if (n.includes('IMPUESTO') && n.includes('ELECTRICO')) return 'IMPUESTO ELÉCTRICO';
  if (n.includes('IVA') || n.includes('IGIC')) return 'IVA';
  if (n.includes('DESCUENTO') || n.includes('PROMOCION')) return 'DESCUENTO';
  if (n.includes('AJUSTE') || n.includes('REGULARIZ')) return 'AJUSTES';
  
  return n;
}

/**
 * Gets the display label for a canonical name
 */
export function getCanonicalLabel(canonical: string): string {
  return CANONICAL_LABELS[canonical] || CANONICAL_LABELS[canonical.toUpperCase()] || canonical;
}

/**
 * Groups concept names by their canonical form and returns:
 * - The canonical name (for grouping)
 * - The best display name (prioritizing known canonical names)
 * - The sum of all values for this group
 */
export interface GroupedConcept {
  canonicalName: string;
  displayName: string;
  allOriginalNames: string[];
  totalValue: number;
}

export function groupConceptsByCanonical(
  concepts: Array<{ concepto: string; total: number }>,
  customOCs: Array<{ concepto: string; total: number }> = []
): GroupedConcept[] {
  const groupMap = new Map<string, { originals: Set<string>; total: number }>();
  
  const allConcepts = [...concepts, ...customOCs];
  
  for (const oc of allConcepts) {
    const canonical = getCanonicalName(oc.concepto);
    if (!canonical) continue;
    
    if (!groupMap.has(canonical)) {
      groupMap.set(canonical, { originals: new Set(), total: 0 });
    }
    const group = groupMap.get(canonical)!;
    group.originals.add(oc.concepto);
    group.total += oc.total;
  }
  
  return Array.from(groupMap.entries()).map(([canonical, data]) => {
    // Select the best display name
    const originalNames = Array.from(data.originals);
    const displayName = selectBestDisplayName(originalNames);
    
    return {
      canonicalName: canonical,
      displayName,
      allOriginalNames: originalNames,
      totalValue: data.total
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Selects the best display name from a list of original names
 * Prioritizes known canonical names, then shortest, then most common
 */
function selectBestDisplayName(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  
  // First priority: exact match with known canonical names
  const priorityMatch = names.find(n => {
    const canonical = getCanonicalName(n);
    return PRIORITY_CANONICAL_NAMES.includes(canonical);
  });
  if (priorityMatch) return priorityMatch;
  
  // Second priority: shortest name (usually the cleanest)
  return names.sort((a, b) => a.length - b.length)[0];
}

/**
 * Gets all grouped concepts across multiple bills
 * Returns a sorted list of unique canonical groups
 */
export function getOrderedConcepts(
  bills: Array<{ id: string; otrosConceptos?: Array<{ concepto: string; total: number }> }>,
  customOCsMap: Record<string, Array<{ concepto: string; total: number }>>
): GroupedConcept[] {
  const allGroups = new Map<string, { originals: Set<string>; total: number }>();
  
  for (const bill of bills) {
    const customOC = customOCsMap[bill.id] || [];
    const concepts = bill.otrosConceptos || [];
    const grouped = groupConceptsByCanonical(concepts, customOC);
    
    for (const group of grouped) {
      if (!allGroups.has(group.canonicalName)) {
        allGroups.set(group.canonicalName, { originals: new Set(), total: 0 });
      }
      const existing = allGroups.get(group.canonicalName)!;
      group.allOriginalNames.forEach(n => existing.originals.add(n));
      existing.total += group.totalValue;
    }
  }
  
  const groups = Array.from(allGroups.entries()).map(([canonical, data]) => ({
    canonicalName: canonical,
    displayName: selectBestDisplayName(Array.from(data.originals)),
    allOriginalNames: Array.from(data.originals),
    totalValue: data.total
  }));
  
  // Apply mandatory ordering: IVA last, Impuesto eléctrico second to last
  return applyMandatoryConceptOrdering(groups);
}

/**
 * Gets the total value for a specific canonical group across all bills
 */
export function getCanonicalGroupTotal(
  bills: Array<{ id: string; otrosConceptos?: Array<{ concepto: string; total: number }> }>,
  customOCsMap: Record<string, Array<{ concepto: string; total: number }>>,
  canonicalName: string
): number {
  let total = 0;
  
  for (const bill of bills) {
    const customOC = customOCsMap[bill.id] || [];
    const concepts = bill.otrosConceptos || [];
    
    for (const oc of [...concepts, ...customOC]) {
      if (getCanonicalName(oc.concepto) === canonicalName) {
        total += oc.total;
      }
    }
  }
  
  return total;
}

/**
 * Gets the value for a specific canonical group for a single bill
 */
export function getBillCanonicalTotal(
  bill: { otrosConceptos?: Array<{ concepto: string; total: number }> },
  customOCs: Array<{ concepto: string; total: number }>,
  canonicalName: string
): number {
  let total = 0;
  
  const allConcepts = [...(bill.otrosConceptos || []), ...customOCs];
  for (const oc of allConcepts) {
    if (getCanonicalName(oc.concepto) === canonicalName) {
      total += oc.total;
    }
  }
  
  return total;
}

/**
 * CRITICAL CONCEPT ORDERING RULE (HARD-CODED SYSTEM REQUIREMENT)
 * 
 * MANDATORY ORDER:
 * 1. All other concepts (sorted alphabetically)
 * 2. Impuesto eléctrico (second to last)
 * 3. IVA (last)
 * 
 * This applies REGARDLESS of:
 * - Number of concepts
 * - Grouping variations
 * - Normalization results
 * - Manual edits
 * - Imported corrections
 * 
 * Detection handles variations:
 * - "Impuesto eléctrico", "Impuesto electricidad", "Imp. eléctrico", "Electricity tax"
 * - "IVA", "IVA 21%", "VAT"
 */

const IVA_CANONICAL = 'IVA';
const IMPUESTO_ELECTRICO_CANONICAL = 'IMPUESTO ELÉCTRICO';

/**
 * Checks if a concept name/canonical is an IVA variant
 */
export function isIVAConcept(canonicalName: string): boolean {
  const clean = canonicalName.toUpperCase().replace(/[\s%0-9]/g, '');
  return clean === 'IVA' || clean === 'VAT';
}

/**
 * Checks if a concept name/canonical is an Impuesto eléctrico variant
 */
export function isImpuestoElectricoConcept(canonicalName: string): boolean {
  const clean = canonicalName.toUpperCase().replace(/[\s.,]/g, '');
  return clean.includes('IMPUESTO') && clean.includes('ELECTRIC');
}

/**
 * Applies the mandatory concept ordering:
 * - All other concepts first (sorted alphabetically)
 * - Impuesto eléctrico second to last
 * - IVA last
 * 
 * This function should be used AFTER grouping and normalization
 * to ensure consistent ordering across all tables (UI, Excel, PDF).
 */
export function applyMandatoryConceptOrdering(groups: GroupedConcept[]): GroupedConcept[] {
  if (groups.length === 0) return groups;
  
  const ivaGroup = groups.find(g => isIVAConcept(g.canonicalName));
  const impuestoGroup = groups.find(g => isImpuestoElectricoConcept(g.canonicalName));
  
  // Separate special groups from regular groups
  const regularGroups = groups.filter(g => 
    !isIVAConcept(g.canonicalName) && !isImpuestoElectricoConcept(g.canonicalName)
  );
  
  // Sort regular groups alphabetically by display name
  regularGroups.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  
  // Build final ordered list
  const ordered: GroupedConcept[] = [...regularGroups];
  
  // Add Impuesto eléctrico second to last (if exists)
  if (impuestoGroup) {
    ordered.push(impuestoGroup);
  }
  
  // Add IVA last (if exists)
  if (ivaGroup) {
    ordered.push(ivaGroup);
  }
  
  return ordered;
}

/**
 * Reorders an existing array of concepts using the mandatory ordering rule.
 * Use this when you have a sorted array and need to enforce the rule.
 */
export function reorderWithMandatoryOrder(groups: GroupedConcept[]): GroupedConcept[] {
  return applyMandatoryConceptOrdering(groups);
}

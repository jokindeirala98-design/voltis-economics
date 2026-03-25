/**
 * Sistema de Normalización Inteligente de Conceptos
 * 
 * Arquitectura:
 * 1. Grupos canónicos predefinidos (sistema)
 * 2. Diccionario aprendido dinámicamente (usuario/comercializadora)
 * 3. Algoritmo de similitud para conceptos nuevos
 */

import { supabase } from './supabase';

export const CANONICAL_GROUPS = {
  ENERGIA: 'ENERGIA',
  POTENCIA: 'POTENCIA',
  EXCESOS_POTENCIA: 'EXCESOS_POTENCIA',
  REACTIVA: 'REACTIVA',
  ALQUILER_EQUIPO: 'ALQUILER_EQUIPO',
  PEAJES_CARGOS: 'PEAJES_CARGOS',
  IMPUESTO_ELECTRICO: 'IMPUESTO_ELECTRICO',
  IVA: 'IVA',
  DESCUENTO: 'DESCUENTO',
  BONO_SOCIAL: 'BONO_SOCIAL',
  COMPENSACION: 'COMPENSACION',
  AJUSTES: 'AJUSTES',
  OTROS: 'OTROS'
} as const;

export type CanonicalGroup = typeof CANONICAL_GROUPS[keyof typeof CANONICAL_GROUPS];

export interface ConceptNormalization {
  id: string;
  original_text: string;
  normalized_text: string;
  canonical_group: CanonicalGroup;
  confidence: number;
  source_scope: 'global' | 'commercial' | 'project';
  is_system: boolean;
}

interface NormalizationResult {
  canonicalGroup: CanonicalGroup;
  normalizedText: string;
  confidence: number;
  isNew: boolean;
}

/**
 * Limpia texto para comparación
 */
function cleanText(text: string): string {
  if (!text) return '';
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[().,/-]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Single spaces
    .replace(/\b(DE|DEL|LA|EL|EN|UN|UNA|POR|AL|KW|KWH|EUR|€)\b/g, '') // Remove stop words
    .trim();
}

/**
 * Calcula similitud entre dos textos (Jaccard + Levenshtein simplificado)
 */
function calculateSimilarity(text1: string, text2: string): number {
  const clean1 = cleanText(text1);
  const clean2 = cleanText(text2);
  
  if (clean1 === clean2) return 1.0;
  if (clean1.includes(clean2) || clean2.includes(clean1)) return 0.85;
  
  // Jaccard similarity
  const words1 = new Set(clean1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(clean2.split(' ').filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;
  
  // Boost if share strong keywords
  const strongKeywords = ['EXCESO', 'POTENCIA', 'BONO', 'ALQUILER', 'PEAJE', 'IVA', 'IMPUESTO', 'COMPENSACION'];
  let keywordBoost = 0;
  strongKeywords.forEach(kw => {
    if (clean1.includes(kw) && clean2.includes(kw)) keywordBoost += 0.1;
  });
  
  return Math.min(1.0, jaccard + keywordBoost);
}

/**
 * Reglas del sistema (alta prioridad, no se sobreescriben)
 */
const SYSTEM_RULES: Array<{ pattern: RegExp; group: CanonicalGroup }> = [
  { pattern: /EXCES[OÓ]\s*(DE\s*)?POTENCIA|POTENCIA\s*(EXCESO|PENAL)/i, group: CANONICAL_GROUPS.EXCESOS_POTENCIA },
  { pattern: /BONO\s*SOCIAL|BONIFICACION/i, group: CANONICAL_GROUPS.BONO_SOCIAL },
  { pattern: /ALQUILER\s*(EQUIPO|CONTADOR|MEDIDA)/i, group: CANONICAL_GROUPS.ALQUILER_EQUIPO },
  { pattern: /PEAJE|CARGO\s*(TRANSPORTE|DISTRIBUCION)/i, group: CANONICAL_GROUPS.PEAJES_CARGOS },
  { pattern: /EXCEDENTE|COMPENSACION\s*(ENERGIA|EXCEDENTE)/i, group: CANONICAL_GROUPS.COMPENSACION },
  { pattern: /IMPUESTO\s*(ELECTRICIDAD|ELECTRICO)/i, group: CANONICAL_GROUPS.IMPUESTO_ELECTRICO },
  { pattern: /\bIVA\b|IGIC|IMPUESTO\s*GENERAL/i, group: CANONICAL_GROUPS.IVA },
  { pattern: /DESCUENTO|PROMOCION|REBAJA/i, group: CANONICAL_GROUPS.DESCUENTO },
  { pattern: /REACTIVA/i, group: CANONICAL_GROUPS.REACTIVA },
  { pattern: /AJUSTE|REGULARIZAC|RECTIFICAC/i, group: CANONICAL_GROUPS.AJUSTES },
];

/**
 * Normaliza un concepto usando reglas del sistema + diccionario aprendido
 */
export async function normalizeConcept(
  originalText: string,
  userId?: string,
  commercialId?: string
): Promise<NormalizationResult> {
  if (!originalText) {
    return { canonicalGroup: CANONICAL_GROUPS.OTROS, normalizedText: '', confidence: 0, isNew: true };
  }

  const cleanOriginal = cleanText(originalText);
  
  // 1. Aplicar reglas del sistema primero (máxima prioridad)
  for (const rule of SYSTEM_RULES) {
    if (rule.pattern.test(originalText)) {
      return {
        canonicalGroup: rule.group,
        normalizedText: formatNormalizedText(originalText, rule.group),
        confidence: 1.0,
        isNew: false
      };
    }
  }

  // 2. Buscar en diccionario aprendido (usuario > comercializadora > global)
  const scopes: Array<'global' | 'commercial' | 'project'> = ['global'];
  if (commercialId) scopes.unshift('commercial' as any);
  if (userId) scopes.unshift('project' as any);

  for (const scope of scopes) {
    try {
      const { data: dict } = await supabase
        .from('concept_normalizations')
        .select('*')
        .eq('original_text', originalText)
        .eq('source_scope', scope)
        .maybeSingle();

      if (dict) {
        return {
          canonicalGroup: dict.canonical_group as CanonicalGroup,
          normalizedText: dict.normalized_text,
          confidence: dict.confidence,
          isNew: false
        };
      }
    } catch (e) {
      console.warn('Error querying normalization dict:', e);
    }
  }

  // 3. Buscar por similitud en diccionario global
  try {
    const { data: allRules } = await supabase
      .from('concept_normalizations')
      .select('*')
      .eq('source_scope', 'global')
      .eq('is_system', true);

    if (allRules) {
      let bestMatch: { group: CanonicalGroup; text: string; similarity: number } | null = null;
      
      for (const rule of allRules) {
        const similarity = calculateSimilarity(originalText, rule.original_text);
        if (similarity > 0.7 && (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = {
            group: rule.canonical_group as CanonicalGroup,
            text: rule.normalized_text,
            similarity
          };
        }
      }

      if (bestMatch) {
        return {
          canonicalGroup: bestMatch.group,
          normalizedText: bestMatch.text,
          confidence: bestMatch.similarity,
          isNew: true // Sugerido, no confirmado
        };
      }
    }
  } catch (e) {
    console.warn('Error in fuzzy matching:', e);
  }

  // 4. Clasificación por defecto basada en keywords conocidas
  const defaultGroup = classifyByKeywords(originalText);
  
  return {
    canonicalGroup: defaultGroup,
    normalizedText: formatNormalizedText(originalText, defaultGroup),
    confidence: 0.5,
    isNew: true
  };
}

/**
 * Clasificación por keywords cuando no hay match
 */
function classifyByKeywords(text: string): CanonicalGroup {
  const clean = cleanText(text);
  
  if (/POTENCIA|KW/.test(clean) && !/EXCES|PENAL/.test(clean)) {
    return CANONICAL_GROUPS.POTENCIA;
  }
  
  if (/ENERGIA|KWH|KW/.test(clean)) {
    return CANONICAL_GROUPS.ENERGIA;
  }
  
  return CANONICAL_GROUPS.OTROS;
}

/**
 * Formatea el texto normalizado según el grupo
 */
function formatNormalizedText(original: string, group: CanonicalGroup): string {
  const labels: Record<CanonicalGroup, string> = {
    [CANONICAL_GROUPS.ENERGIA]: 'Energía',
    [CANONICAL_GROUPS.POTENCIA]: 'Potencia Contratada',
    [CANONICAL_GROUPS.EXCESOS_POTENCIA]: 'Exceso de Potencia',
    [CANONICAL_GROUPS.REACTIVA]: 'Energía Reactiva',
    [CANONICAL_GROUPS.ALQUILER_EQUIPO]: 'Alquiler de Equipos',
    [CANONICAL_GROUPS.PEAJES_CARGOS]: 'Peajes y Cargos',
    [CANONICAL_GROUPS.IMPUESTO_ELECTRICO]: 'Impuesto Eléctrico',
    [CANONICAL_GROUPS.IVA]: 'IVA',
    [CANONICAL_GROUPS.DESCUENTO]: 'Descuento',
    [CANONICAL_GROUPS.BONO_SOCIAL]: 'Bono Social',
    [CANONICAL_GROUPS.COMPENSACION]: 'Compensación Excedentes',
    [CANONICAL_GROUPS.AJUSTES]: 'Ajuste',
    [CANONICAL_GROUPS.OTROS]: 'Otros'
  };
  
  return labels[group] || original;
}

/**
 * Aprende un nuevo mapeo del usuario
 */
export async function learnNormalization(
  originalText: string,
  canonicalGroup: CanonicalGroup,
  userId?: string
): Promise<void> {
  const normalizedText = formatNormalizedText(originalText, canonicalGroup);
  
  try {
    await supabase.from('concept_normalizations').upsert({
      original_text: originalText,
      normalized_text: normalizedText,
      canonical_group: canonicalGroup,
      confidence: 1.0,
      source_scope: userId ? 'project' : 'global',
      created_by: userId || null,
      is_system: false
    }, {
      onConflict: 'original_text,canonical_group'
    });
  } catch (e) {
    console.error('Error learning normalization:', e);
  }
}

/**
 * Normaliza todos los conceptos de un conjunto de facturas (análisis de proyecto)
 */
export async function analyzeProjectConcepts(
  concepts: Array<{ concepto: string; total: number }>
): Promise<Map<string, NormalizationResult>> {
  const results = new Map<string, NormalizationResult>();
  
  // Group by normalized form to detect patterns
  const grouped = new Map<string, { texts: string[]; total: number }>();
  
  for (const concept of concepts) {
    const result = await normalizeConcept(concept.concepto);
    results.set(concept.concepto, result);
    
    const key = result.canonicalGroup;
    if (!grouped.has(key)) {
      grouped.set(key, { texts: [], total: 0 });
    }
    grouped.get(key)!.texts.push(concept.concepto);
    grouped.get(key)!.total += concept.total;
  }
  
  // Detect high-frequency patterns (potential new rules)
  for (const [group, data] of grouped) {
    if (data.texts.length > 2) {
      // Multiple different texts mapped to same group - suggest learning
      console.log(`[Normalization] Group ${group} has ${data.texts.length} variants:`, data.texts);
    }
  }
  
  return results;
}

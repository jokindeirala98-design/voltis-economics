/**
 * Smart label abbreviation utilities for mobile tables
 * Preserves meaning and distinctiveness while reducing length
 */

interface AbbreviationRule {
  pattern: RegExp;
  replacement: string;
}

const ABBREVIATIONS: AbbreviationRule[] = [
  { pattern: /\bTOTAL\b/gi, replacement: 'TOT' },
  { pattern: /\bCONSUMO\b/gi, replacement: 'CONS' },
  { pattern: /\bPOTENCIA\b/gi, replacement: 'POT' },
  { pattern: /\bCOSTE\b/gi, replacement: 'COST' },
  { pattern: /\bPRECIO\b/gi, replacement: 'PREC' },
  { pattern: /\bFECHA\b/gi, replacement: 'FECH' },
  { pattern: /\bINICIO\b/gi, replacement: 'INI' },
  { pattern: /\bTOTALES?\b/gi, replacement: 'TOT' },
  { pattern: /\bMEDIO\b/gi, replacement: 'MED' },
  { pattern: /\bEXTRAÍDO\b/gi, replacement: 'EXT' },
  { pattern: /\bEXTRA\b/gi, replacement: 'EXT' },
  { pattern: /\bTITULAR\b/gi, replacement: 'TIT' },
  { pattern: /\bCOMPAÑÍA\b/gi, replacement: 'CIA' },
  { pattern: /\bTARIFA\b/gi, replacement: 'TAR' },
  { pattern: /\bIMPUESTO\b/gi, replacement: 'IMP' },
  { pattern: /\bALQUILER\b/gi, replacement: 'ALQ' },
  { pattern: /\bHIERARCH\b/gi, replacement: 'HIER' },
  { pattern: /\bAJUSTE\b/gi, replacement: 'AJ' },
  { pattern: /\bAJUSTES\b/gi, replacement: 'AJ' },
  { pattern: /\bDESCUENTO\b/gi, replacement: 'DESC' },
  { pattern: /\bCOMPENSACI[OÓ]N\b/gi, replacement: 'COMP' },
  { pattern: /\bEXCEDENTE\b/gi, replacement: 'EXC' },
  { pattern: /\bEXCESOS\b/gi, replacement: 'EXC' },
  { pattern: /\bEXCESO\b/gi, replacement: 'EXC' },
  { pattern: /\bENERGÍA\b/gi, replacement: 'ENRG' },
  { pattern: /\bPEAJE\b/gi, replacement: 'PEAJ' },
  { pattern: /\bCARGO\b/gi, replacement: 'CGO' },
  { pattern: /\bCARGOS\b/gi, replacement: 'CGO' },
  { pattern: /\bEQUIPO\b/gi, replacement: 'EQ' },
  { pattern: /\bBONO\b/gi, replacement: 'BON' },
  { pattern: /\bSOCIAL\b/gi, replacement: 'SOC' },
  { pattern: /\bIVA\b/gi, replacement: 'IVA' },
  { pattern: /\bIVA\b/gi, replacement: 'IVA' },
  { pattern: /\bELECTRICO\b/gi, replacement: 'ELECT' },
  { pattern: /\bELÉCTRICO\b/gi, replacement: 'ELECT' },
  { pattern: /\bVOLUMEN\b/gi, replacement: 'VOL' },
  { pattern: /\bTERMINO\b/gi, replacement: 'TERM' },
  { pattern: /\bTÉRMINO\b/gi, replacement: 'TERM' },
  { pattern: /\bFIJO\b/gi, replacement: 'FIJ' },
];

const UNIT_PATTERNS: RegExp[] = [
  /kWh$/,
  /kWh\b/,
  /[€$]\/kWh$/,
  /[€$]\/kWh\b/,
  /[€$]\/kWh/,
  /\(kWh\)$/,
  /\(kWh\)/,
  /[€$]/,
  /\(€\)$/,
  /\(€\)/,
];

function applyAbbreviations(label: string): string {
  let result = label;
  
  for (const rule of ABBREVIATIONS) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  
  return result;
}

function extractUnits(label: string): { withoutUnits: string; units: string } {
  let withoutUnits = label;
  let units = '';
  
  for (const pattern of UNIT_PATTERNS) {
    const match = label.match(pattern);
    if (match) {
      units = match[0] + units;
      withoutUnits = withoutUnits.replace(match[0], '');
    }
  }
  
  return { withoutUnits: withoutUnits.trim(), units: units.trim() };
}

function compressSpaces(label: string): string {
  return label.replace(/\s+/g, ' ').trim();
}

export function abbreviateLabel(label: string, maxLength: number = 14): string {
  if (label.length <= maxLength) {
    return label;
  }
  
  let result = applyAbbreviations(label);
  result = compressSpaces(result);
  
  if (result.length <= maxLength) {
    return result;
  }
  
  const { withoutUnits, units } = extractUnits(result);
  
  const availableForContent = maxLength - units.length - 1;
  
  if (availableForContent <= 4) {
    return units ? `${withoutUnits.substring(0, availableForContent)}… ${units}` : withoutUnits.substring(0, maxLength);
  }
  
  const firstPart = Math.ceil(availableForContent * 0.55);
  const lastPart = Math.floor(availableForContent * 0.35);
  
  const compressed = withoutUnits.replace(/[aeiouáéíóúàèìòùäëïöü]/gi, '').replace(/\s+/g, '');
  
  let abbreviated: string;
  if (compressed.length > availableForContent) {
    abbreviated = withoutUnits.substring(0, firstPart) + '…' + withoutUnits.slice(-lastPart);
  } else {
    abbreviated = withoutUnits;
  }
  
  return units ? `${abbreviated} ${units}` : abbreviated;
}

export function getLabelKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const LABEL_SPECIAL_CASES: Record<string, string> = {
  'compañía': 'CIA',
  'titular': 'TIT',
  'tarifa': 'TAR',
  'fecha inicio': 'FECH INI',
  'fecha fin': 'FECH FIN',
  'total consumo (kwh)': 'TOT CONS kWh',
  'total coste consumo (€)': 'TOT COST €',
  'total coste potencia (€)': 'TOT POT €',
  'coste medio (€/kwh)': 'COST MED €/kWh',
  'total factura (€)': 'TOTAL FACT €',
  'consumo kwh': 'CONS kWh',
  'volumen (m³)': 'VOL m³',
  'precio €/kwh': 'PREC €/kWh',
  'término fijo': 'TERM FIJ',
  'impuesto hidrocarb.': 'IMP HIDRO',
  'alquiler contador': 'ALQ CONT',
  'iva': 'IVA',
  'mes liquidación': 'MES LIQ',
  'exceso de potencia': 'EXC POT',
  'bono social': 'BON SOC',
  'alquiler de equipos': 'ALQ EQ',
  'peajes y cargos': 'PEAJ CGO',
  'compensación excedentes': 'COMP EXC',
  'impuesto eléctrico': 'IMP ELECT',
  'ajustes': 'AJUSTES',
  'otros': 'OTROS',
};

export function getMobileLabel(label: string): string {
  const key = getLabelKey(label);
  
  if (LABEL_SPECIAL_CASES[key]) {
    return LABEL_SPECIAL_CASES[key];
  }
  
  return abbreviateLabel(label, 14);
}

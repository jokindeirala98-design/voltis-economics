import { EnergyType } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY || '';

// Basic validation to avoid cryptic 403/400 errors
if (!API_KEY) {
  console.error('[Classifier] CRITICAL: No GEMINI_API_KEY found in environment variables.');
} else if (!API_KEY.startsWith('AIza')) {
  console.warn('[Classifier] WARNING: GEMINI_API_KEY does not appear to follow the standard format (starts with AIza).');
}

export interface ClassificationResult {
  energyType: EnergyType;
  confidence: number;
  reason: string;
  warnings?: string[];
  source?: 'text' | 'vision';
}

export interface WeakTextIndicator {
  textLength: number;
  gasScore: number;
  electricityScore: number;
  totalMatchedMarkers: number;
}

const GAS_MARKERS = [
  'periodo gas',
  'tarifa de acceso: rl.',
  'consumo gas',
  'impuesto hidrocarburos',
  'factor conversion',
  'factor de conversion',
  'factor de conversión',
  'termino fijo',
  'término fijo',
  'gas natural',
  'rl.1',
  'rl.2',
  'rl.3',
  'rl.4',
];

const ELECTRICITY_MARKERS = [
  'luz',
  'electricidad',
  'impuesto eléctrico',
  'impuesto de electricidad',
  'termino de potencia',
  'término de potencia',
  'termino de energia',
  'termino de energía',
  'termino energia',
  'término energia',
  'peaje',
  'peaje de acceso',
  'acceso red',
  'acceso a red',
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
  'p6',
  'potencia contratada',
  'potencia maxima',
  'energia activa',
  'energia reactiva',
  'energia consumida',
];

export function classifyInvoice(
  pdfText: string,
  fileName?: string
): ClassificationResult {
  const lower = pdfText.toLowerCase();
  
  let gasScore = 0;
  let electricityScore = 0;
  
  const gasFound: string[] = [];
  const electricityFound: string[] = [];
  
  for (const marker of GAS_MARKERS) {
    if (lower.includes(marker)) {
      gasScore += 1;
      gasFound.push(marker);
    }
  }
  
  for (const marker of ELECTRICITY_MARKERS) {
    if (lower.includes(marker)) {
      electricityScore += 1;
      electricityFound.push(marker);
    }
  }
  
  if (/rl\.[1-4]/i.test(pdfText)) {
    gasScore += 3;
    gasFound.push('RL.x tariff detected');
  }
  
  if (/\bp[1-6]\b/i.test(pdfText)) {
    electricityScore += 3;
    electricityFound.push('P1-P6 periods detected');
  }
  
  if (fileName) {
    const fn = fileName.toLowerCase();
    if (fn.includes('gas')) {
      gasScore += 0.5;
      gasFound.push('filename: gas');
    }
    if (fn.includes('luz') || fn.includes('electricidad') || fn.includes('electric')) {
      electricityScore += 0.5;
      electricityFound.push('filename: electricity');
    }
  }
  
  console.log(`[CLASSIFIER][TEXT] gasScore=${gasScore}, elecScore=${electricityScore}, gasFound=[${gasFound.join(', ')}], elecFound=[${electricityFound.join(', ')}]`);
  
  if (gasScore > electricityScore) {
    const confidence = Math.min(0.95, gasScore / (gasScore + electricityScore + 1));
    return {
      energyType: 'gas',
      confidence,
      reason: `Gas markers found: ${gasFound.join(', ') || 'none'}`,
      warnings: electricityScore > 0 ? [`Electricity markers found: ${electricityFound.join(', ')}`] : undefined,
      source: 'text',
    };
  } else if (electricityScore > gasScore) {
    const confidence = Math.min(0.95, electricityScore / (gasScore + electricityScore + 1));
    return {
      energyType: 'electricity',
      confidence,
      reason: `Electricity markers found: ${electricityFound.join(', ') || 'none'}`,
      warnings: gasScore > 0 ? [`Gas markers found: ${gasFound.join(', ')}`] : undefined,
      source: 'text',
    };
  } else {
    return {
      energyType: 'electricity',
      confidence: 0.5,
      reason: 'Classification ambiguous',
      warnings: [
        'No clear energy type markers found',
        'Gas markers found: ' + (gasFound.join(', ') || 'none'),
        'Electricity markers found: ' + (electricityFound.join(', ') || 'none'),
      ],
      source: 'text',
    };
  }
}

export function isWeakTextForClassification(pdfText: string): WeakTextIndicator {
  const lower = pdfText.toLowerCase();
  let gasScore = 0;
  let electricityScore = 0;
  
  for (const marker of GAS_MARKERS) { if (lower.includes(marker)) gasScore++; }
  for (const marker of ELECTRICITY_MARKERS) { if (lower.includes(marker)) electricityScore++; }
  if (/rl\.[1-4]/i.test(pdfText)) gasScore += 3;
  if (/\bp[1-6]\b/i.test(pdfText)) electricityScore += 3;
  
  return {
    textLength: pdfText.trim().length,
    gasScore,
    electricityScore,
    totalMatchedMarkers: gasScore + electricityScore,
  };
}

export function shouldUseVisionFallback(indicator: WeakTextIndicator): boolean {
  if (indicator.textLength < 200) return true;
  if (indicator.gasScore === 0 && indicator.electricityScore === 0) return true;
  if (indicator.totalMatchedMarkers <= 1) return true;
  return false;
}

const genAI = new GoogleGenerativeAI(API_KEY);

const VISION_CLASSIFICATION_PROMPT = `You are an expert at classifying Spanish energy invoices. Look at this invoice and determine whether it is ELECTRICITY or GAS.

ELECTRICITY indicators:
- The word "luz" or "electricidad"
- P1, P2, P3, P4, P5, P6 period labels
- "Impuesto Electricidad" or "Impuesto Eléctrico"
- "Potencia" references
- "Peaje" references
- "Término de potencia" or "término de energía"
- Energy tariff names (2.0TD, 3.0TD, etc.)
- Bono social references

GAS indicators:
- "Gas" or "gas natural"
- "RL.1", "RL.2", "RL.3", "RL.4" tariff labels
- "Impuesto Hidrocarburos"
- "Factor de conversión"
- "Consumo gas"
- "Término fijo"

Look carefully at ALL pages of the invoice. Count the evidence you find.

Respond with ONLY this JSON (no markdown, no explanation):
{"energyType": "electricity" | "gas", "confidence": 0.0-1.0, "reason": "brief explanation of what you found"}`;

export async function classifyInvoiceWithVision(
  fileBuffer: Buffer,
  fileType: string
): Promise<ClassificationResult> {
  const fileName = 'invoice-vision'; // Placeholder or passed from caller if possible
  const keySuffix = API_KEY ? `...${API_KEY.slice(-4)}` : 'missing';
  console.log(`[GEMINI_REQUEST][VISION] Model: gemini-flash-latest, Key: ${keySuffix}`);

  try {
    const model = genAI.getGenerativeModel(
      { model: 'gemini-flash-latest' },
      { apiVersion: 'v1beta' }
    );

    const prompt = VISION_CLASSIFICATION_PROMPT;
    const base64Data = fileBuffer.toString('base64');
    const mimeType = fileType;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      }
    ]);
    
    const response = await result.response;
    const text = response.text().trim().toUpperCase();
    console.log(`[GEMINI_RESPONSE][VISION] Full Response: "${text}"`);

    if (text.includes('ELECTRICITY') || text.includes('ELECTRICIDAD')) {
      return { 
        energyType: 'electricity', 
        confidence: 0.95, 
        reason: '[Vision] detected electricity markers',
        source: 'vision' 
      };
    }
    if (text.includes('GAS')) {
      return { 
        energyType: 'gas', 
        confidence: 0.95, 
        reason: '[Vision] detected gas markers',
        source: 'vision' 
      };
    }
    
    console.warn(`[GEMINI_RESPONSE][VISION] Ambiguous response: ${text}`);
    return { 
      energyType: 'electricity', 
      confidence: 0.51, 
      reason: '[Vision] Ambiguous result',
      source: 'vision' 
    };
  } catch (error: any) {
    console.error(`[GEMINI_RESPONSE][VISION] CRITICAL ERROR:`, error.message);
    if (error.message?.includes('403')) {
      console.error(`[DEPLOY_TRACE] Error 403 Detectado. Verifique que la clave ${keySuffix} esté activa en el panel de Vercel.`);
    }
    return { 
      energyType: 'electricity', 
      confidence: 0.50, 
      reason: `Vision classification failed: ${error.message}`,
      source: 'vision' 
    };
  }
}

export function isLikelyGas(text: string): boolean {
  const result = classifyInvoice(text);
  return result.energyType === 'gas' && result.confidence >= 0.6;
}

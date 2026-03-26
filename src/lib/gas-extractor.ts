import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedBill, EnergyType } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const GAS_EXTRACTION_PROMPT = `
Eres un experto en facturas de GAS NATURAL españolas. Tu tarea es extraer datos de facturas de gas con precisión matemática.

REGLAS DE EXTRACCIÓN (GAS):

0. **CUPS (OBLIGATORIO):** Extrae el código CUPS completo (empieza por ES). Es fundamental.

1. **DATOS DE LA FACTURA:**
   - numeroFactura: Número de factura completo
   - fechaEmision: Fecha de emisión (DD/MM/YYYY)
   - periodoInicio: Fecha inicio del periodo (DD/MM/YYYY)
   - periodoFin: Fecha fin del periodo (DD/MM/YYYY)

2. **CONSUMO:**
   - Busca "Consumo: XXX kWh" o similar
   - Si hay m³, extráelos también
   - Si hay factor de conversión, extráelo
   - Si hay "Lectura anterior" y "Lectura actual", extráelas
   - Si hay tipo de lectura (real/estimada/media), extráelo

3. **AJUSTES / REGULARIZACIONES (IMPORTANT):**
   - Busca "Regularización", "Ajuste PCS", "Ajuste", etc.
   - Si existen ajustes, extráelos con kWh y euros afectados
   - IMPORTANTE: Usa el consumo AJUSTADO/FACTURADO para cálculos finales

4. **PRECIOS:**
   - Busca el precio €/kWh explícito si existe
   - Busca el término fijo diario (€/día)
   - Calcula el término fijo total (diario × días)

5. **OTROS CONCEPTOS:**
   - Impuesto hidrocarburos (siempre presente)
   - Alquiler contador
   - IVA (normalmente 21%)

6. **MATEMÁTICA:**
   - Verifica que: Consumo × Precio + Término Fijo + Impuesto + Alquiler ≈ Total Factura
   - El consumo a usar es el AJUSTADO si hay ajustes

7. **CASOS ESPECIALES:**
   - Si no hay €/kWh explícito pero tienes coste y kWh → calcula: coste/kWh
   - Si no hay factor de conversión → usa null (no inventes)
   - Si no hay m³ → usa null

8. **FACTURAS DE AJUSTE:**
   - Pueden tener valores negativos
   - Úsalos tal cual aparecen

RESPONDE ÚNICAMENTE CON JSON VÁLIDO:
{
  "comercializadora": string,
  "numeroFactura": string,
  "fechaEmision": "DD/MM/YYYY",
  "periodoInicio": "DD/MM/YYYY",
  "periodoFin": "DD/MM/YYYY",
  "cups": string,
  "distribuidora": string | null,
  "tarifaRL": string,
  "consumoKwh": number,
  "consumoM3": number | null,
  "factorConversion": number | null,
  "tipoLectura": "real" | "estimada" | "media" | null,
  "lecturaAnterior": number | null,
  "lecturaActual": number | null,
  "precioKwh": number | null,
  "terminoFijoDiario": number,
  "diasFacturados": number,
  "terminoFijoTotal": number,
  "impuestoHidrocarbTotal": number,
  "alquilerTotal": number,
  "ajustes": [
    { "concepto": string, "kwh": number, "euros": number }
  ] | null,
  "costeConsumoAjustado": number | null,
  "ivaPorcentaje": number,
  "ivaTotal": number,
  "totalFactura": number
}
`;

function cleanJson(text: string): string {
  return text.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
}

interface GasExtractedData {
  comercializadora?: string;
  numeroFactura?: string;
  fechaEmision?: string;
  periodoInicio?: string;
  periodoFin?: string;
  cups?: string;
  distribuidora?: string | null;
  tarifaRL?: string;
  consumoKwh?: number;
  consumoM3?: number | null;
  factorConversion?: number | null;
  tipoLectura?: 'real' | 'estimada' | 'media' | null;
  lecturaAnterior?: number | null;
  lecturaActual?: number | null;
  precioKwh?: number | null;
  terminoFijoDiario?: number;
  diasFacturados?: number;
  terminoFijoTotal?: number;
  impuestoHidrocarbTotal?: number;
  alquilerTotal?: number;
  ajustes?: { concepto: string; kwh: number; euros: number }[] | null;
  costeConsumoAjustado?: number | null;
  ivaPorcentaje?: number;
  ivaTotal?: number;
  totalFactura?: number;
}

export async function extractGasBillData(
  fileBuffer: Buffer,
  fileType: string,
  userInstruction?: string
): Promise<ExtractedBill> {
  const model = genAI.getGenerativeModel(
    { model: 'gemini-flash-latest' },
    { apiVersion: 'v1beta' }
  );

  const parts = [
    { text: GAS_EXTRACTION_PROMPT },
    ...(userInstruction
      ? [{ text: `INSTRUCCIÓN ADICIONAL: ${userInstruction}` }]
      : []),
    {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType: fileType,
      },
    },
  ];

  const keySuffix = process.env.GEMINI_API_KEY ? `...${process.env.GEMINI_API_KEY.slice(-4)}` : 'missing';
  console.log(`[GEMINI_REQUEST][GAS] Model: gemini-flash-latest, Key: ${keySuffix}, PromptLength: ${GAS_EXTRACTION_PROMPT.length}`);

  try {
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    console.log(`[GEMINI_RESPONSE][GAS] Response Length: ${responseText.length}`);

    const text = cleanJson(responseText);
    const data: GasExtractedData = JSON.parse(text);

    // Build the ExtractedBill with gas fields
    const warnings: string[] = [];

    // Determine if precioKwh was estimated
    const precioKwhEstimated: boolean = !data.precioKwh && !!(data.consumoKwh && data.costeConsumoAjustado);

    const bill: ExtractedBill = {
      id: '', // Will be set by caller
      fileName: '', // Will be set by caller
      status: 'success',
      energyType: 'gas' as EnergyType, // Explicitly set — extractor always knows it's gas
      comercializadora: data.comercializadora,
      cups: data.cups,
      fechaInicio: data.periodoInicio,
      fechaFin: data.periodoFin,
      tarifaRL: data.tarifaRL,
      gasConsumption: {
        kwh: data.consumoKwh || 0,
        m3: data.consumoM3 ?? undefined,
        factorConversion: data.factorConversion ?? undefined,
        tipoLectura: data.tipoLectura ?? undefined,
        lecturaAnterior: data.lecturaAnterior ?? undefined,
        lecturaActual: data.lecturaActual ?? undefined,
      },
      gasPricing: {
        precioKwh: data.precioKwh || 0,
        precioKwhEstimated: precioKwhEstimated,
        terminoFijoDiario: data.terminoFijoDiario || 0,
        diasFacturados: data.diasFacturados || 0,
        terminoFijoTotal: data.terminoFijoTotal || 0,
        impuestoHidrocarbTotal: data.impuestoHidrocarbTotal || 0,
        alquilerTotal: data.alquilerTotal || 0,
        ivaPorcentaje: data.ivaPorcentaje || 21,
        ivaTotal: data.ivaTotal || 0,
      },
      gasAdjustments: data.ajustes || undefined,
      totalFactura: data.totalFactura,
      extractionStatus: 'success',
      extractionWarnings: warnings,
    };

    // Add warnings for missing fields
    if (!data.consumoM3) {
      warnings.push('m3 no presente en factura');
    }
    if (!data.factorConversion) {
      warnings.push('Factor de conversión no presente');
    }
    if (precioKwhEstimated) {
      warnings.push('€/kWh calculado (no explícito)');
    }
    if (data.ajustes && data.ajustes.length > 0) {
      warnings.push(`Ajustes detectados: ${data.ajustes.length}`);
    }

    return bill;
  } catch (error: any) {
    console.error(`[GEMINI_RESPONSE][GAS] CRITICAL ERROR:`, error.message);
    if (error.message?.includes('403')) {
      console.error(`[DEPLOY_TRACE] Error 403 Detectado en GAS. Verifique que la clave ${keySuffix} esté activa.`);
    }
    throw new Error(
      `Error crítico en Gemini (Gas): ${error.message}. Verifica tu API Key.`
    );
  }
}

// Fallback: Calculate precioKwh if not extracted
export function calculateGasPrice(gasPricing?: { precioKwh: number; precioKwhEstimated?: boolean }, consumoKwh?: number, costeConsumo?: number): { precioKwh: number; isEstimated: boolean } {
  if (gasPricing?.precioKwh && !gasPricing.precioKwhEstimated) {
    return { precioKwh: gasPricing.precioKwh, isEstimated: false };
  }
  
  if (costeConsumo && consumoKwh && consumoKwh > 0) {
    return { precioKwh: costeConsumo / consumoKwh, isEstimated: true };
  }
  
  return { precioKwh: 0, isEstimated: true };
}

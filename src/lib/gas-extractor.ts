import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedBill, EnergyType } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const GAS_EXTRACTION_PROMPT = `
Eres un experto en auditoría de facturas de GAS NATURAL en España. Tu objetivo es la precisión matemática absoluta y la clasificación técnica de costes.

REGLAS CRÍTICAS DE EXTRACCIÓN (GAS V3.0):

0. **CUPS (MANDATORIO):** Extrae el código CUPS completo (empieza por ES). Es innegociable.

1. **DESGLOSE DE CONSUMO (VISIÓN ENERGÉTICA):**
   - Extrae 'consumoKwh' exactos facturados.
   - Extrae el 'precioKwh' (término variable). Si no es explícito, calcúlalo: (Gasto bruto energía / kWh).
   - Define **'costeBrutoConsumo'** = (consumoKwh × precioKwh).

2. **CLASIFICACIÓN TÉCNICA DE DESCUENTOS (CRÍTICO):**
   Debes clasificar CADA descuento encontrado en una de estas 3 categorías:
   - **'descuentoEnergia'** (Categoría 1): Descuentos aplicados EXCLUSIVAMENTE al consumo (ej: "% sobre energía", "bonificación consumo").
   - **'descuentoTerminoFijo'** (Categoría 2): Descuentos aplicados al término fijo o cuota de servicio.
   - **'descuentoOtros'** (Categoría 3): Descuentos sobre el total de la factura o promociones genéricas.

3. **CÁLCULO DEL NETO ENERGÉTICO:**
   - **'costeNetoConsumo'** = costeBrutoConsumo - descuentoEnergia.
   - Este valor es el que usaremos para auditar el precio real de la molécula de gas.

4. **OTROS CONCEPTOS FIJOS:**
   - Extrae 'terminoFijoTotal' (Cuota fija / Término fijo).
   - Extrae 'impuestoHidrocarbTotal' (Impuesto sobre hidrocarburos).
   - Extrae 'alquilerTotal' (Alquiler de contador).
   - Extrae 'ivaTotal' (Calculado sobre la base imponible total).

5. **BUCLE DE AUTOCONTROL MATEMÁTICO (REGLA DE ORO):**
   - **PASO A:** Extrae el 'totalFactura' directamente del "Total a Pagar" visual de la factura.
   - **PASO B (Cálculo Teórico):** 
     Suma: (costeBrutoConsumo + terminoFijoTotal + impuestoHidrocarbTotal + alquilerTotal)
     Resta: (descuentoEnergia + descuentoTerminoFijo + descuentoOtros)
     Suma: IVA/Impuestos Finales.
   - **PASO C (Verificación):** Si la suma del PASO B no coincide con el PASO A (tolerancia 0,05€), re-examina la factura. Asegúrate de que no has omitido ningún concepto o clasificado mal un descuento.

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO siguiendo esta interfaz:
{
  "comercializadora": string,
  "numeroFactura": string,
  "fechaEmision": "YYYY-MM-DD",
  "periodoInicio": "YYYY-MM-DD",
  "periodoFin": "YYYY-MM-DD",
  "cups": string,
  "tarifaRL": string,
  "consumoKwh": number,
  "consumoM3": number | null,
  "factorConversion": number | null,
  "precioKwh": number,
  "costeBrutoConsumo": number,
  "descuentoEnergia": number,
  "descuentoTerminoFijo": number,
  "descuentoOtros": number,
  "costeNetoConsumo": number,
  "terminoFijoDiario": number,
  "diasFacturados": number,
  "terminoFijoTotal": number,
  "impuestoHidrocarbTotal": number,
  "alquilerTotal": number,
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
  tarifaRL?: string;
  consumoKwh?: number;
  consumoM3?: number | null;
  factorConversion?: number | null;
  precioKwh?: number;
  costeBrutoConsumo?: number;
  descuentoEnergia?: number;
  descuentoTerminoFijo?: number;
  descuentoOtros?: number;
  costeNetoConsumo?: number;
  terminoFijoDiario?: number;
  diasFacturados?: number;
  terminoFijoTotal?: number;
  impuestoHidrocarbTotal?: number;
  alquilerTotal?: number;
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
    const precioKwhEstimated: boolean = !data.precioKwh && !!(data.consumoKwh && data.costeBrutoConsumo);

    const bill: ExtractedBill = {
      id: '', // Will be set by caller
      fileName: '', // Will be set by caller
      status: 'success',
      energyType: 'gas' as EnergyType,
      comercializadora: data.comercializadora,
      cups: data.cups,
      fechaInicio: data.periodoInicio,
      fechaFin: data.periodoFin,
      tarifaRL: data.tarifaRL,
      gasConsumption: {
        kwh: data.consumoKwh || 0,
        m3: data.consumoM3 ?? undefined,
        factorConversion: data.factorConversion ?? undefined,
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
        descuentoTerminoFijo: data.descuentoTerminoFijo || 0,
        descuentoOtros: data.descuentoOtros || 0,
      },
      costeBrutoConsumo: data.costeBrutoConsumo || 0,
      descuentoEnergia: data.descuentoEnergia || 0,
      costeNetoConsumo: data.costeNetoConsumo || 0,
      costeTotalConsumo: data.costeNetoConsumo || 0, // Canonical energy term cost
      totalFactura: data.totalFactura,
      extractionStatus: 'success',
      extractionWarnings: warnings,
    };

    // Calculate net avg price
    if (bill.costeNetoConsumo !== undefined && (data.consumoKwh || 0) > 0) {
      bill.costeMedioKwhNeto = bill.costeNetoConsumo / (data.consumoKwh || 1);
    }

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

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedBill, EnergyType } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `
Eres un experto en auditoría energética española. Tu tarea es extraer datos de facturas de electricidad con precisión matemática total. 

REGLAS CRÍTICAS DE EXTRACCIÓN (V3.0):
0. **CUPS (MANDATORIO):** Extrae el código CUPS completo (empieza por ES). Es fundamental e innegociable.
1. **Periodos P1 a P6:** Extrae cada periodo existente (kwh, precioKwh, total). Si no hay consumo en un periodo, omítelo.
2. **Cálculos Faltantes:** Si solo aparece Total y kWh de un periodo, calcula el precioKwh (Total / kWh). Si hay precio fijo, ponlo en todos los periodos facturados.
3. **Agrupación Estricta y Nombres Canónicos:** 
   Debes usar OBLIGATORIAMENTE estos nombres exactos para agrupar conceptos similares:
   - 'BONO SOCIAL': Agrupa cualquier variante de bono.
   - 'ALQUILER DE EQUIPOS': Alquiler de equipos, contadores y gestión de medida.
   - 'PEAJES Y TRANSPORTES': Peajes y cargos desglosados fuera de energía/potencia.
   - 'COMPENSACIÓN EXCEDENTES': Energía vertida (valor negativo si resta).
   - 'IMPUESTO ELÉCTRICO': Impuesto de electricidad.
   - 'IVA / IGIC': IVA o IGIC.
   - 'EXCESO DE POTENCIA': Agrupa penalizaciones, excesos de potencia, método cuarto horario o puntas.

4. **Desglose de Energía y Descuentos (NUEVO):**
   - Extrae el **'costeBrutoConsumo'** como la suma total de los términos de energía (kWh × precio) antes de descuentos.
   - Identifica **'descuentoEnergia'** buscando descuentos porcentuales o fijos aplicados exclusivamente al término de consumo/energía.
   - Define **'costeNetoConsumo'** como (costeBrutoConsumo - descuentoEnergia).
   - **MANDATORIO:** Los descuentos de energía NO deben aparecer en 'otrosConceptos'.

5. **Auditoría de Potencia Industrial (PRO):**
   - Busca el cuadro de "Resumen de Factura" o "Detalle de Potencia". 
   - **MANDATORIO:** Separa los excesos del gasto base. El 'costeTotalPotencia' debe ser solo el término fijo por potencia contratada. Cualquier penalización extra DEBE ir a 'otrosConceptos' como 'EXCESO DE POTENCIA'.

6. **BUCLE DE AUTOCONTROL MATEMÁTICO (REGLA DE ORO):**
   - **Paso A:** Extrae el 'totalFactura' directamente de la posición visual de "Total a Pagar" en el papel.
   - **Paso B:** Suma matemáticamente todos tus datos extraídos: (costeNetoConsumo + costeTotalPotencia + SUMA de otrosConceptos).
   - **Paso C (Verificación):** Compara el sumatorio con el 'totalFactura' extraído en el Paso A.
   - **Paso D (Re-evaluación):** Si la diferencia es mayor a 0,05€, RE-ESCANEA el documento buscando conceptos omitidos hasta que la suma coincida perfectamente.

7. **Facturas de Anulación:** Devuelve valores en NEGATIVO si es abono/rectificativa.

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO siguiendo esta interfaz:
{
  "comercializadora": string,
  "titular": string,
  "cups": string,
  "tarifa": string,
  "fechaInicio": "YYYY-MM-DD",
  "fechaFin": "YYYY-MM-DD",
  "consumoTotalKwh": number,
  "consumo": [{ "periodo": "P1", "kwh": number, "precioKwh": number, "total": number, "isAggregate": boolean }],
  "potencia": [{ "periodo": "P1", "kwContratados": number, "precioKwAnual": number, "total": number }],
  "costeBrutoConsumo": number,
  "descuentoEnergia": number,
  "costeNetoConsumo": number,
  "costeTotalConsumo": number,
  "costeTotalPotencia": number,
  "otrosConceptos": [{ "concepto": string, "total": number }],
  "totalFactura": number
}
`;

function cleanJson(text: string): string {
  return text.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
}

export async function extractBillDataWithAI(fileBuffer: Buffer, fileType: string, userInstruction?: string): Promise<ExtractedBill> {
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' }, { apiVersion: 'v1beta' });

  const parts = [
    { text: SYSTEM_PROMPT },
    ...(userInstruction ? [{ text: `INSTRUCCIÓN ADICIONAL DEL USUARIO (PRIORIDAD ALTA): ${userInstruction}` }] : []),
    {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType: fileType
      }
    }
  ];

  const keySuffix = process.env.GEMINI_API_KEY ? `...${process.env.GEMINI_API_KEY.slice(-4)}` : 'missing';
  console.log(`[GEMINI_REQUEST][ELECTRICITY] Model: gemini-flash-latest, Key: ${keySuffix}, PromptLength: ${SYSTEM_PROMPT.length}`);

  try {
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    console.log(`[GEMINI_RESPONSE][ELECTRICITY] Response Length: ${responseText.length}`);
    
    const text = cleanJson(responseText);
    let data: ExtractedBill = JSON.parse(text);

    // --- Deduplication & Normalization Step ---
    if (data.otrosConceptos) {
      const seen = new Set<string>();
      data.otrosConceptos = data.otrosConceptos.filter(oc => {
        // Create a unique key based on a fuzzy concept name and its value
        const fuzzyName = oc.concepto.toUpperCase()
          .replace(/DE\s+/g, '')
          .replace(/\s+/g, '')
          .replace(/[()]/g, '')
          .replace(/MÉTODO/g, '')
          .replace(/CUARTOHORARIO/g, '')
          .trim();
        
        const key = `${fuzzyName}-${oc.total}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Special check: If we have multiple power penalty variations with the same total, keep only one
      const powerSeen = new Set<number>();
      data.otrosConceptos = data.otrosConceptos.filter(oc => {
        const isExceso = oc.concepto.toUpperCase().includes('EXCESO') || oc.concepto.toUpperCase().includes('PENALIZACIÓN');
        if (isExceso) {
          if (powerSeen.has(oc.total)) return false;
          powerSeen.add(oc.total);
        }
        return true;
      });
    }

    // Ensure backward compatibility and calculate net price
    if (data.costeNetoConsumo !== undefined) {
      data.costeTotalConsumo = data.costeNetoConsumo;
    }
    
    if (data.costeNetoConsumo !== undefined && data.consumoTotalKwh && data.consumoTotalKwh > 0) {
      data.costeMedioKwhNeto = data.costeNetoConsumo / data.consumoTotalKwh;
    }

    return { ...data, status: 'success', energyType: 'electricity' as EnergyType };
  } catch (error: any) {
    console.error(`[GEMINI_RESPONSE][ELECTRICITY] CRITICAL ERROR:`, error.message);
    if (error.message?.includes('403')) {
      console.error(`[DEPLOY_TRACE] Error 403 Detectado en ELECTRICITY. Verifique que la clave ${keySuffix} esté activa.`);
    }

    try {
        console.warn('Reintentando con gemini-flash-latest (Retry)...');
        const res = await model.generateContent(parts);
        const resText = cleanJson(res.response.text());
        console.log(`[GEMINI_RESPONSE][ELECTRICITY][RETRY] Success. Length: ${resText.length}`);
        return { ...JSON.parse(resText), status: 'success', energyType: 'electricity' as EnergyType };
    } catch (e2: any) {
        console.error(`[GEMINI_RESPONSE][ELECTRICITY][RETRY] Failed:`, e2.message);
        throw new Error(`Error crítico en Gemini (Electricity): ${error.message}. Verifica tu API Key.`);
    }
  }
}

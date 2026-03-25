import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExtractedBill } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `
Eres un experto en auditoría energética española. Tu tarea es extraer datos de facturas de electricidad con precisión matemática total. 

REGLAS CRÍTICAS:
0. **CUPS (MANDATORIO):** Extrae el código CUPS completo (empieza por ES). Es fundamental para identificar el suministro.
1. **Periodos P1 a P6:** Las facturas pueden tener desde P1 hasta P6. Extrae cada periodo existente (kwh, precioKwh, total). Si no hay consumo en ese periodo, omítelo.
2. **Cálculos Faltantes:** Si solo aparece Total y kWh de un periodo, calcula el precioKwh (Total / kWh). Si hay precio fijo, ponlo en todos los periodos facturados.
3. **Agrupación Estricta y Nombres Canónicos (MANDATORIO):** 
   Debes usar OBLIGATORIAMENTE estos nombres exactos para agrupar conceptos similares. NO crees variaciones:
   - 'BONO SOCIAL': Agrupa cualquier variante de bono social o financiación del bono.
   - 'ALQUILER DE EQUIPOS': Agrupa alquiler de equipos, contadores y gestión de medida.
   - 'PEAJES Y TRANSPORTES': Agrupa peajes y cargos SOLO si se desglosan fuera del término de energía/potencia.
   - 'COMPENSACIÓN EXCEDENTES': Agrupa variantes de compensación por energía vertida.
   - 'IMPUESTO ELÉCTRICO': Nombre único para el impuesto de electricidad.
   - 'IVA / IGIC': Nombre único para el IVA o impuesto equivalente.
   - 'EXCESO DE POTENCIA': Agrupa OBLIGATORIAMENTE aquí cualquier concepto de "penalización", "exceso", "método cuarto horario" o "puntas de potencia". 
     **REGLA CRÍTICA:** Este importe NO debe sumarse en 'costeTotalPotencia'. Debe ir SOLO aquí.
   - Si existe un importe que no encaje, úsalo con su nombre original pero evita duplicidades.

4. **Cálculos Totales y CUADRE MATEMÁTICO (REGLA DE ORO):** 
   - 'costeTotalPotencia': Debe ser ÚNICAMENTE la suma del término fijo/potencia contratada. NO incluyas excesos aquí.
   - El sumatorio de (costeTotalConsumo + costeTotalPotencia + SUMA de otrosConceptos) DEBE SER EXACTAMENTE IGUAL a totalFactura.
   - **PREVENCIÓN DE DUPLICADOS:** Si un importe ya está incluido en un sumatorio de la factura (ej: un subtotal de potencia), extráelo una sola vez. Si la factura muestra un subtotal y luego el desglose, usa solo el subtotal o la suma de los desgloses, NUNCA ambos.
   - **Facturas de Anulación / Rectificativas:** Si el documento indica "Factura de anulación", "Abono", "Rectificativa" o importes en negativo, devuelve los valores en **NEGATIVO**.
5. **Precios Agregados (isAggregate):** Si para obtener el 'precioKwh' de un periodo has tenido que sumar varios componentes, marca "isAggregate": true.
6. **Resiliencia:** Si no encuentras una etiqueta clara, busca patrones numéricos. Usa tu conocimiento del mercado español (ej: 6 periodos = 3.0TD o superior).

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

  try {
    const result = await model.generateContent(parts);
    const text = cleanJson(result.response.text());
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

    return { ...data, status: 'success' };
  } catch (error: any) {
    console.error('Error extracting with Gemini:', error);
    try {
        console.warn('Reintentando con gemini-flash-latest (Retry)...');
        const res = await model.generateContent(parts);
        return { ...JSON.parse(cleanJson(res.response.text())), status: 'success' };
    } catch (e2) {
        throw new Error(`Error crítico en Gemini: ${error.message}. Verifica tu API Key.`);
    }
  }
}

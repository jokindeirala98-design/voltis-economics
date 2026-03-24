import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `
Eres un analista experto en facturación eléctrica del sector energético de España. 
Tu objetivo es extraer datos detallados de consumos, potencias y precios de la factura proporcionada, devolviendo ÚNICAMENTE un JSON.

REGLAS DE EXTRACCIÓN (CRÍTICO):
0. **CUPS (MANDATORIO):** Extrae el código CUPS completo (empieza por ES). Es fundamental para identificar el suministro.
1. **Periodos P1 a P6:** Las facturas pueden tener desde P1 hasta P6. Extrae cada periodo existente (kwh, precioKwh, total). Si no hay consumo en ese periodo, omítelo.
2. **Cálculos Faltantes:** Si solo aparece Total y kWh de un periodo, calcula el precioKwh (Total / kWh). Si hay precio fijo, ponlo en todos los periodos facturados.
3. **Agrupación MANDATORIA en otrosConceptos (UNIFICACIÓN AUTOMÁTICA):** 
   - 'Bono Social': Agrupa todo concepto de bono social o financiación del bono.
   - 'Alquiler de equipos': Agrupa alquiler de equipos y contadores.
   - 'Peajes y Transportes': AGRUPA OBLIGATORIAMENTE aquí peajes y cargos SOLO SI se cobran de forma independiente en el total. REGLA DE ORO: Si los peajes ya vienen incluidos dentro del "Término de Energía" o "Término de Potencia", NO los extraigas en otrosConceptos.
   - 'Compensación Excedentes': AGRUPA OBLIGATORIAMENTE aquí todas las variantes de compensacion por excedentes.
   - 'Impuesto Eléctrico' e 'IVA / IGIC': Extrae los impuestos.
   TODO el dinero restante que no encaje, ponlo con su nombre original.
4. **Calculos Totales y CUADRE MATEMÁTICO (CRÍTICO):** 
   - **Facturas de Anulación / Rectificativas:** Si el documento indica "Factura de anulación", "Abono", "Rectificativa" o los importes aparecen en negativo, DEBES devolver los valores de \`totalFactura\`, \`costeTotalConsumo\`, etc., en **NEGATIVO** (ejemplo: -4545.81). Esto es vital para que se resten del total anual. No es necesario desglosar minuciosamente los periodos si es una anulación total, lo importante es el total negativo.
   - 'consumoTotalKwh': Suma de kWh P1-P6.
   - 'costeTotalConsumo' (MANDATORIO PARA FACTURAS SEGMENTADAS): En facturas tipo EDP u otras que separan el coste en varios bloques, DEBES SUMAR: "Energía Eléctrica" + "Término de Energía ATR" + "Cargos por Energía Consumida". Estos tres bloques (Commodity, Peaje y Cargo) constituyen el coste real de la energía antes de impuestos. El sumatorio final de (costeTotalConsumo + costeTotalPotencia + otrosConceptos) DEBE SER IGUAL a totalFactura.
   - 'costeMedioKwh': (costeTotalConsumo / consumoTotalKwh) con 4 decimales.
   - 'costeTotalPotencia': Suma en euros ÚNICAMENTE de la potencia contratada.
5. **Precios Agregados (isAggregate):** Si para obtener el 'precioKwh' de un periodo has tenido que sumar varios componentes (ejemplo: ATR + Cargos), marca el campo "isAggregate": true en ese objeto de consumo.
6. **Resiliencia (MANDATORIO):** Si no encuentras una etiqueta clara, busca patrones numéricos cerca de "Energía", "ATR", "Peaje". NO devuelvas ceros si hay datos legibles. Usa tu conocimiento del mercado español para identificar la tarifa (ej: 6 periodos = 3.0TD o superior).

FORMATO ESTRUCTURADO ESTRICTO:
{
  "comercializadora": "...",
  "cups": "ES...",
  "fechaInicio": "YYYY-MM-DD",
  "fechaFin": "YYYY-MM-DD",
  "titular": "...",
  "tarifa": "...",
  "consumo": [
    { "periodo": "P1", "kwh": 0, "precioKwh": 0, "total": 0, "isAggregate": true }
  ],
  "potencia": [
    { "periodo": "P1", "kw": 0, "precioKwDia": 0, "dias": 0, "total": 0 }
  ],
  "otrosConceptos": [
    { "concepto": "Bono Social", "total": 0 },
    { "concepto": "Alquiler de equipos", "total": 0 },
    { "concepto": "Peajes y Transportes", "total": 0 },
    { "concepto": "Compensación Excedentes", "total": 0 },
    { "concepto": "Impuesto Eléctrico", "total": 0 },
    { "concepto": "IVA / IGIC", "total": 0 }
  ],
  "consumoTotalKwh": 0,
  "costeTotalConsumo": 0,
  "costeMedioKwh": 0,
  "costeTotalPotencia": 0,
  "totalFactura": 0
}
Devuelve el JSON plano. No incluyas backticks markdown.
`;

function cleanJson(text: string): string {
  try {
    const cleaned = text.replace(/```json\n?|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return cleaned;
    return cleaned.substring(start, end + 1);
  } catch (e) {
    return text;
  }
}

export async function extractBillDataWithAI(pdfText: string, pdfBuffer?: Buffer) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurado en las variables de entorno de Vercel.');
  }

  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 2048
    }
  });

  // Prepare content parts
  const parts: any[] = [{ text: `${SYSTEM_PROMPT}\n\nTEXTO EXTRAÍDO (REFERENCIA):\n${pdfText}\n\nEXTRAE EL JSON A CONTINUACIÓN:` }];
  
  if (pdfBuffer) {
    parts.push({
      inlineData: {
        data: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf'
      }
    });
  }

  const start = Date.now();
  try {
    const result = await model.generateContent(parts);
    const output = result.response.text().trim();
    const duration = Date.now() - start;
    console.log(`[GEMINI] Extraction complete in ${duration}ms (Model: ${model.model})`);
    
    const cleaned = cleanJson(output);
    return JSON.parse(cleaned);
  } catch (error: any) {
    console.error('Error in AI extraction:', error);
    
    // Fallback to Gemini 2.5 Flash if needed
    try {
        const fallbackStart = Date.now();
        console.warn('Reintentando con gemini-2.5-flash (Fallback)...');
        const backupModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const res2 = await backupModel.generateContent(parts);
        const fallbackDuration = Date.now() - fallbackStart;
        console.log(`[GEMINI] Fallback extraction complete in ${fallbackDuration}ms`);
        return JSON.parse(cleanJson(res2.response.text()));
    } catch (e2) {
        throw new Error(`Error crítico en Gemini: ${error.message}. Verifica tu API Key.`);
    }
  }
}


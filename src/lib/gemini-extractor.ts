// Solo usamos Gemini como motor principal, tal como en las versiones originales.

const SYSTEM_PROMPT = `
Eres un analista experto en facturación eléctrica de España. Tu misión es extraer cada dato de la factura con precisión absoluta.
Devuelve ÚNICAMENTE un JSON plano (sin markdown ni explicaciones) con esta estructura exacta:

{
  "comercializadora": "Nombre buscado",
  "titular": "Nombre completo",
  "cups": "Código CUPS (ES00...)",
  "fechaInicio": "YYYY-MM-DD",
  "fechaFin": "YYYY-MM-DD",
  "tarifa": "2.0TD, 3.0TD...",
  "consumo": [ { "periodo": "P1-P6", "kwh": 0, "precioKwh": 0, "total": 0 } ],
  "potencia": [ { "periodo": "P1-P6", "kw": 0, "precioKwDia": 0, "dias": 0, "total": 0 } ],
  "otrosConceptos": [ { "concepto": "Nombre", "total": 0 } ],
  "consumoTotalKwh": 0,
  "costeTotalConsumo": 0,
  "costeTotalPotencia": 0,
  "totalFactura": 0
}

REGLAS CRÍTICAS:
1. **Agrupación en otrosConceptos**: Bono Social, Alquiler de equipos, Impuesto Eléctrico, IVA / IGIC. Cualquier otro concepto va aquí.
2. **CUADRE MATEMÁTICO**: costeTotalConsumo + costeTotalPotencia + SUMA(otrosConceptos) DEBE SER EXACTAMENTE IGUAL A totalFactura.
3. Si un dato no existe, devuélvelo como null o 0 según corresponda. No inventes datos.
`;

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const MODELS = [
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest'
];

async function callAIWithFallback(messages: any[], modelIndex = 0): Promise<{ content: string, usedModel: string }> {
  const currentModel = MODELS[modelIndex];
  if (!currentModel) throw new Error('No se pudo conectar con el motor de IA de Gemini. Revisa tu clave de Google en Vercel.');

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY no configurado en Vercel.');
    }
    
    const model = genAI.getGenerativeModel({ 
      model: currentModel,
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = messages.map(m => m.content).join('\n\n');
    const res = await model.generateContent(prompt);
    
    if (!res.response) throw new Error('Sin respuesta del modelo Gemini.');
    const content = res.response.text();
    return { content, usedModel: currentModel };

  } catch (err: any) {
    console.error(`Error en Gemini (${currentModel}):`, err.message);

    const errorMessage = (err.message || '').toLowerCase();
    const isRetryable = err.status === 429 || err.status === 503 || errorMessage.includes('rate limit');
    const isNotFound = err.status === 404 || errorMessage.includes('not found') || errorMessage.includes('404');

    if ((isRetryable || isNotFound) && modelIndex < MODELS.length - 1) {
      console.warn(`Reintentando con modelo secundario de Gemini...`);
      return callAIWithFallback(messages, modelIndex + 1);
    }
    
    throw new Error(`[Gemini Error] ${err.message}`);
  }
}

function cleanJson(text: string): string {
  try {
    // 1. Remove markdown backticks if present
    const cleaned = text.replace(/```json\n?|```/g, '').trim();
    
    // 2. Find the first '{' and last '}'
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    
    if (start === -1 || end === -1) return cleaned;
    return cleaned.substring(start, end + 1);
  } catch (e) {
    return text;
  }
}

export async function extractBillDataWithAI(pdfText: string) {
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    throw new Error('No se han configurado llaves de API (GROQ o GEMINI) en Vercel.');
  }

  const messages: any[] = [{ role: 'user', content: `${SYSTEM_PROMPT}\n\nTEXTO DE LA FACTURA:\n${pdfText}` }];

  try {
    // ATTEMPT 1: Best available model in the chain
    const startIndex = !process.env.GEMINI_API_KEY ? MODELS.indexOf('llama-3.3-70b-versatile') : 0;
    const { content: output1, usedModel } = await callAIWithFallback(messages, startIndex);
    
    let parsedData;
    try {
      parsedData = JSON.parse(cleanJson(output1));
    } catch (e) {
      console.error('JSON Parse Error after cleaning:', output1);
      throw new Error(`La IA devolvió un formato inválido. Intentando recuperar...`);
    }

    // VALIDATION
    const validate = (data: any) => {
      const e = data.costeTotalConsumo || 0;
      const p = data.costeTotalPotencia || 0;
      let ocs = 0;
      if (Array.isArray(data.otrosConceptos)) {
        data.otrosConceptos.forEach((oc: any) => ocs += (oc.total || 0));
      }
      const calculated = Number((e + p + ocs).toFixed(2));
      const reported = Number((data.totalFactura || 0).toFixed(2));
      return { isMatch: Math.abs(calculated - reported) <= 0.06, calculated, reported, diff: Number((reported - calculated).toFixed(2)) };
    };

    let check = validate(parsedData);

    // ATTEMPT 2: Targeted Self-Correction (Always using the same model that succeeded in attempt 1)
    if (!check.isMatch) {
      messages.push({ role: 'assistant', content: output1 });
      messages.push({ role: 'user', content: `
        ERROR DE CUADRE: Tus conceptos suman ${check.calculated}€ pero el total de la factura es ${check.reported}€.
        FALTAN ${check.diff}€ por encontrar. 
        Por favor, busca en el texto conceptos que hayas omitido como:
        - Energía Reactiva
        - Excesos de Potencia (Penalizaciones)
        - Canon de Aguas o Tasa de Basuras
        - Otros cargos u abonos.
        Devuelve el JSON corregido asegurando que el sumatorio sea EXACTO.
      `});

      const { content: output2 } = await callAIWithFallback(messages, MODELS.indexOf(usedModel));
      parsedData = JSON.parse(cleanJson(output2));
      check = validate(parsedData);
    }

    if (!check.isMatch) {
      throw new Error(`Inconsistencia matemática detectada: La suma de conceptos (${check.calculated}€) no coincide con el total (${check.reported}€). Faltan ${check.diff}€.`);
    }

    return parsedData;
  } catch (error: any) {
    console.error('Extraction Error:', error);
    if (error.status === 429) {
       throw new Error('Límite de la API alcanzado. Por favor, espera unos minutos antes de subir más archivos.');
    }
    throw new Error(error.message.includes('Inconsistencia') ? error.message : `Detalle técnico: ${error.message}`);
  }
}

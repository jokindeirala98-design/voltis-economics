import Groq from 'groq-sdk';

// Initialize the Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

const SYSTEM_PROMPT = `
Eres un analista experto en facturación eléctrica del sector energético de España. 
Tu objetivo es extraer datos detallados de consumos, potencias y precios de la factura proporcionada, devolviendo ÚNICAMENTE un JSON.

REGLAS DE ORO DE EXTRACCIÓN (LEYES IRREVOCABLES):
1. **CUADRE MATEMÁTICO PERFECTO**: La suma de (costeTotalConsumo + costeTotalPotencia + SUMA de todos los otrosConceptos) DEBE SER EXACTAMENTE IGUAL a totalFactura. Si no cuadras al céntimo, revisa si has duplicado conceptos de la "página de desglose" que ya estaban en el "resumen".
2. **Periodos P1 a P6**: Extrae cada periodo existente. Si la factura es 2.0TD tendrá P1-P3 en energía y P1-P2 en potencia. Si es 3.0TD tendrá P1-P6.
3. **Cálculos de Precios**: Si falta el precio unitario pero tienes el total y los kWh, calcúlalo (Total / kWh).
4. **Unificación de Otros Conceptos**:
   - 'Bono Social': Suma cualquier línea de bono social o financiación.
   - 'Alquiler de equipos': Agrupa alquiler de contador/equipo.
   - 'Impuesto Eléctrico' e 'IVA / IGIC': Extrae los importes exactos.
   - 'Peajes y Cargos': SOLO extráelos si NO están ya incluidos en los precios de energía/potencia. Si aparecen desglosados en el resumen general, agrúpalos.
5. **Penalizaciones**: Los excesos de potencia o reactiva van SIEMPRE a 'otrosConceptos', NUNCA sumados a 'costeTotalPotencia'.

EJEMPLO DE SALIDA ESPERADA:
{
  "comercializadora": "IBERDROLA",
  "fechaInicio": "2024-01-01",
  "fechaFin": "2024-01-31",
  "titular": "JUAN PEREZ",
  "cups": "ES0021000000000000XX",
  "tarifa": "2.0TD",
  "consumo": [
    { "periodo": "P1", "kwh": 150.5, "precioKwh": 0.1524, "total": 22.94 },
    { "periodo": "P2", "kwh": 200.0, "precioKwh": 0.1210, "total": 24.20 }
  ],
  "potencia": [
    { "periodo": "P1", "kw": 4.6, "precioKwDia": 0.1039, "dias": 31, "total": 14.82 },
    { "periodo": "P2", "kw": 4.6, "precioKwDia": 0.0321, "dias": 31, "total": 4.58 }
  ],
  "otrosConceptos": [
    { "concepto": "Bono Social", "total": 1.25 },
    { "concepto": "Alquiler de equipos", "total": 0.82 },
    { "concepto": "Impuesto Eléctrico", "total": 2.15 },
    { "concepto": "IVA / IGIC", "total": 10.20 }
  ],
  "consumoTotalKwh": 350.5,
  "costeTotalConsumo": 47.14,
  "costeMedioKwh": 0.1345,
  "costeTotalPotencia": 19.40,
  "totalFactura": 80.96
}

Devuelve EXCLUSIVAMENTE el JSON resultante. Sin preámbulos ni explicaciones.
`;

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'gemini-emergency'
];

async function callGroqWithFallback(messages: any[], modelIndex = 0): Promise<{ content: string, usedModel: string }> {
  try {
    const currentModel = MODELS[modelIndex];

    if (currentModel === 'gemini-emergency') {
       if (!process.env.GEMINI_API_KEY) throw new Error('No hay más modelos disponibles en Groq y no se ha configurado GEMINI_API_KEY.');
       const model = genAI.getGenerativeModel({ 
         model: 'gemini-1.5-flash',
         generationConfig: { responseMimeType: "application/json" }
       });
       // Convert messages to gemini prompt
       const prompt = messages.map(m => m.content).join('\n\n');
       const res = await model.generateContent(prompt);
       return { content: res.response.text(), usedModel: 'gemini-1.5-flash' };
    }

    const res = await groq.chat.completions.create({
      messages,
      model: currentModel,
      temperature: 0,
      response_format: { type: 'json_object' }
    });
    return { content: res.choices[0]?.message?.content || '{}', usedModel: currentModel };
  } catch (err: any) {
    // If Rate Limit (429) or Overloaded (503), try next model
    if ((err.status === 429 || err.status === 503 || err.message.includes('Rate limit')) && modelIndex < MODELS.length - 1) {
      console.warn(`Model ${MODELS[modelIndex]} limited/overloaded. Falling back to ${MODELS[modelIndex+1]}...`);
      return callGroqWithFallback(messages, modelIndex + 1);
    }
    throw err;
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
    const startIndex = !process.env.GROQ_API_KEY ? MODELS.indexOf('gemini-emergency') : 0;
    const { content: output1, usedModel } = await callGroqWithFallback(messages, startIndex);
    
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

      const { content: output2 } = await callGroqWithFallback(messages, MODELS.indexOf(usedModel));
      parsedData = JSON.parse(output2);
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

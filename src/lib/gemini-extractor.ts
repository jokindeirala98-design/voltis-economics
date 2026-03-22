import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `
Eres un analista experto en facturación eléctrica del sector energético de España. 
Tu objetivo es extraer datos detallados de consumos, potencias y precios de la factura proporcionada, devolviendo ÚNICAMENTE un JSON.

REGLAS DE EXTRACCIÓN (CRÍTICO):
1. **Periodos P1 a P6:** Las facturas pueden tener desde P1 hasta P6. Extrae cada periodo existente (kwh, precioKwh, total). Si no hay consumo en ese periodo, omítelo.
2. **Cálculos Faltantes:** Si solo aparece Total y kWh de un periodo, calcula el precioKwh (Total / kWh). Si hay precio fijo, ponlo en todos los periodos facturados.
3. **Agrupación MANDATORIA en otrosConceptos (UNIFICACIÓN AUTOMÁTICA):** 
   - 'Bono Social': Agrupa todo concepto de bono social o financiación del bono.
   - 'Alquiler de equipos': Agrupa alquiler de equipos y contadores.
   - 'Peajes y Transportes': AGRUPA OBLIGATORIAMENTE aquí peajes y cargos SOLO SI se cobran de forma independiente en el total. REGLA DE ORO: Si los peajes ya vienen incluidos dentro del "Término de Energía" o "Término de Potencia" (frecuente en los desgloses de página 2), NO los extraigas en otrosConceptos, o estarás duplicando el dinero y el sumatorio total fallará.
   - 'Compensación Excedentes': AGRUPA OBLIGATORIAMENTE aquí todas las variantes de compensacion por excedentes, excedentes autoconsumo, etc. Súmalos en este UNICO concepto.
   - 'Impuesto Eléctrico' e 'IVA / IGIC': Extrae los impuestos.
   TODO el dinero restante que no encaje, ponlo con su nombre original. Ningún importe debe quedarse fuera.
4. **Calculos Totales y CUADRE MATEMÁTICO (CRÍTICO):** 
   - El sumatorio de (costeTotalConsumo + costeTotalPotencia + TODOS los otrosConceptos) DEBE SER EXACTAMENTE IGUAL a totalFactura. Si no cuadra, estás duplicando desgloses de la página 2.
   - 'consumoTotalKwh': Suma de kWh P1-P6.
   - 'costeTotalConsumo': Suma total en euros de la energía facturada (antes de impuestos).
   - 'costeMedioKwh': Calcula: (costeTotalConsumo / consumoTotalKwh) con 4 decimales.
   - 'costeTotalPotencia': Suma en euros ÚNICAMENTE de la potencia fija contratada. ¡Bajo NINGÚN CONCEPTO sumes aquí penalizaciones por "Excesos de potencia"! Van a "otrosConceptos".
5. **Cantidades:** Usa números (floats). Punto decimal.

FORMATO ESTRUCTURADO ESTRICTO:
{
  "comercializadora": "...",
  "fechaInicio": "YYYY-MM-DD",
  "fechaFin": "YYYY-MM-DD",
  "titular": "...",
  "cups": "Código CUPS completo",
  "tarifa": "ej: 2.0TD o 3.0TD",
  "consumo": [
    { "periodo": "P1", "kwh": 0, "precioKwh": 0, "total": 0 },
    { "periodo": "P2", "kwh": 0, "precioKwh": 0, "total": 0 }
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
Devuelve el JSON plano. No incluyas backticks markdown (\`\`\`json).
`;

export async function extractBillDataWithAI(pdfText: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurado en las variables de entorno.');
  }

  // Use Gemini Flash Latest to support all next-gen API keys
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-flash-latest',
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const prompt = `${SYSTEM_PROMPT}\n\nTEXTO DE LA FACTURA:\n${pdfText}\n\nEXTRAE EL JSON A CONTINUACIÓN:`;

  try {
    const result = await model.generateContent(prompt);
    let output = result.response.text().trim();
    
    // Robust JSON extraction: capture everything from the first { to the last }
    const match = output.match(/\{[\s\S]*\}/);
    if (match) {
      output = match[0];
    }

    const parsedData = JSON.parse(output);
    return parsedData;
  } catch (error: any) {
    console.error('Error in AI extraction:', error);
    throw new Error(`Detalle técnico: ${error.message} \n(Si es parsing, el texto era inválido)`);
  }
}

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

export async function extractBillDataWithAI(pdfText: string) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY no está configurado en las variables de entorno.');
  }

  const prompt = `${SYSTEM_PROMPT}\n\nTEXTO DE LA FACTURA:\n${pdfText}`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' }
    });
    
    let output = chatCompletion.choices[0]?.message?.content || '{}';
    
    const parsedData = JSON.parse(output);

    // --- SECONDARY VALIDATION: Mathematical Integrity ---
    const e = parsedData.costeTotalConsumo || 0;
    const p = parsedData.costeTotalPotencia || 0;
    let ocs = 0;
    if (Array.isArray(parsedData.otrosConceptos)) {
      parsedData.otrosConceptos.forEach((oc: any) => ocs += (oc.total || 0));
    }
    
    const calculatedTotal = Number((e + p + ocs).toFixed(2));
    const reportedTotal = Number((parsedData.totalFactura || 0).toFixed(2));

    if (Math.abs(calculatedTotal - reportedTotal) > 0.05) { // Allow 5 cents rounding diff
      console.warn(`Math mismatch: Calculated ${calculatedTotal} vs Reported ${reportedTotal}`);
      // If the mismatch is significant, we trust the sum of components more for auditing, 
      // but we should warn the AI/User.
      throw new Error(`Inconsistencia matemática detectada: La suma de conceptos (${calculatedTotal}€) no coincide con el total (${reportedTotal}€).`);
    }

    return parsedData;
  } catch (error: any) {
    console.error('Error in Groq AI extraction:', error);
    throw new Error(error.message.includes('Inconsistencia') ? error.message : `Detalle técnico: ${error.message}`);
  }
}

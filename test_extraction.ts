import { extractBillDataWithAI } from './src/lib/gemini-extractor';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const mockPdfText = `
FACTURA DE ELECTRICIDAD
IBERDROLA CLIENTES S.A.U.
Titular: JUAN PEREZ
CUPS: ES0021000000000000XX
Tarifa: 2.0TD
Periodo: 01/01/2024 al 31/01/2024

RESUMEN DE LA FACTURA
Potencia contratada: 14,82 €
Energía consumida: 47,14 €
Impuesto sobre la electricidad: 2,15 €
Alquiler de equipos de medida y control: 0,82 €
IVA 21.00% s/ 64,93: 13,63 €
TOTAL IMPORTE FACTURA: 78,56 €

DETALLE DE LA FACTURA
TERMINO DE POTENCIA
P1: 4,6 kW x 31 días x 0,10389 = 14,82 €
TERMINO DE ENERGIA
P1: 150 kWh x 0,15243 = 22,86 €
P2: 200 kWh x 0,1214 = 24,28 €
OTROS CONCEPTOS
Bono social: 1,25 €
`;

async function test() {
  console.log("--- INICIANDO TEST DE EXTRACCION LLAMA 3.3 ---");
  try {
    const result = await extractBillDataWithAI(mockPdfText);
    console.log("RESULTADO:", JSON.stringify(result, null, 2));
    console.log("--- TEST EXITOSO ---");
  } catch (err) {
    console.error("--- TEST FALLIDO ---", err.message);
  }
}

test();

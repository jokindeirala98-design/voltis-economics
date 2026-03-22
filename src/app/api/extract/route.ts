import { NextResponse } from 'next/server';
const PDFParser = require('pdf2json');
import { extractBillDataWithAI } from '@/lib/gemini-extractor';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado ningún archivo.' }, { status: 400 });
    }

    // Convert Blob to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Text Extraction from PDF using pdf2json
    let pdfText = '';
    try {
      pdfText = await new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, 1);
        pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => {
          resolve(pdfParser.getRawTextContent());
        });
        pdfParser.parseBuffer(buffer);
      });
    } catch (err) {
      console.error('Error parsing PDF:', err);
      return NextResponse.json({ error: 'No se pudo leer el archivo PDF. Asegúrate de que no esté protegido por contraseña.' }, { status: 400 });
    }

    if (!pdfText.trim()) {
      return NextResponse.json({ error: 'El PDF parece estar vacío o ser una imagen sin texto reconocible.' }, { status: 400 });
    }

    // 2. Data Extraction via LLM (Gemini)
    try {
      const extractedData = await extractBillDataWithAI(pdfText);
      
      return NextResponse.json({
        status: 'success',
        bill: {
          ...extractedData,
          id: crypto.randomUUID(),
          fileName: (file as File).name || 'factura.pdf',
          status: 'success'
        }
      });
    } catch (llmError) {
      console.error('Error interpreting data with AI:', llmError);
      return NextResponse.json({ 
        error: llmError instanceof Error ? llmError.message : 'Error al procesar los datos de la factura con la IA.'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Unexpected error processing request:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}

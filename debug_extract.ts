import { extractBillDataWithAI } from './src/lib/gemini-extractor';
import fs from 'fs';
const PDFParser = require('pdf2json');

async function debugExtraction() {
  console.log('--- DEBUG EXTRACCIÓN ---');
  const filePath = '/Users/jokindeirala/Desktop/Gas Argaray/2025.11.14_P25CON052486464_oct.pdf';
  if (!fs.existsSync(filePath)) {
    console.log('Archivo no encontrado:', filePath);
    return;
  }
  console.log('Probando con:', filePath);

  const buffer = fs.readFileSync(filePath);
  
  const extractWithMode = async (mode: number) => {
    const pdfParser = new PDFParser(null, mode);
    return new Promise<string>((resolve, reject) => {
      pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
      pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
      pdfParser.parseBuffer(buffer);
    });
  };

  const pdfText1 = await extractWithMode(1);
  const pdfText0 = await extractWithMode(0);
  
  const pdfText = pdfText1.length > 50 ? pdfText1 : pdfText0;

  console.log('Longitud (Mode 1):', pdfText1.length);
  console.log('Longitud (Mode 0):', pdfText0.length);
  console.log('Primeros 500 caracteres del texto final:', pdfText.substring(0, 500));

  try {
    const result = await extractBillDataWithAI(pdfText);
    console.log('RESULTADO EXITOSO');
    console.log(JSON.stringify(result, null, 2).substring(0, 500));
  } catch (err: any) {
    console.error('ERROR EN AI:', err.message);
  }
}

debugExtraction();

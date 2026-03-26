import { NextResponse } from 'next/server';
const PDFParser = require('pdf2json');
import { extractBillDataWithAI } from '@/lib/gemini-extractor';
import { extractGasBillData } from '@/lib/gas-extractor';
import {
  classifyInvoice,
  isWeakTextForClassification,
  shouldUseVisionFallback,
  classifyInvoiceWithVision,
  ClassificationResult,
} from '@/lib/classifier';
import { EnergyType, DEFAULT_BILL_ENERGY_TYPE, ExtractedBill } from '@/lib/types';

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('503') ||
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('service unavailable') ||
      msg.includes('high demand') ||
      msg.includes('deadline exceeded') ||
      msg.includes('timeout')
    );
  }
  return false;
}

function getUserFriendlyError(error: unknown): { message: string; retryable: boolean } {
  const msg = error instanceof Error ? error.message : String(error);
  const msgLower = msg.toLowerCase();

  if (
    msgLower.includes('503') ||
    msgLower.includes('service unavailable') ||
    msgLower.includes('high demand')
  ) {
    return {
      message: 'Gemini está temporalmente no disponible (alta demanda). Por favor, espera unos segundos e inténtalo de nuevo.',
      retryable: true,
    };
  }

  if (
    msgLower.includes('429') ||
    msgLower.includes('rate limit') ||
    msgLower.includes('too many requests')
  ) {
    return {
      message: 'Has superado el límite de solicitudes a Gemini. Por favor, espera un momento antes de intentarlo de nuevo.',
      retryable: true,
    };
  }

  if (
    msgLower.includes('deadline') ||
    msgLower.includes('timeout')
  ) {
    return {
      message: 'La solicitud a Gemini ha expirado. Por favor, inténtalo de nuevo.',
      retryable: true,
    };
  }

  return { message: msg, retryable: false };
}

async function extractWithRetry<T>(
  extractFn: () => Promise<T>,
  fileName: string,
  extractorName: string,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await extractFn();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);

      if (retryable && attempt < maxRetries) {
        const delay = (attempt + 1) * 2000;
        console.log(`[CLASSIFIER][${fileName}] Retryable error (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      break;
    }
  }

  const friendly = getUserFriendlyError(lastError);
  console.error(`[CLASSIFIER][${fileName}] ${extractorName} failed after retries:`, lastError);
  throw Object.assign(new Error(friendly.message), { retryable: friendly.retryable });
}

export async function POST(req: Request) {
  try {
    const requestId = Math.random().toString(36).substring(7);
    const keySuffix = process.env.GEMINI_API_KEY ? `...${process.env.GEMINI_API_KEY.slice(-4)}` : 'missing';
    
    console.log(`[PROCESS_FLOW][${requestId}] Request received. Source: ${process.env.VERCEL_ENV || 'local'}`);
    console.log(`[ENV_TRACE][${requestId}] GEMINI_KEY: ${keySuffix}, NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[DEPLOY_TRACE][${requestId}] Version: 1.2.1-debug`);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const project_id = formData.get('project_id') as string;

    if (!file) {
      console.error(`[PROCESS_FLOW][${requestId}] Error: No file provided`);
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`[PROCESS_FLOW][${requestId}] Processing file: ${file.name} (${file.size} bytes)`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = (file as File).name || 'factura.pdf';

    let pdfText = '';
    const parseStart = Date.now();
    try {
      pdfText = await new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, 1);
        pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => {
          resolve(pdfParser.getRawTextContent());
        });
        pdfParser.parseBuffer(buffer);
      });
      console.log(`[CLASSIFIER][${fileName}] PDF parsed in ${Date.now() - parseStart}ms`);
    } catch (err) {
      console.error(`[CLASSIFIER][${fileName}] PDF parse error:`, err);
      return NextResponse.json({ error: 'No se pudo leer el archivo PDF. Asegúrate de que no esté protegido por contraseña.' }, { status: 400 });
    }

    if (!pdfText.trim()) {
      return NextResponse.json({ error: 'El PDF parece estar vacío o ser una imagen sin texto reconocible.' }, { status: 400 });
    }

    const textSample = pdfText.substring(0, 500).replace(/\n/g, ' | ');
    console.log(`[TRACE][${fileName}] textLength=${pdfText.length}`);
    console.log(`[TRACE][${fileName}] textSample="${textSample}"`);

    const initialClassification = classifyInvoice(pdfText, fileName);
    const weakIndicator = isWeakTextForClassification(pdfText);
    const needsVision = shouldUseVisionFallback(weakIndicator) || initialClassification.confidence < 0.6;
    
    console.log(`[PROCESS_FLOW][${requestId}] Initial Classification: ${initialClassification.energyType} (${initialClassification.confidence.toFixed(2)})`);
    console.log(`[PROCESS_FLOW][${requestId}] Needs Vision? ${needsVision} (Reason: ${shouldUseVisionFallback(weakIndicator) ? 'weak text' : 'low confidence'})`);

    let classification = initialClassification;
    if (needsVision) {
      console.log(`[PROCESS_FLOW][${requestId}] Triggering vision fallback...`);
      try {
        const visionResult = await classifyInvoiceWithVision(buffer, file.type);
        if (visionResult.confidence > initialClassification.confidence) {
          classification = visionResult;
          console.log(`[PROCESS_FLOW][${requestId}] Vision adopted: ${classification.energyType} (${classification.confidence.toFixed(2)})`);
        } else {
          console.log(`[PROCESS_FLOW][${requestId}] Vision rejected (conf: ${visionResult.confidence.toFixed(2)}), keeping text-based classification`);
        }
      } catch (visionError: any) {
        console.error(`[PROCESS_FLOW][${requestId}] Vision error:`, visionError.message);
        console.log(`[PROCESS_FLOW][${requestId}] Proceeding with text-based classification despite vision failure`);
      }
    }

    console.log(`[PROCESS_FLOW][${requestId}] Final Classification: ${classification.energyType} (${classification.confidence.toFixed(2)})`);

    const userInstruction = formData.get('userInstruction') as string || undefined;

    console.log(`[TRACE][${fileName}] PENDING_REVIEW_GATE: checking confidence=${classification.confidence.toFixed(2)} < 0.6`);

    // SAFETY GATE: Do NOT route on low/ambiguous confidence.
    if (classification.confidence < 0.6) {
      const gateResponse = {
        status: 'pending_review' as const,
        error: `Clasificación ambigua (confianza: ${Math.round(classification.confidence * 100)}%). Por favor, indica si es electricidad o gas o inténtalo con otro archivo.`,
        classification: {
          energyType: classification.energyType,
          confidence: classification.confidence,
          isLowConfidence: true,
          warnings: classification.warnings,
        },
      };
      console.log(`[TRACE][${fileName}] GATE BLOCKED → returning 422:`, JSON.stringify(gateResponse));
      console.warn(`[CLASSIFIER][${fileName}] BLOCKED: Low confidence (${classification.confidence.toFixed(2)}) — refusing to route to any extractor. Pending manual review.`);
      return NextResponse.json(gateResponse, { status: 422 });
    }

    try {
      let extractedData: ExtractedBill;
      console.log(`[PROCESS_FLOW][${requestId}] Routing to ${classification.energyType} extractor...`);

      if (classification.energyType === 'gas') {
        console.log(`[GAS EXTRACTOR][${fileName}] Routing to GAS extractor (confidence: ${classification.confidence.toFixed(2)})`);
        extractedData = await extractWithRetry(
          () => extractGasBillData(buffer, file.type, userInstruction),
          fileName,
          'GasExtractor'
        );
      } else {
        console.log(`[ELECTRICITY EXTRACTOR][${fileName}] Routing to ELECTRICITY extractor (confidence: ${classification.confidence.toFixed(2)})`);
        extractedData = await extractWithRetry(
          () => extractBillDataWithAI(buffer, file.type, userInstruction),
          fileName,
          'ElectricityExtractor'
        );
      }

      const extractedEnergyType = (extractedData as any).energyType as EnergyType | undefined;
      const finalEnergyType: EnergyType = extractedEnergyType || classification.energyType;

      if (extractedEnergyType && extractedEnergyType !== classification.energyType) {
        console.warn(`[CLASSIFIER][${fileName}] EnergyType mismatch: classifier=${classification.energyType}, extractor=${extractedEnergyType} — using extractor value`);
      }

      console.log(`[BILL SAVE][${fileName}] Final energyType=${finalEnergyType}, extractor=${extractedEnergyType || 'none (from classification)'}`);

      const bill = {
        ...extractedData,
        id: crypto.randomUUID(),
        fileName: fileName,
        status: 'success' as const,
        energyType: finalEnergyType,
      };

      console.log(`[BILL SAVE][${fileName}] Bill object shape:`, {
        energyType: bill.energyType,
        hasGasConsumption: !!bill.gasConsumption,
        hasGasPricing: !!bill.gasPricing,
        hasTarifaRL: !!bill.tarifaRL,
        hasConsumo: !!(bill as any).consumo,
        totalFactura: bill.totalFactura,
      });

      return NextResponse.json({
        status: 'success',
        bill,
        classification: {
          energyType: classification.energyType,
          confidence: classification.confidence,
          isLowConfidence: false,
          warnings: classification.warnings,
        },
      });
    } catch (llmError) {
      const isRetryable = (llmError as any)?.retryable === true;
      const userMessage = isRetryable
        ? (llmError as Error).message
        : 'Error al procesar la factura con la IA. Por favor, inténtalo de nuevo.';

      console.error(`[CLASSIFIER][${fileName}] LLM extraction failed:`, llmError);
      return NextResponse.json(
        {
          error: userMessage,
          retryable: isRetryable,
          classification: {
            energyType: classification.energyType,
            confidence: classification.confidence,
            isLowConfidence: false,
            warnings: classification.warnings,
          },
        },
        { status: isRetryable ? 503 : 500 }
      );
    }

  } catch (error) {
    console.error(`[CLASSIFIER] Unexpected error:`, error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}

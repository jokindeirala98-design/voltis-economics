import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Parse + classify multi-invoice PDF. Worst case: a 60-invoice PDF with
// vision fallback. Give it room.
export const maxDuration = 120;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json');

interface Range {
  start: number; // 1-based, inclusive
  end: number;   // 1-based, inclusive
}

/**
 * Extract per-page raw text from a PDF buffer using pdf2json. Returns an
 * array indexed by page number (0-based). Pages that failed to parse come
 * back as empty strings so downstream logic can still reason about indices.
 */
async function extractPagesText(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    parser.on('pdfParser_dataError', (errData: unknown) => {
      const err = (errData as { parserError?: Error }).parserError;
      reject(err || new Error('pdfParser_dataError'));
    });
    parser.on('pdfParser_dataReady', () => {
      try {
        // pdf2json's raw text separates pages with this exact marker.
        const raw: string = parser.getRawTextContent();
        const parts = raw.split(/-{4,}Page\s*\(\d+\)\s*Break-{4,}/g);
        // The first chunk is the pre-page header (usually empty). Drop it.
        const pages = parts.slice(1).map(s => s.trim());
        // If the split produced nothing (some PDFs don't emit markers),
        // fall back to a single page containing the whole text.
        if (pages.length === 0) {
          resolve([raw.trim()]);
        } else {
          resolve(pages);
        }
      } catch (err) {
        reject(err);
      }
    });
    parser.parseBuffer(buffer);
  });
}

/**
 * Count distinct CUPS codes found across the given pages. A single invoice
 * often repeats its CUPS on every page, so counting *distinct* values is
 * the meaningful signal for "is this actually multiple invoices".
 */
function collectDistinctCups(pages: string[]): Set<string> {
  const cupsRe = /\bES\d{4}[A-Z0-9]{12,16}[A-Z]{0,2}\b/gi;
  const set = new Set<string>();
  for (const p of pages) {
    const matches = p.match(cupsRe);
    if (matches) {
      for (const m of matches) set.add(m.toUpperCase().replace(/\s+/g, ''));
    }
  }
  return set;
}

/**
 * Heuristic markers that a page *starts* a new invoice. Tuned for Spanish
 * electricity/gas bills; these patterns show up near the top of the first
 * page of almost every invoice template we've seen.
 */
function pageStartsInvoice(pageText: string): boolean {
  if (!pageText) return false;
  // Normalise: collapse whitespace, lowercase for matching.
  const head = pageText.slice(0, 1500).toLowerCase();
  const markers = [
    /n[ºo°]\s*(de\s+)?factura\s*[:\s]/,
    /n[úu]mero\s+(de\s+)?factura/,
    /factura\s+n[ºo°]/,
    /referencia\s+(de\s+)?factura/,
    /fecha\s+(de\s+)?emisi[óo]n/,
    /per[íi]odo\s+(de\s+)?facturaci[óo]n/,
  ];
  return markers.some(re => re.test(head));
}

/**
 * Ask Gemini Flash to segment the PDF into per-invoice page ranges. We send
 * per-page text snippets rather than the raw PDF because it's dramatically
 * cheaper and works well for text-based invoices. Returns null on failure so
 * the caller can decide on a fallback.
 */
async function segmentWithGeminiText(pages: string[]): Promise<Range[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // Cap each page's snippet so the prompt stays bounded even for 60-invoice
  // files. 1200 chars of header text is more than enough to identify an
  // invoice boundary.
  const pageSnippets = pages.map((p, idx) => {
    const snippet = p.replace(/\s+/g, ' ').slice(0, 1200);
    return `=== PAGE ${idx + 1} ===\n${snippet}`;
  }).join('\n\n');

  const prompt = `Eres un clasificador de facturas energéticas (electricidad y gas) en España.
Te paso el texto por páginas de un PDF que puede contener UNA o VARIAS facturas concatenadas.
Cada factura puede ocupar 1 o varias páginas CONSECUTIVAS.

Identifica los rangos de páginas que pertenecen a cada factura individual.
Señales típicas del inicio de una factura: "Nº de factura", "Número de factura", "Factura Nº", "Fecha emisión", "Periodo de facturación", cambio de titular, cambio de CUPS (empieza por ES), cambio de comercializadora.

RESPONDE ÚNICAMENTE un JSON válido con esta forma exacta, sin texto adicional ni markdown:
{"ranges":[{"start":1,"end":3},{"start":4,"end":5}]}

Reglas:
- start y end son 1-indexados e inclusivos.
- Los rangos deben ser consecutivos y cubrir TODAS las páginas sin huecos ni solapes.
- Si solo hay una factura, devuelve un único rango cubriendo todas las páginas.

TEXTO POR PÁGINAS:
${pageSnippets}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      { model: 'gemini-flash-latest' },
      { apiVersion: 'v1beta' }
    );
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as { ranges?: Range[] };
    if (!parsed.ranges || !Array.isArray(parsed.ranges)) return null;
    return parsed.ranges.map(r => ({ start: Number(r.start), end: Number(r.end) }));
  } catch (err) {
    console.error('[split-invoices] Gemini segmentation failed:', err);
    return null;
  }
}

/**
 * Fallback for scanned PDFs (no extractable text): send the whole PDF to
 * Gemini as inlineData and ask it to return page ranges. Slower / more
 * expensive, so only used when pdf2json produced little to no text.
 */
async function segmentWithGeminiVision(buffer: Buffer, pageCount: number): Promise<Range[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Analiza este PDF que puede contener UNA o VARIAS facturas de energía (electricidad/gas) concatenadas.
El PDF tiene ${pageCount} páginas.
Devuelve ÚNICAMENTE un JSON con los rangos de páginas 1-indexados (inclusivos) de cada factura individual:
{"ranges":[{"start":1,"end":2},{"start":3,"end":3}]}
Los rangos deben ser consecutivos y cubrir todas las páginas.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      { model: 'gemini-flash-latest' },
      { apiVersion: 'v1beta' }
    );
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { data: buffer.toString('base64'), mimeType: 'application/pdf' } },
    ]);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as { ranges?: Range[] };
    if (!parsed.ranges || !Array.isArray(parsed.ranges)) return null;
    return parsed.ranges.map(r => ({ start: Number(r.start), end: Number(r.end) }));
  } catch (err) {
    console.error('[split-invoices] Gemini Vision segmentation failed:', err);
    return null;
  }
}

/**
 * Validate that a set of ranges is well-formed and covers [1..pageCount]
 * exactly. Anything off → we throw out the LLM output and fall back.
 */
function rangesAreValid(ranges: Range[], pageCount: number): boolean {
  if (!ranges.length) return false;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  if (sorted[0].start !== 1) return false;
  if (sorted[sorted.length - 1].end !== pageCount) return false;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (!Number.isInteger(r.start) || !Number.isInteger(r.end)) return false;
    if (r.start < 1 || r.end < r.start) return false;
    if (i > 0 && r.start !== sorted[i - 1].end + 1) return false;
  }
  return true;
}

/**
 * Heuristic segmentation used when LLM isn't needed or fails. Walks pages
 * and starts a new range every time a page looks like the first page of an
 * invoice. Never returns zero ranges.
 */
function heuristicSegment(pages: string[]): Range[] {
  const ranges: Range[] = [];
  let currentStart = 1;
  for (let i = 0; i < pages.length; i++) {
    const pageNo = i + 1;
    if (i === 0) continue; // first page always starts first invoice
    if (pageStartsInvoice(pages[i])) {
      ranges.push({ start: currentStart, end: pageNo - 1 });
      currentStart = pageNo;
    }
  }
  ranges.push({ start: currentStart, end: pages.length });
  return ranges;
}

export async function POST(req: Request) {
  const reqId = Math.random().toString(36).slice(2, 8);
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      // Non-PDFs always map to a single "range" — the caller will just pass
      // the file through unchanged.
      return NextResponse.json({ ranges: [{ start: 1, end: 1 }], count: 1, strategy: 'non-pdf' });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let pages: string[] = [];
    try {
      pages = await extractPagesText(buffer);
    } catch (err) {
      console.warn(`[split-invoices][${reqId}] pdf2json failed, will try vision:`, err);
    }

    const pageCount = pages.length;
    console.log(`[split-invoices][${reqId}] ${file.name}: ${pageCount} pages parsed`);

    // Scanned / unparseable PDFs → vision fallback.
    // Heuristic: if avg text length < 40 chars/page, treat as scanned.
    const totalTextLen = pages.reduce((n, p) => n + p.length, 0);
    const avgPerPage = pageCount > 0 ? totalTextLen / pageCount : 0;
    const isTextPoor = pageCount === 0 || avgPerPage < 40;

    if (isTextPoor) {
      // We can't count pages without text — ask pdf-lib. But that's a
      // client-side-only dep; do a minimal page-count via PDF header scan.
      // Fall back to a single range if everything else fails.
      const fallbackPageCount = pageCount || 1;
      console.log(`[split-invoices][${reqId}] text-poor PDF, trying vision segmentation (pages=${fallbackPageCount})`);
      const visionRanges = await segmentWithGeminiVision(buffer, fallbackPageCount);
      if (visionRanges && rangesAreValid(visionRanges, fallbackPageCount)) {
        return NextResponse.json({
          ranges: visionRanges,
          count: visionRanges.length,
          pageCount: fallbackPageCount,
          strategy: 'vision',
        });
      }
      return NextResponse.json({
        ranges: [{ start: 1, end: fallbackPageCount }],
        count: 1,
        pageCount: fallbackPageCount,
        strategy: 'fallback-single',
      });
    }

    // Single-page PDFs are always one invoice.
    if (pageCount === 1) {
      return NextResponse.json({
        ranges: [{ start: 1, end: 1 }],
        count: 1,
        pageCount: 1,
        strategy: 'single-page',
      });
    }

    // Cheap signal: count distinct CUPS + invoice-start markers.
    const distinctCups = collectDistinctCups(pages);
    const startMarkerPages = pages.reduce(
      (n, p) => n + (pageStartsInvoice(p) ? 1 : 0),
      0
    );

    console.log(
      `[split-invoices][${reqId}] distinctCUPS=${distinctCups.size} startMarkerPages=${startMarkerPages}`
    );

    // Very strong "single invoice" signal: exactly one CUPS and at most one
    // page with an invoice-start marker. Skip the LLM.
    if (distinctCups.size <= 1 && startMarkerPages <= 1) {
      return NextResponse.json({
        ranges: [{ start: 1, end: pageCount }],
        count: 1,
        pageCount,
        strategy: 'single-invoice-heuristic',
      });
    }

    // Otherwise we likely have multiple invoices. Ask Gemini for exact
    // boundaries; fall back to the per-page marker heuristic if it fails.
    const llmRanges = await segmentWithGeminiText(pages);
    if (llmRanges && rangesAreValid(llmRanges, pageCount)) {
      console.log(
        `[split-invoices][${reqId}] LLM segmentation: ${llmRanges.length} invoices`
      );
      return NextResponse.json({
        ranges: llmRanges,
        count: llmRanges.length,
        pageCount,
        strategy: 'llm-text',
      });
    }

    const heuristicRanges = heuristicSegment(pages);
    if (rangesAreValid(heuristicRanges, pageCount)) {
      console.log(
        `[split-invoices][${reqId}] heuristic segmentation: ${heuristicRanges.length} invoices`
      );
      return NextResponse.json({
        ranges: heuristicRanges,
        count: heuristicRanges.length,
        pageCount,
        strategy: 'heuristic',
      });
    }

    // Absolute last resort: one invoice.
    return NextResponse.json({
      ranges: [{ start: 1, end: pageCount }],
      count: 1,
      pageCount,
      strategy: 'fallback-single',
    });
  } catch (err) {
    console.error(`[split-invoices][${reqId}] error:`, err);
    return NextResponse.json(
      { error: 'No se pudo analizar el PDF para detectar múltiples facturas.' },
      { status: 500 }
    );
  }
}

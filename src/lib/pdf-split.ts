import { PDFDocument } from 'pdf-lib';

export interface SplitRange {
  start: number; // 1-indexed, inclusive
  end: number;   // 1-indexed, inclusive
}

/**
 * Ask the backend whether a PDF contains multiple invoices and, if so,
 * return the page ranges for each. Non-PDFs and errors collapse to a
 * single "whole file" range so the caller can treat the result uniformly.
 */
export async function detectInvoiceRanges(
  file: File
): Promise<{ ranges: SplitRange[]; count: number; strategy?: string }> {
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/split-invoices', { method: 'POST', body: fd });
    if (!res.ok) {
      console.warn('[pdf-split] detect endpoint failed:', res.status);
      return { ranges: [{ start: 1, end: 1 }], count: 1, strategy: 'fallback' };
    }
    const data = await res.json();
    if (!data.ranges || !Array.isArray(data.ranges) || data.ranges.length === 0) {
      return { ranges: [{ start: 1, end: 1 }], count: 1, strategy: 'fallback' };
    }
    return {
      ranges: data.ranges as SplitRange[],
      count: data.count ?? data.ranges.length,
      strategy: data.strategy,
    };
  } catch (err) {
    console.error('[pdf-split] detect error:', err);
    return { ranges: [{ start: 1, end: 1 }], count: 1, strategy: 'error' };
  }
}

/**
 * Slice a PDF File into N sub-PDFs, one per range. Output files are named
 * `${baseName}__factura-${i}.pdf` (1-indexed) so grouping downstream can
 * still fall back on filename prefixes when CUPS are missing.
 *
 * Returns the original file unchanged when the ranges list implies a single
 * invoice — no need to re-encode the PDF.
 */
export async function splitPdfByRanges(
  file: File,
  ranges: SplitRange[]
): Promise<File[]> {
  if (!ranges.length || ranges.length === 1) return [file];

  const srcBytes = new Uint8Array(await file.arrayBuffer());
  const srcPdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const totalPages = srcPdf.getPageCount();
  const baseName = file.name.replace(/\.pdf$/i, '');

  const outFiles: File[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i];
    // Clamp to valid bounds — the backend is supposed to validate, but we
    // double-check here so a bad response can't crash pdf-lib.
    const s = Math.max(1, Math.min(totalPages, Math.floor(start)));
    const e = Math.max(s, Math.min(totalPages, Math.floor(end)));
    const pageIndices: number[] = [];
    for (let p = s - 1; p <= e - 1; p++) pageIndices.push(p);

    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(srcPdf, pageIndices);
    copied.forEach(page => outDoc.addPage(page));
    const outBytes = await outDoc.save();

    const idx = String(i + 1).padStart(2, '0');
    const outName = `${baseName}__factura-${idx}.pdf`;
    // Use ArrayBuffer slice so TS/DOM don't complain about Uint8Array
    // not being a BlobPart under every TS lib config.
    const ab = outBytes.buffer.slice(
      outBytes.byteOffset,
      outBytes.byteOffset + outBytes.byteLength
    ) as ArrayBuffer;
    outFiles.push(new File([ab], outName, { type: 'application/pdf' }));
  }
  return outFiles;
}

/**
 * Convenience: for a list of PDF files, detect + split each and return the
 * flattened list of single-invoice Files. Non-PDF files and PDFs that
 * weren't identified as multi-invoice pass through unchanged.
 *
 * `onProgress` is called before each PDF is analysed so callers can show a
 * "Analizando PDFs…" indicator.
 */
export async function preSplitMultiInvoicePdfs(
  files: File[],
  onProgress?: (info: {
    index: number;
    total: number;
    fileName: string;
    detectedCount?: number;
  }) => void
): Promise<File[]> {
  const pdfs = files.filter(
    f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );
  const nonPdfs = files.filter(
    f => !(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
  );

  const result: File[] = [...nonPdfs];

  for (let i = 0; i < pdfs.length; i++) {
    const f = pdfs[i];
    onProgress?.({ index: i + 1, total: pdfs.length, fileName: f.name });
    try {
      const { ranges, count } = await detectInvoiceRanges(f);
      onProgress?.({ index: i + 1, total: pdfs.length, fileName: f.name, detectedCount: count });
      if (count <= 1) {
        result.push(f);
      } else {
        console.log(`[pdf-split] ${f.name} → ${count} facturas detectadas`);
        const split = await splitPdfByRanges(f, ranges);
        result.push(...split);
      }
    } catch (err) {
      console.error('[pdf-split] split failed, passing original through:', f.name, err);
      result.push(f);
    }
  }

  return result;
}

/**
 * PDF/HTML Report Generator with REAL DATA
 * 
 * ARCHITECTURE:
 * - /api/export-pdf?projectId=xxx -> Returns HTML (for preview/debugging)
 * - /api/export-pdf?projectId=xxx&format=pdf -> Returns PDF (using puppeteer-core + @sparticuz/chromium)
 * 
 * This route:
 * - Fetches REAL project data from Supabase using projectId
 * - Renders HTML with inline SVG charts (no React, no client JS)
 * - Uses explicit dimensions (no ResponsiveContainer)
 * - For PDF: Uses puppeteer-core with @sparticuz/chromium for serverless-compatible rendering
 * 
 * ERROR HANDLING:
 * - 400: Missing projectId
 * - 404: Project not found
 * - 500: Data fetch error or empty project
 * - 507: PDF generation failed (temporary - for debugging)
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchProjectById } from '@/lib/supabase-sync';
import { ExtractedBill, ProjectWorkspace, isGasBill } from '@/lib/types';
import { getMonthlyAggregatedData, CANONICAL_MONTHS } from '@/lib/date-utils';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const VOLTIS_CONTACT = {
  company: 'VOLTIS',
  email: 'admin@voltisenergia.com',
  phone: '747 47 43 60',
  website: 'www.voltisenergia.com'
};

const parseDate = (d?: string): Date | null => {
  if (!d) return null;
  if (d.includes('-')) {
    const ds = new Date(d);
    return isNaN(ds.getTime()) ? null : ds;
  }
  if (d.includes('/')) {
    const parts = d.split('/');
    if (parts.length < 3) return null;
    const [day, month, year] = parts.map(Number);
    const ds = new Date(year, month - 1, day);
    return isNaN(ds.getTime()) ? null : ds;
  }
  const ds = new Date(d);
  return isNaN(ds.getTime()) ? null : ds;
};

function getAssignedMonth(fechaInicio?: string, fechaFin?: string) {
  if (!fechaInicio && !fechaFin) return { month: 0, year: 2024 };

  const start = parseDate(fechaInicio);
  const end = parseDate(fechaFin);
  
  if (!start || !end) {
    const fallback = end || start;
    return fallback ? { month: fallback.getMonth(), year: fallback.getFullYear() } : { month: 0, year: 2024 };
  }
  
  const counts: Record<string, number> = {};
  const current = new Date(start);
  while (current <= end) {
    const key = `${current.getFullYear()}-${current.getMonth()}`;
    counts[key] = (counts[key] || 0) + 1;
    current.setDate(current.getDate() + 1);
  }
  
  let maxDays = 0;
  let winner = { month: start.getMonth(), year: start.getFullYear() };
  
  Object.keys(counts).sort().forEach(key => {
    if (counts[key] > maxDays) {
      maxDays = counts[key];
      const [y, m] = key.split('-').map(Number);
      winner = { month: m, year: y };
    }
  });
  
  return winner;
}

interface ProcessedData {
  bills: ExtractedBill[];
  projectName: string;
  cups: string;
  tarifa: string;
  chartData: any[];
  pieData: any[];
  summaryStats: { energetic: number; power: number; taxes: number; others: number; global: number; kwh: number; precioPromedio: number };
  matrixData: any[];
  periodData: any[];
  periodAverages: any[];
}

function processProjectData(project: { bills: ExtractedBill[]; customOCs: Record<string, any>; name: string }): ProcessedData {
  const validBills = project.bills.filter(b => b.status !== 'error');
  const sorted = [...validBills].sort((a, b) => {
    const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
    const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
    if (am.year !== bm.year) return am.year - bm.year;
    return am.month - bm.month;
  });

  const periods = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

  // CANONICAL 12-MONTH CHART DATA
  // Always returns exactly 12 entries, one per month
  const chartData = getMonthlyAggregatedData(sorted, project.customOCs);

  // Calculate totals from chart data
  const totals = {
    energetic: chartData.reduce((sum, m) => sum + m.energia, 0),
    power: chartData.reduce((sum, m) => sum + m.potencia, 0),
    taxes: chartData.reduce((sum, m) => sum + m.otros * 0.2, 0),
    others: chartData.reduce((sum, m) => sum + m.otros * 0.8, 0),
    global: chartData.reduce((sum, m) => sum + m.totalFactura, 0),
    kwh: chartData.reduce((sum, m) => sum + m.totalKwh, 0)
  };

  // Calculate period € spend and averages
  const periodTotals = periods.map(period => {
    let totalEur = 0;
    let totalKwh = 0;
    sorted.forEach(b => {
      const consumoItem = b.consumo?.find(c => c.periodo === period);
      if (consumoItem) {
        totalKwh += consumoItem.kwh || 0;
        // Check if explicit total cost exists, otherwise estimate
        if (consumoItem.total !== undefined && consumoItem.total > 0) {
          totalEur += consumoItem.total;
        } else if (consumoItem.precioKwh !== undefined && consumoItem.precioKwh > 0 && consumoItem.kwh > 0) {
          totalEur += consumoItem.kwh * consumoItem.precioKwh;
        }
      }
    });
    return { period, totalEur, totalKwh };
  });

  // Calculate period averages (€/kWh)
  const periodAverages = periodTotals.map(p => ({
    period: p.period,
    avgPrice: p.totalKwh > 0 ? p.totalEur / p.totalKwh : 0,
    totalEur: p.totalEur,
    totalKwh: p.totalKwh
  }));

  // New precioPromedio = average of period averages (excluding periods with 0 kWh)
  const validPeriods = periodAverages.filter(p => p.totalKwh > 0);
  const newPrecioPromedio = validPeriods.length > 0
    ? validPeriods.reduce((sum, p) => sum + p.avgPrice, 0) / validPeriods.length
    : 0;

  const pieData = [
    { name: 'Consumo', value: totals.energetic, color: '#3b82f6' },
    { name: 'Potencia', value: totals.power, color: '#8b5cf6' },
    { name: 'Impuestos', value: totals.taxes, color: '#10b981' },
    { name: 'Otros', value: totals.others, color: '#f59e0b' }
  ].filter(i => i.value > 0);

  const matrixData = sorted.map(b => {
    const energia = b.costeTotalConsumo || 0;
    const potencia = b.costeTotalPotencia || 0;
    let imp = 0, others = 0;
    [...(b.otrosConceptos || [])].forEach(oc => {
      if (oc.concepto?.toLowerCase().includes('impuesto') || oc.concepto?.toLowerCase().includes('iva')) imp += oc.total;
      else others += oc.total;
    });
    const totalF = energia + potencia + imp + others;
    const totalKwh = b.consumoTotalKwh || 0;
    const avgPrice = b.costeMedioKwh || (totalKwh > 0 ? energia / totalKwh : 0);

    // Calculate € spend per period for each bill
    const avgEnergyPrice = totalKwh > 0 ? energia / totalKwh : 0;
    const periodSpend = periods.map(period => {
      const consumoItem = b.consumo?.find(c => c.periodo === period);
      const kwh = consumoItem?.kwh || 0;
      let eur = 0;
      let isEstimated = false;
      if (consumoItem) {
        if (consumoItem.total !== undefined && consumoItem.total > 0) {
          eur = consumoItem.total;
        } else if (consumoItem.precioKwh !== undefined && consumoItem.precioKwh > 0 && kwh > 0) {
          eur = kwh * consumoItem.precioKwh;
        } else if (kwh > 0 && avgEnergyPrice > 0) {
          eur = kwh * avgEnergyPrice;
          isEstimated = true;
        }
      }
      return { eur, isEstimated };
    });

    return {
      id: b.id,
      name: (parseDate(b.fechaFin) || new Date()).toLocaleString('es-ES', { month: 'long' }),
      totalKwh,
      avgPrice,
      totalFactura: totalF,
      energia, potencia, otros: imp + others,
      consumo: b.consumo || [],
      periodSpend: {
        P1: { eur: periodSpend[0].eur, isEstimated: periodSpend[0].isEstimated },
        P2: { eur: periodSpend[1].eur, isEstimated: periodSpend[1].isEstimated },
        P3: { eur: periodSpend[2].eur, isEstimated: periodSpend[2].isEstimated },
        P4: { eur: periodSpend[3].eur, isEstimated: periodSpend[3].isEstimated },
        P5: { eur: periodSpend[4].eur, isEstimated: periodSpend[4].isEstimated },
        P6: { eur: periodSpend[5].eur, isEstimated: periodSpend[5].isEstimated },
        totalEur: periodSpend.reduce((sum, p) => sum + p.eur, 0)
      }
    };
  });

  // Period totals for the economic matrix
  const periodData = periods.map((period, idx) => ({
    period,
    totalEur: periodTotals[idx].totalEur,
    totalKwh: periodTotals[idx].totalKwh,
    avgPrice: periodAverages[idx].avgPrice
  }));

  const firstBill = sorted[0];
  return {
    bills: sorted,
    projectName: project.name || 'PROYECTO',
    cups: firstBill?.cups || 'N/A',
    tarifa: firstBill?.tarifa || '3.0TD',
    chartData,
    pieData,
    summaryStats: { ...totals, precioPromedio: newPrecioPromedio },
    matrixData,
    periodData,
    periodAverages,
  };
}

function generateBarChartSVG(chartData: any[]): string {
  if (!chartData || chartData.length === 0) {
    return '<svg width="750" height="280" viewBox="0 0 750 280"><text x="375" y="140" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-size="14">Sin datos disponibles</text></svg>';
  }
  
  // Use viewBox for proper scaling in PDF
  const viewBox = "0 0 750 280";
  const width = 750;
  const height = 280;
  const padding = { top: 20, right: 20, left: 55, bottom: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Get non-zero values for scaling
  const nonZeroValues = chartData.filter(d => d.totalFactura > 0).map(d => d.totalFactura);
  const maxValue = nonZeroValues.length > 0 ? Math.max(...nonZeroValues) * 1.15 : 100;
  const minValue = 0;
  
  const dataPoints = chartData.map((d, i) => {
    const x = padding.left + (i / (chartData.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.totalFactura - minValue) / (maxValue - minValue)) * chartHeight;
    return { x, y, value: d.totalFactura, label: d.label };
  });
  
  // Create smooth line path
  const linePath = dataPoints.map((p, i) => 
    i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
  ).join(' ');
  
  // Create area fill path
  const areaPath = `${linePath} L ${dataPoints[dataPoints.length - 1].x} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;
  
  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const y = padding.top + chartHeight - (chartHeight * pct);
    const value = (maxValue * pct).toLocaleString('es-ES', { maximumFractionDigits: 0 });
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
            <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="rgba(255,255,255,0.4)" font-size="9" font-weight="600">${value}</text>`;
  }).join('');
  
  // Data points (circles)
  const points = dataPoints.map(p => 
    `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#3b82f6" stroke="#6366f1" stroke-width="2"/>`
  ).join('');
  
  // X-axis labels (only show every other month to avoid crowding)
  const xLabels = chartData.map((d, i) => {
    // Show first, middle, and last labels to avoid crowding
    if (i === 0 || i === Math.floor(chartData.length / 2) || i === chartData.length - 1) {
      const x = padding.left + (i / (chartData.length - 1 || 1)) * chartWidth;
      const y = height - 10;
      return `<text x="${x}" y="${y}" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-size="10" font-weight="600">${d.label}</text>`;
    }
    return '';
  }).join('');
  
  // Y-axis line
  const yAxisLine = `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  
  // X-axis baseline
  const baseline = padding.top + chartHeight;
  const xAxisLine = `<line x1="${padding.left}" y1="${baseline}" x2="${width - padding.right}" y2="${baseline}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  
  return `<svg width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.3"/>
        <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0"/>
      </linearGradient>
      <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#3b82f6"/>
        <stop offset="100%" stop-color="#6366f1"/>
      </linearGradient>
    </defs>
    ${gridLines}
    ${yAxisLine}
    ${xAxisLine}
    <path d="${areaPath}" fill="url(#lineGrad)" />
    <path d="${linePath}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${points}
    ${xLabels}
  </svg>`;
}

function generatePieChartSVG(pieData: any[], total: number): string {
  if (!pieData || pieData.length === 0 || total === 0) {
    return '<svg width="200" height="200"><circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="30"/></svg>';
  }
  
  const cx = 100, cy = 100, innerRadius = 50, outerRadius = 90;
  const width = 200, height = 200;
  
  let currentAngle = -90;
  const paths = pieData.map((item, i) => {
    const percentage = item.value / total;
    const angle = percentage * 360;
    if (angle < 1) return '';
    const startAngle = currentAngle;
    const endAngle = currentAngle + Math.min(angle, 359.99);
    currentAngle = endAngle;
    
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    const x1 = cx + outerRadius * Math.cos(startRad);
    const y1 = cy + outerRadius * Math.sin(startRad);
    const x2 = cx + outerRadius * Math.cos(endRad);
    const y2 = cy + outerRadius * Math.sin(endRad);
    const x3 = cx + innerRadius * Math.cos(endRad);
    const y3 = cy + innerRadius * Math.sin(endRad);
    const x4 = cx + innerRadius * Math.cos(startRad);
    const y4 = cy + innerRadius * Math.sin(startRad);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    return `<path d="M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z" fill="${item.color}"/>`;
  }).join('');
  
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${paths}
  </svg>`;
}

function getTop3Indices(values: number[]): Set<number> {
  const indexed = values.map((v, i) => ({ v, i }));
  const sorted = indexed.sort((a, b) => b.v - a.v);
  const top3 = new Set<number>();
  sorted.slice(0, 3).forEach(item => {
    if (item.v > 0) top3.add(item.i);
  });
  return top3;
}

/**
 * Convert HTML to PDF using puppeteer-core + @sparticuz/chromium
 * Serverless-compatible Chromium for Vercel
 * Falls back to local Chrome/Chromium for local development
 */
async function generatePDF(html: string): Promise<Buffer> {
  let browser;
  
  // Try @sparticuz/chromium first (for Vercel serverless)
  try {
    if (typeof process !== 'undefined') {
      process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs22.x';
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sparticuz: any = await import('@sparticuz/chromium');
    const sparticuzModule = sparticuz.default || sparticuz;
    
    if (sparticuzModule.setGraphicsMode) {
      sparticuzModule.setGraphicsMode(false);
    }
    
    const executablePath = await sparticuzModule.executablePath();
    const chromiumArgs = sparticuzModule.args || [];
    
    browser = await puppeteer.launch({
      executablePath,
      args: [...chromiumArgs, '--disable-gpu', '--disable-setuid-sandbox', '--no-sandbox'],
      headless: true,
    });
  } catch (serverlessError) {
    console.log('[Export-PDF] Serverless Chromium not available, trying local fallback...');
    
    // Fallback for local development - try common local Chrome paths
    const localPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      process.env.CHROME_PATH,
    ].filter(Boolean);
    
    let localBrowser = null;
    for (const chromePath of localPaths) {
      try {
        localBrowser = await puppeteer.launch({
          executablePath: chromePath,
          args: ['--disable-gpu', '--disable-setuid-sandbox', '--no-sandbox'],
          headless: true,
        });
        console.log(`[Export-PDF] Using local Chrome at: ${chromePath}`);
        break;
      } catch (e) {
        // Try next path
      }
    }
    
    if (!localBrowser) {
      throw new Error('No Chromium executable found. Please install Chrome/Chromium or deploy to Vercel.');
    }
    
    browser = localBrowser;
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });
    
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

interface PDFExportBody {
  projectId: string;
  projectName?: string;
  bills: ExtractedBill[];
  customOCs?: Record<string, any>;
  format?: 'html' | 'pdf';
  energyType?: 'electricity' | 'gas'; // Optional filter for specific energy type
}

async function getProjectData(projectId: string, body?: PDFExportBody): Promise<{ project: ProjectWorkspace; format: 'html' | 'pdf' } | { error: string; status: number }> {
  let format: 'html' | 'pdf' = 'html';
  
  if (body) {
    format = body.format === 'pdf' ? 'pdf' : 'html';
    
    if (!body.bills || body.bills.length === 0) {
      return { error: 'No bills to export', status: 400 };
    }
    
    const project: ProjectWorkspace = {
      id: body.projectId,
      name: body.projectName || 'PROYECTO',
      updatedAt: Date.now(),
      bills: body.bills,
      customOCs: body.customOCs || {}
    };
    
    console.log(`[Export-PDF] Using bills from request body: ${body.bills.length} bills`);
    return { project, format };
  }
  
  const dbProject = await fetchProjectById(projectId);

  if (!dbProject) {
    return { error: `Project not found: ${projectId}`, status: 404 };
  }

  if (!dbProject.bills || dbProject.bills.length === 0) {
    return { error: 'Project has no bills to export', status: 400 };
  }
  
  console.log(`[Export-PDF] Fetching from DB: ${dbProject.bills.length} bills`);
  return { project: dbProject, format };
}

export async function POST(req: NextRequest) {
  try {
    const body: PDFExportBody = await req.json();
    
    if (!body.projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    
    if (!body.bills || body.bills.length === 0) {
      return NextResponse.json({ error: 'bills array is required' }, { status: 400 });
    }
    
    // Filter bills by energyType if specified
    let filteredBills = body.bills;
    if (body.energyType) {
      filteredBills = body.bills.filter(b => 
        body.energyType === 'gas' ? isGasBill(b) : !isGasBill(b)
      );
      console.log(`[Export-PDF] Filtered to ${filteredBills.length} ${body.energyType} bills`);
    }
    
    if (filteredBills.length === 0) {
      return NextResponse.json({ error: `No ${body.energyType || 'energy'} bills found` }, { status: 400 });
    }
    
    console.log(`[Export-PDF] POST: Processing ${filteredBills.length} bills for project: ${body.projectId}`);
    
    // Check if we have gas bills and route accordingly
    const hasGasBills = filteredBills.some(b => isGasBill(b));
    const isElectricity = !hasGasBills;
    
    const project: ProjectWorkspace = {
      id: body.projectId,
      name: body.projectName || 'PROYECTO',
      updatedAt: Date.now(),
      bills: filteredBills,
      customOCs: body.customOCs || {}
    };
    
    const format = body.format === 'pdf' ? 'pdf' : 'html';
    const isGas = hasGasBills;
    
    if (format === 'html') {
      return generateHTMLResponse(project, isGas);
    }
    
    return generatePDFResponse(project, isGas);
    
  } catch (e) {
    console.error('[Export-PDF] POST error:', e);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const format = searchParams.get('format');
  const energyType = searchParams.get('energyType');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  console.log(`[Export-PDF] GET: Fetching project: ${projectId}, energyType: ${energyType || 'all'}`);

  const result = await getProjectData(projectId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  let filteredBills = result.project.bills;
  if (energyType === 'gas') {
    filteredBills = filteredBills.filter(b => isGasBill(b));
  } else if (energyType === 'electricity') {
    filteredBills = filteredBills.filter(b => !isGasBill(b));
  }

  if (filteredBills.length === 0) {
    return NextResponse.json({ error: `No ${energyType || 'energy'} bills found` }, { status: 400 });
  }

  const filteredProject = { ...result.project, bills: filteredBills };
  const isGas = energyType === 'gas' || (filteredBills.length > 0 && filteredBills.every(b => isGasBill(b)));

  return generateHTMLResponse(filteredProject, isGas);
}

async function generatePDFResponse(project: ProjectWorkspace, isGas: boolean = false): Promise<NextResponse> {
  console.log(`[Export-PDF] Generating ${isGas ? 'GAS' : 'ELECTRICITY'} PDF for project: ${project.name}`);
  const html = isGas ? generateGasReportHTML(project) : generateReportHTML(project);
  
  try {
    const pdfBuffer = await generatePDF(html);
    console.log(`[Export-PDF] PDF generated: ${pdfBuffer.length} bytes`);
    const filename = isGas ? `Voltis_Gas_Report_${project.id}.pdf` : `Voltis_Report_${project.id}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[Export-PDF] PDF generation failed:', error);
    return NextResponse.json({ error: 'PDF generation failed', details: error.message }, { status: 507 });
  }
}

async function generateHTMLResponse(project: ProjectWorkspace, isGas: boolean = false): Promise<NextResponse> {
  const html = isGas ? generateGasReportHTML(project) : generateReportHTML(project);
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

function generateReportHTML(project: ProjectWorkspace): string {
  console.log(`[Export-PDF] Processing ${project.bills.length} bills for project: ${project.name}`);
  const data = processProjectData(project);

  // Note: Bar chart removed from PDF - only in interactive app (ReportView.tsx)
  const pieChartSVG = generatePieChartSVG(data.pieData, data.summaryStats.global);

  const kwhValues = data.matrixData.map(r => r.totalKwh);
  const priceValues = data.matrixData.map(r => r.avgPrice);
  const costValues = data.matrixData.map(r => r.totalFactura);
  const top3Kwh = getTop3Indices(kwhValues);
  const top3Price = getTop3Indices(priceValues);
  const top3Cost = getTop3Indices(costValues);

  const matrixEnergeticaRows = data.matrixData.map((row, idx) => `
    <tr>
      <td style="text-align:left">${row.name}</td>
      ${[1,2,3,4,5,6].map(p => {
        const c = row.consumo.find((c: any) => c.periodo === `P${p}`);
        return `<td>${c ? c.kwh?.toFixed(0) : '-'}</td>`;
      }).join('')}
      <td class="${top3Kwh.has(idx) ? 'highlight-top3' : ''}">${row.totalKwh.toFixed(0)}</td>
    </tr>
  `).join('');

  // Calculate totals for the energy matrix
  const totals = data.matrixData.length > 0 ? {
    P1: data.matrixData.reduce((sum, row) => {
      const c = row.consumo.find((x: any) => x.periodo === 'P1');
      return sum + (c?.kwh || 0);
    }, 0),
    P2: data.matrixData.reduce((sum, row) => {
      const c = row.consumo.find((x: any) => x.periodo === 'P2');
      return sum + (c?.kwh || 0);
    }, 0),
    P3: data.matrixData.reduce((sum, row) => {
      const c = row.consumo.find((x: any) => x.periodo === 'P3');
      return sum + (c?.kwh || 0);
    }, 0),
    P4: data.matrixData.reduce((sum, row) => {
      const c = row.consumo.find((x: any) => x.periodo === 'P4');
      return sum + (c?.kwh || 0);
    }, 0),
    P5: data.matrixData.reduce((sum, row) => {
      const c = row.consumo.find((x: any) => x.periodo === 'P5');
      return sum + (c?.kwh || 0);
    }, 0),
    P6: data.matrixData.reduce((sum, row) => {
      const c = row.consumo.find((x: any) => x.periodo === 'P6');
      return sum + (c?.kwh || 0);
    }, 0),
    totalKwh: data.matrixData.reduce((sum, row) => sum + (row.totalKwh || 0), 0),
  } : null;

  const matrixEnergeticaTotalsRow = totals ? `
    <tr style="background: rgba(59, 130, 246, 0.1); border-top: 2px solid rgba(59, 130, 246, 0.4);">
      <td style="text-align:left; font-weight: 900; color: #3b82f6;">TOTAL</td>
      <td style="font-weight: 900; color: #3b82f6;">${totals.P1.toFixed(0)}</td>
      <td style="font-weight: 900; color: #3b82f6;">${totals.P2.toFixed(0)}</td>
      <td style="font-weight: 900; color: #3b82f6;">${totals.P3.toFixed(0)}</td>
      <td style="font-weight: 900; color: #3b82f6;">${totals.P4.toFixed(0)}</td>
      <td style="font-weight: 900; color: #3b82f6;">${totals.P5.toFixed(0)}</td>
      <td style="font-weight: 900; color: #3b82f6;">${totals.P6.toFixed(0)}</td>
      <td style="font-weight: 900; color: #3b82f6;">${totals.totalKwh.toFixed(0)}</td>
    </tr>
  ` : '';

  const matrixCosteRows = data.matrixData.map((row, idx) => `
    <tr>
      <td style="text-align:left">${row.name}</td>
      ${[1,2,3,4,5,6].map(p => {
        const c = row.consumo.find((c: any) => c.periodo === `P${p}`);
        return `<td>${c ? c.precioKwh?.toFixed(3) : '-'}</td>`;
      }).join('')}
      <td class="${top3Price.has(idx) ? 'highlight-top3' : ''}">${row.avgPrice.toFixed(3)}</td>
    </tr>
  `).join('');

  // Matriz Económica Integral - € por Periodo
  const matrixEconomicaRows = data.matrixData.map((row, idx) => `
    <tr>
      <td style="text-align:left">${row.name}</td>
      ${['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(period => {
        const ps = row.periodSpend?.[period];
        const value = ps?.eur || 0;
        const isEstimated = ps?.isEstimated || false;
        return `<td style="${isEstimated ? 'color: #facc15;' : ''}">${value > 0 ? value.toFixed(2) : '-'}</td>`;
      }).join('')}
      <td>${row.periodSpend?.totalEur?.toFixed(2) || '0.00'}</td>
    </tr>
  `).join('');

  // Totals for Matriz Económica Integral
  const matrixEconomicaTotals = data.periodData ? `
    <tr style="background: rgba(99, 102, 241, 0.1); border-top: 2px solid rgba(99, 102, 241, 0.4);">
      <td style="text-align:left; font-weight: 900; color: #818cf8;">TOTAL</td>
      ${['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((period, idx) => `
        <td style="font-weight: 900; color: #818cf8;">${data.periodData[idx]?.totalEur > 0 ? data.periodData[idx]?.totalEur.toFixed(2) : '-'}</td>
      `).join('')}
      <td style="font-weight: 900; color: #818cf8;">${data.periodData.reduce((sum, p) => sum + p.totalEur, 0).toFixed(2)}</td>
    </tr>
  ` : '';

  const pieLegend = data.pieData.map(item => `
    <div class="legend-item">
      <div style="display:flex;align-items:center">
        <div class="legend-dot" style="background:${item.color}"></div>
        <span class="legend-text">${item.name}</span>
      </div>
      <span class="legend-value">${((item.value / data.summaryStats.global) * 100).toFixed(1)}%</span>
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voltis - ${data.projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #020617; font-family: system-ui, -apple-system, sans-serif; color: white; }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      background: #020617;
      padding: 15mm;
      box-sizing: border-box;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .page-chart-split {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
    }
    
    .page:last-child { page-break-after: auto; }
    
    .glass {
      background: rgba(15, 23, 42, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 20px;
    }
    
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #3b82f6;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-bottom: 6px;
    }
    
    .section-heading {
      font-size: 22px;
      font-weight: 800;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.01em;
      margin-bottom: 16px;
    }
    
    /* KPI DASHBOARD - Vertical stacked layout */
    .kpi-dashboard {
      display: flex;
      flex-direction: column;
      gap: 24px;
      flex: 1;
      justify-content: center;
      max-width: 400px;
      margin: 0 auto;
      width: 100%;
    }
    
    .kpi-block {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 24px;
      padding: 32px 40px;
      text-align: center;
    }
    
    .kpi-block-label {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-bottom: 12px;
    }
    
    .kpi-block-value {
      font-size: 48px;
      font-weight: 900;
      color: white;
      line-height: 1;
    }
    
    .kpi-block-unit {
      font-size: 14px;
      font-weight: 500;
      color: #3b82f6;
      margin-top: 8px;
    }
    
    .kpi-grid-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    
    .kpi-block-sm {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 20px;
      padding: 24px 32px;
      text-align: center;
    }
    
    .kpi-block-sm .kpi-block-value {
      font-size: 36px;
    }
    
    /* Chart styles */
    .chart-section {
      margin-bottom: 32px;
    }
    
    .chart-container {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .chart-container svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    
    .chart-container-full {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .chart-container-full svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    
    .charts-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
      flex: 1;
    }
    
    .bio-section {
      display: flex;
      gap: 32px;
      align-items: stretch;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 24px;
    }
    
    .pie-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 200px;
    }
    
    .pie-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .pie-total {
      font-size: 20px;
      font-weight: 800;
      margin-top: 12px;
      color: white;
    }
    
    .pie-legend {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .legend-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    
    .legend-text {
      font-size: 13px;
      font-weight: 500;
      color: rgba(255,255,255,0.8);
      margin-left: 12px;
    }
    
    .legend-value {
      font-size: 14px;
      font-weight: 700;
      color: #3b82f6;
    }
    
    /* Table styles - optimized */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 11px;
    }
    
    th {
      padding: 12px 14px;
      font-size: 9px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 2px solid rgba(59, 130, 246, 0.3);
      text-align: right;
      background: rgba(15, 23, 42, 0.3);
    }
    
    th:first-child { text-align: left; }
    
    td {
      padding: 10px 14px;
      font-size: 11px;
      font-weight: 500;
      color: rgba(255,255,255,0.7);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      text-align: right;
    }
    
    td:first-child { 
      text-align: left; 
      color: rgba(255,255,255,0.9);
      font-weight: 600;
    }
    
    td.highlight-top3 {
      font-weight: 800;
      color: #ef4444;
      background: rgba(239, 68, 68, 0.12);
    }
    
    /* Cover page - premium */
    .cover {
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 297mm;
    }
    
    .cover-content {
      max-width: 180mm;
    }
    
    .logo {
      font-size: 64px;
      font-weight: 900;
      letter-spacing: 0.04em;
      color: #3b82f6;
      text-shadow: 0 0 80px rgba(59, 130, 246, 0.5);
      margin-bottom: 8px;
    }
    
    .logo-sub {
      font-size: 16px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      letter-spacing: 0.15em;
      margin-bottom: 48px;
    }
    
    .divider {
      height: 3px;
      width: 80px;
      background: linear-gradient(90deg, #3b82f6, #06b6d4);
      margin: 0 auto 40px;
      border-radius: 2px;
    }
    
    .project-name {
      font-size: 36px;
      font-weight: 800;
      color: white;
      margin-bottom: 32px;
      letter-spacing: -0.01em;
    }
    
    .cups-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      color: white;
      padding: 14px 28px;
      border: 1px solid rgba(59, 130, 246, 0.4);
      border-radius: 30px;
      letter-spacing: 0.08em;
      margin-bottom: 20px;
      background: rgba(59, 130, 246, 0.1);
    }
    
    .tarifa {
      font-size: 11px;
      color: #3b82f6;
      letter-spacing: 0.15em;
      margin-top: 12px;
      font-weight: 600;
    }
    
    .footer-note {
      font-size: 9px;
      color: rgba(255,255,255,0.3);
      letter-spacing: 0.15em;
      margin-top: 100px;
      font-weight: 500;
    }
    
    /* Closing page - premium */
    .closing {
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 297mm;
    }
    
    .closing-container {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 24px;
      padding: 60px 80px;
      max-width: 600px;
      width: 100%;
      box-sizing: border-box;
    }
    
    .closing-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .closing-company {
      font-size: 56px;
      font-weight: 900;
      color: #3b82f6;
      letter-spacing: 0.05em;
      margin-bottom: 32px;
      text-shadow: 0 0 40px rgba(59, 130, 246, 0.4);
    }
    
    .closing-contact {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 48px;
      padding: 24px 32px;
      background: rgba(15, 23, 42, 0.4);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      width: 100%;
    }
    
    .contact-item {
      font-size: 16px;
      color: rgba(255,255,255,0.8);
      font-weight: 500;
      padding: 8px 0;
    }
    
    .closing-footer {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      letter-spacing: 0.2em;
      font-weight: 500;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <!-- PAGE 1: COVER -->
  <div class="page cover">
    <div class="cover-content">
      <div class="logo">VOLTIS</div>
      <div class="logo-sub">ANUAL ECONOMICS</div>
      <div class="divider"></div>
      <div class="project-name">${data.projectName}</div>
      <div class="cups-badge">CUPS · ${data.cups}</div>
      <div class="tarifa">TARIFA ${data.tarifa}</div>
      <div class="footer-note">INFORME DE AUDITORÍA ENERGÉTICA</div>
    </div>
  </div>

  <!-- PAGE 2: KPIs - Dashboard Style -->
  <div class="page">
    <div class="section-title">Métricas Auditadas</div>
    <div class="section-heading">Resultados Anuales</div>
    
    <div class="kpi-dashboard">
      <div class="kpi-block">
        <div class="kpi-block-label">Facturación Global</div>
        <div class="kpi-block-value">${data.summaryStats.global.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
        <div class="kpi-block-unit">EUR</div>
      </div>
      
      <div class="kpi-block">
        <div class="kpi-block-label">Energía Total Consumida</div>
        <div class="kpi-block-value">${data.summaryStats.kwh.toLocaleString('es-ES')}</div>
        <div class="kpi-block-unit">kWh</div>
      </div>
      
      <div class="kpi-grid-row">
        <div class="kpi-block-sm">
          <div class="kpi-block-label">Precio Promedio</div>
          <div class="kpi-block-value">${data.summaryStats.precioPromedio.toLocaleString('es-ES', { minimumFractionDigits: 4 })}</div>
          <div class="kpi-block-unit">EUR/kWh</div>
        </div>
        <div class="kpi-block-sm">
          <div class="kpi-block-label">Documentos Procesados</div>
          <div class="kpi-block-value">${data.bills.length}</div>
          <div class="kpi-block-unit">FACTURAS</div>
        </div>
      </div>
    </div>
    
    <!-- Precio Promedio por Periodo -->
    <div style="margin-top: 20px; padding: 12px 16px; background: rgba(20, 184, 166, 0.1); border: 1px solid rgba(20, 184, 166, 0.3); border-radius: 8px;">
      <div style="font-size: 9px; font-weight: 900; color: #14b8a6; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Precio Medio por Periodo</div>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        ${data.periodAverages.map(p => `
          <div style="text-align: center; min-width: 50px;">
            <div style="font-size: 11px; font-weight: 900; color: #14b8a6;">${p.period}</div>
            <div style="font-size: 10px; color: ${p.totalKwh > 0 ? '#fff' : '#666'};">${p.totalKwh > 0 ? p.avgPrice.toFixed(4) : '-'} €/kWh</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <!-- PAGE 3: CHARTS - Line Chart + Bio-Estructura -->
  <div class="page">
    <div style="display: flex; flex-direction: column; flex: 1;">
      <div class="section-title">Análisis Temporal</div>
      <div class="section-heading">Evolución del Gasto Mensual</div>
      <div class="chart-container-full" style="flex: 1; min-height: 0;">
        ${generateBarChartSVG(data.chartData)}
      </div>
      
      <div class="section-title" style="margin-top: 16px;">Análisis Estructural</div>
      <div class="section-heading">Bio-Estructura Económica</div>
      <div class="bio-section" style="flex: 1; min-height: 180px;">
        <div class="pie-container">
          <div class="pie-center">
            ${pieChartSVG}
            <div class="pie-total">
              ${data.summaryStats.global.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€
            </div>
          </div>
        </div>
        <div class="pie-legend">
          ${pieLegend}
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 4: MATRIX ENERGÉTICA -->
  <div class="page">
    <div class="section-title">Engineering Matrix</div>
    <div class="section-heading">Matriz Energética Mensual (kWh)</div>
    
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th>P1</th>
          <th>P2</th>
          <th>P3</th>
          <th>P4</th>
          <th>P5</th>
          <th>P6</th>
          <th>Total kWh</th>
        </tr>
      </thead>
      <tbody>
        ${matrixEnergeticaRows}
      </tbody>
      ${totals ? `<tfoot>${matrixEnergeticaTotalsRow}</tfoot>` : ''}
    </table>
  </div>

  <!-- PAGE 5: MATRIX COSTE -->
  <div class="page">
    <div class="section-title">Engineering Matrix</div>
    <div class="section-heading">Matriz de Coste x Periodo (€/kWh)</div>
    
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th>P1</th>
          <th>P2</th>
          <th>P3</th>
          <th>P4</th>
          <th>P5</th>
          <th>P6</th>
          <th>Precio Medio</th>
        </tr>
      </thead>
      <tbody>
        ${matrixCosteRows}
      </tbody>
    </table>
  </div>

  <!-- PAGE 6: MATRIX ECONÓMICA -->
  <div class="page">
    <div class="section-title">Engineering Matrix</div>
    <div class="section-heading">Matriz Económica Integral (€ por Periodo)</div>
    
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th>P1</th>
          <th>P2</th>
          <th>P3</th>
          <th>P4</th>
          <th>P5</th>
          <th>P6</th>
          <th>Total €</th>
        </tr>
      </thead>
      <tbody>
        ${matrixEconomicaRows}
      </tbody>
      ${matrixEconomicaTotals ? `<tfoot>${matrixEconomicaTotals}</tfoot>` : ''}
    </table>
    <div style="margin-top: 12px; font-size: 9px; color: #facc15; text-transform: uppercase; letter-spacing: 0.05em;">Valores en amarillo son estimados (kWh × precio medio energia)</div>
  </div>

  <!-- PAGE 7: CLOSING -->
  <div class="page closing">
    <div class="closing-container">
      <div class="closing-content">
        <div class="closing-company">${VOLTIS_CONTACT.company}</div>
        <div class="closing-contact">
          <div class="contact-item">${VOLTIS_CONTACT.email}</div>
          <div class="contact-item">${VOLTIS_CONTACT.phone}</div>
          <div class="contact-item">${VOLTIS_CONTACT.website}</div>
        </div>
        <div class="closing-footer">VOLTIS · INFORME ECONÓMICO ANUAL</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

function generateGasReportHTML(project: ProjectWorkspace): string {
  console.log(`[Export-PDF] Processing ${project.bills.length} GAS bills for project: ${project.name}`);
  
  const validBills = project.bills.filter(b => b.status !== 'error' && isGasBill(b));
  const sorted = [...validBills].sort((a, b) => {
    const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
    const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
    if (am.year !== bm.year) return am.year - bm.year;
    return am.month - bm.month;
  });

  const months = CANONICAL_MONTHS.map((label, i) => ({
    monthIndex: i,
    label,
    kwh: 0,
    eur: 0,
    year: 0,
  }));

  let totalKwh = 0;
  let totalEur = 0;
  let totalTerminoFijo = 0;
  let totalImpuesto = 0;
  let totalAlquiler = 0;
  let totalIva = 0;
  let adjustedCount = 0;

  sorted.forEach(b => {
    const { month, year } = getAssignedMonth(b.fechaInicio, b.fechaFin);
    if (month < 0 || month > 11) return;

    const kwh = b.gasConsumption?.kwh || 0;
    const eur = b.totalFactura || 0;
    const terminoFijo = b.gasPricing?.terminoFijoTotal || 0;
    const impuesto = b.gasPricing?.impuestoHidrocarbTotal || 0;
    const alquiler = b.gasPricing?.alquilerTotal || 0;
    const iva = b.gasPricing?.ivaTotal || 0;

    months[month].kwh += kwh;
    months[month].eur += eur;
    months[month].year = year;

    totalKwh += kwh;
    totalEur += eur;
    totalTerminoFijo += terminoFijo;
    totalImpuesto += impuesto;
    totalAlquiler += alquiler;
    totalIva += iva;

    if (b.gasAdjustments && b.gasAdjustments.length > 0) {
      adjustedCount++;
    }
  });

  const avgPrice = totalKwh > 0 ? totalEur / totalKwh : 0;
  const cups = sorted[0]?.cups || 'N/A';
  const tarifa = sorted[0]?.tarifaRL || 'RL.1';

  const pieData = [
    { name: 'Consumo Gas', value: Math.max(0, totalEur - totalTerminoFijo - totalImpuesto - totalAlquiler - totalIva), color: '#f97316' },
    { name: 'Término Fijo', value: totalTerminoFijo, color: '#fb923c' },
    { name: 'Impuesto Hidrocarb.', value: totalImpuesto, color: '#fbbf24' },
    { name: 'IVA', value: totalIva, color: '#a78bfa' },
    { name: 'Alquiler', value: totalAlquiler, color: '#facc15' },
  ].filter(i => i.value > 0);

  const tableRows = sorted.map(b => {
    const { month, year } = getAssignedMonth(b.fechaInicio, b.fechaFin);
    const kwh = b.gasConsumption?.kwh || 0;
    const precioKwh = b.gasPricing?.precioKwh;
    const precioEstimated = b.gasPricing?.precioKwhEstimated;
    const terminoFijo = b.gasPricing?.terminoFijoTotal || 0;
    const impuesto = b.gasPricing?.impuestoHidrocarbTotal || 0;
    const alquiler = b.gasPricing?.alquilerTotal || 0;
    const iva = b.gasPricing?.ivaTotal || 0;
    const total = b.totalFactura || 0;
    const hasAdjustments = (b.gasAdjustments?.length || 0) > 0;

    const SHORT_MONTHS: Record<number, string> = {
      0: 'Ene', 1: 'Feb', 2: 'Mar', 3: 'Abr', 4: 'May', 5: 'Jun',
      6: 'Jul', 7: 'Ago', 8: 'Sep', 9: 'Oct', 10: 'Nov', 11: 'Dic'
    };

    return {
      name: `${SHORT_MONTHS[month]} ${year}`,
      kwh,
      m3: b.gasConsumption?.m3,
      factor: b.gasConsumption?.factorConversion,
      precioKwh,
      precioEstimated,
      terminoFijo,
      impuesto,
      alquiler,
      iva,
      total,
      hasAdjustments,
      tarifaRL: b.tarifaRL || '-',
    };
  });

  const tableTotals = {
    kwh: tableRows.reduce((sum, r) => sum + r.kwh, 0),
    terminoFijo: tableRows.reduce((sum, r) => sum + r.terminoFijo, 0),
    impuesto: tableRows.reduce((sum, r) => sum + r.impuesto, 0),
    alquiler: tableRows.reduce((sum, r) => sum + r.alquiler, 0),
    iva: tableRows.reduce((sum, r) => sum + r.iva, 0),
    total: tableRows.reduce((sum, r) => sum + r.total, 0),
  };

  const pieChartSVG = generatePieChartSVG(pieData, totalEur);
  const barChartSVG = generateBarChartSVG(months.map(m => ({ label: m.label, totalFactura: m.eur, totalKwh: m.kwh })));

  const pieLegend = pieData.map(item => `
    <div class="legend-item">
      <div style="display:flex;align-items:center">
        <div class="legend-dot" style="background:${item.color}"></div>
        <span class="legend-text">${item.name}</span>
      </div>
      <span class="legend-value">${((item.value / totalEur) * 100).toFixed(1)}%</span>
    </div>
  `).join('');

  const tableRowsHTML = tableRows.map(row => `
    <tr>
      <td style="text-align:left">
        ${row.name}
        ${row.hasAdjustments ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#facc15;margin-left:6px;vertical-align:middle;" title="Factura con ajustes/regularizaciones"></span>' : ''}
      </td>
      <td style="text-align:center">${row.tarifaRL}</td>
      <td>${row.kwh > 0 ? row.kwh.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : '-'}</td>
      <td>${row.m3 ? row.m3.toLocaleString('es-ES') : '-'}</td>
      <td>${row.factor ? row.factor.toFixed(4) : '-'}</td>
      <td style="${row.precioEstimated ? 'color: #facc15;' : ''}">${row.precioKwh ? row.precioKwh.toFixed(4) : '-'}</td>
      <td>${row.terminoFijo > 0 ? row.terminoFijo.toFixed(2) : '-'}</td>
      <td>${row.impuesto > 0 ? row.impuesto.toFixed(2) : '-'}</td>
      <td>${row.alquiler > 0 ? row.alquiler.toFixed(2) : '-'}</td>
      <td>${row.iva > 0 ? row.iva.toFixed(2) : '-'}</td>
      <td style="font-weight: 800; color: #f97316;">${row.total.toFixed(2)}</td>
    </tr>
  `).join('');

  const tableTotalsHTML = `
    <tr style="background: rgba(249, 115, 22, 0.15); border-top: 2px solid rgba(249, 115, 22, 0.5);">
      <td style="text-align:left; font-weight: 900; color: #f97316;">TOTAL</td>
      <td></td>
      <td style="font-weight: 900; color: #f97316;">${tableTotals.kwh.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</td>
      <td></td>
      <td></td>
      <td></td>
      <td style="font-weight: 900; color: #f97316;">${tableTotals.terminoFijo > 0 ? tableTotals.terminoFijo.toFixed(2) : '-'}</td>
      <td style="font-weight: 900; color: #f97316;">${tableTotals.impuesto > 0 ? tableTotals.impuesto.toFixed(2) : '-'}</td>
      <td style="font-weight: 900; color: #f97316;">${tableTotals.alquiler > 0 ? tableTotals.alquiler.toFixed(2) : '-'}</td>
      <td style="font-weight: 900; color: #f97316;">${tableTotals.iva > 0 ? tableTotals.iva.toFixed(2) : '-'}</td>
      <td style="font-weight: 900; color: #f97316;">${tableTotals.total.toFixed(2)}</td>
    </tr>
  `;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voltis - ${project.name} (Gas)</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #020617; font-family: system-ui, -apple-system, sans-serif; color: white; }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      background: #020617;
      padding: 15mm;
      box-sizing: border-box;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .page:last-child { page-break-after: auto; }
    
    .glass {
      background: rgba(15, 23, 42, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 20px;
    }
    
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #f97316;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-bottom: 6px;
    }
    
    .section-heading {
      font-size: 22px;
      font-weight: 800;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.01em;
      margin-bottom: 16px;
    }
    
    .kpi-dashboard {
      display: flex;
      flex-direction: column;
      gap: 24px;
      flex: 1;
      justify-content: center;
      max-width: 400px;
      margin: 0 auto;
      width: 100%;
    }
    
    .kpi-block {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(249, 115, 22, 0.3);
      border-radius: 24px;
      padding: 32px 40px;
      text-align: center;
    }
    
    .kpi-block-label {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-bottom: 12px;
    }
    
    .kpi-block-value {
      font-size: 48px;
      font-weight: 900;
      color: white;
      line-height: 1;
    }
    
    .kpi-block-unit {
      font-size: 14px;
      font-weight: 500;
      color: #f97316;
      margin-top: 8px;
    }
    
    .kpi-grid-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    
    .kpi-block-sm {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(249, 115, 22, 0.2);
      border-radius: 20px;
      padding: 24px 32px;
      text-align: center;
    }
    
    .kpi-block-sm .kpi-block-value {
      font-size: 36px;
    }
    
    .chart-section {
      margin-bottom: 32px;
    }
    
    .chart-container {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .chart-container svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    
    .charts-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
      flex: 1;
    }
    
    .bio-section {
      display: flex;
      gap: 32px;
      align-items: stretch;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 24px;
    }
    
    .pie-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 200px;
    }
    
    .pie-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .pie-total {
      font-size: 20px;
      font-weight: 800;
      margin-top: 12px;
      color: white;
    }
    
    .pie-legend {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .legend-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    
    .legend-text {
      font-size: 13px;
      font-weight: 500;
      color: rgba(255,255,255,0.8);
      margin-left: 12px;
    }
    
    .legend-value {
      font-size: 14px;
      font-weight: 700;
      color: #f97316;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 10px;
    }
    
    th {
      padding: 10px 8px;
      font-size: 8px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 2px solid rgba(249, 115, 22, 0.3);
      text-align: right;
      background: rgba(15, 23, 42, 0.3);
    }
    
    th:first-child { text-align: left; }
    th:nth-child(2) { text-align: center; }
    
    td {
      padding: 8px 8px;
      font-size: 10px;
      font-weight: 500;
      color: rgba(255,255,255,0.7);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      text-align: right;
    }
    
    td:first-child { 
      text-align: left; 
      color: rgba(255,255,255,0.9);
      font-weight: 600;
    }
    
    td:nth-child(2) { text-align: center; }
    
    .cover {
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 297mm;
    }
    
    .cover-content {
      max-width: 180mm;
    }
    
    .logo {
      font-size: 64px;
      font-weight: 900;
      letter-spacing: 0.04em;
      color: #f97316;
      text-shadow: 0 0 80px rgba(249, 115, 22, 0.5);
      margin-bottom: 8px;
    }
    
    .logo-sub {
      font-size: 16px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      letter-spacing: 0.15em;
      margin-bottom: 48px;
    }
    
    .divider {
      height: 3px;
      width: 80px;
      background: linear-gradient(90deg, #f97316, #fbbf24);
      margin: 0 auto 40px;
      border-radius: 2px;
    }
    
    .project-name {
      font-size: 36px;
      font-weight: 800;
      color: white;
      margin-bottom: 32px;
      letter-spacing: -0.01em;
    }
    
    .cups-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      color: white;
      padding: 14px 28px;
      border: 1px solid rgba(249, 115, 22, 0.4);
      border-radius: 30px;
      letter-spacing: 0.08em;
      margin-bottom: 20px;
      background: rgba(249, 115, 22, 0.1);
    }
    
    .tarifa {
      font-size: 11px;
      color: #f97316;
      letter-spacing: 0.15em;
      margin-top: 12px;
      font-weight: 600;
    }
    
    .footer-note {
      font-size: 9px;
      color: rgba(255,255,255,0.3);
      letter-spacing: 0.15em;
      margin-top: 100px;
      font-weight: 500;
    }
    
    .closing {
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 297mm;
    }
    
    .closing-container {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(249, 115, 22, 0.3);
      border-radius: 24px;
      padding: 60px 80px;
      max-width: 600px;
      width: 100%;
      box-sizing: border-box;
    }
    
    .closing-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .closing-company {
      font-size: 56px;
      font-weight: 900;
      color: #f97316;
      letter-spacing: 0.05em;
      margin-bottom: 32px;
      text-shadow: 0 0 40px rgba(249, 115, 22, 0.4);
    }
    
    .closing-contact {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 48px;
      padding: 24px 32px;
      background: rgba(15, 23, 42, 0.4);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      width: 100%;
    }
    
    .contact-item {
      font-size: 16px;
      color: rgba(255,255,255,0.8);
      font-weight: 500;
      padding: 8px 0;
    }
    
    .closing-footer {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      letter-spacing: 0.2em;
      font-weight: 500;
      text-transform: uppercase;
    }
    
    .badge-adjusted {
      display: inline-block;
      font-size: 7px;
      padding: 2px 4px;
      background: #facc15;
      color: #000;
      border-radius: 4px;
      margin-left: 4px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <!-- PAGE 1: COVER -->
  <div class="page cover">
    <div class="cover-content">
      <div class="logo">VOLTIS</div>
      <div class="logo-sub">INFORME DE GAS</div>
      <div class="divider"></div>
      <div class="project-name">${project.name}</div>
      <div class="cups-badge">CUPS · ${cups}</div>
      <div class="tarifa">TARIFA ${tarifa}</div>
      <div class="footer-note">INFORME DE AUDITORÍA ENERGÉTICA - GAS</div>
    </div>
  </div>

  <!-- PAGE 2: KPIs -->
  <div class="page">
    <div class="section-title">Métricas Auditadas</div>
    <div class="section-heading">Resultados Anuales - Gas</div>
    
    <div class="kpi-dashboard">
      <div class="kpi-block">
        <div class="kpi-block-label">Facturación Global</div>
        <div class="kpi-block-value">${totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
        <div class="kpi-block-unit">EUR</div>
      </div>
      
      <div class="kpi-block">
        <div class="kpi-block-label">Consumo Total Gas</div>
        <div class="kpi-block-value">${totalKwh.toLocaleString('es-ES')}</div>
        <div class="kpi-block-unit">kWh</div>
      </div>
      
      <div class="kpi-grid-row">
        <div class="kpi-block-sm">
          <div class="kpi-block-label">Precio Medio</div>
          <div class="kpi-block-value">${avgPrice.toLocaleString('es-ES', { minimumFractionDigits: 4 })}</div>
          <div class="kpi-block-unit">EUR/kWh</div>
        </div>
        <div class="kpi-block-sm">
          <div class="kpi-block-label">Documentos Procesados</div>
          <div class="kpi-block-value">${sorted.length}</div>
          <div class="kpi-block-unit">FACTURAS</div>
        </div>
      </div>
    </div>
    
    ${adjustedCount > 0 ? `
    <div style="margin-top: 20px; padding: 12px 16px; background: rgba(250, 204, 21, 0.1); border: 1px solid rgba(250, 204, 21, 0.3); border-radius: 8px;">
      <div style="font-size: 9px; font-weight: 900; color: #facc15; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">⚠ Facturas con Ajustes/Regularizaciones</div>
      <div style="font-size: 14px; color: white;">${adjustedCount} factura${adjustedCount > 1 ? 's' : ''} contiene${adjustedCount === 1 ? '' : 'n'} ajustes de consumo</div>
    </div>
    ` : ''}
  </div>

  <!-- PAGE 3: CHARTS -->
  <div class="page">
    <div style="display: flex; flex-direction: column; flex: 1;">
      <div class="section-title">Análisis Temporal</div>
      <div class="section-heading">Evolución del Gasto Mensual</div>
      <div class="chart-container" style="flex: 1; min-height: 0;">
        ${barChartSVG}
      </div>
      
      <div class="section-title" style="margin-top: 16px;">Análisis Estructural</div>
      <div class="section-heading">Distribución de Costes</div>
      <div class="bio-section" style="flex: 1; min-height: 180px;">
        <div class="pie-container">
          <div class="pie-center">
            ${pieChartSVG}
            <div class="pie-total">
              ${totalEur.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€
            </div>
          </div>
        </div>
        <div class="pie-legend">
          ${pieLegend}
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 4: TABLE -->
  <div class="page">
    <div class="section-title">Engineering Matrix</div>
    <div class="section-heading">Detalle de Facturas de Gas</div>
    
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th>Tarifa</th>
          <th>kWh</th>
          <th>m³</th>
          <th>Factor</th>
          <th>€/kWh</th>
          <th>Término Fijo</th>
          <th>Impuesto</th>
          <th>Alquiler</th>
          <th>IVA</th>
          <th>Total €</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHTML}
      </tbody>
      <tfoot>
        ${tableTotalsHTML}
      </tfoot>
    </table>
    
    <div style="margin-top: 12px; font-size: 9px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em;">
      <span style="color: #facc15;">●</span> Precios en amarillo son estimados · m³ es informativo y no se usa para facturación · <span style="color: #facc15;">●</span> Puntos amarillos en mes indican facturas con ajustes/regularizaciones
    </div>
  </div>

  <!-- PAGE 5: CLOSING -->
  <div class="page closing">
    <div class="closing-container">
      <div class="closing-content">
        <div class="closing-company">${VOLTIS_CONTACT.company}</div>
        <div class="closing-contact">
          <div class="contact-item">${VOLTIS_CONTACT.email}</div>
          <div class="contact-item">${VOLTIS_CONTACT.phone}</div>
          <div class="contact-item">${VOLTIS_CONTACT.website}</div>
        </div>
        <div class="closing-footer">VOLTIS · INFORME ECONÓMICO ANUAL - GAS</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}

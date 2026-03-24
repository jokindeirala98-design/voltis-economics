/**
 * PDF-Safe HTML Generator with REAL DATA
 * 
 * ARCHITECTURE:
 * /api/export -> Playwright -> /api/export-pdf -> Pre-rendered HTML with real data
 * 
 * This route:
 * - Fetches REAL project data from Supabase using projectId
 * - Renders HTML with inline SVG charts (no React, no client JS)
 * - Uses explicit dimensions (no ResponsiveContainer)
 * - Returns pure HTML that Playwright captures as PDF
 * 
 * ERROR HANDLING:
 * - 400: Missing projectId
 * - 404: Project not found
 * - 500: Data fetch error or empty project
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchProjectById } from '@/lib/supabase-sync';
import { ExtractedBill } from '@/lib/types';

const VOLTIS_CONTACT = {
  company: 'VOLTIS',
  email: 'info@voltis.es',
  phone: '+34 XXX XXX XXX',
  website: 'www.voltis.es'
};

function getAssignedMonth(fechaInicio?: string, fechaFin?: string) {
  if (!fechaInicio && !fechaFin) return { month: 0, year: 2024 };
  const dateStr = fechaFin || fechaInicio || '';
  const date = new Date(dateStr.replace(/\//g, '-'));
  return { month: date.getMonth(), year: date.getFullYear() };
}

interface ProcessedData {
  bills: ExtractedBill[];
  projectName: string;
  cups: string;
  tarifa: string;
  chartData: any[];
  pieData: any[];
  summaryStats: { energetic: number; power: number; taxes: number; others: number; global: number; kwh: number };
  matrixData: any[];
}

function processProjectData(project: { bills: ExtractedBill[]; customOCs: Record<string, any>; name: string }): ProcessedData {
  const validBills = project.bills.filter(b => b.status !== 'error');
  const sorted = [...validBills].sort((a, b) => {
    const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
    const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
    if (am.year !== bm.year) return am.year - bm.year;
    return am.month - bm.month;
  });

  const totals = { energetic: 0, power: 0, taxes: 0, others: 0, global: 0, kwh: 0 };
  const monthMap: Record<string, any> = {};

  sorted.forEach(b => {
    const { month: monthIdx, year } = getAssignedMonth(b.fechaInicio, b.fechaFin);
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                       'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const name = monthNames[monthIdx] || 'S/D';
    
    const energia = b.costeTotalConsumo || 0;
    const potencia = b.costeTotalPotencia || 0;
    let imp = 0, others = 0;
    [...(b.otrosConceptos || [])].forEach(oc => {
      if (oc.concepto?.toLowerCase().includes('impuesto') || oc.concepto?.toLowerCase().includes('iva')) imp += oc.total;
      else others += oc.total;
    });

    totals.energetic += energia; 
    totals.power += potencia; 
    totals.taxes += imp; 
    totals.others += others;
    const totalF = energia + potencia + imp + others;
    totals.global += totalF; 
    totals.kwh += (b.consumoTotalKwh || 0);

    const mKey = `${year}-${monthIdx}`;
    if (!monthMap[mKey]) {
      monthMap[mKey] = { name, monthIdx, year, totalFactura: 0, energia: 0, potencia: 0, otros: 0 };
    }
    monthMap[mKey].totalFactura += totalF;
    monthMap[mKey].energia += energia;
    monthMap[mKey].potencia += potencia;
    monthMap[mKey].otros += (imp + others);
  });

  const chartData = Object.values(monthMap).sort((a: any, b: any) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.monthIdx - b.monthIdx;
  });

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
    return {
      id: b.id,
      name: new Date(b.fechaFin || '').toLocaleString('es-ES', { month: 'long' }),
      totalKwh: b.consumoTotalKwh || 0,
      avgPrice: b.costeMedioKwh || 0,
      totalFactura: totalF,
      energia, potencia, otros: imp + others,
      consumo: b.consumo || [],
    };
  });

  const firstBill = sorted[0];
  return {
    bills: sorted,
    projectName: project.name || 'PROYECTO',
    cups: firstBill?.cups || 'N/A',
    tarifa: firstBill?.tarifa || '3.0TD',
    chartData,
    pieData,
    summaryStats: totals,
    matrixData,
  };
}

function generateBarChartSVG(chartData: any[]): string {
  if (!chartData || chartData.length === 0) return '<svg width="750" height="280"><text x="375" y="140" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-size="14">Sin datos disponibles</text></svg>';
  
  const width = 750;
  const height = 280;
  const padding = { top: 20, right: 10, left: 55, bottom: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const maxValue = Math.max(...chartData.map(d => d.totalFactura || 0), 1);
  const barCount = chartData.length;
  const totalBarSpace = chartWidth / barCount;
  const barWidth = Math.max(25, Math.min(40, totalBarSpace - 8));
  
  const bars = chartData.map((d, i) => {
    const barHeight = Math.max(4, (d.totalFactura / maxValue) * chartHeight);
    const x = padding.left + i * totalBarSpace + (totalBarSpace - barWidth) / 2;
    const y = padding.top + chartHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="url(#barGrad)" rx="10"/>
      <title>${d.name}: ${d.totalFactura.toFixed(2)}€</title>`;
  }).join('');
  
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const y = padding.top + chartHeight - (chartHeight * pct);
    const value = (maxValue * pct).toLocaleString('es-ES', { maximumFractionDigits: 0 });
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
            <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="rgba(255,255,255,0.3)" font-size="9" font-weight="700">${value}</text>`;
  }).join('');
  
  const monthAbbr: Record<string, string> = {
    'enero': 'Ene', 'febrero': 'Feb', 'marzo': 'Mar', 'abril': 'Abr',
    'mayo': 'May', 'junio': 'Jun', 'julio': 'Jul', 'agosto': 'Ago',
    'septiembre': 'Sep', 'octubre': 'Oct', 'noviembre': 'Nov', 'diciembre': 'Dic'
  };
  
  const xLabels = chartData.map((d, i) => {
    const x = padding.left + i * totalBarSpace + totalBarSpace / 2;
    const y = height - 20;
    const abbr = monthAbbr[d.name] || d.name.substring(0, 3);
    return `<text x="${x}" y="${y}" text-anchor="end" fill="rgba(255,255,255,0.5)" font-size="9" font-weight="900" transform="rotate(-45 ${x} ${y})">${abbr}</text>`;
  }).join('');
  
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#3b82f6"/>
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.4"/>
      </linearGradient>
    </defs>
    ${gridLines}
    ${bars}
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

function getMascotImg(baseUrl: string, size: number = 160): string {
  const mascotUrl = `${baseUrl}/assets/mascota-transparent.png`;
  return `<img src="${mascotUrl}" alt="Voltis" style="width:${size}px;height:auto;display:block;margin:0 auto;" />`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  console.log(`[Export-PDF] Fetching project: ${projectId}`);
  const project = await fetchProjectById(projectId);

  if (!project) {
    console.log(`[Export-PDF] Project not found: ${projectId}`);
    return NextResponse.json({ error: `Project not found: ${projectId}` }, { status: 404 });
  }

  if (!project.bills || project.bills.length === 0) {
    console.log(`[Export-PDF] Project has no bills: ${projectId}`);
    return NextResponse.json({ error: 'Project has no bills to export' }, { status: 400 });
  }

  console.log(`[Export-PDF] Processing ${project.bills.length} bills for project: ${project.name}`);
  const data = processProjectData(project);

  const barChartSVG = generateBarChartSVG(data.chartData);
  const pieChartSVG = generatePieChartSVG(data.pieData, data.summaryStats.global);

  const baseUrl = req.headers.get('origin') || 'http://localhost:3000';
  const mascotCover = getMascotImg(baseUrl, 160);
  const mascotClosing = getMascotImg(baseUrl, 200);

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

  const matrixEconomicaRows = data.matrixData.map((row, idx) => `
    <tr>
      <td style="text-align:left">${row.name}</td>
      <td>${row.energia.toFixed(2)}</td>
      <td>${row.potencia.toFixed(2)}</td>
      <td>${row.otros.toFixed(2)}</td>
      <td class="${top3Cost.has(idx) ? 'highlight-top3' : ''}">${row.totalFactura.toFixed(2)}</td>
    </tr>
  `).join('');

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
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .chart-container svg {
      max-width: 100%;
      height: auto;
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
    
    .mascot-cover {
      margin: 0 auto 32px;
    }
    
    .mascot-cover img {
      width: 160px;
      height: auto;
      display: block;
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
    
    .closing-content {
      max-width: 180mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
    }
    
    .closing-mascot {
      margin-bottom: 40px;
    }
    
    .closing-company {
      font-size: 48px;
      font-weight: 900;
      color: #3b82f6;
      letter-spacing: 0.05em;
      margin-bottom: 24px;
      text-shadow: 0 0 40px rgba(59, 130, 246, 0.4);
    }
    
    .closing-contact {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 60px;
    }
    
    .contact-item {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
      font-weight: 500;
    }
    
    .closing-footer {
      font-size: 10px;
      color: rgba(255,255,255,0.25);
      letter-spacing: 0.15em;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <!-- PAGE 1: COVER -->
  <div class="page cover">
    <div class="cover-content">
      <div class="mascot-cover">${mascotCover}</div>
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
          <div class="kpi-block-value">${(data.summaryStats.global / (data.summaryStats.kwh || 1)).toLocaleString('es-ES', { minimumFractionDigits: 3 })}</div>
          <div class="kpi-block-unit">EUR/kWh</div>
        </div>
        <div class="kpi-block-sm">
          <div class="kpi-block-label">Documentos Procesados</div>
          <div class="kpi-block-value">${data.bills.length}</div>
          <div class="kpi-block-unit">FACTURAS</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 3: CHARTS - Stacked Full Width -->
  <div class="page">
    <div class="section-title">Digital Flow 03</div>
    <div class="section-heading">Evolución Mensual</div>
    <div class="chart-container" style="flex:1;">
      ${barChartSVG}
    </div>
    
    <div class="chart-section" style="flex:1; display:flex; flex-direction:column;">
      <div class="section-title" style="margin-top:16px;">Visual 04</div>
      <div class="section-heading">Bio-Estructura Económica</div>
      <div class="bio-section" style="flex:1;">
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
    <div class="section-heading">Matriz Económica Integral (€)</div>
    
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th>Energía</th>
          <th>Potencia</th>
          <th>Otros</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${matrixEconomicaRows}
      </tbody>
    </table>
  </div>

  <!-- PAGE 7: CLOSING -->
  <div class="page closing">
    <div class="closing-content">
      <div class="closing-mascot">${mascotClosing}</div>
      <div class="closing-company">${VOLTIS_CONTACT.company}</div>
      <div class="closing-contact">
        <div class="contact-item">${VOLTIS_CONTACT.email}</div>
        <div class="contact-item">${VOLTIS_CONTACT.phone}</div>
        <div class="contact-item">${VOLTIS_CONTACT.website}</div>
      </div>
      <div class="closing-footer">VOLTIS · INFORME ECONÓMICO ANUAL</div>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

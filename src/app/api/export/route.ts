import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const baseUrl = req.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const exportUrl = `${baseUrl}/api/export-pdf?projectId=${projectId}&export=true`;

  console.log(`[Export Controller] Starting PDF generation for project: ${projectId}`);
  console.log(`[Export Controller] Target URL: ${exportUrl}`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1200, height: 1600 }
    });
    
    const page = await context.newPage();
    
    // Set a timeout for the navigation
    await page.goto(exportUrl, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });

    // Wait for the custom 'data-report-ready' attribute to be "true"
    // This is set by the ReportView component's observer
    console.log('[Export Controller] Waiting for report-ready signal...');
    await page.waitForSelector('[data-report-ready="true"]', { timeout: 45000 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      },
      displayHeaderFooter: false,
      preferCSSPageSize: true
    });

    console.log(`[Export Controller] PDF generated successfully (${pdf.length} bytes)`);

    return new NextResponse(pdf as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Voltis_Report_${projectId}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('[Export Controller] Error generating PDF:', error);
    return NextResponse.json({ 
      error: 'Failed to generate PDF', 
      details: error.message 
    }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * PDF Export Route
 * 
 * ARCHITECTURE:
 * /api/export -> Playwright browser -> /api/export-pdf -> Renders pre-generated HTML with REAL data
 * 
 * This route is COMPLETELY ISOLATED from the interactive app (page.tsx).
 * It uses Playwright to capture a dedicated PDF-safe HTML page that:
 * - Fetches REAL project data from Supabase using projectId
 * - Renders pure HTML with inline SVG charts (no ResponsiveContainer)
 * - Uses explicit dimensions (no CSS-based sizing)
 * - Generates charts server-side as SVG strings
 * 
 * This approach avoids the issues with the old export path:
 * - No GSAP animations blocking render
 * - No ResponsiveContainer sizing issues
 * - No timing-dependent content observer
 * - No coupling to interactive component state
 * - No sample/fake data
 */
import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }
  
  const protocol = req.nextUrl.protocol;
  const host = req.nextUrl.host;
  const pdfViewUrl = `${protocol}//${host}/api/export-pdf?projectId=${encodeURIComponent(projectId)}`;

  let browser;
  try {
    console.log(`[Export] Launching browser for project: ${projectId}`);
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 1800 },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();
    
    console.log('[Export] Navigating to PDF view...');
    await page.goto(pdfViewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Check if export-pdf returned an error (non-200)
    const status = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);
    
    if (bodyText.includes('error') || bodyText.includes('not found') || bodyText.includes('no bills')) {
      console.log('[Export] export-pdf returned error:', bodyText.substring(0, 200));
      
      // Try to parse as JSON
      try {
        const errorData = JSON.parse(bodyText);
        if (errorData.error) {
          return NextResponse.json({ error: errorData.error }, { status: 400 });
        }
      } catch {
        // Not JSON, return generic error
        return NextResponse.json({ error: bodyText.substring(0, 200) }, { status: 400 });
      }
    }

    // Wait for pages to be present
    console.log('[Export] Waiting for pages to render...');
    await page.waitForSelector('.page', { timeout: 30000 });
    
    // Verify we have content
    const pageCount = await page.locator('.page').count();
    console.log(`[Export] Found ${pageCount} pages`);

    if (pageCount === 0) {
      throw new Error('No pages rendered');
    }

    console.log('[Export] Generating PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });

    console.log('[Export] PDF generated successfully.');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Voltis_Audit_${projectId}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('[Export] Error:', error.message);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
      console.log('[Export] Browser closed.');
    }
  }
}

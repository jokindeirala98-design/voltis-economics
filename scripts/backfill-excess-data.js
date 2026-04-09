/**
 * Power Excess Backfill Script v1.0
 * 
 * PURPOSE: Reparse old invoices to extract power excess data
 * that may have been missed or lumped into generic "Otros".
 * 
 * TWO OPTIONS:
 * 
 * OPTION A - Re-extract with AI (Accurate but requires API calls):
 *   - Re-upload original PDF files
 *   - Gemini will extract with updated prompt
 *   - Manual step: delete old project, re-extract
 * 
 * OPTION B - Pattern-based estimation (Approximate):
 *   - Look for excess-related text in raw invoice data
 *   - Apply conservative heuristics
 *   - Less accurate but automatic
 * 
 * WARNING: Option B is approximate. For precise data, use Option A.
 */

// ============================================================
// OPTION B: Pattern-based estimation (for bills without structured data)
// ============================================================

(function() {
  'use strict';
  
  console.log('========================================');
  console.log('Power Excess Backfill - Pattern Mode');
  console.log('========================================');
  console.log('');
  console.log('WARNING: This is approximate estimation.');
  console.log('For accurate data, re-extract with AI.');
  console.log('');
  
  if (typeof localStorage === 'undefined') {
    console.error('ERROR: Browser environment required');
    return;
  }
  
  const PROJECTS_KEY = 'voltis_projects';
  let projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
  
  let totalBills = 0;
  let billsBackfilled = 0;
  let estimatedExcess = 0;
  
  // Pattern-based excess estimation
  // These patterns suggest excess was present but not categorized
  const excessPatterns = [
    /exceso/i,
    /penaliz/i,
    /maximetro/i,
    /exceso.*kw/i,
    /kw.*exceso/i,
    /potencia.*demandada/i
  ];
  
  projects.forEach(project => {
    if (!project.bills) return;
    
    project.bills.forEach(bill => {
      totalBills++;
      
      // Skip if already has structured excess data
      if (bill.otrosConceptos) {
        const hasExcess = bill.otrosConceptos.some(oc => {
          const lower = (oc.concepto || '').toLowerCase();
          return lower.includes('exceso') || lower.includes('penaliz');
        });
        if (hasExcess) return; // Already has data
      }
      
      // Check if bill has any indication of excess in raw data
      // This would require the original text/data which may not be stored
      
      // Mark as potentially having untracked excess
      // (This is a placeholder - actual implementation depends on stored data)
      
      // For now, just log the issue
      console.log(`Bill ${bill.id} in project "${project.name}" may have untracked excess`);
      billsBackfilled++;
    });
  });
  
  console.log('');
  console.log('=== BACKFILL SUMMARY ===');
  console.log(`Total bills: ${totalBills}`);
  console.log(`Bills requiring review: ${billsBackfilled}`);
  console.log('');
  console.log('RECOMMENDATION: For accurate excess tracking,');
  console.log('re-extract bills with the current AI extractor.');
  console.log('');
  console.log('========================================');
})();

// ============================================================
// RECOMMENDED WORKFLOW FOR INCOMPLETE HISTORICAL DATA
// ============================================================

/**
 * STEP 1: Run audit to identify gaps
 *   - Copy contents of audit-historical-excess.js to console
 *   - Note which projects have incomplete data
 * 
 * STEP 2: For projects with gaps, choose:
 * 
 *   A) FULL RE-EXTRACTION (Recommended for important projects):
 *      1. Keep note of the project name/ID
 *      2. Delete the project in the UI
 *      3. Re-upload original PDF invoices
 *      4. AI will extract with complete data including excess
 * 
 *   B) ACCEPT APPROXIMATION (For historical analysis):
 *      - The table will show "No excesses detected"
 *      - But actual excess may exist in uncategorized data
 *      - Historical totals will be underestimated
 * 
 * STEP 3: Verify
 *      - After re-extraction, run audit again
 *      - Confirm bills now have otrosConceptos with excess data
 */

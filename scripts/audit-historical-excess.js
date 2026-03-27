/**
 * Historical Data Quality Audit Script
 * 
 * Run this script in the browser console to audit existing projects
 * for power excess detection quality.
 */

(function() {
  'use strict';
  
  console.log('========================================');
  console.log('Historical Data Quality Audit');
  console.log('Power Excess Detection Coverage');
  console.log('========================================');
  console.log('');
  
  if (typeof localStorage === 'undefined') {
    console.error('ERROR: Must run in browser environment');
    return;
  }
  
  const PROJECTS_KEY = 'voltis_projects';
  
  let projects = [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw) projects = JSON.parse(raw);
  } catch (e) {
    console.error('Error reading localStorage:', e);
    return;
  }
  
  if (projects.length === 0) {
    console.log('No projects found in localStorage');
    return;
  }
  
  console.log(`Analyzing ${projects.length} projects...\n`);
  
  const stats = {
    totalProjects: projects.length,
    totalBills: 0,
    billsWithOtrosConceptos: 0,
    billsWithoutOtrosConceptos: 0,
    billsWithExcess: 0,
    billsWithMultipleExcess: 0,
    totalExcessAmount: 0,
    projectsWithExcess: 0
  };
  
  const qualityIssues = [];
  
  projects.forEach((project, pIdx) => {
    let projectHasExcess = false;
    
    if (project.bills && Array.isArray(project.bills)) {
      stats.totalBills += project.bills.length;
      
      project.bills.forEach((bill, bIdx) => {
        const hasOC = bill.otrosConceptos && Array.isArray(bill.otrosConceptos) && bill.otrosConceptos.length > 0;
        
        if (hasOC) {
          stats.billsWithOtrosConceptos++;
          
          const excessConcepts = bill.otrosConceptos.filter(oc => {
            const lower = (oc.concepto || '').toLowerCase();
            const excessIndicators = ['exceso', 'penalizacion', 'penalización', 'maximetro', 'maxímetro', 'recargo'];
            const powerIndicators = ['potencia', 'kw', 'pot'];
            return excessIndicators.some(ind => lower.includes(ind)) && 
                   powerIndicators.some(ind => lower.includes(ind));
          });
          
          if (excessConcepts.length > 0) {
            stats.billsWithExcess++;
            projectHasExcess = true;
            const excessTotal = excessConcepts.reduce((sum, oc) => sum + (oc.total || 0), 0);
            stats.totalExcessAmount += excessTotal;
            
            if (excessConcepts.length > 1) {
              stats.billsWithMultipleExcess++;
            }
          }
        } else {
          stats.billsWithoutOtrosConceptos++;
          qualityIssues.push({
            projectIdx: pIdx,
            projectName: project.name,
            billIdx: bIdx,
            billId: bill.id,
            reason: 'Missing otrosConceptos array'
          });
        }
      });
    }
    
    if (projectHasExcess) {
      stats.projectsWithExcess++;
    }
  });
  
  console.log('=== SUMMARY ===');
  console.log(`Total Projects: ${stats.totalProjects}`);
  console.log(`Total Bills: ${stats.totalBills}`);
  console.log('');
  console.log('=== DETECTION COVERAGE ===');
  console.log(`Bills with otrosConceptos: ${stats.billsWithOtrosConceptos} (${((stats.billsWithOtrosConceptos / stats.totalBills) * 100).toFixed(1)}%)`);
  console.log(`Bills WITHOUT otrosConceptos: ${stats.billsWithoutOtrosConceptos} (${((stats.billsWithoutOtrosConceptos / stats.totalBills) * 100).toFixed(1)}%)`);
  console.log('');
  console.log('=== EXCESS DETECTION ===');
  console.log(`Bills with excess: ${stats.billsWithExcess}`);
  console.log(`Bills with MULTIPLE excess lines: ${stats.billsWithMultipleExcess}`);
  console.log(`Projects with excess: ${stats.projectsWithExcess}`);
  console.log(`Total excess amount: €${stats.totalExcessAmount.toFixed(2)}`);
  console.log('');
  
  if (qualityIssues.length > 0) {
    console.log('=== DATA QUALITY ISSUES ===');
    console.log(`${qualityIssues.length} bills may have incomplete excess data:`);
    qualityIssues.slice(0, 10).forEach(issue => {
      console.log(`  - ${issue.projectName}: Bill ${issue.billIdx + 1} (${issue.reason})`);
    });
    if (qualityIssues.length > 10) {
      console.log(`  ... and ${qualityIssues.length - 10} more`);
    }
    console.log('');
    console.log('RECOMMENDATION: These bills may need re-parsing to extract excess data.');
  } else {
    console.log('=== DATA QUALITY ===');
    console.log('All bills have otrosConceptos data.');
    console.log('Power excess detection should work for all historical projects.');
  }
  
  console.log('');
  console.log('========================================');
  
  return stats;
})();

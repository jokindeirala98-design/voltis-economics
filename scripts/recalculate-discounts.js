/**
 * Voltis Recalculation Script v2.0
 * 
 * This script recalculates existing bills to ensure discount-aware pricing
 * is applied correctly throughout the system.
 * 
 * Changes made:
 * - cosineMedioKwhNeto now uses cosineNetoConsumo / consumoTotalKwh (NET price)
 * - Period spend now applies discount factor when available
 * - Table 2 (€/kWh matrix) now shows net prices per period
 * - Table 3 now shows simplified spend by period (original format)
 * 
 * Run this script to migrate existing data.
 */

(function() {
  'use strict';
  
  console.log('========================================');
  console.log('Voltis Recalculation Script v2.0');
  console.log('Discount-Aware Price Migration');
  console.log('========================================');
  console.log('');
  
  // Check if we're in a browser environment
  if (typeof localStorage === 'undefined') {
    console.error('ERROR: This script must run in a browser environment');
    return;
  }
  
  const PROJECTS_KEY = 'voltis_projects';
  const FOLDERS_KEY = 'voltis_folders';
  
  // Read existing data
  let projects = [];
  let folders = [];
  
  try {
    const rawProjects = localStorage.getItem(PROJECTS_KEY);
    const rawFolders = localStorage.getItem(FOLDERS_KEY);
    
    if (rawProjects) {
      projects = JSON.parse(rawProjects);
    }
    if (rawFolders) {
      folders = JSON.parse(rawFolders);
    }
  } catch (e) {
    console.error('ERROR reading localStorage:', e);
    return;
  }
  
  console.log(`Found ${projects.length} projects`);
  console.log(`Found ${folders.length} folders`);
  console.log('');
  
  // Statistics
  let billsProcessed = 0;
  let billsWithDiscount = 0;
  let billsRecalculated = 0;
  let errors = 0;
  
  /**
   * Recalculate a single bill with discount-aware pricing
   */
  function recalculateBill(bill) {
    if (!bill) return bill;
    
    const originalBill = JSON.stringify(bill);
    
    // Calculate gross energy cost (kWh × price per period)
    let grossEnergyCost = 0;
    let totalKwh = bill.consumoTotalKwh || 0;
    
    // Sum up period costs if available
    if (bill.consumo && Array.isArray(bill.consumo)) {
      bill.consumo.forEach(c => {
        if (c.total !== undefined && c.total > 0) {
          grossEnergyCost += c.total;
        } else if (c.kwh && c.precioKwh) {
          grossEnergyCost += c.kwh * c.precioKwh;
        }
      });
    }
    
    // Handle missing gross cost - use existing values
    if (grossEnergyCost === 0 && bill.costeBrutoConsumo) {
      grossEnergyCost = bill.costeBrutoConsumo;
    }
    
    // Ensure cosineBrutoConsumo is set
    if (!bill.costeBrutoConsumo && grossEnergyCost > 0) {
      bill.costeBrutoConsumo = grossEnergyCost;
    }
    
    // Ensure cosineNetoConsumo is set (should be cosineTotalConsumo)
    if (bill.costeNetoConsumo !== undefined) {
      bill.costeTotalConsumo = bill.costeNetoConsumo;
    } else if (bill.costeTotalConsumo !== undefined && bill.costeTotalConsumo > 0) {
      // If cosineNetoConsumo is missing but cosineTotalConsumo exists, use it
      bill.costeNetoConsumo = bill.costeTotalConsumo;
    }
    
    // Calculate descuentoEnergia if missing but we have gross and net
    if (bill.descuentoEnergia === undefined && bill.costeBrutoConsumo && bill.costeTotalConsumo) {
      bill.descuentoEnergia = Math.max(0, bill.costeBrutoConsumo - bill.costeTotalConsumo);
    }
    
    // Calculate cosineMedioKwhNeto (NET average price)
    if (totalKwh > 0 && bill.costeTotalConsumo > 0) {
      bill.costeMedioKwhNeto = bill.costeTotalConsumo / totalKwh;
    } else if (totalKwh > 0 && bill.costeNetoConsumo > 0) {
      bill.costeMedioKwhNeto = bill.costeNetoConsumo / totalKwh;
    }
    
    // Track if discount was applied
    if (bill.descuentoEnergia && bill.descuentoEnergia > 0) {
      billsWithDiscount++;
    }
    
    // Check if recalculated
    const newBill = JSON.stringify(bill);
    if (newBill !== originalBill) {
      billsRecalculated++;
    }
    
    return bill;
  }
  
  /**
   * Recalculate a project
   */
  function recalculateProject(project) {
    if (!project) return project;
    
    if (project.bills && Array.isArray(project.bills)) {
      project.bills.forEach(bill => {
        try {
          recalculateBill(bill);
          billsProcessed++;
        } catch (e) {
          console.error(`ERROR processing bill ${bill.id}:`, e);
          errors++;
        }
      });
    }
    
    return project;
  }
  
  // Process all projects
  console.log('Processing projects...');
  console.log('----------------------------------------');
  
  projects.forEach((project, idx) => {
    console.log(`  [${idx + 1}/${projects.length}] ${project.name}`);
    recalculateProject(project);
  });
  
  // Save back to localStorage
  console.log('');
  console.log('Saving to localStorage...');
  
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    console.log('✓ Projects saved successfully');
  } catch (e) {
    console.error('ERROR saving projects:', e);
    errors++;
  }
  
  // Summary
  console.log('');
  console.log('========================================');
  console.log('RECALCULATION COMPLETE');
  console.log('========================================');
  console.log(`  Projects processed: ${projects.length}`);
  console.log(`  Bills processed: ${billsProcessed}`);
  console.log(`  Bills with discounts: ${billsWithDiscount}`);
  console.log(`  Bills recalculated: ${billsRecalculated}`);
  console.log(`  Errors: ${errors}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Refresh the page to see updated calculations');
  console.log('2. For cloud sync, the updated values will be synced automatically');
  console.log('');
  
  // Return results for programmatic access
  return {
    projectsCount: projects.length,
    billsProcessed,
    billsWithDiscount,
    billsRecalculated,
    errors
  };
})();

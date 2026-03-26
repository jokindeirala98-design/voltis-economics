import * as XLSX from 'xlsx';
import { ExtractedBill } from './types';

export const importBillsFromExcel = async (file: File): Promise<{ bills: ExtractedBill[], customOCs: Record<string, { concepto: string; total: number }[]> }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const sheetName = workbook.SheetNames.includes('Facturas (Transpuesta)') 
          ? 'Facturas (Transpuesta)' 
          : workbook.SheetNames[0];
          
        const worksheet = workbook.Sheets[sheetName];
        // Ensure defval '' to prevent missing keys on empty cells
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

        if (rows.length === 0) {
          throw new Error("El Excel importado está vacío.");
        }

        // The first column is 'Concepto / Periodo'. The rest are invoice identifiers
        const firstRow = rows[0];
        const invoiceKeys = Object.keys(firstRow).filter(k => k !== 'Concepto / Periodo' && k.trim() !== '');

        if (invoiceKeys.length === 0) {
           throw new Error("No se encontraron columnas de facturas válidas en el Excel.");
        }

        // Helper to find a cell value for a specific invoice column based on row label
        const getCell = (conceptLabel: string, invoiceKey: string): number | string => {
          const row = rows.find(r => r['Concepto / Periodo'] === conceptLabel);
          const val = row ? row[invoiceKey] : '';
          if (typeof val === 'string' && val === '-') return 0;
          return val !== '' ? val : 0;
        };

        const getCellString = (conceptLabel: string, invoiceKey: string): string => {
          const val = getCell(conceptLabel, invoiceKey);
          return val === 0 ? '' : String(val);
        };

        // Extract the boundaries for custom Otros Conceptos
        const otrosIndex = rows.findIndex(r => String(r['Concepto / Periodo']).toUpperCase().includes('OTROS CONCEPTOS'));
        const finalSeparatorIndex = rows.findIndex(r => String(r['Concepto / Periodo']).toUpperCase().includes('FINAL'));
        
        const customOCsDetected: {id: string, label: string, sources: string[]}[] = [];
        
        if (otrosIndex !== -1 && finalSeparatorIndex !== -1) {
          for (let i = otrosIndex + 1; i < finalSeparatorIndex; i++) {
            const labelStr = String(rows[i]['Concepto / Periodo']);
            if (!labelStr || labelStr.startsWith('---') || labelStr === 'Impuesto Eléctrico (€)' || labelStr === 'IVA / IGIC (€)') {
              continue;
            }
            // Strip the ' (€)' if present from the exported label
            const pureLabel = labelStr.endsWith(' (€)') ? labelStr.substring(0, labelStr.length - 4) : labelStr;
            const uuid = 'oc_' + Math.random().toString(36).substring(7);
            customOCsDetected.push({
              id: uuid,
              label: pureLabel,
              sources: [pureLabel] // The sources internally are now merged into the single label since it's hardcoded from excel
            });
          }
        }

        const rebuiltBills: ExtractedBill[] = invoiceKeys.map((invKey, idx) => {
          const fileName = getCellString('Nombre Archivo', invKey) || `Factura_Excel_${idx + 1}.pdf`;
          
          let fechaInicio = undefined;
          let fechaFin = undefined;
          if (invKey.includes(' a ')) {
             const parts = invKey.split(' a ');
             fechaInicio = parts[0];
             fechaFin = parts[1];
          }

          const bill: ExtractedBill = {
            id: Math.random().toString(36).substring(7),
            fileName,
            status: 'success',
            energyType: 'electricity',
            comercializadora: getCellString('Compañía', invKey),
            titular: getCellString('Titular', invKey),
            cups: getCellString('CUPS', invKey),
            fechaInicio,
            fechaFin,
            tarifa: getCellString('Tarifa', invKey),
            consumo: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => {
               const kwh = Number(getCell(`Consumo ${p} (kWh)`, invKey));
               const precio = Number(getCell(`Precio ${p} (€/kWh)`, invKey));
               return {
                 periodo: p,
                 kwh,
                 precioKwh: precio,
                 total: kwh * precio
               };
            }).filter(c => c.kwh > 0 || c.precioKwh > 0),
            potencia: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => {
               const kw = Number(getCell(`Potencia ${p} (kW)`, invKey));
               return {
                 periodo: p,
                 kw,
                 precioKwDia: 0,
                 dias: 0,
                 total: 0 // Potencia is not fully reconstructible but we have the KW
               };
            }).filter(p => p.kw > 0),
            otrosConceptos: [],
            consumoTotalKwh: Number(getCell('TOTAL CONSUMO (kWh)', invKey)),
            costeTotalConsumo: Number(getCell('TOTAL COSTE CONSUMO (€)', invKey)),
            costeMedioKwh: Number(getCell('COSTE MEDIO (€/kWh)', invKey)),
            costeTotalPotencia: Number(getCell('TOTAL COSTE POTENCIA (€)', invKey)),
            totalFactura: Number(getCell('TOTAL FACTURA (€)', invKey))
          };

          // Rebuild fixed taxes
          const impEl = Number(getCell('Impuesto Eléctrico (€)', invKey));
          if (impEl) bill.otrosConceptos?.push({ concepto: 'Impuesto Eléctrico', total: impEl });
          
          const iva = Number(getCell('IVA / IGIC (€)', invKey));
          if (iva) bill.otrosConceptos?.push({ concepto: 'IVA / IGIC', total: iva });

          // Rebuild custom OCs to ensure the UI matrices render them with the values contained
          customOCsDetected.forEach(oc => {
             const val = Number(getCell(`${oc.label} (€)`, invKey)) || Number(getCell(oc.label, invKey));
             if (val) {
                bill.otrosConceptos?.push({ concepto: oc.label, total: val });
             }
          });

          return bill;
        });

        resolve({ bills: rebuiltBills, customOCs: {} });

      } catch (err: any) {
        reject(new Error("Error leyendo Excel: " + err.message));
      }
    };
    reader.onerror = () => reject(new Error("Fallo al leer el archivo."));
    reader.readAsArrayBuffer(file);
  });
};

"use client";

import React, { useState } from 'react';
import { ExtractedBill } from '@/lib/types';
import { AlertTriangle, GripVertical } from 'lucide-react';

interface FileTableProps {
  bills: ExtractedBill[];
  onUpdateBills: (bills: ExtractedBill[]) => void;
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onUpdateOCs: (billId: string, ocs: { concepto: string; total: number }[]) => void;
}

export default function FileTable({ bills, onUpdateBills, customOCs, onUpdateOCs }: FileTableProps) {
  const [editingCell, setEditingCell] = useState<{ billId: string, field: string } | null>(null);
  const [draggedConcept, setDraggedConcept] = useState<string | null>(null);

  // Derive a unified list of "Otros Conceptos" (OCs) names across all bills
  const allConceptNames = new Set<string>();
  bills.forEach(bill => {
    bill.otrosConceptos?.forEach(oc => allConceptNames.add(oc.concepto));
    if (customOCs[bill.id]) {
      customOCs[bill.id].forEach(oc => allConceptNames.add(oc.concepto));
    }
  });

  const [orderedConcepts, setOrderedConcepts] = useState<string[]>(Array.from(allConceptNames));

  const handleEdit = (billId: string, field: string, value: string | number) => {
    const updated = bills.map(b => b.id === billId ? { ...b, [field]: value } : b);
    onUpdateBills(updated);
  };

  const handleDragStart = (e: React.DragEvent, conceptName: string) => {
    setDraggedConcept(conceptName);
    e.dataTransfer.setData('concept', conceptName);
  };

  const handleDrop = (e: React.DragEvent, targetConcept: string) => {
    e.preventDefault();
    const sourceConcept = e.dataTransfer.getData('concept');
    if (!sourceConcept || sourceConcept === targetConcept) return;

    if (confirm(`¿Quieres fusionar "${sourceConcept}" dentro de "${targetConcept}" sumando sus valores?`)) {
      const newName = prompt('Nombre para el concepto fusionado:', targetConcept) || targetConcept;
      
      bills.forEach(bill => {
        let currentOCs = [...(bill.otrosConceptos || [])];
        let currentCustom = [...(customOCs[bill.id] || [])];
        
        // Find values
        const srcVal = currentOCs.find(c => c.concepto === sourceConcept)?.total || 
                       currentCustom.find(c => c.concepto === sourceConcept)?.total || 0;
                       
        const tgtVal = currentOCs.find(c => c.concepto === targetConcept)?.total || 
                       currentCustom.find(c => c.concepto === targetConcept)?.total || 0;
                       
        // Remove both
        currentOCs = currentOCs.filter(c => c.concepto !== sourceConcept && c.concepto !== targetConcept);
        currentCustom = currentCustom.filter(c => c.concepto !== sourceConcept && c.concepto !== targetConcept);
        
        // Add merged
        if (srcVal + tgtVal > 0) {
          currentCustom.push({ concepto: newName, total: srcVal + tgtVal });
        }
        
        onUpdateOCs(bill.id, currentCustom);
      });
      
      setOrderedConcepts(prev => {
        const next = prev.filter(c => c !== sourceConcept && c !== targetConcept);
        next.push(newName);
        return next;
      });
    }
    setDraggedConcept(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const renderRow = (label: string, field: keyof ExtractedBill, isNumber = false) => (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
      <td className="p-3 font-semibold text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)]">
        {label}
      </td>
      {bills.map(bill => (
        <td key={bill.id} className="p-3 text-sm border-l border-white/5 whitespace-nowrap">
          {editingCell?.billId === bill.id && editingCell.field === field ? (
            <input 
              autoFocus
              className="bg-black/50 border border-blue-500 rounded px-2 py-1 text-white w-full outline-none"
              defaultValue={bill[field] as string | number}
              onBlur={(e) => {
                setEditingCell(null);
                handleEdit(bill.id, field as string, isNumber ? Number(e.target.value) : e.target.value);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <div 
              className="cursor-pointer hover:text-blue-400 transition-colors flex items-center justify-between"
              onClick={() => setEditingCell({ billId: bill.id, field: field as string })}
            >
              <span>{isNumber ? Number(bill[field] || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 }) : (bill[field] as string || '-')}</span>
            </div>
          )}
        </td>
      ))}
    </tr>
  );

  const renderConsumoRow = (periodo: string) => (
    <tr key={`cons-${periodo}`} className="border-b border-white/5 hover:bg-white/5 transition-colors group text-slate-400">
      <td className="p-3 pl-8 text-[11px] uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-700" /> Consumo {periodo}
      </td>
      {bills.map(bill => {
        const item = bill.consumo?.find(c => c.periodo === periodo);
        return (
          <td key={bill.id} className="p-3 text-xs border-l border-white/5 whitespace-nowrap opacity-70">
            {item ? (
              <div className="flex flex-col gap-1">
                <span className="font-medium text-slate-300">{item.kwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kWh</span>
                <span className={`text-[10px] uppercase font-bold tracking-wider ${item.precioEstimado ? 'text-red-400' : 'text-slate-500'}`}>
                  {item.precioKwh.toLocaleString('es-ES', { maximumFractionDigits: 4 })} €/kWh
                </span>
              </div>
            ) : '-'}
          </td>
        );
      })}
    </tr>
  );

  const renderPotenciaRow = (periodo: string) => (
    <tr key={`pot-${periodo}`} className="border-b border-white/5 hover:bg-white/5 transition-colors group text-slate-400">
      <td className="p-3 pl-8 text-[11px] uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-700" /> Potencia {periodo}
      </td>
      {bills.map(bill => {
        const item = bill.potencia?.find(c => c.periodo === periodo);
        return (
          <td key={bill.id} className="p-3 text-xs border-l border-white/5 whitespace-nowrap opacity-70">
             {item ? `${item.total.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €` : '-'}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="w-full overflow-x-auto relative z-0 custom-scrollbar pb-6 text-slate-200">
      <table className="w-full min-w-max text-left border-collapse">
         <thead>
           <tr>
             <th className="p-4 w-64 bg-[#0a0f1c] text-blue-500 font-black text-xs uppercase tracking-[0.2em] sticky left-0 z-20 border-b border-white/10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)]">
               Concepto / Periodo
             </th>
             {bills.map((bill, idx) => (
               <th key={bill.id} className="p-4 bg-[#0a0f1c] border-b border-white/10 border-l border-white/5 w-64">
                 <div className="flex flex-col gap-1">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Factura {idx + 1}</span>
                     <button
                       onClick={() => {
                         if (confirm(`¿Eliminar la factura "${bill.fileName}" del proyecto?`)) {
                           onUpdateBills(bills.filter(b => b.id !== bill.id));
                         }
                       }}
                       className="p-1 rounded-lg hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-all"
                       title="Eliminar factura"
                     >
                       <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                   </div>
                   <span className="text-sm font-bold text-white truncate" title={bill.fileName}>{bill.fileName}</span>
                   {bill.status !== 'error' ? (
                     <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Extraído</span>
                   ) : (
                     <span className="text-[10px] text-red-400 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Error</span>
                   )}
                 </div>
               </th>
             ))}
           </tr>
         </thead>
         <tbody>
           {renderRow('Compañía', 'comercializadora')}
           {renderRow('Titular', 'titular')}
           {renderRow('Tarifa', 'tarifa')}
           {renderRow('Fecha Inicio', 'fechaInicio')}
           {renderRow('Fecha Fin', 'fechaFin')}
           
           <tr className="bg-white/5 border-b border-white/10 mt-4"><td colSpan={bills.length + 1} className="h-6"></td></tr>
           {renderRow('TOTAL CONSUMO (kWh)', 'consumoTotalKwh', true)}
           {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(renderConsumoRow)}
           
           {renderRow('TOTAL COSTE CONSUMO (€)', 'costeTotalConsumo', true)}
           {renderRow('COSTE MEDIO (€/kWh)', 'costeMedioKwh', true)}
           
           <tr className="bg-white/5 border-b border-white/10"><td colSpan={bills.length + 1} className="h-6"></td></tr>
           {renderRow('TOTAL COSTE POTENCIA (€)', 'costeTotalPotencia', true)}
           {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(renderPotenciaRow)}
           
           <tr className="bg-white/5 border-b border-white/10"><td colSpan={bills.length + 1} className="h-4"></td></tr>
           
           {/* Otros Conceptos (DnD) */}
           {orderedConcepts.map((conceptName) => (
              <tr 
                key={conceptName}
                draggable
                onDragStart={(e) => handleDragStart(e, conceptName)}
                onDrop={(e) => handleDrop(e, conceptName)}
                onDragOver={handleDragOver}
                className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-grab active:cursor-grabbing group ${draggedConcept === conceptName ? 'opacity-50' : ''}`}
              >
                <td className="p-3 font-semibold text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] flex items-center gap-2">
                  <GripVertical className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-opacity" />
                  {conceptName}
                </td>
                {bills.map(bill => {
                  const ocVal = bill.otrosConceptos?.find(c => c.concepto === conceptName)?.total || 0;
                  const cVal = customOCs[bill.id]?.find(c => c.concepto === conceptName)?.total || 0;
                  const val = ocVal + cVal;
                  return (
                    <td key={bill.id} className="p-3 text-sm border-l border-white/5 whitespace-nowrap text-slate-300">
                      {val.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €
                    </td>
                  );
                })}
              </tr>
           ))}
           
           <tr className="bg-white/5 border-y border-white/10"><td colSpan={bills.length + 1} className="h-4"></td></tr>
           
           {/* Total Factura */}
           <tr className="bg-blue-900/10 border-b border-blue-500/20 group">
             <td className="p-4 font-black text-sm text-blue-400 uppercase tracking-widest sticky left-0 bg-[#0a1122] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)]">
               TOTAL FACTURA (€)
             </td>
             {bills.map(bill => {
                const energia = bill.costeTotalConsumo || 0;
                const potencia = bill.costeTotalPotencia || 0;
                let ocs = 0;
                bill.otrosConceptos?.forEach(oc => ocs += oc.total);
                customOCs[bill.id]?.forEach(oc => ocs += oc.total);
                const calcTotal = energia + potencia + ocs;
                return (
                  <td key={bill.id} className="p-4 text-lg font-black text-white border-l border-white/5 whitespace-nowrap">
                    {calcTotal.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €
                  </td>
                );
             })}
           </tr>
         </tbody>
      </table>
    </div>
  );
}

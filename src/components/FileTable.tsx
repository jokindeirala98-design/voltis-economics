"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { ExtractedBill, isGasBill } from '@/lib/types';
import { AlertTriangle, GripVertical, Calendar, Sparkles, CheckCircle2, XCircle, Edit3, Save, X, Shield, ShieldAlert, ShieldCheck, RefreshCw, Pencil } from 'lucide-react';
import { getAssignedMonth } from '@/lib/date-utils';
import { validateBill, getValidationMessage, ValidationResult } from '@/lib/bill-validator';
import { getOrderedConcepts, getBillCanonicalTotal, getCanonicalName, CANONICAL_GROUPS } from '@/lib/concept-utils';

interface FileTableProps {
  bills: ExtractedBill[];
  onUpdateBills: (bills: ExtractedBill[]) => void;
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onUpdateOCs: (billId: string, ocs: { concepto: string; total: number }[]) => void;
  onRefine: (bill: ExtractedBill) => void;
}

const CANONICAL_OPTIONS = [
  { value: CANONICAL_GROUPS.EXCESOS_POTENCIA, label: 'Exceso de Potencia' },
  { value: CANONICAL_GROUPS.BONO_SOCIAL, label: 'Bono Social' },
  { value: CANONICAL_GROUPS.ALQUILER_EQUIPO, label: 'Alquiler de Equipos' },
  { value: CANONICAL_GROUPS.PEAJES_CARGOS, label: 'Peajes y Cargos' },
  { value: CANONICAL_GROUPS.COMPENSACION, label: 'Compensación Excedentes' },
  { value: CANONICAL_GROUPS.IMPUESTO_ELECTRICO, label: 'Impuesto Eléctrico' },
  { value: CANONICAL_GROUPS.IVA, label: 'IVA' },
  { value: CANONICAL_GROUPS.DESCUENTO, label: 'Descuento' },
  { value: CANONICAL_GROUPS.AJUSTES, label: 'Ajustes' },
  { value: CANONICAL_GROUPS.OTROS, label: 'Otros' },
];

export default function FileTable({ bills, onUpdateBills, customOCs, onUpdateOCs, onRefine }: FileTableProps) {
  const [editingCell, setEditingCell] = useState<{ billId: string, field: string } | null>(null);
  const [draggedConcept, setDraggedConcept] = useState<string | null>(null);
  const [validatingBill, setValidatingBill] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});
  const [editingConcept, setEditingConcept] = useState<{ canonicalName: string; billId?: string } | null>(null);
  const [editConceptName, setEditConceptName] = useState('');
  const [editConceptValue, setEditConceptValue] = useState<number>(0);
  const [editCanonicalGroup, setEditCanonicalGroup] = useState('');

  const getValidationStatus = useCallback((bill: ExtractedBill) => {
    if (validationResults[bill.id]) {
      return validationResults[bill.id];
    }
    return validateBill(bill);
  }, [validationResults]);

  const handleValidate = useCallback((bill: ExtractedBill) => {
    setValidatingBill(bill.id);
    const result = validateBill(bill);
    setValidationResults(prev => ({ ...prev, [bill.id]: result }));
    
    const updated = bills.map<ExtractedBill>(b => {
      if (b.id === bill.id) {
        return {
          ...b,
          totalFactura: result.printedTotal,
          mathCheckPassed: result.isValid,
          discrepancyAmount: result.discrepancy,
          validationStatus: (result.isValid ? 'validated' : 'discrepancy') as 'validated' | 'discrepancy',
          lastValidatedAt: new Date().toISOString(),
          reviewAttempts: (b.reviewAttempts || 0) + 1
        } as ExtractedBill;
      }
      return b;
    });
    onUpdateBills(updated);
    setValidatingBill(null);
  }, [bills, onUpdateBills, validationResults]);

  const handleToggleIncludeInReport = useCallback((bill: ExtractedBill) => {
    const updated = bills.map<ExtractedBill>(b => {
      if (b.id === bill.id) {
        return {
          ...b,
          includeInReport: !b.includeInReport
        } as ExtractedBill;
      }
      return b;
    });
    onUpdateBills(updated);
  }, [bills, onUpdateBills]);

  const getValidationBadge = (bill: ExtractedBill) => {
    const result = getValidationStatus(bill);
    if (result.printedTotal === 0) {
      return null;
    }
    
    if (result.isValid) {
      return (
        <div className="flex items-center gap-1 text-emerald-500" title={getValidationMessage(result)}>
          <ShieldCheck className="w-3 h-3" />
          <span className="text-[9px] font-bold uppercase tracking-tight">Válido</span>
        </div>
      );
    }
    
    if (result.discrepancyPercent > 5) {
      return (
        <div className="flex items-center gap-1 text-red-500" title={getValidationMessage(result)}>
          <AlertTriangle className="w-3 h-3" />
          <span className="text-[9px] font-bold uppercase tracking-tight">{result.discrepancy.toFixed(2)}€</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-1 text-amber-500" title={getValidationMessage(result)}>
        <Shield className="w-3 h-3" />
        <span className="text-[9px] font-bold uppercase tracking-tight">{result.discrepancy.toFixed(2)}€</span>
      </div>
    );
  };

  const orderedGroups = useMemo(() => {
    return getOrderedConcepts(bills, customOCs);
  }, [bills, customOCs]);

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
        
        const srcVal = currentOCs.find(c => c.concepto === sourceConcept)?.total || 
                       currentCustom.find(c => c.concepto === sourceConcept)?.total || 0;
                       
        const tgtVal = currentOCs.find(c => c.concepto === targetConcept)?.total || 
                       currentCustom.find(c => c.concepto === targetConcept)?.total || 0;
                       
        currentOCs = currentOCs.filter(c => c.concepto !== sourceConcept && c.concepto !== targetConcept);
        currentCustom = currentCustom.filter(c => c.concepto !== sourceConcept && c.concepto !== targetConcept);
        
        if (srcVal + tgtVal > 0) {
          currentCustom.push({ concepto: newName, total: srcVal + tgtVal });
        }
        
        onUpdateOCs(bill.id, currentCustom);
      });
    }
    setDraggedConcept(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const startEditConcept = (canonicalName: string, billId?: string) => {
    setEditingConcept({ canonicalName, billId });
    setEditConceptName(canonicalName);
    
    if (billId) {
      const bill = bills.find(b => b.id === billId);
      const ocs = customOCs[billId] || [];
      const total = getBillCanonicalTotal(bill!, ocs, canonicalName);
      setEditConceptValue(total);
    } else {
      setEditConceptValue(0);
    }
    setEditCanonicalGroup(canonicalName);
  };

  const saveEditConcept = () => {
    if (!editingConcept) return;

    const { canonicalName, billId } = editingConcept;
    
    if (billId) {
      const bill = bills.find(b => b.id === billId);
      if (!bill) return;

      let currentOCs = [...(customOCs[billId] || [])];
      
      currentOCs = currentOCs.filter(c => getCanonicalName(c.concepto) !== getCanonicalName(canonicalName));
      
      if (editConceptValue !== 0) {
        currentOCs.push({ concepto: editConceptName, total: editConceptValue });
      }
      
      onUpdateOCs(billId, currentOCs);
    } else {
      bills.forEach(bill => {
        let currentOCs = [...(customOCs[bill.id] || [])];
        
        currentOCs = currentOCs.filter(c => getCanonicalName(c.concepto) !== getCanonicalName(canonicalName));
        
        if (editConceptValue !== 0) {
          currentOCs.push({ concepto: editConceptName, total: editConceptValue });
        }
        
        onUpdateOCs(bill.id, currentOCs);
      });
    }

    setEditingConcept(null);
  };

  const cancelEditConcept = () => {
    setEditingConcept(null);
  };

  const cellValue = (bill: ExtractedBill, field: keyof ExtractedBill): string => {
    if (isGasBill(bill)) {
      if (field === 'tarifa') return bill.tarifaRL || '-';
      const val = bill[field];
      if (val === undefined || val === null) return '-';
      if (typeof val === 'number') return val.toLocaleString('es-ES', { maximumFractionDigits: 2 });
      return String(val);
    }
    const val = bill[field];
    if (val === undefined || val === null) return '-';
    if (typeof val === 'number') return val.toLocaleString('es-ES', { maximumFractionDigits: 2 });
    return String(val);
  };

  const renderRow = (label: string, field: keyof ExtractedBill, isNumber = false) => (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
      <td className="p-2 md:p-3 font-bold text-[9px] md:text-[10px] text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-950/80 backdrop-blur-md group-hover:bg-slate-900/80 z-10 mobile-table-cell">
        <span className="hidden md:inline">{label}</span>
        <span className="md:hidden">{label.length > 12 ? label.substring(0, 12) + '...' : label}</span>
      </td>
      {bills.map(bill => (
        <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 whitespace-nowrap mobile-table-cell">
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
              <span>{cellValue(bill, field)}</span>
            </div>
          )}
        </td>
      ))}
    </tr>
  );

  const renderConsumoRow = (periodo: string) => (
    <tr key={`cons-${periodo}`} className="border-b border-white/5 hover:bg-white/5 transition-colors group text-slate-500">
      <td className="p-2 md:p-3 pl-4 md:pl-8 text-[8px] md:text-[9px] font-bold uppercase tracking-wider sticky left-0 bg-slate-950/80 backdrop-blur-md group-hover:bg-slate-900/80 z-10 flex items-center gap-1 md:gap-2 mobile-table-cell">
        <div className="w-1 h-1 rounded-full bg-slate-700 hidden md:block" /> Consumo {periodo}
      </td>
      {bills.map(bill => {
        if (isGasBill(bill)) return <td key={bill.id} className="p-2 md:p-3 text-[10px] md:text-xs border-l border-white/5 text-slate-600 mobile-table-cell">—</td>;
        const item = bill.consumo?.find(c => c.periodo === periodo);
        return (
          <td key={bill.id} className="p-2 md:p-3 text-[10px] md:text-xs border-l border-white/5 whitespace-nowrap opacity-70 mobile-table-cell">
            {item ? (
              <div className="flex flex-col gap-0.5 md:gap-1">
                <span className="font-medium text-slate-300">{item.kwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kWh</span>
                <span className={`text-[8px] md:text-[10px] uppercase font-bold tracking-wider ${item.precioEstimated ? 'text-red-400' : 'text-slate-500'}`}>
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
    <tr key={`pot-${periodo}`} className="border-b border-white/5 hover:bg-white/5 transition-colors group text-slate-500">
      <td className="p-2 md:p-3 pl-4 md:pl-8 text-[8px] md:text-[9px] font-bold uppercase tracking-wider sticky left-0 bg-slate-950/80 backdrop-blur-md group-hover:bg-slate-900/80 z-10 flex items-center gap-1 md:gap-2 mobile-table-cell">
        <div className="w-1 h-1 rounded-full bg-slate-700 hidden md:block" /> Potencia {periodo}
      </td>
      {bills.map(bill => {
        if (isGasBill(bill)) return <td key={bill.id} className="p-2 md:p-3 text-[10px] md:text-xs border-l border-white/5 text-slate-600 mobile-table-cell">—</td>;
        const item = bill.potencia?.find(c => c.periodo === periodo);
        return (
          <td key={bill.id} className="p-2 md:p-3 text-[10px] md:text-xs border-l border-white/5 whitespace-nowrap opacity-70 mobile-table-cell">
             {item ? `${item.total.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €` : '-'}
          </td>
        );
      })}
    </tr>
  );

  const isEditingThisConcept = (canonicalName: string) => editingConcept?.canonicalName === canonicalName;

  return (
    <div className="w-full overflow-x-auto relative z-0 custom-scrollbar pb-6 text-slate-200 mobile-table-scroll">
      {editingConcept && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-card border border-white/20 rounded-2xl md:rounded-3xl p-4 md:p-8 w-full max-w-lg mobile-modal">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <h3 className="text-base md:text-lg font-bold text-white">Editar Concepto</h3>
              <button onClick={cancelEditConcept} className="p-2 hover:bg-white/10 rounded-full touch-target">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 md:mb-2">
                  Nombre del Concepto
                </label>
                <input
                  type="text"
                  value={editConceptName}
                  onChange={(e) => setEditConceptName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2 md:py-3 text-white outline-none focus:border-blue-500 transition-colors text-sm"
                />
              </div>
              
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 md:mb-2">
                  Grupo Canónico
                </label>
                <select
                  value={editCanonicalGroup}
                  onChange={(e) => setEditCanonicalGroup(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2 md:py-3 text-white outline-none focus:border-blue-500 transition-colors text-sm"
                >
                  {CANONICAL_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 md:mb-2">
                  Valor (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editConceptValue}
                  onChange={(e) => setEditConceptValue(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2 md:py-3 text-white outline-none focus:border-blue-500 transition-colors text-sm"
                />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 md:gap-3 pt-2 md:pt-4">
                <button
                  onClick={cancelEditConcept}
                  className="flex-1 px-3 md:px-4 py-2 md:py-3 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-colors font-bold text-xs md:text-sm touch-target"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveEditConcept}
                  className="flex-1 px-3 md:px-4 py-2 md:py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors font-bold text-xs md:text-sm flex items-center justify-center gap-2 touch-target"
                >
                  <Save className="w-4 h-4" /> Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <table className="w-full min-w-max text-left border-collapse">
         <thead>
           <tr>
             <th className="p-2 md:p-4 w-48 md:w-64 bg-[#0a0f1c] text-blue-500 font-black text-[9px] md:text-xs uppercase tracking-[0.2em] sticky left-0 z-20 border-b border-white/10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)]">
               <span className="hidden md:inline">Concepto / Periodo</span>
               <span className="md:hidden">Concepto</span>
             </th>
              {bills.map((bill, idx) => (
                <th key={bill.id} className={`p-2 md:p-4 bg-[#0a0f1c] border-b border-white/10 border-l border-white/5 w-48 md:w-64 ${bill.includeInReport === false ? 'opacity-40' : ''}`}>
                 <div className="flex flex-col gap-1">
                   <div className="flex items-center justify-between">
                     <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Factura {idx + 1}</span>
                     <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleValidate(bill)}
                          disabled={validatingBill === bill.id}
                          className="p-1.5 md:p-1 rounded-lg hover:bg-emerald-500/20 text-slate-600 hover:text-emerald-400 transition-all disabled:opacity-50 touch-target"
                          title="Validar matemáticamente"
                        >
                          {validatingBill === bill.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Shield className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => onRefine(bill)}
                          className="p-1.5 md:p-1 rounded-lg hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-all touch-target"
                          title="Refinar con AI"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar la factura "${bill.fileName}" del proyecto?`)) {
                              onUpdateBills(bills.filter(b => b.id !== bill.id));
                            }
                          }}
                          className="p-1.5 md:p-1 rounded-lg hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-all touch-target"
                          title="Eliminar factura"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                     </div>
                   </div>
                   <span className="text-[11px] md:text-sm font-bold text-white truncate block max-w-[120px] md:max-w-none" title={bill.fileName}>{bill.fileName}</span>
                    {bill.status !== 'error' ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] md:text-[10px] text-emerald-400 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Extraído</span>
                        <button
                          onClick={() => handleToggleIncludeInReport(bill)}
                          className={`p-0.5 rounded transition-all touch-target ${bill.includeInReport !== false ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}
                          title={bill.includeInReport !== false ? "Incluido en informe (clic para excluir)" : "Excluido del informe (clic para incluir)"}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${bill.includeInReport !== false ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}`}>
                            {bill.includeInReport !== false && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[9px] md:text-[10px] text-red-400 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Error</span>
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
            
            <tr className="border-b border-white/10 bg-blue-500/5 hover:bg-blue-500/10 transition-colors group">
              <td className="p-3 font-black text-[9px] text-blue-400 uppercase tracking-[0.2em] sticky left-0 bg-[#0a1122] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Mes Liquidación
              </td>
              {bills.map(bill => {
                const { month, year } = getAssignedMonth(bill.fechaInicio, bill.fechaFin);
                const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                return (
                  <td key={bill.id} className="p-3 text-[10px] font-black text-blue-300/80 border-l border-white/5 whitespace-nowrap uppercase tracking-widest">
                    {monthNames[month]} {year}
                  </td>
                );
              })}
            </tr>
           
           <tr className="bg-white/5 border-b border-white/10 mt-4"><td colSpan={bills.length + 1} className="h-6"></td></tr>
           {renderRow('TOTAL CONSUMO (kWh)', 'consumoTotalKwh', true)}
           {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(renderConsumoRow)}
           
           {renderRow('TOTAL COSTE CONSUMO (€)', 'costeTotalConsumo', true)}
           {renderRow('COSTE MEDIO (€/kWh)', 'costeMedioKwh', true)}
           
           <tr className="bg-white/5 border-b border-white/10"><td colSpan={bills.length + 1} className="h-6"></td></tr>
           {renderRow('TOTAL COSTE POTENCIA (€)', 'costeTotalPotencia', true)}
           {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(renderPotenciaRow)}
           
           <tr className="bg-white/5 border-b border-white/10"><td colSpan={bills.length + 1} className="h-4"></td></tr>
           
            {/* Otros Conceptos with inline editing */}
            {orderedGroups.map((group) => (
               <tr 
                 key={group.canonicalName}
                 className={`border-b border-white/5 hover:bg-white/5 transition-colors group ${isEditingThisConcept(group.canonicalName) ? 'bg-blue-900/20' : ''}`}
               >
                 <td className="p-2 md:p-3 sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                   <div className="flex items-center gap-1 md:gap-2">
                     <GripVertical className="w-3 h-3 md:w-4 md:h-4 text-slate-600 opacity-30 group-hover:opacity-100 transition-opacity cursor-grab hidden md:block" />
                     <span className="font-semibold text-[10px] md:text-xs text-slate-400 uppercase tracking-widest truncate max-w-[80px] md:max-w-none">
                       {group.displayName}
                     </span>
                     <button
                       onClick={() => startEditConcept(group.canonicalName)}
                       className="p-1 rounded hover:bg-white/10 text-slate-600 hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100 touch-target"
                       title="Editar concepto"
                     >
                       <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5" />
                     </button>
                   </div>
                 </td>
                 {bills.map(bill => {
                   const billOC = customOCs[bill.id] || [];
                   const val = getBillCanonicalTotal(bill, billOC, group.canonicalName);
                   return (
                     <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 whitespace-nowrap mobile-table-cell">
                       <div className="flex items-center justify-between group/value">
                         <span className="text-slate-300">
                           {val.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €
                         </span>
                         <button
                           onClick={() => startEditConcept(group.canonicalName, bill.id)}
                           className="p-1 rounded hover:bg-blue-500/20 text-slate-600 hover:text-blue-400 transition-all opacity-0 group-hover/value:opacity-100 touch-target"
                           title="Editar valor"
                         >
                           <Pencil className="w-2.5 h-2.5 md:w-3 md:h-3" />
                         </button>
                       </div>
                     </td>
                   );
                 })}
               </tr>
            ))}
           
           <tr className="bg-white/5 border-y border-white/10"><td colSpan={bills.length + 1} className="h-4"></td></tr>
           
            {/* Total Factura */}
            <tr className="bg-blue-900/10 border-b border-blue-500/20 group">
              <td className="p-3 md:p-4 font-black text-xs md:text-sm text-blue-400 uppercase tracking-widest sticky left-0 bg-[#0a1122] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                TOTAL FACTURA (€)
              </td>
              {bills.map(bill => {
                 if (isGasBill(bill)) {
                   return (
                     <td key={bill.id} className="p-3 md:p-4 text-base md:text-lg font-black text-orange-400 border-l border-white/5 whitespace-nowrap mobile-table-cell">
                       {(bill.totalFactura || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €
                     </td>
                   );
                 }
                 const energia = bill.costeTotalConsumo || 0;
                 const potencia = bill.costeTotalPotencia || 0;
                 let ocs = 0;
                 bill.otrosConceptos?.forEach(oc => ocs += oc.total);
                 (customOCs[bill.id] || []).forEach(oc => ocs += oc.total);
                 const calcTotal = energia + potencia + ocs;
                 return (
                   <td key={bill.id} className="p-3 md:p-4 text-base md:text-lg font-black text-white border-l border-white/5 whitespace-nowrap mobile-table-cell">
                     {calcTotal.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €
                   </td>
                 );
              })}
            </tr>

            {/* GAS-SPECIFIC ROWS — shown for gas bills after the electricity total */}
            <tr className="border-b border-white/5">
              <td colSpan={bills.length + 1} className="p-2 bg-orange-500/10">
                <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">⚡ Datos de Gas</span>
              </td>
            </tr>

            {/* Tarifa RL */}
            <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
              <td className="p-2 md:p-3 font-semibold text-[10px] md:text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                Tarifa RL
              </td>
              {bills.map(bill => (
                <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 mobile-table-cell">
                  {isGasBill(bill) ? (
                    <span className="text-orange-400 font-bold">{bill.tarifaRL || '-'}</span>
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* Consumo kWh */}
            <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
              <td className="p-2 md:p-3 font-semibold text-[10px] md:text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                Consumo kWh
              </td>
              {bills.map(bill => (
                <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 mobile-table-cell">
                  {isGasBill(bill) ? (
                    <span>{(bill.gasConsumption?.kwh || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh</span>
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* m³ */}
            <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group text-slate-500">
              <td className="p-2 md:p-3 text-[10px] md:text-xs uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                Volumen (m³)
              </td>
              {bills.map(bill => (
                <td key={bill.id} className="p-2 md:p-3 text-[10px] md:text-xs border-l border-white/5 mobile-table-cell">
                  {isGasBill(bill) ? (
                    bill.gasConsumption?.m3 ? `${bill.gasConsumption.m3.toLocaleString('es-ES')} m³` : '-'
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* €/kWh */}
            <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
              <td className="p-2 md:p-3 font-semibold text-[10px] md:text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                Precio €/kWh
              </td>
              {bills.map(bill => (
                <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 mobile-table-cell">
                  {isGasBill(bill) ? (
                    <span className={bill.gasPricing?.precioKwhEstimated ? 'text-yellow-400' : 'text-slate-300'}>
                      {bill.gasPricing?.precioKwh ? bill.gasPricing.precioKwh.toFixed(4) : '-'} €/kWh
                      {bill.gasPricing?.precioKwhEstimated && <span className="ml-1 text-[9px] text-yellow-500">(est.)</span>}
                    </span>
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* Término Fijo */}
            <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
              <td className="p-2 md:p-3 font-semibold text-[10px] md:text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                Término Fijo
              </td>
              {bills.map(bill => (
                <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 mobile-table-cell">
                  {isGasBill(bill) ? (
                    (bill.gasPricing?.terminoFijoTotal || 0) > 0
                      ? `${bill.gasPricing!.terminoFijoTotal.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`
                      : '-'
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* Impuesto Hidrocarburos */}
            <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
              <td className="p-2 md:p-3 font-semibold text-[10px] md:text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                Impuesto Hidrocarb.
              </td>
              {bills.map(bill => (
                <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 mobile-table-cell">
                  {isGasBill(bill) ? (
                    (bill.gasPricing?.impuestoHidrocarbTotal || 0) > 0
                      ? `${bill.gasPricing!.impuestoHidrocarbTotal.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`
                      : '-'
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* Alquiler */}
            <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
              <td className="p-2 md:p-3 font-semibold text-[10px] md:text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                Alquiler Contador
              </td>
              {bills.map(bill => (
                <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 mobile-table-cell">
                  {isGasBill(bill) ? (
                    (bill.gasPricing?.alquilerTotal || 0) > 0
                      ? `${bill.gasPricing!.alquilerTotal.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`
                      : '-'
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* IVA */}
            <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
              <td className="p-2 md:p-3 font-semibold text-[10px] md:text-xs text-slate-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                IVA
              </td>
              {bills.map(bill => (
                <td key={bill.id} className="p-2 md:p-3 text-xs md:text-sm border-l border-white/5 mobile-table-cell">
                  {isGasBill(bill) ? (
                    (bill.gasPricing?.ivaTotal || 0) > 0
                      ? `${bill.gasPricing!.ivaTotal.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`
                      : '-'
                  ) : '—'}
                </td>
              ))}
            </tr>

            {/* Ajustes */}
            {bills.some(b => isGasBill(b) && (b.gasAdjustments?.length || 0) > 0) && (
              <tr className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                <td className="p-2 md:p-3 font-semibold text-[10px] md:text-xs text-yellow-400 uppercase tracking-widest sticky left-0 bg-[#0f172a] group-hover:bg-[#15203b] z-10 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] mobile-table-cell">
                  ⚠️ Ajustes
                </td>
                {bills.map(bill => (
                  <td key={bill.id} className="p-2 md:p-3 text-[10px] md:text-xs border-l border-white/5 mobile-table-cell">
                    {isGasBill(bill) ? (
                      bill.gasAdjustments && bill.gasAdjustments.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {bill.gasAdjustments.map((adj, i) => (
                            <span key={i} className="text-yellow-400">
                              {adj.concepto}: {adj.kwh} kWh / {adj.euros.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €
                            </span>
                          ))}
                        </div>
                      ) : '-'
                    ) : '—'}
                  </td>
                ))}
              </tr>
            )}
         </tbody>
       </table>
     </div>
   );
}

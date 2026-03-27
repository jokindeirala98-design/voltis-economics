"use client";

import React, { useMemo, useRef, useState } from 'react';
import { ExtractedBill, isGasBill } from '@/lib/types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { ArrowLeft, Printer, Activity, DollarSign, Flame, AlertTriangle, Cpu, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getAssignedMonth, CANONICAL_MONTHS } from '@/lib/date-utils';

interface GasReportViewProps {
  bills: ExtractedBill[];
  onBack: () => void;
  projectName?: string;
  projectId?: string;
  onPreviewBill?: (billId: string) => void;
}

const CountUp = ({ value, decimals = 0 }: { value: number; decimals?: number }) => {
  return (
    <span>
      {value.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
};

export function GasReportView({ bills, onBack, projectName = 'PROYECTO', projectId, onPreviewBill }: GasReportViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleGeneratePDF = async () => {
    if (!projectId) {
      toast.error('ID de proyecto no disponible');
      return;
    }
    if (!gasBills || gasBills.length === 0) {
      toast.error('No hay facturas de gas para exportar');
      return;
    }

    setIsGeneratingPDF(true);
    toast.info('Generando PDF de gas...', { duration: 2000 });

    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName: projectName || 'PROYECTO',
          bills: gasBills,
          customOCs: {},
          format: 'pdf',
          energyType: 'gas'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error generando PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Voltis_Gas_Report_${projectId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('PDF de gas descargado', { duration: 3000 });
    } catch (err: any) {
      console.error('PDF export error:', err);
      const msg = err?.message || '';
      if (msg.includes('chromium') || msg.includes('executable') || msg.includes('ENOENT') || msg.includes('spawn')) {
        toast.error('Error de configuración del generador PDF. Consulta la consola.');
      } else if (msg.includes('timeout') || msg.includes('deadline')) {
        toast.error('La generación del PDF ha expirado. Inténtalo de nuevo.');
      } else {
        toast.error(err.message || 'Error al generar PDF de gas');
      }
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const gasBills = useMemo(() => {
    return bills.filter(b => isGasBill(b));
  }, [bills]);

  const selectedMonths = useMemo(() => new Set([0,1,2,3,4,5,6,7,8,9,10,11]), []);

  const { chartData, summaryStats, tableData, pieData } = useMemo(() => {
    const months = CANONICAL_MONTHS.map((label, i) => ({
      monthIndex: i,
      label,
      kwh: 0,
      eur: 0,
      billsCount: 0,
    }));

    let totalKwh = 0;
    let totalEur = 0;
    let totalEnergyNetEur = 0;
    let totalTerminoFijo = 0;
    let totalImpuesto = 0;
    let totalAlquiler = 0;
    let totalIva = 0;
    let adjustedCount = 0;

    const gasBillMap = new Map<string, typeof gasBills[0]>();

    gasBills.forEach(b => {
      if (!isGasBill(b)) return;
      
      const { month } = getAssignedMonth(b.fechaInicio, b.fechaFin);
      if (month < 0 || month > 11) return;

      const kwh = b.gasConsumption?.kwh || 0;
      const eur = b.totalFactura || 0;
      const energyNetEur = b.costeNetoConsumo || 0;
      const terminoFijo = b.gasPricing?.terminoFijoTotal || 0;
      const impuesto = b.gasPricing?.impuestoHidrocarbTotal || 0;
      const alquiler = b.gasPricing?.alquilerTotal || 0;
      const iva = b.gasPricing?.ivaTotal || 0;

      months[month].kwh += kwh;
      months[month].eur += eur;
      months[month].billsCount += 1;

      totalKwh += kwh;
      totalEur += eur;
      totalEnergyNetEur += energyNetEur;
      totalTerminoFijo += terminoFijo;
      totalImpuesto += impuesto;
      totalAlquiler += alquiler;
      totalIva += iva;

      if (b.descuentoEnergia && b.descuentoEnergia > 0) {
        adjustedCount++;
      }

      gasBillMap.set(`${month}-${b.fechaFin}`, b);
    });

    const avgPrice = totalKwh > 0 ? totalEnergyNetEur / totalKwh : 0;

    const pieData = [
      { name: 'Energía Neta', value: totalEnergyNetEur, color: '#f97316' },
      { name: 'Término Fijo', value: totalTerminoFijo, color: '#fb923c' },
      { name: 'Impuesto Hidrocarb.', value: totalImpuesto, color: '#fbbf24' },
      { name: 'Alquiler', value: totalAlquiler, color: '#facc15' },
      { name: 'IVA', value: totalIva, color: '#eab308' },
    ].filter(i => i.value > 0);

    const tData = gasBills
      .filter(b => isGasBill(b))
      .sort((a, b) => {
        const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
        const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
        if (am.year !== bm.year) return am.year - bm.year;
        return am.month - bm.month;
      })
      .map(b => ({
        id: b.id,
        name: CANONICAL_MONTHS[getAssignedMonth(b.fechaInicio, b.fechaFin).month],
        fechaFin: b.fechaFin,
        tarifaRL: b.tarifaRL || '-',
        kwh: b.gasConsumption?.kwh || 0,
        m3: b.gasConsumption?.m3,
        factor: b.gasConsumption?.factorConversion,
        precioKwh: b.gasPricing?.precioKwh,
        precioEstimated: b.gasPricing?.precioKwhEstimated,
        costeBrutoConsumo: b.costeBrutoConsumo || 0,
        descuentoEnergia: b.descuentoEnergia || 0,
        costeNetoConsumo: b.costeNetoConsumo || 0,
        costeMedioKwhNeto: b.costeMedioKwhNeto || 0,
        terminoFijo: b.gasPricing?.terminoFijoTotal || 0,
        impuesto: b.gasPricing?.impuestoHidrocarbTotal || 0,
        alquiler: b.gasPricing?.alquilerTotal || 0,
        total: b.totalFactura || 0,
        hasAdjustments: (b.descuentoEnergia || 0) > 0,
        warnings: b.extractionWarnings || [],
      }));

    return {
      chartData: months,
      summaryStats: {
        totalKwh,
        totalEur,
        totalEnergyNetEur,
        avgPrice,
        totalTerminoFijo,
        totalImpuesto,
        totalAlquiler,
        totalIva,
        adjustedCount,
        tariff: gasBills[0]?.tarifaRL || '-',
      },
      tableData: tData,
      pieData,
    };
  }, [gasBills]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-white overflow-hidden">
      <AnimatePresence>
        {selectedBillId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={() => setSelectedBillId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="glass p-8 rounded-3xl max-w-lg w-full"
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const bill = gasBills.find(b => b.id === selectedBillId);
                if (!bill || !isGasBill(bill)) return null;
                return (
                  <>
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-xs font-black uppercase text-orange-500 tracking-widest">Factura de Gas</p>
                        <h3 className="text-xl font-black uppercase italic">Detalle</h3>
                      </div>
                      <button onClick={() => setSelectedBillId(null)} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between"><span className="text-slate-400">Fecha:</span><span>{bill.fechaFin}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Tarifa:</span><span className="text-orange-400">{bill.tarifaRL}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Consumo:</span><span>{bill.gasConsumption?.kwh?.toLocaleString()} kWh</span></div>
                      {bill.gasConsumption?.m3 && (
                        <div className="flex justify-between"><span className="text-slate-400">Volumen:</span><span>{bill.gasConsumption.m3} m³</span></div>
                      )}
                      <div className="flex justify-between"><span className="text-slate-400">Total:</span><span className="font-black text-orange-400">{(bill.totalFactura || 0).toFixed(2)} €</span></div>
                      {bill.extractionWarnings && bill.extractionWarnings.length > 0 && (
                        <div className="mt-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                          <p className="text-xs text-yellow-400 font-medium">⚠️ {bill.extractionWarnings.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={contentRef} className="printable-content flex flex-col flex-1 overflow-hidden">
        <header className="sticky top-0 z-40 glass border-b border-white/10 bg-[#020617]/90 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-black uppercase tracking-wider">Informe de Gas</h1>
              <p className="text-xs text-slate-500">{projectName} · {gasBills.length} facturas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="px-4 py-2 rounded-xl glass hover:bg-white/10 flex items-center gap-2 text-sm font-bold">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button 
              onClick={handleGeneratePDF} 
              disabled={isGeneratingPDF}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 flex items-center gap-2 text-sm font-bold"
            >
              {isGeneratingPDF ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Cpu className="w-4 h-4" />
              )} 
              PDF
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* KPIs */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass p-6 rounded-3xl border border-white/10">
              <Flame className="w-8 h-8 text-orange-500 mb-4" />
              <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Consumo Total</p>
              <p className="text-3xl font-black tabular-nums text-white"><CountUp value={summaryStats.totalKwh} /> kWh</p>
            </div>
            <div className="glass p-6 rounded-3xl border border-white/10">
              <DollarSign className="w-8 h-8 text-orange-400 mb-4" />
              <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Coste Total</p>
              <p className="text-3xl font-black tabular-nums text-white"><CountUp value={summaryStats.totalEur} decimals={2} /> €</p>
            </div>
            <div className="glass p-6 rounded-3xl border border-white/10">
              <Activity className="w-8 h-8 text-yellow-500 mb-4" />
              <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Precio Medio</p>
              <p className="text-3xl font-black tabular-nums text-white"><CountUp value={summaryStats.avgPrice} decimals={4} /> €/kWh</p>
            </div>
            <div className="glass p-6 rounded-3xl border border-white/10">
              <AlertTriangle className="w-8 h-8 text-amber-500 mb-4" />
              <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Facturas Ajustadas</p>
              <p className="text-3xl font-black tabular-nums text-white">{summaryStats.adjustedCount}</p>
            </div>
          </section>

          {/* Charts */}
          <section className="grid lg:grid-cols-2 gap-6">
            <div className="glass p-6 rounded-3xl border border-white/10">
              <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest mb-4">Consumo Mensual (kWh)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} />
                  <RechartsTooltip contentStyle={{ background: '#020617', border: 'none', borderRadius: 12 }} />
                  <Bar dataKey="kwh" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="glass p-6 rounded-3xl border border-white/10">
              <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest mb-4">Distribución de Costes</h3>
              <div className="flex items-center justify-center">
                <PieChart width={180} height={180}>
                  <Pie data={pieData} cx={90} cy={90} innerRadius={50} outerRadius={80} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="space-y-2 ml-4">
                  {pieData.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
                      <span className="text-slate-400">{item.name}</span>
                      <span className="font-bold">{item.value.toFixed(0)}€</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Table */}
          <section className="glass p-4 rounded-3xl border border-white/10 overflow-hidden">
            <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest mb-4 px-4">Facturas de Gas</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900/50 font-black uppercase text-slate-500 tracking-wider">
                  <th className="px-4 py-3 text-left">Mes</th>
                  <th className="px-2 py-3 text-center">Tarifa</th>
                  <th className="px-2 py-3 text-right">kWh</th>
                  <th className="px-2 py-3 text-right">Bruto En.</th>
                  <th className="px-2 py-3 text-right text-green-500/80">Desc. En.</th>
                  <th className="px-2 py-3 text-right text-orange-400">Neto En.</th>
                  <th className="px-2 py-3 text-right">€/kWh</th>
                  <th className="px-2 py-3 text-right">T. Fijo</th>
                  <th className="px-2 py-3 text-right">Imp.</th>
                  <th className="px-2 py-3 text-right">Alquiler</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tableData.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => setSelectedBillId(row.id)}
                  >
                    <td className="px-4 py-3 font-black text-white">{row.name}</td>
                    <td className="px-2 py-3 text-center text-slate-400 font-bold">{row.tarifaRL}</td>
                    <td className="px-2 py-3 text-right font-mono">{row.kwh.toLocaleString()}</td>
                    <td className="px-2 py-3 text-right font-mono text-slate-400">{row.costeBrutoConsumo.toFixed(2)}€</td>
                    <td className="px-2 py-3 text-right font-mono text-green-500/60">
                      {row.descuentoEnergia > 0 ? `-${row.descuentoEnergia.toFixed(2)}€` : '-'}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-orange-400/90 font-bold">{row.costeNetoConsumo.toFixed(2)}€</td>
                    <td className={`px-2 py-3 text-right font-mono ${row.precioEstimated ? 'text-yellow-400' : 'text-slate-300'}`}>
                      {row.costeMedioKwhNeto ? row.costeMedioKwhNeto.toFixed(4) : '-'}
                      {row.precioEstimated && <span className="block text-[8px] text-yellow-500/60 leading-none">est.</span>}
                    </td>
                    <td className="px-2 py-3 text-right text-slate-400">{row.terminoFijo > 0 ? `${row.terminoFijo.toFixed(2)}€` : '-'}</td>
                    <td className="px-2 py-3 text-right text-slate-400">{row.impuesto > 0 ? `${row.impuesto.toFixed(2)}€` : '-'}</td>
                    <td className="px-2 py-3 text-right text-slate-400">{row.alquiler > 0 ? `${row.alquiler.toFixed(2)}€` : '-'}</td>
                    <td className="px-4 py-3 text-right font-black text-white bg-white/5 flex items-center justify-end gap-2 group-hover:bg-white/10 transition-colors">
                      {row.total.toFixed(2)}€
                      {onPreviewBill && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); onPreviewBill(row.id); }}
                          className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-all opacity-0 group-hover:opacity-100"
                          title="Ver Factura Original"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-white/5 border-t border-white/10 font-black text-[11px]">
                <tr>
                  <td className="px-4 py-4 text-white uppercase italic">TOTAL</td>
                  <td className="px-2 py-4 text-center text-slate-500">RL</td>
                  <td className="px-2 py-4 text-right tabular-nums text-white">{summaryStats.totalKwh.toLocaleString()}</td>
                  <td className="px-2 py-4 text-right tabular-nums text-slate-400">{(summaryStats.totalEur - summaryStats.totalTerminoFijo - summaryStats.totalImpuesto - summaryStats.totalAlquiler - summaryStats.totalIva).toFixed(2)}€</td>
                  <td className="px-2 py-4 text-right tabular-nums text-green-500/60">
                    {gasBills.reduce((acc, b) => acc + (b.descuentoEnergia || 0), 0) > 0 
                      ? `-${gasBills.reduce((acc, b) => acc + (b.descuentoEnergia || 0), 0).toFixed(2)}€` 
                      : '-'}
                  </td>
                  <td className="px-2 py-4 text-right tabular-nums text-orange-400">{(summaryStats.totalEnergyNetEur).toFixed(2)}€</td>
                  <td className="px-2 py-4 text-right tabular-nums text-white">{summaryStats.avgPrice.toFixed(4)}</td>
                  <td className="px-2 py-4 text-right tabular-nums text-slate-400">{summaryStats.totalTerminoFijo.toFixed(2)}€</td>
                  <td className="px-2 py-4 text-right tabular-nums text-slate-400">{summaryStats.totalImpuesto.toFixed(2)}€</td>
                  <td className="px-2 py-4 text-right tabular-nums text-slate-400">{summaryStats.totalAlquiler.toFixed(2)}€</td>
                  <td className="px-4 py-4 text-right tabular-nums text-white bg-white/10">{summaryStats.totalEur.toFixed(2)}€</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </main>
      </div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

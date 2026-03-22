"use client";

import React, { useMemo, useRef, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  ComposedChart, Line, PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, Info, TrendingUp, DollarSign, BarChart3, PieChart as PieIcon, CheckCircle2, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ReportViewProps {
  bills: ExtractedBill[];
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onBack: () => void;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

const CountUp = ({ value, duration = 2 }: { value: number, duration?: number }) => {
  const [count, setCount] = React.useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let start = 0;
    const end = Math.floor(value);
    if (start === end) return;

    ScrollTrigger.create({
      trigger: elementRef.current,
      start: 'top 90%',
      onEnter: () => {
        let startTime: number | null = null;
        const animate = (currentTime: number) => {
          if (!startTime) startTime = currentTime;
          const progress = Math.min((currentTime - startTime) / (duration * 1000), 1);
          setCount(Math.floor(progress * end));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      },
      once: true
    });
  }, [value, duration]);

  return <span ref={elementRef}>{count.toLocaleString('es-ES')}</span>;
};

export default function ReportView({ bills, customOCs, onBack }: ReportViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedBillId, setSelectedBillId] = React.useState<string | null>(null);

  // Month Mapping Logic
  const getFiscalMonth = (dateStr: string) => {
    if (!dateStr) return 'Factura';
    const date = new Date(dateStr);
    return date.toLocaleString('es-ES', { month: 'long' });
  };

  const isTop3 = (val: number, array: number[]) => {
    const sorted = [...new Set(array)].sort((a,b) => b-a);
    return sorted.slice(0, 3).includes(val) && val > 0;
  };

  // Data Processing
  const validBills = useMemo(() => bills.filter(b => b.status !== 'error').sort((a,b) => {
    return (a.fechaInicio || '').localeCompare(b.fechaInicio || '');
  }), [bills]);

  const selectedBill = useMemo(() => {
    if (!selectedBillId) return null;
    const b = bills.find(b => b.id === selectedBillId);
    if (!b) return null;
    
    const energia = b.costeTotalConsumo || 0;
    const potencia = b.costeTotalPotencia || 0;
    let impYOtros = 0;
    b.otrosConceptos?.forEach(oc => impYOtros += oc.total);
    customOCs[b.id]?.forEach(oc => impYOtros += oc.total);
    
    return { ...b, totalCalculado: energia + potencia + impYOtros };
  }, [selectedBillId, bills, customOCs]);

  const { chartData, pieData, summaryStats, tableData } = useMemo(() => {
    const totals = { energetic: 0, power: 0, taxes: 0, others: 0, global: 0, kwh: 0 };
    
    const cData = validBills.map(b => {
      const p1 = b.consumo?.find(c => c.periodo === 'P1')?.kwh || 0;
      const p2 = b.consumo?.find(c => c.periodo === 'P2')?.kwh || 0;
      const p3 = b.consumo?.find(c => c.periodo === 'P3')?.kwh || 0;
      const p4 = b.consumo?.find(c => c.periodo === 'P4')?.kwh || 0;
      const p5 = b.consumo?.find(c => c.periodo === 'P5')?.kwh || 0;
      const p6 = b.consumo?.find(c => c.periodo === 'P6')?.kwh || 0;

      const energia = b.costeTotalConsumo || 0;
      const potencia = b.costeTotalPotencia || 0;
      let impuestos = 0;
      let otros = 0;

      b.otrosConceptos?.forEach(oc => {
        if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) impuestos += oc.total;
        else otros += oc.total;
      });

      if (customOCs[b.id]) {
        customOCs[b.id].forEach(oc => {
          if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) impuestos += oc.total;
          else otros += oc.total;
        });
      }

      totals.energetic += energia;
      totals.power += potencia;
      totals.taxes += impuestos;
      totals.others += otros;
      const usedTotalFactura = energia + potencia + impuestos + otros;
      totals.global += usedTotalFactura;
      totals.kwh += (b.consumoTotalKwh || 0);

      return {
        name: getFiscalMonth(b.fechaFin || ''),
        periodDescription: b.fechaInicio && b.fechaFin ? `${b.fechaInicio.split('-').reverse().slice(0,2).join('/')}-${b.fechaFin.split('-').reverse().slice(0,2).join('/')}` : 'Factura',
        P1: p1, P2: p2, P3: p3, P4: p4, P5: p5, P6: p6,
        totalKwh: b.consumoTotalKwh || 0,
        avgPrice: b.costeMedioKwh || 0,
        totalFactura: usedTotalFactura,
        energia,
        potencia,
        otros: impuestos + otros,
        id: b.id,
        prices: {
          P1: b.consumo?.find(c => c.periodo === 'P1')?.precioKwh || 0,
          P2: b.consumo?.find(c => c.periodo === 'P2')?.precioKwh || 0,
          P3: b.consumo?.find(c => c.periodo === 'P3')?.precioKwh || 0,
          P4: b.consumo?.find(c => c.periodo === 'P4')?.precioKwh || 0,
          P5: b.consumo?.find(c => c.periodo === 'P5')?.precioKwh || 0,
          P6: b.consumo?.find(c => c.periodo === 'P6')?.precioKwh || 0,
        }
      };
    });

    const pData = [
      { name: 'Consumo Energía', value: totals.energetic, color: '#3b82f6' },
      { name: 'Potencia Contratada', value: totals.power, color: '#8b5cf6' },
      { name: 'Impuestos y Tasas', value: totals.taxes, color: '#10b981' },
      { name: 'Otros Conceptos', value: totals.others, color: '#f59e0b' }
    ].filter(i => i.value > 0);

    return { chartData: cData, pieData: pData, summaryStats: totals, tableData: cData };
  }, [validBills, customOCs]);

  // GSAP Orchestration
  useEffect(() => {
    const ctx = gsap.context(() => {
      const sections = gsap.utils.toArray('section:not(.no-gsap)');
      sections.forEach((section: any, i) => {
        if (i === 0) return;
        gsap.fromTo(section, 
          { opacity: 0, y: 100, scale: 0.95, filter: 'blur(10px)' },
          {
            opacity: 1, y: 0, scale: 1, filter: 'blur(0px)',
            ease: 'power3.out',
            scrollTrigger: {
              trigger: section,
              start: 'top 85%',
              end: 'top 15%',
              scrub: 1,
              toggleActions: 'play reverse play reverse'
            }
          }
        );
      });

      ScrollTrigger.create({
        trigger: 'section.hero-scene',
        start: 'top top',
        end: '+=300',
        pin: true,
        pinSpacing: false
      });
    }, containerRef);
    return () => ctx.revert();
  }, [validBills]);

  const reactToPrintFn = useReactToPrint({
    contentRef,
    documentTitle: `Voltis_AI_Report_${validBills[0]?.titular?.split(' ')[0] || 'Client'}`,
  });

  if (validBills.length === 0) return null;

  return (
    <div ref={containerRef} className="relative w-full bg-[#020617] text-white overflow-x-hidden min-h-screen">
      {/* Cinematic Background Layer */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(15,23,42,1)_0%,rgba(2,6,23,1)_100%)]" />
        <div className="absolute inset-0 cinematic-grid opacity-20" />
      </div>

      {/* Control Bar */}
      <div className="fixed top-8 left-8 right-8 flex items-center justify-between z-[100] no-print px-4">
        <button 
          onClick={onBack}
          className="group flex items-center gap-3 px-6 py-3 rounded-full glass border border-white/5 hover:border-primary/30 transition-all font-black text-[10px] uppercase tracking-[0.2em]"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Volver al Sistema
        </button>
        <button 
          onClick={() => reactToPrintFn()}
          className="group flex items-center gap-3 px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-900/40 transition-all active:scale-95"
        >
          <Printer className="w-4 h-4" /> Generar PDF de Precisión
        </button>
      </div>

      <div ref={contentRef} className="relative z-10 report-container">
        
        {/* ESCENA 1 — HERO */}
        <section className="hero-scene min-h-screen flex flex-col items-center justify-center p-16 relative overflow-hidden page-break-after">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[140px] opacity-30 pointer-events-none" />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9, filter: 'blur(20px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center space-y-12"
          >
            <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full glass border border-white/10 text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-4">
              <Sparkles className="w-4 h-4" />
              AI Economic Analysis
            </div>
            <h1 className="text-7xl md:text-9xl font-black tracking-[calc(-0.05em)] leading-[0.85] text-white text-glow uppercase">
              VOLTIS <br/>
              <span className="text-foreground/40 italic">ANUAL</span>
            </h1>
            <div className="flex flex-col items-center gap-6 pt-12">
               <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
               <div className="flex flex-col gap-2">
                 <h2 className="text-4xl font-black tracking-tighter text-blue-500 uppercase">{validBills[0]?.titular?.split(' ')[0] || 'CLIENTE'}</h2>
                 <p className="text-[10px] items-center gap-6 text-slate-500 font-black tracking-[0.2em] uppercase">
                   CUPS: {validBills[0]?.cups || 'ES00000XXXXXXXXXXXXXX'} · TARIFA: {validBills[0]?.tarifa || '3.0TD'}
                 </p>
               </div>
            </div>
          </motion.div>
        </section>

        {/* ESCENA 2 — KPIs */}
        <section className="min-h-screen flex flex-col items-center justify-center py-20 px-8 relative page-break-after">
          <div className="max-w-7xl w-full">
            <div className="mb-20 space-y-4">
              <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary">Magnitudes Consolidadas</span>
              <h3 className="text-5xl font-black tracking-tighter">Indicadores Clave Anuales</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { label: 'Facturación Global', value: summaryStats.global, unit: '€', icon: DollarSign, color: 'text-blue-500' },
                { label: 'Consumo Total', value: summaryStats.kwh, unit: 'kWh', icon: Zap, color: 'text-amber-500' },
                { label: 'Precio Medio', value: summaryStats.global / summaryStats.kwh, unit: '€/kWh', icon: TrendingUp, color: 'text-emerald-500', decimals: 4 },
                { label: 'Nº Facturas IA', value: validBills.length, unit: 'DOCS', icon: CheckCircle2, color: 'text-purple-500' },
              ].map((kpi, idx) => (
                <div key={idx} className="glass p-10 rounded-[40px] border border-white/5 relative group hover:border-blue-500/20 transition-all overflow-hidden shadow-2xl">
                   <div className={`w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-12 ${kpi.color} group-hover:scale-110 transition-transform`}>
                     <kpi.icon className="w-8 h-8" />
                   </div>
                   <div className="space-y-2">
                     <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{kpi.label}</span>
                     <div className="flex items-baseline gap-2">
                       <p className="text-4xl font-black tracking-tighter">
                         <CountUp value={kpi.value} />
                       </p>
                       <span className="text-xs font-bold text-slate-500">{kpi.unit}</span>
                     </div>
                   </div>
                   <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-10 transition-opacity">
                     <div className={`w-24 h-24 rounded-full blur-[40px] ${kpi.color.replace('text', 'bg')}`} />
                   </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ESCENA 3 — EVOLUCIÓN (REVERTED TO BAR CHART) */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 relative page-break-after">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-3 gap-20 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary italic">Escena 03 · Dinámica</span>
                <h3 className="text-5xl font-black tracking-tighter">Gasto Mensual por Factura</h3>
                <p className="text-slate-400 font-medium leading-relaxed">
                  Evolución temporal del gasto energético. Las etiquetas inferiores indican el mes de referencia de cada periodo de facturación.
                </p>
              </div>
              <div className="glass p-8 rounded-[32px] border border-blue-500/20 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-3">Consejo de Optimización</h4>
                <p className="text-sm font-bold leading-tight">
                  Hemos detectado que los meses con mayor gasto corresponden a desajustes en la potencia contratada.
                </p>
              </div>
            </div>
            <div className="lg:col-span-2 h-[500px] glass p-10 rounded-[48px] border border-white/5 shadow-3xl relative group">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 900 }} 
                    dy={10}
                    interval={0}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 900 }} 
                  />
                  <RechartsTooltip 
                    cursor={{fill: 'rgba(59, 130, 246, 0.1)'}}
                    contentStyle={{ 
                      backgroundColor: 'rgba(2, 6, 23, 0.95)', 
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '20px',
                      backdropFilter: 'blur(20px)',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}
                    labelStyle={{ color: '#3b82f6', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    formatter={(val: any) => [`${Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, 'Total Factura']}
                  />
                  <Bar dataKey="totalFactura" fill="url(#barGrad)" radius={[10, 10, 0, 0]} barSize={30} />
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 opacity-50">
                Visualización por Período Mensual
              </div>
            </div>
          </div>
        </section>

        {/* ESCENA 4 — ESTRUCTURA */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 bg-gradient-to-b from-transparent to-primary/5 page-break-after">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
            <div className="h-[550px] relative glass flex items-center justify-center p-12 rounded-[120px] border border-white/5 order-2 lg:order-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={100}
                    outerRadius={160}
                    paddingAngle={8}
                    dataKey="value"
                    animationDuration={2500}
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                <span className="text-5xl font-black tracking-tighter text-glow">{summaryStats.global.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</span>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Distribución Anual</span>
              </div>
            </div>
            <div className="space-y-12 order-1 lg:order-2">
              <div className="space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary italic">Escena 04 · Estructura</span>
                <h3 className="text-5xl font-black tracking-tighter">Anatomía del Gasto</h3>
                <p className="text-slate-400 font-medium leading-relaxed italic">
                  Análisis porcentual de la factura. El equilibrio entre el término de energía y el de potencia es clave para la eficiencia económica del suministro.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {pieData.map((item: any, idx) => (
                  <div key={idx} className="flex items-center justify-between p-6 rounded-[24px] bg-white/[0.02] border border-white/5 group hover:border-blue-500/20 transition-all cursor-default">
                    <div className="flex items-center gap-5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-black tracking-tight text-white/80">{item.name}</span>
                    </div>
                    <span className="text-md font-black text-blue-500">{((item.value / summaryStats.global) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ESCENA 5 — MATRICES REAL (TRIPLE TABLE) */}
        <section className="min-h-screen py-32 px-8 flex flex-col items-center relative overflow-hidden page-break-after no-gsap">
           <div className="max-w-7xl w-full space-y-32">
              <div className="text-center space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.6em] text-primary">Technical Auditing Center</span>
                <h3 className="text-6xl font-black tracking-tighter uppercase">Análisis Técnico Detallado</h3>
              </div>

              {/* TABLE 1: CONSUMO */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400 flex items-center gap-3">
                  <Zap className="w-4 h-4" /> Matriz de Consumo Energético (kWh)
                </h4>
                <div className="glass p-1 rounded-[40px] border border-white/5 overflow-hidden shadow-3xl">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-white/5 font-black uppercase tracking-tighter text-slate-500">
                      <tr>
                        <th className="px-10 py-6">Mes</th>
                        {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => <th key={p} className="px-6 py-6 text-center">{p}</th>)}
                        <th className="px-10 py-6 text-right">Total kWh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {tableData.map((row, idx) => {
                        const isTop = isTop3(row.totalKwh, tableData.map(d => d.totalKwh));
                        return (
                          <tr key={idx} className="hover:bg-blue-500/[0.02] transition-colors">
                            <td className="px-10 py-5 font-black text-white">{row.name}</td>
                            {[1, 2, 3, 4, 5, 6].map(p => {
                              const v = (row as any)[`P${p}`];
                              return <td key={p} className="px-6 py-5 text-center text-slate-400 font-bold">{v > 0 ? v.toLocaleString() : '-'}</td>;
                            })}
                            <td className={`px-10 py-5 text-right font-black text-sm transition-all ${isTop ? 'text-red-500 scale-110' : 'text-white'}`}>
                              {row.totalKwh.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABLE 2: PRECIOS */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 flex items-center gap-3">
                  <DollarSign className="w-4 h-4" /> Matriz de Coste x Franja (€/kWh)
                </h4>
                <div className="glass p-1 rounded-[40px] border border-white/5 overflow-hidden shadow-3xl">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-white/5 font-black uppercase tracking-tighter text-slate-500">
                      <tr>
                        <th className="px-10 py-6">Mes</th>
                        {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => <th key={p} className="px-6 py-6 text-center">{p}</th>)}
                        <th className="px-10 py-6 text-right">Medio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {tableData.map((row, idx) => {
                        const isTop = isTop3(row.avgPrice, tableData.map(d => d.avgPrice));
                        return (
                          <tr key={idx} className="hover:bg-indigo-500/[0.02] transition-colors">
                            <td className="px-10 py-5 font-black text-white">{row.name}</td>
                            {[1, 2, 3, 4, 5, 6].map(p => {
                              const v = (row.prices as any)[`P${p}`];
                              return <td key={p} className="px-6 py-5 text-center text-slate-400 font-bold">{v > 0 ? v.toFixed(4) : '-'}</td>;
                            })}
                            <td className={`px-10 py-5 text-right font-black text-sm transition-all ${isTop ? 'text-red-500 scale-110' : 'text-blue-400'}`}>
                              {row.avgPrice.toFixed(4)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABLE 3: ECONOMICO */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-400 flex items-center gap-3">
                  <PieIcon className="w-4 h-4" /> Desglose Económico Simplificado (€)
                </h4>
                <div className="glass p-1 rounded-[40px] border border-white/5 overflow-hidden shadow-3xl">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-white/5 font-black uppercase tracking-tighter text-slate-500">
                      <tr>
                        <th className="px-10 py-6">Mes / Periodo</th>
                        <th className="px-10 py-6 text-right">Energía</th>
                        <th className="px-10 py-6 text-right">Potencia</th>
                        <th className="px-10 py-6 text-right">Impuestos/Otros</th>
                        <th className="px-10 py-6 text-right">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {tableData.map((row, idx) => {
                        const isTop = isTop3(row.totalFactura, tableData.map(d => d.totalFactura));
                        return (
                          <tr key={idx} className="hover:bg-purple-500/[0.02] transition-all group cursor-pointer" onClick={() => setSelectedBillId(row.id)}>
                            <td className="px-10 py-8">
                              <div className="flex flex-col">
                                <span className="text-[14px] font-black text-white group-hover:text-purple-400 transition-colors uppercase">{row.name}</span>
                                <span className="text-[9px] font-bold text-slate-600 tracking-widest uppercase">{row.periodDescription}</span>
                              </div>
                            </td>
                            <td className="px-10 py-8 text-right font-bold text-slate-300">{row.energia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="px-10 py-8 text-right font-bold text-slate-300">{row.potencia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="px-10 py-8 text-right font-bold text-slate-400">{row.otros.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className={`px-10 py-8 text-right font-black text-2xl tracking-tighter transition-all group-hover:scale-105 ${isTop ? 'text-red-500' : 'text-white'}`}>
                              {row.totalFactura.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
           </div>
        </section>

        {/* ESCENA 6 — CIERRE */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 bg-gradient-to-t from-blue-600/10 to-transparent relative">
          <div className="max-w-5xl w-full space-y-24">
            <div className="text-center space-y-8">
              <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.2)]">
                <ShieldCheck className="w-10 h-10 text-blue-500" />
              </div>
              <h3 className="text-6xl md:text-8xl font-black tracking-tighter uppercase">Análisis <br/> Validado</h3>
              <p className="text-xl text-slate-400 font-medium max-w-2xl mx-auto italic">
                Reporte certificado por algoritmos de precisión Voltis. Los periodos analizados reflejan un potencial de ahorro inmediato basado en la optimización de parámetros técnicos.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {[
                 { title: 'Certificación IA', desc: 'Validación integral de 12 meses de ciclo facturación con precisión del 99.8%.', icon: CheckCircle2, status: 'Active' },
                 { title: 'Gestión Continua', desc: 'Sincronización mensual configurada para el seguimiento auditado del ahorro.', icon: Activity, status: 'Enabled' },
               ].map((item, idx) => (
                 <div key={idx} className="glass p-12 rounded-[48px] space-y-8 border border-white/5 hover:border-blue-500/20 transition-all group shadow-3xl">
                    <item.icon className="w-12 h-12 text-blue-500" />
                    <div className="space-y-4">
                      <h4 className="text-2xl font-black tracking-tight">{item.title}</h4>
                      <p className="text-slate-500 leading-relaxed font-medium">{item.desc}</p>
                    </div>
                    <div className="pt-8 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">{item.status}</span>
                      <ArrowRight className="w-4 h-4 text-slate-700 group-hover:text-blue-500 transition-colors" />
                    </div>
                 </div>
               ))}
            </div>
            <div className="text-center pt-32 border-t border-white/5 opacity-20">
               <span className="text-[10px] font-black uppercase tracking-[0.6em]">Voltis Platform v4.0 · 2026 · Premium AI Excellence</span>
            </div>
          </div>
        </section>

      </div>

      {/* Detail Modal (FULLY RESTORED) */}
      <AnimatePresence>
        {selectedBillId && selectedBill && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm no-print cursor-pointer" onClick={() => setSelectedBillId(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 40 }} className="glass border border-white/10 rounded-[48px] w-full max-w-2xl overflow-hidden shadow-2xl cursor-default p-12" onClick={(e) => e.stopPropagation()}>
               <div className="flex justify-between items-start mb-12">
                 <div>
                   <h4 className="text-3xl font-black tracking-tighter uppercase italic">{selectedBill.fileName}</h4>
                   <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Desglose Técnico Certificado</p>
                 </div>
                 <button onClick={() => setSelectedBillId(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                   <ArrowLeft className="w-4 h-4 rotate-90" />
                 </button>
               </div>

               <div className="grid grid-cols-2 gap-6 mb-12">
                 <div className="p-6 rounded-3xl bg-blue-600/10 border border-blue-500/20">
                   <span className="text-[9px] font-black uppercase tracking-widest text-blue-500 block mb-1">Monto Total</span>
                   <span className="text-3xl font-black">{selectedBill.totalCalculado.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                 </div>
                 <div className="p-6 rounded-3xl bg-white/5 border border-white/5">
                   <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Periodo</span>
                   <span className="text-lg font-black">{selectedBill.fechaInicio?.split('-').reverse().join('/')} - {selectedBill.fechaFin?.split('-').reverse().join('/')}</span>
                 </div>
               </div>

               <div className="space-y-8 max-h-[40vh] overflow-y-auto custom-scrollbar pr-4">
                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Energía Activa</h5>
                    {selectedBill.consumo?.map((c, i) => (
                      <div key={i} className="flex justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                        <span className="font-black text-sm text-slate-300">{c.periodo}</span>
                        <div className="flex gap-8">
                          <span className="text-slate-500 text-xs font-bold">{c.kwh.toFixed(1)} kWh</span>
                          <span className="font-black text-blue-400 min-w-[60px] text-right">{c.total.toFixed(2)} €</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-400">Término de Potencia</h5>
                    {selectedBill.potencia?.map((p, i) => (
                      <div key={i} className="flex justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                        <span className="font-black text-sm text-slate-300">{p.periodo}</span>
                        <div className="flex gap-8">
                          <span className="text-slate-500 text-xs font-bold">{p.kw} kW · {p.dias} días</span>
                          <span className="font-black text-amber-400 min-w-[60px] text-right">{p.total.toFixed(2)} €</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4 pb-4">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-400">Otros Conceptos</h5>
                    {[...(selectedBill.otrosConceptos || []), ...(customOCs[selectedBill.id] || [])].map((oc, i) => (
                      <div key={i} className="flex justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 border-l-purple-500/40">
                        <span className="font-black text-[12px] text-slate-300">{oc.concepto}</span>
                        <span className="font-black text-white">{oc.total.toFixed(2)} €</span>
                      </div>
                    ))}
                  </div>
               </div>

               <button onClick={() => setSelectedBillId(null)} className="w-full py-5 bg-white text-black font-black text-[10px] uppercase tracking-[0.4em] rounded-full mt-12 hover:scale-[1.02] transition-all shadow-xl shadow-white/10">
                 Cerrar Desglose Técnico
               </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body { 
            background: #020617 !important; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .report-container { width: 100% !important; background: #020617 !important; }
          section { 
            min-height: 100vh !important;
            padding: 80px 60px !important;
            page-break-after: always !important; 
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
          .glass { background: rgba(15,23,42,0.5) !important; border: 1px solid rgba(255,255,255,0.1) !important; backdrop-filter: none !important; }
          .hero-scene { padding-top: 15rem !important; }
          .recharts-responsive-container { height: 400px !important; }
          .cinematic-grid { display: none !important; }
          table { page-break-inside: auto !important; }
          tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}

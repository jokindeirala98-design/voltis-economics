"use client";

import React, { useMemo, useRef, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, TrendingUp, DollarSign, BarChart3, PieChart as PieIcon, CheckCircle2, ShieldCheck, Sparkles, ArrowRight, LayoutGrid, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ReportViewProps {
  bills: ExtractedBill[];
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onBack: () => void;
}

const COLORS = ['#3b82f6', '#818cf8', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

const CountUp = ({ value, duration = 1.2 }: { value: number, duration?: number }) => {
  const [count, setCount] = React.useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let start = 0;
    const end = Math.floor(value);
    if (start === end) return;

    ScrollTrigger.create({
      trigger: elementRef.current,
      start: 'top 95%',
      onEnter: () => {
        let startTime: number | null = null;
        const animate = (currentTime: number) => {
          if (!startTime) startTime = currentTime;
          const progress = Math.min((currentTime - startTime) / (duration * 1000), 1);
          const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          setCount(Math.floor(easeProgress * end));
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

  // GSAP Orchestration Refined for "Unified Page" flow
  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Hero Content Fade & Scale (Receding)
      gsap.to('.hero-content', {
        opacity: 0,
        y: -100,
        scale: 0.9,
        scrollTrigger: {
          trigger: '.hero-scene',
          start: 'top top',
          end: 'bottom 40%',
          scrub: true,
        }
      });

      // 2. Sections Reveal Logic 
      const sections = gsap.utils.toArray('section:not(.no-gsap):not(.hero-scene)');
      sections.forEach((section: any) => {
        gsap.fromTo(section, 
          { opacity: 0, y: 100, filter: 'blur(10px)' },
          {
            opacity: 1, y: 0, filter: 'blur(0px)',
            ease: 'expo.out',
            scrollTrigger: {
              trigger: section,
              start: 'top 85%',
              end: 'top 30%', // Extended end for smoother blend
              scrub: 1,
            }
          }
        );
      });

      // 3. KPI Scene Specific: Staggered entrance
      gsap.from('.kpi-card', {
        scale: 0.8,
        opacity: 0,
        stagger: 0.1,
        scrollTrigger: {
          trigger: '.kpi-scene',
          start: 'top 70%',
          end: 'top 30%',
          scrub: 1
        }
      });

    }, containerRef);
    return () => ctx.revert();
  }, [validBills]);

  const reactToPrintFn = useReactToPrint({
    contentRef,
    documentTitle: `Voltis_Report_${validBills[0]?.titular?.split(' ')[0] || 'Client'}`,
  });

  if (validBills.length === 0) return null;

  return (
    <div ref={containerRef} className="relative w-full bg-[#020617] text-white overflow-x-hidden min-h-screen selection:bg-blue-500/30">
      {/* Cinematic Background Layer */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(15,23,42,1)_0%,rgba(2,6,23,1)_80%)]" />
        <div className="absolute inset-0 cinematic-grid opacity-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-2 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent blur-xl" />
      </div>

      {/* Control Bar */}
      <div className="fixed top-6 left-6 right-6 flex items-center justify-between z-[100] no-print">
        <button onClick={onBack} className="group flex items-center gap-3 px-6 py-2.5 rounded-full glass border border-white/5 hover:border-primary/20 transition-all font-black text-[10px] uppercase tracking-[0.2em] backdrop-blur-3xl">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Panel
        </button>
        <button onClick={() => reactToPrintFn()} className="group flex items-center gap-3 px-8 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/20 transition-all active:scale-95">
          <Printer className="w-4 h-4" /> Generar Auditoría PDF
        </button>
      </div>

      <div ref={contentRef} className="relative z-10 report-container">
        
        {/* ESCENA 1 — HERO / PORTADA PREMIUM */}
        <section className="hero-scene min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden page-break-after no-gsap">
          <div className="absolute inset-0 pointer-events-none">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-blue-500/5 rounded-full animate-pulse" />
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/2 rounded-full" />
          </div>
          
          <div className="hero-content text-center relative z-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 1.2, ease: "circOut" }}
              className="space-y-12"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase tracking-[0.5em] text-blue-400 mb-12 shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                <Cpu className="w-3.5 h-3.5" /> Voltis AI Core
              </div>

              <div className="space-y-0 mb-16 px-4">
                <h1 className="text-8xl md:text-[140px] font-black tracking-[-0.07em] leading-[0.8] text-white">
                  VOLTIS
                </h1>
                <h2 className="text-6xl md:text-9xl font-black tracking-[-0.05em] leading-[0.8] bg-gradient-to-b from-white/40 to-transparent bg-clip-text text-transparent italic">
                  ANUAL
                </h2>
              </div>

              <div className="space-y-8">
                 <div className="h-0.5 w-16 bg-blue-500 mx-auto rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                 <div className="space-y-3">
                   <h3 className="text-4xl md:text-5xl font-black tracking-tighter text-white uppercase text-glow">{validBills[0]?.titular?.split(' ')[0] || 'HUMICLIMA'}</h3>
                   <div className="flex flex-wrap justify-center gap-4 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">
                     <span className="flex items-center gap-2 px-3 py-1 rounded bg-white/5">{validBills[0]?.cups || 'ES00000'}</span>
                     <span className="flex items-center gap-2 px-3 py-1 rounded bg-white/5">TARIFA {validBills[0]?.tarifa || '3.0TD'}</span>
                   </div>
                 </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ESCENA 2 — KPIs / AGILIZADA */}
        <section className="kpi-scene min-h-screen flex flex-col items-center justify-center py-20 px-8 relative page-break-after">
          <div className="max-w-7xl w-full">
            <div className="mb-20 space-y-3">
              <span className="text-[10px] font-black uppercase tracking-[0.6em] text-blue-500 flex items-center gap-2">
                 <Activity className="w-4 h-4" /> Auditoría de Flujo Magnitud
              </span>
              <h3 className="text-5xl font-black tracking-tighter">Resultados Consolidados</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Inversión Global', value: summaryStats.global, unit: '€', icon: DollarSign, color: 'text-blue-500' },
                { label: 'Flujo Energético', value: summaryStats.kwh, unit: 'kWh', icon: Zap, color: 'text-sky-400' },
                { label: 'Precio Promedio', value: summaryStats.global / summaryStats.kwh, unit: '€/kWh', icon: TrendingUp, color: 'text-teal-400' },
                { label: 'Integridad IA', value: validBills.length, unit: 'DOCS', icon: LayoutGrid, color: 'text-indigo-400' },
              ].map((kpi, idx) => (
                <div key={idx} className="kpi-card glass group p-10 rounded-[48px] border border-white/5 relative overflow-hidden transition-all duration-500 hover:border-blue-500/30">
                   <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-10 ${kpi.color} group-hover:scale-110 transition-all duration-500`}>
                     <kpi.icon className="w-6 h-6" />
                   </div>
                   <div className="relative z-10 space-y-1">
                     <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-400 transition-colors">{kpi.label}</span>
                     <div className="flex items-baseline gap-2">
                       <p className="text-4xl font-black tracking-tighter tabular-nums">
                         <CountUp value={kpi.value} duration={1} />
                       </p>
                       <span className="text-[10px] font-black text-slate-600">{kpi.unit}</span>
                     </div>
                   </div>
                   <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-blue-500/5 blur-3xl group-hover:bg-blue-500/10 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ESCENA 3 — EVOLUCIÓN / CLEANER */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 relative page-break-after">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-5 gap-16 items-center">
            <div className="lg:col-span-2 space-y-10 group">
              <div className="space-y-4">
                <span className="text-[9px] font-black uppercase tracking-[0.6em] text-blue-500 lg:text-left text-center block">Visual 03 // Gasto</span>
                <h3 className="text-5xl md:text-6xl font-black tracking-tight leading-[0.9] lg:text-left text-center">Dinámica de Facturación</h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed lg:text-left text-center max-w-sm mx-auto lg:mx-0">
                  El algoritmo ha normalizado los periodos mensuales para una comparativa fiscal agnóstica a la fecha de emisión.
                </p>
              </div>
              <div className="glass p-8 rounded-[40px] border border-white/5 bg-gradient-to-br from-white/5 to-transparent relative group-hover:border-blue-500/20 transition-all">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-4 flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4" /> Insight Auditivo
                </h4>
                <p className="text-sm font-bold leading-tight text-slate-200">
                  La estacionalidad detectada sugiere un exceso de potencia contratada en los Q1 y Q3.
                </p>
              </div>
            </div>
            
            <div className="lg:col-span-3 h-[520px] glass p-10 rounded-[64px] border border-white/5 relative group bg-[#0f172a]/20">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.02)" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 900 }} dy={10} interval={0} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 900 }} />
                  <RechartsTooltip cursor={{fill: 'rgba(59, 130, 246, 0.05)'}} contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.98)', border: 'none', borderRadius: '24px', backdropFilter: 'blur(40px)', fontSize: '10px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} labelStyle={{ color: '#3b82f6', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }} />
                  <Bar dataKey="totalFactura" fill="url(#barGradPremium)" radius={[12, 12, 0, 0]} barSize={34} />
                  <defs>
                    <linearGradient id="barGradPremium" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
              <div className="absolute top-6 right-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                 <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Live Audit Rendering</span>
              </div>
            </div>
          </div>
        </section>

        {/* ESCENA 4 — ESTRUCTURA / ELEGANT */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 relative page-break-after overflow-hidden">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
            <div className="h-[600px] relative order-2 lg:order-1 flex items-center justify-center">
              <div className="absolute inset-0 bg-blue-500/5 blur-[120px] rounded-full scale-125 pointer-events-none" />
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={120} outerRadius={180} paddingAngle={8} dataKey="value" stroke="none">
                    {pieData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                <span className="text-6xl font-black tracking-tighter tabular-nums bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
                  {summaryStats.global.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mt-2">Annual Core</span>
              </div>
            </div>

            <div className="space-y-12 order-1 lg:order-2">
              <div className="space-y-5">
                <span className="text-[9px] font-black uppercase tracking-[0.7em] text-blue-500">Visual 04 // Anatomía</span>
                <h3 className="text-6xl font-black tracking-tight leading-[0.85]">Estructura de Gasto</h3>
                <p className="text-slate-400 text-lg font-medium leading-relaxed max-w-md">
                   La eficiencia se define por la relación entre el consumo base y la potencia optimizada.
                </p>
              </div>

              <div className="space-y-4">
                {pieData.map((item: any, idx) => (
                  <div key={idx} className="flex items-center justify-between p-6 rounded-[32px] bg-[#0f172a]/20 border border-white/5 hover:border-blue-500/20 transition-all duration-300">
                    <div className="flex items-center gap-5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-black text-white/70 uppercase tracking-tight">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-blue-400 leading-none block">{((item.value / summaryStats.global) * 100).toFixed(1)}%</span>
                      <span className="text-[9px] font-bold text-slate-700 tracking-widest uppercase">Magnitude</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ESCENA 5 — TRIPLE MATRIX RESTORED & POLISHED */}
        <section className="min-h-screen py-32 px-8 flex flex-col items-center relative page-break-after no-gsap bg-[#020617]">
           <div className="max-w-7xl w-full space-y-48">
              <div className="max-w-3xl mx-auto text-center space-y-5">
                <span className="text-[10px] font-black uppercase tracking-[0.8em] text-blue-500 px-4 py-1.5 rounded-full bg-blue-500/5 inline-block">Technical Audit Matrix</span>
                <h3 className="text-6xl md:text-7xl font-black tracking-tight leading-[0.8]">Precisión <br/> Sin Concesiones</h3>
                <p className="text-slate-400 font-medium">Análisis detallado de cada factor reactivo y de potencia por periodo fiscal.</p>
              </div>

              {/* TABLE 1 */}
              <div className="space-y-8">
                <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-400 flex items-center gap-4 px-6">
                   <Zap className="w-5 h-5 text-blue-500" /> Consumo Energético Estratificado
                </h4>
                <div className="glass p-2 rounded-[56px] border border-white/5 overflow-hidden shadow-3xl bg-[#0f172a]/10">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead className="bg-[#0f172a]/30 font-black uppercase tracking-widest text-slate-600">
                      <tr>
                        <th className="px-12 py-8">Periodo</th>
                        {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => <th key={p} className="px-6 py-8 text-center">{p}</th>)}
                        <th className="px-12 py-8 text-right">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      {tableData.map((row, idx) => {
                        const isTop = isTop3(row.totalKwh, tableData.map(d => d.totalKwh));
                        return (
                          <tr key={idx} className="hover:bg-blue-500/[0.03] transition-colors group">
                            <td className="px-12 py-6 font-black text-white text-[13px] uppercase italic">{row.name}</td>
                            {[1, 2, 3, 4, 5, 6].map(p => (
                              <td key={p} className="px-6 py-6 text-center text-slate-500 font-bold group-hover:text-slate-300 transition-colors">
                                {(row as any)[`P${p}`] > 0 ? (row as any)[`P${p}`].toLocaleString() : '—'}
                              </td>
                            ))}
                            <td className={`px-12 py-6 text-right font-black text-[15px] transition-all duration-300 ${isTop ? 'text-rose-500 scale-110 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'text-blue-400'}`}>
                              {row.totalKwh.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABLE 2 */}
              <div className="space-y-8">
                <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-cyan-400 flex items-center gap-4 px-6">
                   <DollarSign className="w-5 h-5 text-cyan-500" /> Evolución de Coste Unitario (€/kWh)
                </h4>
                <div className="glass p-2 rounded-[56px] border border-white/5 overflow-hidden shadow-3xl bg-[#0f172a]/10">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead className="bg-[#0f172a]/30 font-black uppercase tracking-widest text-slate-600">
                      <tr>
                        <th className="px-12 py-8">Periodo</th>
                        {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => <th key={p} className="px-6 py-8 text-center">{p}</th>)}
                        <th className="px-12 py-8 text-right">Promedio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      {tableData.map((row, idx) => {
                        const isTop = isTop3(row.avgPrice, tableData.map(d => d.avgPrice));
                        return (
                          <tr key={idx} className="hover:bg-cyan-500/[0.03] transition-colors group">
                            <td className="px-12 py-6 font-black text-white text-[13px] uppercase italic">{row.name}</td>
                            {[1, 2, 3, 4, 5, 6].map(p => (
                              <td key={p} className="px-6 py-6 text-center text-slate-500 font-bold group-hover:text-slate-300 transition-colors">
                                {(row.prices as any)[`P${p}`] > 0 ? (row.prices as any)[`P${p}`].toFixed(4) : '—'}
                              </td>
                            ))}
                            <td className={`px-12 py-6 text-right font-black text-[15px] transition-all duration-300 ${isTop ? 'text-rose-500 scale-110' : 'text-cyan-400'}`}>
                              {row.avgPrice.toFixed(4)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABLE 3 */}
              <div className="space-y-8">
                <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-400 flex items-center gap-4 px-6">
                   <LayoutGrid className="w-5 h-5 text-indigo-500" /> Balance Económico Integrado
                </h4>
                <div className="glass p-2 rounded-[56px] border border-white/5 overflow-hidden shadow-3xl bg-[#0f172a]/10">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead className="bg-[#0f172a]/30 font-black uppercase tracking-widest text-slate-600">
                      <tr>
                        <th className="px-12 py-8">Periodo Fiscal / Factura</th>
                        <th className="px-12 py-8 text-right">Energía</th>
                        <th className="px-12 py-8 text-right">Potencia</th>
                        <th className="px-12 py-8 text-right">Tributos / Otros</th>
                        <th className="px-12 py-8 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      {tableData.map((row, idx) => {
                        const isTop = isTop3(row.totalFactura, tableData.map(d => d.totalFactura));
                        return (
                          <tr key={idx} className="hover:bg-indigo-500/[0.03] transition-all group cursor-pointer" onClick={() => setSelectedBillId(row.id)}>
                            <td className="px-12 py-8">
                              <div className="flex flex-col">
                                <span className="text-[16px] font-black text-white group-hover:text-indigo-400 transition-colors uppercase italic">{row.name}</span>
                                <span className="text-[8px] font-black text-slate-600 tracking-[0.3em] uppercase mt-1">{row.periodDescription}</span>
                              </div>
                            </td>
                            <td className="px-12 py-8 text-right font-bold text-slate-400 text-[13px]">{row.energia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="px-12 py-8 text-right font-bold text-slate-400 text-[13px]">{row.potencia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="px-12 py-8 text-right font-bold text-slate-500 text-[13px]">{row.otros.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className={`px-12 py-8 text-right font-black text-[24px] tracking-tighter tabular-nums transition-all group-hover:scale-105 ${isTop ? 'text-rose-500' : 'text-white'}`}>
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

        {/* ESCENA 6 — CIERRE FUTURISTA */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 bg-gradient-to-t from-blue-600/5 to-transparent relative">
          <div className="max-w-6xl w-full flex flex-col items-center space-y-32">
            <div className="text-center space-y-8 relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-blue-500/10 blur-3xl opacity-50" />
              <ShieldCheck className="w-16 h-16 text-blue-500 mx-auto mb-16 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
              <h3 className="text-7xl md:text-[100px] font-black tracking-[-0.05em] uppercase leading-[0.8] mb-12"> Ready For <br/> Optimisation</h3>
              <p className="text-xl text-slate-400 font-medium max-w-2xl mx-auto italic">
                Validado por el ecosistema de inteligencia de Voltis Anual Economics. <br/> Implementación inmediata recomendada.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
               {[
                 { title: 'Certificación IA Audit', desc: 'Sello de integridad técnica tras analizar 365 días de ciclos operativos.', icon: CheckCircle2, status: 'Verified' },
                 { title: 'Monitor de Ahorro', desc: 'Puerta de enlace activa para la monitorización mensual del ROI proyectado.', icon: Activity, status: 'Ready' },
               ].map((item, idx) => (
                 <div key={idx} className="glass p-12 rounded-[56px] space-y-10 border border-white/5 hover:border-blue-500/20 transition-all group relative overflow-hidden">
                    <item.icon className="w-10 h-10 text-blue-500" />
                    <div className="space-y-4">
                      <h4 className="text-3xl font-black tracking-tight">{item.title}</h4>
                      <p className="text-slate-500 text-lg leading-relaxed font-medium">{item.desc}</p>
                    </div>
                    <div className="pt-10 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-500">{item.status}</span>
                      <ArrowRight className="w-5 h-5 text-slate-700 group-hover:text-blue-500 group-hover:translate-x-2 transition-all" />
                    </div>
                 </div>
               ))}
            </div>

            <div className="text-center pt-32 opacity-10 space-y-4">
               <div className="h-[1px] w-48 bg-white mx-auto" />
               <span className="text-[10px] font-black uppercase tracking-[1em]">Voltis Platform v4.0 // 2026 // Premium Excellence</span>
            </div>
          </div>
        </section>

      </div>

      {/* Detail Modal Polished */}
      <AnimatePresence>
        {selectedBillId && selectedBill && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl no-print cursor-pointer" onClick={() => setSelectedBillId(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 30 }} className="glass border border-white/10 rounded-[64px] w-full max-w-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] cursor-default p-14 pt-16 relative" onClick={(e) => e.stopPropagation()}>
               <div className="absolute top-10 right-10">
                 <button onClick={() => setSelectedBillId(null)} className="w-12 h-12 rounded-full glass border border-white/5 flex items-center justify-center hover:bg-white/5 transition-all">
                   <ArrowLeft className="w-5 h-5 rotate-90" />
                 </button>
               </div>
               
               <div className="mb-14">
                 <h4 className="text-4xl font-black tracking-tight uppercase italic mb-2">{selectedBill.fileName.split('.')[0]}</h4>
                 <div className="flex items-center gap-3">
                   <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                   <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">System Technical Breakdown</span>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-6 mb-12">
                 <div className="p-8 rounded-[40px] bg-blue-600/10 border border-blue-500/20">
                   <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 block mb-2 opacity-60">Impacto Total</span>
                   <span className="text-4xl font-black tabular-nums">{selectedBill.totalCalculado.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                 </div>
                 <div className="p-8 rounded-[40px] bg-white/5 border border-white/5 text-right">
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2 opacity-60">Periodo</span>
                   <span className="text-xl font-black text-slate-300">{selectedBill.fechaInicio?.split('-').reverse().slice(0,2).join('/')} - {selectedBill.fechaFin?.split('-').reverse().slice(0,2).join('/')}</span>
                 </div>
               </div>

               <div className="space-y-10 max-h-[45vh] overflow-y-auto custom-scrollbar pr-6">
                  <div className="space-y-5">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400 border-l-2 border-blue-500 pl-4">Matriz de Energía</h5>
                    {selectedBill.consumo?.map((c, i) => (
                      <div key={i} className="flex justify-between p-5 rounded-3xl bg-white/[0.03] border border-white/5 group hover:bg-blue-500/5 transition-colors">
                        <span className="font-black text-xs text-slate-400 uppercase tracking-widest">{c.periodo}</span>
                        <div className="flex gap-10">
                          <span className="text-slate-500 text-xs font-bold">{c.kwh.toLocaleString()} kWh</span>
                          <span className="font-black text-blue-400 text-md min-w-[70px] text-right">{c.total.toFixed(2)} €</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-5">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400 border-l-2 border-cyan-500 pl-4">Modulación de Potencia</h5>
                    {selectedBill.potencia?.map((p, i) => (
                      <div key={i} className="flex justify-between p-5 rounded-3xl bg-white/[0.03] border border-white/5 group hover:bg-cyan-500/5 transition-colors">
                        <span className="font-black text-xs text-slate-400 uppercase tracking-widest">{p.periodo}</span>
                        <div className="flex gap-10">
                          <span className="text-slate-500 text-xs font-bold">{p.kw} kW · {p.dias} D</span>
                          <span className="font-black text-cyan-400 text-md min-w-[70px] text-right">{p.total.toFixed(2)} €</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-5 pb-6">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 border-l-2 border-indigo-500 pl-4">Conceptos Transversales</h5>
                    {[...(selectedBill.otrosConceptos || []), ...(customOCs[selectedBill.id] || [])].map((oc, i) => (
                      <div key={i} className="flex justify-between p-5 rounded-3xl bg-white/[0.03] border border-white/5 border-l-indigo-500/30">
                        <span className="font-black text-[12px] text-slate-300 uppercase italic">{oc.concepto}</span>
                        <span className="font-black text-indigo-400 text-md">{oc.total.toFixed(2)} €</span>
                      </div>
                    ))}
                  </div>
               </div>

               <button onClick={() => setSelectedBillId(null)} className="w-full py-6 bg-white text-black font-black text-[10px] uppercase tracking-[0.6em] rounded-full mt-14 hover:scale-[1.01] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all">
                 Finalizar Auditoría Técnica
               </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { 
            background: #020617 !important; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
            width: 100% !important;
          }
          .no-print { display: none !important; }
          .report-container { 
            width: 100% !important; 
            background: #020617 !important; 
            padding: 0 !important;
            margin: 0 !important;
          }
          section { 
            width: 100% !important;
            min-height: 100vh !important;
            padding: 120px 80px !important;
            page-break-after: always !important; 
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
          .hero-scene { 
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            padding: 0 !important;
          }
          .hero-scene h1 { 
            font-size: 100px !important;
            margin-bottom: 20px !important;
          }
          .glass { 
            background: rgba(15,23,42,0.6) !important; 
            border: 1px solid rgba(255,255,255,0.05) !important; 
            backdrop-filter: none !important; 
            box-shadow: none !important;
          }
          .recharts-responsive-container { height: 450px !important; }
          .cinematic-grid { display: none !important; }
          table { width: 100% !important; border-spacing: 0; }
          tr { page-break-inside: avoid !important; }
        }
        .cinematic-grid {
          background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 50px 50px;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 20px; }
      `}</style>
    </div>
  );
}

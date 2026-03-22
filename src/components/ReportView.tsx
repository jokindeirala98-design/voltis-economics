"use client";

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, TrendingUp, DollarSign, BarChart3, PieChart as PieIcon, CheckCircle2, ShieldCheck, Sparkles, ArrowRight, LayoutGrid, Cpu, Mail, Send, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ReportViewProps {
  bills: ExtractedBill[];
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onBack: () => void;
}

const CountUp = ({ value, duration = 1.2, decimals = 0 }: { value: number, duration?: number, decimals?: number }) => {
  const [count, setCount] = useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let start = 0;
    const end = value;
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
          setCount(easeProgress * end);
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      },
      once: true
    });
  }, [value, duration]);

  return (
    <span ref={elementRef}>
      {count.toLocaleString('es-ES', { 
        minimumFractionDigits: decimals, 
        maximumFractionDigits: decimals 
      })}
    </span>
  );
};

export default function ReportView({ bills, customOCs, onBack }: ReportViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(0); // 0: All, 1: Q1, etc.
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const sections = Array.from(document.querySelectorAll('section'));
        const currentScroll = window.scrollY;
        
        let targetSection = null;
        if (e.key === 'ArrowDown') {
          targetSection = sections.find(s => s.offsetTop > currentScroll + 100);
        } else {
          targetSection = [...sections].reverse().find(s => s.offsetTop < currentScroll - 100);
        }

        if (targetSection) {
          targetSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // GSAP Orchestration
  useEffect(() => {
    const ctx = gsap.context(() => {
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
              end: 'top 30%',
              scrub: 1,
            }
          }
        );
      });

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
  }, [selectedQuarter]);

  // Filtering Logic
  const filteredValidBills = useMemo(() => {
    const validOnes = bills.filter(b => b.status !== 'error').sort((a,b) => {
      return (a.fechaInicio || '').localeCompare(b.fechaInicio || '');
    });

    if (selectedQuarter === 0) return validOnes;

    return validOnes.filter(b => {
      if (!b.fechaFin) return false;
      const month = new Date(b.fechaFin).getMonth() + 1; // 1-12
      if (selectedQuarter === 1) return month >= 1 && month <= 3;
      if (selectedQuarter === 2) return month >= 4 && month <= 6;
      if (selectedQuarter === 3) return month >= 7 && month <= 9;
      if (selectedQuarter === 4) return month >= 10 && month <= 12;
      return true;
    });
  }, [bills, selectedQuarter]);

  const { chartData, pieData, summaryStats, tableData } = useMemo(() => {
    const totals = { energetic: 0, power: 0, taxes: 0, others: 0, global: 0, kwh: 0 };
    
    const cData = filteredValidBills.map(b => {
      const getVal = (period: string) => b.consumo?.find(c => c.periodo === period)?.kwh || 0;
      const getPrice = (period: string) => b.consumo?.find(c => c.periodo === period)?.precioKwh || 0;

      const energia = b.costeTotalConsumo || 0;
      const potencia = b.costeTotalPotencia || 0;
      let impuestos = 0, otros = 0;

      [...(b.otrosConceptos || []), ...(customOCs[b.id] || [])].forEach(oc => {
        if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) impuestos += oc.total;
        else otros += oc.total;
      });

      totals.energetic += energia;
      totals.power += potencia;
      totals.taxes += impuestos;
      totals.others += otros;
      const usedTotalFactura = energia + potencia + impuestos + otros;
      totals.global += usedTotalFactura;
      totals.kwh += (b.consumoTotalKwh || 0);

      return {
        name: new Date(b.fechaFin || '').toLocaleString('es-ES', { month: 'long' }),
        periodDescription: b.fechaInicio && b.fechaFin ? `${b.fechaInicio.split('-').reverse().slice(0,2).join('/')}-${b.fechaFin.split('-').reverse().slice(0,2).join('/')}` : 'Factura',
        P1: getVal('P1'), P2: getVal('P2'), P3: getVal('P3'), P4: getVal('P4'), P5: getVal('P5'), P6: getVal('P6'),
        totalKwh: b.consumoTotalKwh || 0,
        avgPrice: b.costeMedioKwh || 0,
        totalFactura: usedTotalFactura,
        energia, potencia, otros: impuestos + otros,
        id: b.id,
        prices: { P1: getPrice('P1'), P2: getPrice('P2'), P3: getPrice('P3'), P4: getPrice('P4'), P5: getPrice('P5'), P6: getPrice('P6') }
      };
    });

    const pData = [
      { name: 'Consumo Energía', value: totals.energetic, color: '#3b82f6' },
      { name: 'Potencia Contratada', value: totals.power, color: '#8b5cf6' },
      { name: 'Impuestos y Tasas', value: totals.taxes, color: '#10b981' },
      { name: 'Otros Conceptos', value: totals.others, color: '#f59e0b' }
    ].filter(i => i.value > 0);

    return { chartData: cData, pieData: pData, summaryStats: totals, tableData: cData };
  }, [filteredValidBills, customOCs]);

  const isTop3 = (val: number, array: number[]) => {
    const sorted = [...new Set(array)].sort((a,b) => b-a);
    return sorted.slice(0, 3).includes(val) && val > 0;
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setIsSent(true);
      setTimeout(() => setIsSent(false), 5000);
    }, 2000);
  };

  const reactToPrintFn = useReactToPrint({
    contentRef,
    documentTitle: `Voltis_Report_${filteredValidBills[0]?.titular?.split(' ')[0] || 'Client'}`,
  });

  if (filteredValidBills.length === 0 && selectedQuarter === 0) return null;

  return (
    <div ref={containerRef} className="relative w-full bg-[#020617] text-white overflow-x-hidden min-h-screen selection:bg-blue-500/30 scroll-container">
      {/* Cinematic Background Layer */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(15,23,42,1)_0%,rgba(2,6,23,1)_80%)]" />
        <div className="absolute inset-0 cinematic-grid opacity-10" />
      </div>

      {/* Control Bar */}
      <div className="fixed top-6 left-6 right-6 flex items-center justify-between z-[100] no-print">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="group flex items-center gap-3 px-6 py-2.5 rounded-full glass border border-white/5 hover:border-primary/20 transition-all font-black text-[10px] uppercase tracking-[0.2em] backdrop-blur-3xl">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Volver
          </button>
          
          {/* Quarter Filters */}
          <div className="flex bg-white/5 rounded-full p-1 border border-white/5 backdrop-blur-3xl">
            {[0, 1, 2, 3, 4].map(q => (
              <button 
                key={q}
                onClick={() => setSelectedQuarter(q)}
                className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all ${selectedQuarter === q ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-white'}`}
              >
                {q === 0 ? 'ANUAL' : `Q${q}`}
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => reactToPrintFn()} className="group flex items-center gap-3 px-8 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/20 transition-all active:scale-95">
          <Printer className="w-4 h-4" /> Exportar Auditoría
        </button>
      </div>

      <div ref={contentRef} className="relative z-10 report-container">
        
        {/* ESCENA 1 — HERO */}
        <section className="hero-scene min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden page-break-after no-gsap snap-section">
          <div className="hero-content text-center relative z-20">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.2, ease: "circOut" }} className="space-y-12">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase tracking-[0.5em] text-blue-400 mb-12 shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                <Cpu className="w-3.5 h-3.5" /> Voltis AI Core
              </div>
              <div className="space-y-0 mb-16 px-4">
                <h1 className="text-8xl md:text-[140px] font-black tracking-[-0.07em] leading-[0.8] text-white">VOLTIS</h1>
                <h2 className="text-6xl md:text-9xl font-black tracking-[-0.05em] leading-[0.8] bg-gradient-to-b from-white/40 to-transparent bg-clip-text text-transparent italic">
                  {selectedQuarter === 0 ? 'ANUAL' : `CUARTIL Q${selectedQuarter}`}
                </h2>
              </div>
              <div className="space-y-8">
                 <div className="h-0.5 w-16 bg-blue-500 mx-auto rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                 <div className="space-y-3">
                   <h3 className="text-4xl md:text-5xl font-black tracking-tighter text-white uppercase text-glow">{filteredValidBills[0]?.titular?.split(' ')[0] || 'CLIENTE'}</h3>
                   <div className="flex flex-wrap justify-center gap-4 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">
                     <span className="flex items-center gap-2 px-3 py-1 rounded bg-white/5">{filteredValidBills[0]?.cups || 'ES00000'}</span>
                     <span className="flex items-center gap-2 px-3 py-1 rounded bg-white/5">TARIFA {filteredValidBills[0]?.tarifa || '3.0TD'}</span>
                   </div>
                 </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ESCENA 2 — KPIs */}
        <section className="kpi-scene min-h-screen flex flex-col items-center justify-center py-20 px-8 relative page-break-after snap-section">
          <div className="max-w-7xl w-full">
            <div className="mb-20 space-y-3">
              <span className="text-[10px] font-black uppercase tracking-[0.6em] text-blue-500 flex items-center gap-2"><Activity className="w-4 h-4" /> Magnitudes {selectedQuarter === 0 ? 'Consolidadas' : `Q${selectedQuarter}`}</span>
              <h3 className="text-5xl font-black tracking-tighter uppercase">Indicadores Auditados</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Inversión Global', value: summaryStats.global, unit: '€', icon: DollarSign, color: 'text-blue-500', decimals: 2 },
                { label: 'Flujo Energético', value: summaryStats.kwh, unit: 'kWh', icon: Zap, color: 'text-sky-400', decimals: 0 },
                { label: 'Precio Promedio', value: summaryStats.global / (summaryStats.kwh || 1), unit: '€/kWh', icon: TrendingUp, color: 'text-teal-400', decimals: 4 },
                { label: 'Facturas IA', value: filteredValidBills.length, unit: 'DOCS', icon: LayoutGrid, color: 'text-indigo-400', decimals: 0 },
              ].map((kpi, idx) => (
                <div key={idx} className="kpi-card glass p-10 rounded-[48px] border border-white/5 relative overflow-hidden group hover:border-blue-500/30 transition-all duration-500">
                   <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-10 ${kpi.color} group-hover:scale-110 transition-all`}>
                     <kpi.icon className="w-6 h-6" />
                   </div>
                   <div className="relative z-10 space-y-1">
                     <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{kpi.label}</span>
                     <div className="flex items-baseline gap-2">
                       <p className="text-4xl font-black tracking-tighter tabular-nums"><CountUp value={kpi.value} duration={1} decimals={kpi.decimals} /></p>
                       <span className="text-[10px] font-black text-slate-600">{kpi.unit}</span>
                     </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ESCENA 3 — EVOLUCIÓN */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 relative page-break-after snap-section">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-5 gap-16 items-center">
            <div className="lg:col-span-2 space-y-10 group">
              <div className="space-y-4">
                <span className="text-[9px] font-black uppercase tracking-[0.6em] text-blue-500 lg:text-left text-center block">Visual 03 // Evolución</span>
                <h3 className="text-5xl md:text-6xl font-black tracking-tight uppercase lg:text-left text-center">Gasto Mensual</h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed lg:text-left text-center max-w-sm mx-auto lg:mx-0">Análisis dinámico del periodo seleccionado.</p>
              </div>
              <div className="glass p-8 rounded-[40px] border border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-4 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Insight Técnico</h4>
                <p className="text-sm font-bold leading-tight text-slate-200">Se observa una correlación directa entre el precio medio y el volumen de consumo en las horas punta.</p>
              </div>
            </div>
            <div className="lg:col-span-3 h-[520px] glass p-10 rounded-[64px] border border-white/5 bg-[#0f172a]/20">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.02)" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 900 }} dy={10} interval={0} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 900 }} />
                  <RechartsTooltip cursor={{fill: 'rgba(59, 130, 246, 0.05)'}} contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.98)', border: 'none', borderRadius: '24px', backdropFilter: 'blur(40px)', fontSize: '10px' }} />
                  <Bar dataKey="totalFactura" fill="#3b82f6" radius={[12, 12, 0, 0]} barSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ESCENA 4 — ESTRUCTURA */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 relative page-break-after snap-section">
          <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
            <div className="h-[600px] relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={120} outerRadius={180} paddingAngle={8} dataKey="value" stroke="none">
                    {pieData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                <span className="text-6xl font-black tracking-tighter tabular-nums text-white">
                  {summaryStats.global.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mt-2">Annual Core</span>
              </div>
            </div>
            <div className="space-y-12">
              <div className="space-y-5 text-right lg:text-left">
                <span className="text-[9px] font-black uppercase tracking-[0.7em] text-blue-500">Visual 04 // Anatomía</span>
                <h3 className="text-6xl font-black tracking-tight uppercase leading-[0.85]">Anatomía <br/> del Gasto</h3>
              </div>
              <div className="space-y-4">
                {pieData.map((item: any, idx) => (
                  <div key={idx} className="flex items-center justify-between p-6 rounded-[32px] bg-[#0f172a]/20 border border-white/5">
                    <div className="flex items-center gap-5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-black text-white/70 uppercase">{item.name}</span>
                    </div>
                    <span className="text-lg font-black text-blue-400">{((item.value / summaryStats.global) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ESCENA 5 — MATRIZ TÉCNICA (TABLES) */}
        <section className="min-h-screen py-32 px-8 flex flex-col items-center relative page-break-after no-gsap snap-section">
           <div className="max-w-7xl w-full space-y-48">
              <div className="text-center space-y-5">
                <span className="text-[10px] font-black uppercase tracking-[0.8em] text-blue-500">Métricas de Ingeniería</span>
                <h3 className="text-6xl font-black tracking-tight uppercase">Auditoría de Precisión</h3>
              </div>

              {/* TABLE Matrix Logic */}
              {[
                { title: 'Consumo Energético (kWh)', color: 'text-blue-400', dataKey: 'totalKwh', unit: '', dec: 0 },
                { title: 'Precios Base (€/kWh)', color: 'text-cyan-400', dataKey: 'avgPrice', unit: '', dec: 4 },
                { title: 'Balance Económico (€)', color: 'text-indigo-400', dataKey: 'totalFactura', unit: '€', dec: 2 }
              ].map((matrix, mIdx) => (
                <div key={mIdx} className="space-y-8 pdf-avoid-break">
                  <h4 className={`text-[10px] font-black uppercase tracking-[0.5em] ${matrix.color} flex items-center gap-4 px-6`}>
                     <Zap className="w-5 h-5" /> {matrix.title}
                  </h4>
                  <div className="glass p-2 rounded-[56px] border border-white/5 overflow-hidden bg-[#0f172a]/10">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead className="bg-[#0f172a]/30 font-black uppercase tracking-widest text-slate-600">
                        <tr>
                          <th className="px-12 py-8">Periodo</th>
                          {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => <th key={p} className="px-6 py-8 text-center">{p}</th>)}
                          <th className="px-12 py-8 text-right">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.02]">
                        {tableData.map((row, idx) => {
                          const isTop = isTop3((row as any)[matrix.dataKey], tableData.map(d => (d as any)[matrix.dataKey]));
                          return (
                            <tr key={idx} className="hover:bg-white/[0.02] transition-all group" onClick={() => setSelectedBillId(row.id)}>
                              <td className="px-12 py-6 font-black text-white text-[13px] uppercase italic">{row.name}</td>
                              {[1, 2, 3, 4, 5, 6].map(p => (
                                <td key={p} className="px-6 py-6 text-center text-slate-500 font-bold">
                                  {matrix.dataKey === 'avgPrice' 
                                    ? (row.prices as any)[`P${p}`] > 0 ? (row.prices as any)[`P${p}`].toFixed(4) : '—'
                                    : (row as any)[`P${p}`] > 0 ? (row as any)[`P${p}`].toLocaleString() : '—'
                                  }
                                </td>
                              ))}
                              <td className={`px-12 py-6 text-right font-black text-[16px] transition-all ${isTop ? 'text-rose-500 scale-110 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]' : matrix.color}`}>
                                {(row as any)[matrix.dataKey].toLocaleString('es-ES', { minimumFractionDigits: matrix.dec })} {matrix.unit}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
           </div>
        </section>

        {/* ESCENA 6 — CIERRE + EMAIL */}
        <section className="min-h-screen flex flex-col items-center justify-center py-24 px-8 relative snap-section">
          <div className="max-w-4xl w-full flex flex-col items-center space-y-24 text-center">
            <div className="space-y-12">
              <ShieldCheck className="w-16 h-16 text-blue-500 mx-auto drop-shadow-[0_0_20px_rgba(59,130,246,0.3)]" />
              <h3 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-[0.8]">Listo para <br/> optimizar</h3>
              <p className="text-xl text-slate-400 font-medium italic">Análisis certificado por Voltis Anual Economics v4.0</p>
            </div>

            {/* Email Form */}
            <div className="w-full max-w-lg glass p-10 rounded-[60px] border border-white/10 no-print">
               <div className="flex items-center gap-3 mb-8 justify-center">
                 <Mail className="w-4 h-4 text-blue-400" />
                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Enviar auditoría PDF</span>
               </div>
               <form onSubmit={handleSendEmail} className="relative">
                 <input 
                   type="email" 
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   placeholder="Correo del cliente..." 
                   className="w-full px-8 py-5 rounded-full bg-white/5 border border-white/10 text-white font-bold text-sm focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-700"
                   required
                 />
                 <button 
                   type="submit" 
                   disabled={isSending || isSent}
                   className={`absolute right-2 top-2 bottom-2 px-8 rounded-full font-black text-[10px] uppercase tracking-widest transition-all ${isSent ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                 >
                   {isSending ? 'Enviando...' : isSent ? '¡Enviado!' : 'Enviar'}
                 </button>
               </form>
               <p className="mt-6 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Desde: jokin@voltisenergia.com</p>
            </div>

            <div className="opacity-10 pt-24 space-y-4">
               <div className="h-[1px] w-24 bg-white mx-auto" />
               <span className="text-[10px] font-black uppercase tracking-[1em]">Voltis AI Ecosystem</span>
            </div>
          </div>
        </section>

      </div>

      <AnimatePresence>
        {selectedBillId && selectedBill && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl no-print" onClick={() => setSelectedBillId(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass border border-white/10 rounded-[64px] w-full max-w-2xl p-14" onClick={(e) => e.stopPropagation()}>
               <div className="flex justify-between items-start mb-12">
                 <h4 className="text-3xl font-black uppercase italic">{selectedBill.fileName.split('.')[0]}</h4>
                 <button onClick={() => setSelectedBillId(null)} className="w-10 h-10 rounded-full glass flex items-center justify-center"><ArrowLeft className="rotate-90" /></button>
               </div>
               <div className="grid grid-cols-2 gap-6 mb-12">
                 <div className="p-8 rounded-[40px] bg-blue-600/10 border border-blue-500/20">
                   <span className="text-[10px] uppercase tracking-widest text-blue-500 block mb-2">Total</span>
                   <span className="text-4xl font-black">{selectedBill.totalCalculado.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                 </div>
               </div>
               <div className="space-y-6 max-h-[40vh] overflow-y-auto pr-4 custom-scrollbar">
                  {selectedBill.consumo?.map((c, i) => (
                    <div key={i} className="flex justify-between p-4 rounded-3xl bg-white/2 border border-white/5">
                      <span className="font-black text-xs text-slate-400">{c.periodo}</span>
                      <span className="font-black text-blue-400">{c.total.toFixed(2)} €</span>
                    </div>
                  ))}
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .scroll-container {
          scroll-snap-type: y mandatory;
          overflow-y: scroll;
          height: 100vh;
        }
        .snap-section {
          scroll-snap-align: start;
          scroll-snap-stop: always;
        }
        @media print {
          @page { size: A4; margin: 0; }
          .scroll-container { scroll-snap-type: none !important; height: auto !important; overflow: visible !important; }
          .no-print { display: none !important; }
          section { 
            min-height: 100vh !important; 
            padding: 80px 60px !important; 
            page-break-after: always !important; 
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center center !important;
          }
          .pdf-avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
          tbody tr { break-inside: avoid !important; page-break-inside: avoid !important; }
        }
        .cinematic-grid { background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 50px 50px; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}

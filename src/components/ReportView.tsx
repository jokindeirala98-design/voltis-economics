"use client";

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, TrendingUp, DollarSign, BarChart3, PieChart as PieIcon, CheckCircle2, ShieldCheck, Sparkles, ArrowRight, LayoutGrid, Cpu, Mail, Send, Filter, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ReportViewProps {
  bills: ExtractedBill[];
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onBack: () => void;
  projectName?: string;
}

const CountUp = ({ value, duration = 1, decimals = 0 }: { value: number, duration?: number, decimals?: number }) => {
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
          const easeProgress = 1 - Math.pow(1 - progress, 3);
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

export default function ReportView({ bills, customOCs, onBack, projectName = 'PROYECTO' }: ReportViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(0);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  // Smooth Section Scrolling
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const sections = ['scene-1', 'scene-2', 'scene-3', 'scene-4', 'scene-5', 'scene-6'];
        const viewH = window.innerHeight;
        const currentIdx = sections.findIndex(id => {
          const el = document.getElementById(id);
          return el && (el.getBoundingClientRect().top >= -viewH/2 && el.getBoundingClientRect().top < viewH/2);
        });
        
        let nextIdx = currentIdx;
        if (e.key === 'ArrowDown') nextIdx = Math.min(sections.length - 1, currentIdx + 1);
        else nextIdx = Math.max(0, currentIdx - 1);
        
        if (nextIdx !== currentIdx) {
          e.preventDefault();
          scrollToSection(sections[nextIdx]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // GSAP Orchestration - Subtle entrance animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Hero parallax
      gsap.to('.hero-content', {
        scale: 0.9, opacity: 0.3, y: -40,
        scrollTrigger: { 
          trigger: '#scene-1', 
          start: 'top top', 
          end: 'bottom 40%', 
          scrub: 1,
        }
      });

      // 2. Section entrance
      const sections = ['#scene-2', '#scene-3', '#scene-4', '#scene-5', '#scene-6'];
      sections.forEach(id => {
        gsap.from(id, {
          y: 40,
          opacity: 0.8,
          duration: 1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: id,
            start: 'top 90%',
            once: true,
          }
        });

        if (id === '#scene-2') {
          gsap.from('.kpi-card', {
            scale: 0.9,
            opacity: 0.2,
            stagger: 0.1,
            duration: 0.7,
            ease: 'back.out(1.7)',
            scrollTrigger: {
              trigger: id,
              start: 'top 80%',
              once: true,
            }
          });
        }
      });
    }, containerRef);
    return () => ctx.revert();
  }, [selectedQuarter]);

  // Filtering
  const filteredValidBills = useMemo(() => {
    const validOnes = (bills || []).filter(b => b.status !== 'error').sort((a,b) => (a.fechaInicio || '').localeCompare(b.fechaInicio || ''));
    if (selectedQuarter === 0) return validOnes;
    return validOnes.filter(b => {
      const month = new Date(b.fechaFin || '').getMonth() + 1;
      return selectedQuarter === 1 ? (month >= 1 && month <= 3) :
             selectedQuarter === 2 ? (month >= 4 && month <= 6) :
             selectedQuarter === 3 ? (month >= 7 && month <= 9) :
             selectedQuarter === 4 ? (month >= 10 && month <= 12) : true;
    });
  }, [bills, selectedQuarter]);

  const { chartData, pieData, summaryStats, tableData } = useMemo(() => {
    const totals = { energetic: 0, power: 0, taxes: 0, others: 0, global: 0, kwh: 0 };
    const cData = filteredValidBills.map(b => {
      const energia = b.costeTotalConsumo || 0;
      const potencia = b.costeTotalPotencia || 0;
      let imp = 0, others = 0;
      [...(b.otrosConceptos || []), ...(customOCs[b.id] || [])].forEach(oc => {
        if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) imp += oc.total;
        else others += oc.total;
      });
      totals.energetic += energia; totals.power += potencia; totals.taxes += imp; totals.others += others;
      const totalF = energia + potencia + imp + others;
      totals.global += totalF; totals.kwh += (b.consumoTotalKwh || 0);
      return {
        name: new Date(b.fechaFin || '').toLocaleString('es-ES', { month: 'long' }),
        period: `${b.fechaInicio?.split('-').reverse().slice(0,2).join('/')}-${b.fechaFin?.split('-').reverse().slice(0,2).join('/')}`,
        P1: b.consumo?.find(c => c.periodo === 'P1')?.kwh || 0,
        P2: b.consumo?.find(c => c.periodo === 'P2')?.kwh || 0,
        P3: b.consumo?.find(c => c.periodo === 'P3')?.kwh || 0,
        P4: b.consumo?.find(c => c.periodo === 'P4')?.kwh || 0,
        P5: b.consumo?.find(c => c.periodo === 'P5')?.kwh || 0,
        P6: b.consumo?.find(c => c.periodo === 'P6')?.kwh || 0,
        totalKwh: b.consumoTotalKwh || 0, avgPrice: b.costeMedioKwh || 0, totalFactura: totalF,
        energia, potencia, otros: imp + others, id: b.id,
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
  }, [filteredValidBills, customOCs]);

  const isTop3 = (val: number, array: number[]) => {
    const sorted = [...new Set(array)].sort((a, b) => b - a);
    return sorted.slice(0, 3).includes(val) && val > 0;
  };

  const reactToPrintFn = useReactToPrint({ contentRef, documentTitle: `Voltis_Report_${projectName}` });

  const hasData = filteredValidBills.length > 0;

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

  return (
    <div ref={containerRef} className="relative w-full bg-[#020617] text-white overflow-y-auto selection:bg-blue-500/30 scroll-smooth h-screen">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(15,23,42,1)_0%,rgba(2,6,23,1)_80%)]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <div className="fixed top-6 left-6 right-6 flex items-center justify-between z-[100] no-print px-4">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="flex items-center gap-2 px-6 py-2 rounded-full border border-white/10 glass text-[10px] font-black uppercase tracking-widest hover:bg-white/5">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div className="flex bg-white/5 rounded-full p-1 border border-blue-500/20 shadow-2xl backdrop-blur-3xl">
            {[0, 1, 2, 3, 4].map(q => (
              <button 
                key={q} 
                onClick={() => setSelectedQuarter(q)}
                className={`px-5 py-2 rounded-full text-[10px] font-black tracking-widest transition-all ${selectedQuarter === q ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/30 grow' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {q === 0 ? 'ANUAL' : `Q${q}`}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => reactToPrintFn()} className="flex items-center gap-3 px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/40">
           <Printer className="w-4 h-4" /> Generar PDF Auditado
        </button>
      </div>

      <div ref={contentRef} className="relative z-10 report-container">
        {!hasData ? (
          <div className="min-h-screen flex flex-col items-center justify-center p-12 text-center space-y-6">
            <AlertTriangle className="w-16 h-16 text-amber-500 animate-pulse" />
            <h3 className="text-4xl font-black uppercase tracking-tighter">Sin datos en {selectedQuarter === 0 ? 'este proyecto' : `Q${selectedQuarter}`}</h3>
            <p className="text-slate-500 max-w-md mx-auto">Sube una factura o cambia el filtro para generar la auditoría visual.</p>
          </div>
        ) : (
          <>
            <section id="scene-1" className="min-h-screen flex items-center justify-center p-8 page-break-after relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20 md:opacity-30 z-0 mix-blend-screen scale-150 md:scale-100 translate-y-20 md:translate-y-0">
                 <img src="/mascot.jpg" alt="Voltis AI Mascot" className="w-[600px] h-[600px] object-cover" style={{ maskImage: 'radial-gradient(circle at center, black 30%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle at center, black 30%, transparent 70%)' }} />
              </div>

              <div className="hero-content text-center space-y-12 relative z-10">
                <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase tracking-[0.4em] text-blue-400">
                   <Cpu className="w-4 h-4" /> Voltis AI Analytics Core
                </div>
                <div className="space-y-0">
                   <h1 className="text-9xl md:text-[160px] font-black tracking-[-0.08em] leading-[0.75]">VOLTIS</h1>
                   <h2 className="text-6xl md:text-[100px] font-black italic tracking-tighter opacity-30 leading-[0.75]">
                     {selectedQuarter === 0 ? 'ANUAL' : `Q${selectedQuarter} EVOLUTION`}
                   </h2>
                </div>
                <div className="pt-20 space-y-4">
                   <div className="h-0.5 w-12 bg-blue-500 mx-auto rounded-full shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
                   <h3 className="text-5xl font-black tracking-tighter text-blue-500 uppercase">{projectName}</h3>
                   <div className="pt-2 flex flex-col items-center gap-1">
                      <p className="text-[10px] text-slate-500 font-black tracking-wider uppercase">
                        CUPS: {filteredValidBills[0]?.cups || 'ES00000'}
                      </p>
                      <p className="text-[10px] text-blue-400/60 font-black tracking-[0.4em] uppercase">
                        TARIFA {filteredValidBills[0]?.tarifa || '3.0TD'}
                      </p>
                   </div>
                </div>
              </div>
            </section>

            <section id="scene-2" className="min-h-[100vh] flex flex-col items-center justify-center py-32 px-10 page-break-after">
              <div className="max-w-7xl w-full">
                <div className="mb-24 flex items-end justify-between border-b border-white/5 pb-8">
                  <div className="space-y-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-500">Métricas Auditadas</span>
                    <h3 className="text-6xl font-black tracking-tighter uppercase">Resultados {selectedQuarter === 0 ? 'Anuales' : `Q${selectedQuarter}`}</h3>
                  </div>
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">v4.6 Certified Analysis</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {[
                    { label: 'Facturación Global', value: summaryStats.global, unit: '€', icon: DollarSign, color: 'text-blue-500', dec: 2 },
                    { label: 'Energía Absoluta', value: summaryStats.kwh, unit: 'kWh', icon: Zap, color: 'text-sky-400', dec: 0 },
                    { label: 'Precio Promedio', value: summaryStats.global / (summaryStats.kwh || 1), unit: '€/kWh', icon: TrendingUp, color: 'text-teal-400', dec: 4 },
                    { label: 'Docs Procesados', value: filteredValidBills.length, unit: 'IA', icon: CheckCircle2, color: 'text-indigo-400', dec: 0 },
                  ].map((kpi, i) => (
                    <div key={i} className="kpi-card glass p-10 rounded-[56px] border border-white/5 relative overflow-hidden">
                       <div className={`w-14 h-14 rounded-2xl bg-${kpi.color.split('-')[1]}-500/10 flex items-center justify-center mb-10 ${kpi.color}`}>
                         <kpi.icon className="w-7 h-7" />
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">{kpi.label}</span>
                       <div className="flex items-baseline gap-2">
                         <p className="text-4xl font-black tracking-tighter tabular-nums"><CountUp value={kpi.value} decimals={kpi.dec} /></p>
                         <span className="text-xs font-bold text-slate-600">{kpi.unit}</span>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="scene-3" className="min-h-[100vh] flex flex-col items-center justify-center py-32 px-10 page-break-after">
              <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-3 gap-20 items-center">
                <div className="space-y-12">
                  <div className="space-y-5 text-center lg:text-left">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-500 block">Digital Flow 03</span>
                    <h3 className="text-7xl font-black tracking-tighter uppercase leading-[0.85]">Evolución Mensual</h3>
                    <p className="text-slate-400 max-w-sm mx-auto lg:mx-0 font-medium">Histórico dinámico de facturación procesada por el motor de IA.</p>
                  </div>
                </div>
                <div className="lg:col-span-2 h-[500px] glass p-12 rounded-[64px] border border-white/5 bg-slate-900/10">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 900 }} dy={10} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 900 }} />
                      <RechartsTooltip cursor={{fill: 'rgba(59, 130, 246, 0.05)'}} contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.95)', border: 'none', borderRadius: '24px', backdropFilter: 'blur(40px)', fontSize: '10px' }} />
                      <Bar dataKey="totalFactura" fill="url(#blueGrad)" radius={[15, 15, 0, 0]} barSize={40} />
                      <defs>
                        <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section id="scene-4" className="min-h-[100vh] flex flex-col items-center justify-center py-32 px-10 page-break-after">
              <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-32 items-center">
                <div className="h-[600px] relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={140} outerRadius={200} paddingAngle={10} dataKey="value" stroke="none">
                        {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute flex flex-col items-center pointer-events-none">
                    <span className="text-7xl font-black tracking-tighter">{summaryStats.global.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">Core Audit</span>
                  </div>
                </div>
                <div className="space-y-12">
                   <div className="space-y-4">
                     <span className="text-[10px] font-black uppercase tracking-[0.8em] text-blue-500">Visual 04</span>
                     <h3 className="text-6xl font-black tracking-tighter uppercase leading-[0.85]">Bio-Estructura Económica</h3>
                   </div>
                   <div className="space-y-4">
                     {pieData.map((item: any, i) => (
                       <div key={i} className="flex items-center justify-between p-7 rounded-[32px] bg-white/[0.02] border border-white/5 group hover:border-blue-500/20 transition-all">
                         <div className="flex items-center gap-6">
                           <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                           <span className="text-sm font-black text-white/70 uppercase">{item.name}</span>
                         </div>
                         <span className="text-xl font-black text-blue-400">{((item.value / summaryStats.global) * 100).toFixed(2)}%</span>
                       </div>
                     ))}
                   </div>
                </div>
              </div>
            </section>

            <section id="scene-5" className="min-h-screen py-40 px-10 flex flex-col items-center no-gsap page-break-after">
               <div className="max-w-7xl w-full space-y-48">
                  <div className="text-center space-y-6">
                    <span className="text-[10px] font-black uppercase tracking-[1em] text-blue-500">Engineering Matrix</span>
                    <h3 className="text-7xl font-black tracking-tighter uppercase">Audit Matrix Pro</h3>
                  </div>

                  {[
                    { title: 'Matriz Energética Mensual (kWh)', key: 'totalKwh', unit: '', dec: 0, color: 'text-blue-400' },
                    { title: 'Matriz de Coste x Periodo (€/kWh)', key: 'avgPrice', unit: '', dec: 4, color: 'text-cyan-400' },
                    { title: 'Matriz Económica Integral (€)', key: 'totalFactura', unit: '€', dec: 2, color: 'text-indigo-400' }
                  ].map((matrix, mIdx) => (
                    <div key={mIdx} className="space-y-10 pdf-avoid-break">
                      <h4 className={`text-[12px] font-black uppercase tracking-[0.6em] ${matrix.color} flex items-center gap-4 px-8`}>
                        <Activity className="w-5 h-5" /> {matrix.title}
                      </h4>
                      <div className="glass p-3 rounded-[64px] border border-white/5 overflow-hidden bg-slate-900/10">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead className="bg-slate-900/30 font-black uppercase tracking-widest text-slate-500">
                            <tr>
                              <th className="px-14 py-8">Mes de Auditoría</th>
                              {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(p => <th key={p} className="px-6 py-8 text-center">{p}</th>)}
                              <th className="px-14 py-8 text-right">MAGNITUD</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.03]">
                            {tableData.map((row, idx) => {
                              const val = (row as any)[matrix.key];
                              const isTop = isTop3(val, tableData.map(d => (d as any)[matrix.key]));
                              return (
                                <tr key={idx} className="hover:bg-white/[0.01] transition-all group cursor-pointer" onClick={() => setSelectedBillId(row.id)}>
                                  <td className="px-14 py-7 font-black text-white italic uppercase text-[15px]">{row.name}</td>
                                  {[1, 2, 3, 4, 5, 6].map(p => (
                                    <td key={p} className="px-6 py-7 text-center text-slate-500 font-bold group-hover:text-slate-300">
                                      {matrix.key === 'avgPrice' ? (row.prices as any)[`P${p}`].toFixed(4) : (row as any)[`P${p}`].toLocaleString()}
                                    </td>
                                  ))}
                                  <td className={`px-14 py-7 text-right font-black text-[18px] transition-all ${isTop ? 'text-red-500 scale-105 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]' : matrix.color}`}>
                                    {val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {matrix.unit}
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

            <section id="scene-6" className="min-h-screen flex flex-col items-center justify-center p-12 relative page-break-after">
               <div className="max-w-5xl w-full flex flex-col items-center space-y-24 text-center">
                 <div className="space-y-12">
                    <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto border border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.3)]">
                      <ShieldCheck className="w-12 h-12 text-blue-500" />
                    </div>
                    <h3 className="text-8xl md:text-[140px] font-black uppercase tracking-tighter leading-[0.7] text-glow">LISTO PARA OPTIMIZAR</h3>
                    <p className="text-2xl text-slate-400 font-medium italic opacity-50">Auditoría de Precisión Finalizada</p>
                 </div>
               </div>
            </section>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedBillId && filteredValidBills.find(b => b.id === selectedBillId) && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl no-print" onClick={() => setSelectedBillId(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass-card border border-white/10 rounded-[64px] w-full max-w-2xl p-14" onClick={(e) => e.stopPropagation()}>
               <div className="flex justify-between items-start mb-12">
                 <h4 className="text-3xl font-black uppercase italic">{filteredValidBills.find(b => b.id === selectedBillId)?.fileName.split('.')[0]}</h4>
                 <button onClick={() => setSelectedBillId(null)} className="w-10 h-10 rounded-full glass flex items-center justify-center"><ArrowLeft className="rotate-90" /></button>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                  <div className="p-8 rounded-[40px] bg-blue-600/10 border border-blue-500/20">
                    <span className="text-[10px] uppercase tracking-widest text-blue-500 block mb-2">Total Factura</span>
                    <span className="text-4xl font-black">
                      {(tableData.find((d: any) => d.id === selectedBillId)?.totalFactura || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                    </span>
                  </div>
               </div>

               <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-4 custom-scrollbar">
                  <div className="space-y-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Desglose Energía</span>
                    <div className="grid grid-cols-2 gap-3">
                      {filteredValidBills.find(b => b.id === selectedBillId)?.consumo?.map((c, i) => (
                        <div key={i} className="flex justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                          <span className="font-black text-[10px] text-slate-400">{c.periodo}</span>
                          <span className="font-black text-blue-400 text-xs">{c.total.toFixed(2)} €</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 space-y-3">
                    <div className="flex justify-between p-6 rounded-[32px] bg-blue-600/10 border border-blue-500/20">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Total Potencia</span>
                      <span className="text-2xl font-black text-white">
                        {(filteredValidBills.find(b => b.id === selectedBillId)?.costeTotalPotencia || 0).toFixed(2)} €
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div className="flex justify-between p-6 rounded-[32px] bg-white/5 border border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Otros Conceptos</span>
                        <span className="text-xl font-black text-white">
                          {(() => {
                            const b = filteredValidBills.find(b => b.id === selectedBillId);
                            let sum = 0;
                            [...(b?.otrosConceptos || []), ...(customOCs[selectedBillId!] || [])].forEach(oc => {
                              if (!oc.concepto.toLowerCase().includes('impuesto') && !oc.concepto.toLowerCase().includes('iva')) sum += oc.total;
                            });
                            return sum.toFixed(2);
                          })()} €
                        </span>
                      </div>
                      <div className="flex justify-between p-6 rounded-[32px] bg-emerald-500/10 border border-emerald-500/20">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Impuestos y Tasas</span>
                        <span className="text-xl font-black text-white">
                          {(() => {
                            const b = filteredValidBills.find(b => b.id === selectedBillId);
                            let sum = 0;
                            [...(b?.otrosConceptos || []), ...(customOCs[selectedBillId!] || [])].forEach(oc => {
                              if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) sum += oc.total;
                            });
                            return sum.toFixed(2);
                          })()} €
                        </span>
                      </div>
                    </div>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        html { scroll-behavior: smooth !important; }
        .report-container { width: 100%; position: relative; }
        section { opacity: 1; }
        .glass { background: rgba(15,23,42,0.4) !important; backdrop-filter: blur(40px) !important; }
        .text-glow { text-shadow: 0 0 30px rgba(255,255,255,0.4); }
        .pdf-avoid-break { break-inside: avoid !important; }
        @page { size: A4; margin: 0; }
        @media print {
          html, body { 
            background: #020617 !important; 
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .report-container { background: #020617 !important; color: white !important; }
          section { 
            width: 100% !important;
            min-height: 297mm !important; 
            padding: 15mm 20mm !important;
            page-break-after: always !important; 
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .pdf-avoid-break, table, tr, .kpi-card { break-inside: avoid !important; page-break-inside: avoid !important; }
          .recharts-responsive-container { height: 400px !important; width: 100% !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}

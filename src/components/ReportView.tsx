"use client";

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, TrendingUp, DollarSign, CheckCircle2, ShieldCheck, Cpu, AlertTriangle, Send, Mail, X, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { getAssignedMonth } from '@/lib/date-utils';

gsap.registerPlugin(ScrollTrigger);

interface ReportViewProps {
  bills: ExtractedBill[];
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onBack: () => void;
  onPreviewBill?: (billId: string) => void;
  projectName?: string;
}

// Custom tooltip with 2 decimals
const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'rgba(2,6,23,0.97)', border: 'none', borderRadius: '20px', backdropFilter: 'blur(40px)', padding: '14px 20px', fontSize: '11px', fontWeight: 900 }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>
        <p style={{ color: '#3b82f6', fontSize: 14 }}>{Number(payload[0].value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</p>
      </div>
    );
  }
  return null;
};

const CountUp = ({ value, duration = 1.2, decimals = 0 }: { value: number, duration?: number, decimals?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    const end = value;
    if (!end) return;
    let startTime: number | null = null;
    let frameId: number;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / (duration * 1000), 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setCount(easeProgress * end);
      if (progress < 1) frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [value, duration]);

  return (
    <span>
      {count.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
};

export default function ReportView({ bills, customOCs, onBack, onPreviewBill, projectName = 'PROYECTO' }: ReportViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null); // For matrix 3
  const [selectedPriceBillId, setSelectedPriceBillId] = useState<string | null>(null); // For matrix 2
  const [selectedQuarter, setSelectedQuarter] = useState<number>(0);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const sections = ['scene-1', 'scene-2', 'scene-3', 'scene-4', 'scene-5', 'scene-6', 'scene-7'];
        const viewH = window.innerHeight;
        const currentIdx = sections.findIndex(id => {
          const el = document.getElementById(id);
          return el && (el.getBoundingClientRect().top >= -viewH/2 && el.getBoundingClientRect().top < viewH/2);
        });
        let nextIdx = currentIdx;
        if (e.key === 'ArrowDown') nextIdx = Math.min(sections.length - 1, currentIdx + 1);
        else nextIdx = Math.max(0, currentIdx - 1);
        if (nextIdx !== currentIdx) { e.preventDefault(); scrollToSection(sections[nextIdx]); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Set 3D perspective on sections instead of the whole container to avoid breaking fixed modals
      gsap.set('.report-page', { transformPerspective: 1200 });

      // Ensure hero content is visible immediately
      gsap.set('.hero-content', { opacity: 1, scale: 1, y: 0 });

      // Hero: smooth parallax on scroll-out
      gsap.to('.hero-content', {
        scale: 0.92, opacity: 0.15, y: -60,
        scrollTrigger: { trigger: '#scene-1', start: 'top top', end: 'bottom 30%', scrub: 1.5 }
      });

      // Scene entrances
      ['#scene-2','#scene-3','#scene-4','#scene-5','#scene-6','#scene-7'].forEach((id) => {
        gsap.fromTo(id,
          { y: 70, opacity: 0, transformPerspective: 900, rotationX: 8, scale: 0.98 },
          { y: 0, opacity: 1, rotationX: 0, scale: 1, duration: 1.1, ease: 'power3.out',
            immediateRender: false,
            scrollTrigger: { trigger: id, start: 'top 88%', once: true }
          }
        );

        if (id === '#scene-2') {
          gsap.fromTo('.kpi-card',
            { transformPerspective: 800, rotationY: 25, scale: 0.88, opacity: 0, y: 20 },
            { rotationY: 0, scale: 1, opacity: 1, y: 0,
              stagger: 0.13, duration: 0.9, ease: 'back.out(1.5)',
              immediateRender: false,
              scrollTrigger: { trigger: id, start: 'top 82%', once: true }
            }
          );
        }
      });
    }, containerRef);
    return () => ctx.revert();
  }, [selectedQuarter]);

  const filteredValidBills = useMemo(() => {
    const parseDate = (d?: string) => {
      if (!d) return 0;
      if (d.includes('-')) return new Date(d).getTime() || 0;
      if (d.includes('/')) {
        const [day, month, year] = d.split('/').map(Number);
        return new Date(year, month - 1, day).getTime() || 0;
      }
      return new Date(d).getTime() || 0;
    };

    const validOnes = (bills || []).filter(b => b.status !== 'error').sort((a, b) => {
      const am = getAssignedMonth(a.fechaInicio, a.fechaFin);
      const bm = getAssignedMonth(b.fechaInicio, b.fechaFin);
      if (am.year !== bm.year) return am.year - bm.year;
      return am.month - bm.month;
    });
    return validOnes;
  }, [bills]);

  const projectCups = useMemo(() => {
    const validCups = filteredValidBills
      .map(b => b.cups?.replace(/\s+/g, '').toUpperCase())
      .filter(c => c && c.startsWith('ES') && c.length >= 10); // Relaxed length to be safer
    return validCups[0] || filteredValidBills[0]?.cups || 'CUPS NO DETECTADO';
  }, [filteredValidBills]);

  const { chartData, pieData, summaryStats, tableData } = useMemo(() => {
    const parseDate = (d?: string) => {
      if (!d) return 0;
      if (d.includes('-')) return new Date(d).getTime() || 0;
      if (d.includes('/')) {
        const [day, month, year] = d.split('/').map(Number);
        return new Date(year, month - 1, day).getTime() || 0;
      }
      return new Date(d).getTime() || 0;
    };

    const billsForQuarter = filteredValidBills.filter(b => {
      const d = parseDate(b.fechaFin);
      if (!d) return false;
      const month = new Date(d).getMonth() + 1;
      return selectedQuarter === 1 ? (month >= 1 && month <= 3) :
             selectedQuarter === 2 ? (month >= 4 && month <= 6) :
             selectedQuarter === 3 ? (month >= 7 && month <= 9) :
             selectedQuarter === 4 ? (month >= 10 && month <= 12) : true;
    });

    const totals = { energetic: 0, power: 0, taxes: 0, others: 0, global: 0, kwh: 0 };
    const monthMap: Record<string, any> = {};

    billsForQuarter.forEach(b => {
      const { month: monthIdx, year } = getAssignedMonth(b.fechaInicio, b.fechaFin);
      
      const monthNames = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      const name = monthNames[monthIdx] || 'S/D';
      
      const energia = b.costeTotalConsumo || 0;
      const potencia = b.costeTotalPotencia || 0;
      let imp = 0, others = 0;
      [...(b.otrosConceptos || []), ...(customOCs[b.id] || [])].forEach(oc => {
        if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) imp += oc.total;
        else others += oc.total;
      });

      totals.energetic += energia; 
      totals.power += potencia; 
      totals.taxes += imp; 
      totals.others += others;
      const totalF = energia + potencia + imp + others;
      totals.global += totalF; 
      totals.kwh += (b.consumoTotalKwh || 0);

      const mKey = `${year}-${monthIdx}`;
      if (!monthMap[mKey]) {
        monthMap[mKey] = {
          name,
          monthIdx,
          year,
          totalFactura: 0,
          energia: 0,
          potencia: 0,
          otros: 0,
          totalKwh: 0,
          billsCount: 0
        };
      }

      monthMap[mKey].totalFactura += totalF;
      monthMap[mKey].energia += energia;
      monthMap[mKey].potencia += potencia;
      monthMap[mKey].otros += (imp + others);
      monthMap[mKey].totalKwh += (b.consumoTotalKwh || 0);
      monthMap[mKey].billsCount++;
    });

    const cData = Object.values(monthMap)
      .sort((a: any, b: any) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.monthIdx - b.monthIdx;
      });

    // Keep the tableData as individual bills for the detailed matrix
    const tData = billsForQuarter.map(b => {
      const energia = b.costeTotalConsumo || 0;
      const potencia = b.costeTotalPotencia || 0;
      let imp = 0, others = 0;
      [...(b.otrosConceptos || []), ...(customOCs[b.id] || [])].forEach(oc => {
        if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) imp += oc.total;
        else others += oc.total;
      });
      const totalF = energia + potencia + imp + others;
      return {
        name: new Date(b.fechaFin || '').toLocaleString('es-ES', { month: 'long' }),
        period: `${b.fechaInicio?.split('-').reverse().slice(0,2).join('/')}-${b.fechaFin?.split('-').reverse().slice(0,2).join('/')}`,
        P1: b.consumo?.find(c => c.periodo === 'P1')?.kwh || 0,
        P2: b.consumo?.find(c => c.periodo === 'P2')?.kwh || 0,
        P3: b.consumo?.find(c => c.periodo === 'P3')?.kwh || 0,
        P4: b.consumo?.find(c => c.periodo === 'P4')?.kwh || 0,
        P5: b.consumo?.find(c => c.periodo === 'P5')?.kwh || 0,
        P6: b.consumo?.find(c => c.periodo === 'P6')?.kwh || 0,
        totalKwh: b.consumoTotalKwh || 0,
        avgPrice: b.costeMedioKwh || 0,
        totalFactura: totalF,
        energia, potencia, otros: imp + others, id: b.id,
        prices: {
          P1: b.consumo?.find(c => c.periodo === 'P1')?.precioKwh || 0,
          P2: b.consumo?.find(c => c.periodo === 'P2')?.precioKwh || 0,
          P3: b.consumo?.find(c => c.periodo === 'P3')?.precioKwh || 0,
          P4: b.consumo?.find(c => c.periodo === 'P4')?.precioKwh || 0,
          P5: b.consumo?.find(c => c.periodo === 'P5')?.precioKwh || 0,
          P6: b.consumo?.find(c => c.periodo === 'P6')?.precioKwh || 0,
          P1_agg: b.consumo?.find(c => c.periodo === 'P1')?.isAggregate,
          P2_agg: b.consumo?.find(c => c.periodo === 'P2')?.isAggregate,
          P3_agg: b.consumo?.find(c => c.periodo === 'P3')?.isAggregate,
          P4_agg: b.consumo?.find(c => c.periodo === 'P4')?.isAggregate,
          P5_agg: b.consumo?.find(c => c.periodo === 'P5')?.isAggregate,
          P6_agg: b.consumo?.find(c => c.periodo === 'P6')?.isAggregate,
        }
      };
    });
    const pData = [
      { name: 'Consumo Energía', value: totals.energetic, color: '#3b82f6' },
      { name: 'Potencia Contratada', value: totals.power, color: '#8b5cf6' },
      { name: 'Impuestos y Tasas', value: totals.taxes, color: '#10b981' },
      { name: 'Otros Conceptos', value: totals.others, color: '#f59e0b' }
    ].filter(i => i.value > 0);
    return { chartData: cData, pieData: pData, summaryStats: totals, tableData: tData };
  }, [filteredValidBills, customOCs, selectedQuarter]);



  const isTop3 = (val: number, array: number[]) => {
    const sorted = [...new Set(array)].sort((a, b) => b - a);
    return sorted.slice(0, 3).includes(val) && val > 0;
  };

  const reactToPrintFn = useReactToPrint({ contentRef, documentTitle: `Voltis_Report_${projectName}` });

  const hasData = filteredValidBills.length > 0;

  const handleSendEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) { toast.error('Introduce un correo válido'); return; }
    setIsSending(true);
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, projectName }),
      });
      if (res.ok) {
        setIsSent(true);
        toast.success(`Informe enviado a ${email}`);
        setTimeout(() => setIsSent(false), 6000);
      } else {
        const d = await res.json();
        toast.error(d.error || 'Error al enviar');
      }
    } catch {
      toast.error('Error de conexión al enviar el correo');
    } finally {
      setIsSending(false);
    }
  }, [email, projectName]);

  return (
    <>
      <div ref={containerRef} className="relative w-full bg-[#020617] text-white overflow-y-auto selection:bg-blue-500/30 scroll-smooth h-screen">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(15,23,42,1)_0%,rgba(2,6,23,1)_80%)]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* NAV */}
      <div className="fixed top-6 left-6 right-6 flex items-center justify-between z-[100] no-print px-4">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="flex items-center gap-2 px-6 py-2 rounded-full border border-white/10 glass text-[10px] font-black uppercase tracking-widest hover:bg-white/5">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div className="flex bg-white/5 rounded-full p-1 border border-blue-500/20 shadow-2xl backdrop-blur-3xl">
            {[0, 1, 2, 3, 4].map(q => (
              <button key={q} onClick={() => setSelectedQuarter(q)}
                className={`px-5 py-2 rounded-full text-[10px] font-black tracking-widest transition-all ${selectedQuarter === q ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
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
            <p className="text-slate-500 max-w-md mx-auto">Sube una factura o cambia el filtro.</p>
          </div>
        ) : (
          <>
            {/* ── PAGE 1: PORTADA ── */}
            <section id="scene-1" className="report-page flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20 z-0 mix-blend-screen">
                <img src="/mascot.jpg" alt="Voltis Mascot" className="w-[600px] h-[600px] object-cover" style={{ maskImage: 'radial-gradient(circle at center, black 30%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle at center, black 30%, transparent 70%)' }} />
              </div>
              <div className="hero-content text-center space-y-12 relative z-10" style={{ opacity: 1 }}>
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
                  <div className="pt-2 flex flex-col items-center gap-2">
                    <p className="inline-block text-sm text-white font-black tracking-[0.1em] uppercase bg-blue-500/10 px-10 py-3 rounded-full border border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.2)] min-w-[320px]">
                      CUPS: {projectCups}
                    </p>
                    <p className="text-[10px] text-blue-400/60 font-black tracking-[0.4em] uppercase">
                      TARIFA {filteredValidBills[0]?.tarifa || '3.0TD'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── PAGE 2: KPIs ── */}
            <section id="scene-2" className="report-page flex flex-col justify-center px-16">
              <div className="w-full max-w-5xl mx-auto">
                <div className="mb-16 flex items-end justify-between border-b border-white/5 pb-8">
                  <div className="space-y-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-500">Métricas Auditadas</span>
                    <h3 className="text-6xl font-black tracking-tighter uppercase">Resultados {selectedQuarter === 0 ? 'Anuales' : `Q${selectedQuarter}`}</h3>
                  </div>
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">v4.6 Certified Analysis</div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Facturación Global', value: summaryStats.global, unit: '€', icon: DollarSign, color: 'text-blue-500', dec: 2 },
                    { label: 'Energía Absoluta', value: summaryStats.kwh, unit: 'kWh', icon: Zap, color: 'text-sky-400', dec: 0 },
                    { label: 'Precio Promedio', value: summaryStats.global / (summaryStats.kwh || 1), unit: '€/kWh', icon: TrendingUp, color: 'text-teal-400', dec: 2 },
                    { label: 'Docs Procesados', value: filteredValidBills.length, unit: 'IA', icon: CheckCircle2, color: 'text-indigo-400', dec: 0 },
                  ].map((kpi, i) => (
                    <div key={i} className="kpi-card glass p-8 rounded-[40px] border border-white/5 relative overflow-hidden">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-8 ${kpi.color}`}>
                        <kpi.icon className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">{kpi.label}</span>
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-black tracking-tighter tabular-nums"><CountUp value={kpi.value} decimals={kpi.dec} /></p>
                        <span className="text-xs font-bold text-slate-600">{kpi.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── PAGE 3: EVOLUCIÓN MENSUAL + BIO-ESTRUCTURA ── */}
            <section id="scene-3" className="report-page flex flex-col justify-center px-16 gap-12">
              <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-12">
                {/* Chart */}
                <div className="lg:col-span-3 flex flex-col gap-6">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-500 block">Digital Flow 03</span>
                    <h3 className="text-4xl font-black tracking-tighter uppercase leading-[0.9]">Evolución Mensual</h3>
                    <p className="text-slate-400 text-sm font-medium mt-2">Esta es tu curva de consumo anual.</p>
                  </div>
                  <div className="flex-1 h-[300px] glass p-6 rounded-[40px] border border-white/5">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.03)" vertical={false} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 900 }} dy={10} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 900 }} />
                        <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
                        <Bar dataKey="totalFactura" fill="url(#blueGrad)" radius={[10, 10, 0, 0]} barSize={30} minPointSize={4} isAnimationActive={false}>
                          {chartData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fillOpacity={Math.abs(entry.totalFactura) < 0.01 ? 0.1 : 1} />
                          ))}
                        </Bar>
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

                {/* Pie */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.8em] text-blue-500">Visual 04</span>
                    <h3 className="text-4xl font-black tracking-tighter uppercase leading-[0.9]">Bio-Estructura Económica</h3>
                  </div>
                  <div className="h-[180px] relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={6} dataKey="value" stroke="none" isAnimationActive={false}>
                          {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute flex flex-col items-center pointer-events-none">
                      <span className="text-3xl font-black tracking-tighter">{summaryStats.global.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {pieData.map((item: any, i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-xs font-black text-white/70 uppercase">{item.name}</span>
                        </div>
                        <span className="text-sm font-black text-blue-400">{((item.value / summaryStats.global) * 100).toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── PAGE 4: MATRIZ ENERGÉTICA ── */}
            <section id="scene-4" className="report-page flex flex-col justify-start pt-20 px-10">
              <div className="max-w-6xl w-full mx-auto space-y-8">
                <div className="text-center space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[1em] text-blue-500">Engineering Matrix</span>
                  <h3 className="text-5xl font-black tracking-tighter uppercase">Audit Matrix Pro</h3>
                </div>
                <MatrixTable
                  title="Matriz Energética Mensual (kWh)"
                  color="text-blue-400"
                  tableData={tableData}
                  dataKey="totalKwh"
                  unit=""
                  decimals={0}
                  isTop3={isTop3}
                  onRowClick={() => {}}
                  onPreview={(id) => onPreviewBill?.(id)}
                />
              </div>
            </section>

            {/* ── PAGE 5: MATRIZ DE COSTE x PERIODO ── */}
            <section id="scene-5" className="report-page flex flex-col justify-start pt-20 px-10">
              <div className="max-w-6xl w-full mx-auto space-y-8">
                <MatrixTable
                  title="Matriz de Coste x Periodo (€/kWh)"
                  color="text-cyan-400"
                  tableData={tableData}
                  dataKey="avgPrice"
                  unit=""
                  decimals={2}
                  isTop3={isTop3}
                  onRowClick={(id) => setSelectedPriceBillId(id)}
                  onPreview={(id) => onPreviewBill?.(id)}
                  isPriceMatrix
                />
                <p className="text-center text-[10px] text-slate-600 uppercase tracking-widest">Haz click en una fila para ver el cálculo del precio medio</p>
              </div>
            </section>

            {/* ── PAGE 6: MATRIZ ECONÓMICA INTEGRAL ── */}
            <section id="scene-6" className="report-page flex flex-col justify-start pt-20 px-10">
              <div className="max-w-6xl w-full mx-auto space-y-8">
                <MatrixTable
                  title="Matriz Económica Integral (€)"
                  color="text-indigo-400"
                  tableData={tableData}
                  dataKey="totalFactura"
                  unit="€"
                  decimals={2}
                  isTop3={isTop3}
                  onRowClick={(id) => setSelectedBillId(id)}
                  onPreview={(id) => onPreviewBill?.(id)}
                />
                <p className="text-center text-[10px] text-slate-600 uppercase tracking-widest">Haz click en un mes para ver el desglose de la factura</p>
              </div>
            </section>

            {/* ── PAGE 7: LISTO PARA OPTIMIZAR ── */}
            <section id="scene-7" className="report-page flex flex-col items-center justify-center p-12">
              <div className="max-w-3xl w-full flex flex-col items-center space-y-16 text-center">
                {/* Voltis Logo */}
                <div className="flex flex-col items-center gap-6">
                  <img
                    src="/voltis-economics-logo.png"
                    alt="Voltis Economics Logo"
                    className="w-36 h-36 object-contain"
                    style={{ mixBlendMode: 'screen', filter: 'drop-shadow(0 0 40px rgba(59,130,246,0.5))' }}
                  />
                  <h3 className="text-7xl md:text-[100px] font-black uppercase tracking-tighter leading-[0.7] text-glow">LISTO PARA OPTIMIZAR</h3>
                  <p className="text-xl text-slate-400 font-medium italic opacity-50">Auditoría de Precisión Finalizada</p>
                </div>

                {/* Email Box */}
                <div className="w-full max-w-md glass border border-white/10 rounded-[40px] p-10 space-y-6 no-print">
                  <div className="flex flex-col items-center gap-2">
                    <Mail className="w-8 h-8 text-blue-400" />
                    <h4 className="text-lg font-black tracking-tight text-white">Enviar informe por correo</h4>
                    <p className="text-xs text-slate-500">Recibirás el acceso al informe en tu bandeja de entrada</p>
                  </div>
                  <form onSubmit={handleSendEmail} className="flex flex-col gap-4">
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={isSending || isSent}
                      className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
                    >
                      {isSent ? (
                        <><CheckCircle2 className="w-4 h-4" /> ¡Enviado!</>
                      ) : isSending ? (
                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
                      ) : (
                        <><Send className="w-4 h-4" /> Enviar PDF por correo</>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <style jsx global>{`
        html { scroll-behavior: smooth !important; }
        .report-container { width: 100%; position: relative; }
        section { opacity: 1; }
        .glass { background: rgba(15,23,42,0.4) !important; backdrop-filter: blur(40px) !important; }
        .text-glow { text-shadow: 0 0 30px rgba(255,255,255,0.4), 0 0 80px rgba(59,130,246,0.2); }
        .report-page { min-height: 100vh; width: 100%; display: flex; }
        .kpi-card { will-change: transform, opacity; backface-visibility: visible; }
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { 
            background: #020617 !important; 
            margin: 0 !important; padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .report-container { background: #020617 !important; color: white !important; }
          .report-page {
            width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            padding: 15mm !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            opacity: 1 !important;
            transform: none !important;
            box-sizing: border-box !important;
            background: #020617 !important;
          }
          .report-page:last-child { page-break-after: auto !important; }
          /* Reset any GSAP transforms for print */
          .report-page, .report-page * { 
            animation: none !important;
            transition: none !important;
          }
          /* Force ALL elements visible and remove transforms */
          .kpi-card, .glass, table, th, td, h1, h2, h3, h4, p, span, div {
            opacity: 1 !important;
            transform: none !important;
          }
          /* KPI grid compact */
          .kpi-card { padding: 20px !important; border-radius: 24px !important; margin: 0 !important; }
          /* Tables compact */
          table { font-size: 8px !important; width: 100% !important; margin-top: 20px !important; }
          th, td { padding: 5px 8px !important; }
          /* Charts — explicit pixel size for recharts to render */
          [class*='recharts-responsive-container'] { 
            width: 100% !important; 
            height: 300px !important; 
            min-height: 300px !important;
            display: block !important;
          }
          .recharts-wrapper, .recharts-surface { 
            width: 100% !important; 
            height: 300px !important; 
            min-height: 300px !important;
          }
          /* Force SVG to be visible and have correct size */
          svg {
            width: 100% !important;
            height: 300px !important;
            overflow: visible !important;
          }
          /* Fallback for gradients in print */
          .recharts-rectangle {
            fill: #3b82f6 !important;
            stroke: none !important;
          }
          .recharts-pie-sector {
            stroke: none !important;
          }
          /* Detail fixes for print layout */
          .report-page {
            box-shadow: none !important;
          }
          /* Mascot fix: masks often fail in print */
          #scene-1 img {
            mask-image: none !important;
            -webkit-mask-image: none !important;
            opacity: 0.05 !important;
          }
          /* Ensure text is always on top and visible */
          h1, h2, h3, h4, .text-glow {
            text-shadow: none !important;
            color: white !important;
          }
          /* Glass visible in print */
          .glass { 
            background: rgba(15,23,42,0.95) !important; 
            border: 1px solid rgba(255,255,255,0.1) !important; 
          }
          table, tr, .kpi-card, .pdf-avoid-break { 
            break-inside: avoid !important; 
            page-break-inside: avoid !important; 
          }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
      </div>

      {/* MODAL MATRIX 3: Desglose factura */}
      <AnimatePresence>
        {selectedBillId && filteredValidBills.find(b => b.id === selectedBillId) && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl no-print" onClick={() => setSelectedBillId(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card border border-white/10 rounded-[64px] w-full max-w-2xl p-14 relative z-[510]" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-10">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">Desglose · Matriz Económica Integral</p>
                  <h4 className="text-3xl font-black uppercase italic">{filteredValidBills.find(b => b.id === selectedBillId)?.fileName.split('.')[0]}</h4>
                </div>
                <button onClick={() => setSelectedBillId(null)} className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-6 rounded-[32px] bg-blue-600/10 border border-blue-500/20 col-span-2">
                  <span className="text-[10px] uppercase tracking-widest text-blue-500 block mb-1">Total Factura</span>
                  <span className="text-4xl font-black">
                    {(tableData.find((d: any) => d.id === selectedBillId)?.totalFactura || 0).toFixed(2)} €
                  </span>
                </div>
              </div>
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Energía por Periodo</p>
                  <div className="grid grid-cols-3 gap-2">
                    {filteredValidBills.find(b => b.id === selectedBillId)?.consumo?.filter(c => c.total > 0).map((c, i) => (
                      <div key={i} className="flex justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                        <span className="font-black text-[10px] text-slate-400">{c.periodo}</span>
                        <span className="font-black text-blue-400 text-[11px]">{c.total.toFixed(2)} €</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between p-5 rounded-[24px] bg-purple-600/10 border border-purple-500/20">
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Total Potencia</span>
                  <span className="text-xl font-black">{(filteredValidBills.find(b => b.id === selectedBillId)?.costeTotalPotencia || 0).toFixed(2)} €</span>
                </div>
                <div className="flex justify-between p-5 rounded-[24px] bg-white/5 border border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Otros Conceptos</span>
                  <span className="text-xl font-black">
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
                <div className="flex justify-between p-5 rounded-[24px] bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Impuestos y Tasas</span>
                  <span className="text-xl font-black">
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL MATRIX 2: Cálculo precio medio */}
      <AnimatePresence>
        {selectedPriceBillId && (() => {
          const row = tableData.find((d: any) => d.id === selectedPriceBillId);
          const bill = filteredValidBills.find(b => b.id === selectedPriceBillId);
          if (!row || !bill) return null;
          const periods = ['P1','P2','P3','P4','P5','P6'];
          const validPeriods = periods.filter(p => {
            const c = bill.consumo?.find(cp => cp.periodo === p);
            return c && c.kwh > 0;
          });
          return (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl no-print" onClick={() => setSelectedPriceBillId(null)}>
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="glass-card border border-white/10 rounded-[64px] w-full max-w-xl p-14 relative z-[510]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500 mb-1">Cálculo · Precio Medio por Periodo</p>
                    <h4 className="text-2xl font-black uppercase italic">{(row as any).name}</h4>
                  </div>
                  <button onClick={() => setSelectedPriceBillId(null)} className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center hover:bg-white/10">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 mb-8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Precio x kWh consumido</p>
                  {validPeriods.map(p => {
                    const c = bill.consumo?.find(cp => cp.periodo === p);
                    return (
                      <div key={p} className="flex justify-between p-4 rounded-2xl bg-white/5 border border-white/5 items-center">
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-black text-cyan-400">{p}</span>
                          <span className="text-[10px] font-medium text-slate-500 italic">{c?.kwh.toLocaleString('es-ES')} kWh</span>
                        </div>
                        <span className="text-sm font-black text-white">{c?.precioKwh.toFixed(4)} €/kWh</span>
                      </div>
                    );
                  })}
                </div>

                <div className="p-6 rounded-[32px] bg-cyan-600/10 border border-cyan-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-widest text-cyan-500">Precio Medio Ponderado</span>
                    <span className="text-xs font-bold text-slate-500 italic">Σ(kWh * Precio) / ΣkWh</span>
                  </div>
                  <span className="text-3xl font-black text-white">{bill.costeMedioKwh?.toFixed(4)} €/kWh</span>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </>
  );
}

// ── Reusable Matrix Table Component ──
function MatrixTable({ title, color, tableData, dataKey, unit, decimals, isTop3, onRowClick, onPreview, isPriceMatrix }: {
  title: string; color: string; tableData: any[]; dataKey: string; unit: string;
  decimals: number; isTop3: (v: number, arr: number[]) => boolean; onRowClick: (id: string) => void; onPreview?: (id: string) => void; isPriceMatrix?: boolean;
}) {
  const top3Indices = new Set(
    [...tableData]
      .map((d: any, i: number) => ({ val: d[dataKey], i }))
      .sort((a: any, b: any) => b.val - a.val)
      .slice(0, 3)
      .map((x: any) => x.i)
  );

  return (
    <div className="space-y-4 pdf-avoid-break w-full">
      <h4 className={`text-[11px] font-black uppercase tracking-[0.6em] ${color} flex items-center justify-between px-4`}>
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4" /> {title}
        </div>
        <span className="text-[8px] opacity-30 lowercase tracking-normal font-medium no-print">Click para detalles • Preview disponible</span>
      </h4>
      <div className="glass p-2 rounded-[40px] border border-white/5 overflow-hidden bg-slate-900/10">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead className="bg-slate-900/30 font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-6 py-5">Mes</th>
              {['P1','P2','P3','P4','P5','P6'].map(p => <th key={p} className="px-3 py-5 text-center">{p}</th>)}
              <th className="px-6 py-5 text-right">MAGNITUD</th>
              <th className="px-4 py-5 text-center no-print"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {tableData.map((row, idx) => {
              const val = row[dataKey];
              const isTopRow = top3Indices.has(idx) && val > 0;
              return (
                <tr key={idx} className="hover:bg-white/[0.02] transition-all group cursor-pointer" onClick={() => onRowClick(row.id)}>
                  <td className="px-6 py-4 font-black text-white italic uppercase text-[11px]">{row.name}</td>
                  {[1,2,3,4,5,6].map(p => {
                    const price = isPriceMatrix ? row.prices[`P${p}`] : row[`P${p}`];
                    const isAgg = isPriceMatrix && row.prices[`P${p}_agg`];
                    return (
                      <td key={p} className="px-3 py-4 text-center text-slate-500 font-bold group-hover:text-slate-300 text-[9px]">
                        {isPriceMatrix ? price.toFixed(4) : Number(price).toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                        {isAgg && <span className="block text-[7px] text-blue-400 mt-0.5 opacity-60">ATR+C</span>}
                      </td>
                    );
                  })}
                  <td className={`px-6 py-4 text-right font-black text-[13px] transition-all ${isTopRow ? 'text-red-500' : color}`}>
                    {val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}
                  </td>
                  <td className="px-4 py-4 text-center no-print">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onPreview?.(row.id); }}
                      className="p-2 rounded-xl bg-white/5 hover:bg-blue-600/20 text-slate-500 hover:text-blue-400 transition-all border border-white/5"
                      title="Ver factura original"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

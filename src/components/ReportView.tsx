"use client";

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, TrendingUp, DollarSign, CheckCircle2, ShieldCheck, Cpu, AlertTriangle, Send, Mail, X, FileText, Eye, Layout, Loader, Copy, Check, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { getAssignedMonth, parseSpanishDate } from '@/lib/date-utils';
import { MascotaHero } from './MascotaHero';
import { HeroTitle } from './HeroTitle';

gsap.registerPlugin(ScrollTrigger);

interface ReportViewProps {
  bills: ExtractedBill[];
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onBack: () => void;
  onPreviewBill?: (billId: string) => void;
  projectName?: string;
  projectId?: string; // New prop
  userId?: string;    // New prop
  onReady?: () => void; // New prop
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

const GlowOrb = ({ className = '', size = 'lg' }: { className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
  const sizes = {
    sm: 'w-64 h-64 blur-[80px]',
    md: 'w-96 h-96 blur-[120px]',
    lg: 'w-[500px] h-[500px] blur-[150px]',
    xl: 'w-[800px] h-[800px] blur-[200px]'
  };
  return <div className={`glow-orb absolute rounded-full bg-blue-500/10 ${sizes[size]} ${className}`} />;
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

export default function ReportView({ bills, customOCs, onBack, onPreviewBill, projectName = 'PROYECTO', projectId, userId, onReady }: ReportViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null); // For matrix 3
  const [selectedPriceBillId, setSelectedPriceBillId] = useState<string | null>(null); // For matrix 2
  const [selectedQuarter, setSelectedQuarter] = useState<number>(0);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const getMonthYear = (dateStr?: string) => {
    if (!dateStr) return 'S/D';
    try {
      const date = parseSpanishDate(dateStr);
      if (!date) return 'S/D';
      return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
    } catch (e) {
      return 'S/D';
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isReportReady, setIsReportReady] = useState(false);
  
  const searchParams = useSearchParams();
  const isExportMode = useMemo(() => {
    if (searchParams?.get('export') === 'true') return true;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('export') === 'true') return true;
    return false;
  }, [searchParams]);

  useEffect(() => {
    if (isExportMode && !isReportReady) {
      let attempts = 0;
      const checkContent = setInterval(() => {
        attempts++;
        const rechartsSurfaces = document.querySelectorAll('.recharts-surface');
        const hasCharts = rechartsSurfaces.length >= 2;
        const hasTables = document.querySelectorAll('table tr').length >= 8;
        
        let svgContentReady = false;
        if (hasCharts) {
          svgContentReady = Array.from(rechartsSurfaces).some(surface => {
            const svg = surface.closest('svg');
            return svg && svg.querySelector('rect, path, circle') !== null;
          });
        }
        
        console.log(`[Export Observer] Attempt ${attempts}: charts=${hasCharts} tables=${hasTables} svgContent=${svgContentReady}`);
        
        if ((hasCharts && hasTables && svgContentReady) || attempts > 40) {
          clearInterval(checkContent);
          console.log('[Export Observer] Content ready, waiting for final paint...');
          setTimeout(() => {
            console.log('[Export Observer] Setting isReportReady=true');
            setIsReportReady(true);
            if (onReady) onReady();
          }, 3000);
        }
      }, 500);
      return () => clearInterval(checkContent);
    }
  }, [isExportMode, isReportReady, onReady]);

  // Force DOM attribute as backup for hydration issues
  useEffect(() => {
    if (containerRef.current && isExportMode) {
      containerRef.current.setAttribute('data-report-ready', isReportReady ? 'true' : 'false');
    }
  }, [isExportMode, isReportReady]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPreviewMode) return;
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
    if (isExportMode) return;
    const ctx = gsap.context(() => {
      // If exporting, freeze animations immediately
      if (isExportMode) {
        gsap.globalTimeline.pause();
      }

      // Set 3D perspective on sections
      gsap.set('.report-page', { transformPerspective: 1200 });

      // Ensure hero content is visible immediately
      gsap.set('.hero-content', { opacity: 1, scale: 1, y: 0 });

      // Hero: smooth parallax on scroll-out
      gsap.to('.hero-content', {
        scale: 0.92, opacity: 0.15, y: -60,
        scrollTrigger: { 
          trigger: '#scene-1', 
          start: 'top top', 
          end: 'bottom 30%', 
          scrub: 1.5,
          scroller: containerRef.current 
        }
      });

      // Scene entrances
      ['#scene-2','#scene-3','#scene-4','#scene-5','#scene-6','#scene-7'].forEach((id) => {
        gsap.fromTo(id,
          { y: 70, opacity: 0, transformPerspective: 900, rotationX: 8, scale: 0.98 },
          { y: 0, opacity: 1, rotationX: 0, scale: 1, duration: 1.1, ease: 'power3.out',
            immediateRender: false,
            scrollTrigger: { 
              trigger: id, 
              start: 'top 88%', 
              once: true,
              scroller: containerRef.current 
            }
          }
        );

        if (id === '#scene-2') {
          gsap.fromTo('.kpi-card',
            { transformPerspective: 800, rotationY: 25, scale: 0.88, opacity: 0, y: 20 },
            { rotationY: 0, scale: 1, opacity: 1, y: 0,
              stagger: 0.13, duration: 0.9, ease: 'back.out(1.5)',
              immediateRender: false,
              scrollTrigger: { 
                trigger: id, 
                start: 'top 82%', 
                once: true,
                scroller: containerRef.current 
              }
            }
          );
        }
      });
      // Continuous parallax for deep space feel
      gsap.to('.parallax-bg', {
        y: '25%',
        ease: 'none',
        scrollTrigger: {
          trigger: containerRef.current,
          scroller: containerRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
        }
      });

      gsap.to('.parallax-float', {
        y: -60,
        ease: 'none',
        scrollTrigger: {
          trigger: containerRef.current,
          scroller: containerRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 1.5,
        }
      });
    }, containerRef);
    return () => ctx.revert();
  }, [selectedQuarter]);

  useEffect(() => {
    // Small timeout to ensure everything is rendered and measured
    const timer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 500);
    return () => clearTimeout(timer);
  }, [bills]); // Watching bills is safer than the yet-to-be-defined filteredValidBills

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
      const { month: monthIdx } = getAssignedMonth(b.fechaInicio, b.fechaFin);
      const m1Idx = monthIdx + 1; // 1-indexed for logic below
      return selectedQuarter === 1 ? (m1Idx >= 1 && m1Idx <= 3) :
             selectedQuarter === 2 ? (m1Idx >= 4 && m1Idx <= 6) :
             selectedQuarter === 3 ? (m1Idx >= 7 && m1Idx <= 9) :
             selectedQuarter === 4 ? (m1Idx >= 10 && m1Idx <= 12) : true;
    });

    const totals = { energetic: 0, power: 0, taxes: 0, others: 0, global: 0, kwh: 0 };
    const monthMap: Record<string, any> = {};

    billsForQuarter.forEach(b => {
      const { month: monthIdx, year } = getAssignedMonth(b.fechaInicio, b.fechaFin);
      
      const monthNames = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      const name = getMonthYear(b.fechaFin);
      
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
        name: getMonthYear(b.fechaFin),
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
        <div 
        ref={containerRef} 
        className={`relative w-full h-screen overflow-y-auto bg-[#020617] text-white selection:bg-blue-500/30 scroll-smooth ${isExportMode ? 'is-exporting' : ''} ${(isPreviewMode || isExportMode) ? 'overflow-y-visible' : ''}`}
        data-report-ready={isReportReady}
      >
        <div className="fixed inset-0 pointer-events-none z-0 no-print">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(15,23,42,1)_0%,rgba(2,6,23,1)_80%)]" />
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        </div>

        {/* NAV - Apple Glass Style */}
        <div className="fixed top-6 left-6 right-6 flex items-center justify-between z-[100] no-print px-4">
          <div className="flex items-center gap-4">
            {/* Circular Back Button */}
            <button onClick={onBack} className="back-btn" title="Volver">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-[8px] text-white/20 uppercase tracking-widest px-2 py-1 border border-white/10 rounded-md">V-SYNC-AUDIT-01</span>
            
            {/* iOS Segmented Control - Centered */}
            <div className="segment-control">
              {[0, 1, 2, 3, 4].map(q => (
                <button 
                  key={q} 
                  onClick={() => setSelectedQuarter(q)}
                  className={`segment-btn ${selectedQuarter === q ? 'active' : ''}`}
                >
                  {q === 0 ? 'ANUAL' : `Q${q}`}
                </button>
              ))}
            </div>
          </div>
          
          {/* Top-right buttons removed to keep focus on the final call-to-action */}

        </div>

      <div ref={contentRef} className={`relative z-10 report-container ${isPreviewMode || isExportMode ? 'preview-mode' : ''}`}>
        {!hasData ? (
          <div className="min-h-screen flex flex-col items-center justify-center p-12 text-center space-y-6">
            <AlertTriangle className="w-16 h-16 text-amber-500 animate-pulse" />
            <h3 className="text-4xl font-black uppercase tracking-tighter">Sin datos en {selectedQuarter === 0 ? 'este proyecto' : `Q${selectedQuarter}`}</h3>
            <p className="text-slate-500 max-w-md mx-auto">Sube una factura o cambia el filtro.</p>
          </div>
        ) : (
          <>
            {/* ── PAGE 1: PORTADA ── */}
            <section id="scene-1" className="report-page relative flex flex-col items-center justify-center p-12 overflow-hidden">
              <GlowOrb className="-top-20 -left-20 opacity-30 parallax-bg" size="xl" />
              <GlowOrb className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20 parallax-bg" size="xl" />
              <GlowOrb className="-bottom-20 -right-20 opacity-30 parallax-bg" size="xl" />
              
              <div className="max-w-5xl w-full flex flex-col items-center text-center relative z-10">
                <HeroTitle subtitle={selectedQuarter === 0 ? 'ANUAL' : `Q${selectedQuarter} EVOLUTION`}>
                  VOLTIS
                </HeroTitle>
                
                <div className="hero-content text-center space-y-4 relative z-10 mt-4" style={{ opacity: 1 }}>
                  <div className="space-y-2">
                    <div className="h-0.5 w-12 bg-blue-500 mx-auto rounded-full shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
                    <h3 className="text-5xl font-black tracking-tighter text-blue-500 uppercase">{projectName}</h3>
                    <div className="flex flex-col items-center">
                      <p className="inline-block text-sm text-white font-black tracking-[0.2em] uppercase glass-immersion px-10 py-3 rounded-full border border-white/10 shadow-[0_0_30px_rgba(59,130,246,0.2)] min-w-[320px]">
                        CUPS · {projectCups}
                      </p>
                      <p className="text-[10px] text-blue-400/60 font-black tracking-[0.5em] uppercase mt-2">
                        TARIFA {filteredValidBills[0]?.tarifa || '3.0TD'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── PAGE 2: KPIs ── */}
              {/* ── KPIs ── */}
              <section id="scene-2" className="report-page flex flex-col justify-center px-16">
                <div className="w-full max-w-5xl mx-auto">
                  <div className="mb-12 flex items-end justify-between border-b border-white/5 pb-8">
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
                      <div key={i} className="kpi-card kpi-glass-premium p-8 rounded-[40px] border relative overflow-hidden group">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 bg-white/10 border border-white/10 ${kpi.color} kpi-icon-glow`}>
                          <kpi.icon className="w-7 h-7" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block mb-2">{kpi.label}</span>
                        <div className="flex items-baseline gap-2">
                          <p className="text-4xl font-black tracking-tighter tabular-nums text-white group-hover:text-blue-400 transition-colors">
                            <CountUp value={kpi.value} decimals={kpi.dec} />
                          </p>
                          <span className="text-xs font-bold text-slate-500 uppercase">{kpi.unit}</span>
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
                    <div className="flex-1 w-full glass p-6 rounded-[40px] border border-white/5 overflow-visible" style={{ height: 350, minHeight: 350 }}>
                      {!isExportMode ? (
                        <ResponsiveContainer width="100%" height={330}>
                          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.03)" vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 900 }} dy={15} interval={0} angle={-35} textAnchor="end" height={80} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 900 }} />
                            <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
                            <Bar dataKey="totalFactura" fill="url(#blueGrad)" radius={[10, 10, 0, 0]} barSize={30} minPointSize={4}>
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
                      ) : (
                        <BarChart width={750} height={330} data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.03)" vertical={false} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 900 }} dy={15} interval={0} angle={-35} textAnchor="end" height={80} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 900 }} />
                          <Bar dataKey="totalFactura" fill="#3b82f6" radius={[10, 10, 0, 0]} barSize={30} isAnimationActive={false}>
                            {chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fillOpacity={1} />
                            ))}
                          </Bar>
                        </BarChart>
                      )}
                    </div>
                  </div>

                  {/* Pie */}
                  <div className="lg:col-span-2 flex flex-col gap-6">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.8em] text-blue-500">Visual 04</span>
                      <h3 className="text-4xl font-black tracking-tighter uppercase leading-[0.9]">Bio-Estructura Económica</h3>
                    </div>
                    <div className="lg:col-span-2 w-full glass p-8 rounded-[40px] border border-white/5 flex items-center justify-center relative overflow-visible" style={{ height: 350, minHeight: 350 }}>
                      {!isExportMode ? (
                        <ResponsiveContainer width="100%" height={330}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={6} dataKey="value" stroke="none">
                              {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <PieChart width={350} height={330}>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={6} dataKey="value" stroke="none" isAnimationActive={false}>
                            {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                        </PieChart>
                      )}
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
            <section id="scene-4" className={`report-page flex flex-col justify-start px-10 ${isExportMode ? 'pt-10' : 'pt-20'}`}>
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
                  onPreviewBill={onPreviewBill}
                />
              </div>
            </section>

            {/* ── PAGE 5: MATRIZ DE COSTE x PERIODO ── */}
            <section id="scene-5" className={`report-page flex flex-col justify-start px-10 ${isExportMode ? 'pt-10' : 'pt-20'}`}>
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
                  onPreviewBill={onPreviewBill}
                  isPriceMatrix
                />
                <p className="text-center text-[10px] text-slate-600 uppercase tracking-widest">Haz click en una fila para ver el cálculo del precio medio</p>
              </div>
            </section>

            {/* ── PAGE 6: MATRIZ ECONÓMICA INTEGRAL ── */}
            <section id="scene-6" className={`report-page flex flex-col justify-start px-10 ${isExportMode ? 'pt-10' : 'pt-20'}`}>
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
                  onPreviewBill={onPreviewBill}
                />
                <p className="text-center text-[10px] text-slate-600 uppercase tracking-widest">Haz click en un mes para ver el desglose de la factura</p>
              </div>
            </section>

            {/* ── PAGE 7: LISTO PARA OPTIMIZAR ── */}
            <section id="scene-7" className={`report-page relative flex flex-col items-center justify-center overflow-hidden ${isExportMode ? 'p-6 min-h-[400px]' : 'p-12 min-h-screen'}`}>
              <GlowOrb className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 parallax-bg" size="xl" />
              
              <div className={`max-w-3xl w-full flex flex-col items-center text-center relative z-10 ${isExportMode ? 'space-y-8' : 'space-y-12'}`}>
                {/* Voltis Logo */}
                <div className="flex flex-col items-center gap-6">
                  <div className="relative mb-4 scale-110">
                    <MascotaHero isHovered={true} />
                  </div>
                  <h3 className="text-7xl md:text-[100px] font-black uppercase tracking-tighter leading-[0.7] text-glow-pulse">LISTO PARA OPTIMIZAR</h3>
                  <p className="text-xl text-slate-400 font-medium opacity-50">Auditoría de Precisión Finalizada</p>
                </div>

                {/* GENERAR PDF Button - Centered, Premium */}
                <button 
                  onClick={() => {
                    if (!projectId) {
                      toast.error('Selecciona un proyecto para exportar');
                      return;
                    }
                    const url = `/api/export?projectId=${encodeURIComponent(projectId)}`;
                    window.open(url, '_blank');
                    toast.success('PDF descargándose...', { duration: 4000 });
                  }}
                  className="no-print flex items-center gap-3 px-10 py-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wider shadow-2xl shadow-blue-500/30 transition-all min-w-[300px] justify-center"
                >
                  <Cpu className="w-5 h-5" /> GENERAR PDF
                </button>

                {/* Minimal Email Form - Apple Glass Style */}
                <form 
                  onSubmit={handleSendEmail} 
                  className="flex items-center gap-2 mt-8 no-print p-0 bg-transparent border-none w-full max-w-sm justify-center"
                >
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="h-10 px-4 bg-white/5 border border-white/10 rounded-full text-[#f5f5f7] text-xs placeholder:text-white/40 backdrop-blur-md focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-all w-64"
                  />
                  <button
                    type="submit"
                    disabled={isSending || isSent}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isSent ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                      'bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:scale-105 active:scale-95'
                    } disabled:opacity-50`}
                    title="Enviar informe por correo"
                  >
                    {isSent ? <CheckCircle2 className="w-4 h-4" /> : 
                     isSending ? <Loader className="w-4 h-4 animate-spin" /> : 
                     <Send className="w-4 h-4" />}
                  </button>
                </form>
              </div>
            </section>
          </>
        )}
      </div>

      <style jsx global>{`
        .report-preview { width: 100%; position: relative; }
        .preview-mode {
          background: #0a0f1e !important;
          padding: 80px 0 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 60px !important;
          height: auto !important;
          min-height: 100vh;
          overflow-y: visible !important;
        }
        .preview-mode .report-page {
          width: 210mm !important;
          height: 297mm !important;
          min-height: 297mm !important;
          max-height: 297mm !important;
          background: #020617 !important;
          box-shadow: 0 40px 100px -20px rgba(0,0,0,0.8), 0 0 30px rgba(59,130,246,0.1) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          margin-bottom: 0 !important;
          position: relative !important;
          display: block !important;
          overflow: visible !important;
          transform: none !important;
          opacity: 1 !important;
          flex-shrink: 0 !important;
        }
        .preview-mode [data-recharts-surface] {
          filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3));
        }
        section { opacity: 1; }
        .glass { 
          background: rgba(15, 23, 42, 0.55) !important; 
          backdrop-filter: blur(48px) !important; 
          border: 1.5px solid rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.7), inset 0 0 20px rgba(255, 255, 255, 0.03) !important;
        }
        
        /* Apple Glass Design System - Component Level */
        .glass-btn {
          background-color: rgba(255, 255, 255, 0.08) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          border: 1px solid rgba(255, 255, 255, 0.10) !important;
          border-radius: 16px !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37) !important;
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
        }
        
        .glass-btn:hover {
          background-color: rgba(255, 255, 255, 0.10) !important;
          border-color: rgba(255, 255, 255, 0.18) !important;
        }
        
        /* iOS Segmented Control */
        .segment-control {
          display: inline-flex !important;
          background-color: rgba(0, 0, 0, 0.3) !important;
          border-radius: 9999px !important;
          padding: 4px !important;
          border: 1px solid rgba(255, 255, 255, 0.10) !important;
          gap: 4px !important;
        }
        
        .segment-btn {
          padding: 8px 16px !important;
          border-radius: 9999px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          color: rgba(255, 255, 255, 0.5) !important;
          background: transparent !important;
          border: none !important;
          cursor: pointer !important;
          transition: all 0.25s ease !important;
        }
        
        .segment-btn:hover {
          color: #f5f5f7 !important;
        }
        
        .segment-btn.active {
          background-color: #3b82f6 !important;
          color: white !important;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4) !important;
        }
        
        /* Circular Back Button */
        .back-btn {
          width: 44px !important;
          height: 44px !important;
          border-radius: 50% !important;
          background-color: rgba(255, 255, 255, 0.08) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          border: 1px solid rgba(255, 255, 255, 0.10) !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
          color: rgba(255, 255, 255, 0.5) !important;
        }
        
        .back-btn:hover {
          background-color: rgba(255, 255, 255, 0.10) !important;
          border-color: rgba(255, 255, 255, 0.18) !important;
          color: #f5f5f7 !important;
          transform: scale(1.05) !important;
        }
        
        .text-glow-pulse {
          animation: glowPulse 3s ease-in-out infinite;
        }
        @keyframes glowPulse {
          0%, 100% { text-shadow: 0 0 30px rgba(6, 182, 212, 0.5), 0 0 60px rgba(6, 182, 212, 0.3); }
          50% { text-shadow: 0 0 50px rgba(6, 182, 212, 0.8), 0 0 100px rgba(6, 182, 212, 0.5); }
        }
        .logo-glow {
          filter: drop-shadow(0 0 30px rgba(59, 130, 246, 0.6)) drop-shadow(0 0 60px rgba(59, 130, 246, 0.3)) !important;
          mix-blend-mode: screen !important;
        }
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
          .no-print, .glow-orb { display: none !important; }
          .report-container { background: #020617 !important; color: white !important; overflow: visible !important; }
          .report-page {
            width: 210mm !important;
            min-height: 297mm !important;
            height: auto !important;
            padding: 15mm !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: visible !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            opacity: 1 !important;
            transform: none !important;
            box-sizing: border-box !important;
            background: #020617 !important;
          }
          .report-page-group { 
            width: 210mm !important;
            min-height: 297mm !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: visible !important;
          }
          .report-page-group .report-page {
            min-height: auto !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            padding-bottom: 20px !important;
          }
          #scene-1, #scene-2, #scene-4, #scene-5, #scene-6, #scene-7 {
            page-break-before: always !important;
            break-before: page !important;
          }
          .report-page:last-child, .report-page-group:last-child { page-break-after: auto !important; break-after: auto !important; }
          /* Reset any GSAP transforms for print */
          .report-page, .report-page * { 
            animation: none !important;
            transition: none !important;
          }
          /* Force ALL essential content visible and remove transforms */
          .kpi-card, .glass, table, th, td, h1, h2, h3, h4, p, span, .report-page, div, svg {
            opacity: 1 !important;
            transform: none !important;
            overflow: visible !important;
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
          .recharts-wrapper { 
            width: 750px !important; 
            height: 330px !important; 
            min-height: 330px !important;
          }
          .recharts-surface { 
            width: 750px !important; 
            height: 330px !important; 
          }
          /* Force SVG to be visible and have correct size */
          .recharts-wrapper svg {
            width: 750px !important;
            height: 330px !important;
            overflow: visible !important;
          }
          /* Bar and Pie chart specific sizing */
          .recharts-bar-chart svg,
          .recharts-pie-chart svg {
            width: 100% !important;
            height: 330px !important;
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
                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">Desglose · Matriz Económica Integral</p>
                  {(() => {
                    const bill = filteredValidBills.find(b => b.id === selectedBillId);
                    const month = getMonthYear(bill?.fechaFin);
                    const isRevealed = revealedIds.has(selectedBillId!);
                    const isCopied = copiedId === selectedBillId;

                    return (
                      <div className="flex flex-col gap-1">
                        <button 
                          onClick={() => toggleReveal(selectedBillId!)}
                          className="text-3xl font-black uppercase italic hover:text-blue-400 transition-colors text-left"
                        >
                          {month}
                        </button>
                        
                        <AnimatePresence>
                          {isRevealed && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="flex items-center gap-2 py-1">
                                <span className="text-[10px] text-slate-500 font-bold tracking-wider truncate max-w-[200px]">
                                  {bill?.fileName}
                                </span>
                                <button 
                                  onClick={() => copyToClipboard(bill?.fileName || '', selectedBillId!)}
                                  className="p-1 hover:bg-white/10 rounded-md transition-all text-slate-500 hover:text-white"
                                >
                                  {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                </button>
                                {isCopied && <span className="text-[8px] text-emerald-500 font-black uppercase">Copiado</span>}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })()}
                </div>
                <button onClick={() => setSelectedBillId(null)} className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center hover:bg-white/10 shrink-0">
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
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500 mb-1">Cálculo · Precio Medio por Periodo</p>
                    {(() => {
                      const month = getMonthYear(bill.fechaFin);
                      const isRevealed = revealedIds.has(selectedPriceBillId!);
                      const isCopied = copiedId === selectedPriceBillId;

                      return (
                        <div className="flex flex-col gap-1">
                          <button 
                            onClick={() => toggleReveal(selectedPriceBillId!)}
                            className="text-2xl font-black uppercase italic hover:text-cyan-400 transition-colors text-left"
                          >
                            {month}
                          </button>
                          
                          <AnimatePresence>
                            {isRevealed && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="flex items-center gap-2 py-1">
                                  <span className="text-[10px] text-slate-500 font-bold tracking-wider truncate max-w-[180px]">
                                    {bill.fileName}
                                  </span>
                                  <button 
                                    onClick={() => copyToClipboard(bill.fileName, selectedPriceBillId!)}
                                    className="p-1 hover:bg-white/10 rounded-md transition-all text-slate-500 hover:text-white"
                                  >
                                    {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                  {isCopied && <span className="text-[8px] text-emerald-500 font-black uppercase">Copiado</span>}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })()}
                  </div>
                  <button onClick={() => setSelectedPriceBillId(null)} className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center hover:bg-white/10 shrink-0">
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
function MatrixTable({ title, color, tableData, dataKey, unit, decimals, isTop3, onRowClick, onPreviewBill, isPriceMatrix }: {
  title: string; color: string; tableData: any[]; dataKey: string; unit: string;
  decimals: number; isTop3: (v: number, arr: number[]) => boolean; onRowClick: (id: string) => void; onPreviewBill?: (id: string) => void; isPriceMatrix?: boolean;
}) {
  const top3Indices = new Set(
    [...tableData]
      .map((d: any, i: number) => ({ val: d[dataKey], i }))
      .sort((a: any, b: any) => b.val - a.val)
      .slice(0, 3)
      .map((x: any) => x.i)
  );

  return (
    <div className="space-y-4 w-full">
      <h4 className={`text-[11px] font-black uppercase tracking-[0.6em] ${color} flex items-center justify-between px-4`}>
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4" /> {title}
        </div>
        <span className="text-[8px] opacity-30 lowercase tracking-normal font-medium no-print">Click para detalles • Preview disponible</span>
      </h4>
      <div className="glass p-2 rounded-[40px] border border-white/5 overflow-visible bg-slate-900/10">
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
                      onClick={(e) => { e.stopPropagation(); onPreviewBill?.(row.id); }}
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

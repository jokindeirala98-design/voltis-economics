"use client";

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill, getExcessAmountFromBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, TrendingUp, DollarSign, CheckCircle2, ShieldCheck, Cpu, AlertTriangle, Send, Mail, X, FileText, Eye, Layout, Loader, Copy, Check, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';
import { getAssignedMonth, parseSpanishDate, getMonthlyAggregatedData, CANONICAL_MONTHS } from '@/lib/date-utils';
import { HeroTitle } from './HeroTitle';

gsap.registerPlugin(ScrollTrigger);

interface ExcessRow {
  id: string;
  name: string;
  fechaFin?: string;
  excessAmount: number;
  hasExcess: boolean;
}

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
  const [showAvgPriceModal, setShowAvgPriceModal] = useState(false); // For average price breakdown modal
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set([0,1,2,3,4,5,6,7,8,9,10,11])); // All months selected by default
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const MONTH_LABELS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  
  const isAnnual = selectedMonths.size === 12;
  
  const toggleMonth = (monthIdx: number) => {
    setSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthIdx)) {
        next.delete(monthIdx);
      } else {
        next.add(monthIdx);
      }
      return next;
    });
  };
  
  const selectAllMonths = () => {
    setSelectedMonths(new Set([0,1,2,3,4,5,6,7,8,9,10,11]));
  };

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
  }, []);

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

  const { chartData, pieData, summaryStats, tableData, periodData, averagePriceStats, excessData, totalExcessAmount, hasExcesses } = useMemo(() => {
    const periods = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
    const billsForSelectedMonths = filteredValidBills.filter(b => {
      const { month: monthIdx } = getAssignedMonth(b.fechaInicio, b.fechaFin);
      return selectedMonths.has(monthIdx);
    });

    // CANONICAL 12-MONTH CHART DATA
    // Always returns exactly 12 entries, one per month
    const cData = getMonthlyAggregatedData(billsForSelectedMonths, customOCs);

    // Calculate totals from chart data
    const totals = {
      energetic: cData.reduce((sum, m) => sum + m.energia, 0),
      power: cData.reduce((sum, m) => sum + m.potencia, 0),
      taxes: cData.reduce((sum, m) => sum + m.otros * 0.2, 0), // Approximate
      others: cData.reduce((sum, m) => sum + m.otros * 0.8, 0), // Approximate
      global: cData.reduce((sum, m) => sum + m.totalFactura, 0),
      kwh: cData.reduce((sum, m) => sum + m.totalKwh, 0)
    };

    // Calculate period € spend and averages
    const periodTotals = periods.map(period => {
      let totalEur = 0;
      let totalKwh = 0;
      billsForSelectedMonths.forEach(b => {
        const consumoItem = b.consumo?.find(c => c.periodo === period);
        if (consumoItem) {
          totalKwh += consumoItem.kwh || 0;
          // Check if explicit cost exists, otherwise estimate
          if (consumoItem.total !== undefined && consumoItem.total > 0) {
            totalEur += consumoItem.total;
          } else if (consumoItem.precioKwh !== undefined && consumoItem.precioKwh > 0 && consumoItem.kwh > 0) {
            // Use explicit price * kWh
            totalEur += consumoItem.kwh * consumoItem.precioKwh;
          }
        }
      });
      return { period, totalEur, totalKwh };
    });

    // Calculate period averages (€/kWh)
    const periodAverages = periodTotals.map(p => ({
      period: p.period,
      avgPrice: p.totalKwh > 0 ? p.totalEur / p.totalKwh : 0,
      totalEur: p.totalEur,
      totalKwh: p.totalKwh
    }));

    // NEW Global average price = weighted average (Total Net Energy / Total kWh)
    const newPrecioPromedio = totals.kwh > 0 ? totals.energetic / totals.kwh : 0;

    // Keep the tableData as individual bills for the detailed matrix
    const tData = billsForSelectedMonths.map(b => {
      const energia = b.costeTotalConsumo || 0;
      const energiaBruta = b.costeBrutoConsumo || b.costeTotalConsumo || 0;
      const descuentoEnergia = b.descuentoEnergia || 0;
      const potencia = b.costeTotalPotencia || 0;
      let imp = 0, others = 0;
      [...(b.otrosConceptos || []), ...(customOCs[b.id] || [])].forEach(oc => {
        if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) imp += oc.total;
        else others += oc.total;
      });
      const totalF = energia + potencia + imp + others;
      const totalKwh = b.consumoTotalKwh || 0;
      const avgPrice = b.costeMedioKwhNeto || (totalKwh > 0 ? energia / totalKwh : 0);

      // Calculate € spend per period for each bill using DISCOUNT-AWARE logic
      // Calculate discount factor: if descuentoEnergia > 0, apply it proportionally
      const discountFactor = (energiaBruta > 0 && descuentoEnergia > 0) 
        ? energia / energiaBruta  // Net / Gross ratio = discount factor applied
        : 1;
      const avgEnergyPrice = totalKwh > 0 ? energia / totalKwh : 0; // Already net price
      const periodSpend = periods.map(period => {
        const consumoItem = b.consumo?.find(c => c.periodo === period);
        const kwh = consumoItem?.kwh || 0;
        let eur = 0;
        let isEstimated = false;
        if (consumoItem) {
          if (consumoItem.total !== undefined && consumoItem.total > 0) {
            // If total is provided, check if it's gross or net
            // If we have a discount, scale the period total proportionally
            if (descuentoEnergia > 0 && energiaBruta > 0) {
              // Scale gross period total to net
              eur = consumoItem.total * discountFactor;
            } else {
              eur = consumoItem.total;
            }
          } else if (consumoItem.precioKwh !== undefined && consumoItem.precioKwh > 0 && kwh > 0) {
            // Apply discount to the price if discount exists
            eur = kwh * consumoItem.precioKwh * discountFactor;
          } else if (kwh > 0 && avgEnergyPrice > 0) {
            // Fallback: estimate using average NET energy price (discount already included)
            eur = kwh * avgEnergyPrice;
            isEstimated = true;
          }
        }
        return { eur, isEstimated, kwh };
      });

      return {
        name: getMonthYear(b.fechaFin),
        period: `${b.fechaInicio?.split('-').reverse().slice(0,2).join('/')}-${b.fechaFin?.split('-').reverse().slice(0,2).join('/')}`,
        P1: b.consumo?.find(c => c.periodo === 'P1')?.kwh || 0,
        P2: b.consumo?.find(c => c.periodo === 'P2')?.kwh || 0,
        P3: b.consumo?.find(c => c.periodo === 'P3')?.kwh || 0,
        P4: b.consumo?.find(c => c.periodo === 'P4')?.kwh || 0,
        P5: b.consumo?.find(c => c.periodo === 'P5')?.kwh || 0,
        P6: b.consumo?.find(c => c.periodo === 'P6')?.kwh || 0,
        totalKwh,
        avgPrice,
        totalFactura: totalF,
        energia, 
        energiaBruta,
        descuentoEnergia,
        potencia, 
        otros: imp + others, 
        id: b.id,
        // Net prices per period (with discount applied if any)
        prices: {
          P1: (b.consumo?.find(c => c.periodo === 'P1')?.precioKwh || 0) * discountFactor,
          P2: (b.consumo?.find(c => c.periodo === 'P2')?.precioKwh || 0) * discountFactor,
          P3: (b.consumo?.find(c => c.periodo === 'P3')?.precioKwh || 0) * discountFactor,
          P4: (b.consumo?.find(c => c.periodo === 'P4')?.precioKwh || 0) * discountFactor,
          P5: (b.consumo?.find(c => c.periodo === 'P5')?.precioKwh || 0) * discountFactor,
          P6: (b.consumo?.find(c => c.periodo === 'P6')?.precioKwh || 0) * discountFactor,
          P1_agg: b.consumo?.find(c => c.periodo === 'P1')?.isAggregate,
          P2_agg: b.consumo?.find(c => c.periodo === 'P2')?.isAggregate,
          P3_agg: b.consumo?.find(c => c.periodo === 'P3')?.isAggregate,
          P4_agg: b.consumo?.find(c => c.periodo === 'P4')?.isAggregate,
          P5_agg: b.consumo?.find(c => c.periodo === 'P5')?.isAggregate,
          P6_agg: b.consumo?.find(c => c.periodo === 'P6')?.isAggregate,
        },
        // New: period € spend with estimated flag
        periodSpend: {
          P1: { eur: periodSpend[0].eur, isEstimated: periodSpend[0].isEstimated },
          P2: { eur: periodSpend[1].eur, isEstimated: periodSpend[1].isEstimated },
          P3: { eur: periodSpend[2].eur, isEstimated: periodSpend[2].isEstimated },
          P4: { eur: periodSpend[3].eur, isEstimated: periodSpend[3].isEstimated },
          P5: { eur: periodSpend[4].eur, isEstimated: periodSpend[4].isEstimated },
          P6: { eur: periodSpend[5].eur, isEstimated: periodSpend[5].isEstimated },
          totalEur: periodSpend.reduce((sum, p) => sum + p.eur, 0)
        }
      };
    });

    // Period totals for the economic matrix
    const periodTotalsEur = periods.map((period, idx) => ({
      period,
      totalEur: periodTotals[idx].totalEur,
      totalKwh: periodTotals[idx].totalKwh,
      avgPrice: periodAverages[idx].avgPrice
    }));

    // Extract power excess data from bills using robust detection
    const excessData = billsForSelectedMonths
      .map(b => {
        const { totalExcess, concepts } = getExcessAmountFromBill(b);
        return {
          id: b.id,
          name: getMonthYear(b.fechaFin),
          fechaFin: b.fechaFin,
          excessAmount: totalExcess,
          conceptCount: concepts.length,
          hasExcess: totalExcess > 0
        };
      })
      .filter(b => b.hasExcess);

    const totalExcessAmount = excessData.reduce((sum, b) => sum + b.excessAmount, 0);
    const hasExcesses = totalExcessAmount > 0;

    const pData = [
      { name: 'Consumo Energía', value: totals.energetic, color: '#3b82f6' },
      { name: 'Potencia Contratada', value: totals.power, color: '#8b5cf6' },
      { name: 'Impuestos y Tasas', value: totals.taxes, color: '#10b981' },
      { name: 'Otros Conceptos', value: totals.others, color: '#f59e0b' }
    ].filter(i => i.value > 0);

    return {
      chartData: cData,
      pieData: pData,
      summaryStats: { ...totals, precioPromedio: newPrecioPromedio },
      tableData: tData,
      periodData: periodTotalsEur,
      averagePriceStats: periodAverages,
      excessData,
      totalExcessAmount,
      hasExcesses
    };
  }, [filteredValidBills, customOCs, selectedMonths]);

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
        <div className="fixed top-3 left-3 right-3 md:top-6 md:left-6 md:right-6 flex items-center justify-between z-[100] no-print px-2 md:px-4 report-nav">
          <div className="flex items-center gap-2 md:gap-4">
            {/* Circular Back Button */}
            <button onClick={onBack} className="back-btn" title="Volver">
              <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
          
          {/* Top-right buttons removed to keep focus on the final call-to-action */}

        </div>

      <div ref={contentRef} className={`relative z-10 report-container ${isPreviewMode || isExportMode ? 'preview-mode' : ''}`}>
        {!hasData ? (
          <div className="min-h-screen flex flex-col items-center justify-center p-12 text-center space-y-6">
            <AlertTriangle className="w-16 h-16 text-amber-500 animate-pulse" />
            <h3 className="text-4xl font-black uppercase tracking-tighter">Sin datos{isAnnual ? '' : ` (${selectedMonths.size} mes${selectedMonths.size !== 1 ? 'es' : ''})`}</h3>
            <p className="text-slate-500 max-w-md mx-auto">Sube una factura o cambia el filtro.</p>
          </div>
        ) : (
          <>
            {/* ── PAGE 1: PORTADA ── */}
            <section id="scene-1" className="report-page relative flex flex-col items-center justify-center p-12 overflow-hidden">
              <GlowOrb className="-top-20 -left-20 opacity-30 parallax-bg" size="xl" />
              <GlowOrb className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20 parallax-bg" size="xl" />
              <GlowOrb className="-bottom-20 -right-20 opacity-30 parallax-bg" size="xl" />
              
              <div className="max-w-5xl w-full flex flex-col items-center text-center relative z-10 gap-8">
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
                  {/* Mascot Left */}
                  <img 
                    src="/mascota-transparente.png" 
                    alt="Voltis Mascot" 
                    className="w-32 h-32 md:w-40 md:h-40 object-contain"
                  />
                  
                  {/* Branding Right */}
                  <div className="flex flex-col items-center md:items-start">
                    <h1 className="text-6xl md:text-8xl font-black tracking-tighter italic leading-none text-white drop-shadow-2xl selection:text-blue-500">
                      VOLTIS
                    </h1>
                    <span className="text-[10px] md:text-xs font-bold tracking-[1em] text-slate-500/80 uppercase mt-4 pl-1">
                      ENERGIA
                    </span>
                  </div>
                </div>

                {/* Centered Month Selector - Mobile Optimized */}
                <div className="flex flex-col items-center gap-4 py-6 border-y border-white/5 w-full max-w-2xl">
                   <div className="flex items-center gap-1 flex-wrap justify-center px-2">
                     <button 
                       onClick={selectAllMonths}
                       className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all touch-target ${
                         isAnnual 
                           ? 'bg-white text-black shadow-xl shadow-white/10' 
                           : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300 border border-white/5'
                       }`}
                     >
                       ANUAL
                     </button>
                     <div className="w-px h-4 bg-white/10 mx-1" />
                     <div className="flex flex-wrap justify-center gap-1">
                       {MONTH_LABELS.map((label, idx) => (
                         <button 
                           key={idx}
                           onClick={() => toggleMonth(idx)}
                           className={`w-8 h-8 rounded-lg text-[9px] font-bold transition-all border touch-target ${
                             selectedMonths.has(idx)
                               ? 'bg-blue-600/20 border-blue-500/40 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]' 
                               : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                           }`}
                         >
                           {label}
                         </button>
                       ))}
                     </div>
                   </div>
                 </div>
                
                <div className="hero-content text-center space-y-6 relative z-10" style={{ opacity: 1 }}>
                  <h2 className="text-6xl md:text-7xl font-black tracking-tighter text-white uppercase">{projectName}</h2>
                  
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-white/5 border border-white/10">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">CUPS</span>
                      <span className="text-xs font-black text-white">{projectCups}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 opacity-60">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span className="text-[10px] text-blue-400 font-bold tracking-[0.3em] uppercase">
                        Tarifa {filteredValidBills[0]?.tarifa || '3.0TD'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

              {/* ── PAGE 2: KPIs ── */}
              {/* ── KPIs ── */}
              <section id="scene-2" className="report-page flex flex-col justify-center px-4 md:px-16">
                <div className="w-full max-w-5xl mx-auto">
                  <div className="mb-6 md:mb-12 flex flex-col md:flex-row items-start md:items-end justify-between gap-4 md:gap-0 border-b border-white/5 pb-4 md:pb-8">
                    <div className="space-y-2 md:space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-500">Métricas Auditadas</span>
                      <h3 className="text-3xl md:text-6xl font-black tracking-tighter uppercase">Resultados {isAnnual ? 'Anuales' : 'Personalizados'}</h3>
                    </div>
                    <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest md:mb-2">v5.0 Certified Analysis</div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 report-kpi-grid">
                    {[
                      { label: 'Facturación Global', value: summaryStats.global, unit: '€', icon: DollarSign, color: 'text-blue-500', dec: 2, clickable: false },
                      { label: 'Energía Absoluta', value: summaryStats.kwh, unit: 'kWh', icon: Zap, color: 'text-sky-400', dec: 0, clickable: false },
                      { label: 'Precio Promedio', value: summaryStats.precioPromedio, unit: '€/kWh', icon: TrendingUp, color: 'text-teal-400', dec: 4, clickable: true, onClick: () => setShowAvgPriceModal(true) },
                      { label: 'Docs Procesados', value: filteredValidBills.length, unit: 'IA', icon: CheckCircle2, color: 'text-indigo-400', dec: 0, clickable: false },
                    ].map((kpi, i) => (
                      <div
                        key={i}
                        className={`kpi-card kpi-glass-premium p-4 md:p-8 rounded-2xl md:rounded-[40px] border relative overflow-hidden group ${kpi.clickable ? 'cursor-pointer hover:border-teal-500/40 hover:bg-teal-500/5 transition-all' : ''}`}
                        onClick={kpi.clickable ? kpi.onClick : undefined}
                      >
                        <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-8 bg-white/10 border border-white/10 ${kpi.color} kpi-icon-glow`}>
                          <kpi.icon className="w-5 h-5 md:w-7 md:h-7" />
                        </div>
                        <span className="text-[9px] md:text-[11px] font-black uppercase tracking-widest text-slate-400 block mb-1 md:mb-2">{kpi.label}</span>
                        <div className="flex items-baseline gap-1 md:gap-2">
                          <p className={`text-2xl md:text-4xl font-black tracking-tighter tabular-nums ${kpi.clickable ? 'text-teal-400 group-hover:text-teal-300' : 'text-white'} transition-colors`}>
                            <CountUp value={kpi.value} decimals={kpi.dec} />
                          </p>
                          <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase">{kpi.unit}</span>
                        </div>
                        {kpi.clickable && (
                          <div className="absolute top-2 right-2 md:top-4 md:right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-teal-400" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* ── PAGE 3: EVOLUCIÓN MENSUAL + BIO-ESTRUCTURA ── */}
              <section id="scene-3" className="report-page flex flex-col justify-center px-4 md:px-16 gap-8 md:gap-12">
                <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8 md:gap-12">
                  {/* Chart */}
                  <div className="lg:col-span-3 flex flex-col gap-4 md:gap-6">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.5em] text-blue-500 block">Digital Flow 03</span>
                      <h3 className="text-2xl md:text-4xl font-black tracking-tighter uppercase leading-[0.9]">Evolución Mensual</h3>
                      <p className="text-slate-400 text-xs md:text-sm font-medium mt-2">Esta es tu curva de consumo anual.</p>
                    </div>
                    <div className="flex-1 w-full glass p-3 md:p-6 rounded-2xl md:rounded-[40px] border border-white/5 overflow-visible" style={{ height: 250, minHeight: 250 }}>
                      {!isExportMode ? (
                        <ResponsiveContainer width="100%" height={230}>
                          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.03)" vertical={false} />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: 900 }} dy={8} interval={0} tickFormatter={(val) => val.slice(0, 3)} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 7, fontWeight: 900 }} width={40} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} />
                            <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
                            <Bar dataKey="totalFactura" fill="url(#blueGrad)" radius={[4, 4, 0, 0]} barSize={18} minPointSize={2}>
                              {chartData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fillOpacity={Math.abs(entry.totalFactura) < 0.01 ? 0.15 : 1} />
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
                        <BarChart width={600} height={230} data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="5 5" stroke="rgba(255,255,255,0.03)" vertical={false} />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: 900 }} dy={8} interval={0} tickFormatter={(val) => val.slice(0, 3)} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 7, fontWeight: 900 }} width={40} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} />
                          <Bar dataKey="totalFactura" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={18} isAnimationActive={false}>
                            {chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fillOpacity={1} />
                            ))}
                          </Bar>
                        </BarChart>
                      )}
                    </div>
                  </div>

                  {/* Pie */}
                  <div className="lg:col-span-2 flex flex-col gap-4 md:gap-6">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.8em] text-blue-500">Visual 04</span>
                      <h3 className="text-2xl md:text-4xl font-black tracking-tighter uppercase leading-[0.9]">Bio-Estructura Económica</h3>
                    </div>
                    <div className="w-full glass p-3 md:p-8 rounded-2xl md:rounded-[40px] border border-white/5 flex items-center justify-center relative overflow-visible" style={{ height: 250, minHeight: 250 }}>
                      {!isExportMode ? (
                        <ResponsiveContainer width="100%" height={230}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={6} dataKey="value" stroke="none">
                              {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <PieChart width={250} height={230}>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={6} dataKey="value" stroke="none" isAnimationActive={false}>
                            {pieData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                        </PieChart>
                      )}
                      <div className="absolute flex flex-col items-center pointer-events-none">
                        <span className="text-xl md:text-3xl font-black tracking-tighter">{summaryStats.global.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {pieData.map((item: any, i) => (
                        <div key={i} className="flex items-center justify-between p-3 md:p-4 rounded-xl md:rounded-2xl bg-white/[0.02] border border-white/5">
                          <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-[10px] md:text-xs font-black text-white/70 uppercase truncate max-w-[100px] md:max-w-none">{item.name}</span>
                          </div>
                          <span className="text-xs md:text-sm font-black text-blue-400">{((item.value / summaryStats.global) * 100).toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

            {/* ── PAGE 4: MATRIZ ENERGÉTICA ── */}
            <section id="scene-4" className={`report-page flex flex-col justify-start px-4 md:px-10 ${isExportMode ? 'pt-10' : 'pt-16 md:pt-20'}`}>
              <div className="max-w-6xl w-full mx-auto space-y-6 md:space-y-8 overflow-x-auto">
                <div className="text-center space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[1em] text-blue-500">Engineering Matrix</span>
                  <h3 className="text-3xl md:text-5xl font-black tracking-tighter uppercase">Audit Matrix Pro</h3>
                </div>
                <MatrixTable
                  title="Matriz Energética Mensual (kWh)"
                  color="text-blue-400"
                  tableData={tableData}
                  dataKey="totalKwh"
                  unit="kWh"
                  decimals={0}
                  isTop3={isTop3}
                  onRowClick={() => {}}
                  onPreviewBill={onPreviewBill}
                  showTotals
                />
              </div>
            </section>

            {/* ── PAGE 5: MATRIZ DE COSTE x PERIODO ── */}
            <section id="scene-5" className={`report-page flex flex-col justify-start px-4 md:px-10 ${isExportMode ? 'pt-10' : 'pt-16 md:pt-20'}`}>
              <div className="max-w-6xl w-full mx-auto space-y-6 md:space-y-8 overflow-x-auto">
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

            {/* ── PAGE 6: MATRIZ DE GASTO POR PERIODO (ORIGINAL FORMAT) ── */}
            <section id="scene-6" className={`report-page flex flex-col justify-start px-4 md:px-10 ${isExportMode ? 'pt-10' : 'pt-16 md:pt-20'}`}>
              <div className="max-w-6xl w-full mx-auto space-y-6 md:space-y-8">
                {/* Original economic matrix - spend by period and invoice */}
                <div className="space-y-4 w-full">
                  <h4 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.6em] text-indigo-400 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 px-2 md:px-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <Activity className="w-3 h-3 md:w-4 md:h-4" /> Matriz de Gasto por Periodo (€)
                    </div>
                    <span className="text-[8px] opacity-30 lowercase tracking-normal font-medium no-print">Gasto en euros por periodo y factura</span>
                  </h4>
                  <div className="glass p-2 rounded-2xl md:rounded-[40px] border border-white/5 overflow-visible bg-slate-900/10">
                    <div className="overflow-x-auto mobile-table-scroll scrollable-matrix">
                    <table className="w-full text-left border-collapse text-[9px] md:text-[10px] matrix-table">
                      <thead className="bg-slate-900/30 font-black uppercase tracking-widest text-slate-500">
                        <tr>
                          <th className="px-2 md:px-4 py-3 md:py-5">Mes</th>
                          {(['P1','P2','P3','P4','P5','P6'] as const).map(p => (
                            <th key={p} className="px-1 md:px-2 py-3 md:py-5 text-center">{p}</th>
                          ))}
                          <th className="px-2 md:px-4 py-3 md:py-5 text-right">Total €</th>
                          <th className="px-2 md:px-4 py-3 md:py-5 text-center no-print"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {tableData.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-white/[0.02] transition-all group cursor-pointer" onClick={() => setSelectedBillId(row.id)}>
                            <td className="px-2 md:px-4 py-2 md:py-3 font-black text-white italic uppercase text-[9px] md:text-[11px]">{row.name}</td>
                            {(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const).map(period => {
                              const ps = row.periodSpend?.[period];
                              const value = ps?.eur || 0;
                              const isEstimated = ps?.isEstimated || false;
                              return (
                                <td key={period} className="px-1 md:px-2 py-2 md:py-3 text-center">
                                  {value > 0 ? (
                                    <span className={`font-bold ${isEstimated ? 'text-yellow-400' : 'text-slate-500'}`}>
                                      {value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : '-'}
                                </td>
                              );
                            })}
                            <td className="px-2 md:px-4 py-2 md:py-3 text-right font-black text-indigo-400 text-[11px] md:text-[13px]">
                              {row.periodSpend?.totalEur?.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </td>
                            <td className="px-2 md:px-4 py-2 md:py-3 text-center no-print">
                              <button
                                onClick={(e) => { e.stopPropagation(); onPreviewBill?.(row.id); }}
                                className="p-1.5 md:p-2 rounded-xl bg-white/5 hover:bg-blue-600/20 text-slate-500 hover:text-blue-400 transition-all border border-white/5 touch-target"
                                title="Ver factura original"
                              >
                                <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {tableData && tableData.length > 0 && (
                        <tfoot>
                          <tr className="bg-indigo-500/10 border-t-2 border-indigo-500/40">
                            <td className="px-2 md:px-4 py-2 md:py-3 font-black text-indigo-400 uppercase text-[9px] md:text-[11px]">TOTAL</td>
                            {(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const).map((period, idx) => (
                              <td key={period} className="px-1 md:px-2 py-2 md:py-3 text-center font-black text-indigo-400/80">
                                {periodData[idx]?.totalEur > 0 ? (
                                  <span>{periodData[idx]?.totalEur.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                ) : '-'}
                              </td>
                            ))}
                            <td className="px-2 md:px-4 py-2 md:py-3 text-right font-black text-indigo-400 text-[12px] md:text-[14px]">
                              {periodData.reduce((sum: number, p: any) => sum + (p.totalEur || 0), 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </td>
                            <td className="px-2 md:px-4 py-2 md:py-3 text-center no-print"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    </div>
                  </div>
                  <p className="text-center text-[10px] text-yellow-500/60 uppercase tracking-widest hidden md:block">Los valores en amarillo son estimados (fallback: kWh × precio medio energia)</p>
                </div>

                {/* ── EXCESS TABLE: Only show if there are power excesses ── */}
                {hasExcesses && (
                  <div className="space-y-4 w-full mt-8">
                    <div className="glass p-4 md:p-6 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
                      <h4 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.4em] text-amber-400/80 flex items-center gap-2 mb-3">
                        <Activity className="w-3 h-3" /> Seguimiento de excesos de potencia
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[9px] md:text-[10px]">
                          <thead>
                            <tr className="bg-amber-500/10 font-black uppercase tracking-wider text-amber-400/60">
                              <th className="px-3 md:px-4 py-2 md:py-3">Periodo</th>
                              <th className="px-3 md:px-4 py-2 md:py-3 text-right">Importe Exceso</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.05]">
                            {excessData.map((row: any, idx: number) => (
                              <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-3 md:px-4 py-2 md:py-3 font-bold text-slate-300">{row.name}</td>
                                <td className="px-3 md:px-4 py-2 md:py-3 text-right font-mono text-amber-400/80">{row.excessAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-amber-500/10 border-t border-amber-500/30">
                              <td className="px-3 md:px-4 py-2 md:py-3 font-black text-amber-300">TOTAL EXCESOS</td>
                              <td className="px-3 md:px-4 py-2 md:py-3 text-right font-black text-amber-300">{totalExcessAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <p className="text-center text-[9px] text-amber-400/40 mt-3 italic">
                        La detección de excesos sugiere que podría ser recomendable revisar el ajuste de la potencia contratada.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── PAGE 7: LISTO PARA OPTIMIZAR ── */}
            <section id="scene-7" className={`report-page relative flex flex-col items-center justify-center overflow-hidden ${isExportMode ? 'p-4 md:p-6 min-h-[400px]' : 'p-6 md:p-12 min-h-screen'}`}>
              <GlowOrb className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 parallax-bg" size="xl" />
              
              <div className={`max-w-3xl w-full flex flex-col items-center text-center relative z-10 ${isExportMode ? 'space-y-6 md:space-y-8' : 'space-y-8 md:space-y-12'}`}>
                {/* Voltis Logo */}
                <div className="flex flex-col items-center gap-4 md:gap-6">
                  <h3 className="text-4xl md:text-7xl lg:text-[100px] font-black uppercase tracking-tighter leading-[0.7] text-glow-pulse">LISTO PARA OPTIMIZAR</h3>
                  <p className="text-base md:text-xl text-slate-400 font-medium opacity-50">Auditoría de Precisión Finalizada</p>
                </div>

                {/* GENERAR PDF Button - Centered, Premium */}
                <button 
                  onClick={async () => {
                    if (!projectId) {
                      toast.error('Selecciona un proyecto para exportar');
                      return;
                    }
                    if (!bills || bills.length === 0) {
                      toast.error('No hay facturas para exportar');
                      return;
                    }
                    
                    toast.info('Generando PDF...', { duration: 2000 });
                    
                    try {
                      const response = await fetch('/api/export-pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          projectId,
                          projectName: projectName || 'PROYECTO',
                          bills,
                          customOCs: customOCs || {},
                          format: 'pdf'
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
                      a.download = `Voltis_Report_${projectId}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      
                      toast.success('PDF descargado', { duration: 3000 });
                    } catch (err: any) {
                      console.error('PDF export error:', err);
                      toast.error(err.message || 'Error al generar PDF');
                    }
                  }}
                  className="no-print flex items-center gap-2 md:gap-3 px-6 md:px-10 py-3 md:py-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-black text-xs md:text-sm uppercase tracking-wider shadow-2xl shadow-blue-500/30 transition-all min-w-[240px] md:min-w-[300px] justify-center touch-target"
                >
                  <Cpu className="w-4 h-4 md:w-5 md:h-5" /> GENERAR PDF
                </button>

                {/* Minimal Email Form - Apple Glass Style */}
                <form 
                  onSubmit={handleSendEmail} 
                  className="flex flex-col sm:flex-row items-center gap-2 mt-4 md:mt-8 no-print p-0 bg-transparent border-none w-full max-w-sm justify-center"
                >
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="h-10 px-4 bg-white/5 border border-white/10 rounded-full text-[#f5f5f7] text-xs placeholder:text-white/40 backdrop-blur-md focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-all w-full sm:w-64"
                  />
                  <button
                    type="submit"
                    disabled={isSending || isSent}
                    className={`w-full sm:w-auto h-10 rounded-full flex items-center justify-center transition-all ${
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

      {/* MODAL: Average Price Breakdown */}
      <AnimatePresence>
        {showAvgPriceModal && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl no-print" onClick={() => setShowAvgPriceModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card border border-white/10 rounded-[48px] w-full max-w-lg p-10 relative z-[510]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-teal-500 mb-1">Precio Promedio</p>
                  <h3 className="text-2xl font-black uppercase italic">Media por Periodo</h3>
                  {selectedMonths.size > 0 && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      {selectedMonths.size === 12 ? 'Últimos 12 meses' : `${selectedMonths.size} meses seleccionados`}
                    </p>
                  )}
                </div>
                <button onClick={() => setShowAvgPriceModal(false)} className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center hover:bg-white/10 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {averagePriceStats?.map(stat => (
                  <div key={stat.period} className="flex items-center justify-between py-3 px-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-teal-400 w-8">{stat.period}</span>
                      <span className="text-xs text-slate-500">
                        {stat.totalKwh > 0 ? `${stat.totalKwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kWh` : 'Sin consumo'}
                      </span>
                    </div>
                    <div className="text-right">
                      {stat.totalKwh > 0 ? (
                        <span className="text-lg font-black text-white">{stat.avgPrice.toFixed(4)} €/kWh</span>
                      ) : (
                        <span className="text-sm text-slate-600">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Precio Promedio Total</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">Media de periodo{`(P${averagePriceStats?.filter(p => p.totalKwh > 0).length})`}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-teal-400">{summaryStats.precioPromedio.toFixed(4)} €/kWh</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Reusable Matrix Table Component ──
function MatrixTable({ title, color, tableData, dataKey, unit, decimals, isTop3, onRowClick, onPreviewBill, isPriceMatrix, showTotals }: {
  title: string; color: string; tableData: any[]; dataKey: string; unit: string;
  decimals: number; isTop3: (v: number, arr: number[]) => boolean; onRowClick: (id: string) => void; onPreviewBill?: (id: string) => void; isPriceMatrix?: boolean; showTotals?: boolean;
}) {
  const top3Indices = new Set(
    [...tableData]
      .map((d: any, i: number) => ({ val: d[dataKey], i }))
      .sort((a: any, b: any) => b.val - a.val)
      .slice(0, 3)
      .map((x: any) => x.i)
  );

  // Calculate totals for the energy matrix (kWh) table
  type TotalsType = { P1: number; P2: number; P3: number; P4: number; P5: number; P6: number; totalKwh: number };
  const totals: TotalsType | null = showTotals && tableData.length > 0 ? {
    P1: tableData.reduce((sum, row) => sum + (Number(row.P1) || 0), 0),
    P2: tableData.reduce((sum, row) => sum + (Number(row.P2) || 0), 0),
    P3: tableData.reduce((sum, row) => sum + (Number(row.P3) || 0), 0),
    P4: tableData.reduce((sum, row) => sum + (Number(row.P4) || 0), 0),
    P5: tableData.reduce((sum, row) => sum + (Number(row.P5) || 0), 0),
    P6: tableData.reduce((sum, row) => sum + (Number(row.P6) || 0), 0),
    totalKwh: tableData.reduce((sum, row) => sum + (Number(row.totalKwh) || 0), 0),
  } : null;

  return (
    <div className="space-y-3 md:space-y-4 w-full">
      <h4 className={`text-[10px] md:text-[11px] font-black uppercase tracking-[0.6em] ${color} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 px-2 sm:px-4`}>
        <div className="flex items-center gap-2 md:gap-3">
          <Activity className="w-3 h-3 md:w-4 md:h-4" /> {title}
        </div>
        <span className="text-[8px] opacity-30 lowercase tracking-normal font-medium no-print">Click para detalles</span>
      </h4>
      <div className="glass p-2 rounded-xl md:rounded-[40px] border border-white/5 overflow-visible bg-slate-900/10">
        <div className="overflow-x-auto mobile-table-scroll scrollable-matrix">
          <table className="w-full text-left border-collapse text-[9px] md:text-[10px]">
            <thead className="bg-slate-900/30 font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-3 md:px-6 py-3 md:py-5">Mes</th>
                {['P1','P2','P3','P4','P5','P6'].map(p => <th key={p} className="px-1 md:px-3 py-3 md:py-5 text-center">{p}</th>)}
                <th className="px-3 md:px-6 py-3 md:py-5 text-right">Total</th>
                <th className="px-2 md:px-4 py-3 md:py-5 text-center no-print"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {tableData.map((row, idx) => {
                const val = row[dataKey];
                const isTopRow = top3Indices.has(idx) && val > 0;
                return (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-all group cursor-pointer" onClick={() => onRowClick(row.id)}>
                    <td className="px-3 md:px-6 py-2 md:py-4 font-black text-white italic uppercase text-[9px] md:text-[11px]">{row.name}</td>
                    {[1,2,3,4,5,6].map(p => {
                      const price = isPriceMatrix ? row.prices[`P${p}`] : row[`P${p}`];
                      const isAgg = isPriceMatrix && row.prices[`P${p}_agg`];
                      return (
                        <td key={p} className="px-1 md:px-3 py-2 md:py-4 text-center text-slate-500 font-bold group-hover:text-slate-300 text-[8px] md:text-[9px]">
                          {isPriceMatrix ? price.toFixed(4) : Number(price).toLocaleString('es-ES', { maximumFractionDigits: 1 })}
                          {isAgg && <span className="block text-[7px] text-blue-400 mt-0.5 opacity-60">ATR+C</span>}
                        </td>
                      );
                    })}
                    <td className={`px-3 md:px-6 py-2 md:py-4 text-right font-black text-[11px] md:text-[13px] transition-all ${isTopRow ? 'text-red-500' : color}`}>
                      {val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}
                    </td>
                    <td className="px-2 md:px-4 py-2 md:py-4 text-center no-print">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onPreviewBill?.(row.id); }}
                        className="p-1.5 md:p-2 rounded-xl bg-white/5 hover:bg-blue-600/20 text-slate-500 hover:text-blue-400 transition-all border border-white/5 touch-target"
                        title="Ver factura original"
                      >
                        <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {showTotals && totals && (
              <tfoot>
                <tr className="bg-blue-500/10 border-t-2 border-blue-500/40">
                  <td className="px-3 md:px-6 py-2 md:py-4 font-black text-blue-400 uppercase text-[9px] md:text-[11px]">TOTAL</td>
                  {(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const).map(key => (
                    <td key={key} className="px-1 md:px-3 py-2 md:py-4 text-center font-black text-blue-400 text-[9px] md:text-[10px]">
                      {totals[key].toLocaleString('es-ES', { maximumFractionDigits: 1 })}
                    </td>
                  ))}
                  <td className="px-3 md:px-6 py-2 md:py-4 text-right font-black text-blue-400 text-[11px] md:text-[14px]">
                    {totals.totalKwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {unit}
                  </td>
                  <td className="px-2 md:px-4 py-2 md:py-4 text-center no-print"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

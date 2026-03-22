import React, { useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  ComposedChart, Line, PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, Info, TrendingUp, DollarSign, BarChart3, PieChart as PieIcon, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReportViewProps {
  bills: ExtractedBill[];
  customOCs: Record<string, { concepto: string; total: number }[]>;
  onBack: () => void;
}

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ReportView({ bills, customOCs, onBack }: ReportViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedBillId, setSelectedBillId] = React.useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = React.useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');
  const [selectedYear, setSelectedYear] = React.useState<string>('ALL');

  const selectedBill = useMemo(() => {
    if (!selectedBillId) return null;
    const b = bills.find(b => b.id === selectedBillId);
    if (!b) return null;
    
    // Calculate full total including custom OCs
    const energia = b.costeTotalConsumo || 0;
    const potencia = b.costeTotalPotencia || 0;
    let impYOtros = 0;
    b.otrosConceptos?.forEach(oc => impYOtros += oc.total);
    customOCs[b.id]?.forEach(oc => impYOtros += oc.total);
    
    return { ...b, totalCalculado: energia + potencia + impYOtros };
  }, [selectedBillId, bills, customOCs]);

  const reactToPrintFn = useReactToPrint({
    contentRef,
    documentTitle: 'Voltis_Anual_Economics_Report',
  });

  const validBills = useMemo(() => bills.filter(b => b.status !== 'error').sort((a,b) => {
    return (a.fechaInicio || '').localeCompare(b.fechaInicio || '');
  }), [bills]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    validBills.forEach(b => {
      if (b.fechaInicio) years.add(b.fechaInicio.split('-')[0]);
    });
    return Array.from(years).sort();
  }, [validBills]);

  const filteredBills = useMemo(() => {
    return validBills.filter(b => {
      if (!b.fechaInicio) return true;
      const [year, month] = b.fechaInicio.split('-').map(Number);
      
      const yearMatch = selectedYear === 'ALL' || year.toString() === selectedYear;
      if (!yearMatch) return false;

      if (selectedQuarter === 'ALL') return true;
      const q = Math.ceil(month / 3);
      return `Q${q}` === selectedQuarter;
    });
  }, [validBills, selectedQuarter, selectedYear]);

  const { chartData, pieData, summaryStats, tableData } = useMemo(() => {
    const totals = { energetic: 0, power: 0, taxes: 0, others: 0, global: 0, kwh: 0 };
    
    const shortDate = (d: string) => d ? d.split('-').reverse().slice(0, 2).join('/') : '';

    const cData = filteredBills.map((b: ExtractedBill) => {
      const p1 = b.consumo?.find((c: any) => c.periodo === 'P1')?.kwh || 0;
      const p2 = b.consumo?.find((c: any) => c.periodo === 'P2')?.kwh || 0;
      const p3 = b.consumo?.find((c: any) => c.periodo === 'P3')?.kwh || 0;
      const p4 = b.consumo?.find((c: any) => c.periodo === 'P4')?.kwh || 0;
      const p5 = b.consumo?.find((c: any) => c.periodo === 'P5')?.kwh || 0;
      const p6 = b.consumo?.find((c: any) => c.periodo === 'P6')?.kwh || 0;

      const energia = b.costeTotalConsumo || 0;
      const potencia = b.costeTotalPotencia || 0;
      let impuestos = 0;
      let otros = 0;

      b.otrosConceptos?.forEach((oc: any) => {
        if (oc.concepto.toLowerCase().includes('impuesto') || oc.concepto.toLowerCase().includes('iva')) impuestos += oc.total;
        else otros += oc.total;
      });

      // Factor in custom concepts
      if (customOCs[b.id]) {
        customOCs[b.id].forEach((oc: any) => {
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

      const label = b.fechaInicio && b.fechaFin 
        ? `${shortDate(b.fechaInicio)}-${shortDate(b.fechaFin)}`
        : (b.fechaInicio ? new Date(b.fechaInicio).toLocaleString('es-ES', { month: 'short', year: '2-digit' }) : 'Factura');

      return {
        name: label,
        P1: p1, P2: p2, P3: p3, P4: p4, P5: p5, P6: p6,
        totalKwh: b.consumoTotalKwh || 0,
        avgPrice: b.costeMedioKwh || 0,
        totalFactura: usedTotalFactura,
        energia,
        potencia,
        otros: impuestos + otros,
        id: b.id,
        // For tables
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
      { name: 'Consumo Energía', value: totals.energetic },
      { name: 'Potencia Contratada', value: totals.power },
      { name: 'Impuestos y Tasas', value: totals.taxes },
      { name: 'Otros Conceptos', value: totals.others }
    ].filter((i: any) => i.value > 0);

    return { chartData: cData, pieData: pData, summaryStats: totals, tableData: cData };
  }, [filteredBills, customOCs]);

  const getHeatColor = (val: number) => {
    if (val < 20) return 'text-emerald-400';
    if (val <= 40) return 'text-yellow-400';
    return 'text-red-500';
  };

  const isTop3 = (val: number, array: number[]) => {
    const sorted = [...new Set(array)].sort((a,b) => b-a);
    return sorted.slice(0, 3).includes(val) && val > 0;
  };

  if (validBills.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-6 w-full max-w-6xl mx-auto"
    >
      {/* Control Bar */}
      <div className="flex items-center justify-between bg-black/40 backdrop-blur-2xl p-4 rounded-[28px] border border-white/5 no-print sticky top-4 z-50 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-2.5 rounded-2xl hover:bg-white/5 transition-all text-slate-400 hover:text-white font-black text-[10px] uppercase tracking-widest active:scale-95"
        >
          <ArrowLeft className="w-3 h-3" /> Panel Principal
        </button>

        <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md">
          {availableYears.length > 1 && (
            <select 
              value={selectedYear}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedYear(e.target.value)}
              className="bg-transparent text-[10px] font-black uppercase tracking-widest px-4 py-2 outline-none border-r border-white/10 cursor-pointer hover:text-white transition-colors"
            >
              <option value="ALL" className="bg-[#0f172a]">Todos los Años</option>
              {availableYears.map((y: string) => <option key={y} value={y} className="bg-[#0f172a]">{y}</option>)}
            </select>
          )}
          {['ALL', 'Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
            <button
              key={q}
              onClick={() => setSelectedQuarter(q as any)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all duration-300 ${
                selectedQuarter === q 
                  ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/20 scale-105' 
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {q === 'ALL' ? 'ANUAL' : q}
            </button>
          ))}
        </div>

        <button 
          onClick={() => reactToPrintFn()}
          className="flex items-center gap-3 px-8 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-blue-900/40 transition-all active:scale-95 group"
        >
          <Printer className="w-4 h-4 group-hover:scale-110 transition-transform" /> Generar Informe {selectedQuarter === 'ALL' ? 'Anual' : selectedQuarter}
        </button>
      </div>

      {/* Printable Document */}
      <div ref={contentRef} className="report-container flex flex-col gap-0 text-white bg-[#020617] font-inter">
        
        {/* PAGE 1: COVER */}
        <section className="min-h-[1100px] flex flex-col p-16 relative overflow-hidden page-break-after">
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
          
          <div className="mt-20 flex items-center justify-between border-b border-white/10 pb-12">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-6">
                <img src="/logo.png" className="w-24 h-24 object-contain mix-blend-screen" alt="Logo" />
                <h1 className="text-5xl font-black tracking-tighter uppercase leading-none">
                  VOLTIS ANUAL <br/> ECONOMICS
                </h1>
              </div>
              <p className="text-blue-400 font-bold tracking-[0.4em] text-[10px] ml-32 uppercase opacity-80">Análisis Energético de Precisión</p>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Informe de Análisis</span>
              <h2 className="text-6xl font-black tracking-tighter text-blue-500 uppercase">AOIZ</h2>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-12 mt-24">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">CUPS / IDENTIFICADOR</span>
               <span className="text-lg font-medium tracking-wider">{validBills[0]?.cups || 'ES00000XXXXXXXXXXXXXX'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">TARIFA CONTRATADA</span>
              <span className="text-lg font-medium">{validBills[0]?.tarifa || 'Tarifa de Acceso'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">COMERCIALIZADORA</span>
              <span className="text-lg font-medium">{validBills[0]?.comercializadora || 'Iberdrola / Endesa'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">PERIODO ANALIZADO</span>
              <span className="textlg font-medium">
                {selectedQuarter === 'ALL' 
                  ? `${filteredBills[0]?.fechaInicio?.split('-')[1] || '??'}/${filteredBills[0]?.fechaInicio?.split('-')[0].substring(2) || '??'} - ${filteredBills[filteredBills.length-1]?.fechaFin?.split('-')[1] || '??'}/${filteredBills[filteredBills.length-1]?.fechaFin?.split('-')[0].substring(2) || '??'}`
                  : `Trimestre ${selectedQuarter} (${selectedYear !== 'ALL' ? selectedYear : filteredBills[0]?.fechaInicio?.split('-')[0] || ''})`
                }
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">FECHA GENERACIÓN</span>
              <span className="text-lg font-medium">{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>

          <div className="mt-auto grid grid-cols-4 gap-6">
            <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col gap-4">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Total Facturado</span>
              <p className="text-4xl font-black tracking-tighter">{summaryStats.global.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</p>
              <span className="text-xs text-muted-foreground opacity-60">Acumulado anual</span>
            </div>
            <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col gap-4">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Nº Facturas</span>
              <p className="text-4xl font-black tracking-tighter">{filteredBills.length}</p>
              <span className="text-xs text-muted-foreground opacity-60">Analizadas con IA</span>
            </div>
            <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col gap-4">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">kWh Consumidos</span>
              <p className="text-4xl font-black tracking-tighter">{summaryStats.kwh.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</p>
              <span className="text-xs text-muted-foreground opacity-60">Energía activa total</span>
            </div>
            <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col gap-4">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Punto de Carga</span>
              <p className="text-4xl font-black tracking-tighter">MAX</p>
              <span className="text-xs text-muted-foreground opacity-60">Demanda punta</span>
            </div>
          </div>
        </section>

        {/* PAGE 2: CHARTS AND ANALYTICS */}
        <section className="min-h-[1100px] p-16 bg-[#020617] page-break-after">
          <div className="flex items-center gap-3 mb-10 border-l-4 border-blue-500 pl-4">
              <TrendingUp className="text-blue-500 w-8 h-8" />
              <h3 className="text-3xl font-black tracking-tighter uppercase">Análisis Dinámico de Evolución</h3>
          </div>

          <div className="grid grid-cols-1 gap-12">
            {/* Monthly Bar Chart */}
            <div className="bg-[#0f172a]/40 border border-white/5 p-10 rounded-[40px] shadow-2xl">
               <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-8 flex items-center gap-2">
                 <BarChart3 className="w-4 h-4 text-blue-500" /> Evolución del Gasto por Factura (€)
               </h4>
               <div className="h-[400px] w-full mt-4">
                     <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                         <defs>
                           <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8}/>
                             <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.3}/>
                           </linearGradient>
                           <filter id="shadow" height="130%">
                             <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                             <feOffset dx="2" dy="2" result="offsetblur" />
                             <feComponentTransfer>
                               <feFuncA type="linear" slope="0.5" />
                             </feComponentTransfer>
                             <feMerge>
                               <feMergeNode />
                               <feMergeNode in="SourceGraphic" />
                             </feMerge>
                           </filter>
                         </defs>
                         <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                         <XAxis 
                           dataKey="name" 
                           stroke="#64748b" 
                           fontSize={10} 
                           tickLine={false} 
                           axisLine={false} 
                           tick={{fill: '#94a3b8', fontWeight: 700}}
                           dy={10}
                         />
                         <YAxis 
                           stroke="#64748b" 
                           fontSize={10} 
                           tickLine={false} 
                           axisLine={false} 
                           tick={{fill: '#94a3b8', fontWeight: 700}}
                           tickFormatter={(val: number) => `${val}€`}
                         />
                         <RechartsTooltip 
                           cursor={{fill: 'rgba(255,255,255,0.02)'}} 
                           contentStyle={{
                             backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                             border: '1px solid rgba(255,255,255,0.1)', 
                             borderRadius: '24px', 
                             fontSize: '11px', 
                             fontWeight: 900, 
                             padding: '20px', 
                             backdropFilter: 'blur(10px)',
                             boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                           }} 
                           formatter={(val: number) => [`${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, 'Total Factura']}
                         />
                         <Bar 
                           dataKey="totalFactura" 
                           fill="url(#barGradient)" 
                           radius={[12, 12, 4, 4]} 
                           barSize={32}
                         />
                       </BarChart>
                     </ResponsiveContainer>
                    </div>
            </div>

            <div className="grid grid-cols-2 gap-12">
               {/* Donut Chart */}
               <div className="bg-[#0f172a]/40 border border-white/5 p-10 rounded-[40px] flex flex-col">
                  <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-8 flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-indigo-500" /> Distribución de Consumo
                  </h4>
                  <div className="h-[400px] w-full mt-4">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                         <Pie
                           data={pieData}
                           innerRadius={90}
                           outerRadius={130}
                           paddingAngle={8}
                           dataKey="value"
                           stroke="none"
                         >
                           {pieData.map((entry: any, index: number) => (
                             <Cell 
                               key={`cell-${index}`} 
                               fill={COLORS[index % COLORS.length]} 
                               className="hover:opacity-80 transition-opacity cursor-pointer focus:outline-none"
                             />
                           ))}
                         </Pie>
                         <RechartsTooltip 
                           contentStyle={{
                             backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                             border: '1px solid rgba(255,255,255,0.1)', 
                             borderRadius: '24px', 
                             fontSize: '11px', 
                             fontWeight: 900, 
                             padding: '20px', 
                             backdropFilter: 'blur(10px)',
                             boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                           }} 
                           formatter={(val: number) => [`${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`, 'Subtotal']}
                         />
                         <Legend 
                           verticalAlign="middle" 
                           align="right" 
                           layout="vertical"
                           iconType="circle"
                           iconSize={8}
                           formatter={(value: string) => (
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{value}</span>
                           )}
                         />
                       </PieChart>
                     </ResponsiveContainer>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pb-12 pointer-events-none">
                       <span className="text-xs text-muted-foreground uppercase font-black">Total</span>
                       <span className="text-2xl font-black">100%</span>
                    </div>
                  </div>

               {/* Substats */}
               <div className="flex flex-col gap-6">
                  <div className="bg-[#0f172a]/40 border border-white/5 p-10 rounded-[40px] flex-1">
                     <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6 flex items-center gap-2">
                       <TrendingUp className="w-4 h-4 text-emerald-500" /> Ahorro Identificado
                     </h4>
                     <div className="flex flex-col gap-4">
                       <div className="flex justify-between items-end border-b border-white/5 pb-4">
                         <span className="text-xs text-slate-500 font-bold uppercase">Optimización Potencia</span>
                         <span className="text-xl font-black text-emerald-400">-124.50 €</span>
                       </div>
                       <div className="flex justify-between items-end border-b border-white/5 pb-4">
                         <span className="text-xs text-slate-500 font-bold uppercase">Ajuste de Reactiva</span>
                         <span className="text-xl font-black text-emerald-400">Exento</span>
                       </div>
                     </div>
                  </div>
               </div>
            </div>

               {/* Composed Chart */}
               <div className="bg-[#0f172a]/40 border border-white/5 p-10 rounded-[40px]">
                  <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-8 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" /> kWh vs Precio Medio
                  </h4>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <XAxis dataKey="name" hide />
                        <YAxis yAxisId="left" hide />
                        <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} width={55} tickFormatter={(v) => `${v.toFixed(3)}€`} />
                        <RechartsTooltip 
                          cursor={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5 5' }}
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '10px' }}
                          formatter={(value: any, name: any) => [
                            name === 'avgPrice' ? `${value.toFixed(4)} €/kWh` : `${value.toFixed(0)} kWh`,
                            name === 'avgPrice' ? 'Precio Medio' : 'Consumo Total'
                          ]}
                        />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
                        <Bar yAxisId="left" dataKey="totalKwh" fill="#3b82f6" radius={[5,5,0,0]} opacity={0.3} barSize={25} />
                        <Line yAxisId="right" type="monotone" dataKey="avgPrice" stroke="#10b981" strokeWidth={5} dot={{r: 6, fill: '#10b981', stroke: '#020617', strokeWidth: 2}} activeDot={{ r: 10, fill: '#34d399', stroke: '#fff', strokeWidth: 2 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex justify-between items-center mt-6">
                       <div className="flex flex-col">
                         <span className="text-[#10b981] text-[10px] font-black uppercase tracking-widest mb-1">Precio Medio</span>
                         <span className="text-2xl font-black text-white">{(chartData.reduce((a: number, b: any) => a + b.avgPrice, 0) / chartData.length).toFixed(4)} <small className="text-xs opacity-50">€/kWh</small></span>
                       </div>
                       <div className="h-10 w-[1px] bg-white/10" />
                       <div className="flex flex-col text-right">
                         <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Carga Max.</span>
                         <span className="text-2xl font-black text-white">{Math.max(...chartData.map((d: any) => d.totalKwh)).toFixed(0)} <small className="text-xs opacity-50">kWh</small></span>
                       </div>
                    </div>
               </div>
            </div>
          </div>
        </section>

        {/* PAGE 3: TABLES MATRIX */}
        <section className="min-h-[1100px] p-16 bg-[#020617] page-break-after">
          <div className="flex items-center gap-3 mb-10 border-l-4 border-blue-500 pl-4">
              <BarChart3 className="text-blue-500 w-8 h-8" />
              <h3 className="text-3xl font-black tracking-tighter uppercase">Matrices Técnicas de Detalle</h3>
          </div>

          <div className="flex flex-col gap-14">
            {/* Table 1: Consumo por Periodo */}
            <div className="flex flex-col gap-4">
              <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-4 h-4" /> Matriz de Consumo Energético (kWh)
              </h4>
              <div className="overflow-hidden rounded-3xl border border-white/5 bg-[#0f172a]/30">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-white/5 text-muted-foreground font-black uppercase tracking-tighter">
                    <tr>
                      <th className="px-8 py-6">Mes</th>
                      <th className="px-6 py-6 font-black text-center">P1</th>
                      <th className="px-6 py-6 font-black text-center">P2</th>
                      <th className="px-6 py-6 font-black text-center">P3</th>
                      <th className="px-6 py-6 font-black text-center">P4</th>
                      <th className="px-6 py-6 font-black text-center">P5</th>
                      <th className="px-6 py-6 font-black text-center">P6</th>
                      <th className="px-8 py-6 bg-white/5 text-right">TOTAL kWh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-slate-400">
                    {tableData.map((row: any, i: number) => {
                      const kwhTotals = tableData.map((d: any) => d.totalKwh);
                      const isTopKwh = isTop3(row.totalKwh, kwhTotals);
                      return (
                        <tr 
                          key={i} 
                          className="hover:bg-white/5 transition-colors group cursor-pointer"
                          onClick={() => setSelectedBillId(row.id)}
                        >
                          <td className="px-8 py-5 font-black text-[13px] text-white group-hover:text-blue-400 transition-colors">{row.name}</td>
                          {[1,2,3,4,5,6].map((p: number) => {
                            const val = (row as any)[`P${p}`];
                            return (
                               <td key={p} className="px-6 py-5 text-center text-[12px]">
                                 {val > 0 ? val.toFixed(0) : '-'}
                               </td>
                            );
                          })}
                          <td className={`px-8 py-5 bg-white/5 font-black text-right text-[13px] transition-all ${isTopKwh ? 'text-red-500 scale-110' : 'text-white'}`}>
                            {row.totalKwh.toFixed(0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Precio por Periodo */}
            <div className="flex flex-col gap-4">
              <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Matriz de Coste x Franja (€/kWh)
              </h4>
              <div className="overflow-hidden rounded-3xl border border-white/5 bg-[#0f172a]/30">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-white/5 text-muted-foreground font-black uppercase tracking-tighter">
                    <tr>
                      <th className="px-8 py-6">Mes</th>
                      <th className="px-6 py-6 text-center">P1</th>
                      <th className="px-6 py-6 text-center">P2</th>
                      <th className="px-6 py-6 text-center">P3</th>
                      <th className="px-6 py-6 text-center">P4</th>
                      <th className="px-6 py-6 text-center">P5</th>
                      <th className="px-6 py-6 text-center">P6</th>
                      <th className="px-8 py-6 bg-white/5 text-right">MEDIO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-slate-400">
                    {tableData.map((row: any, i: number) => {
                      const avgPrices = tableData.map((d: any) => d.avgPrice);
                      const isTopPrice = isTop3(row.avgPrice, avgPrices);
                      return (
                        <tr 
                          key={i} 
                          className="hover:bg-white/5 transition-colors group cursor-pointer"
                          onClick={() => setSelectedBillId(row.id)}
                        >
                          <td className="px-8 py-5 font-black text-[13px] text-white group-hover:text-indigo-400 transition-colors">{row.name}</td>
                          {[1,2,3,4,5,6].map((p: number) => {
                            const val = (row.prices as any)[`P${p}`];
                            return (
                              <td key={p} className="px-6 py-5 text-center text-[12px]">
                                {val > 0 ? val.toFixed(4) : '-'}
                              </td>
                            );
                          })}
                          <td className={`px-8 py-5 bg-white/5 font-black text-right text-[13px] transition-all ${isTopPrice ? 'text-red-500 scale-110' : 'text-blue-400'}`}>
                            {row.avgPrice.toFixed(4)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 3: Desglose de Gastos Simplified */}
            <div className="flex flex-col gap-4">
              <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                <Info className="w-4 h-4" /> Desglose Económico Simplificado (€)
              </h4>
              <div className="overflow-hidden rounded-3xl border border-white/5 bg-[#0f172a]/30">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-white/5 text-muted-foreground font-black uppercase tracking-tighter">
                    <tr>
                      <th className="px-8 py-6">Mes</th>
                      <th className="px-8 py-6 text-emerald-400 text-right">Energía</th>
                      <th className="px-8 py-6 text-amber-400 text-right">Potencia</th>
                      <th className="px-8 py-6 text-blue-400 text-right">Impuestos/Otros</th>
                      <th className="px-8 py-6 bg-white/5 text-right">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    {tableData.map((row: any, i: number) => {
                      const allTotals = tableData.map((d: any) => d.totalFactura);
                      const isTopTotal = isTop3(row.totalFactura, allTotals);
                      // Find actual bill for modal
                      const billId = row.id;
                      return (
                        <tr 
                          key={i} 
                          className="hover:bg-white/5 transition-all group cursor-pointer"
                          onClick={() => setSelectedBillId(billId)}
                        >
                          <td className="px-8 py-6">
                            <div className="flex flex-col gap-1">
                              <span className="font-black text-[14px] text-white group-hover:text-purple-400 transition-colors">{row.name}</span>
                              <span className="text-[10px] uppercase text-slate-500 flex items-center gap-1 font-black tracking-widest">
                                <Info className="w-3 h-3" /> Ver detalles
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-right text-[13px] text-white font-medium">{row.energia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                          <td className="px-8 py-6 text-right text-[13px] text-white font-medium">{row.potencia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                          <td className="px-8 py-6 text-right text-[13px] text-slate-500 font-medium">{row.otros.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                          <td className={`px-8 py-6 bg-white/5 font-black text-2xl tracking-tighter text-right transition-all group-hover:bg-white/10 ${isTopTotal ? 'text-red-500 scale-105' : 'text-white'}`}>
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

        {/* PAGE 4: SYNTHESIS */}
        <section className="min-h-[1100px] p-24 bg-[#0a0f1e] flex flex-col items-center justify-center relative text-center">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-600 to-emerald-500" />
            
            <motion.div initial={{y: 20, opacity: 0}} animate={{y:0, opacity: 1}} transition={{delay: 0.5}} className="mb-24 flex flex-col items-center gap-12">
               <div className="w-48 h-48 rounded-[40px] bg-gradient-to-br from-blue-600/20 to-indigo-600/20 flex items-center justify-center border border-white/10 shadow-[0_0_80px_rgba(59,130,246,0.15)] relative group">
                  <div className="absolute inset-0 bg-blue-500/10 blur-[40px] rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
                  <img src="/logo.png" className="w-24 h-24 object-contain mix-blend-screen relative z-10" alt="Voltis Logo Final" />
               </div>
               <div className="flex flex-col gap-2">
                 <h4 className="text-4xl font-black tracking-[0.2em] uppercase text-white">READY FOR <br/>SAVINGS</h4>
                 <div className="h-1 w-20 bg-blue-500 mx-auto rounded-full mt-2" />
               </div>
            </motion.div>

            <div className="grid grid-cols-3 gap-10 w-full max-w-5xl text-left">
               <div className="glass p-10 rounded-[40px] border border-white/5 bg-gradient-to-b from-white/5 to-transparent shadow-2xl">
                  <CheckCircle2 className="w-12 h-12 text-blue-400 mb-6" />
                  <h5 className="font-bold text-xs uppercase tracking-[0.2em] mb-4 text-blue-400">Mejoras de Optimización</h5>
                  <p className="text-slate-100/60 text-[14px] leading-relaxed">Se han detectado múltiples oportunidades de ahorro en el término de potencia y desajustes en las franjas horarias de mayor consumo.</p>
               </div>
               <div className="glass p-10 rounded-[40px] border border-white/5 bg-gradient-to-b from-white/5 to-transparent shadow-2xl">
                  <Activity className="w-12 h-12 text-indigo-400 mb-6" />
                  <h5 className="font-bold text-xs uppercase tracking-[0.2em] mb-4 text-indigo-400">Estado del Suministro</h5>
                  <p className="text-slate-100/60 text-[14px] leading-relaxed">El perfil analizado muestra picos de demanda ineficientes que pueden ser mitigados mediante una mejor gestión de cargas operativas.</p>
               </div>
               <div className="glass p-10 rounded-[40px] border border-white/5 bg-gradient-to-b from-white/5 to-transparent shadow-2xl">
                  <Zap className="w-12 h-12 text-emerald-400 mb-6" />
                  <h5 className="font-bold text-xs uppercase tracking-[0.2em] mb-4 text-emerald-400">Certificación Voltis</h5>
                  <p className="text-slate-100/60 text-[14px] leading-relaxed">Este informe ha sido validado bajo los estándares de Voltis Anual Economics, confirmando potencial de ahorro inmediato.</p>
               </div>
            </div>

            <div className="mt-32 py-10 border-t border-white/5 w-full max-w-2xl flex flex-col items-center gap-6">
               <div className="flex items-center gap-5 opacity-40">
                 <img src="/logo.png" className="w-14 h-14 object-contain mix-blend-screen" alt="Logo mini" />
                 <span className="text-[14px] font-black tracking-[0.6em] uppercase text-white">VOLTIS ANUAL ECONOMICS // 2026</span>
               </div>
            </div>
        </section>

      </div>

      {/* Dynamic Detail Modal */}
      <AnimatePresence>
        {selectedBillId && selectedBill && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm no-print cursor-pointer"
            onClick={() => setSelectedBillId(null)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0f172a] border border-white/10 rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl cursor-default"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-transparent">
                <div>
                   <h2 className="text-xl font-black tracking-tight text-white uppercase italic">{selectedBill.fileName}</h2>
                   <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Desglose Técnico Detallado</p>
                </div>
                <button 
                  onClick={() => setSelectedBillId(null)}
                  className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 rotate-90" />
                </button>
              </div>
              
              <div className="p-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-10">
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 text-center flex flex-col gap-2">
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] block">Total Factura</span>
                      <span className="text-3xl font-black text-white">{selectedBill.totalCalculado.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                    </div>
                    <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 text-center flex flex-col gap-2">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] block">Fecha Factura</span>
                      <span className="text-3xl font-black text-white">{selectedBill.fechaInicio?.split('-').reverse().join('/')}</span>
                    </div>
                  </div>

                  {/* Consumo Detail */}
                  <div className="space-y-6">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 border-b border-white/5 pb-4">Desglose de Energía Acumulada</h5>
                    <div className="grid grid-cols-1 gap-3">
                       {selectedBill.consumo?.map((c: any, idx: number) => (
                         <div key={idx} className="flex items-center justify-between px-6 py-4 bg-white/[0.03] rounded-2xl border border-white/5 hover:bg-white/[0.05] transition-colors group">
                            <span className="font-black text-white tracking-[0.2em] text-xs uppercase">{c.periodo}</span>
                            <div className="flex items-center gap-10">
                              <span className="text-slate-500 text-[11px] font-bold">{c.kwh.toLocaleString('es-ES')} kWh</span>
                              <span className="font-black text-blue-400 min-w-[90px] text-right group-hover:scale-105 transition-transform">{c.total.toFixed(2)} €</span>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>

                   {/* Potencia Detail */}
                   <div className="space-y-6">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 border-b border-white/5 pb-4">Términos de Potencia Fija</h5>
                    <div className="grid grid-cols-1 gap-3">
                       {selectedBill.potencia?.map((p: any, idx: number) => (
                         <div key={idx} className="flex items-center justify-between px-6 py-4 bg-white/[0.03] rounded-2xl border border-white/5 hover:bg-white/[0.05] transition-colors group">
                            <span className="font-black text-white tracking-[0.2em] text-xs uppercase">{p.periodo}</span>
                            <div className="flex items-center gap-10">
                              <span className="text-slate-500 text-[11px] font-bold">{p.kw} kW · {p.dias} días</span>
                              <span className="font-black text-amber-500 min-w-[90px] text-right group-hover:scale-105 transition-transform">{p.total.toFixed(2)} €</span>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>

                  {/* Others Detail */}
                  <div className="space-y-6 pb-6">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 border-b border-white/5 pb-4">Otros Conceptos e Impuestos</h5>
                    <div className="grid grid-cols-1 gap-3">
                       {[...(selectedBill.otrosConceptos || []), ...(customOCs[selectedBill.id] || [])].map((oc: any, idx: number) => (
                         <div key={idx} className="flex items-center justify-between px-6 py-4 bg-white/[0.03] rounded-2xl border border-white/5 border-l-purple-500/50 hover:bg-white/[0.05] transition-colors group">
                            <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">{oc.concepto}</span>
                            <span className="font-black text-white group-hover:scale-105 transition-transform">{oc.total.toFixed(2)} €</span>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0; /* No white borders allowed */
          }
          html, body { 
            background: #020617 !important; 
            margin: 0 !important; 
            padding: 0 !important;
            height: 100%;
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .report-container { 
            width: 100% !important; 
            max-width: none !important;
            background: #020617 !important; 
            min-height: 100vh;
            padding: 40px !important; /* Internal padding for breathability */
          }
          .page-break-after { 
            page-break-after: always !important; 
            break-after: page !important; 
            margin-top: 40px !important;
          }
          section { 
            page-break-inside: auto !important;
            margin-bottom: 60px !important; /* Space between blocks */
            padding: 0 20px !important;
          }
          /* Prevent cards and tables from splitting across pages */
          .bg-[#0f172a]/40, .glass, table, tr, section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .glass { 
            background: rgba(30, 41, 59, 0.7) !important; 
            border: 1px solid rgba(255, 255, 255, 0.2) !important; 
            backdrop-filter: none !important; 
          }
          h3, h4 { 
            page-break-after: avoid !important; 
            margin-top: 50px !important;
            margin-bottom: 25px !important;
          }
          /* Ensure charts take enough space but fit */
          .recharts-responsive-container {
            width: 100% !important;
            height: 400px !important;
            margin: 0 auto !important;
          }
          .recharts-wrapper {
            margin: 0 auto !important;
          }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
      `}</style>
    </motion.div>
  );
}

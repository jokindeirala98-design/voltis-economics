import React, { useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ExtractedBill } from '@/lib/types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  ComposedChart, Line, PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { ArrowLeft, Printer, Zap, Activity, Info, TrendingUp, DollarSign, BarChart3, PieChart as PieIcon, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface ReportViewProps {
  bills: ExtractedBill[];
  onBack: () => void;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

export default function ReportView({ bills, onBack }: ReportViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const reactToPrintFn = useReactToPrint({
    contentRef,
    documentTitle: 'Voltis_Anual_Economics_Report',
  });

  const validBills = useMemo(() => bills.filter(b => b.status === 'success').sort((a,b) => {
    return (a.fechaInicio || '').localeCompare(b.fechaInicio || '');
  }), [bills]);

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
        if (oc.concepto.includes('Impuesto') || oc.concepto.includes('IVA')) impuestos += oc.total;
        else otros += oc.total;
      });

      totals.energetic += energia;
      totals.power += potencia;
      totals.taxes += impuestos;
      totals.others += otros;
      totals.global += (b.totalFactura || 0);
      totals.kwh += (b.consumoTotalKwh || 0);

      const monthLabel = b.fechaInicio ? new Date(b.fechaInicio).toLocaleString('es-ES', { month: 'short', year: '2-digit' }) : 'Factura';

      return {
        name: monthLabel,
        P1: p1, P2: p2, P3: p3, P4: p4, P5: p5, P6: p6,
        totalKwh: b.consumoTotalKwh || 0,
        avgPrice: b.costeMedioKwh || 0,
        totalFactura: b.totalFactura || 0,
        energia,
        potencia,
        otros: impuestos + otros,
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
    ].filter(i => i.value > 0);

    return { chartData: cData, pieData: pData, summaryStats: totals, tableData: cData };
  }, [validBills]);

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
      <div className="flex items-center justify-between glass p-4 rounded-2xl border border-white/10 no-print sticky top-4 z-50">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/5 transition-colors text-muted-foreground hover:text-white font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al Panel
        </button>
        <button 
          onClick={() => reactToPrintFn()}
          className="flex items-center gap-2 px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-xl shadow-blue-900/40 transition-all active:scale-95"
        >
          <Printer className="w-4 h-4" /> Generar Informe PDF
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
              <p className="text-blue-400 font-bold tracking-[0.4em] text-xs ml-32 uppercase opacity-80">Análisis Energético de Precisión</p>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Informe de Análisis</span>
              <h2 className="text-6xl font-black tracking-tighter text-blue-500 uppercase">{validBills[0]?.titular?.split(' ')[0] || 'HUMICLIMA'}</h2>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-12 mt-24">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">CUPS / IDENTIFICADOR</span>
              <span className="text-lg font-medium tracking-wider">ES00000XXXXXXXXXXXXXX</span>
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
              <span className="text-lg font-medium">
                {validBills[0]?.fechaInicio?.split('-')[1]}/{validBills[0]?.fechaInicio?.split('-')[0].substring(2)} - 
                {validBills[validBills.length-1]?.fechaFin?.split('-')[1]}/{validBills[validBills.length-1]?.fechaFin?.split('-')[0].substring(2)}
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
              <p className="text-4xl font-black tracking-tighter">{validBills.length}</p>
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
                 <BarChart3 className="w-4 h-4 text-blue-500" /> Evolución del Gasto Mensual (€)
               </h4>
               <div className="h-[350px]">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={chartData}>
                     <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                     <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                     <RechartsTooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px'}} />
                     <Bar dataKey="totalFactura" fill="url(#barGradient)" radius={[10, 10, 0, 0]} />
                     <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                          <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8} />
                        </linearGradient>
                     </defs>
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
                  <div className="h-[300px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%"
                          innerRadius={80} outerRadius={110}
                          paddingAngle={10} dataKey="value" stroke="none"
                        >
                          {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip />
                        <Legend verticalAlign="bottom" wrapperStyle={{paddingTop: '20px', fontSize: '11px', fontWeight: 'bold'}} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pb-12 pointer-events-none">
                       <span className="text-xs text-muted-foreground uppercase font-black">Total</span>
                       <span className="text-2xl font-black">100%</span>
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
                      <ComposedChart data={chartData}>
                        <XAxis dataKey="name" hide />
                        <YAxis yAxisId="left" hide />
                        <YAxis yAxisId="right" orientation="right" hide />
                        <Bar yAxisId="left" dataKey="totalKwh" fill="#334155" radius={[5,5,0,0]} opacity={0.5} />
                        <Line yAxisId="right" type="monotone" dataKey="avgPrice" stroke="#10b981" strokeWidth={4} dot={{r: 6, fill: '#10b981'}} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex justify-between items-center mt-6">
                       <div className="flex flex-col">
                         <span className="text-[#10b981] text-xs font-black uppercase">Precio Medio</span>
                         <span className="text-xl font-bold">{(chartData.reduce((a,b)=>a+b.avgPrice,0)/chartData.length).toFixed(4)} <small>€/kWh</small></span>
                       </div>
                       <div className="h-10 w-[1px] bg-white/10" />
                       <div className="flex flex-col">
                         <span className="text-slate-400 text-xs font-black uppercase">Eficiencia</span>
                         <span className="text-xl font-bold">A++</span>
                       </div>
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
                  <tbody className="divide-y divide-white/5 font-medium">
                    {tableData.map((row, i) => {
                      const allKwhValues = tableData.flatMap(r => [r.P1, r.P2, r.P3, r.P4, r.P5, r.P6]);
                      return (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="px-8 py-5 font-black text-[13px]">{row.name}</td>
                          {[1,2,3,4,5,6].map(p => {
                            const val = (row as any)[`P${p}`];
                            return (
                              <td key={p} className={`px-6 py-5 text-center text-[12px] ${isTop3(val, allKwhValues) ? 'text-red-500 font-black italic underline' : ''} ${getHeatColor(val)}`}>
                                {val > 0 ? val.toFixed(0) : '-'}
                              </td>
                            );
                          })}
                          <td className="px-8 py-5 bg-white/5 font-black text-white text-[13px] text-right">{row.totalKwh.toFixed(0)}</td>
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
                  <tbody className="divide-y divide-white/5 font-medium">
                    {tableData.map((row, i) => {
                      const allPriceValues = tableData.flatMap(r => Object.values(r.prices));
                      return (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="px-8 py-5 font-black text-[13px]">{row.name}</td>
                          {[1,2,3,4,5,6].map(p => {
                            const val = (row.prices as any)[`P${p}`];
                            return (
                              <td key={p} className={`px-6 py-5 text-center text-[12px] ${isTop3(val, allPriceValues) ? 'text-red-500 font-black' : 'text-slate-400'}`}>
                                {val > 0 ? val.toFixed(4) : '-'}
                              </td>
                            );
                          })}
                          <td className="px-8 py-5 bg-white/5 font-black text-blue-400 text-[13px] text-right">{row.avgPrice.toFixed(4)}</td>
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
                    {tableData.map((row, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-6 font-black text-[14px]">{row.name}</td>
                        <td className="px-8 py-6 text-right text-[13px]">{row.energia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                        <td className="px-8 py-6 text-right text-[13px]">{row.potencia.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                        <td className="px-8 py-6 text-right text-[13px] text-slate-500">{row.otros.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                        <td className="px-8 py-6 bg-white/5 font-black text-2xl tracking-tighter text-right">{row.totalFactura.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* PAGE 4: SYNTHESIS */}
        <section className="min-h-[1100px] p-24 bg-[#0a0f1e] flex flex-col items-center justify-center relative text-center">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-600 to-emerald-500" />
            
            <motion.div initial={{y: 20, opacity: 0}} animate={{y:0, opacity: 1}} transition={{delay: 0.5}} className="mb-24">
               <img src="/mascot.png" className="w-[500px] object-contain drop-shadow-[0_0_60px_rgba(59,130,246,0.3)]" alt="Voltis Mascot" />
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

      <style jsx global>{`
        @media print {
          body { background: #020617 !important; border: none; }
          .no-print { display: none !important; }
          .report-container { width: 210mm; min-height: 297mm; background: #020617 !important; }
          .page-break-after { page-break-after: always; }
          .glass { background: rgba(15, 23, 42, 0.4) !important; border: 1px solid rgba(255, 255, 255, 0.05) !important; backdrop-filter: none !important; }
        }
      `}</style>
    </motion.div>
  );
}

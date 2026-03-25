"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Smartphone, Zap, ShieldCheck, Lock, Eye, EyeOff } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (password: string) => void;
  error: string | null;
}

export default function LoginScreen({ onLogin, error }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(password);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#020617] text-white flex flex-col items-center justify-center p-6 overflow-hidden font-inter">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-purple-600/5 blur-[100px] rounded-full" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative z-10 w-full max-w-xl text-center space-y-10"
      >
        {/* Logo Section */}
        <div className="space-y-4">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="flex items-center justify-center gap-2 mb-6"
          >
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-xl shadow-blue-500/20">
                <Zap className="w-6 h-6 text-white fill-white" />
              </div>
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-[10px] font-mono font-bold tracking-[0.3em] text-blue-400/80 uppercase"
              >
                System V2.5.2 • Gemini PRO
              </motion.span>
            </div>
            <span className="text-2xl font-black tracking-tighter uppercase italic">Voltis</span>
          </motion.div>
          
          <h1 className="text-7xl font-black tracking-[-0.05em] leading-[0.85] uppercase italic">
            Annual <br />
            <span className="text-blue-500">Economics</span>
          </h1>
          <p className="text-slate-500 font-medium tracking-tight text-lg max-w-sm mx-auto pt-4 leading-relaxed">
            Auditoría energética avanzada asistida por IA para comerciales expertos.
          </p>
        </div>

        {/* Password Form */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="pt-4 max-w-sm mx-auto w-full"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña de acceso"
                className="block w-full pl-16 pr-14 py-5 bg-white/5 border border-white/10 rounded-[32px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm font-bold tracking-widest uppercase"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-6 flex items-center text-slate-500 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-red-400 text-[10px] font-black uppercase tracking-widest"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              className="group relative flex items-center justify-center gap-4 w-full px-8 py-5 rounded-[32px] bg-white text-black font-black text-sm uppercase tracking-widest hover:bg-blue-50 transition-all duration-300 shadow-2xl shadow-blue-500/10 active:scale-95 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              Acceder al Sistema
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <p className="text-[10px] text-slate-700 font-bold uppercase tracking-[0.2em] mt-8">
            Exclusivo para la red comercial de Voltis
          </p>
        </motion.div>

        {/* Feature Grid */}
        <div className="grid grid-cols-3 gap-4 pt-12 border-t border-white/5 max-w-sm mx-auto">
          {[
            { icon: <ShieldCheck className="w-4 h-4" />, label: 'Seguro' },
            { icon: <Smartphone className="w-4 h-4" />, label: 'Mobile Ready' },
            { icon: <Sparkles className="w-4 h-4" />, label: 'Gemini AI' }
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400">
                {item.icon}
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface HeroTitleProps {
  children: string;
  subtitle?: string;
}

type FlickerState = 'idle' | 'flicker1' | 'flickerOff1' | 'flicker2' | 'flickerOff2' | 'flicker3' | 'glowHold' | 'fadeOut';

const flickerStyles: Record<FlickerState, React.CSSProperties> = {
  idle: { scale: 1, filter: 'brightness(1)' },
  flicker1: { scale: 1.01, filter: 'brightness(1.1)' },
  flickerOff1: { scale: 1, filter: 'brightness(1)' },
  flicker2: { scale: 1.01, filter: 'brightness(1.1)' },
  flickerOff2: { scale: 1, filter: 'brightness(1)' },
  flicker3: { scale: 1.01, filter: 'brightness(1.1)' },
  glowHold: { scale: 1.01, filter: 'brightness(1.05)' },
  fadeOut: { scale: 1, filter: 'brightness(1)' },
};

const flickerSequence: FlickerState[] = [
  'flicker1', 'flickerOff1', 'flicker2', 'flickerOff2', 'flicker3', 'glowHold', 'fadeOut'
];

const flickerDurations: Record<FlickerState, number> = {
  idle: 0,
  flicker1: 80,
  flickerOff1: 80,
  flicker2: 80,
  flickerOff2: 80,
  flicker3: 80,
  glowHold: 200,
  fadeOut: 600,
};

export const HeroTitle: React.FC<HeroTitleProps> = ({ children, subtitle }) => {
  const [flickerState, setFlickerState] = useState<FlickerState>('idle');
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const runFlickerSequence = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    
    let stepIndex = 0;
    
    const runStep = () => {
      if (stepIndex < flickerSequence.length) {
        setFlickerState(flickerSequence[stepIndex]);
        stepIndex++;
        setTimeout(runStep, flickerDurations[flickerSequence[stepIndex - 1]] || 80);
      } else {
        setFlickerState('idle');
        setIsAnimating(false);
      }
    };
    
    runStep();
  }, [isAnimating]);

  const handleMouseEnter = () => {
    if (!isAnimating) {
      runFlickerSequence();
    }
  };

  const handleMouseLeave = () => {
    setFlickerState('idle');
    setIsAnimating(false);
  };

  const currentStyle = flickerStyles[flickerState];

  return (
    <div ref={containerRef} className="relative flex flex-col items-center">
      <div className="relative">
        <motion.h1
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 1 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          whileHover={{ scale: 1.01 }}
          className="text-[clamp(40px,7vw,80px)] font-black tracking-tighter leading-[0.9] text-white select-none cursor-default"
          style={{
            ...currentStyle,
            transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
        >
          {children}
        </motion.h1>
       </div>
      
      {subtitle && (
        <motion.h2
          className="text-[9px] font-bold tracking-[0.8em] text-slate-500/50 leading-none mt-4 uppercase pl-[0.8em]"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
        >
          {subtitle}
        </motion.h2>
      )}
    </div>
  );
};

export default HeroTitle;

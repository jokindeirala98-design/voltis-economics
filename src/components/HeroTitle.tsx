'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MascotaHero } from './MascotaHero';

interface HeroTitleProps {
  children: string;
  subtitle?: string;
}

type FlickerState = 'idle' | 'flicker1' | 'flickerOff1' | 'flicker2' | 'flickerOff2' | 'flicker3' | 'glowHold' | 'fadeOut';

const flickerStyles: Record<FlickerState, React.CSSProperties> = {
  idle: {
    scale: 1,
    y: 0,
    filter: 'brightness(1)',
    textShadow: '0 0 30px rgba(6, 182, 212, 0.4), 0 0 60px rgba(6, 182, 212, 0.2)',
  },
  flicker1: {
    scale: 1.03,
    y: -2,
    filter: 'brightness(1.2)',
    textShadow: '0 0 50px rgba(6, 182, 212, 0.9), 0 0 100px rgba(6, 182, 212, 0.6)',
  },
  flickerOff1: {
    scale: 1.02,
    y: -1,
    filter: 'brightness(1.1)',
    textShadow: '0 0 30px rgba(6, 182, 212, 0.5)',
  },
  flicker2: {
    scale: 1.03,
    y: -2,
    filter: 'brightness(1.2)',
    textShadow: '0 0 50px rgba(6, 182, 212, 0.9), 0 0 100px rgba(6, 182, 212, 0.6)',
  },
  flickerOff2: {
    scale: 1.02,
    y: -1,
    filter: 'brightness(1.1)',
    textShadow: '0 0 30px rgba(6, 182, 212, 0.5)',
  },
  flicker3: {
    scale: 1.03,
    y: -2,
    filter: 'brightness(1.2)',
    textShadow: '0 0 50px rgba(6, 182, 212, 0.9), 0 0 100px rgba(6, 182, 212, 0.6)',
  },
  glowHold: {
    scale: 1.03,
    y: -2,
    filter: 'brightness(1.1)',
    textShadow: '0 0 40px rgba(6, 182, 212, 0.7), 0 0 80px rgba(6, 182, 212, 0.4)',
  },
  fadeOut: {
    scale: 1,
    y: 0,
    filter: 'brightness(1)',
    textShadow: '0 0 30px rgba(6, 182, 212, 0.4), 0 0 60px rgba(6, 182, 212, 0.2)',
  },
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
  const [showGlow, setShowGlow] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isTitleHovered, setIsTitleHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const runFlickerSequence = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    setShowGlow(true);
    setIsTitleHovered(true);
    
    let stepIndex = 0;
    
    const runStep = () => {
      if (stepIndex < flickerSequence.length) {
        setFlickerState(flickerSequence[stepIndex]);
        stepIndex++;
        setTimeout(runStep, flickerDurations[flickerSequence[stepIndex - 1]] || 80);
      } else {
        setFlickerState('idle');
        setShowGlow(true);
        setIsAnimating(false);
        setIsTitleHovered(false);
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
    setShowGlow(true);
    setIsAnimating(false);
    setIsTitleHovered(false);
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
          whileHover={{ scale: 1.03, filter: 'brightness(1.1)' }}
          className="text-[clamp(80px,12vw,160px)] font-black tracking-[-0.06em] leading-[0.8] text-white select-none cursor-default"
          style={{
            ...currentStyle,
            transition: flickerState === 'fadeOut' 
              ? 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)' 
              : flickerState === 'idle'
              ? 'all 0.3s ease'
              : 'all 0.05s linear',
          }}
        >
          {children}
        </motion.h1>
        
        <AnimatePresence>
          {showGlow && (
            <motion.div
              key="glow-bg"
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: flickerState === 'fadeOut' ? 0 : 
                         flickerState === 'glowHold' ? 0.5 :
                         [0, 0.3, 0.15, 0.3, 0.15, 0.3, 0.6][Math.min(flickerSequence.indexOf(flickerState), 6)] || 0.3,
              }}
              exit={{ opacity: 0 }}
              transition={{ 
                duration: flickerState === 'fadeOut' ? 0.6 : 0.05,
              }}
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(6, 182, 212, 0.2) 0%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
          )}
        </AnimatePresence>
      </div>
      
      {subtitle && (
        <>
          <motion.h2
            className="text-[clamp(40px,8vw,90px)] font-bold italic tracking-tighter text-blue-400 leading-[0.8] mt-2"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 1 }}
          >
            {subtitle}
          </motion.h2>
          
          <div className="relative w-full mt-4 flex justify-center parallax-float">
            <MascotaHero isHovered={isTitleHovered} />
          </div>
        </>
      )}
    </div>
  );
};

export default HeroTitle;

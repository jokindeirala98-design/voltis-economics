'use client';

import React, { useState, useEffect } from 'react';

interface MascotaHeroProps {
  isHovered?: boolean;
  className?: string;
}

type FlickerState = 'idle' | 'glow1' | 'glow2' | 'glow3';

export const MascotaHero: React.FC<MascotaHeroProps> = ({ isHovered = false, className = '' }) => {
  const [flickerState, setFlickerState] = useState<FlickerState>('idle');
  
  useEffect(() => {
    if (isHovered) {
      let step = 0;
      const states: FlickerState[] = ['glow1', 'glow2', 'glow3', 'glow2'];
      const interval = setInterval(() => {
        setFlickerState(states[step % states.length]);
        step++;
      }, 150);
      return () => clearInterval(interval);
    } else {
      setFlickerState('idle');
    }
  }, [isHovered]);

  const glowStyles: Record<FlickerState, React.CSSProperties> = {
    idle: { filter: 'drop-shadow(0 0 10px rgba(6, 182, 212, 0.2))' },
    glow1: { filter: 'drop-shadow(0 0 15px #06b6d4) drop-shadow(0 0 25px rgba(6, 182, 212, 0.6))' },
    glow2: { filter: 'drop-shadow(0 0 20px #06b6d4) drop-shadow(0 0 35px rgba(6, 182, 212, 0.8))' },
    glow3: { filter: 'drop-shadow(0 0 25px #06b6d4) drop-shadow(0 0 40px rgba(6, 182, 212, 1))' },
  };

  return (
    <div
      className={`flex justify-center ${className}`}
      style={{
        marginTop: '-25px',
        position: 'relative',
        zIndex: 10,
        width: '100%',
      }}
    >
      <div className="relative">
        <img
          src="/assets/mascota-transparent.png"
          alt="Mascota Voltis"
          className="w-[100px] h-auto object-contain transition-all duration-100"
          style={glowStyles[flickerState]}
        />
      </div>
    </div>
  );
};

export default MascotaHero;

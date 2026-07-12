'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ChickenRoadLevel } from './chicken-road-bet-panel';

export interface ChickenRoadBoardProps {
  lanesCount: number;
  currentLane: number;
  crashLane: number | null;
  state: 'idle' | 'active' | 'cashed' | 'busted';
  ladder: number[];
  onStep: () => void;
  busy: boolean;
}

const CAR_IMAGES = ['car_1.png', 'car_2.png', 'car_3.png'];

export function ChickenRoadBoard({
  lanesCount,
  currentLane,
  crashLane,
  state,
  ladder,
  onStep,
  busy,
}: ChickenRoadBoardProps) {
  // Animation state for the chicken
  const [chickenHit, setChickenHit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset chicken state when round changes
  useEffect(() => {
    if (state === 'idle' || state === 'active') {
      setChickenHit(false);
    }
  }, [state, currentLane]);

  // We only allow cars on lanes > currentLane. 
  // We will handle car spawning inside a useEffect loop or CSS.
  // For simplicity and performance, let's use CSS animations for background cars, 
  // and a specific controlled Framer Motion animation for the killer car.

  const isBusted = state === 'busted';

  return (
    <div 
      className="relative flex h-[400px] w-full overflow-x-auto rounded-xl border border-white/5 bg-[#1a1c24] p-4 lg:h-[500px]"
      ref={containerRef}
    >
      <div className="relative flex min-w-max h-full">
        {/* Sidewalk */}
        <div className="relative flex w-24 flex-col items-center justify-center border-r-4 border-white/10 bg-[#252833]">
          {/* Traffic Light */}
          <div className="absolute left-2 top-4">
            <svg width="40" height="90" viewBox="0 0 40 90" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="0" width="30" height="70" rx="10" fill="#111" />
              <rect x="15" y="70" width="10" height="20" fill="#333" />
              <circle cx="20" cy="20" r="10" fill={state === 'busted' ? '#333' : '#ef4444'} />
              <circle cx="20" cy="50" r="10" fill={state === 'active' ? '#22c55e' : '#333'} />
            </svg>
          </div>
          
          {/* Bush */}
          <div className="absolute bottom-4 left-4">
            <svg width="50" height="40" viewBox="0 0 50 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M25 5C15 5 10 15 5 20C0 25 5 35 15 35H35C45 35 50 25 45 20C40 15 35 5 25 5Z" fill="#166534" />
              <path d="M20 15C15 15 12 20 10 25C8 30 12 35 18 35H30C36 35 40 30 38 25C36 20 30 15 20 15Z" fill="#15803d" />
            </svg>
          </div>

          <div className="h-full w-full opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, #000 20px, #000 40px)', width: '20px', position: 'absolute', right: '0' }} />
        </div>

        {/* Lanes */}
        <div className="flex h-full">
          {Array.from({ length: lanesCount }).map((_, i) => {
            const laneIndex = i + 1;
            const isPassed = laneIndex <= currentLane && state !== 'busted'; // if busted, the current lane is not strictly "passed" safely
            const isNext = laneIndex === currentLane + 1 && state === 'active';
            const multiplier = ladder[i];

            return (
              <div 
                key={laneIndex} 
                className="relative flex w-24 flex-col items-center justify-center border-r-2 border-dashed border-white/10 bg-[#1e212b]"
              >
                {/* Stop sign for passed lanes */}
                {isPassed && (
                  <div className="absolute top-2 z-10 opacity-80">
                    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <polygon points="10,0 20,0 30,10 30,20 20,30 10,30 0,20 0,10" fill="#ef4444" />
                      <text x="15" y="18" fill="white" fontSize="8" fontWeight="bold" textAnchor="middle">STOP</text>
                    </svg>
                  </div>
                )}

                {/* Background Cars for active/future lanes */}
                {!isPassed && laneIndex !== crashLane && (
                  <BackgroundCars laneIndex={laneIndex} active={state === 'active'} />
                )}

                {/* Killer car if this is the crash lane */}
                {state === 'busted' && laneIndex === crashLane && (
                  <KillerCar onHit={() => setChickenHit(true)} />
                )}

                {/* Manhole Cover (Clickable if next) */}
                <button
                  disabled={!isNext || busy}
                  onClick={() => { if (isNext && !busy) onStep(); }}
                  className={cn(
                    "relative z-20 flex h-16 w-16 items-center justify-center rounded-full transition-all",
                    "border-[4px] bg-[#2a2d39]",
                    isNext ? "cursor-pointer border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)] hover:scale-105" : "border-white/10",
                    laneIndex < currentLane && "opacity-50",
                    isBusted && laneIndex === crashLane && "border-red-500"
                  )}
                >
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="18" stroke="#ffffff20" strokeWidth="2" />
                    <line x1="12" y1="12" x2="28" y2="12" stroke="#ffffff20" strokeWidth="2" strokeLinecap="round" />
                    <line x1="10" y1="20" x2="30" y2="20" stroke="#ffffff20" strokeWidth="2" strokeLinecap="round" />
                    <line x1="12" y1="28" x2="28" y2="28" stroke="#ffffff20" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Multiplier Badge */}
                <div className={cn(
                  "absolute bottom-4 rounded-md px-2 py-1 text-xs font-bold transition-colors",
                  isPassed ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/50",
                  isNext && "bg-blue-500/20 text-blue-400"
                )}>
                  {multiplier.toFixed(2)}x
                </div>
              </div>
            );
          })}
        </div>

        {/* The Chicken */}
        {/* currentLane = 0 means X = 48 (center of sidewalk). currentLane = 1 means X = 96 + 48 = 144, etc. */}
        <motion.div
          className="pointer-events-none absolute z-30"
          initial={false}
          animate={{ x: currentLane * 96 + 48, y: '50%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{ x: '-50%', y: '-50%' }}
        >
          <img 
            src={`/games/chicken-road/${chickenHit ? 'chicken_hit.png' : 'chicken_idle.png'}`} 
            alt="Chicken"
            className="h-14 w-14 object-contain"
            onError={(e) => {
              // Placeholder if image is missing
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = `<div class="h-10 w-10 rounded-full ${chickenHit ? 'bg-red-500' : 'bg-yellow-400'} flex items-center justify-center font-bold text-black">${chickenHit ? 'X' : 'C'}</div>`;
            }}
          />
        </motion.div>

      </div>
    </div>
  );
}

// Background car animation for safe/future lanes
function BackgroundCars({ laneIndex, active }: { laneIndex: number; active: boolean }) {
  const [offset] = useState(() => Math.random() * -500); // Random start
  const [carImg] = useState(() => CAR_IMAGES[Math.floor(Math.random() * CAR_IMAGES.length)]);
  const [speed] = useState(() => 1.5 + Math.random() * 2);

  if (!active) return null;

  return (
    <motion.div
      className="absolute z-10"
      initial={{ top: offset }}
      animate={{ top: ['0%', '150%'] }}
      transition={{ duration: speed, repeat: Infinity, ease: 'linear' }}
    >
      <img 
        src={`/games/chicken-road/${carImg}`} 
        className="h-20 w-12 object-contain"
        alt="Car"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement!.innerHTML = `<div class="h-16 w-8 bg-blue-500 rounded-md"></div>`;
        }}
      />
    </motion.div>
  );
}

// The specific killer car for the crash lane
function KillerCar({ onHit }: { onHit: () => void }) {
  const controls = useAnimation();
  const [carImg] = useState(() => CAR_IMAGES[Math.floor(Math.random() * CAR_IMAGES.length)]);

  useEffect(() => {
    // Animate from top to just past the center, trigger onHit, then continue
    const runAnimation = async () => {
      await controls.start({
        top: '50%',
        transition: { duration: 0.3, ease: 'easeIn' }
      });
      onHit();
      await controls.start({
        top: '150%',
        transition: { duration: 0.4, ease: 'easeOut' }
      });
    };
    runAnimation();
  }, [controls, onHit]);

  return (
    <motion.div
      className="absolute z-40"
      initial={{ top: '-20%', left: '50%', x: '-50%', y: '-50%' }}
      animate={controls}
    >
      <img 
        src={`/games/chicken-road/${carImg}`} 
        className="h-24 w-14 object-contain opacity-90 drop-shadow-2xl"
        alt="Killer Car"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement!.innerHTML = `<div class="h-20 w-10 bg-red-600 rounded-md shadow-xl"></div>`;
        }}
      />
    </motion.div>
  );
}

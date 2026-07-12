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

  // Auto-pan camera
  useEffect(() => {
    if (containerRef.current) {
      // Calculate target scroll to center the chicken (chicken is at currentLane * 96 + 48)
      const containerWidth = containerRef.current.clientWidth;
      const targetLeft = Math.max(0, currentLane * 96 + 48 - containerWidth / 2);
      containerRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
  }, [currentLane]);

  const isBusted = state === 'busted';

  return (
    <div className="relative h-[400px] w-full overflow-hidden rounded-xl border border-white/5 bg-[#1a1c24] lg:h-[500px]">
      <div 
        className="flex h-full w-full overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        ref={containerRef}
      >
        <div className="relative flex min-w-max h-full">
          {/* Sidewalk */}
          <div className="relative flex w-24 flex-col items-center justify-center border-r-4 border-white/10 bg-[#252833]">
            {/* Pedestrian Crossing Sign */}
            <div className="absolute left-2 top-4">
              <svg width="40" height="70" viewBox="0 0 40 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="18" y="25" width="4" height="45" fill="#52525b" />
                <g transform="translate(20, 20) rotate(45)">
                  <rect x="-15" y="-15" width="30" height="30" fill="#facc15" stroke="#000" strokeWidth="2" rx="2" />
                  <path d="M-4 -4 L-1 4 L1 4 L4 -4 M0 4 L-3 10 M0 4 L3 10" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="0" cy="-7" r="2.5" fill="#000" />
                </g>
              </svg>
            </div>
            
            {/* Fluffy Tree */}
            <div className="absolute bottom-4 left-0">
              <svg width="60" height="70" viewBox="0 0 60 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="26" y="40" width="8" height="30" fill="#78350f" rx="2" />
                <path d="M26 60 L20 70 L40 70 L34 60 Z" fill="#451a03" />
                <circle cx="30" cy="25" r="20" fill="#15803d" />
                <circle cx="15" cy="35" r="15" fill="#166534" />
                <circle cx="45" cy="35" r="15" fill="#166534" />
                <circle cx="20" cy="15" r="12" fill="#22c55e" />
                <circle cx="40" cy="15" r="12" fill="#22c55e" />
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

                {/* Background Cars for safe/future lanes */}
                {!isPassed && laneIndex !== crashLane && (
                  <BackgroundCars laneIndex={laneIndex} currentLane={currentLane} />
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

        {/* Finish Sidewalk */}
        <div className="relative flex w-[600px] flex-col items-center justify-center border-l-4 border-white/10 bg-[#252833]">
          <div className="absolute top-10 flex flex-col items-center gap-4 opacity-10">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 w-4 bg-white rounded-full"></div>
            ))}
          </div>
        </div>

        {/* The Chicken */}
        {/* currentLane = 0 means left = 48 (center of sidewalk). currentLane = 1 means left = 96 + 48 = 144, etc. */}
        <motion.div
          className="pointer-events-none absolute top-[45%] z-40"
          initial={false}
          animate={{ left: currentLane * 96 + 48 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{ x: '-50%', y: '-50%' }}
        >
          <img 
            src={`/games/chicken-road/${chickenHit ? 'chicken_hit.png' : 'chicken_idle.png'}`} 
            alt="Chicken"
            className="h-24 w-24 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
            onError={(e) => {
              // Placeholder if image is missing
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = `<div class="h-24 w-24 rounded-full ${chickenHit ? 'bg-red-500' : 'bg-yellow-400'} flex items-center justify-center font-bold text-black">${chickenHit ? 'X' : 'C'}</div>`;
            }}
          />
        </motion.div>
      </div>
    </div>

    {/* Win Notification */}
      {state === 'cashed' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-green-500/20 to-green-600/10 border border-green-500/30 p-8 shadow-[0_0_50px_rgba(34,197,94,0.3)] backdrop-blur-md"
          >
            <div className="text-4xl font-black text-green-400 drop-shadow-[0_2px_10px_rgba(34,197,94,0.8)] mb-2">WIN</div>
            <div className="text-xl font-bold text-white">Вы успешно забрали ставку!</div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// Background car animation for safe/future lanes
function BackgroundCars({ laneIndex, currentLane }: { laneIndex: number; currentLane: number }) {
  const canSpawn = laneIndex > currentLane + 1 || (currentLane === 0 && laneIndex > 0);
  const [driving, setDriving] = useState(canSpawn);

  const [carState, setCarState] = useState({
    id: 1,
    img: CAR_IMAGES[Math.floor(Math.random() * CAR_IMAGES.length)],
    speed: 0.6 + Math.random() * 1.2,
    delay: Math.random() * 3 // random initial and between-car gaps
  });

  useEffect(() => {
    if (canSpawn && !driving) setDriving(true);
  }, [canSpawn, driving]);

  if (!driving) return null;

  return (
    <motion.div
      key={carState.id}
      className="absolute z-30 flex justify-center w-full left-0"
      initial={{ top: '-40%' }}
      animate={{ top: '150%' }}
      transition={{ duration: carState.speed, delay: carState.id === 1 ? carState.delay : Math.random() * 2, ease: 'linear' }}
      onAnimationComplete={() => {
        if (!canSpawn) {
          setDriving(false);
          return;
        }
        setCarState(prev => ({
          id: prev.id + 1,
          img: CAR_IMAGES[Math.floor(Math.random() * CAR_IMAGES.length)],
          speed: 0.6 + Math.random() * 1.2,
          delay: 0,
        }));
      }}
    >
      <img 
        src={`/games/chicken-road/${carState.img}`} 
        className="h-32 w-20 object-contain rotate-180 drop-shadow-lg"
        alt="Car"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement!.innerHTML = `<div class="h-32 w-20 bg-blue-500 rounded-md"></div>`;
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
      className="absolute z-50 flex justify-center w-full left-0"
      initial={{ top: '-40%', y: '-50%' }}
      animate={controls}
    >
      <img 
        src={`/games/chicken-road/${carImg}`} 
        className="h-32 w-20 object-contain opacity-90 drop-shadow-2xl rotate-180"
        alt="Killer Car"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement!.innerHTML = `<div class="h-32 w-20 bg-red-600 rounded-md shadow-xl"></div>`;
        }}
      />
    </motion.div>
  );
}

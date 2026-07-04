import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';
import type { KenoPhase } from './keno-bet-panel';

interface KenoBoardProps {
  picks: number[];
  onTogglePick: (num: number) => void;
  drawnNumbers: number[];
  phase: KenoPhase;
  maxPick: number;
}

export function KenoBoard({
  picks,
  onTogglePick,
  drawnNumbers,
  phase,
  maxPick,
}: KenoBoardProps) {
  // Grid is 5 rows x 8 columns = 40 numbers
  const cells = Array.from({ length: 40 }, (_, i) => i + 1);

  const handleCellClick = (num: number) => {
    if (phase !== 'idle') return;
    
    // Prevent adding if max is reached, unless deselecting
    if (!picks.includes(num) && picks.length >= maxPick) {
      soundManager.play('error'); // optional
      return;
    }

    soundManager.play('tick');
    onTogglePick(num);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="grid grid-cols-8 gap-2 sm:gap-3 w-full max-w-2xl aspect-[8/5]">
        {cells.map((num) => {
          const isPicked = picks.includes(num);
          const isDrawn = drawnNumbers.includes(num);
          const isHit = isPicked && isDrawn;
          const isMiss = isPicked && !isDrawn && phase === 'revealing' && drawnNumbers.length === 10;
          
          return (
            <motion.button
              key={num}
              onClick={() => handleCellClick(num)}
              disabled={phase !== 'idle'}
              layout
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
                delay: num * 0.01,
              }}
              className={cn(
                'relative flex items-center justify-center rounded-lg sm:rounded-xl text-sm sm:text-lg font-bold transition-all duration-300',
                'border-2 overflow-hidden shadow-lg',
                // Base styling
                !isPicked && !isDrawn && 'bg-black/40 border-white/5 text-white/40 hover:bg-white/5 hover:text-white/60',
                // Picked but not yet revealed
                isPicked && !isDrawn && 'bg-primary/20 border-primary/50 text-primary shadow-primary/20',
                // Drawn but not picked (House number)
                !isPicked && isDrawn && 'bg-white/10 border-white/20 text-white shadow-white/10',
                // Hit (Picked and Drawn) - Bright neon effect
                isHit && 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)] z-10',
                // Missed (Picked but not Drawn, shown at end)
                isMiss && 'bg-black/60 border-destructive/30 text-destructive/50 opacity-50'
              )}
            >
              {/* Hit animation ripple */}
              <AnimatePresence>
                {isHit && (
                  <motion.div
                    className="absolute inset-0 bg-emerald-400/30 rounded-lg sm:rounded-xl"
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
              
              {/* Drawn animation ring */}
              <AnimatePresence>
                {isDrawn && !isHit && (
                  <motion.div
                    className="absolute inset-0 border-2 border-white/30 rounded-lg sm:rounded-xl"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </AnimatePresence>

              <span className="relative z-10">{num}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';
import type { KenoPhase } from './keno-bet-panel';

interface KenoBoardProps {
  picks: number[];
  onTogglePick: (num: number) => void;
  drawnNumbers: number[];
  lastDrawnNumber?: number | null;
  phase: KenoPhase;
  maxPick: number;
}

export function KenoBoard({
  picks,
  onTogglePick,
  drawnNumbers,
  lastDrawnNumber,
  phase,
  maxPick,
}: KenoBoardProps) {
  // Grid is 5 rows x 8 columns = 40 numbers
  const cells = Array.from({ length: 40 }, (_, i) => i + 1);

  const handleCellClick = (num: number) => {
    if (phase !== 'idle') return;
    
    // Prevent adding if max is reached, unless deselecting
    if (!picks.includes(num) && picks.length >= maxPick) {
      soundManager.play('error');
      return;
    }

    soundManager.play('tick');
    onTogglePick(num);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center py-2 px-2 sm:px-4 lg:px-8">
      <div className="grid grid-cols-8 gap-1.5 sm:gap-2.5 w-full max-w-[850px] aspect-[8/5]">
        {cells.map((num) => {
          const isPicked = picks.includes(num);
          const isDrawn = drawnNumbers.includes(num);
          const isHit = isPicked && isDrawn;
          const isJustDrawn = lastDrawnNumber === num;
          const isMiss = isPicked && !isDrawn && phase === 'revealing' && drawnNumbers.length >= 7;
          
          return (
            <motion.button
              key={num}
              onClick={() => handleCellClick(num)}
              disabled={phase !== 'idle'}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={
                isJustDrawn
                  ? { scale: [1, 1.22, 1], filter: ['brightness(2)', 'brightness(1)'] }
                  : { scale: 1, opacity: 1, filter: 'brightness(1)' }
              }
              whileHover={{ scale: phase === 'idle' ? 1.06 : 1, y: phase === 'idle' ? -2 : 0 }}
              whileTap={{ scale: 0.95, y: 1 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
                delay: isJustDrawn ? 0 : num * 0.005,
              }}
              className={cn(
                'relative flex items-center justify-center rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all duration-300',
                'border overflow-hidden select-none',
                // Base styling (Unpicked, Undrawn) - 3D dark glass cube
                !isPicked && !isDrawn && 'bg-white/[0.04] border-white/10 text-white/40 shadow-inner hover:text-white/90 hover:bg-white/[0.08] hover:border-white/20',
                // Picked but not yet revealed - 3D blue/primary cube
                isPicked && !isDrawn && 'bg-gradient-to-b from-primary/50 to-primary/20 border-primary/60 border-t-primary/90 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]',
                // Drawn but not picked (House ball) - Warm amber glow
                !isPicked && isDrawn && 'bg-gradient-to-b from-amber-500/30 to-amber-900/40 border-amber-400/50 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.4)]',
                // Hit (Picked and Drawn) - Spectacular Glowing Emerald Cube
                isHit && 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 border-emerald-300 text-white shadow-[inset_0px_2px_4px_rgba(255,255,255,0.6),_0_0_25px_rgba(52,211,153,0.9)] z-10',
                // Missed (Picked but not Drawn)
                isMiss && 'bg-destructive/20 border-destructive/30 text-white/30 opacity-50'
              )}
            >
              {/* Hit animation ripple & particle ring */}
              <AnimatePresence>
                {isHit && (
                  <motion.div
                    className="absolute inset-0 bg-emerald-400/40 rounded-lg sm:rounded-xl pointer-events-none"
                    initial={{ scale: 0.6, opacity: 1 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
              
              {/* Drawn animation ring */}
              <AnimatePresence>
                {isDrawn && !isHit && (
                  <motion.div
                    className="absolute inset-0 border-2 border-amber-400/60 rounded-lg sm:rounded-xl pointer-events-none"
                    initial={{ scale: 0.5, opacity: 1 }}
                    animate={{ scale: 1.2, opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  />
                )}
              </AnimatePresence>

              <span className="relative z-10 font-mono tracking-tight">{num}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

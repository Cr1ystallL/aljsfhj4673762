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
    <div className="w-full h-full flex flex-col items-center justify-center py-2 px-4">
      <div className="grid grid-cols-8 gap-1.5 sm:gap-2 w-full max-w-[600px] aspect-[8/5]">
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
              whileHover={{ scale: phase === 'idle' ? 1.05 : 1, y: phase === 'idle' ? -2 : 0 }}
              whileTap={{ scale: 0.95, y: 2 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
                delay: num * 0.005,
              }}
              className={cn(
                'relative flex items-center justify-center rounded-md sm:rounded-lg text-sm sm:text-base font-bold transition-all duration-200',
                'border overflow-hidden',
                // Base styling (Unpicked, Undrawn) - 3D dark cube
                !isPicked && !isDrawn && 'bg-gradient-to-b from-white/10 to-transparent border-white/5 border-t-white/20 text-white/40 shadow-[inset_0px_1px_1px_rgba(255,255,255,0.1),_0px_4px_6px_rgba(0,0,0,0.4)] hover:text-white/80 hover:from-white/15',
                // Picked but not yet revealed - 3D blue/primary cube
                isPicked && !isDrawn && 'bg-gradient-to-b from-primary/40 to-primary/10 border-primary/40 border-t-primary/70 text-primary-foreground shadow-[inset_0px_1px_2px_rgba(255,255,255,0.3),_0px_4px_10px_rgba(var(--primary),0.3)]',
                // Drawn but not picked (House number) - Flat grayish
                !isPicked && isDrawn && 'bg-white/15 border-white/20 text-white/90 shadow-inner opacity-80',
                // Hit (Picked and Drawn) - 3D glowing neon green cube
                isHit && 'bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-300 text-white shadow-[inset_0px_2px_4px_rgba(255,255,255,0.5),_0px_0px_15px_rgba(52,211,153,0.8)] z-10',
                // Missed (Picked but not Drawn) - Darkened red
                isMiss && 'bg-gradient-to-b from-destructive/40 to-black/60 border-destructive/30 text-white/50 shadow-inner opacity-60'
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

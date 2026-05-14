'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameSelect: (game: string) => void;
}

/**
 * Menu Drawer — Monopo Saigon Style
 *
 * Slide-in panel from the left holding the available games. Each row is
 * a frosted-glass tile with a minimal outlined icon and the game name in
 * Roobert. No emoji, no rainbow tints — the tile uses the same deep
 * ocean atmospherics as the rest of the brand.
 */
const games: Array<{ id: GameKey; name: string }> = [
  { id: 'crash', name: 'Crash' },
  { id: 'mines', name: 'Mines' },
];

export function MenuDrawer({ isOpen, onClose, onGameSelect }: MenuDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="fixed inset-0 z-40 bg-midnight-canvas/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Drawer */}
          <motion.aside
            className="fixed left-0 top-0 bottom-0 z-50 w-[320px] max-w-[85vw] pt-safe pb-safe"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div
              className="h-full border-r border-white/10 backdrop-blur-2xl flex flex-col"
              style={{ background: 'rgba(0, 0, 0, 0.78)' }}
            >
              {/* Atmospheric glow at the bottom — restrained, just the brand */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-64 opacity-40"
                style={{
                  background:
                    'radial-gradient(80% 60% at 30% 100%, rgba(160, 224, 171, 0.18) 0%, rgba(255, 172, 46, 0.10) 45%, transparent 80%)',
                }}
              />

              {/* Header */}
              <div className="relative flex items-center justify-between px-5 py-5 border-b border-white/10">
                <span className="font-roobert text-frost-white text-[20px] font-normal leading-none">
                  Игры
                </span>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="w-8 h-8 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              </div>

              {/* Games list */}
              <div className="relative flex-1 overflow-y-auto px-3 py-4 space-y-2 scrollbar-hide">
                {games.map((game, index) => (
                  <motion.button
                    key={game.id}
                    onClick={() => {
                      onGameSelect(game.id);
                      onClose();
                    }}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04 }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full text-left rounded-card border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/20 transition-colors px-4 py-3 flex items-center gap-3"
                  >
                    <span className="w-10 h-10 rounded-card border border-white/10 bg-white/[0.04] flex items-center justify-center shrink-0">
                      <GameIcon game={game.id} size={18} strokeWidth={1.6} />
                    </span>
                    <span className="font-roobert text-[15px] text-frost-white">
                      {game.name}
                    </span>
                  </motion.button>
                ))}
              </div>

              {/* Footer */}
              <div className="relative px-5 py-4 border-t border-white/10">
                <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
                  Macvbet · monopo saigon
                </span>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

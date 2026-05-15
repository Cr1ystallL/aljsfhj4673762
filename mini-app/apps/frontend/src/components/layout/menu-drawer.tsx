'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';
import { BrandLockup, BrandWordmark } from '@/components/ui/brand-mark';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameSelect: (game: string) => void;
}

/**
 * Menu Drawer — Monopo Saigon Style
 *
 * Atmospheric, sculptural panel that slides in from the left. Background
 * is Midnight Canvas with two slow-drifting orbs of the Deep Ocean
 * gradient — depth without box-shadows, exactly as the brand reference
 * prescribes. Content sits on a frosted glass plane so the orbs read as
 * volumetric atmosphere rather than flat colour.
 *
 * Composition follows the brand's typographic rhythm:
 *
 *   - HEADER  → the BrandWordmark (SVG "M" + "acvbet"), close button
 *   - SECTION → caption "ИГРЫ" in Whisper Gray, hairline divider
 *   - LIST    → ghost rows with outlined icon, name, trailing arrow.
 *               No filled tiles, no rainbow accents — text-first.
 *   - FOOTER  → BrandLockup centred (sigil over caption)
 *
 * No emoji, no harsh box shadows. Pill radii 75.024px on the close
 * button, card radii 10px on the rows, generous element gap.
 */

const games: Array<{ id: GameKey; name: string; subtitle: string }> = [
  { id: 'crash', name: 'Crash', subtitle: 'Кривая до краха' },
  { id: 'mines', name: 'Mines', subtitle: 'Поле 5×5' },
  { id: 'plinko', name: 'Plinko', subtitle: 'Шар сквозь штифты' },
  { id: 'coinflip', name: 'Coinflip', subtitle: 'Орёл или решка' },
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
            className="fixed inset-0 z-40 bg-midnight-canvas/85 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Drawer */}
          <motion.aside
            className="fixed left-0 top-0 bottom-0 z-50 w-[340px] max-w-[88vw] pt-safe pb-safe"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div
              className="relative h-full overflow-hidden border-r border-white/10 backdrop-blur-2xl flex flex-col"
              style={{ background: 'rgba(0, 0, 0, 0.82)' }}
            >
              {/* Atmospheric orbs — gradient depth, no box-shadow */}
              <motion.div
                className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(160, 224, 171, 0.22) 0%, transparent 70%)',
                  filter: 'blur(50px)',
                }}
                animate={{ x: [0, 24, 0], y: [0, 18, 0] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(255, 172, 46, 0.20) 0%, rgba(165, 45, 37, 0.12) 50%, transparent 80%)',
                  filter: 'blur(60px)',
                }}
                animate={{ x: [0, -20, 0], y: [0, -22, 0] }}
                transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Header */}
              <div className="relative flex items-center justify-between px-6 pt-6 pb-5">
                <BrandWordmark size={56} />
                <button
                  onClick={onClose}
                  aria-label="Закрыть"
                  className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
              </div>

              <div className="relative h-px mx-6 bg-white/10" />

              {/* Section caption */}
              <div className="relative px-6 pt-5 pb-3">
                <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
                  Игры
                </span>
              </div>

              {/* Games list */}
              <div className="relative flex-1 overflow-y-auto px-3 pb-4 scrollbar-hide">
                <ul className="flex flex-col">
                  {games.map((game, index) => (
                    <motion.li
                      key={game.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04, duration: 0.3 }}
                    >
                      <button
                        onClick={() => {
                          onGameSelect(game.id);
                          onClose();
                        }}
                        className="group w-full text-left rounded-card px-3 py-3.5 flex items-center gap-4 hover:bg-white/[0.04] transition-colors"
                      >
                        {/* Outlined glyph — no filled tile, monochrome */}
                        <span className="w-9 h-9 flex items-center justify-center shrink-0">
                          <GameIcon
                            game={game.id}
                            size={22}
                            strokeWidth={1.5}
                            className="text-frost-white/85 group-hover:text-frost-white transition-colors"
                          />
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="font-roobert text-[18px] leading-tight text-frost-white">
                            {game.name}
                          </div>
                          <div className="mt-1 font-roobert text-[11px] tracking-[0.04em] text-whisper-gray">
                            {game.subtitle}
                          </div>
                        </div>

                        <ArrowUpRight
                          size={16}
                          strokeWidth={1.5}
                          className="text-frost-white/40 group-hover:text-frost-white/85 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                        />
                      </button>

                      {index < games.length - 1 && (
                        <div className="mx-3 h-px bg-white/[0.06]" />
                      )}
                    </motion.li>
                  ))}
                </ul>
              </div>

              {/* Footer — brand lockup, centred */}
              <div className="relative h-px mx-6 bg-white/10" />
              <div className="relative px-6 py-6 flex items-center justify-center">
                <BrandLockup size={80} />
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

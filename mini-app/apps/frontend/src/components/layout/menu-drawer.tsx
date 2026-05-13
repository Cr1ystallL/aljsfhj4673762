'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameSelect: (game: string) => void;
}

const games = [
  { id: 'crash', name: 'Crash', icon: '🚀' },
  { id: 'plinko', name: 'Plinko', icon: '🎯' },
  { id: 'mines', name: 'Mines', icon: '💣' },
  { id: 'cookies', name: 'Cookies', icon: '🍪' },
  { id: 'nuts', name: 'Nuts', icon: '🥜' },
  { id: 'keno', name: 'Keno', icon: '🎱' },
  { id: 'coinflip', name: 'Coinflip', icon: '🪙' },
];

/**
 * Animated menu drawer with game list
 * Slides in from left with glass morphism
 */
export function MenuDrawer({ isOpen, onClose, onGameSelect }: MenuDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          
          {/* Drawer */}
          <motion.div
            className="fixed left-0 top-0 bottom-0 w-80 z-50 pt-safe pb-safe"
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="h-full glass border-r border-white/10 flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white">Games</h2>
                <motion.button
                  onClick={onClose}
                  className="text-white/60 hover:text-white transition-colors"
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={24} />
                </motion.button>
              </div>
              
              {/* Game List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {games.map((game, index) => (
                  <motion.div
                    key={game.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <GlassCard
                      onClick={() => {
                        onGameSelect(game.id);
                        onClose();
                      }}
                      className="cursor-pointer hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-4 p-4">
                        <span className="text-3xl">{game.icon}</span>
                        <span className="text-lg font-medium text-white">
                          {game.name}
                        </span>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

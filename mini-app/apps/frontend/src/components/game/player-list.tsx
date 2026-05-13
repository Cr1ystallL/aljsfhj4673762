'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { User, Crown } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { Body, Caption } from '@/components/ui/typography';
import type { PlayerState } from '@/lib/game-engine/types';

/**
 * Player List Component
 * Shows active players in multiplayer games
 * 
 * Features:
 * - Real-time player updates
 * - Bet amounts display
 * - Current player highlight
 * - Smooth animations
 */

interface PlayerListProps {
  players: PlayerState[];
  currentUserId?: string;
  maxDisplay?: number;
}

export function PlayerList({ players, currentUserId, maxDisplay = 10 }: PlayerListProps) {
  const displayPlayers = players.slice(0, maxDisplay);
  const remainingCount = Math.max(0, players.length - maxDisplay);

  if (players.length === 0) {
    return (
      <GlassCard className="p-4">
        <Caption className="text-center text-white/40">
          No players yet
        </Caption>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <Caption className="text-white/60">
          Players ({players.length})
        </Caption>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {displayPlayers.map((player, index) => (
            <motion.div
              key={player.userId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: index * 0.05 }}
            >
              <div
                className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                  player.userId === currentUserId
                    ? 'bg-white/10'
                    : 'bg-white/5 hover:bg-white/8'
                }`}
              >
                {/* Avatar */}
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  {index === 0 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                      <Crown className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Body className="text-sm truncate">
                    {player.userId === currentUserId ? 'You' : `Player ${player.userId.substring(0, 6)}`}
                  </Body>
                  {player.bet && (
                    <Caption className="text-white/40">
                      ${player.bet.amount.toFixed(2)}
                      {player.bet.multiplier && ` @ ${player.bet.multiplier.toFixed(2)}x`}
                    </Caption>
                  )}
                </div>

                {/* Status */}
                {player.bet && (
                  <div
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      player.bet.state === 'won'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : player.bet.state === 'lost'
                        ? 'bg-red-500/20 text-red-400'
                        : player.bet.state === 'active'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {player.bet.state === 'won' && player.bet.payout
                      ? `+$${player.bet.payout.toFixed(2)}`
                      : player.bet.state === 'lost'
                      ? 'Lost'
                      : player.bet.state === 'active'
                      ? 'Active'
                      : player.bet.state}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {remainingCount > 0 && (
          <Caption className="text-center text-white/40 pt-2">
            +{remainingCount} more player{remainingCount > 1 ? 's' : ''}
          </Caption>
        )}
      </div>
    </GlassCard>
  );
}

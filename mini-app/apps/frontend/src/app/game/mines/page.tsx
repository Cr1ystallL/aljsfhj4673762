'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bomb, Gem, DollarSign } from 'lucide-react';
import { GameHeader } from '@/components/game/game-header';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { H3, Body, Caption } from '@/components/ui/typography';
import { DemoModeToggle } from '@/components/ui/demo-mode-toggle';
import { useBalance } from '@/hooks/use-balance';
import { useDemoMode } from '@/store/demo-mode-store';
import { MinesGameClient } from '@/lib/games/mines/mines-client';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Mines Game Page - Production Implementation
 * 
 * FEATURES:
 * - Clean minimal grid
 * - Progressive tension UX
 * - Smooth reveal animations
 * - Multiplier progression
 * - Cashout flow
 */

export default function MinesGamePage() {
  const { balance } = useBalance();
  const { isDemoMode, setActiveBet } = useDemoMode();
  const [client] = useState(() => new MinesGameClient('mines_main'));
  
  const [betAmount, setBetAmount] = useState(1);
  const [mineCount, setMineCount] = useState(3);
  const [isActive, setIsActive] = useState(false);
  const [revealedTiles, setRevealedTiles] = useState<Set<number>>(new Set());
  const [multiplier, setMultiplier] = useState(1.0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [minePositions, setMinePositions] = useState<number[]>([]);
  const [isRevealing, setIsRevealing] = useState(false);

  useEffect(() => {
    soundManager.initialize();
  }, []);

  useEffect(() => {
    client.on('game:started', () => {
      setIsActive(true);
      setRevealedTiles(new Set());
      setMultiplier(1.0);
      setGameOver(false);
      setWon(false);
      setMinePositions([]);
      setActiveBet(true);
    });

    client.on('tile:revealed', (data: any) => {
      setRevealedTiles(new Set(client.getMinesVisualState().revealedTiles));
      setMultiplier(data.currentMultiplier);
      setIsRevealing(false);

      if (data.isMine) {
        soundManager.play('game.lose');
      } else {
        soundManager.play('ui.click');
      }
    });

    client.on('game:lost', (data: any) => {
      setGameOver(true);
      setWon(false);
      setMinePositions(data.minePositions);
      setIsActive(false);
      setActiveBet(false);
    });

    client.on('game:cashout', (data: any) => {
      setGameOver(true);
      setWon(true);
      setMinePositions(data.minePositions);
      setIsActive(false);
      setActiveBet(false);
      soundManager.play('game.win');
    });

    return () => {
      client.removeAllListeners();
      client.destroy();
    };
  }, [client, setActiveBet]);

  const handleStartGame = async () => {
    try {
      const response = await fetch('/api/games/mines/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: betAmount,
          mineCount,
          demoMode: isDemoMode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start game');
      }

      client.emit('start:requested', { mineCount });
      soundManager.play('ui.click');
    } catch (error) {
      console.error('Start game failed:', error);
    }
  };

  const handleTileClick = async (position: number) => {
    if (!isActive || isRevealing || revealedTiles.has(position) || gameOver) {
      return;
    }

    try {
      setIsRevealing(true);
      
      const response = await fetch('/api/games/mines/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ position }),
      });

      if (!response.ok) {
        throw new Error('Failed to reveal tile');
      }

      client.revealTile(position);
    } catch (error) {
      console.error('Reveal failed:', error);
      setIsRevealing(false);
    }
  };

  const handleCashout = async () => {
    if (!isActive || revealedTiles.size === 0) {
      return;
    }

    try {
      const response = await fetch('/api/games/mines/cashout', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to cashout');
      }

      client.requestCashout();
    } catch (error) {
      console.error('Cashout failed:', error);
    }
  };

  const handleNewGame = () => {
    client.reset();
    setIsActive(false);
    setRevealedTiles(new Set());
    setMultiplier(1.0);
    setGameOver(false);
    setWon(false);
    setMinePositions([]);
  };

  const getTileContent = (position: number) => {
    if (gameOver && minePositions.includes(position)) {
      return <Bomb className="h-6 w-6 text-red-400" />;
    }

    if (revealedTiles.has(position)) {
      return <Gem className="h-6 w-6 text-emerald-400" />;
    }

    return null;
  };

  const getTileColor = (position: number) => {
    if (gameOver && minePositions.includes(position)) {
      return 'bg-red-500/20 border-red-500/40';
    }

    if (revealedTiles.has(position)) {
      return 'bg-emerald-500/20 border-emerald-500/40';
    }

    return 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20';
  };

  return (
    <div className="min-h-screen pb-32 pt-safe px-safe bg-gradient-to-b from-black via-gray-900 to-black">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <GameHeader title="Mines" />
          <DemoModeToggle />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Main Game Area */}
          <div className="lg:col-span-2">
            <GlassCard className="p-6">
              {/* Stats */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <Caption className="text-white/60">Multiplier</Caption>
                  <H3 className="text-emerald-400">{multiplier.toFixed(2)}x</H3>
                </div>
                <div className="text-right">
                  <Caption className="text-white/60">Potential Win</Caption>
                  <H3 className="text-white">${(betAmount * multiplier).toFixed(2)}</H3>
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-5 gap-2 mb-6">
                {Array.from({ length: 25 }, (_, i) => (
                  <motion.button
                    key={i}
                    onClick={() => handleTileClick(i)}
                    disabled={!isActive || isRevealing || gameOver}
                    whileHover={{ scale: isActive && !gameOver ? 1.05 : 1 }}
                    whileTap={{ scale: isActive && !gameOver ? 0.95 : 1 }}
                    className={`aspect-square rounded-lg border-2 flex items-center justify-center transition-all ${getTileColor(
                      i
                    )} ${!isActive || gameOver ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <AnimatePresence mode="wait">
                      {getTileContent(i) && (
                        <motion.div
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, rotate: 180 }}
                        >
                          {getTileContent(i)}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                ))}
              </div>

              {/* Actions */}
              {isActive && !gameOver && (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleCashout}
                  disabled={revealedTiles.size === 0}
                  className="w-full bg-emerald-500 hover:bg-emerald-600"
                >
                  Cashout ${(betAmount * multiplier).toFixed(2)}
                </Button>
              )}

              {gameOver && (
                <div className="text-center">
                  <H3 className={won ? 'text-emerald-400' : 'text-red-400'}>
                    {won ? `Won $${(betAmount * multiplier).toFixed(2)}!` : 'Game Over'}
                  </H3>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleNewGame}
                    className="mt-4"
                  >
                    New Game
                  </Button>
                </div>
              )}
            </GlassCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {!isActive && !gameOver && (
              <>
                {/* Bet Amount */}
                <GlassCard className="p-6">
                  <Caption className="text-white/60 mb-3">Bet Amount</Caption>
                  <div className="flex items-center gap-2 mb-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setBetAmount((prev) => Math.max(0.1, prev / 2))}
                    >
                      ÷2
                    </Button>
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0.1)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-center text-white"
                      step={0.1}
                      min={0.1}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setBetAmount((prev) => Math.min(1000, prev * 2))}
                    >
                      ×2
                    </Button>
                  </div>
                </GlassCard>

                {/* Mine Count */}
                <GlassCard className="p-6">
                  <Caption className="text-white/60 mb-3">Mines</Caption>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 5, 10, 15, 20, 24].map((count) => (
                      <Button
                        key={count}
                        variant={mineCount === count ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setMineCount(count)}
                      >
                        {count}
                      </Button>
                    ))}
                  </div>
                </GlassCard>

                {/* Start Button */}
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleStartGame}
                  className="w-full"
                >
                  Start Game
                </Button>
              </>
            )}

            {/* Game Info */}
            <GlassCard className="p-6">
              <Caption className="text-white/60 mb-2">Game Info</Caption>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Mines:</span>
                  <span className="text-white">{mineCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Revealed:</span>
                  <span className="text-white">{revealedTiles.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Safe Tiles:</span>
                  <span className="text-white">{25 - mineCount - revealedTiles.size}</span>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}

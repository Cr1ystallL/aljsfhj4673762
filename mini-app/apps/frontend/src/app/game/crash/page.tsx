'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Rocket, TrendingUp } from 'lucide-react';
import { GameHeader } from '@/components/game/game-header';
import { BetControls } from '@/components/game/bet-controls';
import { GlassCard } from '@/components/ui/glass-card';
import { H1, H3, Body, Caption } from '@/components/ui/typography';
import { Button } from '@/components/ui/button';
import { DemoModeToggle } from '@/components/ui/demo-mode-toggle';
import { useBalance } from '@/hooks/use-balance';
import { useDemoMode } from '@/store/demo-mode-store';
import { CrashGameClient } from '@/lib/games/crash/crash-client';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Crash Game Page - Compact Mobile-First Design
 * 
 * FEATURES:
 * - Everything fits on one screen (no scrolling needed)
 * - Compact layout optimized for mobile
 * - Premium animations and effects
 */

export default function CrashGamePage() {
  const router = useRouter();
  const { balance } = useBalance();
  const { isDemoMode, setActiveBet } = useDemoMode();
  const [client] = useState(() => new CrashGameClient('crash_main'));
  
  const [multiplier, setMultiplier] = useState(1.0);
  const [phase, setPhase] = useState<'waiting' | 'countdown' | 'active' | 'crashed'>('waiting');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasBet, setHasBet] = useState(false);
  const [canCashout, setCanCashout] = useState(false);
  const [history, setHistory] = useState<Array<{ crashPoint: number }>>([]);
  const [graphPoints, setGraphPoints] = useState<Array<{ time: number; multiplier: number }>>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize sound
  useEffect(() => {
    soundManager.initialize();
  }, []);

  // Setup client event listeners
  useEffect(() => {
    client.on('phase:waiting', () => {
      setPhase('waiting');
      setHasBet(false);
      setCanCashout(false);
      setActiveBet(false);
    });

    client.on('phase:countdown', (data: any) => {
      setPhase('countdown');
      setCountdown(Math.ceil(data.duration / 1000));
      
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    });

    client.on('phase:active', () => {
      setPhase('active');
      setCountdown(null);
      if (hasBet) {
        setCanCashout(true);
      }
      soundManager.play('game.bet_placed');
    });

    client.on('display:update', (data: any) => {
      setMultiplier(data.multiplier);
      setGraphPoints(data.graphPoints);
    });

    client.on('game:crashed', (data: any) => {
      setPhase('crashed');
      setMultiplier(data.crashPoint);
      setCanCashout(false);
      soundManager.play('game.lose');
    });

    client.on('round:completed', (data: any) => {
      setHistory((prev) => [{ crashPoint: data.crashPoint }, ...prev.slice(0, 49)]);
    });

    client.on('player:cashout', (data: any) => {
      if (data.userId === 'current_user') {
        setCanCashout(false);
        setActiveBet(false);
        soundManager.play('game.cashout');
      }
    });

    return () => {
      client.removeAllListeners();
      client.destroy();
    };
  }, [client, hasBet, setActiveBet]);

  // Render graph with premium effects
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || graphPoints.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear with dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (rect.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    // Draw curve with glow effect
    if (graphPoints.length > 1) {
      const maxTime = graphPoints[graphPoints.length - 1].time;
      const maxMultiplier = Math.max(...graphPoints.map((p) => p.multiplier), 2);

      // Glow effect
      ctx.shadowBlur = 15;
      ctx.shadowColor = phase === 'crashed' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)';

      // Gradient for line
      const gradient = ctx.createLinearGradient(0, rect.height, 0, 0);
      if (phase === 'crashed') {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 1)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.4)');
      } else {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 1)');
        gradient.addColorStop(0.5, 'rgba(52, 211, 153, 1)');
        gradient.addColorStop(1, 'rgba(167, 243, 208, 1)');
      }
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      graphPoints.forEach((point, i) => {
        const x = (point.time / maxTime) * rect.width;
        const y = rect.height - ((point.multiplier - 1) / (maxMultiplier - 1)) * rect.height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Fill area under curve
      ctx.lineTo(rect.width, rect.height);
      ctx.lineTo(0, rect.height);
      ctx.closePath();
      
      const fillGradient = ctx.createLinearGradient(0, rect.height, 0, 0);
      if (phase === 'crashed') {
        fillGradient.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
        fillGradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      } else {
        fillGradient.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
        fillGradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
      }
      ctx.fillStyle = fillGradient;
      ctx.fill();
    }
  }, [graphPoints, phase]);

  const handleBet = async (amount: number) => {
    try {
      const response = await fetch('/api/games/crash/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount,
          demoMode: isDemoMode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to place bet');
      }

      setHasBet(true);
      setActiveBet(true);
      soundManager.play('ui.click');
    } catch (error) {
      console.error('Bet failed:', error);
    }
  };

  const handleCashout = async () => {
    if (!canCashout) return;
    
    try {
      const response = await fetch('/api/games/crash/cashout', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to cashout');
      }

      client.emit('cashout:requested', {});
    } catch (error) {
      console.error('Cashout failed:', error);
    }
  };

  const multiplierColor = useMemo(() => {
    if (phase === 'crashed') return 'text-red-500';
    if (multiplier >= 10) return 'text-purple-400';
    if (multiplier >= 5) return 'text-blue-400';
    if (multiplier >= 2) return 'text-emerald-400';
    return 'text-white';
  }, [multiplier, phase]);

  const multiplierGlow = useMemo(() => {
    if (phase === 'crashed') return 'drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]';
    if (multiplier >= 10) return 'drop-shadow-[0_0_20px_rgba(192,132,252,0.5)]';
    if (multiplier >= 5) return 'drop-shadow-[0_0_20px_rgba(96,165,250,0.5)]';
    if (multiplier >= 2) return 'drop-shadow-[0_0_20px_rgba(52,211,153,0.5)]';
    return 'drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]';
  }, [multiplier, phase]);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-black via-gray-900 to-black overflow-hidden">
      {/* Header - Compact */}
      <div className="flex items-center justify-between px-4 py-2 pt-safe">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-white" />
          <GameHeader title="Crash" />
        </div>
        <DemoModeToggle />
      </div>

      {/* Main Content - Fits on screen */}
      <div className="flex-1 flex flex-col px-3 pb-24 gap-2 overflow-hidden">
        {/* Multiplier Display - Compact */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5" />
          
          <div className="relative p-4 text-center">
            <AnimatePresence mode="wait">
              {phase === 'waiting' && (
                <motion.div
                  key="waiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-4"
                >
                  <div className="w-10 h-10 mx-auto rounded-full border-3 border-white/20 border-t-white/60 animate-spin mb-2" />
                  <p className="text-white/40 text-xs">Waiting...</p>
                </motion.div>
              )}

              {phase === 'countdown' && countdown !== null && (
                <motion.div
                  key="countdown"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.2, opacity: 0 }}
                  className="py-4"
                >
                  <p className="text-white/60 text-xs mb-1">Starting in</p>
                  <motion.div
                    key={countdown}
                    initial={{ scale: 1.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-6xl font-bold text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]"
                  >
                    {countdown}
                  </motion.div>
                </motion.div>
              )}

              {(phase === 'active' || phase === 'crashed') && (
                <motion.div
                  key="multiplier"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="py-4"
                >
                  <p className="text-white/60 text-xs mb-1">
                    {phase === 'crashed' ? (
                      <span className="flex items-center justify-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        Crashed
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1">
                        <Rocket className="w-4 h-4" />
                        Multiplier
                      </span>
                    )}
                  </p>
                  <motion.div
                    animate={{
                      scale: phase === 'active' ? [1, 1.02, 1] : 1,
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: phase === 'active' ? Infinity : 0,
                    }}
                    className={`text-6xl font-bold ${multiplierColor} ${multiplierGlow}`}
                  >
                    {multiplier.toFixed(2)}x
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cashout Button - Compact */}
            {canCashout && phase === 'active' && (
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mt-3"
              >
                <motion.button
                  onClick={handleCashout}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-base shadow-lg flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  Cashout ${((balance?.amount || 0) * multiplier).toFixed(2)}
                </motion.button>
              </motion.div>
            )}
          </div>
        </div>

        {/* Graph - Compact */}
        <div className="flex-1 rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl overflow-hidden min-h-0">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>

        {/* History - Compact */}
        <div className="rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-white/60" />
            <p className="text-white/60 text-xs">Recent</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.slice(0, 12).map((item, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  item.crashPoint >= 10
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                    : item.crashPoint >= 5
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : item.crashPoint >= 2
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white'
                    : 'bg-gradient-to-r from-red-500 to-orange-500 text-white'
                }`}
              >
                {item.crashPoint.toFixed(2)}x
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bet Controls - Compact */}
        {(phase === 'waiting' || phase === 'countdown') && !hasBet && (
          <div className="rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl">
            <BetControls
              minBet={0.1}
              maxBet={10000}
              balance={balance?.amount || 0}
              onBet={handleBet}
              disabled={phase === 'countdown'}
            />
          </div>
        )}

        {hasBet && (
          <div className="rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl p-3 text-center">
            <p className="text-white/60 text-xs mb-1">Your Bet</p>
            <p className="text-emerald-400 text-xl font-bold mb-1">$10.00</p>
            <p className="text-white/60 text-xs">
              {phase === 'waiting' || phase === 'countdown'
                ? 'Starting...'
                : phase === 'active'
                ? 'Cashout!'
                : 'Ended'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

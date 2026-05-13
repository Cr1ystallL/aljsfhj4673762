'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle } from 'lucide-react';
import { GameHeader } from '@/components/game/game-header';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { H3, Body, Caption } from '@/components/ui/typography';
import { DemoModeToggle } from '@/components/ui/demo-mode-toggle';
import { useBalance } from '@/hooks/use-balance';
import { useDemoMode } from '@/store/demo-mode-store';
import { PlinkoGameClient } from '@/lib/games/plinko/plinko-client';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Plinko Game Page - Production Implementation
 * 
 * FEATURES:
 * - Elegant ball physics
 * - Smooth animations
 * - Multiple risk levels
 * - Cinematic visualization
 */

const MULTIPLIERS = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};

export default function PlinkoGamePage() {
  const { balance } = useBalance();
  const { isDemoMode } = useDemoMode();
  const [client] = useState(() => new PlinkoGameClient('plinko_main'));
  
  const [betAmount, setBetAmount] = useState(1);
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [activeBalls, setActiveBalls] = useState<Map<string, any>>(new Map());
  const [history, setHistory] = useState<Array<{ multiplier: number; payout: number }>>([]);
  const [isDropping, setIsDropping] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    soundManager.initialize();
  }, []);

  useEffect(() => {
    client.on('ball:dropped', () => {
      setIsDropping(true);
      soundManager.play('ui.click');
    });

    client.on('ball:pin_collision', (data: any) => {
      // Update ball positions
      setActiveBalls(new Map(client.getPlinkoVisualState().activeBalls));
    });

    client.on('ball:landed', (data: any) => {
      setIsDropping(false);
      setHistory(client.getHistory());
      
      if (data.multiplier >= 10) {
        soundManager.play('game.win');
      } else if (data.multiplier < 1) {
        soundManager.play('game.lose');
      } else {
        soundManager.play('game.cashout');
      }
    });

    return () => {
      client.removeAllListeners();
      client.destroy();
    };
  }, [client]);

  // Render plinko board
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);

    const rows = 16;
    const pinRadius = 3;
    const spacing = rect.width / (rows + 2);

    // Draw pins
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let row = 0; row < rows; row++) {
      const pinsInRow = row + 1;
      const rowY = (row / rows) * rect.height;

      for (let pin = 0; pin < pinsInRow; pin++) {
        const pinX = (rect.width / 2) - ((pinsInRow - 1) * spacing / 2) + (pin * spacing);
        
        ctx.beginPath();
        ctx.arc(pinX, rowY, pinRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw buckets
    const bucketWidth = rect.width / 17;
    const bucketY = rect.height - 40;
    const multipliers = MULTIPLIERS[riskLevel];

    multipliers.forEach((mult, i) => {
      const x = i * bucketWidth;
      
      // Bucket color based on multiplier
      let color = 'rgba(255, 255, 255, 0.1)';
      if (mult >= 10) color = 'rgba(16, 185, 129, 0.2)';
      else if (mult >= 2) color = 'rgba(59, 130, 246, 0.2)';
      else if (mult < 1) color = 'rgba(239, 68, 68, 0.2)';

      ctx.fillStyle = color;
      ctx.fillRect(x, bucketY, bucketWidth - 2, 40);

      // Multiplier text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${mult}x`, x + bucketWidth / 2, bucketY + 25);
    });

    // Draw active balls
    activeBalls.forEach((ball) => {
      const ballX = ball.position.x * rect.width;
      const ballY = ball.position.y * rect.height;

      const gradient = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, 8);
      gradient.addColorStop(0, 'rgba(16, 185, 129, 1)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.3)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(ballX, ballY, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [activeBalls, riskLevel]);

  const handleDrop = async () => {
    if (isDropping) return;
    
    try {
      const response = await fetch('/api/games/plinko/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: betAmount,
          riskLevel,
          demoMode: isDemoMode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to drop ball');
      }

      client.emit('drop:requested', { betAmount, riskLevel });
    } catch (error) {
      console.error('Drop failed:', error);
    }
  };

  return (
    <div className="min-h-screen pb-32 pt-safe px-safe bg-gradient-to-b from-black via-gray-900 to-black">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <GameHeader title="Plinko" />
          <DemoModeToggle />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Main Game Area */}
          <div className="lg:col-span-2">
            <GlassCard className="p-6">
              <canvas
                ref={canvasRef}
                className="w-full h-[600px] rounded-lg"
                style={{ imageRendering: 'crisp-edges' }}
              />
            </GlassCard>

            {/* History */}
            <GlassCard className="p-4 mt-4">
              <Caption className="text-white/60 mb-3">Recent Drops</Caption>
              <div className="flex flex-wrap gap-2">
                {history.slice(0, 20).map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className={`px-3 py-1 rounded-lg text-sm font-medium ${
                      item.multiplier >= 10
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : item.multiplier >= 2
                        ? 'bg-blue-500/20 text-blue-400'
                        : item.multiplier < 1
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {item.multiplier}x → ${item.payout.toFixed(2)}
                  </motion.div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
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
                  onClick={() => setBetAmount((prev) => Math.min(100, prev * 2))}
                >
                  ×2
                </Button>
              </div>
            </GlassCard>

            {/* Risk Level */}
            <GlassCard className="p-6">
              <Caption className="text-white/60 mb-3">Risk Level</Caption>
              <div className="space-y-2">
                {(['low', 'medium', 'high'] as const).map((level) => (
                  <Button
                    key={level}
                    variant={riskLevel === level ? 'primary' : 'secondary'}
                    size="md"
                    onClick={() => setRiskLevel(level)}
                    className="w-full capitalize"
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </GlassCard>

            {/* Drop Button */}
            <Button
              variant="primary"
              size="lg"
              onClick={handleDrop}
              disabled={isDropping}
              className="w-full"
            >
              {isDropping ? 'Dropping...' : 'Drop Ball'}
            </Button>

            {/* Stats */}
            <GlassCard className="p-6">
              <Caption className="text-white/60 mb-2">Potential Win</Caption>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Min:</span>
                  <span className="text-red-400">
                    ${(betAmount * Math.min(...MULTIPLIERS[riskLevel])).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Max:</span>
                  <span className="text-emerald-400">
                    ${(betAmount * Math.max(...MULTIPLIERS[riskLevel])).toFixed(2)}
                  </span>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}

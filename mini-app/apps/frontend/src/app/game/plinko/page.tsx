'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameHeader } from '@/components/game/game-header';
import { Button } from '@/components/ui/button';
import { DemoModeToggle } from '@/components/ui/demo-mode-toggle';
import { useBalance } from '@/hooks/use-balance';
import { useDemoMode } from '@/store/demo-mode-store';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Plinko Game Page - Compact Mobile-First Design (Monopo Saigon Style)
 * 
 * FEATURES:
 * - Compact layout that fits on one screen
 * - Smooth ball drop animation
 * - Ball must reach bottom before bet completes
 * - Winnings credited after ball lands
 * - Dark theme with subtle gradients
 */

const MULTIPLIERS = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};

interface Ball {
  id: string;
  x: number;
  y: number;
  vx: number; // velocity x
  vy: number; // velocity y
  path: number[];
  currentStep: number;
  finalSlot: number;
}

export default function PlinkoGamePage() {
  const { balance, fetchBalance } = useBalance();
  const { isDemoMode } = useDemoMode();
  
  const [betAmount, setBetAmount] = useState(1);
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [activeBall, setActiveBall] = useState<Ball | null>(null);
  const [history, setHistory] = useState<Array<{ multiplier: number; payout: number }>>([]);
  const [isDropping, setIsDropping] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    soundManager.initialize();
  }, []);

  // Render plinko board and ball
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

    const render = () => {
      // Clear
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, rect.width, rect.height);

      const rows = 16;
      const pinRadius = 2.5;
      const spacing = rect.width / (rows + 2);
      const startY = 30;
      const endY = rect.height - 60;
      const rowHeight = (endY - startY) / rows;

      // Draw pins with subtle glow
      ctx.shadowBlur = 5;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      
      for (let row = 0; row < rows; row++) {
        const pinsInRow = row + 1;
        const rowY = startY + (row * rowHeight);

        for (let pin = 0; pin < pinsInRow; pin++) {
          const pinX = (rect.width / 2) - ((pinsInRow - 1) * spacing / 2) + (pin * spacing);
          
          ctx.beginPath();
          ctx.arc(pinX, rowY, pinRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.shadowBlur = 0;

      // Draw buckets
      const bucketWidth = rect.width / 17;
      const bucketY = rect.height - 50;
      const bucketHeight = 40;
      const multipliers = MULTIPLIERS[riskLevel];

      multipliers.forEach((mult, i) => {
        const x = i * bucketWidth;
        
        // Bucket color based on multiplier
        let color = 'rgba(255, 255, 255, 0.05)';
        let textColor = 'rgba(255, 255, 255, 0.4)';
        
        if (mult >= 100) {
          color = 'rgba(168, 85, 247, 0.15)';
          textColor = 'rgba(168, 85, 247, 0.8)';
        } else if (mult >= 10) {
          color = 'rgba(16, 185, 129, 0.15)';
          textColor = 'rgba(16, 185, 129, 0.8)';
        } else if (mult >= 2) {
          color = 'rgba(59, 130, 246, 0.15)';
          textColor = 'rgba(59, 130, 246, 0.8)';
        } else if (mult < 1) {
          color = 'rgba(239, 68, 68, 0.15)';
          textColor = 'rgba(239, 68, 68, 0.8)';
        }

        // Highlight if ball landed here
        if (activeBall && activeBall.finalSlot === i && activeBall.y >= 0.9) {
          color = color.replace('0.15', '0.3');
        }

        ctx.fillStyle = color;
        ctx.fillRect(x + 1, bucketY, bucketWidth - 2, bucketHeight);

        // Multiplier text
        ctx.fillStyle = textColor;
        ctx.font = '9px Roobert, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${mult}x`, x + bucketWidth / 2, bucketY + 25);
      });

      // Draw active ball - smaller, white, with realistic physics
      if (activeBall) {
        const ballX = activeBall.x * rect.width;
        const ballY = activeBall.y * rect.height;
        const ballRadius = 6; // Smaller ball

        // Subtle glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';

        // White ball with gradient for depth
        const gradient = ctx.createRadialGradient(ballX - 2, ballY - 2, 0, ballX, ballY, ballRadius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.7, 'rgba(240, 240, 240, 1)');
        gradient.addColorStop(1, 'rgba(200, 200, 200, 0.8)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight for 3D effect
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(ballX - 2, ballY - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [activeBall, riskLevel]);

  // Animate ball drop with realistic physics
  useEffect(() => {
    if (!activeBall || !isDropping) return;

    const gravity = 0.0008; // Gravity acceleration
    const friction = 0.98; // Air resistance
    const bounceDamping = 0.7; // Energy loss on bounce
    
    let animationId: number;
    let lastTime = Date.now();

    const animate = () => {
      const currentTime = Date.now();
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      setActiveBall((prev) => {
        if (!prev) return null;

        // Apply gravity
        let newVy = prev.vy + gravity * deltaTime;
        let newVx = prev.vx * friction;

        // Update position
        let newX = prev.x + newVx * deltaTime;
        let newY = prev.y + newVy * deltaTime;

        // Check collision with pins (simplified)
        const rows = 16;
        const spacing = 1 / (rows + 2);
        const currentRow = Math.floor(newY / (0.8 / rows));
        
        if (currentRow >= 0 && currentRow < rows) {
          const pinsInRow = currentRow + 1;
          const rowY = (currentRow / rows) * 0.8 + 0.05;
          
          // Check if ball is near a pin
          for (let pin = 0; pin < pinsInRow; pin++) {
            const pinX = 0.5 - ((pinsInRow - 1) * spacing / 2) + (pin * spacing);
            const distance = Math.sqrt(Math.pow(newX - pinX, 2) + Math.pow(newY - rowY, 2));
            
            if (distance < 0.02) {
              // Collision! Bounce off pin
              const angle = Math.atan2(newY - rowY, newX - pinX);
              newVx = Math.cos(angle) * Math.abs(newVy) * bounceDamping;
              newVy = Math.sin(angle) * Math.abs(newVy) * bounceDamping;
              
              // Move ball away from pin
              newX = pinX + Math.cos(angle) * 0.02;
              newY = rowY + Math.sin(angle) * 0.02;
              
              soundManager.play('ui.click');
              break;
            }
          }
        }

        // Boundary checks
        if (newX < 0.05) {
          newX = 0.05;
          newVx = -newVx * bounceDamping;
        }
        if (newX > 0.95) {
          newX = 0.95;
          newVx = -newVx * bounceDamping;
        }

        // Check if reached bottom
        if (newY >= 0.9) {
          // Ball landed
          const multiplier = MULTIPLIERS[riskLevel][prev.finalSlot];
          const payout = betAmount * multiplier;
          
          setHistory((h) => [{ multiplier, payout }, ...h.slice(0, 11)]);
          
          // Play sound
          if (multiplier >= 10) {
            soundManager.play('game.win');
          } else if (multiplier < 1) {
            soundManager.play('game.lose');
          } else {
            soundManager.play('game.cashout');
          }
          
          // Refetch balance
          setTimeout(() => {
            fetchBalance(isDemoMode);
            setIsDropping(false);
            setActiveBall(null);
          }, 500);
          
          return null;
        }

        return {
          ...prev,
          x: newX,
          y: newY,
          vx: newVx,
          vy: newVy,
        };
      });

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [activeBall, isDropping, betAmount, riskLevel, fetchBalance, isDemoMode]);

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

      const data = await response.json();
      
      // Calculate final slot based on server response or random
      const rows = 16;
      const finalSlot = Math.floor(Math.random() * 17); // 0-16

      setActiveBall({
        id: Date.now().toString(),
        x: 0.5, // Start at center
        y: 0.05, // Start at top
        vx: (Math.random() - 0.5) * 0.0002, // Small random horizontal velocity
        vy: 0.001, // Initial downward velocity
        path: [],
        currentStep: 0,
        finalSlot,
      });
      
      setIsDropping(true);
      soundManager.play('ui.click');
    } catch (error) {
      console.error('Drop failed:', error);
      setIsDropping(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-black via-gray-900 to-black overflow-hidden">
      {/* Header - Compact */}
      <div className="flex items-center justify-between px-4 py-2 pt-safe">
        <GameHeader title="🎯 Plinko" />
        <DemoModeToggle />
      </div>

      {/* Main Content - Fits on screen */}
      <div className="flex-1 flex flex-col px-3 pb-24 gap-2 overflow-hidden">
        {/* Plinko Board - Takes most space */}
        <div className="flex-1 rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl overflow-hidden min-h-0">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>

        {/* Last Win Display - REMOVED, was covering pyramid */}

        {/* Controls - Compact */}
        <div className="grid grid-cols-2 gap-2">
          {/* Bet Amount - Simple input only */}
          <div className="rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl p-3">
            <p className="text-white/60 text-xs mb-2">Bet Amount</p>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0.1)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-center text-white text-base"
              step={0.1}
              min={0.1}
              max={10000}
              disabled={isDropping}
              placeholder="Enter amount"
            />
          </div>

          {/* Risk Level */}
          <div className="rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl p-3">
            <p className="text-white/60 text-xs mb-2">Risk Level</p>
            <div className="flex gap-1">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => !isDropping && setRiskLevel(level)}
                  disabled={isDropping}
                  className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all ${
                    riskLevel === level
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {level[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Drop Button */}
        <motion.button
          onClick={handleDrop}
          disabled={isDropping}
          whileHover={{ scale: isDropping ? 1 : 1.02 }}
          whileTap={{ scale: isDropping ? 1 : 0.98 }}
          className={`w-full py-3 rounded-xl font-bold text-base shadow-lg transition-all ${
            isDropping
              ? 'bg-gray-700 text-white/40 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
          }`}
        >
          {isDropping ? '🎯 Dropping...' : '🎯 Drop Ball'}
        </motion.button>

        {/* History - Compact */}
        <div className="rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl p-3">
          <p className="text-white/60 text-xs mb-2">📊 Recent</p>
          <div className="flex flex-wrap gap-1.5">
            {history.slice(0, 8).map((item, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className={`px-2 py-1 rounded-lg text-xs font-bold ${
                  item.multiplier >= 100
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                    : item.multiplier >= 10
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white'
                    : item.multiplier >= 2
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : item.multiplier < 1
                    ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white'
                    : 'bg-white/10 text-white/60'
                }`}
              >
                {item.multiplier}x
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

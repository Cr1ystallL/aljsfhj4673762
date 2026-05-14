'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import { GameHeader } from '@/components/game/game-header';
import { DemoModeToggle } from '@/components/ui/demo-mode-toggle';
import { useBalance } from '@/hooks/use-balance';
import { useDemoMode } from '@/store/demo-mode-store';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Plinko Game Page - Matter.js Physics Engine
 * 
 * FEATURES:
 * - Realistic physics with Matter.js
 * - Ball bounces off pins naturally
 * - Smooth animations
 * - Compact mobile-first design
 */

const MULTIPLIERS = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};

// Matter.js will be loaded dynamically
let Matter: any = null;

export default function PlinkoGamePage() {
  const { balance, fetchBalance } = useBalance();
  const { isDemoMode } = useDemoMode();
  
  const [betAmount, setBetAmount] = useState(1);
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [history, setHistory] = useState<Array<{ multiplier: number; payout: number }>>([]);
  const [isDropping, setIsDropping] = useState(false);
  const [matterLoaded, setMatterLoaded] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<any>(null);
  const renderRef = useRef<any>(null);
  const pegsRef = useRef<any[]>([]);
  const pegAnimsRef = useRef<(number | null)[]>([]);

  // Load Matter.js
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js';
    script.async = true;
    script.onload = () => {
      Matter = (window as any).Matter;
      setMatterLoaded(true);
    };
    document.body.appendChild(script);

    soundManager.initialize();

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Initialize Matter.js engine
  useEffect(() => {
    if (!matterLoaded || !canvasRef.current || !Matter) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Create engine
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0.6, scale: 0.001 },
    });
    engineRef.current = engine;

    // Create renderer
    const render = Matter.Render.create({
      canvas,
      engine,
      options: {
        width,
        height,
        wireframes: false,
        background: 'transparent',
      },
    });
    renderRef.current = render;

    // Create pegs
    const GAP = width / 19;
    const PEG_RAD = 2.5;
    const pegs: any[] = [];
    
    for (let row = 0; row < 16; row++) {
      const pegsInRow = row + 3;
      for (let col = 0; col < pegsInRow; col++) {
        const x = width / 2 + (col - (pegsInRow - 1) / 2) * GAP;
        const y = GAP + row * GAP;
        const peg = Matter.Bodies.circle(x, y, PEG_RAD, {
          isStatic: true,
          label: 'Peg',
          render: {
            fillStyle: 'rgba(255, 255, 255, 0.2)',
          },
        });
        pegs.push(peg);
      }
    }
    
    pegsRef.current = pegs;
    pegAnimsRef.current = new Array(pegs.length).fill(null);
    Matter.Composite.add(engine.world, pegs);

    // Create ground (lower position so buckets are visible)
    const ground = Matter.Bodies.rectangle(width / 2, height - 10, width * 2, 20, {
      isStatic: true,
      label: 'Ground',
      render: {
        fillStyle: 'transparent',
      },
    });
    Matter.Composite.add(engine.world, [ground]);

    // Collision detection
    Matter.Events.on(engine, 'collisionStart', (event: any) => {
      event.pairs.forEach(({ bodyA, bodyB }: any) => {
        // Ball hit peg
        if ((bodyA.label === 'Ball' && bodyB.label === 'Peg') || 
            (bodyA.label === 'Peg' && bodyB.label === 'Ball')) {
          const peg = bodyA.label === 'Peg' ? bodyA : bodyB;
          const index = pegs.findIndex((p) => p === peg);
          if (index !== -1 && !pegAnimsRef.current[index]) {
            pegAnimsRef.current[index] = Date.now();
            soundManager.play('ui.click');
          }
        }

        // Ball hit ground
        if ((bodyA.label === 'Ball' && bodyB.label === 'Ground') || 
            (bodyA.label === 'Ground' && bodyB.label === 'Ball')) {
          const ball = bodyA.label === 'Ball' ? bodyA : bodyB;
          
          // Calculate which bucket
          const bucketWidth = width / 17;
          const index = Math.floor(ball.position.x / bucketWidth);
          const clampedIndex = Math.max(0, Math.min(16, index));
          
          const multiplier = MULTIPLIERS[riskLevel][clampedIndex];
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
          
          // Remove ball
          setTimeout(() => {
            Matter.Composite.remove(engine.world, ball);
            fetchBalance(isDemoMode);
            setIsDropping(false);
          }, 300);
        }
      });
    });

    // Custom render loop for peg animations
    const ctx = canvas.getContext('2d');
    function customRender() {
      if (!ctx) return;
      
      const now = Date.now();
      
      // Draw peg glow animations
      pegAnimsRef.current.forEach((anim, index) => {
        if (!anim) return;
        
        const delta = now - anim;
        if (delta > 400) {
          pegAnimsRef.current[index] = null;
          return;
        }
        
        const peg = pegs[index];
        if (!peg) return;
        
        const pct = delta / 400;
        const expandProgression = 1 - Math.abs(pct * 2 - 1);
        const expandRadius = expandProgression * 10;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(peg.position.x, peg.position.y, expandRadius, 0, 2 * Math.PI);
        ctx.fill();
      });
      
      requestAnimationFrame(customRender);
    }
    
    // Start engines
    Matter.Render.run(render);
    Matter.Runner.run(Matter.Runner.create(), engine);
    customRender();

    return () => {
      Matter.Render.stop(render);
      Matter.Engine.clear(engine);
    };
  }, [matterLoaded, riskLevel, betAmount, fetchBalance, isDemoMode]);

  const handleDrop = async () => {
    if (isDropping || !engineRef.current || !Matter) return;
    
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

      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const width = canvas.width;
      const dropLeft = width / 2 - 15;
      const dropRight = width / 2 + 15;
      const x = Math.random() * (dropRight - dropLeft) + dropLeft;
      
      const ball = Matter.Bodies.circle(x, -10, 4, {
        label: 'Ball',
        restitution: 0.7,
        render: {
          fillStyle: '#ffffff',
        },
      });
      
      Matter.Composite.add(engineRef.current.world, [ball]);
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
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-white" />
          <GameHeader title="Plinko" />
        </div>
        <DemoModeToggle />
      </div>

      {/* Main Content - Fits on screen */}
      <div className="flex-1 flex flex-col px-3 pb-24 gap-2 overflow-hidden">
        {/* Plinko Board - Takes most space */}
        <div className="flex-1 rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl overflow-hidden min-h-0 relative">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ imageRendering: 'auto' }}
          />
          
          {/* Multiplier buckets overlay - BELOW pyramid */}
          <div className="absolute bottom-0 left-0 right-0 flex gap-[1px] px-[2px] pb-[2px] pointer-events-none">
            {MULTIPLIERS[riskLevel].map((mult, i) => {
              let bgColor = 'bg-white/5';
              let textColor = 'text-white/40';
              
              if (mult >= 100) {
                bgColor = 'bg-purple-500/30';
                textColor = 'text-purple-300';
              } else if (mult >= 10) {
                bgColor = 'bg-emerald-500/30';
                textColor = 'text-emerald-300';
              } else if (mult >= 2) {
                bgColor = 'bg-blue-500/30';
                textColor = 'text-blue-300';
              } else if (mult < 1) {
                bgColor = 'bg-red-500/30';
                textColor = 'text-red-300';
              }
              
              return (
                <div
                  key={i}
                  className={`flex-1 ${bgColor} rounded-sm flex items-center justify-center py-1.5 border-b-[3px] ${
                    mult >= 100 ? 'border-purple-400' :
                    mult >= 10 ? 'border-emerald-400' :
                    mult >= 2 ? 'border-blue-400' :
                    mult < 1 ? 'border-red-400' :
                    'border-yellow-400'
                  }`}
                  style={{ minHeight: '32px' }}
                >
                  <span className={`text-[8px] font-bold ${textColor}`}>
                    {mult}x
                  </span>
                </div>
              );
            })}
          </div>
        </div>

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
          disabled={isDropping || !matterLoaded}
          whileHover={{ scale: isDropping ? 1 : 1.02 }}
          whileTap={{ scale: isDropping ? 1 : 0.98 }}
          className={`w-full py-3 rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2 ${
            isDropping || !matterLoaded
              ? 'bg-gray-700 text-white/40 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
          }`}
        >
          <Target className="w-5 h-5" />
          {!matterLoaded ? 'Loading...' : isDropping ? 'Dropping...' : 'Drop Ball'}
        </motion.button>

        {/* History - Compact */}
        <div className="rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-white/60 text-xs">Recent</p>
          </div>
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

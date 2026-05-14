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
  const [isDropping, setIsDropping] = useState(false);
  const [activeBallsCount, setActiveBallsCount] = useState(0);
  const [matterLoaded, setMatterLoaded] = useState(false);
  const [highlightedBucket, setHighlightedBucket] = useState<number | null>(null);
  const [liveHistory, setLiveHistory] = useState<Array<{
    username: string;
    betAmount: number;
    multiplier: number;
    payout: number;
    timestamp: number;
  }>>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<any>(null);
  const renderRef = useRef<any>(null);
  const pegsRef = useRef<any[]>([]);
  const pegAnimsRef = useRef<(number | null)[]>([]);
  const processedBallsRef = useRef<Set<any>>(new Set()); // Track processed balls

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

    // Fetch live history periodically
    const fetchLiveHistory = async () => {
      try {
        const response = await fetch('/api/games/plinko/history', {
          method: 'GET',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setLiveHistory(data.history || []);
        }
      } catch (error) {
        console.error('Failed to fetch live history:', error);
      }
    };

    fetchLiveHistory();
    const interval = setInterval(fetchLiveHistory, 5000); // Update every 5 seconds

    return () => {
      document.body.removeChild(script);
      clearInterval(interval);
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

    // Create pegs - 17 rows, positioned to fill canvas perfectly
    const GAP = width / 19;
    const PEG_RAD = 2.5;
    const pegs: any[] = [];
    const startY = GAP * 1.5; // Start closer to top
    
    for (let row = 0; row < 17; row++) {
      const pegsInRow = row + 3;
      for (let col = 0; col < pegsInRow; col++) {
        const x = width / 2 + (col - (pegsInRow - 1) / 2) * GAP;
        const y = startY + row * GAP;
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

    // Create decorative walls on left and right with triangular shape
    // These walls prevent balls from escaping and look beautiful
    const wallThickness = 15;
    const pyramidWidth = GAP * 18; // Width of pyramid at bottom
    const pyramidLeft = (width - pyramidWidth) / 2;
    const pyramidRight = width - pyramidLeft;
    
    // Left wall - angled to match pyramid shape
    const leftWallVertices = [
      { x: pyramidLeft - wallThickness, y: 0 },
      { x: pyramidLeft, y: 0 },
      { x: pyramidLeft, y: height },
      { x: pyramidLeft - wallThickness, y: height },
    ];
    const leftWall = Matter.Bodies.fromVertices(
      pyramidLeft - wallThickness / 2,
      height / 2,
      [leftWallVertices],
      {
        isStatic: true,
        label: 'Wall',
        render: {
          fillStyle: 'rgba(139, 92, 246, 0.15)', // Purple glow
          strokeStyle: 'rgba(139, 92, 246, 0.4)',
          lineWidth: 2,
        },
      }
    );
    
    // Right wall - angled to match pyramid shape
    const rightWallVertices = [
      { x: pyramidRight, y: 0 },
      { x: pyramidRight + wallThickness, y: 0 },
      { x: pyramidRight + wallThickness, y: height },
      { x: pyramidRight, y: height },
    ];
    const rightWall = Matter.Bodies.fromVertices(
      pyramidRight + wallThickness / 2,
      height / 2,
      [rightWallVertices],
      {
        isStatic: true,
        label: 'Wall',
        render: {
          fillStyle: 'rgba(139, 92, 246, 0.15)', // Purple glow
          strokeStyle: 'rgba(139, 92, 246, 0.4)',
          lineWidth: 2,
        },
      }
    );
    
    Matter.Composite.add(engine.world, [leftWall, rightWall]);

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
          
          // Check if already processed
          if (processedBallsRef.current.has(ball.id)) {
            return;
          }
          
          // Mark as processed
          processedBallsRef.current.add(ball.id);
          
          // Calculate which bucket
          const bucketWidth = width / 17;
          const index = Math.floor(ball.position.x / bucketWidth);
          const clampedIndex = Math.max(0, Math.min(16, index));
          
          const multiplier = MULTIPLIERS[riskLevel][clampedIndex];
          const payout = betAmount * multiplier;
          
          // Highlight bucket with animation
          setHighlightedBucket(clampedIndex);
          setTimeout(() => setHighlightedBucket(null), 500);
          
          // Play sound
          if (multiplier >= 10) {
            soundManager.play('game.win');
          } else if (multiplier < 1) {
            soundManager.play('game.lose');
          } else {
            soundManager.play('game.cashout');
          }
          
          // Remove ball and update balance
          setTimeout(() => {
            Matter.Composite.remove(engine.world, ball);
            processedBallsRef.current.delete(ball.id);
            fetchBalance(isDemoMode);
            
            // Decrease active balls count
            setActiveBallsCount((prev) => Math.max(0, prev - 1));
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
    if (!engineRef.current || !Matter) return;
    
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
      setActiveBallsCount((prev) => prev + 1);
      soundManager.play('ui.click');
    } catch (error) {
      console.error('Drop failed:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-black via-gray-900 to-black overflow-hidden">
      {/* Main Content - Full screen, scrollable for history */}
      <div className="flex-1 flex flex-col px-2 pb-20 pt-2 gap-1.5 overflow-y-auto">
        {/* Plinko Board - Compact height to fit pyramid perfectly */}
        <div className="flex-1 min-h-[380px] max-h-[500px] rounded-lg bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 shadow-xl overflow-hidden relative">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ imageRendering: 'auto' }}
          />
          
          {/* Multiplier buckets overlay - BELOW pyramid with highlight animation */}
          <div className="absolute bottom-0 left-0 right-0 flex gap-[1px] px-[1px] pb-[1px] pointer-events-none">
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
              
              const isHighlighted = highlightedBucket === i;
              
              return (
                <motion.div
                  key={i}
                  animate={isHighlighted ? {
                    scale: [1, 1.15, 1],
                    opacity: [1, 0.8, 1],
                  } : {}}
                  transition={{ duration: 0.5 }}
                  className={`flex-1 ${bgColor} rounded-sm flex items-center justify-center py-1 border-b-[2px] ${
                    mult >= 100 ? 'border-purple-400' :
                    mult >= 10 ? 'border-emerald-400' :
                    mult >= 2 ? 'border-blue-400' :
                    mult < 1 ? 'border-red-400' :
                    'border-yellow-400'
                  } ${isHighlighted ? 'ring-2 ring-white shadow-lg' : ''}`}
                  style={{ minHeight: '24px' }}
                >
                  <span className={`text-[7px] font-bold ${textColor}`}>
                    {mult}x
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Controls - Ultra Compact */}
        <div className="grid grid-cols-2 gap-1.5">
          {/* Bet Amount */}
          <div className="rounded-lg bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 p-2">
            <p className="text-white/60 text-[10px] mb-1">Bet Amount</p>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0.1)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-center text-white text-sm"
              step={0.1}
              min={0.1}
              max={10000}
              placeholder="Enter amount"
            />
          </div>

          {/* Risk Level */}
          <div className="rounded-lg bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 p-2">
            <p className="text-white/60 text-[10px] mb-1">Risk Level</p>
            <div className="flex gap-1">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setRiskLevel(level)}
                  className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all ${
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

        {/* Drop Button - Can drop multiple balls */}
        <motion.button
          onClick={handleDrop}
          disabled={!matterLoaded}
          whileHover={{ scale: !matterLoaded ? 1 : 1.02 }}
          whileTap={{ scale: !matterLoaded ? 1 : 0.98 }}
          className={`w-full py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${
            !matterLoaded
              ? 'bg-gray-700 text-white/40 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
          }`}
        >
          <Target className="w-4 h-4" />
          {!matterLoaded ? 'Loading...' : activeBallsCount > 0 ? `Drop Ball (${activeBallsCount} active)` : 'Drop Ball'}
        </motion.button>

        {/* Live History - All Players - NO SCROLL, 10 bets */}
        <div className="rounded-lg bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-white/60 text-[10px] font-medium">Live Bets</p>
          </div>
          <div className="space-y-1">
            {liveHistory.slice(0, 10).map((bet, i) => (
              <motion.div
                key={`${bet.timestamp}-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between bg-white/5 rounded-md px-2 py-1.5"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Game Icon SVG */}
                  <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-blue-400"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="6" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[10px] font-medium truncate">
                      {bet.username}
                    </p>
                    <p className="text-white/40 text-[9px]">
                      ${bet.betAmount.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      bet.multiplier >= 10
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : bet.multiplier < 1
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {bet.multiplier}x
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      bet.payout > bet.betAmount ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    ${bet.payout.toFixed(2)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

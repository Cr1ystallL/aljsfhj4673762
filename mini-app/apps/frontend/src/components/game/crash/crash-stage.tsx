'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Wifi } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Crash Stage — Monopo Saigon Style
 *
 * Atmospheric scene with deep ocean gradient as a soft volumetric backdrop.
 * UI etched on top: countdown plate, multiplier display, hash + latency chips.
 * Depth comes from gradients and translucency, not box-shadows.
 */

type Phase = 'waiting' | 'countdown' | 'active' | 'crashed';

interface CrashStageProps {
  phase: Phase;
  multiplier: number;
  countdown: number | null;
  graphPoints: Array<{ time: number; multiplier: number }>;
  roundHash?: string;
  latencyMs?: number;
}

export function CrashStage({
  phase,
  multiplier,
  countdown,
  graphPoints,
  roundHash = '94f1556b9c',
  latencyMs = 213,
}: CrashStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render multiplier curve onto canvas with gradient strokes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (graphPoints.length < 2) return;

    const maxTime = graphPoints[graphPoints.length - 1].time || 1;
    const maxMult = Math.max(...graphPoints.map((p) => p.multiplier), 2);

    // Curve gradient — deep ocean, restrained opacity
    const curveGradient = ctx.createLinearGradient(0, 0, rect.width, 0);
    if (phase === 'crashed') {
      curveGradient.addColorStop(0, 'rgba(165, 45, 37, 0.95)');
      curveGradient.addColorStop(1, 'rgba(255, 172, 46, 0.6)');
    } else {
      curveGradient.addColorStop(0, 'rgba(160, 224, 171, 0.9)');
      curveGradient.addColorStop(0.5, 'rgba(255, 172, 46, 0.85)');
      curveGradient.addColorStop(1, 'rgba(165, 45, 37, 0.85)');
    }

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = curveGradient;
    ctx.beginPath();

    graphPoints.forEach((p, i) => {
      const x = (p.time / maxTime) * rect.width;
      const y = rect.height - ((p.multiplier - 1) / Math.max(maxMult - 1, 0.001)) * rect.height * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Subtle area fill
    ctx.lineTo(rect.width, rect.height);
    ctx.lineTo(0, rect.height);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, 0, 0, rect.height);
    if (phase === 'crashed') {
      fill.addColorStop(0, 'rgba(165, 45, 37, 0.18)');
      fill.addColorStop(1, 'rgba(165, 45, 37, 0)');
    } else {
      fill.addColorStop(0, 'rgba(160, 224, 171, 0.15)');
      fill.addColorStop(1, 'rgba(160, 224, 171, 0)');
    }
    ctx.fillStyle = fill;
    ctx.fill();
  }, [graphPoints, phase]);

  return (
    <div className="relative overflow-hidden rounded-card border border-white/10 bg-midnight-canvas">
      {/* Deep Ocean atmospheric backdrop */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 100%, rgba(165, 45, 37, 0.35) 0%, rgba(255, 172, 46, 0.18) 35%, rgba(160, 224, 171, 0.12) 65%, transparent 85%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 0%, rgba(0, 0, 0, 0.65) 0%, transparent 70%)',
        }}
      />

      {/* Drifting volumetric orbs */}
      <motion.div
        className="absolute -top-10 -left-10 w-48 h-48 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(160, 224, 171, 0.25) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-12 -right-10 w-56 h-56 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 172, 46, 0.22) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
        animate={{ x: [0, -25, 0], y: [0, -20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Subtle horizontal grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '100% 25%',
          }}
        />
      </div>

      {/* Curve canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'crisp-edges' }}
      />

      {/* Stage content */}
      <div className="relative aspect-[16/11] sm:aspect-[16/9] flex flex-col">
        {/* Countdown plate (top-left) */}
        <div className="absolute top-5 left-5">
          <AnimatePresence mode="wait">
            {phase === 'countdown' && countdown !== null && (
              <motion.div
                key="countdown"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col"
              >
                <div className="px-4 py-1.5 rounded-pill bg-white/[0.06] border border-white/15 backdrop-blur-md">
                  <span className="font-roobert text-frost-white text-[20px] tabular-nums tracking-wider">
                    {String(Math.floor(countdown / 60)).padStart(2, '0')}:
                    {String(countdown % 60).padStart(2, '0')}
                  </span>
                </div>
                <span className="mt-1.5 ml-1 text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                  Обратный отсчёт
                </span>
              </motion.div>
            )}
            {phase === 'waiting' && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-1.5 rounded-pill bg-white/[0.04] border border-white/10 backdrop-blur-md"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                  Ожидание раунда
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Multiplier (center) */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {(phase === 'active' || phase === 'crashed') && (
              <motion.div
                key={phase}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex flex-col items-center"
              >
                <span
                  className={cn(
                    'font-roobert font-light leading-none tabular-nums',
                    'text-[64px] sm:text-[78px]',
                    phase === 'crashed' ? 'text-[#ff8a76]' : 'text-frost-white'
                  )}
                  style={{
                    textShadow:
                      phase === 'crashed'
                        ? '0 0 30px rgba(165, 45, 37, 0.45)'
                        : '0 0 28px rgba(255, 255, 255, 0.18)',
                  }}
                >
                  {multiplier.toFixed(2)}x
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.22em] text-whisper-gray font-roobert">
                  {phase === 'crashed' ? 'Раунд завершён' : 'Текущий коэффициент'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom info row: hash + latency */}
        <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-white/[0.05] border border-white/10 backdrop-blur-md">
            <Shield size={11} className="text-frost-white/60" strokeWidth={2} />
            <span className="text-[10px] font-roobert text-frost-white/70 tracking-wider">
              {roundHash.slice(0, 10)}…
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-white/[0.05] border border-white/10 backdrop-blur-md">
            <Wifi size={11} className="text-frost-white/60" strokeWidth={2} />
            <span className="text-[10px] font-roobert text-frost-white/70 tabular-nums">
              {latencyMs} ms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

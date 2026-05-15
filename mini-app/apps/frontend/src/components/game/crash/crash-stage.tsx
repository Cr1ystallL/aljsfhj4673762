'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Crash Stage — Monopo Saigon Style
 *
 * Atmospheric dark canvas with deep ocean radial gradient + drifting orbs.
 * The crash curve is rendered into a backing <canvas>:
 *   - Origin at bottom-left.
 *   - X axis — elapsed game time (auto-scaled to fill width).
 *   - Y axis — multiplier (auto-scaled with min headroom of 2x).
 *   - Curve uses the brand gradient (green → amber → red) and a soft fill.
 *   - On crash the gradient shifts toward red and the area dims.
 *
 * The provably-fair seed hash and the live ping are exposed as small pills
 * docked at the bottom of the stage.
 */

type Phase = 'idle' | 'waiting' | 'starting' | 'active' | 'resolving' | 'completed';

interface CrashStageProps {
  phase: Phase;
  multiplier: number;
  countdown: number | null;
  /** Timestamp (ms epoch) when the current 'waiting' phase ends. */
  waitingEndsAt: number | null;
  graphPoints: Array<{ time: number; multiplier: number }>;
  serverSeedHash: string;
  latencyMs: number;
  connected: boolean;
}

export function CrashStage({
  phase,
  multiplier,
  countdown,
  waitingEndsAt,
  graphPoints,
  serverSeedHash,
  latencyMs,
  connected,
}: CrashStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1Hz ticker so the waiting countdown decrements visibly even when the
  // snapshot only refreshes every couple of seconds via REST poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== 'waiting' || !waitingEndsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase, waitingEndsAt]);

  const waitingSeconds =
    phase === 'waiting' && waitingEndsAt
      ? Math.max(0, Math.ceil((waitingEndsAt - now) / 1000))
      : null;

  // Render curve into canvas any time the points or phase change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (graphPoints.length < 2 || phase === 'waiting' || phase === 'starting' || phase === 'idle') {
      return;
    }

    // Layout padding so the curve doesn't kiss the edges.
    const padX = 22;
    const padBottom = 22;
    const padTop = 28;
    const innerW = Math.max(1, w - padX * 2);
    const innerH = Math.max(1, h - padTop - padBottom);

    // ---- Reference scales -------------------------------------------------
    //
    // The curve must visibly bend as the multiplier accelerates. Auto-scaling
    // both axes to the leading point flattens the curve into a straight line
    // (the head always sits at the same relative position). To preserve
    // real exponential shape we anchor the axes:
    //
    //   * X axis: starts at 0 (the round began at t=0). Window grows with
    //     elapsed time — minimum 4s, then matches the round so the head
    //     sits ~20% from the right edge regardless of round length.
    //
    //   * Y axis: smooth headroom. We pick yMax such that the head sits
    //     at ~75% of the inner height. As the multiplier grows, yMax
    //     follows continuously (no Fibonacci buckets, no snapping). This
    //     keeps the curve organically bending instead of compressing.
    // ---------------------------------------------------------------------
    const lastT = graphPoints[graphPoints.length - 1].time || 1;
    const lastM = graphPoints[graphPoints.length - 1].multiplier || 1;

    // Window grows: at least 4s, otherwise round-length × 1.25 so the head
    // never kisses the right wall — even on long high-multiplier rounds.
    const xWindow = Math.max(4000, lastT * 1.25);
    const startT = 0;

    // Pick yMax so the head sits around ~75% height. Clamp the lower bound
    // to 1.5 so the very first ticks of the round don't render a vertical
    // wall.
    const yMax = Math.max(1.5, 1 + (lastM - 1) / 0.75);

    const project = (t: number, m: number) => {
      const x = padX + ((t - startT) / xWindow) * innerW;
      const y = h - padBottom - ((m - 1) / Math.max(0.001, yMax - 1)) * innerH;
      return { x, y };
    };

    // ---- Curve stroke -----------------------------------------------------
    const strokeGrad = ctx.createLinearGradient(0, 0, w, 0);
    if (phase === 'completed') {
      strokeGrad.addColorStop(0, 'rgba(165, 45, 37, 0.95)');
      strokeGrad.addColorStop(1, 'rgba(255, 172, 46, 0.65)');
    } else {
      strokeGrad.addColorStop(0, 'rgba(160, 224, 171, 0.95)');
      strokeGrad.addColorStop(0.55, 'rgba(255, 172, 46, 0.9)');
      strokeGrad.addColorStop(1, 'rgba(165, 45, 37, 0.9)');
    }

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeGrad;

    ctx.beginPath();
    let first = true;
    for (const p of graphPoints) {
      const { x, y } = project(p.time, p.multiplier);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // ---- Filled area under curve -----------------------------------------
    const lastPoint = graphPoints[graphPoints.length - 1];
    const headProj = project(lastPoint.time, lastPoint.multiplier);
    const startProj = project(graphPoints[0].time, 1);

    ctx.lineTo(headProj.x, h - padBottom);
    ctx.lineTo(startProj.x, h - padBottom);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (phase === 'completed') {
      fillGrad.addColorStop(0, 'rgba(165, 45, 37, 0.22)');
      fillGrad.addColorStop(1, 'rgba(165, 45, 37, 0)');
    } else {
      fillGrad.addColorStop(0, 'rgba(160, 224, 171, 0.18)');
      fillGrad.addColorStop(1, 'rgba(160, 224, 171, 0)');
    }
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // ---- Leading dot ------------------------------------------------------
    ctx.beginPath();
    ctx.arc(headProj.x, headProj.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = phase === 'completed' ? 'rgba(255, 138, 118, 1)' : 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle =
      phase === 'completed' ? 'rgba(165, 45, 37, 0.8)' : 'rgba(160, 224, 171, 0.6)';
    ctx.stroke();
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

      {/* Drifting orbs */}
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
        {/* Countdown / waiting plate (top-left) */}
        <div className="absolute top-5 left-5">
          <AnimatePresence mode="wait">
            {phase === 'starting' && countdown !== null && (
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
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-white/[0.04] border border-white/10 backdrop-blur-md"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                  Приём ставок
                </span>
                {waitingSeconds !== null && (
                  <span className="font-roobert text-frost-white text-[13px] tabular-nums leading-none">
                    {String(Math.floor(waitingSeconds / 60)).padStart(2, '0')}:
                    {String(waitingSeconds % 60).padStart(2, '0')}
                  </span>
                )}
              </motion.div>
            )}
            {phase === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-1.5 rounded-pill bg-white/[0.04] border border-white/10 backdrop-blur-md"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                  Подключение…
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Multiplier (center) */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {(phase === 'active' || phase === 'completed' || phase === 'resolving') && (
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
                    phase === 'completed' ? 'text-[#ff8a76]' : 'text-frost-white'
                  )}
                  style={{
                    textShadow:
                      phase === 'completed'
                        ? '0 0 30px rgba(165, 45, 37, 0.45)'
                        : '0 0 28px rgba(255, 255, 255, 0.18)',
                  }}
                >
                  {multiplier.toFixed(2)}x
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.22em] text-whisper-gray font-roobert">
                  {phase === 'completed' ? 'Краш' : 'Текущий коэффициент'}
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
              {serverSeedHash
                ? `${serverSeedHash.slice(0, 10)}…`
                : 'хеш загружается'}
            </span>
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border backdrop-blur-md',
              connected
                ? 'bg-white/[0.05] border-white/10'
                : 'bg-[rgba(165,45,37,0.18)] border-[rgba(165,45,37,0.4)]'
            )}
          >
            <Wifi size={11} className="text-frost-white/60" strokeWidth={2} />
            <span className="text-[10px] font-roobert text-frost-white/70 tabular-nums">
              {connected ? `${latencyMs} ms` : 'нет связи'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

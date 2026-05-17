'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Wifi } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CrashLiveStream } from '@/lib/games/crash/crash-live-stream';

/**
 * Crash Stage — Monopo Saigon Style
 *
 * Atmospheric dark canvas with deep ocean radial gradient. The crash
 * curve is rendered into a backing <canvas> on its own rAF loop reading
 * directly from the live stream's fast channel — React never re-renders
 * this component when the multiplier ticks.
 *
 *   - Origin at bottom-left.
 *   - X axis — elapsed game time, auto-scaled.
 *   - Y axis — multiplier on a logarithmic scale (large rounds stay readable).
 *   - Stroke uses the brand gradient (green → amber → red).
 *
 * The giant centre multiplier number is also driven by the fast channel
 * via `useFastMultiplier`, so the page tree above does not re-render.
 *
 * Drifting orbs are pure CSS gradients — no framer-motion infinite loops.
 * They look the same and cost zero per-frame on mobile WebViews.
 */

type Phase = 'idle' | 'waiting' | 'starting' | 'active' | 'resolving' | 'completed';

interface CrashStageProps {
  stream: CrashLiveStream | null;
  phase: Phase;
  countdown: number | null;
  /** Timestamp (ms epoch) when the current 'waiting' phase ends. */
  waitingEndsAt: number | null;
  serverSeedHash: string;
  latencyMs: number;
  connected: boolean;
  /** Final crash point announced by the server (only set in 'completed'). */
  lastCrashPoint: number | null;
}

export const CrashStage = memo(function CrashStage({
  stream,
  phase,
  countdown,
  waitingEndsAt,
  serverSeedHash,
  latencyMs,
  connected,
  lastCrashPoint,
}: CrashStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multiplierTextRef = useRef<HTMLSpanElement>(null);

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

  // ------ Canvas curve drawing — owns its own rAF loop -------------------
  useEffect(() => {
    if (!stream) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isTouch =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);

    let raf = 0;
    let lastSize = { w: 0, h: 0 };
    let needsResize = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === lastSize.w && h === lastSize.h) return;
      lastSize = { w, h };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      needsResize = false;
    };

    const ro = new ResizeObserver(() => {
      needsResize = true;
    });
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (needsResize) resize();

      const w = lastSize.w;
      const h = lastSize.h;
      if (!w || !h) return;

      ctx.clearRect(0, 0, w, h);

      const graph = stream.getFast().graphPoints;
      if (
        graph.length < 2 ||
        phase === 'waiting' ||
        phase === 'starting' ||
        phase === 'idle'
      ) {
        return;
      }

      const padLeft = 22;
      const padRight = 38;
      const padBottom = 22;
      const padTop = 32;
      const innerW = Math.max(1, w - padLeft - padRight);
      const innerH = Math.max(1, h - padTop - padBottom);

      // Defensive: trim leftovers from a previous round.
      let firstIdx = 0;
      for (let i = graph.length - 1; i > 0; i--) {
        if (graph[i].time < graph[i - 1].time) {
          firstIdx = i;
          break;
        }
      }
      const points = firstIdx > 0 ? graph.slice(firstIdx) : graph;
      if (points.length < 2) return;

      const lastT = points[points.length - 1].time || 1;
      const lastM = points[points.length - 1].multiplier || 1;
      const xWindow = Math.max(4000, lastT * 1.25);
      const yLogMax = Math.max(Math.log(1.5), Math.log(lastM) / 0.78);

      const project = (t: number, m: number) => {
        const x = padLeft + (t / xWindow) * innerW;
        const yFrac = Math.log(Math.max(1, m)) / yLogMax;
        const y = h - padBottom - yFrac * innerH;
        return { x, y };
      };

      // Stroke
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
      for (const p of points) {
        const { x, y } = project(p.time, p.multiplier);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Filled area
      const lastPoint = points[points.length - 1];
      const headProj = project(lastPoint.time, lastPoint.multiplier);
      const startProj = project(points[0].time, 1);

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

      // Leading dot
      ctx.beginPath();
      ctx.arc(headProj.x, headProj.y, 4, 0, Math.PI * 2);
      ctx.fillStyle =
        phase === 'completed'
          ? 'rgba(255, 138, 118, 1)'
          : 'rgba(255, 255, 255, 0.95)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle =
        phase === 'completed'
          ? 'rgba(165, 45, 37, 0.8)'
          : 'rgba(160, 224, 171, 0.6)';
      ctx.stroke();

      // Update the centre multiplier text (only if active/completed).
      if (
        multiplierTextRef.current &&
        (phase === 'active' || phase === 'completed' || phase === 'resolving')
      ) {
        const live = stream.getFast().displayMultiplier;
        const txt = `${live.toFixed(2)}x`;
        if (multiplierTextRef.current.textContent !== txt) {
          multiplierTextRef.current.textContent = txt;
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [stream, phase]);

  return (
    <div className="relative overflow-hidden rounded-card border border-white/10 bg-midnight-canvas">
      {/* Deep Ocean atmospheric backdrop — pure CSS, zero per-frame cost. */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 100%, rgba(165, 45, 37, 0.35) 0%, rgba(255, 172, 46, 0.18) 35%, rgba(160, 224, 171, 0.12) 65%, transparent 85%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 0%, rgba(0, 0, 0, 0.65) 0%, transparent 70%)',
        }}
      />

      {/* Static accent washes — replaces the previous infinite framer
          motion orbs which kept the JS thread busy on every frame. */}
      <div
        aria-hidden
        className="absolute -top-10 -left-10 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(160, 224, 171, 0.18) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-12 -right-10 w-56 h-56 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 172, 46, 0.16) 0%, transparent 70%)',
        }}
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
                <div className="px-4 py-1.5 rounded-pill bg-white/[0.06] border border-white/15">
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
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-white/[0.04] border border-white/10"
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
                className="px-4 py-1.5 rounded-pill bg-white/[0.04] border border-white/10"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                  Подключение…
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Multiplier (center) — direct DOM update from rAF loop */}
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
                  ref={multiplierTextRef}
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
                    willChange: 'contents',
                  }}
                >
                  {phase === 'completed' && lastCrashPoint !== null
                    ? `${lastCrashPoint.toFixed(2)}x`
                    : '1.00x'}
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
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-white/[0.05] border border-white/10">
            <Shield size={11} className="text-frost-white/60" strokeWidth={2} />
            <span className="text-[10px] font-roobert text-frost-white/70 tracking-wider">
              {serverSeedHash
                ? `${serverSeedHash.slice(0, 10)}…`
                : 'хеш загружается'}
            </span>
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border',
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
});

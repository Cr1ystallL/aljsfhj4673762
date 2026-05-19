'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Wifi, Rocket } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CrashLiveStream } from '@/lib/games/crash/crash-live-stream';

/**
 * Crash Stage — Premium Curve v2
 *
 * The previous draw routine had two failures:
 *   - When the multiplier got large, `xWindow = lastT * 1.25` re-projected
 *     all earlier points so the curve visibly "shrank" toward the origin
 *     each tick.
 *   - The line was a single 2.5px stroke: thin, anaemic, no presence.
 *
 * This rewrite paints the curve in five stacked layers, all reading the
 * same point buffer:
 *
 *   1. Y-axis grid lines + labels (1x, 2x, 5x, 10x, 25x, 50x, 100x).
 *      Painted on a log scale so growing curves stay readable from 1x
 *      to ~200x without ever rescaling.
 *   2. Filled area under the curve — soft Deep Ocean wash, low alpha.
 *   3. Wide outer glow stroke (10px, 25% alpha) — gives the line "weight"
 *      without halo'ing the whole stage.
 *   4. Inner solid stroke (3.5px) — brand gradient (green → amber → red).
 *   5. Head ornament:
 *        - pulsing soft ring (radius wobbles 0.5 Hz)
 *        - small white dot
 *        - rocket-style tail-flame (3-stop radial) under the dot
 *
 * Scale handling — the X axis grows monotonically with elapsed time:
 *   xWindow = max(6000, ceil(lastT/3000) * 3000)
 *
 * i.e. the visible window jumps in 3-second steps as the round runs.
 * Earlier points NEVER get re-scaled within a window, so the curve no
 * longer "snaps backward" each frame. When the window expands the
 * jump is bounded to 3s of horizontal travel — barely noticeable in
 * motion.
 *
 * Y axis: log scale, ceiling auto-fit at lastM × 1.25 so the head sits
 * around 80% of the visible height regardless of magnitude.
 *
 * The text in the centre of the stage continues to be DOM-driven from
 * the rAF loop so React never re-renders during the round.
 */

type Phase =
  | 'idle'
  | 'waiting'
  | 'starting'
  | 'active'
  | 'resolving'
  | 'completed';

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

/**
 * Y-axis tick definitions — log-spaced multipliers we paint horizontal
 * lines + labels for. We hide ticks above the current visible ceiling
 * so the chart stays uncluttered when the round is small.
 */
const Y_TICKS = [1, 1.5, 2, 3, 5, 10, 25, 50, 100, 184];

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
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
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

      const isPaused =
        phase === 'waiting' || phase === 'starting' || phase === 'idle';

      // Layout box — generous left padding for the y-axis labels, less
      // on the right so the head can ride close to the edge.
      const padLeft = 32;
      const padRight = 40;
      const padTop = 36;
      const padBottom = 26;
      const innerW = Math.max(1, w - padLeft - padRight);
      const innerH = Math.max(1, h - padTop - padBottom);

      const graph = stream.getFast().graphPoints;

      // Defensive: trim leftovers from a previous round.
      let firstIdx = 0;
      for (let i = graph.length - 1; i > 0; i--) {
        if (graph[i].time < graph[i - 1].time) {
          firstIdx = i;
          break;
        }
      }
      const points = firstIdx > 0 ? graph.slice(firstIdx) : graph;

      // Compute the visible window. Uses fixed-step buckets so earlier
      // points stay glued in place even as new ticks arrive.
      const lastT =
        points.length >= 2 ? points[points.length - 1].time || 1 : 1;
      const lastM =
        points.length >= 2 ? points[points.length - 1].multiplier || 1 : 1;
      const X_BUCKET = 3000; // window grows in 3-second steps
      const xWindow = Math.max(
        6000,
        Math.ceil(Math.max(lastT, 1) / X_BUCKET) * X_BUCKET
      );
      // Y log scale ceiling: lastM × 1.25, never below 2.5x so the
      // baseline always shows 1x and the next 2x tick.
      const yLogMax = Math.max(Math.log(2.5), Math.log(lastM * 1.25));

      const project = (t: number, m: number) => {
        const x = padLeft + (t / xWindow) * innerW;
        const yFrac = Math.log(Math.max(1, m)) / yLogMax;
        const y = h - padBottom - yFrac * innerH;
        return { x, y };
      };

      // ---------- Layer 1: y-axis grid ----------
      ctx.lineWidth = 1;
      ctx.font =
        '500 10px ui-sans-serif, system-ui, "Segoe UI", Roobert, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      for (const tick of Y_TICKS) {
        if (Math.log(tick) > yLogMax) continue;
        const yFrac = Math.log(tick) / yLogMax;
        const y = h - padBottom - yFrac * innerH;
        // Line
        ctx.strokeStyle =
          tick === 1 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight + 12, y);
        ctx.stroke();
        // Label
        ctx.fillStyle =
          tick === 1 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.32)';
        ctx.fillText(`${tick}x`, padLeft - 6, y);
      }

      if (points.length < 2 || isPaused) {
        // Stage is idle/waiting/starting — only the grid is drawn.
        return;
      }

      // ---------- Layer 2: filled area ----------
      const filled = new Path2D();
      let first = true;
      for (const p of points) {
        const { x, y } = project(p.time, p.multiplier);
        if (first) {
          filled.moveTo(x, y);
          first = false;
        } else {
          filled.lineTo(x, y);
        }
      }
      const lastPoint = points[points.length - 1];
      const headProj = project(lastPoint.time, lastPoint.multiplier);
      const startProj = project(points[0].time, 1);
      filled.lineTo(headProj.x, h - padBottom);
      filled.lineTo(startProj.x, h - padBottom);
      filled.closePath();

      const fillGrad = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
      if (phase === 'completed') {
        fillGrad.addColorStop(0, 'rgba(165, 45, 37, 0.28)');
        fillGrad.addColorStop(1, 'rgba(165, 45, 37, 0)');
      } else {
        fillGrad.addColorStop(0, 'rgba(160, 224, 171, 0.22)');
        fillGrad.addColorStop(0.55, 'rgba(255, 172, 46, 0.15)');
        fillGrad.addColorStop(1, 'rgba(255, 172, 46, 0)');
      }
      ctx.fillStyle = fillGrad;
      ctx.fill(filled);

      // Curve path (used by both glow + crisp strokes).
      const curve = new Path2D();
      first = true;
      for (const p of points) {
        const { x, y } = project(p.time, p.multiplier);
        if (first) {
          curve.moveTo(x, y);
          first = false;
        } else {
          curve.lineTo(x, y);
        }
      }

      const strokeGrad = ctx.createLinearGradient(padLeft, 0, w - padRight, 0);
      if (phase === 'completed') {
        strokeGrad.addColorStop(0, 'rgba(255, 138, 118, 0.95)');
        strokeGrad.addColorStop(1, 'rgba(165, 45, 37, 0.95)');
      } else {
        strokeGrad.addColorStop(0, 'rgba(160, 224, 171, 0.95)');
        strokeGrad.addColorStop(0.55, 'rgba(255, 172, 46, 0.95)');
        strokeGrad.addColorStop(1, 'rgba(165, 45, 37, 0.95)');
      }

      // ---------- Layer 3: wide outer glow ----------
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = strokeGrad;
      ctx.stroke(curve);

      // ---------- Layer 4: crisp inner stroke ----------
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3.5;
      ctx.stroke(curve);

      // ---------- Layer 5: head ornament ----------
      const t = performance.now() / 1000;
      // Rocket exhaust — a soft radial behind the head.
      const flameR = 22 + Math.sin(t * 5) * 2;
      const flame = ctx.createRadialGradient(
        headProj.x - 4,
        headProj.y + 4,
        0,
        headProj.x - 4,
        headProj.y + 4,
        flameR
      );
      flame.addColorStop(0, 'rgba(255, 220, 150, 0.70)');
      flame.addColorStop(0.45, 'rgba(255, 172, 46, 0.40)');
      flame.addColorStop(1, 'rgba(255, 172, 46, 0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.arc(headProj.x - 4, headProj.y + 4, flameR, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing ring
      const pulseR = 9 + Math.sin(t * 4) * 1.5;
      ctx.lineWidth = 1.3;
      ctx.strokeStyle =
        phase === 'completed'
          ? 'rgba(255, 138, 118, 0.55)'
          : 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(headProj.x, headProj.y, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      // White dot
      ctx.beginPath();
      ctx.arc(headProj.x, headProj.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle =
        phase === 'completed'
          ? 'rgba(255, 138, 118, 1)'
          : 'rgba(255, 255, 255, 1)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle =
        phase === 'completed'
          ? 'rgba(165, 45, 37, 0.85)'
          : 'rgba(160, 224, 171, 0.7)';
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
            'radial-gradient(120% 100% at 50% 100%, rgba(165, 45, 37, 0.28) 0%, rgba(255, 172, 46, 0.16) 35%, rgba(160, 224, 171, 0.10) 65%, transparent 85%)',
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
            'radial-gradient(circle, rgba(160, 224, 171, 0.16) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-12 -right-10 w-56 h-56 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 172, 46, 0.14) 0%, transparent 70%)',
        }}
      />

      {/* Curve canvas — sits ABOVE the atmospheric washes so the grid
          and stroke render against a flat dark backdrop. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'auto' }}
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
            {(phase === 'active' ||
              phase === 'completed' ||
              phase === 'resolving') && (
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
                    'text-[58px] sm:text-[72px]',
                    phase === 'completed'
                      ? 'text-[#ff8a76]'
                      : 'text-frost-white'
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
            <Shield
              size={11}
              className="text-frost-white/60"
              strokeWidth={2}
            />
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
            <Wifi
              size={11}
              className="text-frost-white/60"
              strokeWidth={2}
            />
            <span className="text-[10px] font-roobert text-frost-white/70 tabular-nums">
              {connected ? `${latencyMs} ms` : 'нет связи'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

// Suppress unused-import warning for Rocket — kept on the surface for
// possible future "rocket avatar" overlays at the curve's head.
void Rocket;

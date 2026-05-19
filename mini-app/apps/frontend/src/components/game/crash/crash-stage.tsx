'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Wifi } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CrashLiveStream } from '@/lib/games/crash/crash-live-stream';

/**
 * Crash Stage — Premium Curve v3
 *
 * Complete rewrite of the canvas paint pipeline. Goals:
 *
 *   - Smoothly interpolated curve (Catmull-Rom → Bezier so adjacent
 *     points join without visible kinks).
 *   - Four stacked stroke layers for depth: outer halo (soft glow),
 *     mid bloom, crisp core, gloss highlight.
 *   - Animated grid with smoothly fading multiplier ticks.
 *   - "Live" multiplier indicator pill on the right edge that follows
 *     the curve's head and reads the current value.
 *   - Smooth scaling: xWindow and yLogMax are lerped each frame, so
 *     the visible window expands organically instead of snapping in
 *     3-second chunks.
 *   - Head ornament: pulsing ring + soft glow + particle trail.
 *
 * Performance is intact — the draw loop is still single-pass on a
 * cached pin/grid layer. ResizeObserver re-rasterises only on layout
 * changes. DPR capped at 1.5 on touch.
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
  waitingEndsAt: number | null;
  serverSeedHash: string;
  latencyMs: number;
  connected: boolean;
  lastCrashPoint: number | null;
}

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

    // Lerped scale state — gives a smooth visual expansion of the
    // window even though the underlying point buffer is discrete.
    let xWindowLerp = 6000;
    let yLogMaxLerp = Math.log(2.5);

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

    /**
     * Draw a smooth open curve through `pts` using Catmull-Rom →
     * cubic Bezier conversion. The curve passes through every
     * point exactly; control points are derived from neighbours.
     */
    const strokeSmoothCurve = (
      pts: Array<{ x: number; y: number }>
    ): void => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      ctx.stroke();
    };

    const fillSmoothArea = (
      pts: Array<{ x: number; y: number }>,
      baseY: number
    ): void => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, baseY);
      ctx.lineTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      ctx.lineTo(pts[pts.length - 1].x, baseY);
      ctx.closePath();
      ctx.fill();
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (needsResize) resize();

      const w = lastSize.w;
      const h = lastSize.h;
      if (!w || !h) return;

      ctx.clearRect(0, 0, w, h);

      const isPaused =
        phase === 'waiting' || phase === 'starting' || phase === 'idle';

      const padLeft = 36;
      const padRight = 56;
      const padTop = 40;
      const padBottom = 28;
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

      const lastT =
        points.length >= 2 ? points[points.length - 1].time || 1 : 1;
      const lastM =
        points.length >= 2 ? points[points.length - 1].multiplier || 1 : 1;

      // Smooth scale: target window grows continuously with elapsed
      // time + a 25% headroom so the head sits ~80% from the left.
      const xTarget = Math.max(6000, lastT * 1.25);
      const yTarget = Math.max(Math.log(2.5), Math.log(lastM * 1.25));

      // Lerp both axes per frame. 0.06 ≈ ~1s settle at 60fps which feels
      // organic without being laggy.
      xWindowLerp += (xTarget - xWindowLerp) * 0.06;
      yLogMaxLerp += (yTarget - yLogMaxLerp) * 0.06;

      // Reset lerp targets when the round boundary flips so the
      // first frame of a new round doesn't carry the old scale.
      if (isPaused) {
        xWindowLerp = 6000;
        yLogMaxLerp = Math.log(2.5);
      }

      const xWindow = xWindowLerp;
      const yLogMax = yLogMaxLerp;

      const project = (t: number, m: number) => {
        const x = padLeft + (t / xWindow) * innerW;
        const yFrac = Math.log(Math.max(1, m)) / yLogMax;
        const y = h - padBottom - yFrac * innerH;
        return { x, y };
      };

      // ===================================================================
      // Layer 1 — grid + tick labels
      // ===================================================================
      ctx.lineWidth = 1;
      ctx.font =
        '500 10px ui-sans-serif, system-ui, "Segoe UI", Roobert, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';

      // Light vertical grid every ~5 sec — gives the curve forward motion.
      const VERT_STEP_S = 5;
      const xWinSec = xWindow / 1000;
      for (let s = 0; s <= xWinSec + 0.01; s += VERT_STEP_S) {
        const x = padLeft + (s / xWinSec) * innerW;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, h - padBottom);
        ctx.stroke();
      }

      for (const tick of Y_TICKS) {
        if (Math.log(tick) > yLogMax + 0.01) continue;
        const yFrac = Math.log(tick) / yLogMax;
        const y = h - padBottom - yFrac * innerH;
        // Fade ticks that are about to scroll off the top.
        const fade = Math.min(1, (yLogMax + 0.01 - Math.log(tick)) * 5);
        ctx.strokeStyle =
          tick === 1
            ? `rgba(255,255,255,${0.16 * fade})`
            : `rgba(255,255,255,${0.06 * fade})`;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();
        ctx.fillStyle =
          tick === 1
            ? `rgba(255,255,255,${0.6 * fade})`
            : `rgba(255,255,255,${0.36 * fade})`;
        ctx.fillText(`${tick}×`, padLeft - 6, y);
      }

      if (points.length < 2 || isPaused) {
        // Stage idle/waiting/starting — only the grid + axes.
        return;
      }

      // Project all points once.
      const projected = points.map((p) => project(p.time, p.multiplier));
      const headProj = projected[projected.length - 1];

      // ===================================================================
      // Layer 2 — area fill (deep ocean wash)
      // ===================================================================
      const fillGrad = ctx.createLinearGradient(
        0,
        padTop,
        0,
        h - padBottom
      );
      if (phase === 'completed') {
        fillGrad.addColorStop(0, 'rgba(165, 45, 37, 0.32)');
        fillGrad.addColorStop(1, 'rgba(165, 45, 37, 0)');
      } else {
        fillGrad.addColorStop(0, 'rgba(160, 224, 171, 0.26)');
        fillGrad.addColorStop(0.55, 'rgba(255, 172, 46, 0.16)');
        fillGrad.addColorStop(1, 'rgba(255, 172, 46, 0)');
      }
      ctx.fillStyle = fillGrad;
      fillSmoothArea(projected, h - padBottom);

      // ===================================================================
      // Layer 3 — outer halo (soft, wide)
      // ===================================================================
      const strokeGrad = ctx.createLinearGradient(padLeft, 0, w - padRight, 0);
      if (phase === 'completed') {
        strokeGrad.addColorStop(0, 'rgba(255, 138, 118, 1)');
        strokeGrad.addColorStop(1, 'rgba(165, 45, 37, 1)');
      } else {
        strokeGrad.addColorStop(0, 'rgba(160, 224, 171, 1)');
        strokeGrad.addColorStop(0.55, 'rgba(255, 172, 46, 1)');
        strokeGrad.addColorStop(1, 'rgba(165, 45, 37, 1)');
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = strokeGrad;

      // Outer halo
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 12;
      strokeSmoothCurve(projected);

      // Mid bloom
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 6;
      strokeSmoothCurve(projected);

      // Core stroke
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3.2;
      strokeSmoothCurve(projected);

      // Gloss highlight (thin, white-tinted, slightly lighter)
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      strokeSmoothCurve(projected);
      ctx.globalAlpha = 1;

      // ===================================================================
      // Layer 4 — head ornament
      // ===================================================================
      const t = performance.now() / 1000;

      // Particle trail — a few dots tracing the curve behind the head.
      for (let i = 1; i <= 4 && projected.length - 1 - i * 2 >= 0; i++) {
        const p = projected[projected.length - 1 - i * 2];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2 - i * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 160, ${0.45 - i * 0.1})`;
        ctx.fill();
      }

      // Soft radial flame behind the dot.
      const flameR = 28 + Math.sin(t * 5) * 3;
      const flame = ctx.createRadialGradient(
        headProj.x - 4,
        headProj.y + 4,
        0,
        headProj.x - 4,
        headProj.y + 4,
        flameR
      );
      flame.addColorStop(0, 'rgba(255, 220, 150, 0.65)');
      flame.addColorStop(0.45, 'rgba(255, 172, 46, 0.32)');
      flame.addColorStop(1, 'rgba(255, 172, 46, 0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.arc(headProj.x - 4, headProj.y + 4, flameR, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing outer ring
      const pulseR = 11 + Math.sin(t * 4) * 1.8;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle =
        phase === 'completed'
          ? 'rgba(255, 138, 118, 0.6)'
          : 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(headProj.x, headProj.y, pulseR, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle =
        phase === 'completed'
          ? 'rgba(255, 138, 118, 0.95)'
          : 'rgba(160, 224, 171, 0.95)';
      ctx.beginPath();
      ctx.arc(headProj.x, headProj.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Solid head dot
      ctx.beginPath();
      ctx.arc(headProj.x, headProj.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle =
        phase === 'completed'
          ? 'rgba(255, 138, 118, 1)'
          : 'rgba(255, 255, 255, 1)';
      ctx.fill();

      // ===================================================================
      // Layer 5 — head value pill on the right edge
      // ===================================================================
      const live = stream.getFast().displayMultiplier;
      const valueText = `${live.toFixed(2)}×`;
      ctx.font =
        '600 12px ui-sans-serif, system-ui, "Segoe UI", Roobert, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const pillX = Math.min(w - padRight + 4, headProj.x + 12);
      const pillY = headProj.y;
      const txtW = ctx.measureText(valueText).width;
      const pillW = txtW + 14;
      const pillH = 22;
      // Pill background
      ctx.fillStyle =
        phase === 'completed'
          ? 'rgba(165, 45, 37, 0.95)'
          : 'rgba(20, 20, 20, 0.95)';
      ctx.beginPath();
      const r = 11;
      ctx.moveTo(pillX + r, pillY - pillH / 2);
      ctx.lineTo(pillX + pillW - r, pillY - pillH / 2);
      ctx.arc(pillX + pillW - r, pillY, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(pillX + r, pillY + pillH / 2);
      ctx.arc(pillX + r, pillY, r, Math.PI / 2, -Math.PI / 2);
      ctx.fill();
      // Pill border
      ctx.lineWidth = 1;
      ctx.strokeStyle =
        phase === 'completed'
          ? 'rgba(255, 138, 118, 0.7)'
          : 'rgba(255, 172, 46, 0.55)';
      ctx.stroke();
      // Pill text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillText(valueText, pillX + 7, pillY);

      // Update the centre multiplier text.
      if (
        multiplierTextRef.current &&
        (phase === 'active' || phase === 'completed' || phase === 'resolving')
      ) {
        if (multiplierTextRef.current.textContent !== valueText) {
          multiplierTextRef.current.textContent = valueText;
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
      {/* Atmospheric backdrop */}
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 100%, rgba(165, 45, 37, 0.30) 0%, rgba(255, 172, 46, 0.16) 35%, rgba(160, 224, 171, 0.10) 65%, transparent 85%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 0%, rgba(0, 0, 0, 0.65) 0%, transparent 70%)',
        }}
      />
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

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'auto' }}
      />

      <div className="relative aspect-[16/11] sm:aspect-[16/9] flex flex-col">
        {/* Top-left phase plate */}
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
                  Countdown
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
                  Betting open
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
                  Connecting…
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Centre multiplier */}
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
                    ? `${lastCrashPoint.toFixed(2)}×`
                    : '1.00×'}
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.22em] text-whisper-gray font-roobert">
                  {phase === 'completed' ? 'Crashed' : 'Multiplier'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom info row */}
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
                : 'loading hash'}
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
              {connected ? `${latencyMs} ms` : 'offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

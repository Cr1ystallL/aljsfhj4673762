'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Wifi, Check } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CrashLiveStream } from '@/lib/games/crash/crash-live-stream';
import { useT } from '@/i18n/use-t';

/**
 * Crash Stage — MacvJet flight scene.
 *
 * Not a stock chart. The server curve is a flight path: night sky,
 * contrail, a rocket on the tangent, exhaust, cashout flares, a
 * restrained crash bloom. Axes and "1.5×" grid lines stay gone.
 *
 * Fast path: one rAF loop reads `stream.getFast()`. React only owns
 * phase chrome (countdown, hash, latency).
 */

type Phase =
  | 'idle'
  | 'waiting'
  | 'starting'
  | 'active'
  | 'resolving'
  | 'completed';

export interface CrashCashoutMark {
  key: string;
  multiplier: number;
}

interface CrashStageProps {
  stream: CrashLiveStream | null;
  phase: Phase;
  countdown: number | null;
  waitingEndsAt: number | null;
  serverSeedHash: string;
  latencyMs: number;
  connected: boolean;
  lastCrashPoint: number | null;
  cashouts?: CrashCashoutMark[];
}

interface Pt {
  x: number;
  y: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
}

const STARS = Array.from({ length: 56 }, (_, i) => {
  const a = Math.sin(i * 127.1) * 43758.5453;
  const b = Math.sin(i * 269.5 + 1.7) * 22421.213;
  return {
    x: a - Math.floor(a),
    y: (b - Math.floor(b)) * 0.78,
    r: 0.45 + (i % 3) * 0.35,
    a: 0.12 + (i % 5) * 0.07,
    tw: 0.4 + (i % 7) * 0.12,
  };
});

function subsample(pts: Pt[], maxN: number): Pt[] {
  if (pts.length <= maxN) return pts;
  const out: Pt[] = new Array(maxN);
  const step = (pts.length - 1) / (maxN - 1);
  for (let i = 0; i < maxN; i++) {
    out[i] = pts[Math.round(i * step)];
  }
  out[maxN - 1] = pts[pts.length - 1];
  return out;
}

function heat(m: number, crashed: boolean): { r: number; g: number; b: number } {
  if (crashed) return { r: 255, g: 122, b: 104 };
  if (m < 2) {
    const t = (m - 1) / 1;
    return {
      r: 160 + (255 - 160) * t,
      g: 224 + (172 - 224) * t,
      b: 171 + (46 - 171) * t,
    };
  }
  if (m < 8) {
    const t = Math.min(1, (m - 2) / 6);
    return {
      r: 255,
      g: 172 + (45 - 172) * t,
      b: 46 + (37 - 46) * t,
    };
  }
  return { r: 165, g: 45, b: 37 };
}

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;
}

function strokeSmooth(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y
    );
  }
  ctx.stroke();
}

function fillWake(ctx: CanvasRenderingContext2D, pts: Pt[], baseY: number): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, baseY);
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y
    );
  }
  ctx.lineTo(pts[pts.length - 1].x, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawRocket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: { r: number; g: number; b: number },
  t: number,
  crashed: boolean
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const flicker = 0.82 + Math.sin(t * 28) * 0.18;

  if (!crashed) {
    const flame = ctx.createRadialGradient(-18, 0, 0, -18, 0, 22);
    flame.addColorStop(0, `rgba(255,240,200,${0.85 * flicker})`);
    flame.addColorStop(0.35, rgba(color, 0.45 * flicker));
    flame.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.ellipse(-20, 0, 18 + flicker * 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = crashed ? 'rgba(255,150,130,0.92)' : 'rgba(248,248,250,0.96)';
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.quadraticCurveTo(10, -6.5, -2, -5.5);
  ctx.lineTo(-15, -3.6);
  ctx.lineTo(-15, 3.6);
  ctx.lineTo(-2, 5.5);
  ctx.quadraticCurveTo(10, 6.5, 22, 0);
  ctx.fill();

  ctx.fillStyle = crashed ? 'rgba(165,45,37,0.85)' : 'rgba(20,20,22,0.92)';
  ctx.beginPath();
  ctx.moveTo(-1, -5);
  ctx.lineTo(-11, -15);
  ctx.lineTo(5, -3.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-1, 5);
  ctx.lineTo(-11, 15);
  ctx.lineTo(5, 3.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = crashed ? 'rgba(255,180,160,0.7)' : 'rgba(160,224,171,0.55)';
  ctx.beginPath();
  ctx.ellipse(7, 0, 5.2, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = rgba(color, crashed ? 0.55 : 0.95);
  ctx.fillRect(-17.5, -2.4, 4, 4.8);

  ctx.restore();
}

function drawShards(
  ctx: CanvasRenderingContext2D,
  shards: Shard[],
  color: { r: number; g: number; b: number }
): void {
  for (const s of shards) {
    const a = Math.max(0, s.life);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(color, 0.9);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
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
  cashouts = [],
}: CrashStageProps) {
  const { t } = useT();
  void countdown;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multiplierTextRef = useRef<HTMLSpanElement>(null);
  const cashoutsRef = useRef(cashouts);
  cashoutsRef.current = cashouts;

  const [copiedHash, setCopiedHash] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if ((phase !== 'waiting' && phase !== 'starting') || !waitingEndsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase, waitingEndsAt]);

  const timeRemaining =
    (phase === 'waiting' || phase === 'starting') && waitingEndsAt
      ? Math.max(0, Math.ceil((waitingEndsAt - now) / 1000))
      : null;

  useEffect(() => {
    if (!stream) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);

    let raf = 0;
    let lastSize = { w: 0, h: 0 };
    let needsResize = true;
    let lastTs = 0;
    let xWindowLerp = 6000;
    let yLogMaxLerp = Math.log(2.5);
    let crashT = 0;
    const sparks: Spark[] = [];
    const shards: Shard[] = [];
    let shardsSpawned = false;

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

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (needsResize) resize();

      const w = lastSize.w;
      const h = lastSize.h;
      if (!w || !h) return;

      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      const clock = ts / 1000;

      ctx.clearRect(0, 0, w, h);

      const isPaused =
        phase === 'waiting' || phase === 'starting' || phase === 'idle';
      const crashed = phase === 'completed' || phase === 'resolving';

      const padLeft = 18;
      const padRight = 44;
      const padTop = 22;
      const padBottom = 34;
      const innerW = Math.max(1, w - padLeft - padRight);
      const innerH = Math.max(1, h - padTop - padBottom);

      const graph = stream.getFast().graphPoints;
      let firstIdx = 0;
      for (let i = graph.length - 1; i > 0; i--) {
        if (graph[i].time < graph[i - 1].time) {
          firstIdx = i;
          break;
        }
      }
      let points = firstIdx > 0 ? graph.slice(firstIdx) : graph;
      if (points.length === 0 || points[0].time > 5 || points[0].multiplier > 1.001) {
        points = [{ time: 0, multiplier: 1 }, ...points];
      }

      const lastT = points.length >= 2 ? points[points.length - 1].time || 1 : 1;
      const lastM =
        points.length >= 2 ? points[points.length - 1].multiplier || 1 : 1;

      const xTarget = Math.max(6000, lastT * 1.18);
      const yTarget = Math.max(Math.log(2.5), Math.log(lastM * 1.22));
      xWindowLerp += (xTarget - xWindowLerp) * 0.06;
      yLogMaxLerp += (yTarget - yLogMaxLerp) * 0.06;
      if (isPaused) {
        xWindowLerp = 6000;
        yLogMaxLerp = Math.log(2.5);
        crashT = 0;
        shardsSpawned = false;
        shards.length = 0;
      }

      const xWindow = xWindowLerp;
      const yLogMax = yLogMaxLerp;
      const project = (t: number, m: number): Pt => {
        const x = padLeft + (t / xWindow) * innerW;
        const yFrac = Math.log(Math.max(1, m)) / yLogMax;
        const y = h - padBottom - yFrac * innerH;
        return { x, y };
      };

      const climb = isPaused ? 0 : Math.min(1, Math.log(lastM) / Math.log(20));
      const skyShift = reduceMotion ? 0 : climb * 10;

      for (const s of STARS) {
        const tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(clock * s.tw + s.x * 8);
        ctx.fillStyle = `rgba(255,255,255,${s.a * tw})`;
        ctx.beginPath();
        ctx.arc(
          ((s.x * w + skyShift) % w + w) % w,
          s.y * (h - padBottom),
          s.r,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      const horizon = ctx.createLinearGradient(0, h * 0.55, 0, h);
      horizon.addColorStop(0, 'rgba(0,0,0,0)');
      horizon.addColorStop(
        0.55,
        crashed ? 'rgba(80,18,14,0.35)' : 'rgba(18,10,6,0.28)'
      );
      horizon.addColorStop(
        1,
        crashed ? 'rgba(40,8,6,0.55)' : 'rgba(8,6,4,0.5)'
      );
      ctx.fillStyle = horizon;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);

      const rim = ctx.createRadialGradient(
        padLeft + 8,
        h - padBottom,
        0,
        padLeft + 8,
        h - padBottom,
        140
      );
      rim.addColorStop(0, crashed ? 'rgba(165,45,37,0.22)' : 'rgba(255,172,46,0.16)');
      rim.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(padLeft + 8, h - padBottom + 8, 140, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = crashed
        ? 'rgba(255,138,118,0.16)'
        : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - padBottom + 0.5);
      ctx.lineTo(w, h - padBottom + 0.5);
      ctx.stroke();

      const origin = project(0, 1);
      const flying = points.length >= 2 && !isPaused;
      const projected = flying ? subsample(points.map((p) => project(p.time, p.multiplier)), 80) : [origin];
      const head = projected[projected.length - 1];
      const prev = projected[Math.max(0, projected.length - 3)];
      const ang = flying
        ? Math.atan2(head.y - prev.y, head.x - prev.x)
        : -0.42 + (reduceMotion ? 0 : Math.sin(clock * 1.4) * 0.04);
      const rocketPos = flying
        ? head
        : {
            x: origin.x + 10,
            y: origin.y - 8 + (reduceMotion ? 0 : Math.sin(clock * 2.1) * 2),
          };
      const color = heat(lastM, crashed);

      if (flying) {
        const wake = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
        wake.addColorStop(0, rgba(color, crashed ? 0.2 : 0.14));
        wake.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = wake;
        fillWake(ctx, projected, h - padBottom);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(color, 0.16);
        ctx.lineWidth = 18;
        strokeSmooth(ctx, projected);
        ctx.strokeStyle = rgba(color, 0.4);
        ctx.lineWidth = 7;
        strokeSmooth(ctx, projected);
        ctx.strokeStyle = rgba(color, 0.95);
        ctx.lineWidth = 2.6;
        strokeSmooth(ctx, projected);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        strokeSmooth(ctx, projected);
      }

      const marks = cashoutsRef.current;
      if (flying && marks.length) {
        const shown = marks.slice(-12);
        ctx.font = '600 10px ui-sans-serif, system-ui, Roobert, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (const mark of shown) {
          let best = projected[0];
          let bestD = Infinity;
          for (let i = 0; i < points.length; i++) {
            const d = Math.abs(points[i].multiplier - mark.multiplier);
            if (d < bestD) {
              bestD = d;
              best = project(points[i].time, points[i].multiplier);
            }
          }
          ctx.fillStyle = 'rgba(255,220,160,0.9)';
          ctx.beginPath();
          ctx.moveTo(best.x, best.y - 5);
          ctx.lineTo(best.x + 3.5, best.y);
          ctx.lineTo(best.x, best.y + 5);
          ctx.lineTo(best.x - 3.5, best.y);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.72)';
          ctx.fillText(`${mark.multiplier.toFixed(2)}×`, best.x, best.y - 8);
        }
      }

      if (!reduceMotion) {
        const tailX = rocketPos.x - Math.cos(ang) * 16;
        const tailY = rocketPos.y - Math.sin(ang) * 16;
        if (!crashed && sparks.length < 48 && (flying || !isPaused || phase === 'waiting' || phase === 'starting')) {
          const n = flying ? 2 : 1;
          for (let i = 0; i < n; i++) {
            sparks.push({
              x: tailX + (Math.random() - 0.5) * 4,
              y: tailY + (Math.random() - 0.5) * 4,
              vx: -Math.cos(ang) * (40 + Math.random() * 50) + (Math.random() - 0.5) * 20,
              vy: -Math.sin(ang) * (40 + Math.random() * 50) + (Math.random() - 0.5) * 20,
              life: 1,
              max: 0.35 + Math.random() * 0.25,
              size: flying ? 1.6 : 1.2,
            });
          }
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.life -= dt / s.max;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.life <= 0) {
            sparks.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = Math.max(0, s.life);
          ctx.fillStyle = rgba(color, 0.85);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (crashed) {
        crashT = Math.min(1, crashT + dt / 0.85);
        if (!shardsSpawned) {
          shardsSpawned = true;
          for (let i = 0; i < 5; i++) {
            const a = ang + (i - 2) * 0.55;
            shards.push({
              x: rocketPos.x,
              y: rocketPos.y,
              vx: Math.cos(a) * (70 + i * 18),
              vy: Math.sin(a) * (70 + i * 18) - 20,
              rot: a,
              vr: (i - 2) * 6,
              life: 1,
            });
          }
        }
        const shock = 12 + crashT * 70;
        ctx.strokeStyle = `rgba(255,138,118,${(1 - crashT) * 0.55})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rocketPos.x, rocketPos.y, shock, 0, Math.PI * 2);
        ctx.stroke();
        const bloom = ctx.createRadialGradient(
          rocketPos.x,
          rocketPos.y,
          0,
          rocketPos.x,
          rocketPos.y,
          80
        );
        bloom.addColorStop(0, `rgba(255,180,140,${(1 - crashT) * 0.45})`);
        bloom.addColorStop(1, 'rgba(165,45,37,0)');
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(rocketPos.x, rocketPos.y, 80, 0, Math.PI * 2);
        ctx.fill();

        for (const s of shards) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 80 * dt;
          s.rot += s.vr * dt;
          s.life -= dt / 0.9;
        }
        drawShards(ctx, shards, color);
      } else {
        drawRocket(ctx, rocketPos.x, rocketPos.y, ang, color, clock, false);
      }

      if (
        multiplierTextRef.current &&
        (phase === 'active' || phase === 'completed' || phase === 'resolving')
      ) {
        const live = stream.getFast().displayMultiplier;
        const valueText = `${live.toFixed(2)}×`;
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
    <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-midnight-canvas">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            phase === 'completed'
              ? 'radial-gradient(90% 80% at 70% 30%, rgba(165,45,37,0.28) 0%, rgba(0,0,0,0.2) 55%, #000 100%)'
              : 'radial-gradient(100% 90% at 20% 100%, rgba(255,172,46,0.12) 0%, rgba(160,224,171,0.05) 40%, transparent 70%), radial-gradient(80% 60% at 80% 10%, rgba(20,16,28,0.7) 0%, transparent 60%)',
        }}
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'auto' }}
      />

      <div className="relative aspect-[16/11] sm:aspect-[16/9] flex flex-col">
        <div className="absolute top-5 left-5 z-10">
          <AnimatePresence mode="wait">
            {phase === 'waiting' && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-black/55 border border-white/10"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                  {t('crash.bettingOpen')}
                </span>
                {timeRemaining !== null && (
                  <span className="font-roobert text-frost-white text-[13px] tabular-nums leading-none">
                    {String(Math.floor(timeRemaining / 60)).padStart(2, '0')}:
                    {String(timeRemaining % 60).padStart(2, '0')}
                  </span>
                )}
              </motion.div>
            )}
            {phase === 'starting' && (
              <motion.div
                key="starting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-[rgba(255,172,46,0.12)] border border-[rgba(255,172,46,0.3)]"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-[#ffac2e] font-roobert">
                  {t('crash.startingIn')}
                </span>
                {timeRemaining !== null && (
                  <span className="font-roobert text-[#ffac2e] text-[13px] tabular-nums leading-none font-bold">
                    {timeRemaining}s
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
                className="px-4 py-1.5 rounded-pill bg-black/35 border border-white/10"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                  {t('crash.connecting')}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 flex items-start justify-center pt-12 sm:pt-14 pointer-events-none">
          <AnimatePresence mode="wait">
            {(phase === 'active' ||
              phase === 'completed' ||
              phase === 'resolving') && (
              <motion.div
                key={phase}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                className="flex flex-col items-center"
              >
                <span
                  ref={multiplierTextRef}
                  className={cn(
                    'font-roobert font-light leading-none tabular-nums tracking-[-0.03em]',
                    'text-[58px] sm:text-[72px]',
                    phase === 'completed'
                      ? 'text-[#ff8a76]'
                      : 'text-frost-white'
                  )}
                  style={{
                    textShadow:
                      phase === 'completed'
                        ? '0 0 36px rgba(165, 45, 37, 0.55)'
                        : '0 0 32px rgba(255, 255, 255, 0.16)',
                    willChange: 'contents',
                  }}
                >
                  {phase === 'completed' && lastCrashPoint !== null
                    ? `${lastCrashPoint.toFixed(2)}×`
                    : '1.00×'}
                </span>
                <span className="mt-2 text-[10px] uppercase tracking-[0.22em] text-whisper-gray font-roobert">
                  {phase === 'completed' ? t('crash.crashed') : t('crash.multiplier')}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2 z-10">
          <button
            type="button"
            onClick={() => {
              if (serverSeedHash) {
                navigator.clipboard.writeText(serverSeedHash);
                setCopiedHash(true);
                setTimeout(() => setCopiedHash(false), 2000);
              }
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-black/65 border border-white/15 hover:border-emerald-400/50 hover:bg-black transition-all cursor-pointer"
            title={serverSeedHash ? 'Нажмите, чтобы скопировать полный SHA-256 хэш' : undefined}
          >
            {copiedHash ? (
              <Check size={11} className="text-emerald-400" strokeWidth={2.5} />
            ) : (
              <Shield size={11} className="text-frost-white/60" strokeWidth={2} />
            )}
            <span className="text-[10px] font-roobert text-frost-white/80 tracking-wider">
              {copiedHash ? (
                <span className="text-emerald-400 font-bold">Скопировано!</span>
              ) : serverSeedHash ? (
                `${serverSeedHash.slice(0, 10)}…`
              ) : (
                t('crash.loadingHash')
              )}
            </span>
          </button>

          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border',
              connected
                ? 'bg-black/55 border-white/10'
                : 'bg-[rgba(165,45,37,0.22)] border-[rgba(165,45,37,0.4)]'
            )}
          >
            <Wifi size={11} className="text-frost-white/60" strokeWidth={2} />
            <span className="text-[10px] font-roobert text-frost-white/70 tabular-nums">
              {connected ? `${latencyMs} ms` : t('crash.offline')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

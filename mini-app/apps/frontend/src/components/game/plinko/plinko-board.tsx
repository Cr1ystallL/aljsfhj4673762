'use client';

import { useEffect, useRef } from 'react';

/**
 * Plinko Board — Monopo Saigon Style, with proper-physics ball motion.
 *
 * Each ball follows a deterministic path that the server already
 * committed to (16 left/right decisions). Animation between pins is a
 * real parabolic arc — chosen so the visual feels physical:
 *
 *   - At each pin the ball "bounces": it gets an upward velocity that
 *     decays under gravity, peaks (~35% of segment height), then
 *     accelerates back down to the next pin.
 *   - Position over time uses the parabolic equation
 *         y(τ) = y_a + vy₀·τ + ½·g·τ²
 *     with constants tuned so the apex sits ~0.4·rowGap above the
 *     starting pin. This is asymmetric — the ball spends slightly more
 *     time approaching the apex than falling, exactly like a real bounce.
 *   - x(τ) is linear (no horizontal force in flight).
 *   - After the last pin the ball free-falls into the bucket with
 *     additional gravity, then a tiny squish-rest animation.
 *
 * Visual:
 *   - Pins: small frosted dots.
 *   - Walls: subtle deep-ocean tinted gradients.
 *   - Ball: frost-white with a soft halo + short fading trail.
 *   - Highlighted bucket flashes briefly when a ball lands.
 */

export interface PlinkoDrop {
  /** Unique id for this drop — used as a React key. */
  id: string;
  /** 16 binary decisions: 0=left, 1=right. */
  path: number[];
  /** Final bucket 0..16, derived from path but kept explicit. */
  bucket: number;
}

interface PlinkoBoardProps {
  rows: number;
  drops: PlinkoDrop[];
  /** Called whenever a ball reaches its final bucket. */
  onBallLanded?: (drop: PlinkoDrop) => void;
  /** Bucket index whose tile should flash for ~500ms (ball just landed). */
  highlightedBucket?: number | null;
}

interface ActiveBall {
  id: string;
  path: number[];
  bucket: number;
  startedAt: number;
  notified: boolean;
  trail: Array<{ x: number; y: number }>;
}

/* ---------------------------------------------------------------- timing */

/** Time per inter-pin segment in ms. 16 segments × 200ms ≈ 3.2 s drop. */
const SEG_DURATION_MS = 200;

/** Free-fall after the last pin — short, ball drops into bucket area. */
const BUCKET_FALL_MS = 320;

/**
 * Apex rise as a fraction of the segment's vertical drop. Bigger = more
 * pronounced bounce. 0.4 is the Goldilocks value visually.
 */
const PEAK_RATIO = 0.4;

/** Trail length in points. Small so it stays subtle. */
const TRAIL_LEN = 6;

/* ------------------------------------------------------------- trajectory */

/**
 * Parabolic y-offset within one inter-pin segment.
 *
 * Returns the *signed* offset above the starting pin (positive = below).
 * Derivation: choose constants g, vy0 such that
 *    y(0) = 0,
 *    y(1) = dy,
 *    apex rise = PEAK_RATIO · dy at apex time τ* = −vy0/g.
 * Solving the system gives vy0 = −2.3·dy and g = 6.6·dy (see comment in
 * the commit message for the algebra).
 */
function arcY(dy: number, tau: number): number {
  const g = 6.6 * dy;
  const vy0 = -2.3 * dy;
  return vy0 * tau + 0.5 * g * tau * tau;
}

/* -------------------------------------------------------------- component */

export function PlinkoBoard({
  rows,
  drops,
  onBallLanded,
  highlightedBucket,
}: PlinkoBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef = useRef<Map<string, ActiveBall>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const onLandedRef = useRef(onBallLanded);

  useEffect(() => {
    onLandedRef.current = onBallLanded;
  }, [onBallLanded]);

  // Sync `drops` → ballsRef map so newly added drops start animating.
  useEffect(() => {
    const now = performance.now();
    const seen = new Set<string>();
    for (const d of drops) {
      seen.add(d.id);
      if (!ballsRef.current.has(d.id)) {
        ballsRef.current.set(d.id, {
          id: d.id,
          path: d.path,
          bucket: d.bucket,
          startedAt: now,
          notified: false,
          trail: [],
        });
      }
    }
    // Drop balls that no longer appear in props (e.g. parent dismissed).
    for (const id of Array.from(ballsRef.current.keys())) {
      if (!seen.has(id)) ballsRef.current.delete(id);
    }
  }, [drops]);

  // Main draw loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /**
     * Layout cache + pre-rendered pin/wall layer.
     *
     * The pin grid and side walls are static — rebuilding their geometry
     * every frame burns CPU on mobile. We rasterise them into an
     * off-screen canvas once per resize and blit the cached bitmap into
     * the live canvas each frame. The dynamic ball + halo + trail still
     * paints on top.
     */
    let pinCache: HTMLCanvasElement | null = null;
    let cachedW = 0;
    let cachedH = 0;
    let layout = {
      padX: 16,
      padTop: 22,
      padBottom: 14,
      gap: 0,
      rowSpacing: 0,
      pinRadius: 0,
      ballRadius: 0,
      cx: 0,
      bucketLineY: 0,
      innerW: 0,
    };

    const computeLayout = (w: number, h: number) => {
      // Canvas-side padding. Kept tiny — the wall lines need 2 px to
      // breathe but anything bigger and the outer pins would no longer
      // sit above the leftmost / rightmost buckets.
      const padX = 2;
      const padTop = 22;
      const padBottom = 14;
      const innerW = w - padX * 2;
      const innerH = h - padTop - padBottom;
      // Pin spacing — chosen so the LAST row's pins span the full
      // inner width. Last row has `rows + 2` pins (i.e. 18 for rows=16),
      // which yields `rows + 1` = 17 inter-pin slots. Setting
      // `gap = innerW / (rows + 1)` makes one inter-pin slot equal to
      // one bucket width — so a ball finishing at "bucket k" lands
      // exactly above the centre of the strip's k-th cell.
      const gap = innerW / (rows + 1);
      const rowSpacing = innerH / (rows + 1);
      layout = {
        padX,
        padTop,
        padBottom,
        innerW,
        gap,
        rowSpacing,
        pinRadius: Math.max(1.6, Math.min(2.6, gap * 0.07)),
        ballRadius: Math.max(4, Math.min(7, gap * 0.18)),
        cx: w / 2,
        bucketLineY: padTop + rowSpacing * rows + rowSpacing * 0.5,
      };
    };

    const renderPinCache = (w: number, h: number, dpr: number) => {
      const c = document.createElement('canvas');
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      const cctx = c.getContext('2d');
      if (!cctx) return null;
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { padTop, gap, rowSpacing, pinRadius, cx } = layout;
      const pinY = (row: number) => padTop + (row + 1) * rowSpacing;

      // ----- Backdrop atmosphere -----
      // Soft Deep Ocean halo behind the pyramid — gives the board depth
      // without backdrop-filter (mobile WebView doesn't pay for inline
      // gradients). Painted into the cache so we don't redo it 60×/s.
      const atmos = cctx.createRadialGradient(
        cx,
        padTop + (rowSpacing * rows) / 2,
        gap,
        cx,
        padTop + (rowSpacing * rows) / 2,
        Math.max(w, h) * 0.6
      );
      atmos.addColorStop(0, 'rgba(160, 224, 171, 0.06)');
      atmos.addColorStop(0.5, 'rgba(255, 172, 46, 0.04)');
      atmos.addColorStop(1, 'rgba(0, 0, 0, 0)');
      cctx.fillStyle = atmos;
      cctx.fillRect(0, 0, w, h);

      // ----- Side walls — angled brand-tinted rails -----
      const wallTopY = padTop;
      const wallBotY = pinY(rows - 1);
      const wallTopHalf = gap;
      const wallBotHalf = gap * (rows + 1) * 0.5;
      const drawWall = (sign: -1 | 1, color: string) => {
        cctx.beginPath();
        cctx.moveTo(cx + sign * wallTopHalf, wallTopY);
        cctx.lineTo(cx + sign * wallBotHalf, wallBotY);
        cctx.strokeStyle = color;
        cctx.lineWidth = 1.4;
        cctx.shadowColor = color;
        cctx.shadowBlur = 6;
        cctx.stroke();
        cctx.shadowBlur = 0;
      };
      drawWall(-1, 'rgba(160, 224, 171, 0.32)');
      drawWall(1, 'rgba(255, 172, 46, 0.32)');

      // ----- Pins — soft 3D dome look -----
      // Each pin is a tiny radial-gradient sphere with a thin rim and
      // a subtle drop-shadow underneath. We pre-render once and blit
      // the whole layer in the live loop.
      for (let row = 0; row < rows; row++) {
        const pinsInRow = row + 3;
        const y = pinY(row);
        for (let col = 0; col < pinsInRow; col++) {
          const x = cx + (col - (pinsInRow - 1) / 2) * gap;

          // Drop shadow
          cctx.beginPath();
          cctx.arc(x, y + pinRadius * 0.6, pinRadius * 1.05, 0, Math.PI * 2);
          cctx.fillStyle = 'rgba(0,0,0,0.45)';
          cctx.fill();

          // Body
          const grad = cctx.createRadialGradient(
            x - pinRadius * 0.25,
            y - pinRadius * 0.35,
            0,
            x,
            y,
            pinRadius * 1.25
          );
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          grad.addColorStop(0.55, 'rgba(220, 220, 220, 0.85)');
          grad.addColorStop(1, 'rgba(120, 120, 120, 0.55)');
          cctx.fillStyle = grad;
          cctx.beginPath();
          cctx.arc(x, y, pinRadius, 0, Math.PI * 2);
          cctx.fill();

          // Rim
          cctx.lineWidth = 0.6;
          cctx.strokeStyle = 'rgba(255,255,255,0.5)';
          cctx.stroke();
        }
      }
      return c;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Cap DPR at 1.5 on touch devices — most phones report 3x which
      // means we'd paint 9× the pixels. 1.5 is the sweet spot between
      // crispness and battery.
      const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cachedW = rect.width;
      cachedH = rect.height;
      computeLayout(cachedW, cachedH);
      pinCache = renderPinCache(cachedW, cachedH, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawFrame = () => {
      const w = cachedW;
      const h = cachedH;
      ctx.clearRect(0, 0, w, h);

      // Blit cached pin layer
      if (pinCache) ctx.drawImage(pinCache, 0, 0, w, h);

      const { padX, gap, ballRadius, cx, bucketLineY, innerW } = layout;
      const padTop = layout.padTop;
      const padBottom = layout.padBottom;
      const rowSpacing = layout.rowSpacing;
      const pinY = (row: number) => padTop + (row + 1) * rowSpacing;

      // -- Balls --
      const now = performance.now();
      const buckets = rows + 1;
      const bucketWidth = innerW / buckets;

      const totalDropDuration = SEG_DURATION_MS * rows + BUCKET_FALL_MS;

      // Skip frame if no balls and no highlight — nothing changes.
      if (ballsRef.current.size === 0 && highlightedBucket == null) {
        animFrameRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      for (const ball of ballsRef.current.values()) {
        const elapsed = now - ball.startedAt;

        // Compute ball position from path. We're either in one of the
        // `rows` parabolic segments or in the final bucket free-fall.
        let bx = cx;
        let by = pinY(-1); // i.e. one row above the top pin (release point)

        if (elapsed < SEG_DURATION_MS * rows) {
          // Parabolic segment between pin r → pin r+1
          const segIdx = Math.min(rows - 1, Math.floor(elapsed / SEG_DURATION_MS));
          const tau = (elapsed - segIdx * SEG_DURATION_MS) / SEG_DURATION_MS;

          // Pin at the start of this segment: cumulative left/right shifts.
          let xStart = cx;
          for (let i = 0; i < segIdx; i++) {
            xStart += (ball.path[i] === 1 ? 1 : -1) * (gap / 2);
          }
          const dir = ball.path[segIdx] === 1 ? 1 : -1;
          const xEnd = xStart + dir * (gap / 2);

          const yStart = pinY(segIdx);
          const yEnd = pinY(segIdx + 1);
          const dy = yEnd - yStart;

          // Linear x within the segment (no horizontal force in flight).
          bx = xStart + (xEnd - xStart) * tau;
          // Parabolic y — bounces up briefly, then falls.
          by = yStart + arcY(dy, tau);
        } else {
          // Free-fall into the bucket after the last pin.
          const fallElapsed = elapsed - SEG_DURATION_MS * rows;
          const fallProgress = Math.min(1, fallElapsed / BUCKET_FALL_MS);

          // Final pin position: cumulative shifts across all rows.
          let finalX = cx;
          for (let i = 0; i < rows; i++) {
            finalX += (ball.path[i] === 1 ? 1 : -1) * (gap / 2);
          }
          const yStart = pinY(rows - 1);
          const dy = bucketLineY - yStart;
          by = yStart + dy * fallProgress * fallProgress;
          bx = finalX;
        }

        // Update trail.
        ball.trail.push({ x: bx, y: by });
        while (ball.trail.length > TRAIL_LEN) ball.trail.shift();

        // Draw trail (oldest → newest, fading).
        for (let i = 0; i < ball.trail.length - 1; i++) {
          const p = ball.trail[i];
          const a = (i + 1) / ball.trail.length;
          ctx.beginPath();
          ctx.arc(p.x, p.y, ballRadius * 0.55 * a, 0, Math.PI * 2);
          // Trail picks up the ball's amber tint, fades to transparent.
          ctx.fillStyle = `rgba(255, 200, 120, ${0.18 * a})`;
          ctx.fill();
        }

        // Outer halo (warmer)
        const halo = ctx.createRadialGradient(
          bx,
          by,
          0,
          bx,
          by,
          ballRadius * 2.6
        );
        halo.addColorStop(0, 'rgba(255, 200, 120, 0.55)');
        halo.addColorStop(0.5, 'rgba(255, 172, 46, 0.18)');
        halo.addColorStop(1, 'rgba(255, 172, 46, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(bx, by, ballRadius * 2.6, 0, Math.PI * 2);
        ctx.fill();

        // Ball — amber/cream sphere with a small specular highlight.
        const body = ctx.createRadialGradient(
          bx - ballRadius * 0.35,
          by - ballRadius * 0.45,
          ballRadius * 0.1,
          bx,
          by,
          ballRadius
        );
        body.addColorStop(0, 'rgba(255, 248, 220, 1)');
        body.addColorStop(0.4, 'rgba(255, 220, 150, 1)');
        body.addColorStop(1, 'rgba(220, 140, 60, 1)');
        ctx.beginPath();
        ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
        ctx.fillStyle = body;
        ctx.fill();

        // Specular hot-spot
        ctx.beginPath();
        ctx.arc(
          bx - ballRadius * 0.35,
          by - ballRadius * 0.45,
          ballRadius * 0.32,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();

        // Rim
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(180, 100, 40, 0.85)';
        ctx.beginPath();
        ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Notify on landing — once.
        if (elapsed >= totalDropDuration && !ball.notified) {
          ball.notified = true;
          if (onLandedRef.current) {
            onLandedRef.current({
              id: ball.id,
              path: ball.path,
              bucket: ball.bucket,
            });
          }
          // Schedule removal after a short tail so the ball doesn't pop.
          setTimeout(() => {
            ballsRef.current.delete(ball.id);
          }, 150);
        }
      }

      // -- Highlighted bucket marker — upward burst when a ball lands -- //
      if (highlightedBucket != null) {
        const i = highlightedBucket;
        const bx = padX + bucketWidth * i + bucketWidth / 2;
        const by = h - padBottom - 2;
        // Vertical burst rays — short lines fanning up from the slot.
        ctx.lineWidth = 1.2;
        for (let k = -2; k <= 2; k++) {
          const angle = (Math.PI / 2) + k * 0.18;
          const len = 14 - Math.abs(k) * 2.5;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(angle - Math.PI) * len, by - Math.sin(angle) * len);
          ctx.strokeStyle = `rgba(255, 200, 120, ${0.55 - Math.abs(k) * 0.1})`;
          ctx.stroke();
        }
        // Soft glow puddle
        const puddle = ctx.createRadialGradient(bx, by, 0, bx, by, bucketWidth * 0.7);
        puddle.addColorStop(0, 'rgba(255, 200, 120, 0.55)');
        puddle.addColorStop(1, 'rgba(255, 200, 120, 0)');
        ctx.fillStyle = puddle;
        ctx.beginPath();
        ctx.arc(bx, by, bucketWidth * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(drawFrame);
    };

    animFrameRef.current = requestAnimationFrame(drawFrame);

    return () => {
      window.removeEventListener('resize', resize);
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [rows, highlightedBucket]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: 'auto' }}
    />
  );
}

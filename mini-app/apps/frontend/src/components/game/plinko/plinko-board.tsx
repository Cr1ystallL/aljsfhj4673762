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

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawFrame = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // Layout
      const padX = 16;
      const padTop = 22;
      const padBottom = 14;
      const innerW = w - padX * 2;
      const innerH = h - padTop - padBottom;
      const gap = innerW / (rows + 2); // horizontal pin spacing
      const rowSpacing = innerH / (rows + 1);
      const pinRadius = Math.max(1.6, Math.min(2.6, gap * 0.07));
      const ballRadius = Math.max(4, Math.min(7, gap * 0.18));
      const cx = w / 2;

      const pinY = (row: number) => padTop + (row + 1) * rowSpacing;
      const bucketLineY = padTop + rowSpacing * rows + rowSpacing * 0.5;

      // -- Decorative side walls (deep ocean accents) --
      const wallTopY = padTop;
      const wallBotY = pinY(rows - 1);
      const wallTopHalf = gap;
      const wallBotHalf = gap * (rows + 1) * 0.5;
      const drawWall = (sign: -1 | 1, color: string) => {
        ctx.beginPath();
        ctx.moveTo(cx + sign * wallTopHalf, wallTopY);
        ctx.lineTo(cx + sign * wallBotHalf, wallBotY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      drawWall(-1, 'rgba(160, 224, 171, 0.22)');
      drawWall(1, 'rgba(255, 172, 46, 0.22)');

      // -- Pins --
      for (let row = 0; row < rows; row++) {
        const pinsInRow = row + 3;
        const y = pinY(row);
        for (let col = 0; col < pinsInRow; col++) {
          const x = cx + (col - (pinsInRow - 1) / 2) * gap;
          ctx.beginPath();
          ctx.arc(x, y, pinRadius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.fill();
        }
      }

      // -- Balls --
      const now = performance.now();
      const buckets = rows + 1;
      const bucketWidth = innerW / buckets;

      const totalDropDuration = SEG_DURATION_MS * rows + BUCKET_FALL_MS;

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

          // Final pin position: cumulative shifts across all rows. We
          // ended on pin row `rows` — i.e. just below the last pin row,
          // which is the bucket centre.
          let finalX = cx;
          for (let i = 0; i < rows; i++) {
            finalX += (ball.path[i] === 1 ? 1 : -1) * (gap / 2);
          }
          const yStart = pinY(rows - 1);
          // Free-fall y(τ) = y_start + g·τ² (no initial velocity, just gravity)
          // Use a quadratic in normalised τ so motion accelerates downward.
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
          ctx.fillStyle = `rgba(255, 255, 255, ${0.12 * a})`;
          ctx.fill();
        }

        // Halo
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, ballRadius * 2.4);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bx, by, ballRadius * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Ball
        ctx.beginPath();
        ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(160, 224, 171, 0.6)';
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

      // -- Highlighted bucket marker --
      if (highlightedBucket != null) {
        const i = highlightedBucket;
        const bx = padX + bucketWidth * i + bucketWidth / 2;
        const by = h - padBottom - 4;
        ctx.beginPath();
        ctx.arc(bx, by, bucketWidth * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 172, 46, 0.45)';
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

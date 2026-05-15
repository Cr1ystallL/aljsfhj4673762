'use client';

import { useEffect, useRef } from 'react';

/**
 * Plinko Board — Monopo Saigon Style
 *
 * Pure-canvas board: 16 rows of pins arranged in a triangle, each row
 * has rowIndex+3 pins. The user sees a small ball drop from the top and
 * pinball its way down according to the server-determined path.
 *
 * The board is purely presentational. Animation is driven from the
 * outside via the `drops` prop — each drop carries a path (16 left/right
 * decisions) and the parent unmounts/replays as needed.
 *
 * Visual language:
 *   - Pins: small frosted dots, slight inner glow.
 *   - Walls: subtle deep-ocean tinted gradients (left = green, right = amber).
 *   - Ball: frost-white with a soft halo while moving, leaves a faint
 *     trail of pin "ripples" as it bounces.
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
}

/** Time per row in ms — sets the overall drop duration. */
const ROW_DURATION_MS = 220;
/** Slight bounce overshoot fraction. */
const BOUNCE = 0.18;

export function PlinkoBoard({
  rows,
  drops,
  onBallLanded,
  highlightedBucket,
}: PlinkoBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef = useRef<Map<string, ActiveBall>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const dprRef = useRef(1);
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
        });
      }
    }
    // Drop balls that no longer appear in props (e.g. user dismissed).
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
      dprRef.current = dpr;
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
      const padTop = 24;
      const padBottom = 12;
      const innerW = w - padX * 2;
      const innerH = h - padTop - padBottom;
      const gap = innerW / (rows + 2); // horizontal spacing between pins
      const rowSpacing = innerH / (rows + 1);
      const pinRadius = Math.max(1.6, Math.min(2.6, gap * 0.07));
      const ballRadius = Math.max(4, Math.min(7, gap * 0.18));
      const cx = w / 2;

      // -- Decorative side walls (deep ocean accents) --
      const wallTopY = padTop;
      const wallBotY = padTop + rowSpacing * rows;
      const wallTopHalf = gap; // pyramid top half-width
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
        const y = padTop + (row + 1) * rowSpacing;
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

      for (const ball of ballsRef.current.values()) {
        const elapsed = now - ball.startedAt;
        const totalDuration = ROW_DURATION_MS * rows;
        const progress = Math.min(1, elapsed / totalDuration);

        // Which row we're between (continuous)
        const rowFloat = progress * rows;
        const rowIdx = Math.min(rows - 1, Math.floor(rowFloat));
        const rowFrac = rowFloat - rowIdx;

        // Compute current x as a function of decisions made so far.
        // Each "right" decision shifts +gap/2, each "left" shifts -gap/2,
        // accumulating per row. y interpolates linearly across the row.
        let x = cx;
        for (let i = 0; i < rowIdx; i++) {
          x += (ball.path[i] === 1 ? 1 : -1) * (gap / 2);
        }
        const dir = ball.path[rowIdx] === 1 ? 1 : -1;
        // Add a soft cosine ease for the in-row segment so it doesn't look
        // ruler-straight.
        const ease =
          rowFrac < 0.5
            ? 2 * rowFrac * rowFrac
            : 1 - Math.pow(-2 * rowFrac + 2, 2) / 2;
        x += dir * (gap / 2) * ease;

        // Vertical: interpolate between adjacent pin rows + a tiny bounce.
        const yA = padTop + (rowIdx + 1) * rowSpacing;
        const yB = padTop + (rowIdx + 2) * rowSpacing;
        const y = yA + (yB - yA) * rowFrac;
        // Hop arc — quick downward bounce between pins
        const bounce =
          Math.sin(rowFrac * Math.PI) * rowSpacing * BOUNCE * (1 - rowFrac);
        const drawY = y - bounce;

        // Halo
        const grad = ctx.createRadialGradient(x, drawY, 0, x, drawY, ballRadius * 2.4);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, drawY, ballRadius * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Ball
        ctx.beginPath();
        ctx.arc(x, drawY, ballRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(160, 224, 171, 0.6)';
        ctx.stroke();

        // Notify on landing — once.
        if (progress >= 1 && !ball.notified) {
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
          }, 120);
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

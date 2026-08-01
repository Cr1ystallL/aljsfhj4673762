'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import type { MacvpotHistoryRow } from '@/app/game/macvpot/page';

interface MacvpotTotemWinnerProps {
  winner: MacvpotHistoryRow['winner'] | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MacvpotTotemWinner({ winner, isOpen, onClose }: MacvpotTotemWinnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Minecraft Totem particle burst
  useEffect(() => {
    if (!isOpen || !winner) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f59e0b', '#fbbf24', '#10b981', '#34d399', '#ffffff', '#eab308'];
    const particles: Array<{
      x: number;
      y: number;
      size: number;
      color: string;
      vx: number;
      vy: number;
      rotation: number;
      vRotation: number;
      opacity: number;
    }> = [];

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < 140; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 16 + 4;
      particles.push({
        x: centerX,
        y: centerY,
        size: Math.random() * 7 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        rotation: Math.random() * 360,
        vRotation: (Math.random() - 0.5) * 10,
        opacity: 1,
      });
    }

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let activeCount = 0;
      for (const p of particles) {
        if (p.opacity <= 0) continue;
        activeCount++;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.rotation += p.vRotation;
        p.opacity -= 0.008;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }

      if (activeCount > 0) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    // Auto dismiss transient popup after 4 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 4500);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(timer);
    };
  }, [isOpen, winner, onClose]);

  if (!winner) return null;

  const initial = winner.name.charAt(0).toUpperCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4">
          {/* Canvas for particle burst */}
          <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-50 w-full h-full"
          />

          {/* Transient Splash Winner Card (Dark Liquid Glass) */}
          <motion.div
            initial={{ scale: 0.2, opacity: 0, y: 30 }}
            animate={{
              scale: [0.2, 1.25, 1],
              opacity: 1,
              y: 0,
            }}
            exit={{ scale: 0.6, opacity: 0, y: 20 }}
            transition={{
              duration: 0.5,
              ease: [0.175, 0.885, 0.32, 1.275],
            }}
            className="pointer-events-auto relative w-full max-w-[320px] rounded-3xl border border-white/20 bg-[#0d0d12]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.9)] text-center flex flex-col items-center gap-3.5 z-50 overflow-hidden backdrop-blur-2xl"
          >
            {/* Subtle Amber Glow */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-500/15 rounded-full blur-[45px] pointer-events-none" />

            {/* Winner Avatar */}
            <div className="w-20 h-20 rounded-full p-[2.5px] bg-gradient-to-tr from-amber-400 via-white to-amber-500 shadow-xl relative z-10">
              {winner.photoUrl ? (
                <Image
                  src={winner.photoUrl}
                  alt={winner.name}
                  width={80}
                  height={80}
                  className="rounded-full object-cover w-full h-full"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white text-2xl font-black">
                  {initial}
                </div>
              )}
            </div>

            {/* Winner Name & Win Amount */}
            <div className="flex flex-col items-center gap-0.5 z-10">
              <h3 className="text-lg font-black text-white truncate max-w-[240px]">
                {winner.name}
              </h3>
              <span className="text-2xl font-black text-amber-400 font-roobert tracking-tight">
                +{winner.payout.toLocaleString('ru-RU')} <span className="text-xs text-white/50 font-normal">zł</span>
              </span>
            </div>

            {/* Stats Breakdown: Bet Amount & Chance */}
            <div className="w-full rounded-2xl bg-white/[0.04] border border-white/10 p-3 grid grid-cols-2 gap-2 text-xs z-10">
              <div className="flex flex-col items-center border-r border-white/10">
                <span className="text-[10px] font-semibold text-white/40 uppercase">Ставка</span>
                <span className="font-extrabold text-white text-xs mt-0.5">
                  {winner.betAmount} zł
                </span>
              </div>

              <div className="flex flex-col items-center">
                <span className="text-[10px] font-semibold text-white/40 uppercase">Шанс</span>
                <span className="font-extrabold text-amber-300 text-xs mt-0.5">
                  {winner.chance}%
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

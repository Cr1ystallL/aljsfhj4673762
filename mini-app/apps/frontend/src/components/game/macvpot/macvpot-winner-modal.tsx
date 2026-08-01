'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Sparkles, X, CheckCircle2 } from 'lucide-react';
import type { MacvpotHistoryRow } from '@/app/game/macvpot/page';

interface MacvpotWinnerModalProps {
  winner: MacvpotHistoryRow['winner'] | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MacvpotWinnerModal({ winner, isOpen, onClose }: MacvpotWinnerModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Confetti Particle Effect
  useEffect(() => {
    if (!isOpen || !winner) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#a855f7', '#ec4899', '#3b82f6', '#eab308', '#22c55e', '#ffffff'];
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

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2 - 50,
        size: Math.random() * 10 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.7) * 16,
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
        p.vy += 0.25; // gravity
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

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen, winner]);

  if (!winner) return null;

  const initial = winner.name.charAt(0).toUpperCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Confetti Canvas */}
          <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-50 w-full h-full"
          />

          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Animated Winner Card */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="relative w-full max-w-sm rounded-3xl border border-purple-500/30 bg-gradient-to-b from-[#1a102b] via-[#120a1f] to-[#0a0612] p-6 shadow-[0_0_50px_rgba(168,85,247,0.4)] text-center flex flex-col items-center gap-4 z-50 overflow-hidden"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            {/* Glowing background aura */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-purple-600/20 rounded-full blur-[60px] pointer-events-none" />

            {/* Trophy Icon Badge */}
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-400 shadow-inner">
              <Trophy size={26} className="animate-bounce" />
            </div>

            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold uppercase tracking-widest text-purple-400">
                ПОБЕДИТЕЛЬ
              </span>
              <h2 className="text-2xl font-black text-white font-roobert">
                {winner.name}
              </h2>
            </div>

            {/* Winner Avatar with Enlargement & Glow */}
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1.1 }}
              transition={{ repeat: Infinity, repeatType: 'reverse', duration: 1.5 }}
              className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-purple-500 via-pink-500 to-amber-400 shadow-[0_0_30px_rgba(236,72,153,0.6)] my-1"
            >
              {winner.photoUrl ? (
                <Image
                  src={winner.photoUrl}
                  alt={winner.name}
                  width={96}
                  height={96}
                  className="rounded-full object-cover w-full h-full"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white text-3xl font-black">
                  {initial}
                </div>
              )}
            </motion.div>

            {/* Stats Breakdown Card */}
            <div className="w-full rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 flex flex-col gap-2.5 text-xs text-frost-white/80">
              <div className="flex items-center justify-between">
                <span className="text-white/50">Ставка:</span>
                <span className="font-semibold text-white">
                  {winner.betAmount.toLocaleString('ru-RU')} монет
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/50">Шанс:</span>
                <span className="font-semibold text-purple-300 bg-purple-900/50 px-2 py-0.5 rounded-full border border-purple-500/30">
                  {winner.chance}%
                </span>
              </div>

              <div className="h-[1px] bg-white/10 my-0.5" />

              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-white">Выигрыш:</span>
                <span className="font-black text-amber-400 text-base">
                  {winner.payout.toLocaleString('ru-RU')} монет
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-purple-900/40 hover:brightness-110 active:scale-98 transition-all mt-1"
            >
              Отлично!
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

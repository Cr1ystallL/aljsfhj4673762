'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Sparkles, X, Shield, Zap } from 'lucide-react';
import type { MacvpotHistoryRow } from '@/app/game/macvpot/page';

interface MacvpotTotemWinnerProps {
  winner: MacvpotHistoryRow['winner'] | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MacvpotTotemWinner({ winner, isOpen, onClose }: MacvpotTotemWinnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Minecraft Totem of Undying particle burst effect
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

    // Create 150 Minecraft square particles exploding from center
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < 160; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 18 + 4;
      particles.push({
        x: centerX,
        y: centerY,
        size: Math.random() * 8 + 4, // Minecraft pixel style square particles
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        rotation: Math.random() * 360,
        vRotation: (Math.random() - 0.5) * 12,
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
        p.vy += 0.2; // light floaty gravity
        p.vx *= 0.96; // drag
        p.vy *= 0.96;
        p.rotation += p.vRotation;
        p.opacity -= 0.007;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        // Draw pixelated square particle
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }

      if (activeCount > 0) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    // Auto close after 5s
    const autoCloseTimer = setTimeout(() => {
      onClose();
    }, 5500);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(autoCloseTimer);
    };
  }, [isOpen, winner, onClose]);

  if (!winner) return null;

  const initial = winner.name.charAt(0).toUpperCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Canvas for Minecraft Totem particle explosion */}
          <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-50 w-full h-full"
          />

          {/* Dark backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/85 backdrop-blur-xl"
          />

          {/* Totem Activation Pop-up */}
          <motion.div
            initial={{ scale: 0.1, opacity: 0, y: 50 }}
            animate={{
              scale: [0.1, 1.35, 1],
              opacity: 1,
              y: 0,
              rotate: [0, -3, 3, -1, 0],
            }}
            exit={{ scale: 0.5, opacity: 0, y: 30 }}
            transition={{
              duration: 0.7,
              ease: [0.175, 0.885, 0.32, 1.275], // Totem spring punch
            }}
            className="relative w-full max-w-sm rounded-3xl border-2 border-amber-400/50 bg-gradient-to-b from-[#1c1608] via-[#120d04] to-black p-6 shadow-[0_0_80px_rgba(245,158,11,0.5)] text-center flex flex-col items-center gap-4 z-50 overflow-hidden backdrop-blur-2xl"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            {/* Glowing Golden Radial Totem Aura */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-tr from-amber-500/20 via-emerald-500/20 to-amber-400/30 rounded-full blur-[70px] pointer-events-none" />

            {/* Totem Header Icon */}
            <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border-2 border-amber-400/40 flex items-center justify-center text-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.4)]">
              <Trophy size={32} className="animate-pulse" />
            </div>

            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-1">
                <Sparkles size={14} /> ТЕМАТИЧЕСКИЙ ТОТЕМ ПОБЕДЫ <Sparkles size={14} />
              </span>
              <h2 className="text-2xl font-black text-white font-roobert">
                {winner.name}
              </h2>
            </div>

            {/* Full Avatar Circle with Golden Totem Wings */}
            <motion.div
              animate={{
                scale: [1, 1.08, 1],
                boxShadow: [
                  '0 0 20px rgba(245,158,11,0.4)',
                  '0 0 45px rgba(245,158,11,0.8)',
                  '0 0 20px rgba(245,158,11,0.4)',
                ],
              }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="w-28 h-28 rounded-full p-[3px] bg-gradient-to-tr from-amber-400 via-emerald-400 to-amber-300 relative my-2"
            >
              {winner.photoUrl ? (
                <Image
                  src={winner.photoUrl}
                  alt={winner.name}
                  width={112}
                  height={112}
                  className="rounded-full object-cover w-full h-full"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white text-4xl font-black">
                  {initial}
                </div>
              )}
            </motion.div>

            {/* Stats Breakdown Card */}
            <div className="w-full rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 flex flex-col gap-2 text-xs text-white/80">
              <div className="flex items-center justify-between">
                <span className="text-white/50 font-medium">Шанс на победу:</span>
                <span className="font-extrabold text-amber-300 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                  {winner.chance}%
                </span>
              </div>

              <div className="h-[1px] bg-white/10 my-0.5" />

              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-white">Выигрыш:</span>
                <span className="font-black text-amber-400 text-lg">
                  +{winner.payout.toLocaleString('ru-RU')} zł
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-black font-black text-base shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:brightness-110 active:scale-98 transition-all mt-1"
            >
              Отлично!
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

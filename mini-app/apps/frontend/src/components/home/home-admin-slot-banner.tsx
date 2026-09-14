'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldCheck, Play, Sparkles, ArrowRight, Dices } from 'lucide-react';

export function HomeAdminSlotBanner() {
  const router = useRouter();

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-amber-500/40 bg-gradient-to-r from-[#0d1117] via-[#141a24] to-[#0d1117] p-4 sm:p-5 shadow-[0_4px_25px_rgba(245,158,11,0.15)] group">
      {/* Background Ambient Glow */}
      <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="absolute left-1/3 -top-10 w-40 h-40 rounded-full bg-orange-500/10 blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left Info */}
        <div className="flex items-center gap-3.5">
          {/* Slot Mini Frame Icon Preview */}
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/60 border border-amber-500/30 overflow-hidden shrink-0 flex items-center justify-center p-1 shadow-inner">
            <Image
              src="/MacvSlot/scatter.webp"
              alt="MacvSpin"
              fill
              className="object-contain p-1 animate-pulse"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-black font-extrabold text-[10px] tracking-wider uppercase flex items-center gap-1 shadow-sm">
                <ShieldCheck className="w-3 h-3" />
                ADMIN PREVIEW
              </span>
              <span className="text-[11px] text-zinc-400 font-mono">5×3 • 20 LINES</span>
            </div>

            <h3 className="font-brand font-black text-lg sm:text-xl text-white tracking-wide flex items-center gap-1.5">
              <span>MacvSpin</span>
              <span className="text-xs text-amber-400 font-normal">(Фирменный Слот)</span>
            </h3>

            <p className="text-xs text-zinc-300 line-clamp-1 max-w-[420px]">
              Новый эксклюзивный слот: дикие символы WILD, 10 Free Spins при 3+ Scatter, анимация барабанов и звуки.
            </p>
          </div>
        </div>

        {/* Right Play Button */}
        <button
          type="button"
          onClick={() => router.push('/game/macvslot')}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-95 text-black font-brand font-black text-xs sm:text-sm tracking-wide shadow-[0_2px_15px_rgba(251,191,36,0.35)] transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-black" />
          <span>ТЕСТИРОВАТЬ СЛОТ</span>
          <ArrowRight className="w-4 h-4 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}

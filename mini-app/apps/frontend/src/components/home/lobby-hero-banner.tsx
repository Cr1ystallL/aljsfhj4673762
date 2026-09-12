'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  Gift,
  Crown,
  Rocket,
  ArrowRight,
} from 'lucide-react';

interface HeroSlide {
  id: string;
  badge: {
    label: string;
    icon: typeof Sparkles;
    color: string;
    bg: string;
    border: string;
  };
  title: string;
  subtitle: string;
  ctaText: string;
  href: string;
  image: string;
  glowColor: string;
  accentGradient: string;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'welcome_bonus',
    badge: {
      label: 'Приветственный бонус',
      icon: Flame,
      color: 'text-amber-300',
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/40',
    },
    title: '+200% К ДЕПОЗИТУ',
    subtitle: 'Удвой свой баланс и забери фриспины в подарок прямо сейчас',
    ctaText: 'Забрать бонус',
    href: '/balance',
    image: '/coinflip.png?v=3d_3',
    glowColor: 'rgba(245, 158, 11, 0.28)',
    accentGradient: 'from-amber-400 via-amber-500 to-orange-500',
  },
  {
    id: 'cashback',
    badge: {
      label: 'VIP Привилегия',
      icon: Crown,
      color: 'text-emerald-300',
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500/40',
    },
    title: 'КЭШБЭК ДО 10%',
    subtitle: 'Возвращаем часть проигрыша каждую неделю без скрытых вейджеров',
    ctaText: 'Подробнее',
    href: '/cashback',
    image: '/Rangs/Diamond.png',
    glowColor: 'rgba(16, 185, 129, 0.25)',
    accentGradient: 'from-emerald-400 via-teal-500 to-emerald-600',
  },
  {
    id: 'daily_wheel',
    badge: {
      label: 'Ежедневный приз',
      icon: Gift,
      color: 'text-purple-300',
      bg: 'bg-purple-500/20',
      border: 'border-purple-500/40',
    },
    title: 'КОЛЕСО ФОРТУНЫ',
    subtitle: 'Крути колесо каждый день бесплатно и забирай до 500 zł',
    ctaText: 'Крутить колесо',
    href: '/bonuses',
    image: '/wheel.png?v=3d_3',
    glowColor: 'rgba(168, 85, 247, 0.30)',
    accentGradient: 'from-purple-400 via-fuchsia-500 to-pink-500',
  },
  {
    id: 'macvjet_jackpot',
    badge: {
      label: 'Хит сезона',
      icon: Rocket,
      color: 'text-rose-300',
      bg: 'bg-rose-500/20',
      border: 'border-rose-500/40',
    },
    title: 'MACVJET: ДО x10,000',
    subtitle: 'Лови максимальный множитель и взлетай на вершину таблицы лидеров',
    ctaText: 'Взлететь',
    href: '/game/crash',
    image: '/macvjet.png?v=3d_3',
    glowColor: 'rgba(244, 63, 94, 0.28)',
    accentGradient: 'from-rose-400 via-orange-500 to-amber-500',
  },
];

export function LobbyHeroBanner() {
  const router = useRouter();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % HERO_SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  }, []);

  // Auto-advance carousel
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 5500);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  const slide = HERO_SLIDES[currentIdx];
  const BadgeIcon = slide.badge.icon;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) nextSlide();
      else prevSlide();
    }
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative w-full rounded-3xl overflow-hidden border border-white/15 bg-gradient-to-br from-[#121217] via-[#0b0c10] to-black shadow-[0_16px_45px_rgba(0,0,0,0.7)] group"
    >
      {/* Background ambient spotlight */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none transition-all duration-700 blur-3xl opacity-60"
        style={{
          background: `radial-gradient(100% 120% at 75% 50%, ${slide.glowColor} 0%, transparent 70%)`,
        }}
      />

      {/* Decorative cyber grid lines */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-40"
      />

      {/* Content wrapper */}
      <div className="relative z-10 w-full min-h-[165px] sm:min-h-[190px] md:min-h-[215px] lg:min-h-[235px] flex items-center justify-between p-4 sm:p-6 lg:p-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 min-w-0 pr-3 sm:pr-6 flex flex-col justify-center gap-2 sm:gap-3"
          >
            {/* Promo Badge */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md border ${slide.badge.border} ${slide.badge.bg} ${slide.badge.color} shadow-sm`}
              >
                <BadgeIcon size={12} strokeWidth={2.4} />
                <span>{slide.badge.label}</span>
              </span>
            </div>

            {/* Big Headline */}
            <div className="min-w-0">
              <h2 className="font-roobert font-black text-xl sm:text-2xl md:text-3xl lg:text-4xl text-white tracking-tight leading-tight uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                <span className={`bg-gradient-to-r ${slide.accentGradient} bg-clip-text text-transparent`}>
                  {slide.title}
                </span>
              </h2>
              <p className="mt-1 font-roobert text-[11.5px] sm:text-[13px] md:text-[14px] text-zinc-300 leading-snug max-w-[420px] drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                {slide.subtitle}
              </p>
            </div>

            {/* CTA Button */}
            <div className="pt-1">
              <button
                onClick={() => router.push(slide.href)}
                className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r ${slide.accentGradient} text-black font-extrabold text-[12px] sm:text-[13px] shadow-lg shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer`}
              >
                <span>{slide.ctaText}</span>
                <ArrowRight size={14} strokeWidth={2.8} />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* 3D Floating Artwork on the right */}
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id + '-img'}
            initial={{ opacity: 0, scale: 0.88, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => router.push(slide.href)}
            className="shrink-0 w-[120px] sm:w-[170px] md:w-[210px] lg:w-[240px] h-[120px] sm:h-[160px] md:h-[190px] lg:h-[210px] flex items-center justify-center cursor-pointer select-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.image}
              alt={slide.title}
              className="w-full h-full object-contain filter drop-shadow-[0_14px_28px_rgba(0,0,0,0.85)] group-hover:scale-105 transition-transform duration-500"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Desktop Arrow Controls (visible on hover) */}
      <button
        onClick={prevSlide}
        aria-label="Предыдущий слайд"
        className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-white/15 bg-black/60 backdrop-blur-md items-center justify-center text-white/80 hover:text-white hover:bg-black/90 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 cursor-pointer z-20"
      >
        <ChevronLeft size={18} strokeWidth={2.4} />
      </button>

      <button
        onClick={nextSlide}
        aria-label="Следующий слайд"
        className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-white/15 bg-black/60 backdrop-blur-md items-center justify-center text-white/80 hover:text-white hover:bg-black/90 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 cursor-pointer z-20"
      >
        <ChevronRight size={18} strokeWidth={2.4} />
      </button>

      {/* Pagination Dots (Bottom Center/Left) */}
      <div className="absolute bottom-2.5 left-4 sm:left-6 flex items-center gap-1.5 z-20">
        {HERO_SLIDES.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => setCurrentIdx(idx)}
            aria-label={`Слайд ${idx + 1}`}
            className={`h-1.5 rounded-full transition-all cursor-pointer ${
              idx === currentIdx
                ? 'w-6 bg-amber-400 shadow-sm shadow-amber-400/50'
                : 'w-1.5 bg-white/20 hover:bg-white/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

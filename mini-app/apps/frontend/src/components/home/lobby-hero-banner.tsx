'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Gift,
  Crown,
  Rocket,
  ArrowRight,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Flame,
  Crown,
  Gift,
  Rocket,
  Sparkles,
  Trophy,
};

interface HeroSlide {
  id: string;
  badge: {
    label: string;
    icon: LucideIcon;
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
  floorColor: string;
  accentGradient: string;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'welcome_bonus',
    badge: {
      label: 'Приветственный бонус',
      icon: Flame,
      color: 'text-amber-300',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
    },
    title: '+200% К ДЕПОЗИТУ',
    subtitle: 'Удвой свой баланс и забери фриспины в подарок прямо сейчас',
    ctaText: 'Забрать бонус',
    href: '/balance',
    image: '/banerbonus.png',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    floorColor: 'rgba(245, 158, 11, 0.45)',
    accentGradient: 'from-amber-300 via-amber-400 to-orange-500',
  },
  {
    id: 'cashback',
    badge: {
      label: 'VIP Привилегия',
      icon: Crown,
      color: 'text-emerald-300',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/40',
    },
    title: 'КЭШБЭК ДО 10%',
    subtitle: 'Возвращаем часть проигрыша каждую неделю на реальный баланс',
    ctaText: 'Подробнее',
    href: '/cashback',
    image: '/banercashback.png',
    glowColor: 'rgba(16, 185, 129, 0.32)',
    floorColor: 'rgba(16, 185, 129, 0.45)',
    accentGradient: 'from-emerald-300 via-teal-400 to-emerald-500',
  },
  {
    id: 'daily_wheel',
    badge: {
      label: 'Ежедневный приз',
      icon: Gift,
      color: 'text-purple-300',
      bg: 'bg-purple-500/15',
      border: 'border-purple-500/40',
    },
    title: 'КОЛЕСО ФОРТУНЫ',
    subtitle: 'Крути колесо каждый день бесплатно и забирай до 500 zł',
    ctaText: 'Крутить колесо',
    href: '/bonuses',
    image: '/banetlw.png',
    glowColor: 'rgba(168, 85, 247, 0.35)',
    floorColor: 'rgba(168, 85, 247, 0.45)',
    accentGradient: 'from-purple-300 via-fuchsia-400 to-pink-500',
  },
  {
    id: 'macvjet_jackpot',
    badge: {
      label: 'Хит сезона',
      icon: Rocket,
      color: 'text-rose-300',
      bg: 'bg-rose-500/15',
      border: 'border-rose-500/40',
    },
    title: 'MACVJET: ДО x10,000',
    subtitle: 'Срывай сумасшедшие иксы и взлетай на вершину таблицы лидеров',
    ctaText: 'Взлететь',
    href: '/game/crash',
    image: '/banermj.png',
    glowColor: 'rgba(244, 63, 94, 0.35)',
    floorColor: 'rgba(249, 115, 22, 0.45)',
    accentGradient: 'from-rose-400 via-amber-400 to-orange-500',
  },
];

export function LobbyHeroBanner() {
  const router = useRouter();
  const [slides, setSlides] = useState<HeroSlide[]>(HERO_SLIDES);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/banners')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.banners) && data.banners.length > 0) {
          const mapped: HeroSlide[] = data.banners.map((b: any) => ({
            id: b.id,
            badge: {
              label: b.badge?.label || 'Спецпредложение',
              icon: (b.badge?.icon && ICON_MAP[b.badge.icon]) || Flame,
              color: b.badge?.color || 'text-amber-300',
              bg: b.badge?.bg || 'bg-amber-500/15',
              border: b.badge?.border || 'border-amber-500/40',
            },
            title: b.title,
            subtitle: b.subtitle,
            ctaText: b.ctaText || 'Играть',
            href: b.href || '/balance',
            image: b.image || '/banerbonus.png',
            glowColor: b.glowColor || 'rgba(245, 158, 11, 0.35)',
            floorColor: b.floorColor || 'rgba(245, 158, 11, 0.45)',
            accentGradient: b.accentGradient || 'from-amber-300 via-amber-400 to-orange-500',
          }));
          setSlides(mapped);
        }
      })
      .catch(() => {
        // Fallback to static slides
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalSlides = slides.length || 1;
  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  // Auto-advance carousel
  useEffect(() => {
    if (isPaused || totalSlides <= 1) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 5500);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide, totalSlides]);

  const slide = slides[currentIdx % totalSlides] || HERO_SLIDES[0];
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
      className="relative w-full rounded-[24px] sm:rounded-[28px] overflow-hidden border border-white/[0.12] bg-[#07080b] shadow-[0_22px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] group select-none transition-colors duration-700"
    >
      {/* Deep luxury obsidian gradient base */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[#07080b] via-[#090b10] to-[#0c0d14] pointer-events-none"
      />

      {/* Dynamic studio backlight halo behind 3D artwork */}
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 bottom-0 w-[65%] sm:w-[55%] pointer-events-none transition-all duration-700 blur-[75px] opacity-70"
        style={{
          background: `radial-gradient(ellipse at 75% 50%, ${slide.glowColor} 0%, transparent 75%)`,
        }}
      />

      {/* Pedestal stage floor reflection under the 3D element */}
      <div
        aria-hidden="true"
        className="absolute right-4 sm:right-12 bottom-0 w-[160px] sm:w-[240px] md:w-[320px] h-[32px] sm:h-[48px] rounded-[100%] pointer-events-none transition-all duration-700 blur-2xl opacity-60"
        style={{
          background: slide.floorColor,
        }}
      />

      {/* Subtle diagonal luxury sheen highlight across card */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(255,255,255,0.06)_0%,transparent_50%)] pointer-events-none"
      />

      {/* Content wrapper */}
      <div className="relative z-10 w-full min-h-[175px] sm:min-h-[200px] md:min-h-[225px] lg:min-h-[245px] flex items-center justify-between p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 min-w-0 pr-2 sm:pr-6 flex flex-col justify-center gap-2 sm:gap-3"
          >
            {/* Promo Badge with glowing status pulse */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-roobert font-extrabold uppercase tracking-wider backdrop-blur-md border ${slide.badge.border} ${slide.badge.bg} ${slide.badge.color} shadow-sm`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
                </span>
                <BadgeIcon size={12} strokeWidth={2.4} />
                <span>{slide.badge.label}</span>
              </span>
            </div>

            {/* Big Headline */}
            <div className="min-w-0">
              <h2 className="font-roobert font-black text-xl sm:text-2xl md:text-3xl lg:text-[34px] xl:text-[38px] text-white tracking-tight leading-[1.1] uppercase drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]">
                <span className={`bg-gradient-to-r ${slide.accentGradient} bg-clip-text text-transparent`}>
                  {slide.title}
                </span>
              </h2>
              <p className="mt-1.5 font-roobert text-[11.5px] sm:text-[13px] md:text-[14px] text-zinc-300/90 leading-snug max-w-[440px] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                {slide.subtitle}
              </p>
            </div>

            {/* CTA Button */}
            <div className="pt-1">
              <button
                onClick={() => router.push(slide.href)}
                className={`relative overflow-hidden inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r ${slide.accentGradient} text-black font-roobert font-black text-[12px] sm:text-[13px] uppercase tracking-wide shadow-[0_6px_20px_rgba(0,0,0,0.4)] hover:brightness-110 active:scale-95 transition-all cursor-pointer group/btn`}
              >
                {/* Subtle shine sweep on hover */}
                <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
                <span>{slide.ctaText}</span>
                <ArrowRight size={14} strokeWidth={3} />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Heroic 3D Artwork on the right */}
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id + '-img'}
            initial={{ opacity: 0, scale: 0.88, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -10 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => router.push(slide.href)}
            className="shrink-0 relative w-[140px] sm:w-[190px] md:w-[250px] lg:w-[290px] xl:w-[330px] h-[135px] sm:h-[180px] md:h-[210px] lg:h-[235px] xl:h-[250px] flex items-center justify-center cursor-pointer select-none -mr-1 sm:-mr-2"
          >
            {/* Gentle floating animation loop */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-full h-full flex items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-full object-contain filter drop-shadow-[0_16px_32px_rgba(0,0,0,0.85)] group-hover:scale-105 transition-transform duration-500"
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Desktop Arrow Controls (visible on hover) */}
      <button
        onClick={prevSlide}
        aria-label="Предыдущий слайд"
        className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-white/15 bg-black/60 backdrop-blur-md items-center justify-center text-white/80 hover:text-white hover:bg-black/90 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 cursor-pointer z-20 shadow-lg"
      >
        <ChevronLeft size={19} strokeWidth={2.4} />
      </button>

      <button
        onClick={nextSlide}
        aria-label="Следующий слайд"
        className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-white/15 bg-black/60 backdrop-blur-md items-center justify-center text-white/80 hover:text-white hover:bg-black/90 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 cursor-pointer z-20 shadow-lg"
      >
        <ChevronRight size={19} strokeWidth={2.4} />
      </button>

      {/* Segmented Capsule Indicators (Bottom Left) */}
      <div className="absolute bottom-2.5 left-4 sm:left-6 flex items-center gap-1.5 z-20">
        {slides.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => setCurrentIdx(idx)}
            aria-label={`Слайд ${idx + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
              idx === currentIdx
                ? `w-8 bg-gradient-to-r ${slide.accentGradient} shadow-[0_0_10px_rgba(255,255,255,0.3)]`
                : 'w-2 bg-white/20 hover:bg-white/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

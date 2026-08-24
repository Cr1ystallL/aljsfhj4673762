'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = number;

export interface CardData {
  suit: Suit;
  rank: Rank;
}

export function getRankName(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return rank.toString();
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function getCardColor(suit: Suit): string {
  return isRedSuit(suit) ? '#e11d48' : '#1e293b';
}

export function SuitMark({
  suit,
  className,
}: {
  suit: Suit;
  className?: string;
}) {
  if (suit === 'hearts') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  if (suit === 'diamonds') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M12 2L3.5 12 12 22 20.5 12z" />
      </svg>
    );
  }
  if (suit === 'clubs') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M12 2a4 4 0 0 0-4 4c0 .35.05.69.13 1.01A4 4 0 0 0 4 11a4 4 0 0 0 4 4c.38 0 .74-.06 1.08-.16L8 19a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l-1.08-4.16c.34.1.7.16 1.08.16a4 4 0 0 0 4-4 4 4 0 0 0-4.13-3.99A4 4 0 0 0 16 6a4 4 0 0 0-4-4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C8.5 7 4 10.5 4 14.5a4.5 4.5 0 0 0 7 3.74L10 21a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1l-1-2.76A4.5 4.5 0 0 0 20 14.5C20 10.5 15.5 7 12 2z" />
    </svg>
  );
}

interface PlayingCardProps {
  card: CardData | null;
  faded?: boolean;
  className?: string;
  animateKey?: string | number;
  direction?: 'right-to-left' | 'none';
}

const cardSlideVariants = {
  initial: { opacity: 0, x: 40, scale: 0.9 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, x: -40, scale: 0.9, transition: { duration: 0.2 } },
};

export function PlayingCard({
  card,
  faded = false,
  className = '',
  animateKey,
  direction = 'none',
}: PlayingCardProps) {
  const { t } = useT();

  if (!card) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-xl sm:rounded-2xl border-2 border-dashed border-white/20 bg-[#0c0e14] shadow-xl aspect-[5/7]',
          className
        )}
      >
        <span className="font-roobert text-[11px] uppercase tracking-[0.2em] text-white/30 font-bold">
          {t('hilo.deck')}
        </span>
      </div>
    );
  }

  const isRed = isRedSuit(card.suit);
  const rankName = getRankName(card.rank);
  const textColor = isRed ? 'text-[#e11d48]' : 'text-[#1e293b]';

  const CardBody = (
    <div
      className={cn(
        'relative w-full h-full flex flex-col justify-between rounded-xl sm:rounded-2xl bg-white p-2.5 sm:p-3.5 shadow-[0_12px_28px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.2)] border border-slate-200/90 select-none overflow-hidden',
        faded && 'opacity-40 blur-[0.5px] scale-90 grayscale-[0.2]',
        textColor,
        'transition-all duration-300'
      )}
    >
      {/* Top Left Corner */}
      <div className="flex flex-col items-center self-start leading-none pointer-events-none z-10">
        <span className="text-base sm:text-lg font-black font-roobert tracking-tighter leading-none">
          {rankName}
        </span>
        <SuitMark suit={card.suit} className="w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5" />
      </div>

      {/* Center Large Suit Symbol */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <SuitMark
          suit={card.suit}
          className="w-14 h-14 sm:w-20 sm:h-20 opacity-90 drop-shadow-sm"
        />
      </div>

      {/* Bottom Right Corner (Inverted) */}
      <div className="flex flex-col items-center self-end leading-none rotate-180 pointer-events-none z-10">
        <span className="text-base sm:text-lg font-black font-roobert tracking-tighter leading-none">
          {rankName}
        </span>
        <SuitMark suit={card.suit} className="w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5" />
      </div>
    </div>
  );

  if (direction !== 'none') {
    return (
      <motion.div
        key={animateKey}
        variants={cardSlideVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={cn('inline-block', className)}
      >
        {CardBody}
      </motion.div>
    );
  }

  return <div className={cn('inline-block', className)}>{CardBody}</div>;
}

'use client';

import React from 'react';
import { motion } from 'framer-motion';
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
  return isRedSuit(suit) ? '#dc2626' : '#0f172a';
}

export function SuitMark({
  suit,
  className,
}: {
  suit: Suit;
  className?: string;
}) {
  const isRed = isRedSuit(suit);
  const color = isRed ? '#dc2626' : '#0f172a';

  if (suit === 'hearts') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill={color} aria-hidden>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  if (suit === 'diamonds') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill={color} aria-hidden>
        <path d="M12 2L2 12l10 10 10-10L12 2z" />
      </svg>
    );
  }
  if (suit === 'clubs') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill={color} aria-hidden>
        <path d="M19.5 9.5c0-1.93-1.57-3.5-3.5-3.5-.34 0-.66.05-.97.14C14.53 4.88 13.36 4 12 4s-2.53.88-3.03 2.14c-.31-.09-.63-.14-.97-.14-1.93 0-3.5 1.57-3.5 3.5 0 1.55 1.01 2.86 2.42 3.32-.08.38-.17.81-.22 1.18h10.6c-.05-.37-.14-.8-.22-1.18 1.41-.46 2.42-1.77 2.42-3.32zM13 15v5h-2v-5h2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill={color} aria-hidden>
      <path d="M12 2C9.5 6 4 10 4 14c0 3.31 2.69 6 6 6 .74 0 1.44-.13 2-.39.56.26 1.26.39 2 .39 3.31 0 6-2.69 6-6 0-4-5.5-8-8-12zM13 18v2h-2v-2h2z" />
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
        className={`flex items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-[#0c0e14] shadow-xl aspect-[5/7] ${className}`}
      >
        <span className="font-roobert text-[11px] uppercase tracking-[0.2em] text-white/30 font-bold">
          {t('hilo.deck')}
        </span>
      </div>
    );
  }

  const isRed = isRedSuit(card.suit);
  const rankName = getRankName(card.rank);
  const textColor = isRed ? 'text-[#dc2626]' : 'text-[#0f172a]';

  const CardBody = (
    <div
      className={`relative w-full h-full flex flex-col justify-between rounded-xl sm:rounded-2xl bg-gradient-to-b from-white via-[#fafafa] to-[#f0f0f0] p-2 sm:p-3 shadow-[0_10px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,1)] border border-black/10 select-none overflow-hidden ${
        faded ? 'opacity-40 blur-[0.5px] scale-90 grayscale-[0.2]' : 'scale-100'
      } ${textColor} transition-all duration-300`}
    >
      {/* Top Left Corner */}
      <div className="flex flex-col items-center self-start leading-none">
        <span className="text-xl sm:text-2xl font-black font-roobert tracking-tighter">
          {rankName}
        </span>
        <SuitMark suit={card.suit} className="w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5" />
      </div>

      {/* Large Center Suit Watermark & Symbol */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <SuitMark
          suit={card.suit}
          className="w-12 h-12 sm:w-16 sm:h-16 opacity-90 drop-shadow-sm"
        />
      </div>

      {/* Bottom Right Corner (Inverted) */}
      <div className="flex flex-col items-center self-end leading-none rotate-180">
        <span className="text-xl sm:text-2xl font-black font-roobert tracking-tighter">
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
        className={className}
      >
        {CardBody}
      </motion.div>
    );
  }

  return <div className={className}>{CardBody}</div>;
}

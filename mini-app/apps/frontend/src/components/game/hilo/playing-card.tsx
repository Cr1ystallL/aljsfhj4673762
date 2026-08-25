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

export function getSuitSymbol(suit: Suit): string {
  if (suit === 'spades') return '♠';
  if (suit === 'hearts') return '♥';
  if (suit === 'diamonds') return '♦';
  return '♣';
}

export function SuitMark({
  suit,
  className,
}: {
  suit: Suit;
  className?: string;
}) {
  const isRed = isRedSuit(suit);
  const symbol = getSuitSymbol(suit);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center leading-none select-none font-serif',
        isRed ? 'text-[#9c1f24]' : 'text-[#161512]',
        className
      )}
    >
      {symbol}
    </span>
  );
}

interface PlayingCardProps {
  card: CardData | null;
  faded?: boolean;
  isFaceDown?: boolean;
  className?: string;
  animateKey?: string | number;
  direction?: 'right-to-left' | 'none';
}

const cardSlideVariants = {
  initial: { opacity: 0, x: 40, scale: 0.9 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, x: -40, scale: 0.9, transition: { duration: 0.2 } },
};

/**
 * High-End Casino Playing Card Component for HiLo
 * Perfectly matching the BlackJack card aesthetic (Cream face & Crimson gold-framed back).
 */
export function PlayingCard({
  card,
  faded = false,
  isFaceDown = false,
  className = '',
  animateKey,
  direction = 'none',
}: PlayingCardProps) {
  const { t } = useT();

  // Face-down card or empty card deck style (Matching BlackJack crimson gold card back)
  if (isFaceDown || !card) {
    const FaceDownBody = (
      <div
        className={cn(
          'relative w-full h-full flex items-center justify-center rounded-[10px] sm:rounded-[14px] select-none flex-shrink-0 overflow-hidden',
          'border border-black/45 shadow-[0_8px_20px_rgba(0,0,0,0.65),0_0_22px_rgba(150,20,20,0.25)]',
          faded && 'opacity-40 blur-[0.5px] scale-90',
          'transition-all duration-300',
          className
        )}
        style={{
          background: 'linear-gradient(155deg, #7c1a1a 0%, #550f10 60%, #3a0709 100%)',
        }}
      >
        {/* Inner gold frame with subtle diagonal pattern */}
        <div
          className="absolute inset-[3px] sm:inset-[5px] rounded-[7px] sm:rounded-[10px] border border-[rgba(230,196,130,0.35)] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(230,196,130,0.06) 0 2px, transparent 2px 7px)',
          }}
        />

        {/* MacvBet Crown Logo in center */}
        <img
          src="/ButtonLogo.svg"
          alt="MacvBet"
          className="relative z-10 w-8 h-8 sm:w-12 sm:h-12 object-contain filter brightness-125 drop-shadow-[0_0_8px_rgba(227,193,126,0.6)]"
          draggable={false}
        />
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
          {FaceDownBody}
        </motion.div>
      );
    }
    return <div className={cn('inline-block', className)}>{FaceDownBody}</div>;
  }

  const isRed = isRedSuit(card.suit);
  const rankStr = getRankName(card.rank);
  const suitSymbol = getSuitSymbol(card.suit);

  const CardBody = (
    <div
      className={cn(
        'relative w-full h-full flex flex-col justify-between p-2 sm:p-3 rounded-[10px] sm:rounded-[14px] select-none overflow-hidden',
        'border border-black/25 shadow-[0_10px_25px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.2)]',
        isRed ? 'text-[#9c1f24]' : 'text-[#161512]',
        faded && 'opacity-40 blur-[0.5px] scale-90',
        'transition-all duration-300'
      )}
      style={{
        background: 'linear-gradient(160deg, #fbf7ee 0%, #efe7d3 100%)',
      }}
    >
      {/* Top Left Corner */}
      <div className="flex flex-col items-center self-start leading-none pointer-events-none z-10">
        <span className="text-base sm:text-2xl font-black font-serif leading-none">
          {rankStr}
        </span>
        <span className="text-xs sm:text-base leading-none mt-0.5 font-serif">{suitSymbol}</span>
      </div>

      {/* Large Center Suit Symbol */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <span className="text-4xl sm:text-6xl select-none leading-none opacity-95 font-serif">
          {suitSymbol}
        </span>
      </div>

      {/* Bottom Right Corner (Rotated 180) */}
      <div className="flex flex-col items-center self-end leading-none rotate-180 pointer-events-none z-10">
        <span className="text-base sm:text-2xl font-black font-serif leading-none">
          {rankStr}
        </span>
        <span className="text-xs sm:text-base leading-none mt-0.5 font-serif">{suitSymbol}</span>
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

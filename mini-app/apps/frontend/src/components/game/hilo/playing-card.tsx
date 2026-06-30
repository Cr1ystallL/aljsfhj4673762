'use client';

import { motion } from 'framer-motion';
import { Diamond, Heart, Club, Spade } from 'lucide-react';
import React from 'react';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = number;

export interface CardData {
  suit: Suit;
  rank: Rank;
}

export function getRankName(rank: number) {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return rank.toString();
}

export function getCardColor(suit: Suit) {
  return suit === 'hearts' || suit === 'diamonds' ? 'text-[#ff4949]' : 'text-[#2a2e38]';
}

function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  if (suit === 'hearts') return <Heart className={className} fill="currentColor" />;
  if (suit === 'diamonds') return <Diamond className={className} fill="currentColor" />;
  if (suit === 'clubs') return <Club className={className} fill="currentColor" />;
  return <Spade className={className} fill="currentColor" />;
}

interface PlayingCardProps {
  card: CardData | null;
  faded?: boolean;
  className?: string;
  animateKey?: string | number;
  initialOffset?: number;
  direction?: 'right-to-left' | 'none';
}

export function PlayingCard({
  card,
  faded = false,
  className = '',
  animateKey,
  initialOffset = 50,
  direction = 'none',
}: PlayingCardProps) {
  if (!card) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] ${className}`}
      >
        <span className="text-white/20 text-xs font-roobert tracking-wider uppercase">
          Deck
        </span>
      </div>
    );
  }

  const colorClass = getCardColor(card.suit);
  const rankName = getRankName(card.rank);

  // Framer motion variants for sliding in
  const variants = {
    initial: {
      x: direction === 'right-to-left' ? initialOffset : 0,
      opacity: direction === 'right-to-left' ? 0 : faded ? 0.4 : 1,
      scale: direction === 'right-to-left' ? 0.9 : 1,
    },
    animate: {
      x: 0,
      opacity: faded ? 0.4 : 1,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
      },
    },
    exit: {
      x: direction === 'right-to-left' ? -initialOffset : 0,
      opacity: 0,
      scale: 0.9,
      transition: { duration: 0.2 },
    },
  };

  const CardBody = (
    <div
      className={`relative flex flex-col justify-between rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/10 overflow-hidden ${
        faded ? 'opacity-50 blur-[0.5px] scale-90 grayscale-[0.2]' : 'scale-100'
      } ${colorClass} ${className} transition-all duration-300`}
    >
      <div className="flex flex-col items-center self-start leading-none">
        <span className="text-2xl font-bold font-roobert tracking-tighter">
          {rankName}
        </span>
        <SuitIcon suit={card.suit} className="w-5 h-5 mt-1" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center opacity-[0.08] pointer-events-none">
        <SuitIcon suit={card.suit} className="w-24 h-24" />
      </div>

      <div className="flex flex-col items-center self-end leading-none rotate-180">
        <span className="text-2xl font-bold font-roobert tracking-tighter">
          {rankName}
        </span>
        <SuitIcon suit={card.suit} className="w-5 h-5 mt-1" />
      </div>
    </div>
  );

  if (direction !== 'none') {
    return (
      <motion.div
        key={animateKey}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="absolute"
      >
        {CardBody}
      </motion.div>
    );
  }

  return CardBody;
}

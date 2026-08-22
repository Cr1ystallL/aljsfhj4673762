'use client';

import { motion } from 'framer-motion';
import { useT } from '@/i18n/use-t';

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
  return suit === 'hearts' || suit === 'diamonds' ? '#c23b3b' : '#1a1c22';
}

function SuitMark({
  suit,
  className,
}: {
  suit: Suit;
  className?: string;
}) {
  const color = getCardColor(suit);
  if (suit === 'hearts') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path
          fill={color}
          d="M12 20.4 3.8 12.6C1.6 10.4 1.8 6.8 4.4 4.9c2.1-1.5 5-.9 6.4 1.2L12 7.6l1.2-1.5c1.4-2.1 4.3-2.7 6.4-1.2 2.6 1.9 2.8 5.5.6 7.7Z"
        />
      </svg>
    );
  }
  if (suit === 'diamonds') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path fill={color} d="M12 2.6 20.2 12 12 21.4 3.8 12Z" />
      </svg>
    );
  }
  if (suit === 'clubs') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path
          fill={color}
          d="M12 3.2a4.1 4.1 0 0 1 1.6 7.9 4.2 4.2 0 1 1-3.2 0A4.1 4.1 0 0 1 12 3.2Zm-.8 10.6h1.6l.6 6.6h-2.8Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill={color}
        d="M12 2.8c3.8 4.4 7.6 7.4 7.6 11.1 0 2.6-1.8 4.3-4.2 4.3-1.3 0-2.4-.5-3.4-1.6v4.6H11V16.6c-1 1.1-2.1 1.6-3.4 1.6-2.4 0-4.2-1.7-4.2-4.3 0-3.7 3.8-6.7 7.6-11.1Z"
      />
    </svg>
  );
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
  direction = 'none',
}: PlayingCardProps) {
  const { t } = useT();

  if (!card) {
    return (
      <div
        className={`flex items-center justify-center rounded-[16px] border border-dashed border-white/12 bg-[#0c0d11] ${className}`}
      >
        <span className="font-roobert text-[10px] uppercase tracking-[0.2em] text-white/30">
          {t('hilo.deck')}
        </span>
      </div>
    );
  }

  const color = getCardColor(card.suit);
  const rankName = getRankName(card.rank);

  const CardBody = (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-[16px] px-2.5 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.7)] ${className}`}
      style={{
        background:
          'linear-gradient(180deg, #f7f4ee 0%, #efe8dc 55%, #e7dfd2 100%)',
        opacity: faded ? 0.45 : 1,
        transform: faded ? 'scale(0.92)' : undefined,
      }}
    >
      <Corner rank={rankName} suit={card.suit} color={color} />
      <div className="flex flex-1 items-center justify-center">
        <SuitMark suit={card.suit} className="h-12 w-12" />
      </div>
      <div className="self-end rotate-180">
        <Corner rank={rankName} suit={card.suit} color={color} />
      </div>
    </div>
  );

  if (direction !== 'none') {
    return (
      <motion.div
        key={animateKey}
        initial={{ x: 56, y: -8, rotate: 8, opacity: 0, scale: 0.92 }}
        animate={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
        exit={{ x: -48, y: 10, rotate: -8, opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.85 }}
        className="absolute"
      >
        {CardBody}
      </motion.div>
    );
  }

  return CardBody;
}

function Corner({
  rank,
  suit,
  color,
}: {
  rank: string;
  suit: Suit;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center leading-none" style={{ color }}>
      <span className="font-roobert text-[18px] font-semibold tracking-[-0.04em]">
        {rank}
      </span>
      <SuitMark suit={suit} className="mt-0.5 h-3.5 w-3.5" />
    </div>
  );
}

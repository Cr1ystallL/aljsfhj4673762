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
      className={`relative w-full h-full flex flex-col justify-between rounded-2xl bg-white p-3 sm:p-3.5 shadow-2xl ring-1 ring-black/10 overflow-hidden ${
        faded ? 'opacity-50 blur-[0.5px] scale-90 grayscale-[0.2]' : 'scale-100'
      } ${colorClass} transition-all duration-300`}
    >
      <div className="flex flex-col items-center self-start leading-none">
        <span className="text-2xl sm:text-3xl font-bold font-roobert tracking-tighter">
          {rankName}
        </span>
        <SuitIcon suit={card.suit} className="w-5 h-5 sm:w-6 sm:h-6 mt-1" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1024 1024"
          className="w-24 h-24"
          fill="currentColor"
        >
          <g transform="translate(0,1024) scale(0.1,-0.1)">
            <path d="M5050 8891 c-186 -60 -321 -200 -450 -465 -181 -372 -333 -968 -486 -1906 -20 -124 -38 -232 -41 -240 -3 -8 -22 35 -43 95 -129 377 -321 783 -495 1045 -195 294 -367 434 -585 477 -218 43 -440 -63 -585 -281 -268 -403 -405 -1125 -405 -2136 0 -955 176 -2298 335 -2549 93 -148 230 -221 389 -208 138 12 263 105 329 244 30 65 32 74 31 183 0 102 -7 144 -57 365 -125 557 -201 1068 -239 1615 -19 283 -16 1071 5 1340 39 478 93 772 144 788 31 9 115 -120 197 -305 236 -528 498 -1528 636 -2427 86 -566 99 -960 50 -1546 -26 -312 -20 -400 38 -515 35 -70 68 -110 136 -161 121 -92 292 -111 427 -46 122 58 216 182 245 324 13 62 13 102 -3 362 -24 399 -24 1277 0 1616 33 459 68 801 142 1392 112 891 214 1493 334 1971 60 234 86 309 109 305 42 -8 159 -453 256 -968 93 -495 211 -1393 271 -2055 94 -1040 92 -1452 -12 -2659 -14 -163 -15 -213 -5 -280 36 -247 222 -398 474 -384 69 4 100 12 153 36 85 41 175 129 214 212 50 106 56 167 41 449 -19 367 -6 665 51 1121 104 839 333 1741 594 2346 109 250 248 496 302 531 25 16 26 16 49 -10 72 -84 156 -523 196 -1017 17 -219 17 -987 0 -1220 -35 -467 -75 -835 -148 -1355 -43 -304 -46 -335 -35 -398 24 -142 112 -260 238 -320 62 -29 77 -32 163 -32 131 1 190 25 279 114 99 99 135 181 175 412 88 495 122 972 113 1569 -19 1153 -141 1925 -384 2416 -105 213 -230 350 -388 426 -224 107 -451 83 -681 -73 -221 -149 -470 -481 -674 -902 l-68 -139 -22 124 c-134 741 -300 1479 -410 1823 -172 536 -366 817 -618 895 -82 25 -205 26 -282 1z" />
          </g>
        </svg>
      </div>

      <div className="flex flex-col items-center self-end leading-none rotate-180">
        <span className="text-2xl sm:text-3xl font-bold font-roobert tracking-tighter">
          {rankName}
        </span>
        <SuitIcon suit={card.suit} className="w-5 h-5 sm:w-6 sm:h-6 mt-1" />
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
        className={className}
      >
        {CardBody}
      </motion.div>
    );
  }

  return <div className={className}>{CardBody}</div>;
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

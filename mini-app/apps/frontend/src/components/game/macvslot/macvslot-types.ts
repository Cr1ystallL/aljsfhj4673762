export type SlotSymbol =
  | 'macvjet'
  | 'mines'
  | 'wheel'
  | 'coinflip'
  | 'a'
  | 'k'
  | 'q'
  | 'j'
  | '10'
  | 'wield'
  | 'scatter'
  | 'x2'
  | 'x3'
  | 'x5';

export interface WinningLine {
  lineIndex: number;
  symbol: SlotSymbol;
  count: number;
  positions: [number, number][]; // [reel, row]
  payout: number;
}

export interface StickyMultiplier {
  reel: number; // 2, 3, 4 (0-indexed)
  row: number;  // 0, 1, 2
  symbol: 'x2' | 'x3' | 'x5';
}

export interface SlotSpinResponse {
  ok: boolean;
  roundId: string;
  grid: SlotSymbol[][]; // 5 reels x 3 rows
  winningLines: WinningLine[];
  lineWinTotal: number;
  scatterCount: number;
  scatterWin: number;
  totalWin: number;
  freeSpinsAwarded: number;
  freeSpinsRemaining: number;
  freeSpinsInitial?: number;
  isFreeSpin: boolean;
  stickyMultipliers?: StickyMultiplier[];
  newBalance?: {
    amount: number;
    currency: string;
  };
}

export const SYMBOL_IMAGES: Record<SlotSymbol, string> = {
  macvjet: '/MacvSlot/macvjet.webp?v=20260914v2',
  mines: '/MacvSlot/mines.webp?v=20260914v2',
  wheel: '/MacvSlot/wheel.webp?v=20260914v2',
  coinflip: '/MacvSlot/coinflip.webp?v=20260914v2',
  a: '/MacvSlot/a.webp?v=20260914v2',
  k: '/MacvSlot/k.webp?v=20260914v2',
  q: '/MacvSlot/q.webp?v=20260914v2',
  j: '/MacvSlot/j.webp?v=20260914v2',
  '10': '/MacvSlot/10.webp?v=20260914v2',
  wield: '/MacvSlot/wield.webp?v=20260914v2',
  scatter: '/MacvSlot/scatter.webp?v=20260914v2',
  x2: '/MacvSlot/x2.webp',
  x3: '/MacvSlot/x3.webp',
  x5: '/MacvSlot/x5.webp',
};

export const SYMBOL_NAMES: Record<SlotSymbol, string> = {
  macvjet: 'MacvJet',
  mines: 'Mines',
  wheel: 'Wheel',
  coinflip: 'Coinflip',
  a: 'Туз A',
  k: 'Король K',
  q: 'Дама Q',
  j: 'Валет J',
  '10': 'Десятка 10',
  wield: 'WILD',
  scatter: 'SCATTER',
  x2: 'Множитель X2',
  x3: 'Множитель X3',
  x5: 'Множитель X5',
};

export const SLOT_PAYLINES: number[][] = [
  [1, 1, 1, 1, 1], // Line 1: Средняя линия
  [0, 0, 0, 0, 0], // Line 2: Верхняя линия
  [2, 2, 2, 2, 2], // Line 3: Нижняя линия
  [0, 1, 2, 1, 0], // Line 4: V-образная
  [2, 1, 0, 1, 2], // Line 5: Перевернутая V
  [0, 0, 1, 0, 0], // Line 6
  [2, 2, 1, 2, 2], // Line 7
  [1, 2, 2, 2, 1], // Line 8
  [1, 0, 0, 0, 1], // Line 9
  [0, 1, 1, 1, 0], // Line 10
  [2, 1, 1, 1, 2], // Line 11
  [1, 1, 0, 1, 1], // Line 12
  [1, 1, 2, 1, 1], // Line 13
  [0, 1, 0, 1, 0], // Line 14
  [2, 1, 2, 1, 2], // Line 15
  [1, 0, 1, 0, 1], // Line 16
  [1, 2, 1, 2, 1], // Line 17
  [0, 0, 2, 0, 0], // Line 18
  [2, 2, 0, 2, 2], // Line 19
  [0, 2, 0, 2, 0], // Line 20
];

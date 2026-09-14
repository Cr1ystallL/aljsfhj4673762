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
  | 'scatter';

export interface WinningLine {
  lineIndex: number;
  symbol: SlotSymbol;
  count: number;
  positions: [number, number][]; // [reel, row]
  payout: number;
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
  isFreeSpin: boolean;
  newBalance?: {
    amount: number;
    currency: string;
  };
}

export const SYMBOL_IMAGES: Record<SlotSymbol, string> = {
  macvjet: '/MacvSlot/macvjet.webp',
  mines: '/MacvSlot/mines.webp',
  wheel: '/MacvSlot/wheel.webp',
  coinflip: '/MacvSlot/coinflip.webp',
  a: '/MacvSlot/a.webp',
  k: '/MacvSlot/k.webp',
  q: '/MacvSlot/q.webp',
  j: '/MacvSlot/j.webp',
  '10': '/MacvSlot/10.webp',
  wield: '/MacvSlot/wield.webp',
  scatter: '/MacvSlot/scatter.webp',
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
};

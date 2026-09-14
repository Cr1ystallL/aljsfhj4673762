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

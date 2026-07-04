import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Coins, Dice5, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';
import type { KenoRisk } from '@/lib/game-engine/types';

export type KenoPhase = 'idle' | 'playing' | 'revealing';

interface KenoBetPanelProps {
  amount: number;
  onAmountChange: (v: number) => void;
  risk: string;
  onRiskChange: (r: string) => void;
  picks: number[];
  onAutoPick: () => void;
  onClear: () => void;
  phase: KenoPhase;
  onBet: () => void;
  busy: boolean;
  maxPick: number;
  activeBalance: number;
  currency: string;
}

export function KenoBetPanel({
  amount,
  onAmountChange,
  risk,
  onRiskChange,
  picks,
  onAutoPick,
  onClear,
  phase,
  onBet,
  busy,
  maxPick,
  activeBalance,
  currency,
}: KenoBetPanelProps) {
  const [amountStr, setAmountStr] = useState(amount.toString());

  const handleAmountStr = (val: string) => {
    setAmountStr(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      onAmountChange(parsed);
    }
  };

  const handleHalve = () => {
    const val = Math.max(1, Math.floor(amount / 2));
    setAmountStr(val.toString());
    onAmountChange(val);
    soundManager.play('click');
  };

  const handleDouble = () => {
    const val = amount * 2;
    setAmountStr(val.toString());
    onAmountChange(val);
    soundManager.play('click');
  };

  const handleMax = () => {
    const val = Math.floor(activeBalance);
    setAmountStr(val.toString());
    onAmountChange(val);
    soundManager.play('click');
  };

  const disabled = phase !== 'idle' || busy;
  const canBet = picks.length >= 1 && picks.length <= maxPick && !disabled;

  return (
    <div className="flex flex-col gap-6 p-4 rounded-xl border border-white/5 bg-black/40 backdrop-blur-md">
      {/* Bet Amount */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase tracking-wider text-white/50">
            Сумма ставки
          </label>
          <span className="text-xs text-white/70 font-mono">
            {activeBalance.toFixed(2)} {currency}
          </span>
        </div>
        <div className="relative flex items-center bg-black/40 border border-white/10 rounded-lg focus-within:border-primary/50 transition-colors">
          <div className="pl-3 text-white/40">
            <Coins className="w-4 h-4" />
          </div>
          <input
            type="number"
            value={amountStr}
            onChange={(e) => handleAmountStr(e.target.value)}
            disabled={disabled}
            className="w-full h-10 px-3 py-2 border-0 bg-transparent outline-none focus-visible:ring-0 text-white font-mono text-lg"
          />
          <div className="flex pr-1 space-x-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={handleHalve}
              className="h-8 px-2 text-xs hover:bg-white/10 text-white/70"
            >
              1/2
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={handleDouble}
              className="h-8 px-2 text-xs hover:bg-white/10 text-white/70"
            >
              2x
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={handleMax}
              className="h-8 px-2 text-xs hover:bg-white/10 text-white/70"
            >
              MAX
            </Button>
          </div>
        </div>
      </div>

      {/* Risk Selector */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-white/50">
          Риск
        </label>
        <div className="grid grid-cols-4 gap-1 p-1 bg-black/40 rounded-lg border border-white/10">
          {(['classic', 'low', 'medium', 'high'] as KenoRisk[]).map((r) => (
            <button
              key={r}
              disabled={disabled}
              onClick={() => {
                onRiskChange(r);
                soundManager.play('click');
              }}
              className={cn(
                'py-2 text-xs font-medium rounded-md capitalize transition-all duration-200',
                risk === r
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5 disabled:opacity-50'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          disabled={disabled}
          onClick={onAutoPick}
          className="border-white/10 hover:bg-white/5 text-white/70"
        >
          <Dice5 className="w-4 h-4 mr-2" />
          Авто
        </Button>
        <Button
          variant="outline"
          disabled={disabled || picks.length === 0}
          onClick={onClear}
          className="border-white/10 hover:bg-destructive/20 hover:text-destructive text-white/70"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Сброс
        </Button>
      </div>

      {/* Play Button */}
      <Button
        disabled={!canBet}
        onClick={onBet}
        className={cn(
          'w-full py-6 text-lg font-bold shadow-lg shadow-primary/20 transition-all duration-300',
          canBet ? 'hover:scale-[1.02] active:scale-[0.98]' : ''
        )}
      >
        {phase === 'revealing' ? 'Игра идет...' : busy ? 'Загрузка...' : 'СТАВКА'}
      </Button>

      <div className="text-center">
        <span className="text-xs text-white/40">
          Выбрано: {picks.length} / {maxPick}
        </span>
      </div>
    </div>
  );
}

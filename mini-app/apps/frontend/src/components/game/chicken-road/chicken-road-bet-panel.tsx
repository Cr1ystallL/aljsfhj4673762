'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ChickenRoadLevel = 'easy' | 'medium' | 'hard';

export interface ChickenRoadBetPanelProps {
  phase: 'idle' | 'playing' | 'cashout';
  amount: number;
  onAmountChange: (amount: number) => void;
  level: ChickenRoadLevel;
  onLevelChange: (level: ChickenRoadLevel) => void;
  onBet: () => void;
  onCashout: () => void;
  busy: boolean;
  balance: number;
  currentMultiplier: number;
  nextMultiplier: number;
}

export function ChickenRoadBetPanel({
  phase,
  amount,
  onAmountChange,
  level,
  onLevelChange,
  onBet,
  onCashout,
  busy,
  balance,
  currentMultiplier,
  nextMultiplier,
}: ChickenRoadBetPanelProps) {
  const isIdle = phase === 'idle';
  const isPlaying = phase === 'playing';

  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-white/5 bg-black/40 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">Chicken Road</h2>
      </div>

      {/* Difficulty Level */}
      <div className="space-y-2">
        <label className="text-sm text-zinc-400">Сложность</label>
        <div className="flex gap-2">
          {(['easy', 'medium', 'hard'] as const).map((lvl) => (
            <button
              key={lvl}
              disabled={!isIdle || busy}
              onClick={() => onLevelChange(lvl)}
              className={cn(
                'flex-1 rounded-md py-2 text-sm font-medium capitalize transition-colors',
                level === lvl
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white',
                (!isIdle || busy) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {lvl === 'easy' ? 'Легко' : lvl === 'medium' ? 'Средне' : 'Сложно'}
            </button>
          ))}
        </div>
      </div>

      {/* Bet Amount */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-zinc-400">Сумма ставки</label>
          <span className="text-sm font-medium text-white">
            {balance.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black px-3 py-2">
          <span className="text-zinc-500">zł</span>
          <input
            type="number"
            min={1}
            step={1}
            disabled={!isIdle || busy}
            value={amount}
            onChange={(e) => onAmountChange(Number(e.target.value))}
            className="w-full bg-transparent text-white outline-none"
          />
          <div className="flex gap-1">
            <button
              disabled={!isIdle || busy}
              onClick={() => onAmountChange(Math.max(1, amount / 2))}
              className="rounded bg-white/10 px-2 text-xs font-medium text-white hover:bg-white/20"
            >
              1/2
            </button>
            <button
              disabled={!isIdle || busy}
              onClick={() => onAmountChange(amount * 2)}
              className="rounded bg-white/10 px-2 text-xs font-medium text-white hover:bg-white/20"
            >
              2x
            </button>
          </div>
        </div>
      </div>

      {/* Action Button */}
      {isIdle ? (
        <Button
          onClick={onBet}
          disabled={busy || amount < 1 || amount > balance}
          className="mt-auto w-full bg-white/10 hover:bg-white/20 border border-white/20 py-6 text-lg font-bold text-white transition-all backdrop-blur-xl"
        >
          {busy ? <Loader2 className="animate-spin" /> : 'Играть'}
        </Button>
      ) : (
        <Button
          onClick={onCashout}
          disabled={busy || currentMultiplier === 0}
          className="mt-auto flex w-full flex-col bg-amber-500 py-8 text-white hover:bg-amber-600"
        >
          <span className="text-sm font-medium opacity-90">Забрать</span>
          <span className="text-xl font-bold">
            {currentMultiplier > 0
              ? `$${(amount * currentMultiplier).toFixed(2)}`
              : 'Wait for next step'}
          </span>
        </Button>
      )}

      {/* Multipliers info */}
      {isPlaying && (
        <div className="flex justify-between rounded-md bg-white/5 p-3 text-sm">
          <div className="flex flex-col">
            <span className="text-zinc-400">Current</span>
            <span className="font-mono text-green-400">{currentMultiplier}x</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-zinc-400">Next Step</span>
            <span className="font-mono text-white">{nextMultiplier}x</span>
          </div>
        </div>
      )}
    </div>
  );
}

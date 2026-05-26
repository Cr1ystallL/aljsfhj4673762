'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Body, Caption } from '@/components/ui/typography';

/**
 * Bet Controls Component
 * Reusable betting interface for all games
 * 
 * ARCHITECTURE:
 * - Optimistic UI updates
 * - Server validation
 * - Preset bet amounts
 * - Min/max enforcement
 */

interface BetControlsProps {
  minBet: number;
  maxBet: number;
  balance: number;
  onBet: (amount: number) => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
}

const PRESET_MULTIPLIERS = [0.5, 2, 5, 10];

export function BetControls({
  minBet,
  maxBet,
  balance,
  onBet,
  disabled = false,
  isLoading = false,
}: BetControlsProps) {
  const [betAmount, setBetAmount] = useState(minBet);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleIncrease = () => {
    setBetAmount((prev) => Math.min(prev * 2, maxBet, balance));
  };

  const handleDecrease = () => {
    setBetAmount((prev) => Math.max(prev / 2, minBet));
  };

  const handlePreset = (multiplier: number) => {
    const amount = Math.min(minBet * multiplier, maxBet, balance);
    setBetAmount(amount);
  };

  const handleMax = () => {
    setBetAmount(Math.min(maxBet, balance));
  };

  const handleSubmit = async () => {
    if (betAmount < minBet || betAmount > maxBet || betAmount > balance) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onBet(betAmount);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canBet = !disabled && !isLoading && !isSubmitting && betAmount >= minBet && betAmount <= balance;

  return (
    <GlassCard className="p-6 space-y-4">
      {/* Bet Amount Display */}
      <div className="text-center">
        <Caption className="text-white/60 mb-2">Сумма ставки</Caption>
        <div className="flex items-center justify-center gap-2">
          <DollarSign className="h-6 w-6 text-white/60" />
          <motion.div
            key={betAmount}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-4xl font-bold text-white"
          >
            {betAmount.toFixed(2)}
          </motion.div>
        </div>
      </div>

      {/* Amount Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDecrease}
          disabled={disabled || betAmount <= minBet}
          className="flex-1"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <div className="flex-1 text-center">
          <input
            type="number"
            value={betAmount}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || minBet;
              setBetAmount(Math.max(minBet, Math.min(maxBet, balance, value)));
            }}
            disabled={disabled}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-center text-white focus:outline-none focus:border-white/30 transition-colors"
            step={minBet}
            min={minBet}
            max={Math.min(maxBet, balance)}
          />
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleIncrease}
          disabled={disabled || betAmount >= Math.min(maxBet, balance)}
          className="flex-1"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-5 gap-2">
        {PRESET_MULTIPLIERS.map((multiplier) => (
          <Button
            key={multiplier}
            variant="ghost"
            size="sm"
            onClick={() => handlePreset(multiplier)}
            disabled={disabled}
            className="text-xs"
          >
            {multiplier}x
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMax}
          disabled={disabled}
          className="text-xs"
        >
          Макс
        </Button>
      </div>

      {/* Bet Button */}
      <Button
        variant="primary"
        size="lg"
        onClick={handleSubmit}
        disabled={!canBet}
        className="w-full"
      >
        {isSubmitting ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            ⟳
          </motion.div>
        ) : (
          'Сделать ставку'
        )}
      </Button>

      {/* Info */}
      <div className="flex justify-between text-xs text-white/40">
        <span>Мин: {minBet.toFixed(2)} zł</span>
        <span>Макс: {Math.min(maxBet, balance).toFixed(2)} zł</span>
      </div>
    </GlassCard>
  );
}

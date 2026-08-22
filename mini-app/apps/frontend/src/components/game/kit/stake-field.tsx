'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Pressable } from '@/components/ui/pressable';

interface StakeFieldProps {
  amount: number;
  onAmountChange: (next: number) => void;
  minBet: number;
  maxBet: number;
  disabled?: boolean;
  label?: string;
  decreaseLabel?: string;
  increaseLabel?: string;
  /** Default is ½ / ×2 — the shared kit. Steppers kept for count fields. */
  variant?: 'steppers' | 'halve-double';
  className?: string;
  inputClassName?: string;
}

export function StakeField({
  amount,
  onAmountChange,
  minBet,
  maxBet,
  disabled = false,
  label,
  decreaseLabel,
  increaseLabel,
  variant = 'halve-double',
  className,
  inputClassName,
}: StakeFieldProps) {
  const [inputValue, setInputValue] = useState(amount.toString());
  useEffect(() => {
    setInputValue(amount.toString());
  }, [amount]);

  const clamp = (value: number) => Math.max(minBet, Math.min(maxBet, value));
  const halve = () => onAmountChange(clamp(+(amount / 2 || minBet).toFixed(2)));
  const double = () => onAmountChange(clamp(+(amount * 2 || minBet).toFixed(2)));

  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) onAmountChange(clamp(parsed));
    else setInputValue(amount.toString());
  };

  const input = (
    <input
      type="number"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      disabled={disabled}
      className={cn(
        'flex-1 min-w-0 bg-transparent text-frost-white font-roobert font-light tabular-nums focus:outline-none',
        inputClassName ?? 'text-[22px] text-center'
      )}
      step={1}
      min={minBet}
      max={maxBet}
    />
  );

  if (variant === 'halve-double') {
    return (
      <div className={className}>
        {label ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
              {label}
            </span>
            <div className="flex items-center gap-1">
              <HalveDoubleButton onClick={halve} disabled={disabled}>
                ½
              </HalveDoubleButton>
              <HalveDoubleButton onClick={double} disabled={disabled}>
                ×2
              </HalveDoubleButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <HalveDoubleButton onClick={halve} disabled={disabled}>
              ½
            </HalveDoubleButton>
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="text-whisper-gray text-[12px] font-roobert">zł</span>
              {input}
            </div>
            <HalveDoubleButton onClick={double} disabled={disabled}>
              ×2
            </HalveDoubleButton>
          </div>
        )}
        {label ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-whisper-gray text-[12px] font-roobert">zł</span>
            {input}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      {label ? (
        <div className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
          {label}
        </div>
      ) : null}
      <div className={cn('flex items-center justify-between gap-2', label && 'mt-2')}>
        <KitStepperButton
          onClick={halve}
          disabled={disabled}
          ariaLabel={decreaseLabel}
        >
          <Minus size={12} strokeWidth={2.2} />
        </KitStepperButton>
        {input}
        <KitStepperButton
          onClick={double}
          disabled={disabled}
          ariaLabel={increaseLabel}
        >
          <Plus size={12} strokeWidth={2.2} />
        </KitStepperButton>
      </div>
    </div>
  );
}

function HalveDoubleButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 px-2.5 py-1 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 text-[11px] font-roobert tabular-nums"
    >
      {children}
    </Pressable>
  );
}

export function KitStepperButton({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Pressable
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white disabled:opacity-40"
    >
      {children}
    </Pressable>
  );
}

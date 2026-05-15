'use client';

import { cn } from '@/lib/utils';
import type { PlinkoRisk } from '@/lib/games/plinko/types';

/**
 * Plinko Risk Selector — Monopo Saigon Style
 *
 * Three-segment pill switching between low/medium/high risk tiers. The
 * active tier is filled with frost white, the others stay frosted.
 */
const TIERS: Array<{ key: PlinkoRisk; label: string }> = [
  { key: 'low', label: 'Низкий' },
  { key: 'medium', label: 'Средний' },
  { key: 'high', label: 'Высокий' },
];

interface PlinkoRiskSelectorProps {
  value: PlinkoRisk;
  onChange: (next: PlinkoRisk) => void;
  disabled?: boolean;
}

export function PlinkoRiskSelector({
  value,
  onChange,
  disabled,
}: PlinkoRiskSelectorProps) {
  return (
    <div className="rounded-pill border border-white/15 bg-white/[0.04] backdrop-blur-md p-1 inline-flex">
      {TIERS.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => !disabled && onChange(t.key)}
            disabled={disabled}
            className={cn(
              'px-3 sm:px-4 py-1 rounded-pill font-roobert text-[11px] uppercase tracking-[0.16em] transition-colors',
              active
                ? 'bg-frost-white text-midnight-canvas'
                : 'text-frost-white/70 hover:text-frost-white'
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

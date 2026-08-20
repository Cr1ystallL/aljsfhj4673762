'use client';

import { cn } from '@/lib/utils';
import type { PlinkoRisk } from '@/lib/games/plinko/types';
import { useT } from '@/i18n/use-t';

/**
 * Plinko Risk Selector — Monopo Saigon Style
 *
 * Three-segment pill switching between low/medium/high risk tiers. The
 * active tier is filled with frost white, the others stay frosted.
 */
const TIER_KEYS: PlinkoRisk[] = ['low', 'medium', 'high'];

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
  const { t } = useT();
  return (
    <div className="rounded-pill border border-white/15 bg-white/[0.04] backdrop-blur-md p-1 inline-flex">
      {TIER_KEYS.map((key) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => !disabled && onChange(key)}
            disabled={disabled}
            className={cn(
              'px-3 sm:px-4 py-1 rounded-pill font-roobert text-[11px] uppercase tracking-[0.16em] transition-colors',
              active
                ? 'bg-frost-white text-midnight-canvas'
                : 'text-frost-white/70 hover:text-frost-white'
            )}
          >
            {t(
              key === 'low'
                ? 'risk.low'
                : key === 'medium'
                  ? 'risk.medium'
                  : 'risk.high'
            )}
          </button>
        );
      })}
    </div>
  );
}

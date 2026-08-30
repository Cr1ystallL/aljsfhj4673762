import { gameConfig } from '../../services/game-config.js';
import type { SportKind } from './catalog.js';

export interface SportsLimits {
  paused: boolean;
  maxCombined: number;
  maxPayout: number;
  cashoutEnabled: boolean;
  cashoutMargin: number;
  oddsDrift: number;
  enabledSports: string[] | null;
}

export async function sportsLimits(): Promise<SportsLimits> {
  const cfg = await gameConfig.get('sports');
  const extras = cfg.extras ?? {};
  const enabled = extras.enabledSports;
  return {
    paused: !!cfg.paused,
    maxCombined: Math.max(2, Number(extras.maxCombinedOdds ?? 1000)),
    maxPayout: Math.max(10, Number(extras.maxPayout ?? 50_000)),
    cashoutEnabled: extras.cashoutEnabled !== false,
    cashoutMargin: Math.min(0.98, Math.max(0.5, Number(extras.cashoutMargin ?? 0.88))),
    oddsDrift: Math.min(0.25, Math.max(0.005, Number(extras.oddsDrift ?? 0.02))),
    enabledSports: Array.isArray(enabled) ? enabled.map(String) : null,
  };
}

export function sportEnabled(kind: SportKind, enabled: string[] | null): boolean {
  if (!enabled || enabled.length === 0) return true;
  return enabled.includes(kind);
}

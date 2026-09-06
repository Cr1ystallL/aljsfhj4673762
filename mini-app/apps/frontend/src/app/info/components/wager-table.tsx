'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  WAGER_CONTRIBUTION_DEFAULTS,
  WAGER_GAME_LABELS,
  WAGER_GAME_ORDER,
  wagerContributionPercent,
  type WagerGameType,
} from '@casino/shared';

type Live = Partial<Record<WagerGameType, number>>;

/**
 * Per-game wager contribution. Pulls live values from the backend so the
 * FAQ never disagrees with what the pipeline applies; falls back to the
 * shared defaults if the request fails. Hidden games are not returned by
 * the API and are left out.
 */
export function WagerTable() {
  const [live, setLive] = useState<Live | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/games/wager-contribution', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { ok?: boolean; games?: Record<string, number> }) => {
        if (!alive) return;
        if (json?.ok && json.games) setLive(json.games as Live);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const source: Live = live ?? WAGER_CONTRIBUTION_DEFAULTS;
    return WAGER_GAME_ORDER.filter((g) => (live ? g in live : g !== 'macvpot')).map((g) => ({
      game: g,
      label: WAGER_GAME_LABELS[g],
      percent: wagerContributionPercent(source[g] ?? WAGER_CONTRIBUTION_DEFAULTS[g]),
    }));
  }, [live]);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-2.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 border-b border-white/10">
        <span>Игра</span>
        <span>Вклад</span>
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {rows.map((row) => (
          <li key={row.game} className="grid grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[13.5px] text-white/85 truncate">{row.label}</span>
              <div className="hidden sm:block flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden max-w-[140px]">
                <div
                  className={`h-full rounded-full ${row.percent >= 100 ? 'bg-emerald-400/80' : row.percent >= 50 ? 'bg-amber-300/80' : 'bg-orange-400/80'}`}
                  style={{ width: `${row.percent}%` }}
                />
              </div>
            </div>
            <span
              className={`font-roobert font-bold tabular-nums text-[13.5px] px-2 py-0.5 rounded-lg border ${
                row.percent >= 100
                  ? 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10'
                  : row.percent >= 50
                  ? 'text-amber-200 border-amber-400/25 bg-amber-400/10'
                  : 'text-orange-200 border-orange-400/25 bg-orange-400/10'
              }`}
            >
              {row.percent}%
            </span>
          </li>
        ))}
      </ul>
      <p className="px-4 py-2.5 text-[11px] text-white/40 border-t border-white/10">
        {failed
          ? 'Показаны значения по умолчанию. Актуальные — в профиле при ставке.'
          : 'Значения настраиваются администрацией и обновляются без перезапуска. Текущий прогресс — в профиле.'}
      </p>
    </div>
  );
}

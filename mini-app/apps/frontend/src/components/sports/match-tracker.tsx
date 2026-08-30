'use client';

import { useMemo, useState } from 'react';
import { VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SportEvent } from '@/types/sports';
import { TeamLogo } from '@/components/ui/team-logo';
import { useT } from '@/i18n/use-t';
import { LiveClock } from './live-clock';
import { teamLogoMark } from './team-mark';

type Period = 'all' | 'h1' | 'h2';
type ActionKind = 'goal' | 'danger' | 'shot' | 'miss' | 'corner' | 'card' | 'sub' | 'attack';

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(seed: number, salt: number): number {
  return ((seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0) / 0xffffffff;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function detectAction(text: string): ActionKind {
  const s = text.toLowerCase();
  if (/\b(goal|scores?|гол)\b/.test(s)) return 'goal';
  if (/\b(yellow|red|card|карт)\b/.test(s)) return 'card';
  if (/\b(corner|угл)/.test(s)) return 'corner';
  if (/\b(substitut|replace|замен)/.test(s)) return 'sub';
  if (/(miss(?:ed)?|\bwide\b|off target|over the|мимо)/.test(s)) return 'miss';
  if (/\b(shot on|saved|blocked|удар в створ)\b/.test(s)) return 'shot';
  if (/\b(shot|attempt|удар|strike)\b/.test(s)) return 'shot';
  if (/\b(box|penalty area|dangerous|опасно)\b/.test(s)) return 'danger';
  return 'attack';
}

function actionTeam(event: SportEvent, text: string, seed: number): 1 | 2 {
  const s = text.toLowerCase();
  if (event.team1.name && s.includes(event.team1.name.toLowerCase())) return 1;
  if (event.team2.name && s.includes(event.team2.name.toLowerCase())) return 2;
  return unit(seed, 17) > 0.5 ? 1 : 2;
}

function markerFor(action: ActionKind, team: 1 | 2, seed: number): { x: number; y: number } {
  const y = 32 + unit(seed, 3) * 36;
  if (action === 'goal') return { x: team === 1 ? 90 : 10, y: 50 };
  if (action === 'corner') return { x: team === 1 ? 88 : 12, y: unit(seed, 5) > 0.5 ? 14 : 86 };
  if (action === 'danger' || action === 'shot' || action === 'miss') {
    return { x: team === 1 ? 78 + unit(seed, 7) * 10 : 12 + unit(seed, 7) * 10, y };
  }
  return { x: team === 1 ? 58 + unit(seed, 9) * 16 : 26 + unit(seed, 9) * 16, y };
}

export function MatchTracker({ event }: { event: SportEvent }) {
  const { t } = useT();
  const [period, setPeriod] = useState<Period>('all');
  const mark = teamLogoMark(event);
  const play = event.lastEventNotification?.trim() ?? '';
  const minute = event.liveMinute ?? 0;
  const seed = hash32(`${event.id}:${minute}:${play}:${event.team1.score ?? 0}:${event.team2.score ?? 0}`);

  const model = useMemo(() => {
    const action = play ? detectAction(play) : event.isLive ? 'attack' : 'attack';
    const team = play ? actionTeam(event, play, seed) : ((unit(seed, 11) > 0.5 ? 1 : 2) as 1 | 2);
    const marker = markerFor(action, team, seed);
    const s1 = event.team1.score ?? 0;
    const s2 = event.team2.score ?? 0;
    const possBias = clamp(50 + (s1 - s2) * 4 + (unit(seed, 13) - 0.5) * 10, 38, 62);
    const possession1 = Math.round(event.stats?.possession1 ?? possBias);
    const possession2 = Math.round(event.stats?.possession2 ?? 100 - possession1);
    const fill = (real: number | undefined, base: number, spread: number, salt: number) =>
      real ?? Math.max(0, Math.round(base + unit(seed, salt) * spread));

    return {
      action,
      team,
      marker,
      possession1,
      possession2,
      corners1: fill(event.stats?.corners1, 1 + s1, 4, 21),
      corners2: fill(event.stats?.corners2, 1 + s2, 4, 22),
      shotsOn1: fill(event.stats?.shotsOn1, 1 + s1, 4, 23),
      shotsOn2: fill(event.stats?.shotsOn2, s2, 4, 24),
      shotsOff1: fill(event.stats?.shotsOff1, 1, 5, 25),
      shotsOff2: fill(event.stats?.shotsOff2, 1, 5, 26),
      subs1: fill(event.stats?.subs1, minute >= 55 ? 1 : 0, 2, 27),
      subs2: fill(event.stats?.subs2, minute >= 55 ? 1 : 0, 2, 28),
      cards1: fill(event.stats?.yellow1, 0, 2, 29),
      cards2: fill(event.stats?.yellow2, 0, 2, 30),
      attack1: Math.round(clamp(38 + s1 * 8 + unit(seed, 31) * 28, 22, 92)),
      attack2: Math.round(clamp(38 + s2 * 8 + unit(seed, 32) * 28, 22, 92)),
    };
  }, [event, play, seed, minute]);

  const actionLabel =
    model.action === 'goal'
      ? t('sports.actionGoal')
      : model.action === 'danger'
        ? t('sports.actionDanger')
        : model.action === 'shot'
          ? t('sports.actionShot')
          : model.action === 'miss'
            ? t('sports.actionMiss')
            : model.action === 'corner'
              ? t('sports.actionCorner')
              : model.action === 'card'
                ? t('sports.actionCard')
                : model.action === 'sub'
                  ? t('sports.actionSub')
                  : event.isLive
                    ? t('sports.actionAttack')
                    : t('sports.tabOverview');

  const actor = model.team === 1 ? event.team1.name : event.team2.name;
  const duration = event.sport === 'football' ? 90 : event.sport === 'hockey' ? 60 : event.sport === 'basketball' ? 48 : 60;
  const progress = event.isLive ? clamp(((event.liveMinute ?? 0) + (event.liveSecond ?? 0) / 60) / duration, 0.04, 0.98) : event.status === 'finished' ? 1 : 0.04;
  const showPeriods = event.sport === 'football';

  const actionKeys: Array<{ key: string; label: string }> = [
    { key: 'corners', label: t('sports.statCorners') },
    { key: 'on', label: t('sports.statOnTarget') },
    { key: 'off', label: t('sports.statOffTarget') },
    { key: 'subs', label: t('sports.statSubs') },
    { key: 'cards', label: t('sports.statCards') },
  ];

  return (
    <div className="rounded-3xl overflow-hidden border border-white/10 bg-[#0b1410] shadow-[0_8px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-roobert text-[18px] font-black tabular-nums text-frost-white">
            {event.team1.score ?? 0}:{event.team2.score ?? 0}
          </span>
          <TeamLogo
            src={event.team1.logo}
            name={event.team1.name}
            initials={event.team1.initials}
            color={event.team1.color}
            size={22}
            mark={mark}
          />
          <span className="font-roobert text-[12px] font-semibold text-frost-white truncate">
            {event.team1.shortName || event.team1.name}
            <span className="text-whisper-gray font-medium"> — </span>
            {event.team2.shortName || event.team2.name}
          </span>
          <TeamLogo
            src={event.team2.logo}
            name={event.team2.name}
            initials={event.team2.initials}
            color={event.team2.color}
            size={22}
            mark={mark}
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <VideoOff size={13} className="text-whisper-gray/70" strokeWidth={1.8} />
          <span className="font-roobert text-[12px] font-bold tabular-nums text-frost-white">
            {event.isLive ? <LiveClock event={event} /> : event.status === 'finished' ? t('sports.finished') : '—'}
          </span>
        </div>
      </div>

      <div className="px-3.5 pb-2">
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-300/80"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1.15fr_1fr] gap-0 border-t border-white/8">
        <div className="relative px-3 py-3">
          <Pitch sport={event.sport} marker={model.marker} team={model.team} />
          <div className="absolute inset-x-3 top-5 flex flex-col items-center pointer-events-none">
            <div className="px-3 py-1 rounded-md bg-black/55 border border-white/10 text-center">
              <div className="font-roobert text-[13px] font-black tracking-[0.06em] text-frost-white uppercase">
                {actionLabel}
              </div>
              {event.isLive && (
                <div className="font-roobert text-[11px] text-frost-white/80">{actor}</div>
              )}
            </div>
            {event.isLive && (
              <div className="mt-2 px-2.5 py-0.5 rounded-full bg-black/55 border border-white/10 font-roobert text-[10px] text-frost-white/85 tabular-nums">
                {t('sports.possession', { a: model.possession1, b: model.possession2 })}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-roobert text-[9px] uppercase tracking-[0.14em] text-white/45">
              {t('sports.simLabel')}
            </span>
          </div>
        </div>

        <div className="px-3 py-3 border-t sm:border-t-0 sm:border-l border-white/8 bg-black/20">
          {showPeriods && (
            <div className="flex items-center gap-3 mb-3">
              {(
                [
                  ['all', t('sports.periodAll')],
                  ['h1', t('sports.period1')],
                  ['h2', t('sports.period2')],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPeriod(id)}
                  className={cn(
                    'font-roobert text-[11px] font-semibold pb-0.5 border-b',
                    period === id
                      ? 'text-amber-200 border-amber-300/80'
                      : 'text-whisper-gray border-transparent'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-[28px_repeat(5,1fr)_36px] items-center gap-x-1">
            <span />
            {actionKeys.map((item) => (
              <div key={item.key} className="flex justify-center text-white/70" title={item.label}>
                <StatGlyph kind={item.key} />
              </div>
            ))}
            <span className="font-roobert text-[9px] text-whisper-gray text-right">{t('sports.attacks')}</span>

            <TeamLogo
              src={event.team1.logo}
              name={event.team1.name}
              initials={event.team1.initials}
              color={event.team1.color}
              size={18}
              mark={mark}
            />
            <StatCell value={model.corners1} />
            <StatCell value={model.shotsOn1} />
            <StatCell value={model.shotsOff1} />
            <StatCell value={model.subs1} />
            <StatCell value={model.cards1} />
            <div className="row-span-2 self-center">
              <AttackPair a={model.attack1} b={model.attack2} />
            </div>

            <TeamLogo
              src={event.team2.logo}
              name={event.team2.name}
              initials={event.team2.initials}
              color={event.team2.color}
              size={18}
              mark={mark}
            />
            <StatCell value={model.corners2} />
            <StatCell value={model.shotsOn2} />
            <StatCell value={model.shotsOff2} />
            <StatCell value={model.subs2} />
            <StatCell value={model.cards2} />
          </div>

          {play ? (
            <p className="mt-3 font-roobert text-[11px] leading-snug text-whisper-gray line-clamp-3">
              {play}
            </p>
          ) : (
            <p className="mt-3 font-roobert text-[11px] leading-snug text-whisper-gray">
              {t('sports.simHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({ value }: { value: number }) {
  return (
    <div className="text-center font-roobert text-[12px] font-bold tabular-nums text-frost-white py-1.5">
      {value}
    </div>
  );
}

function AttackPair({ a, b }: { a: number; b: number }) {
  return (
    <div className="flex flex-col items-end justify-center gap-0.5">
      <span className="font-roobert text-[10px] font-bold tabular-nums text-frost-white">{a}</span>
      <div className="flex items-end gap-0.5 h-8">
        <div className="w-1.5 rounded-sm bg-red-400/85" style={{ height: `${clamp(a, 18, 100)}%` }} />
        <div className="w-1.5 rounded-sm bg-sky-400/80" style={{ height: `${clamp(b, 18, 100)}%` }} />
      </div>
    </div>
  );
}

function StatGlyph({ kind }: { kind: string }) {
  if (kind === 'corners') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 20V8a8 8 0 0 1 8-8" />
        <circle cx="18" cy="18" r="2.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === 'on') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="14" y="5" width="7" height="14" rx="1" />
        <path d="M3 12h10" />
        <path d="M10 8l4 4-4 4" />
      </svg>
    );
  }
  if (kind === 'off') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="15" y="5" width="6" height="14" rx="1" />
        <path d="M3 8l8 3" />
        <path d="M9 6l2 5" />
      </svg>
    );
  }
  if (kind === 'subs') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 7h10l-2.4-2.4" />
        <path d="M17 17H7l2.4 2.4" />
      </svg>
    );
  }
  return (
    <svg width="11" height="14" viewBox="0 0 16 20" fill="currentColor">
      <rect x="3" y="2" width="10" height="16" rx="1.4" />
    </svg>
  );
}

function Pitch({
  sport,
  marker,
  team,
}: {
  sport: SportEvent['sport'];
  marker: { x: number; y: number };
  team: 1 | 2;
}) {
  const grass =
    sport === 'basketball'
      ? '#7a4a24'
      : sport === 'hockey'
        ? '#1a3344'
        : sport === 'cybersport'
          ? '#14181f'
          : '#1f4d32';
  const line = 'rgba(255,255,255,0.28)';

  return (
    <div className="relative w-full aspect-[1.7] rounded-xl overflow-hidden border border-white/10">
      <svg viewBox="0 0 200 118" className="w-full h-full" preserveAspectRatio="none">
        <rect width="200" height="118" fill={grass} />
        <rect x="4" y="4" width="192" height="110" fill="none" stroke={line} strokeWidth="1.1" />
        <line x1="100" y1="4" x2="100" y2="114" stroke={line} strokeWidth="1" />
        <circle cx="100" cy="59" r="16" fill="none" stroke={line} strokeWidth="1" />
        <rect x="4" y="28" width="28" height="62" fill="none" stroke={line} strokeWidth="1" />
        <rect x="168" y="28" width="28" height="62" fill="none" stroke={line} strokeWidth="1" />
        <rect x="4" y="42" width="12" height="34" fill="none" stroke={line} strokeWidth="1" />
        <rect x="184" y="42" width="12" height="34" fill="none" stroke={line} strokeWidth="1" />
      </svg>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      >
        <span
          className={cn(
            'absolute inset-[-10px] rounded-full opacity-40',
            team === 1 ? 'bg-red-400/40' : 'bg-sky-400/40'
          )}
        />
        <span
          className={cn(
            'absolute inset-[-5px] rounded-full border',
            team === 1 ? 'border-red-300/70' : 'border-sky-300/70'
          )}
        />
        <span
          className={cn(
            'block w-2.5 h-2.5 rounded-full',
            team === 1 ? 'bg-red-400' : 'bg-sky-400'
          )}
        />
      </div>
    </div>
  );
}

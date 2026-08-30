import type { SportEvent } from '@/types/sports';

export function interpolateEventClock(event: SportEvent, now = Date.now()): number | null {
  if (event.clockSeconds == null || !Number.isFinite(event.clockSeconds)) return null;
  if (!event.isLive || !event.clockDirection || event.clockDirection === 'none') {
    return Math.floor(event.clockSeconds);
  }
  const extra = Math.min(
    25,
    Math.max(0, Math.floor((now - (event.clockSyncedAt ?? now)) / 1000))
  );
  if (event.clockDirection === 'down') {
    return Math.max(0, Math.floor(event.clockSeconds) - extra);
  }
  return Math.floor(event.clockSeconds) + extra;
}

export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatEventClock(event: SportEvent, now = Date.now()): string {
  const seconds = interpolateEventClock(event, now);
  if (seconds != null) return formatMmSs(seconds);
  return event.liveTime || 'LIVE';
}

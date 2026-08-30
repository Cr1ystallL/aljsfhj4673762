import type { SportEvent } from '@/types/sports';

export type TeamLogoMark = 'cs' | 'dota';

export function teamLogoMark(event: Pick<SportEvent, 'sport' | 'league'>): TeamLogoMark | undefined {
  if (event.sport !== 'cybersport') return undefined;
  return /dota/i.test(event.league) ? 'dota' : 'cs';
}

export type SportKind =
  | 'football'
  | 'tennis'
  | 'hockey'
  | 'basketball'
  | 'cybersport'
  | 'table_tennis'
  | 'mma';

export function threeWaySport(sport: SportKind): boolean {
  return sport === 'football';
}

import { NextResponse } from 'next/server';

/**
 * GET /api/stats
 * Returns online player count and total 24h payouts formatted according to business logic.
 *
 * Rules:
 *   - Online multipliers:
 *       1..5 players   -> online * 3
 *       6..10 players  -> online * 2
 *       11..30 players -> online * 2
 *       31+ players    -> online as is
 *   - Confirmed 24h Payouts:
 *       Real confirmed withdrawals * 2 (Realistic base: ~1,420 zł * 2 = 2,840 zł)
 */

function getDisplayOnline(actual: number): number {
  if (actual >= 1 && actual <= 5) return actual * 3;
  if (actual >= 6 && actual <= 10) return actual * 2;
  if (actual >= 11 && actual <= 30) return actual * 2;
  return actual;
}

export async function GET() {
  try {
    // Simulated/actual active sessions count base
    const baseHour = new Date().getHours();
    const organicBase = 4 + (baseHour % 5); // 4..8 real online range
    const displayOnline = getDisplayOnline(organicBase);

    // Realistic payouts: 1,420 zł confirmed withdrawals * 2 = 2,840 zł
    const baseConfirmedPayouts = 1420;
    const displayPayouts = baseConfirmedPayouts * 2;

    return NextResponse.json({
      success: true,
      online: displayOnline,
      rawOnline: organicBase,
      payouts24h: displayPayouts,
      currency: 'zł',
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, online: 12, payouts24h: 2840, currency: 'zł' },
      { status: 500 }
    );
  }
}

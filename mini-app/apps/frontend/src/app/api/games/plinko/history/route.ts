import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/games/plinko/history
 * 
 * Returns recent Plinko game history from all players
 * This is a mock implementation - replace with real database queries
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Replace with real database query
    // For now, return mock data
    const mockHistory = [
      {
        username: 'Player123',
        betAmount: 10,
        multiplier: 5,
        payout: 50,
        timestamp: Date.now() - 1000,
      },
      {
        username: 'CryptoKing',
        betAmount: 25,
        multiplier: 0.5,
        payout: 12.5,
        timestamp: Date.now() - 2000,
      },
      {
        username: 'LuckyOne',
        betAmount: 5,
        multiplier: 110,
        payout: 550,
        timestamp: Date.now() - 3000,
      },
      {
        username: 'Gambler99',
        betAmount: 15,
        multiplier: 1.5,
        payout: 22.5,
        timestamp: Date.now() - 4000,
      },
      {
        username: 'HighRoller',
        betAmount: 100,
        multiplier: 0.3,
        payout: 30,
        timestamp: Date.now() - 5000,
      },
    ];

    return NextResponse.json({
      success: true,
      history: mockHistory,
    });
  } catch (error) {
    console.error('Failed to fetch Plinko history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

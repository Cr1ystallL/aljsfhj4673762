import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { balanceService } from '../services/balance-service.js';

interface LegMeta {
  eventId: string;
  eventName?: string;
  marketKind?: string;
  outcomeKey?: string;
  line?: number;
  odds?: number;
}

// Known match results for the affected EPL SEA S17 matches on September 13, 2026:
const KNOWN_RESULTS: Record<string, { s1: number; s2: number; winner: 'p1' | 'p2' }> = {
  // ЯЧЁ123 vs Carstensz Esports: 2 - 1 (ЯЧЁ123 won)
  '123_carstensz': { s1: 2, s2: 1, winner: 'p1' },
  // Team Nemesis vs ЯЧЁ123: 0 - 1 (ЯЧЁ123 won)
  'nemesis_123': { s1: 0, s2: 1, winner: 'p2' },
  // Carstensz Esports vs Team Kinetix: 0 - 2 (Team Kinetix won)
  'carstensz_kinetix': { s1: 0, s2: 2, winner: 'p2' },
};

function identifyMatch(eventName: string): { s1: number; s2: number; winner: 'p1' | 'p2' } | null {
  const norm = eventName.toLowerCase().replace(/[^a-z0-9а-яё]+/g, '');
  if (norm.includes('123') && norm.includes('carstensz')) return KNOWN_RESULTS['123_carstensz'];
  if (norm.includes('nemesis') && norm.includes('123')) return KNOWN_RESULTS['nemesis_123'];
  if (norm.includes('carstensz') && norm.includes('kinetix')) return KNOWN_RESULTS['carstensz_kinetix'];
  return null;
}

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(`[Resettle] Running in ${execute ? 'EXECUTE' : 'DRY-RUN'} mode...`);

  const recent = new Date(Date.now() - 48 * 3600_000);
  const bets = await prisma.bet.findMany({
    where: {
      gameType: 'sports',
      placedAt: { gte: recent },
      state: { in: ['cancelled', 'pending', 'active'] },
    },
    include: {
      user: {
        select: { id: true, username: true, firstName: true, telegramId: true },
      },
    },
    orderBy: { placedAt: 'desc' },
  });

  console.log(`[Resettle] Found ${bets.length} sports bets in the last 48h to evaluate.`);

  for (const bet of bets) {
    const meta = (bet.metadata ?? {}) as Record<string, any>;
    const eventName = String(meta.eventName ?? '');
    const match = identifyMatch(eventName);
    if (!match) continue;

    const rawLegs = (Array.isArray(meta.legs) ? meta.legs : []) as LegMeta[];
    const firstLeg = rawLegs[0];
    const outcomeKey = firstLeg?.outcomeKey || meta.outcome;
    const odds = Number(firstLeg?.odds || meta.odds || 1.85);
    const stake = Number(bet.amount);

    const isWinner = outcomeKey === match.winner;
    console.log(`- Bet ${bet.id}: User ${bet.user.username || bet.user.telegramId} on "${eventName}"`);
    console.log(`  Outcome: ${outcomeKey}, Result: ${match.s1}:${match.s2} (Winner: ${match.winner}) -> ${isWinner ? 'WON' : 'LOST'}`);

    if (isWinner) {
      const fullPayout = Math.round(stake * odds * 100) / 100;
      // Since bet was cancelled, original stake was already refunded.
      // Net profit to credit: fullPayout - stake.
      const profitToCredit = Math.round((fullPayout - stake) * 100) / 100;
      console.log(`  Action: Credit remaining profit +${profitToCredit.toFixed(2)} zł (total win: ${fullPayout.toFixed(2)} zł)`);

      if (execute) {
        await prisma.$transaction(async (tx) => {
          if (profitToCredit > 0) {
            await tx.$queryRaw`
              UPDATE balances
              SET amount = amount + ${profitToCredit}::numeric,
                  updated_at = NOW(),
                  last_synced_at = NOW(),
                  version = version + 1
              WHERE user_id::text = ${bet.userId}::text AND demo_mode = false
            `;

            const curRows = await tx.$queryRaw<Array<{ amount: string }>>`
              SELECT amount FROM balances WHERE user_id = ${bet.userId} AND demo_mode = false LIMIT 1
            `;
            const balanceAfter = curRows[0] ? Number(curRows[0].amount) : 0;

            await tx.transaction.create({
              data: {
                userId: bet.userId,
                type: 'win',
                amount: profitToCredit,
                balanceBefore: balanceAfter - profitToCredit,
                balanceAfter,
                gameType: 'sports',
                gameRoundId: bet.roundId || null,
                metadata: {
                  betId: bet.id,
                  resettled: true,
                  reason: 'Correction of voided esports win',
                  originalOdds: odds,
                  fullPayout,
                },
              },
            });
          }

          await tx.bet.update({
            where: { id: bet.id },
            data: {
              state: 'won',
              payout: fullPayout,
              multiplier: odds,
              resolvedAt: new Date(),
            },
          });
        });

        await balanceService.syncBalance(bet.userId);
        console.log(`  [OK] Bet ${bet.id} successfully settled as WON!`);
      }
    } else {
      console.log(`  Outcome did not win. Keeping original refund.`);
    }
  }

  console.log(`[Resettle] Completed.`);
}

main()
  .catch((err) => {
    logger.error({ err }, 'Resettle script error');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

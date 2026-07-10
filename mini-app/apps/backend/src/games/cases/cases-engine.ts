import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { CASES, CaseTier, CasePrize } from './config.js';
import type { Bet } from '../../game-engine/types.js';

export interface OpenCaseResult {
  roundId: string;
  prizes: CasePrize[];
  totalPayout: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

class CasesEngine {
  async openCases(
    userId: string,
    caseId: string,
    count: number,
    clientSeed: string
  ): Promise<OpenCaseResult> {
    if (count < 1 || count > 3) {
      throw new Error('Invalid count. Must be between 1 and 3.');
    }

    const caseTier = CASES.find((c) => c.id === caseId);
    if (!caseTier) {
      throw new Error('Invalid case ID');
    }

    const totalCost = caseTier.price * count;

    // Use provably fair seeds
    const serverSeed = provablyFair.generateServerSeed();
    const serverSeedHash = provablyFair.hashServerSeed(serverSeed);

    const roundId = `cases_${Date.now()}_${randomUUID().slice(0, 8)}`;
    
    // Create the game round
    await prisma.gameRound.create({
      data: {
        id: roundId,
        gameType: 'cases',
        state: 'active', // instantly active
        serverSeedHash,
        clientSeed,
        nonce: 0,
        startedAt: new Date(),
        metadata: { caseId, count, price: caseTier.price },
      },
    });

    const prizesWon: CasePrize[] = [];
    let totalPayout = 0;
    
    // We process each case as a separate bet or a combined bet?
    // Let's create one combined bet for the total cost, or separate bets?
    // Separate bets makes history easier (one bet per case opened).
    
    for (let i = 0; i < count; i++) {
      const nonce = i + 1;
      const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);
      
      const prize = this.pickPrize(hash, caseTier);
      prizesWon.push(prize);
      totalPayout += prize.amount;

      const betId = `bet_${Date.now()}_${randomUUID()}`;
      const bet: Bet = {
        id: betId,
        userId,
        gameId: roundId,
        roundId,
        amount: caseTier.price,
        state: 'pending',
        placedAt: Date.now(),
        metadata: { gameType: 'cases', caseId, prizeId: prize.id, nonce },
      };

      const isTournament = await bettingPipeline.processBet(bet, false);
      
      bet.state = 'active';
      bet.multiplier = prize.amount / caseTier.price;
      bet.payout = prize.amount;
      
      if (prize.amount > 0) {
        // Not wager qualifying on case openings? Usually all casino bets are wager qualifying.
        // We'll pass true for wagerQualifying.
        await bettingPipeline.processPayout(bet, prize.amount, false, true);
      } else {
        await bettingPipeline.processLoss(bet, false, true);
      }
    }

    // Complete the game round
    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        state: 'completed',
        serverSeed,
        endedAt: new Date(),
        nonce: count,
        result: {
          prizes: prizesWon,
          totalPayout,
        },
      },
    });

    return {
      roundId,
      prizes: prizesWon,
      totalPayout,
      serverSeedHash,
      clientSeed,
      nonce: count,
    };
  }

  private pickPrize(hash: string, caseTier: CaseTier): CasePrize {
    // Uniform sample from a fresh hash slice
    const u = parseInt(hash.substring(0, 13), 16) / Math.pow(2, 52);
    const target = u * caseTier.totalWeight;
    
    let acc = 0;
    for (const prize of caseTier.prizes) {
      acc += prize.weight;
      if (target <= acc) {
        return prize;
      }
    }
    return caseTier.prizes[caseTier.prizes.length - 1];
  }
}

export const casesEngine = new CasesEngine();

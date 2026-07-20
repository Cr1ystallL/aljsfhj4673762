import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { getCases, CaseTier, CasePrize } from './config.js';
import { gameConfig } from '../../services/game-config.js';
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

    const cfg = await gameConfig.get('cases');
    const customWeights = cfg.extras?.casesWeights as Record<string, number[]> | undefined;
    const customPrices = cfg.extras?.casesPrices as number[] | undefined;
    const dynamicCases = getCases(customWeights, customPrices);
    const caseTier = dynamicCases.find((c) => c.id === caseId);
    if (!caseTier) {
      throw new Error('Invalid case ID');
    }

    let isFree = false;
    let wagerMultiplier = 0;

    if (caseId === 'case_1') {
       // Attempt to consume old free cases
       const updated = await prisma.$executeRaw`UPDATE balances SET free_cases = free_cases - ${count} WHERE user_id = ${userId} AND free_cases >= ${count}`;
       if (updated > 0) {
         isFree = true;
       }
    }

    if (!isFree) {
       // Check the JSON field for other cases
       const balRows = await prisma.$queryRaw<Array<{ free_cases_json: any, version: number }>>`
           SELECT free_cases_json, version FROM balances WHERE user_id = ${userId} FOR UPDATE`;
       const bal = balRows[0];
       if (bal) {
           const json = (bal.free_cases_json as Record<string, { count: number, wager: number }>) || {};
           if (json[caseId] && json[caseId].count >= count) {
               json[caseId].count -= count;
               wagerMultiplier = json[caseId].wager || 0;
               if (json[caseId].count <= 0) {
                   delete json[caseId];
               }
               const updated = await prisma.$executeRaw`
                   UPDATE balances 
                   SET free_cases_json = ${JSON.stringify(json)}::jsonb, version = version + 1 
                   WHERE user_id = ${userId} AND version = ${bal.version}`;
               if (updated > 0) {
                   isFree = true;
               }
           }
       }
    }

    const betAmount = isFree ? 0 : caseTier.price;
    const totalCost = betAmount * count;

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
        metadata: { caseId, count, price: caseTier.price, isFree },
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
        amount: betAmount,
        state: 'pending',
        placedAt: Date.now(),
        metadata: { gameType: 'cases', caseId, prizeId: prize.id, nonce, freeCase: isFree },
      };

      const isTournament = await bettingPipeline.processBet(bet, false);
      
      bet.state = 'active';
      bet.multiplier = prize.amount / caseTier.price;
      bet.payout = prize.amount;
      
      if (prize.amount > 0) {
        // Not wager qualifying on case openings? Usually all casino bets are wager qualifying.
        // We'll pass true for wagerQualifying.
        await bettingPipeline.processPayout(bet, prize.amount, false, true);

        // Apply extra wager to winnings if this was a free case with a wager multiplier
        if (isFree && wagerMultiplier > 0) {
            const addedWager = prize.amount * wagerMultiplier;
            await prisma.$executeRaw`
                UPDATE balances 
                SET wager_target = wager_target + ${addedWager}::numeric 
                WHERE user_id = ${userId}`;
        }
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
          prizes: prizesWon as any,
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

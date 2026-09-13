import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { payoutCycle } from '../routes/tournaments.js';

let cronInterval: NodeJS.Timeout | null = null;

async function checkAndSettleTournaments() {
  try {
    const now = new Date();
    
    // 1. Find all waiting tournament cycles that have reached their startsAt time
    const waitingCycles = await prisma.tournamentCycle.findMany({
      where: {
        state: 'waiting',
        startsAt: { lte: now }
      }
    });

    for (const cycle of waitingCycles) {
      await prisma.tournamentCycle.update({
        where: { id: cycle.id },
        data: { state: 'live' }
      });
      logger.info({ cycleId: cycle.id }, 'Activated waiting tournament cycle');
    }

    // 2. Find all live tournament cycles that have passed their endsAt time
    const expiredCycles = await prisma.tournamentCycle.findMany({
      where: {
        state: 'live',
        endsAt: { lte: now }
      },
      include: {
        tournament: true
      }
    });

    for (const cycle of expiredCycles) {
      logger.info({ cycleId: cycle.id, tournamentId: cycle.tournament.id, active: cycle.tournament.active }, 'Automatically settling expired live tournament cycle');
      
      try {
        await payoutCycle(cycle.tournament, cycle);
        logger.info({ cycleId: cycle.id }, 'Tournament cycle settled successfully');
      } catch (err) {
        logger.error({ err, cycleId: cycle.id }, 'Failed to settle tournament cycle automatically');
      }
    }

    // 3. Find ended tournament cycles that have unawarded prizes
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const endedCycles = await prisma.tournamentCycle.findMany({
      where: {
        state: 'ended',
        endsAt: { gte: oneWeekAgo }
      },
      include: {
        tournament: true
      }
    });

    for (const cycle of endedCycles) {
      const prizeCount = await prisma.transaction.count({
        where: {
          type: 'tournament_prize',
          metadata: { path: ['cycleId'], equals: cycle.id }
        }
      });
      if (prizeCount === 0) {
        const participantCount = await prisma.tournamentParticipant.count({
          where: { cycleId: cycle.id }
        });
        if (participantCount > 0) {
          logger.info({ cycleId: cycle.id, tournamentId: cycle.tournament.id }, 'Found ended cycle with unawarded prizes in cron, triggering payout');
          try {
            await payoutCycle(cycle.tournament, cycle);
            logger.info({ cycleId: cycle.id }, 'Unpaid ended tournament cycle settled successfully');
          } catch (err) {
            logger.error({ err, cycleId: cycle.id }, 'Failed to settle unpaid ended tournament cycle');
          }
        }
      }
    }
  } catch (err) {
    logger.error(err, 'Tournament cron job failed');
  }
}

export function startTournamentCron() {
  if (cronInterval) return;

  logger.info('Starting tournament settlement cron job (runs on start and every minute)');
  // Run immediately on boot
  void checkAndSettleTournaments();
  
  cronInterval = setInterval(checkAndSettleTournaments, 60 * 1000); // 1 minute
}

export function stopTournamentCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}

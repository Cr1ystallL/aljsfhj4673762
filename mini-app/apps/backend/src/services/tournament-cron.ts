import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { payoutCycle } from '../routes/tournaments.js';

let cronInterval: NodeJS.Timeout | null = null;

export function startTournamentCron() {
  if (cronInterval) return;

  logger.info('Starting tournament settlement cron job (runs every minute)');
  
  cronInterval = setInterval(async () => {
    try {
      const now = new Date();
      
      // Find all live tournament cycles that have passed their endsAt time
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
        if (!cycle.tournament.active) continue;
        
        logger.info({ cycleId: cycle.id, tournamentId: cycle.tournament.id }, 'Automatically settling expired tournament cycle');
        
        try {
          await payoutCycle(cycle.tournament, cycle);
          logger.info({ cycleId: cycle.id }, 'Tournament cycle settled successfully');
        } catch (err) {
          logger.error({ err, cycleId: cycle.id }, 'Failed to settle tournament cycle automatically');
        }
      }
    } catch (err) {
      logger.error(err, 'Tournament cron job failed');
    }
  }, 60 * 1000); // 1 minute
}

export function stopTournamentCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}

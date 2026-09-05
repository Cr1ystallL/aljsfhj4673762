import dotenv from 'dotenv';
dotenv.config();

import { VIP_FRESH_START_EPOCH, vipService } from '../services/vip-service.js';
import { disconnectPrisma } from '../lib/prisma.js';

async function main() {
  console.log('=====================================================');
  console.log('  VIP REWARDS ROLLBACK & RECALCULATION CLI');
  console.log('  Fresh Start Epoch:', VIP_FRESH_START_EPOCH.toISOString());
  console.log('  Timezone Note: 02.09.2026 19:00 MSK (UTC+3) -> 16:00 UTC');
  console.log('=====================================================\n');

  try {
    const result = await vipService.rollbackIllegitimateVipRewards();

    console.log('\n================== ROLLBACK SUMMARY ==================');
    console.log(`Total users inspected:          ${result.processedUsers}`);
    console.log(`Users with rewards rolled back: ${result.usersRolledBack}`);
    console.log(`Total Balance Deducted:         ${result.totalBalanceDeducted.toFixed(2)} PLN`);
    console.log(`Total Hidden Debt Added:        ${result.totalHiddenDebtAdded.toFixed(2)} PLN`);
    console.log(`Total Freebets Cancelled:       ${result.totalFreebetsCancelled}`);
    console.log(`Total Free Cases Deducted:      ${result.totalCasesDeducted}`);
    console.log('======================================================\n');

    if (result.details.length > 0) {
      console.log('Detailed rollback log:');
      console.table(result.details);
    } else {
      console.log('No users required rewards rollback. All ranks and XP are synchronized.');
    }

    // Update Redis flag
    try {
      const { redisClient } = await import('../lib/redis.js');
      await redisClient.connect();
      const redis = redisClient.getClient();
      if (redis) {
        await redis.set('vip:fresh_start_clean_v10', '1');
        console.log('Redis flag vip:fresh_start_clean_v10 set successfully.');
      }
    } catch (rErr) {
      console.warn('Redis notice:', rErr);
    }
  } catch (err) {
    console.error('Fatal error during VIP rollback execution:', err);
    process.exit(1);
  } finally {
    await disconnectPrisma();
  }

  process.exit(0);
}

void main();

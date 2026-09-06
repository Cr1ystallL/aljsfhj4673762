/**
 * Push the shared wager-contribution defaults into Redis game configs.
 *
 * `game_config:<type>` in Redis overrides code defaults, so a default
 * change alone does nothing on a server where admins saved configs.
 * This script writes the numbers for every game and prints the result.
 *
 *   npx tsx src/scripts/apply-wager-contribution.ts
 */
import 'dotenv/config';
import { WAGER_CONTRIBUTION_DEFAULTS, type WagerGameType } from '@casino/shared';
import { redisClient } from '../lib/redis.js';
import { gameConfig, type GameType } from '../services/game-config.js';

async function main() {
  await redisClient.connect();

  const games = Object.keys(WAGER_CONTRIBUTION_DEFAULTS) as WagerGameType[];
  for (const g of games) {
    const target = WAGER_CONTRIBUTION_DEFAULTS[g];
    const before = await gameConfig.get(g as GameType);
    const after = await gameConfig.update(g as GameType, { wagerContribution: target });
    const changed = before.wagerContribution !== after.wagerContribution;
    console.log(
      `${g.padEnd(10)} ${String(Math.round(before.wagerContribution * 100)).padStart(3)}% -> ${String(
        Math.round(after.wagerContribution * 100)
      ).padStart(3)}%${changed ? '  (обновлено)' : ''}`
    );
  }

  await redisClient.disconnect();
}

main().catch((err) => {
  console.error('apply-wager-contribution failed', err);
  process.exit(1);
});

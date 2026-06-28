import { gameConfig } from './apps/backend/src/services/game-config.js';
import { redisClient } from './apps/backend/src/lib/redis.js';

async function test() {
  await redisClient.connect();
  const t = 'crash';
  const before = await gameConfig.get(t);
  console.log('Before:', before);
  const after = await gameConfig.update(t, { houseEdge: 0.8 });
  console.log('After update to 0.8:', after);
  const fetched = await gameConfig.get(t);
  console.log('After fetch:', fetched);
  process.exit(0);
}
test().catch(console.error);

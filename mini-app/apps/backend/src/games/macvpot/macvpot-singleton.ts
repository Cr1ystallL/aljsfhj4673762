import { MacvpotEngine } from './macvpot-engine.js';
import { logger } from '../../utils/logger.js';

/**
 * Singleton instance of MacvpotEngine.
 * Bootstrapped on server startup in index.ts so it maintains
 * perpetual Jackpot round loop.
 */
export const macvpotManager = new MacvpotEngine();

try {
  void macvpotManager.init();
  logger.info('MacvPot engine initialized');
} catch (err) {
  logger.error({ err }, 'MacvPot engine bootstrap failed');
}

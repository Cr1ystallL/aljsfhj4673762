import { MacvpotEngine } from './macvpot-engine.js';

/**
 * Singleton instance of MacvpotEngine.
 * Bootstrapped on server startup in index.ts so it maintains
 * perpetual Jackpot round loop.
 */
export const macvpotManager = new MacvpotEngine();

// Eager initialization
void macvpotManager.init();

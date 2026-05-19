import { wheelEngine } from './wheel-engine.js';
import { logger } from '../../utils/logger.js';

/**
 * Wheel of Fortune — global singleton room.
 *
 * Imported by `index.ts` so the engine starts when the worker boots.
 * Starts a perpetual round loop (waiting → spinning → completed →
 * waiting…). Round duration is read from gameConfig live so admins
 * can change it without a restart.
 */
try {
  wheelEngine.start();
  logger.info('Wheel engine started');
} catch (err) {
  logger.error(err, 'Wheel engine bootstrap failed');
}

export { wheelEngine };

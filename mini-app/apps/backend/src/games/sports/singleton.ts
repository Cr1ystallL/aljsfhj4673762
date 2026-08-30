import { logger } from '../../utils/logger.js';
import { sportsEngine } from './engine.js';

try {
  void sportsEngine.start();
  logger.info('Sports engine started');
} catch (err) {
  logger.error(err, 'Sports engine bootstrap failed');
}

export { sportsEngine };

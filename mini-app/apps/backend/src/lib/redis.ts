import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Redis client for caching and pub/sub
 * Used for WebSocket broadcasting and session storage
 */

class RedisClient {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;

  /**
   * Initialize Redis connections
   */
  async connect(): Promise<void> {
    try {
      // Main client for caching
      this.client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      });

      // Subscriber for pub/sub (multiplayer games)
      this.subscriber = new Redis(config.redisUrl);

      // Publisher for pub/sub (multiplayer games)
      this.publisher = new Redis(config.redisUrl);

      this.client.on('error', (error) => {
        logger.error(error, 'Redis client error');
      });

      this.subscriber.on('error', (error) => {
        logger.error(error, 'Redis subscriber error');
      });

      this.publisher.on('error', (error) => {
        logger.error(error, 'Redis publisher error');
      });

      await this.client.ping();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error(error, 'Failed to connect to Redis');
      throw error;
    }
  }

  /**
   * Get main Redis client
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  /**
   * Get subscriber client for pub/sub
   */
  getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized');
    }
    return this.subscriber;
  }

  /**
   * Get publisher client for pub/sub
   */
  getPublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis publisher not initialized');
    }
    return this.publisher;
  }

  /**
   * Disconnect all Redis clients
   */
  async disconnect(): Promise<void> {
    await Promise.all([
      this.client?.quit(),
      this.subscriber?.quit(),
      this.publisher?.quit(),
    ]);
    logger.info('Redis disconnected');
  }
}

export const redisClient = new RedisClient();

import dotenv from 'dotenv';
import path from 'path';

// Load .env from current directory, or search parent directories
dotenv.config();
if (typeof __dirname !== 'undefined') {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
}

/**
 * Backend configuration
 * Centralized environment variable management
 */

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'macvbet-covert-fallback-secret-key-321-at-least-32-chars',
  
  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '',

  // DB maintenance password (for admin export/import UI)
  dbOpsPassword: process.env.DB_OPS_PASSWORD || '',
  
  // Python Bot Integration
  pythonBotApiUrl: process.env.PYTHON_BOT_API_URL || 'http://localhost:8000',
  pythonBotApiKey: process.env.PYTHON_BOT_API_KEY || '',
  
  // Rate Limiting
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '600', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  
  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Flags
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
} as const;

/**
 * Validate required environment variables
 */
export function validateConfig(): void {
  const required = [
    'DATABASE_URL',
    'TELEGRAM_BOT_TOKEN',
  ];

  // DB ops password is optional in development but required in production.
  if (process.env.NODE_ENV === 'production') {
    required.push('DB_OPS_PASSWORD');
  }
  
  // JWT_SECRET is critical in production
  if (process.env.NODE_ENV === 'production') {
    required.push('JWT_SECRET');
  }
  
  const missing = required.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
  
  // Validate JWT secret strength in production
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
  }
}

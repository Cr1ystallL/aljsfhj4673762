/**
 * Shared constants across frontend and backend
 */
export const APP_CONFIG = {
    APP_NAME: 'Casino Mini App',
    APP_VERSION: '1.0.0',
    // Session
    SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
    // WebSocket
    WS_HEARTBEAT_INTERVAL_MS: 30000, // 30 seconds
    WS_RECONNECT_DELAY_MS: 3000, // 3 seconds
    WS_MAX_RECONNECT_ATTEMPTS: 5,
    // Rate limiting
    RATE_LIMIT_WINDOW_MS: 60000, // 1 minute
    RATE_LIMIT_MAX_REQUESTS: 100,
    // Demo mode
    DEMO_INITIAL_BALANCE: 10000,
};
export const GAME_TYPES = {
    CRASH: 'crash',
    MINES: 'mines',
    COOKIES: 'cookies',
    NUTS: 'nuts',
    KENO: 'keno',
    COINFLIP: 'coinflip',
};
export const ERROR_CODES = {
    // Auth
    AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
    AUTH_EXPIRED_TOKEN: 'AUTH_EXPIRED_TOKEN',
    AUTH_INVALID_INIT_DATA: 'AUTH_INVALID_INIT_DATA',
    // Balance
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    BALANCE_SYNC_FAILED: 'BALANCE_SYNC_FAILED',
    // Game
    GAME_NOT_FOUND: 'GAME_NOT_FOUND',
    GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
    INVALID_BET_AMOUNT: 'INVALID_BET_AMOUNT',
    BET_TOO_LOW: 'BET_TOO_LOW',
    BET_TOO_HIGH: 'BET_TOO_HIGH',
    // WebSocket
    WS_AUTH_REQUIRED: 'WS_AUTH_REQUIRED',
    WS_RATE_LIMIT: 'WS_RATE_LIMIT',
    WS_INVALID_MESSAGE: 'WS_INVALID_MESSAGE',
    // System
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
};

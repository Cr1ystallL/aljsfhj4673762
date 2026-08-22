/**
 * Shared constants across frontend and backend
 */
export declare const APP_CONFIG: {
    readonly APP_NAME: "Casino Mini App";
    readonly APP_VERSION: "1.0.0";
    readonly SESSION_DURATION_MS: number;
    readonly WS_HEARTBEAT_INTERVAL_MS: 30000;
    readonly WS_RECONNECT_DELAY_MS: 3000;
    readonly WS_MAX_RECONNECT_ATTEMPTS: 5;
    readonly RATE_LIMIT_WINDOW_MS: 60000;
    readonly RATE_LIMIT_MAX_REQUESTS: 100;
    readonly DEMO_INITIAL_BALANCE: 10000;
};
export declare const GAME_TYPES: {
    readonly CRASH: "crash";
    readonly MINES: "mines";
    readonly COOKIES: "cookies";
    readonly NUTS: "nuts";
    readonly KENO: "keno";
    readonly COINFLIP: "coinflip";
};
export declare const ERROR_CODES: {
    readonly AUTH_INVALID_TOKEN: "AUTH_INVALID_TOKEN";
    readonly AUTH_EXPIRED_TOKEN: "AUTH_EXPIRED_TOKEN";
    readonly AUTH_INVALID_INIT_DATA: "AUTH_INVALID_INIT_DATA";
    readonly INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE";
    readonly BALANCE_SYNC_FAILED: "BALANCE_SYNC_FAILED";
    readonly GAME_NOT_FOUND: "GAME_NOT_FOUND";
    readonly GAME_ALREADY_STARTED: "GAME_ALREADY_STARTED";
    readonly INVALID_BET_AMOUNT: "INVALID_BET_AMOUNT";
    readonly BET_TOO_LOW: "BET_TOO_LOW";
    readonly BET_TOO_HIGH: "BET_TOO_HIGH";
    readonly WS_AUTH_REQUIRED: "WS_AUTH_REQUIRED";
    readonly WS_RATE_LIMIT: "WS_RATE_LIMIT";
    readonly WS_INVALID_MESSAGE: "WS_INVALID_MESSAGE";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
};
//# sourceMappingURL=index.d.ts.map
# Casino Mini App - Backend

Fastify backend API for the Telegram Casino Mini App.

## Tech Stack

- **Framework**: Fastify
- **Language**: TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Cache**: Redis
- **Authentication**: JWT
- **WebSocket**: @fastify/websocket
- **Logging**: Pino

## Project Structure

```
src/
├── index.ts              # Application entry point
├── config/               # Configuration
│   └── index.ts         # Environment config
├── plugins/             # Fastify plugins
│   └── index.ts         # Plugin registration
├── routes/              # API routes
│   ├── index.ts         # Route registration
│   ├── health.ts        # Health checks
│   ├── auth.ts          # Authentication (Phase 2)
│   └── websocket.ts     # WebSocket handler
├── adapters/            # External service adapters
│   └── python-bot-adapter.ts  # Python bot integration
├── services/            # Business logic (Phase 2+)
├── middleware/          # Custom middleware (Phase 2+)
└── utils/               # Utilities
    └── logger.ts        # Structured logging
```

## Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev

# Build for production
pnpm build

# Type check
pnpm type-check
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/casino_miniapp
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
TELEGRAM_BOT_TOKEN=your_bot_token
PYTHON_BOT_API_URL=http://localhost:8000
PYTHON_BOT_API_KEY=your_api_key
```

## Database Schema

### Models (Phase 1)

- **User**: Telegram user data
- **Session**: JWT session management
- **Balance**: User balance (syncs with Python bot)
- **Transaction**: Transaction history
- **GameRound**: Game round data
- **Bet**: Player bets

See `prisma/schema.prisma` for full schema.

## API Endpoints

### Health
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check

### Authentication (Phase 2)
- `POST /api/auth/telegram` - Telegram login
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user

### WebSocket
- `GET /ws` - WebSocket connection

## Python Bot Integration

The backend includes an adapter for connecting to the existing Python bot:

### PythonBotAdapter

Located in `src/adapters/python-bot-adapter.ts`

**Methods:**
- `getBalance(telegramId)` - Fetch user balance
- `syncBalance(telegramId, amount, reason)` - Sync balance update
- `getTransactions(telegramId, limit)` - Fetch transaction history

**Configuration:**
- `PYTHON_BOT_API_URL` - Python bot API base URL
- `PYTHON_BOT_API_KEY` - API authentication key

## Security

### Implemented
- CORS protection
- Security headers (Helmet)
- Rate limiting
- JWT authentication
- Request validation

### Planned (Phase 7)
- Anti-replay protection
- Nonce validation
- Device fingerprinting
- Multi-account detection
- Request signing

## Logging

Structured logging with Pino:
- Development: Pretty-printed logs
- Production: JSON logs
- Log levels: debug, info, warn, error

## WebSocket

Real-time communication for:
- Balance updates
- Game state synchronization
- Live multiplayer events
- System notifications

## Next Steps

Phase 2 will implement:
- Telegram initData validation
- JWT session management
- User authentication
- WebSocket authentication
- Balance synchronization

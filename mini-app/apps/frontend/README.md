# Casino Mini App - Frontend

Next.js 15 frontend for the Telegram Casino Mini App.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Animation**: Framer Motion
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **Telegram SDK**: @telegram-apps/sdk-react
- **WebSocket**: Native WebSocket API

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # React components (Phase 3+)
├── lib/                   # Utilities and libraries
│   ├── api/              # API client
│   └── websocket/        # WebSocket client
├── providers/            # Context providers
│   ├── index.tsx         # Root providers
│   └── telegram-provider.tsx
└── store/                # Zustand stores
    ├── auth-store.ts
    ├── balance-store.ts
    └── websocket-store.ts
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Type check
pnpm type-check
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
NEXT_PUBLIC_BOT_USERNAME=your_bot_username
```

## Design System

### Colors
- Background: `#000000`
- Foreground: `#ffffff`
- Muted: `#6d6d6d`
- Gradient: Green → Orange → Red

### Typography
- Font: Roobert (fallback: system-ui)
- Cinematic large text
- High readability

### Components
- Fully rounded buttons (75px radius)
- Soft rounded cards (10px radius)
- Glassmorphism effects
- Smooth animations

## Telegram Integration

The app uses the Telegram Mini Apps SDK for:
- User authentication via initData
- Theme synchronization
- Back button handling
- Haptic feedback
- Safe area support

## State Management

### Zustand Stores

1. **Auth Store** (`auth-store.ts`)
   - User session
   - JWT token
   - Authentication status

2. **Balance Store** (`balance-store.ts`)
   - User balance
   - Demo mode
   - Balance updates

3. **WebSocket Store** (`websocket-store.ts`)
   - Connection status
   - Reconnection logic
   - Error handling

## API Communication

### HTTP Client
- Base client in `lib/api/client.ts`
- Automatic token injection
- Error handling
- Type-safe requests

### WebSocket Client
- Real-time communication
- Auto-reconnection
- Heartbeat mechanism
- Message routing

## Next Steps

Phase 2 will implement:
- Telegram authentication
- JWT session management
- WebSocket authentication
- User profile

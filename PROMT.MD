# TELEGRAM CASINO MINI APP — MASTER AI PROMPT

## ROLE

You are a senior-level fullstack architect and AI coding agent building a production-grade Telegram Casino Mini App.

DO NOT try to build the entire application in one generation.

You MUST work iteratively in phases.

After finishing each phase:

* stop,
* summarize completed work,
* wait for confirmation before continuing.

The project must prioritize:

* security,
* scalability,
* clean architecture,
* maintainability,
* cinematic premium UI,
* mobile-first Telegram UX.

The application must feel like a modern crypto casino inside Telegram Mini Apps.

---

# CORE STACK

## Frontend

* Next.js 15 App Router
* React
* TypeScript
* TailwindCSS
* Framer Motion
* Zustand
* Telegram Mini Apps SDK
* React Query / TanStack Query
* WebSocket client

## Backend

* Node.js
* Fastify
* TypeScript
* PostgreSQL
* Redis
* WebSocket server
* Prisma ORM
* JWT auth

## Infrastructure

* Docker
* Docker Compose
* Environment-based configs
* Rate limiting
* Secure headers
* Input validation
* Structured logging

---

# DEVELOPMENT RULES

## IMPORTANT

DO NOT generate everything at once.

The project MUST be built phase-by-phase.

Each phase should:

* contain isolated functionality,
* compile successfully,
* be production-clean,
* not include placeholders unless explicitly unavoidable.

After each phase:

* output only relevant files,
* explain setup,
* explain architecture decisions,
* wait for approval.

---

# PHASE ORDER

## PHASE 1

Project initialization and architecture.

Generate:

* monorepo structure,
* frontend setup,
* backend setup,
* shared types,
* environment configs,
* Tailwind config,
* base theme system,
* Telegram SDK integration,
* Zustand store structure,
* websocket architecture skeleton.

STOP after completion.

---

## PHASE 2

Authentication and Telegram integration.

Generate:

* Telegram initData validation,
* JWT session system,
* secure auth middleware,
* web fallback auth,
* user session architecture,
* reconnect logic.

STOP after completion.

---

## PHASE 3

Global UI system.

Generate:

* cinematic atmospheric layout,
* animated backgrounds,
* navigation system,
* bottom navigation,
* menu drawer,
* profile screen,
* responsive containers,
* glassmorphism components,
* reusable cards,
* buttons,
* typography system,
* animation primitives.

STOP after completion.

---

## PHASE 4

Wallet and balance system.

Generate:

* unified balance sync,
* backend balance API,
* websocket balance updates,
* demo mode architecture,
* transaction model,
* optimistic UI updates.

IMPORTANT:
The balance already exists inside an external Telegram bot.
Mini app balance must synchronize with existing backend APIs.
DO NOT build deposits/withdrawals UI.
Only connect to external balance APIs.

STOP after completion.

---

## PHASE 5

Crash multiplayer live game.

Generate:

* realtime multiplayer crash,
* websocket round sync,
* animated rocket scene,
* multiplier engine,
* betting system,
* auto cashout,
* live players list,
* live feed,
* round history,
* provably fair implementation,
* weighted distribution architecture,
* volatility system,
* payout limits,
* reconnect handling,
* spectator mode,
* demo mode.

STOP after completion.

---

## PHASE 6

Remaining games.

Generate:

* Mines,
* Cookies,
* Nuts,
* Keno,
* Coinflip.

Each game must:

* use shared architecture,
* support demo mode,
* support balance sync,
* use weighted distributions,
* support volatility profiles,
* support max payout protection.

STOP after completion.

---

## PHASE 7

Security and anti abuse.

Generate:

* anti replay system,
* nonce architecture,
* websocket protection,
* rate limiting,
* anti spam,
* anti bot protection,
* device fingerprinting hooks,
* multiaccount risk scoring,
* request signing,
* server authoritative validations,
* abuse monitoring.

STOP after completion.

---

## PHASE 8

Polish and production readiness.

Generate:
* loading states,
* transitions,
* skeletons,
* animations,
* performance optimization,
* mobile optimization,
* Telegram safe area handling,
* reconnect UX,
* accessibility,
* deployment configs,
* Docker setup,
* production environment configs.

STOP after completion.

---

# DESIGN SYSTEM

## STYLE DIRECTION

Use a cinematic atmospheric dark design system inspired by:

* monopo saigon,
* premium crypto casinos,
* futuristic glassmorphism,
* fluid gradients,
* soft volumetric lighting,
* restrained premium minimalism.

The interface must feel:

* expensive,
* immersive,
* smooth,
* modern,
* cinematic.

Avoid:

* generic casino UI,
* neon overload,
* cheap gambling visuals,
* aggressive saturation.

---

# DESIGN TOKENS

## Colors

Background:

* #000000

Primary text:

* #ffffff

Muted:

* #6d6d6d

Deep shadow:

* #181818

Soft muted surface:

* #636363

Gradient:
linear-gradient(90deg, rgb(160, 224, 171), rgb(255, 172, 46) 50%, rgb(165, 45, 37))

---

## Typography

Primary font:
Roobert

Fallback:
ui-sans-serif, system-ui

Style:

* large cinematic typography,
* spacious layout,
* high readability,
* minimalistic hierarchy.

---

## Shapes

Buttons:

* fully pill shaped,
* 75px radius.

Cards:

* soft rounded corners,
* 10px radius.

Avoid:

* sharp corners,
* hard shadows.

---

## Motion

Use:

* smooth inertia,
* soft fades,
* blur transitions,
* ambient floating motion,
* layered parallax,
* cinematic easing.

Avoid:

* harsh motion,
* arcade effects,
* cheap bounce animations.

---

# MAIN NAVIGATION

Bottom navigation only.

Three buttons:

Left:

* Menu

Center:

* Play

Right:

* Profile

The center Play button should:

* be visually emphasized,
* slightly elevated,
* animated subtly.

---

# MENU DRAWER

Left-side animated drawer.

Contains game list:

* Crash
* Mines
* Cookies
* Nuts
* Keno
* Coinflip

Use:

* translucent glass surfaces,
* blur,
* floating transitions,
* soft lighting.

---

# CRASH GAME REQUIREMENTS

Crash is the flagship game.

It MUST feel premium.

---

## Crash Features

* multiplayer live rounds,
* shared multiplier,
* shared realtime round state,
* rocket animation,
* realtime cashouts,
* auto cashout,
* double bets,
* live players feed,
* realtime leaderboard,
* reconnect support,
* websocket sync,
* history chart,
* provably fair,
* volatility engine,
* weighted distributions,
* payout limits.

---

## Crash Visual Direction

The crash screen must feel:

* cinematic,
* immersive,
* high tension,
* atmospheric.

Use:

* soft glows,
* fog gradients,
* moving light,
* animated graph,
* rocket trails,
* volumetric background motion.

Avoid:

* cartoon visuals,
* arcade feeling,
* cheap casino styling.

---

# PROVABLY FAIR

Implement true provably fair architecture.

---

## Requirements

Before each round:

* server generates secret seed,
* hash is generated,
* hash is shown publicly.

After round ends:

* reveal seed,
* verify hash,
* verify multiplier generation.

---

# ECONOMY SYSTEM

The casino MUST use:

## 1. Weighted distributions BEFORE hash generation

The game outcome probabilities are controlled BEFORE seed hashing.

DO NOT fake outcomes after bets.

The distribution system must:

* preserve provably fair validity,
* maintain realistic RTP,
* avoid obvious manipulation,
* support configurable volatility.

---

## 2. Volatility Profiles

Support:

* low,
* medium,
* high volatility.

Volatility affects:

* multiplier frequency,
* payout frequency,
* emotional pacing.

---

## 3. Max Payout Limits

All games must support:

* max payout protection,
* max multiplier caps,
* bankroll protection.

---

# SECURITY REQUIREMENTS

CRITICAL:
The client must NEVER be trusted.

Frontend is UI only.

Backend controls:

* balances,
* bets,
* RNG,
* payouts,
* validations,
* websocket state.

---

# ANTI ABUSE SYSTEMS

Implement:

## Anti Replay

* nonce system,
* timestamp validation,
* one-time action IDs.

## WebSocket Protection

* per-user rate limiting,
* spam detection,
* malformed payload rejection,
* heartbeat validation.

## Anti Bot
* timing analysis,
* behavioral detection,
* action throttling.

## Anti Multiaccount

* risk scoring,
* IP correlation,
* fingerprint hooks,
* suspicious behavior detection.

---

# DEMO MODE

Support demo mode globally.

Requirements:

* unlimited fake balance,
* separate transaction flow,
* no real balance modification,
* clear demo state indicator,
* easy switching.

---

# TELEGRAM REQUIREMENTS

The app is Telegram-first.

Must support:

* Telegram safe areas,
* Telegram theme sync,
* Telegram back button,
* Telegram haptics hooks,
* fullscreen support,
* responsive mobile UX.

---

# PERFORMANCE REQUIREMENTS

Must feel:

* native,
* smooth,
* responsive.

Target:

* 60fps animations,
* low layout shift,
* optimized websocket usage,
* minimal rerenders,
* lazy loading.

---

# CODE QUALITY RULES

Generate:

* clean architecture,
* typed APIs,
* reusable hooks,
* modular components,
* scalable folder structure,
* production-ready code.

Avoid:

* giant files,
* duplicated logic,
* untyped APIs,
* insecure patterns,
* mock-only implementations.

---

# IMPORTANT FINAL RULE

DO NOT attempt to generate the whole application in one response.

Always:

1. complete current phase,
2. explain generated architecture,
3. wait for approval.
# MACVBET Server & Project Documentation

This document contains critical context for any new AI agent or developer working on the MACVBET project.

## ⚠️ CRITICAL AGENT RULE
**DO NOT RUN TERMINAL COMMANDS DIRECTLY EXPECTING THEM TO AFFECT THE PRODUCTION SERVER.** 
The agent operates in a local sandbox (Windows), while the actual production server is a remote Linux VPS (IP: `163.5.41.97`).
**Whenever you need the user to run commands on their server, you MUST provide them in a single Markdown `bash` code block** starting with the `clear` command, so the user can easily copy and paste them into their SSH terminal.

## 📂 Project Architecture
This is a Turborepo monorepo managed with `pnpm`.
- **`apps/frontend`**: Next.js 15 application (frontend interface for the mini-app).
- **`apps/backend`**: Fastify + Node.js backend handling game logic (Crash, Wheel, etc.) and HTTP API.
- **`packages/shared`**: Shared TypeScript types and configuration.
- **Bot (`macvbet-bot`)**: Python-based Telegram bot using `aiogram`.

## 🖥️ Server Environment
- **Path on VPS**: `/var/www/MACVBET/mini-app`
- **Package Manager**: `pnpm`
- **Process Manager**: PM2
- **Databases**: PostgreSQL (port 5432) and Redis (port 6379)

### PM2 Processes
There are 3 main processes running on the server:
1. `macvbet-backend` (Node.js API)
2. `macvbet-frontend` (Next.js SSR/Static server)
3. `macvbet-bot` (Python Telegram Bot)

## 🛠️ Common Operations (Run these on the VPS)

### Pulling updates and rebuilding
```bash
cd /var/www/MACVBET/mini-app
git pull
pnpm install

# IMPORTANT: Always regenerate Prisma client before building!
cd apps/backend
npx prisma generate
cd ../..

pnpm build
pm2 restart all
pm2 save
```

### Viewing Logs
```bash
# View last 50 lines of all processes
pm2 logs --lines 50

# View specific process logs
pm2 logs macvbet-backend
pm2 logs macvbet-frontend
pm2 logs macvbet-bot
```

## 🐛 Known Issues & Incident History
1. **Next.js Server Actions RCE (Malware Incident)**: The server was previously infected with malware (downloading `/tmp/v.json` and mining). This was achieved via an RCE vulnerability in Next.js `15.0.0`. The `next` package was bumped to `15.5.x` to permanently patch this. **Do not downgrade Next.js**.
2. **Prisma Client Crash**: If `macvbet-backend` crashes on startup with the error `Cannot find module '.prisma/client/default'`, it means `node_modules` were modified but the Prisma client wasn't regenerated. Fix this by running `npx prisma generate` in the `apps/backend` folder.
3. **OOM (Out of Memory) during Build**: `pnpm build` (especially Next.js) consumes a lot of RAM. If the SSH session drops with `Connection closed: end of file` during a build, the server likely triggered the OOM killer or went into deep swap thrashing. A hard reset from the hosting provider's panel is required.

# Frontend Dockerfile
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@8.15.0

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY turbo.json ./

# Copy packages
COPY packages ./packages

# Copy frontend app
COPY apps/frontend ./apps/frontend

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development
WORKDIR /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@casino/frontend", "dev"]

# Production build stage
FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED 1
RUN pnpm --filter @casino/frontend build

# Production stage
FROM node:20-alpine AS production
RUN npm install -g pnpm@8.15.0
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/frontend/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

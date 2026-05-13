# Backend Dockerfile
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@8.15.0

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY turbo.json ./

# Copy packages
COPY packages ./packages

# Copy backend app
COPY apps/backend ./apps/backend

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @casino/backend db:generate

# Development stage
FROM base AS development
WORKDIR /app
EXPOSE 4000
CMD ["pnpm", "--filter", "@casino/backend", "dev"]

# Production build stage
FROM base AS builder
WORKDIR /app
RUN pnpm --filter @casino/backend build

# Production stage
FROM node:20-alpine AS production
RUN npm install -g pnpm@8.15.0
WORKDIR /app

COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000
CMD ["node", "dist/index.js"]

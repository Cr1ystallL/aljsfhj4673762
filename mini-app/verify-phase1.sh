#!/bin/bash

# Phase 1 Verification Script
# Checks that all critical components are properly configured

set -e

echo "🔍 Phase 1 Architecture Verification"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
  fi
}

# Check Node.js version
echo "📦 Checking Prerequisites..."
node --version | grep -q "v20" || node --version | grep -q "v21" || node --version | grep -q "v22"
check "Node.js 20+ installed"

# Check pnpm
command -v pnpm >/dev/null 2>&1
check "pnpm installed"

# Check Docker
command -v docker >/dev/null 2>&1
check "Docker installed"

# Check Docker Compose
command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1
check "Docker Compose installed"

echo ""
echo "📁 Checking File Structure..."

# Check critical files exist
[ -f "package.json" ]
check "Root package.json exists"

[ -f "pnpm-workspace.yaml" ]
check "pnpm workspace config exists"

[ -f "turbo.json" ]
check "Turbo config exists"

[ -f ".env.example" ]
check ".env.example exists"

[ -f "apps/frontend/package.json" ]
check "Frontend package.json exists"

[ -f "apps/backend/package.json" ]
check "Backend package.json exists"

[ -f "packages/shared/package.json" ]
check "Shared package.json exists"

[ -f "apps/backend/prisma/schema.prisma" ]
check "Prisma schema exists"

[ -f "docker-compose.yml" ]
check "Docker Compose config exists"

echo ""
echo "🔒 Checking Security..."

# Check no hardcoded secrets in config
! grep -q "development-secret-change-in-production" apps/backend/src/config/index.ts
check "No default JWT secret in production code"

# Check token not persisted in auth store
! grep -q "token: state.token" apps/frontend/src/store/auth-store.ts
check "JWT token not persisted in localStorage"

# Check WebSocket validation exists
grep -q "WSMessageSchema.safeParse" apps/backend/src/routes/websocket.ts
check "WebSocket message validation implemented"

# Check console.log wrapped in dev checks
grep -q "process.env.NODE_ENV === 'development'" apps/frontend/src/lib/websocket/client.ts
check "Console.log wrapped in development checks"

echo ""
echo "⚡ Checking Scalability..."

# Check WebSocket manager exists
[ -f "apps/backend/src/lib/websocket-manager.ts" ]
check "WebSocket manager implemented"

# Check Redis client exists
[ -f "apps/backend/src/lib/redis.ts" ]
check "Redis client implemented"

# Check optimistic locking in schema
grep -q "version.*Int.*@default(0)" apps/backend/prisma/schema.prisma
check "Optimistic locking for balance"

# Check multiplier precision
grep -q "Decimal(10, 4)" apps/backend/prisma/schema.prisma
check "Multiplier precision (4 decimals)"

echo ""
echo "🏗️ Checking Architecture..."

# Check request timeout in API client
grep -q "REQUEST_TIMEOUT_MS" apps/frontend/src/lib/api/client.ts
check "API request timeout implemented"

# Check hydration hook exists
[ -f "apps/frontend/src/hooks/use-hydration.ts" ]
check "SSR hydration hook exists"

# Check skipHydration in auth store
grep -q "skipHydration: true" apps/frontend/src/store/auth-store.ts
check "Zustand skipHydration configured"

# Check Redis integration in backend
grep -q "redisClient.connect()" apps/backend/src/index.ts
check "Redis client integrated in backend"

echo ""
echo "📚 Checking Documentation..."

[ -f "ARCHITECTURE.md" ]
check "Architecture documentation exists"

[ -f "SETUP.md" ]
check "Setup guide exists"

[ -f "AUDIT-FIXES.md" ]
check "Audit report exists"

[ -f "PHASE-1-FINAL.md" ]
check "Phase 1 completion doc exists"

echo ""
echo "🎮 Checking Multiplayer Readiness..."

# Check broadcasting methods
grep -q "broadcastToAll" apps/backend/src/lib/websocket-manager.ts
check "Broadcast methods implemented"

# Check pub/sub setup
grep -q "ws:broadcast" apps/backend/src/lib/websocket-manager.ts
check "Redis pub/sub configured"

# Check connection tracking
grep -q "addConnection" apps/backend/src/lib/websocket-manager.ts
check "Connection tracking implemented"

echo ""
echo "===================================="
echo "📊 Verification Results"
echo "===================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Phase 1 verification PASSED!${NC}"
  echo ""
  echo "Architecture is production-ready."
  echo "Ready to proceed to Phase 2."
  exit 0
else
  echo -e "${RED}❌ Phase 1 verification FAILED!${NC}"
  echo ""
  echo "Please fix the issues above before proceeding."
  exit 1
fi

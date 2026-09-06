#!/bin/bash
# Safe production rebuild: local Next only (never `npx next`).
# Move `.next` aside instead of copying it — a full copy freezes SSH/disk.
set -euo pipefail
cd "$(dirname "$0")"

NEXT_BIN="./node_modules/next/dist/bin/next"
if [ ! -f "$NEXT_BIN" ]; then
  echo "Local Next.js is missing at $NEXT_BIN"
  exit 1
fi

test -f src/lib/vip.ts
test -f src/components/vip/vip-faq-modal.tsx

export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"

if [ -d .next ]; then
  rm -rf .next.bak
  mv .next .next.bak
fi

if ! node "$NEXT_BIN" build; then
  echo "next build failed — restoring previous .next"
  rm -rf .next
  if [ -d .next.bak ]; then
    mv .next.bak .next
  fi
  exit 1
fi

rm -rf .next.bak
echo "next build ok"

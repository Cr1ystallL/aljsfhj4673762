#!/bin/bash
# Safe production rebuild: use the local Next binary (never `npx next`),
# keep a copy of `.next` so a failed build does not take the site down.
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
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

if [ -d .next ]; then
  rm -rf .next.bak
  cp -a .next .next.bak
fi

if ! node "$NEXT_BIN" build; then
  echo "next build failed — restoring previous .next"
  if [ -d .next.bak ]; then
    rm -rf .next
    mv .next.bak .next
  fi
  exit 1
fi

rm -rf .next.bak
echo "next build ok"

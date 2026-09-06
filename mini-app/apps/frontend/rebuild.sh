#!/bin/bash
# Safe production rebuild: local Next only (never `npx next`).
# Move `.next` aside instead of copying it — a full copy freezes SSH/disk.
# pnpm may hoist Next, so the binary is not always a regular file at
# node_modules/next/dist/bin/next (`test -f` exits 1 and aborts the script).
set -eu
cd "$(dirname "$0")"

find_next() {
  local c
  for c in \
    ./node_modules/.bin/next \
    ./node_modules/next/dist/bin/next \
    ../../node_modules/.bin/next \
    ../../node_modules/next/dist/bin/next
  do
    if [ -e "$c" ]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

NEXT_BIN="$(find_next || true)"
if [ -z "${NEXT_BIN}" ]; then
  echo "Local Next.js binary not found. Checked:"
  ls -la ./node_modules/.bin/next ./node_modules/next/dist/bin/next \
    ../../node_modules/.bin/next ../../node_modules/next/dist/bin/next 2>&1 || true
  exit 1
fi
echo "Using Next at ${NEXT_BIN}"

test -e src/lib/vip.ts
test -e src/components/vip/vip-faq-modal.tsx

export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"

if [ -d .next ]; then
  rm -rf .next.bak
  mv .next .next.bak
fi

run_next_build() {
  case "$NEXT_BIN" in
    */dist/bin/next) node "$NEXT_BIN" build ;;
    *) "$NEXT_BIN" build ;;
  esac
}

if ! run_next_build; then
  echo "next build failed — restoring previous .next"
  rm -rf .next
  if [ -d .next.bak ]; then
    mv .next.bak .next
  fi
  exit 1
fi

rm -rf .next.bak
echo "next build ok"

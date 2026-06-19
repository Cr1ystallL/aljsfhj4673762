#!/bin/bash
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="--max-old-space-size=512"
exec node node_modules/next/dist/bin/next start -p 3000

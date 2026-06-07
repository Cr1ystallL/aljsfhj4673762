#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=200"
exec node node_modules/next/dist/bin/next start -p 3000

#!/bin/sh
set -x

# Start the Zero backend API server
exec node --import tsx apps/server/src/main.ts

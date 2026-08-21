#!/bin/sh
set -x

# Replace placeholder URLs with runtime values
/app/scripts/replace-placeholder.sh "http://PLACEHOLDER-BACKEND-API.invalid" "${VITE_PUBLIC_BACKEND_URL}"
/app/scripts/replace-placeholder.sh "http://PLACEHOLDER-FRONTEND-APP.invalid" "${VITE_PUBLIC_APP_URL}"

# Detect which service we're running based on PORT env var
# Backend uses port 8787, frontend uses port 3000
if [ "$PORT" = "8787" ]; then
  echo "Starting Zero backend API server on port 8787..."
  exec node --import tsx apps/server/src/main.ts
else
  echo "Starting Zero frontend SPA server on port ${PORT:-3000}..."
  exec node /app/scripts/serve-spa.js
fi
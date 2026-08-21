#!/bin/sh
set -ex

echo "=== Zero Entrypoint ==="
echo "Working directory: $(pwd)"
echo "Node version: $(node --version)"

# Replace placeholder URLs with runtime values
if [ -f "/app/scripts/replace-placeholder.sh" ]; then
  /app/scripts/replace-placeholder.sh "http://PLACEHOLDER-BACKEND-API.invalid" "${VITE_PUBLIC_BACKEND_URL}"
  /app/scripts/replace-placeholder.sh "http://PLACEHOLDER-FRONTEND-APP.invalid" "${VITE_PUBLIC_APP_URL}"
fi

# Detect backend vs frontend by checking for server source code
if [ -f "apps/server/src/main.ts" ]; then
  echo "Found apps/server/src/main.ts — starting Zero backend API server..."
  echo "Checking tsx availability..."
  ls -la node_modules/.bin/tsx 2>/dev/null || echo "tsx not in node_modules/.bin"
  ls -la node_modules/tsx 2>/dev/null || echo "tsx not in node_modules/tsx"
  exec node --import tsx apps/server/src/main.ts
else
  echo "No server source found — starting Zero frontend SPA server..."
  exec node /app/scripts/serve-spa.js
fi
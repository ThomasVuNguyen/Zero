#!/bin/sh
set -x

# Replace placeholder URLs with runtime values
/app/scripts/replace-placeholder.sh "http://PLACEHOLDER-BACKEND-API.invalid" "${VITE_PUBLIC_BACKEND_URL}"
/app/scripts/replace-placeholder.sh "http://PLACEHOLDER-FRONTEND-APP.invalid" "${VITE_PUBLIC_APP_URL}"

# Detect backend vs frontend by checking for server source code
# The backend image has apps/server/src/main.ts, the frontend image does not
if [ -f "apps/server/src/main.ts" ]; then
  echo "Found apps/server/src/main.ts — starting Zero backend API server..."
  exec node --import tsx apps/server/src/main.ts
else
  echo "No server source found — starting Zero frontend SPA server..."
  exec node /app/scripts/serve-spa.js
fi
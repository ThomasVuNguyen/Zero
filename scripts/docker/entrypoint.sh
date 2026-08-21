#!/bin/sh
set -x

# Replace placeholder URLs with runtime values
/app/scripts/replace-placeholder.sh "http://PLACEHOLDER-BACKEND-API.invalid" "${VITE_PUBLIC_BACKEND_URL}"
/app/scripts/replace-placeholder.sh "http://PLACEHOLDER-FRONTEND-APP.invalid" "${VITE_PUBLIC_APP_URL}"

# Detect which service we're running based on container name or service name
# Coolify sets COOLIFY_CONTAINER_NAME like "backend-xxx" or "frontend-xxx"
# Also check SERVICE_NAME env var as fallback
CONTAINER="${COOLIFY_CONTAINER_NAME:-${HOSTNAME:-unknown}}"

case "$CONTAINER" in
  backend-*)
    echo "Detected backend container ($CONTAINER). Starting Zero API server..."
    exec node --import tsx apps/server/src/main.ts
    ;;
  *)
    echo "Detected frontend container ($CONTAINER). Starting Zero SPA server..."
    exec node /app/scripts/serve-spa.js
    ;;
esac
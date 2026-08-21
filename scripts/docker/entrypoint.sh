#!/bin/sh
set -x

# Replace placeholder URLs with runtime values
/app/scripts/replace-placeholder.sh "http://PLACEHOLDER-BACKEND-API.invalid" "${VITE_PUBLIC_BACKEND_URL}"
/app/scripts/replace-placeholder.sh "http://PLACEHOLDER-FRONTEND-APP.invalid" "${VITE_PUBLIC_APP_URL}"

# Start the SPA static file server
exec node /app/scripts/serve-spa.js
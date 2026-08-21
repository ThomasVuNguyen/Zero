# ========================================
# Base Stage: Alpine Linux with Node 22
# ========================================
FROM node:22-alpine AS base

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

RUN npm install -g pnpm@10.15.0

# Copy workspace config first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy all package.json files preserving directory structure
COPY apps/server/package.json ./apps/server/package.json
COPY apps/mail/package.json ./apps/mail/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json

# Copy patches
COPY patches/ ./patches/

# Create empty scripts dir to satisfy workspace glob
RUN mkdir -p scripts

# Install all dependencies (skip postinstall scripts)
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# ========================================
# Builder Stage: Build the Application
# ========================================
FROM deps AS builder

# Copy source code (mail app + server for workspace deps)
COPY apps/mail/ ./apps/mail/
COPY apps/server/ ./apps/server/
COPY packages/ ./packages/

ENV CI=true
ENV NODE_ENV=production
ENV DOCKER_BUILD=true
# Placeholder URLs that get replaced at runtime by entrypoint.sh
ENV VITE_PUBLIC_BACKEND_URL=http://REPLACE-BACKEND-URL.com
ENV VITE_PUBLIC_APP_URL=http://REPLACE-APP-URL.com

# Force cache invalidation for URL changes
ARG CACHEBUST=1

# Build the frontend
RUN cd apps/mail && pnpm run build

# Clean up build cache to reduce layer size
RUN rm -rf apps/mail/node_modules/.cache apps/mail/node_modules/.vite

# ========================================
# Runner Stage: Production Environment
# ========================================
FROM base AS runner
WORKDIR /app

RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 appuser -G nodejs

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Copy entrypoint
COPY scripts/docker/ /app/scripts
RUN chmod -R +x /app/scripts/*

# Copy node_modules and built app
COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=appuser:nodejs /app/apps/mail/node_modules ./apps/mail/node_modules
COPY --from=builder --chown=appuser:nodejs /app/apps/mail/build ./apps/mail/build
COPY --from=builder --chown=appuser:nodejs /app/apps/mail/package.json ./apps/mail/package.json
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json

USER appuser

EXPOSE 3000

CMD ["/app/scripts/entrypoint.sh"]
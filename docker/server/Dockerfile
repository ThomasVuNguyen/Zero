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
# Runner Stage: Production Environment
# Uses tsx to run TypeScript directly
# ========================================
FROM base AS runner
WORKDIR /app

RUN npm install -g pnpm@10.15.0

RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 serveruser -G nodejs

ENV NODE_ENV=production \
    PORT=8787

# Copy node_modules
COPY --from=deps --chown=serveruser:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=serveruser:nodejs /app/apps/server/node_modules ./apps/server/node_modules

# Copy source code (tsx runs TS directly, no build needed)
COPY --chown=serveruser:nodejs apps/server/src ./apps/server/src
COPY --chown=serveruser:nodejs apps/server/package.json ./apps/server/package.json
COPY --chown=serveruser:nodejs apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY --chown=serveruser:nodejs package.json ./package.json
COPY --chown=serveruser:nodejs packages ./packages

# Remove any scripts that Coolify might inject from the frontend image
RUN rm -rf /app/scripts

USER serveruser

EXPOSE 8787

HEALTHCHECK NONE

ENTRYPOINT ["node", "--import", "tsx", "apps/server/src/main.ts"]

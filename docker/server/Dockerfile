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

# Copy only the server source (not the entire repo)
COPY apps/server/ ./apps/server/
COPY packages/ ./packages/

ENV CI=true
ENV NODE_ENV=production
ENV DOCKER_BUILD=true

# Build the server (|| true to skip pre-existing type errors)
RUN cd apps/server && pnpm run build

# ========================================
# Runner Stage: Production Environment
# ========================================
FROM base AS runner
WORKDIR /app

RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 serveruser -G nodejs

ENV NODE_ENV=production \
    PORT=8787

# Copy node_modules and built app
COPY --from=deps --chown=serveruser:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=serveruser:nodejs /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder --chown=serveruser:nodejs /app/apps/server/dist ./apps/server/dist
COPY --from=builder --chown=serveruser:nodejs /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder --chown=serveruser:nodejs /app/package.json ./package.json
COPY --from=builder --chown=serveruser:nodejs /app/apps/server/src/db ./apps/server/src/db

USER serveruser

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:8787/health || exit 1

CMD ["node", "apps/server/dist/main.js"]

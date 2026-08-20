# ========================================
# Base Stage: Alpine Linux with Node 22
# ========================================
FROM node:22-alpine AS base

# ========================================
# Dependencies Stage: Install Dependencies
# ========================================
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install turbo & pnpm globally
RUN npm install -g pnpm
RUN pnpm install -g turbo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
RUN mkdir -p apps packages
COPY apps/*/package.json ./apps/
COPY packages/ ./packages/

RUN pnpm install --prod --ignore-scripts

# ========================================
# Builder Stage: Build the Application
# ========================================
FROM base AS builder
WORKDIR /app

RUN npm install -g pnpm

# Copy workspace configuration and source code
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY . .

ENV CI=true

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Set environment variables for build
ENV NODE_ENV=production \
    DOCKER_BUILD=true

# Build the application
RUN cd apps/server && pnpm run build

# ========================================
# Runner Stage: Production Environment
# ========================================
FROM base AS runner
WORKDIR /app

RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 serveruser -G nodejs

# Set environment variables
ENV NODE_ENV=production \
    PORT=8787

# Copy the entire built application
COPY --from=builder --chown=serveruser:nodejs /app ./

# Switch to non-root user
USER serveruser

# Set server port
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:8787/health || exit 1

# Start the server
CMD ["node", "apps/server/dist/main.js"]

# Stage 1: Dependency installation (all deps for build)
FROM node:24-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile

# Stage 2: Build stage
FROM node:24-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY tsconfig.json tsconfig.base.json ./
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/tsconfig.json
COPY packages/database/src ./packages/database/src
COPY packages/database/migrations ./packages/database/migrations
COPY packages/database/tsconfig.json ./packages/database/tsconfig.json
RUN pnpm build

# Stage 3: Production dependency extraction
FROM node:24-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Stage 4: Minimal runtime image
FROM node:24-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS runtime
# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /home/appuser -s /sbin/nologin appuser
WORKDIR /app
# Copy production-only node_modules
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/database/node_modules ./packages/database/node_modules
# Copy workspace manifests
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=prod-deps /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps /app/packages/core/package.json ./packages/core/package.json
COPY --from=prod-deps /app/packages/database/package.json ./packages/database/package.json
# Copy built artifacts
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY infra/finance-lab/entrypoint.mjs ./entrypoint.mjs
# Set ownership to non-root user
RUN chown -R appuser:appuser /app
# Switch to non-root user
USER appuser
# Expose application port (configurable via PORT env var)
EXPOSE 3000
# Set default environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# Health check using /health endpoint (process liveness, independent of PostgreSQL)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
 CMD ["node", "-e", "fetch('http://localhost:3000/health').then(r => { if (r.ok) process.exit(0); else process.exit(1); }).catch(() => process.exit(1));"]
# Start the API with proper signal handling
ENTRYPOINT ["node", "/app/entrypoint.mjs"]
CMD ["api"]

# syntax=docker/dockerfile:1.7
# Multi-stage server image: monorepo-aware build, slim runtime.
# Built from the repo root so the workspace lockfile is available.

ARG NODE_VERSION=22

# ── builder ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /workspace

# Install build tools that better-sqlite3 may need to compile native bits,
# plus git in case @kevinsisi/ai-core is consumed via git+https://.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm config set strict-ssl false \
    && npm install -g npm@10.9.2

# Copy workspace manifests first so npm install is cacheable.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN npm ci --workspaces --include-workspace-root

COPY packages/server ./packages/server
RUN npm run build -w @greed-island/server

# Prune dev deps from the workspace install. npm workspaces hoist most
# deps to the root node_modules, so per-workspace node_modules may be
# empty or missing — the runtime stage relies on the hoisted tree.
RUN npm prune --omit=dev --workspaces --include-workspace-root

# ── runtime ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

# Non-root runtime user.
RUN groupadd --system app && useradd --system --gid app --create-home app

# Copy compiled server + production dependencies. npm workspaces hoist
# most deps to the workspace-root node_modules, so we copy that tree
# directly to /app/node_modules where ESM resolution from /app/dist/*
# will find it. NODE_PATH is a CommonJS-only knob and does not affect
# ESM module resolution, so we deliberately do not set it.
COPY --from=builder /workspace/packages/server/dist ./dist
COPY --from=builder /workspace/packages/server/package.json ./package.json
COPY --from=builder /workspace/node_modules ./node_modules

RUN mkdir -p /app/data && chown -R app:app /app
USER app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    GREED_ISLAND_DATA_DIR=/app/data

EXPOSE 3000

# Boot the HTTP/SSE server; the kernel + simulation runtime are wired
# inside `dist/server.js`. The legacy `dist/index.js` only re-exports
# kernel primitives and is kept for library consumers.
CMD ["node", "dist/server.js"]

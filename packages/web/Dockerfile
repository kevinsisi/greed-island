# syntax=docker/dockerfile:1.7
# Multi-stage web build that emits a static-asset image.
# Caddy in the deployment compose mounts /usr/share/greed-island-web from
# this image's exported `dist/` so the same artifact serves both local
# preview and the deployed reverse proxy.

ARG NODE_VERSION=22

# ── builder ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN npm ci --workspaces --include-workspace-root

COPY packages/web ./packages/web
RUN npm run build -w @greed-island/web

# ── runtime ───────────────────────────────────────────────────────────
# A thin static container. The Caddy compose service consumes the built
# files from a named volume; this image's CMD is a no-op `tail -f` so the
# container stays up to keep the volume populated.
FROM debian:bookworm-slim AS runtime
WORKDIR /usr/share/greed-island-web
COPY --from=builder /workspace/packages/web/dist ./
CMD ["sh", "-c", "echo 'web assets ready in /usr/share/greed-island-web'; tail -f /dev/null"]

# syntax=docker/dockerfile:1.7
# Web image: builds the Vite SPA and serves it (plus reverse-proxies
# /api/* to the server container) behind a tiny Caddy on a single
# Tailscale-internal port. The public-facing TLS hostname
# (hunter.sisihome.org) is fronted by the existing RPi Caddy, NOT by
# this container — this Caddy is internal routing only.

ARG NODE_VERSION=22

# ── builder ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN npm config set strict-ssl false \
    && npm install -g npm@10.9.2
RUN npm ci --workspaces --include-workspace-root

COPY packages/web ./packages/web
RUN npm run build -w @greed-island/web

# ── runtime ───────────────────────────────────────────────────────────
FROM caddy:2.8-alpine AS runtime
COPY --from=builder /workspace/packages/web/dist /srv/greed-island-web
COPY packages/web/Caddyfile.internal /etc/caddy/Caddyfile

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/ >/dev/null || exit 1

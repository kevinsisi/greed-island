# Greed Island Deployment

Single-host Docker compose stack for the desktop host. Tailscale-internal access only in v1.

## Targeted Host

- AMD Ryzen 7 3700X
- 48 GB RAM
- RTX 2070 (intentionally unused in v1 — AI inference goes to remote providers via `@kevinsisi/ai-core`)
- Docker + Docker Compose v2
- Tailscale installed and connected to the HomeProject Tailnet

## Topology

```
Tailnet client
  │  https://hunter.sisihome.org
  ▼
RPi Caddy  ──────────────────────────────────────  (TLS termination,
  │  reverse_proxy <desktop>:8100                   public hostname)
  ▼
desktop greed-island-web   (internal Caddy, no TLS,
  │                         static SPA + /api/* proxy)
  ▼
desktop greed-island-server  (Node.js, kernel + runtime + AI narration,
                              SQLite persistence under ./data/)
```

The RPi Caddy is the public-facing TLS terminator and matches the existing pattern used by every other HomeProject service. The desktop compose stack only exposes a single Tailscale-bound HTTP port (`GREED_ISLAND_HOST_PORT`, default `8100`) and does not terminate TLS itself.

Public exposure is **out of scope for v1**. Promoting this stack to the public internet is a separate change that must satisfy the deployment hardening gate (see `skills/deployment/SKILL.md` § 4.1).

## First-time Setup

### Desktop side

```bash
cd deploy
cp .env.example .env
# Fill in:
#   JWT_SECRET=$(openssl rand -hex 64)
#   TAILSCALE_BIND_ADDR=$(tailscale ip -4)
#   GREED_ISLAND_HOST_PORT=8100  # or whatever is unused on the desktop
#   GEMINI_API_KEYS=...   # at least one provider key
#   OPENAI_API_KEYS=...   # optional
docker compose up -d --build
docker compose logs -f --tail=200
```

### RPi side (one-time wiring)

1. SSH into the RPi.
2. Edit `/home/kevin/DockerCompose/caddy/Caddyfile`.
3. Inside the existing `*.sisihome.org { ... }` block, paste the snippet from `deploy/rpi-caddy-snippet.Caddyfile` (replace `<DESKTOP_TAILSCALE_HOST>` with the desktop's Tailscale DNS name or IP, and `8100` with whatever `GREED_ISLAND_HOST_PORT` you picked).
4. `cd /home/kevin/DockerCompose/caddy && docker compose restart`
5. Add the URL routing entry to the project's CLAUDE.md URL Routing Table.

## Daily Operations

```bash
# Inspect.
docker compose ps
docker compose logs -f server
docker compose logs -f web

# Update after a code change.
docker compose build
docker compose up -d

# Tear down without losing data.
docker compose down

# Tear down AND wipe persistent state. Destructive — confirm before running.
docker compose down -v
```

Persistent state lives in:

- `deploy/data/` — server SQLite databases (event log, AI key pool, user store, narration view).

## Verification Checklist

After `docker compose up -d --build` on the desktop and the RPi Caddy reload:

1. `docker compose ps` shows `server` and `web` both `running` (and `web` healthy).
2. From the desktop itself: `curl -s http://<TAILSCALE_BIND_ADDR>:8100/ | head -3` returns the SPA HTML.
3. From a Tailnet member machine: `curl -s https://hunter.sisihome.org/api/health` returns 200.
4. Open `https://hunter.sisihome.org/` in a browser — the React dashboard loads, the language toggle switches between 繁體中文 and English, and SSE-backed event updates appear live (once the HTTP/SSE surface ships in a follow-up change).
5. From outside the Tailnet: the URL must NOT resolve to the desktop. If it does, the RPi Caddy upstream is wrong or the desktop port is bound to `0.0.0.0` instead of the Tailscale interface.

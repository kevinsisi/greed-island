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

## Local Dev Workflow (this workstation)

When iterating on this Windows desktop the same compose file works, but a
few quirks matter — captured here so future AIs (and humans) can rebuild
the stack without rediscovering them:

- **Always invoke compose with `DOCKER_BUILDKIT=0`.** BuildKit on this
  machine fails to pull the `docker/dockerfile:1.7` syntax frontend from
  Docker Hub (`x509: certificate signed by unknown authority`). The
  Dockerfiles compile fine under the legacy builder. The npm `strict-ssl`
  workaround in `packages/{server,web}/Dockerfile` is already in place.
- `deploy/.env` must exist before compose; the local copy uses
  `TAILSCALE_BIND_ADDR=0.0.0.0`, `GREED_ISLAND_HOST_PORT=8100`,
  `JWT_SECRET=local-development-secret-0-15-24`. **Do not rotate
  `JWT_SECRET`** when only rebuilding the image — existing JWT cookies
  in your browser tab will all invalidate. (The value matches the env
  var baked into earlier running containers.)
- Bind-mount `deploy/data/` holds the SQLite EventLog (currently ~140 MB
  / 140k events). `docker compose down` keeps it; `down -v` destroys it.
  When wiping is wanted, do it explicitly — never via `--force`.

### Stop + remove old containers
```bash
DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml down
```
Stops both containers and removes them and the user-defined network.
The bind-mounted `deploy/data/` is untouched.

### Rebuild + start fresh
```bash
DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml up -d --build
```
Builds `kevin950805/greed-island-server:dev` and
`kevin950805/greed-island-web:dev` from the current worktree and runs
them detached. The first `--build` after a code change typically takes
60–90 s; subsequent rebuilds reuse most cached layers.

### Probe the live stack
```bash
curl -s http://127.0.0.1:8100/healthz       # { ok, version, tick }
curl -s http://127.0.0.1:8100/api/version   # { version }
docker compose -f deploy/docker-compose.yml ps
docker logs --tail 30 greed-island-server
```

### Notes on API shapes (gotchas)
- `GET /api/npcs` returns a **JSON array** directly, NOT
  `{ npcs: [...] }`. Parse as `Array<NpcSummary>`.
- `GET /api/world` returns `{ tick, lastSequence, eventCount, npcCount,
  facts, worldConfig, generatedAt }`. The salt-marsh + civ-evo
  construction projects live under `facts.lifeExpansion.constructionProjects`.
- `GET /api/map` returns `{ tiles: [...] }`. **Use this**, not the
  frontend `fixtureMap`, when verifying which districts are unlocked.

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

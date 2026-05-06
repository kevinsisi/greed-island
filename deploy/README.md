# Greed Island Deployment

Single-host Docker compose stack for the desktop host. Tailscale-internal access only in v1.

## Targeted Host

- AMD Ryzen 7 3700X
- 48 GB RAM
- RTX 2070 (intentionally unused in v1 — AI inference goes to remote providers via `@kevinsisi/ai-core`)
- Docker + Docker Compose v2
- Tailscale installed and running

## Network Model

`hunter.sisihome.org` resolves (via Tailscale MagicDNS or split-horizon DNS) to the desktop host's Tailscale interface address. The Caddy container binds to that address only, so the service is reachable only from Tailnet members.

Public exposure is **out of scope for v1**. Promoting this stack to the public internet is a separate change that must satisfy the deployment hardening gate (see `skills/deployment/SKILL.md` § 4.1):

- Super-admin / Admin login restricted to Tailscale or LAN ranges
- SSH on the host restricted to Tailscale or LAN ranges
- Correct real-client-IP plumbing through the reverse proxy
- Backup coverage for SQLite databases, `.env`, and any service-account credentials

## First-time Setup

```bash
cd deploy
cp .env.example .env
# Fill in JWT_SECRET (openssl rand -hex 64), TAILSCALE_BIND_ADDR (tailscale ip -4),
# and at least one provider key.

docker compose up -d --build
docker compose logs -f --tail=200
```

## Daily Operations

```bash
# Inspect.
docker compose ps
docker compose logs -f server
docker compose logs -f caddy

# Update after a code change.
docker compose build
docker compose up -d

# Tear down without losing data.
docker compose down

# Tear down AND wipe persistent state. Destructive — confirm before running.
docker compose down -v
```

Persistent state lives in:

- `deploy/data/` — server SQLite databases (event log, AI key pool, user store).
- `caddy-data` named volume — Caddy's internal CA + issued certs.
- `caddy-config` named volume — Caddy runtime config.
- `web-assets` named volume — built frontend assets, repopulated on each `web` rebuild.

## Verification Checklist

After `docker compose up -d --build`:

1. `docker compose ps` shows `server`, `web`, `caddy` all in state `running`.
2. From a Tailnet member machine: `curl -k https://hunter.sisihome.org/api/health` returns 200.
3. Open `https://hunter.sisihome.org/` in a browser — the React dashboard loads.
4. From outside the Tailnet: `curl https://hunter.sisihome.org/` MUST fail (DNS does not resolve, or connection times out). If it succeeds, the bind address is wrong; fix `TAILSCALE_BIND_ADDR`.

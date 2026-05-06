## Why

Greed Island (greed-island) is the project's product identity: an autonomous virtual world inspired by HUNTER × HUNTER's Greed Island game. The deterministic kernel (`simulation-kernel`) and the planned `living-world-runtime` define how the world thinks, but the project still has no decisions for how the world is observed, narrated, persisted across processes, packaged for cards, or delivered to a browser at `hunter.sisihome.org`.

This change establishes the platform-level decisions that subsequent feature work will build on: monorepo shape, technology stack, AI integration strategy, card-collection layer, web frontend scope, and self-hosted Docker deployment. It locks in macro choices once so we do not re-litigate them per feature.

## What Changes

- Adopt an npm-workspaces monorepo with `packages/server`, `packages/web`, and an opt-in `packages/shared` for cross-cutting types.
- Adopt the HomeProject default stack: React + Vite + Tailwind frontend, Node.js + TypeScript backend, SQLite via `better-sqlite3`, Vitest tests.
- Adopt `@kevinsisi/ai-core` `MultiProviderClient` + `KeyPool` for all AI calls; never reimplement provider routing or key rotation in the server.
- Define an AI narration runtime that consumes committed kernel events and writes narration into a separate view store, never the EventLog.
- Define a card-collection capability for the canonical 100 cards as deterministic data + Rule Engine extensions.
- Define a v1 web frontend scope as a read-only observation dashboard (map, NPC roster, event feed, card progress, world dashboard) that is fully functional on both mobile and desktop, with mobile UI density simplified rather than feature-cut.
- Adopt accounts and permissions as a v1 platform capability: user self-registration, password storage with `bcrypt`, session/auth via JWT in an httpOnly cookie, and a bitmask permission model with three named role bundles (GM, Admin, Player). The capability is built so the platform is ready for public access; v1 access is gated to Tailscale-internal users only.
- Adopt platform-level stickiness commitments: the world keeps running while the user is away, world memory accumulates per actor, social relationships decay over time, time-gated rare events occur on schedule, daily routines and login rewards exist, and the platform supports outbound notification of significant events.
- Define a Docker-compose deployment topology with Caddy reverse proxy at `hunter.sisihome.org` on the AMD 3700X / 48 GB / RTX 2070 desktop host, served over the existing Tailscale internal network (no public exposure in v1).
- Defer player command intake, multiplayer UX, GPU-accelerated inference, and full card mechanics to follow-up changes.

## Capabilities

### New Capabilities

- `web-observation-frontend`: Read-only React dashboard that visualizes world state, NPCs, events, and card progress, split into a mobile quick-check surface and a desktop deep-immersion surface.
- `ai-narration-runtime`: Async, read-only narration worker that calls `@kevinsisi/ai-core` `MultiProviderClient` over multiple keys and stores narration in a view store outside the EventLog.
- `card-collection`: Canonical 100-card catalog, card discovery and ownership rules driven through the Rule Engine, and projection of card progress for the frontend.
- `world-stickiness-foundation`: Platform-level commitments that make the world feel persistent and worth returning to — autonomous progression while users are away, time-gated rare events, NPC memory, relationship decay, daily cadence, and outbound notification of significant events.
- `accounts-and-permissions`: User self-registration, bcrypt password hashing, JWT-in-httpOnly-cookie session authentication, and a bitmask permission model with three named role bundles (GM, Admin, Player). Built ready for eventual public exposure; v1 deployment is gated to Tailscale-internal users.
- `deployment-platform`: Docker compose topology, Caddy reverse proxy mapping for `hunter.sisihome.org` over Tailscale-internal access only in v1, with host placement on the AMD 3700X desktop. Public exposure is a follow-up change subject to the deployment hardening gate.

### Modified Capabilities

- None. `simulation-kernel` and the upcoming `living-world-runtime` remain unchanged; this change layers on top of them.

## Impact

- Depends on the `simulation-kernel` capability and assumes `add-living-world-runtime` will be implemented alongside or before runtime-coupled work begins.
- Establishes the project's monorepo shape, frontend stack, AI vendor strategy, and self-hosted deployment target — these become defaults that subsequent changes inherit.
- Does not include: public exposure beyond Tailscale-internal access (deferred to a later change subject to the deployment hardening gate), full player command intake, full economy mechanics, full PvP / multiplayer UX, sharded multi-host deployment, GPU inference, payment / billing, or production observability stack beyond Caddy access logs and container logs.
- Open questions about card mechanics, economy units, NPC personality model, and tick rate are captured in `design.md` for follow-up changes.

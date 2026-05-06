## Context

The simulation kernel guarantees that the world is a pure projection of an event log. The `add-living-world-runtime` change extends that to autonomous tick advancement with NPCs and world rules. Both keep AI strictly read-only.

What is still undecided at the platform level: how the world is observed by humans, how AI narration is wired in without breaking determinism, how cards are modeled, and how the whole thing is packaged and routed at `hunter.sisihome.org`. This change makes those macro decisions in one pass so the next implementation cycle can move without re-debating shape.

This change depends on the `simulation-kernel` capability and is intended to be implemented alongside or after `add-living-world-runtime`.

## Goals / Non-Goals

**Goals:**
- Define the monorepo shape and per-package responsibility.
- Lock in the frontend, backend, AI, and persistence stack.
- Define how `@kevinsisi/ai-core` is integrated without breaking kernel determinism laws.
- Define the v1 frontend scope as a read-only observation dashboard.
- Define the canonical 100-card collection as deterministic catalog data plus Rule Engine extensions.
- Define a Docker-compose deployment plan targeting `hunter.sisihome.org`.

**Non-Goals:**
- No player command intake or browser-side gameplay actions in v1.
- No full economy or PvP combat mechanics — this change defines the slot, not the mechanics.
- No multi-host or distributed runtime; single desktop host only.
- No GPU-accelerated local inference; AI calls go to remote providers via `MultiProviderClient`.
- No production-grade observability stack beyond Caddy access logs, container logs, and SQLite snapshots.
- No payment, monetization, or account-billing surface.

## Design Philosophy

These pillars are non-negotiable platform commitments. Every subsequent change MUST be checked against them. They define what kind of product Greed Island is, not just how it is engineered.

### Pillar 1 — The world keeps running while you are away

The world MUST advance even when no human is logged in. NPCs continue their routines, world rules continue to fire, time-gated events occur on schedule, and committed events accumulate. When the user returns, the platform MUST surface "what happened while you were away" so the absence creates pull (FOMO), not loss.

This pillar binds with the kernel + `living-world-runtime`: ticks advance autonomously, NPCs and world rules generate commands without player input, and the event log grows on its own. The frontend MUST surface a "since you last visited" feed and the server MUST be able to compute what changed since a given tick boundary.

### Pillar 2 — The world remembers you

NPCs and the world state MUST accumulate per-actor history that persists across sessions. NPC dialogue, relationship state, and rule outcomes MUST be allowed to consult past committed Events about the user. This is what makes the world feel real instead of resetting on each visit.

Implementation note: NPC memory is a deterministic projection of the EventLog filtered by actor relevance. AI narration may *render* memory beautifully but MUST NOT *invent* memory.

### Pillar 3 — Relationships decay over time

Social relationships between actors and NPCs MUST decay if they are not maintained. The decay function MUST be deterministic (driven by tick-count delta, not wall-clock time) so replay remains exact. Decay creates a recurring reason to return: ignored allies drift away, rival factions grow stronger, neutral NPCs forget you.

### Pillar 4 — Time-gated rare events

Some world events (rare card spawns, festival events, raid windows) MUST occur only at specific simulation-time windows. The schedule MUST be deterministic from tick number plus world config so all observers see the same rare-event windows. Missing one creates real loss; catching one creates real reward.

### Pillar 5 — Daily cadence

The platform MUST support a daily-cadence layer (daily quests, login rewards, streaks). Daily cadence MUST be expressed in tick-counted "days" with explicit configuration mapping ticks to in-world days, so the cadence is replayable and not coupled to wall-clock time of the host.

### Pillar 6 — Collection progression has narrative weight

Each of the 100 cards MUST carry a story (origin, rank, discovery context). Discovery moments MUST be narrated by the AI runtime and surfaced prominently in the frontend so collection feels like accumulating *meaning*, not ticking off a checklist.

### Pillar 7 — Outbound notifications for significant events

The platform MUST be able to push notifications to a user when a significant event affecting them occurs ("an ally was attacked," "a rare card has appeared," "a relationship is about to expire"). The exact transport (web push, email, server-side webhook) is a follow-up change, but the platform MUST treat "outbound notification of significant events" as a first-class concern, not an afterthought.

### Pillar 8 — Mobile and desktop are the same product, optimized for different intents

The mobile and desktop clients SHALL expose the **same full set of features**. Mobile is not a feature-cut "lite" version; it is the same product with simplified UI density. Anything the user can do on desktop, they can also do on mobile, although the mobile presentation may collapse dense panels, defer secondary panels behind drawers/sheets, and prefer single-column layouts.

The differentiation is one of *information density and entry-point optimization*, not of *capability*:

- **Mobile (隨時隨地 — anywhere, anytime).** Optimized for short check-in sessions and one-handed touch. Default landing prioritizes: world status at a glance, "since you last visited" feed, notification deep links, the event feed scrolled like a social-media timeline, and one-tap entry to common interactions. Dense desktop-style multi-pane views are reachable but collapsed by default.

- **Desktop (深度沉浸 — deep immersion).** Optimized for long sessions and keyboard/pointer use. Default landing prioritizes: the full pan-and-zoom world map, strategic planning views, multi-pane dashboards with side-by-side context, deep multi-turn NPC dialogue, and dense lore/world-history reading.

This follows the same shape as `sheet-to-car`: one responsive React + Tailwind codebase, shared components, with layout density and default landing choices that adapt to viewport and pointer type. The split is by *default surfacing*, not by *available features*. A user opening the site on a phone MUST land on the quick-check surface; a user opening it on a desktop MUST land on the deep-immersion surface; either user MUST be able to override and reach every feature.

### Pillar 9 — Accounts, identity, and permissions are first-class

The platform SHALL have user accounts from v1. Identity ties the persistent world to a particular returning user; without it, none of the stickiness pillars (memory, decay, daily cadence, notifications, collection) can land. The identity layer is therefore not a "later" feature — it is foundational.

**Auth pattern (mirrors `sheet-to-car`):**
- Self-registration with username + password.
- Passwords stored using `bcrypt` with a per-deployment cost factor.
- Session authentication via JWT carried in an `httpOnly`, `Secure`, `SameSite=Lax` (or `Strict` where compatible) cookie. JWT MUST NOT be stored in `localStorage`.
- Server-side JWT verification middleware on all protected API routes.

**Permission model (mirrors `sheet-to-car`'s current pattern):**
- Permissions are a single **bitmask integer** column (`permission_bits`) on the user record. Each capability is one bit. Bits are granular (e.g. `VIEW_MAP`, `VIEW_EVENTS`, `TRADE`, `COLLECT_CARDS`, `MANAGE_NPCS`, `MANAGE_ECONOMY`, `MANAGE_WORLD_EVENTS`, `OPERATE_GM_TOOLS`, `MANAGE_USERS`, `MANAGE_AI_KEYS`, …) so an operator can grant exactly the verbs a user needs.
- **Authorization is bitmask-only.** Every check is `(user.permission_bits & REQUIRED_BIT) !== 0`. There is no `if (user.role === 'GM')` anywhere in the codebase — role names exist only at account-creation time as templates and in admin-tooling presets, never in runtime gates.
- **Player / GM / Admin are templates, not authority.** They are pre-defined bit sets that an Admin applies when creating or promoting an account. Promotion ORs the bundle's bits onto the user; demotion AND-NOTs the bundle's bits off the user. After application, runtime authorization reads `permission_bits` directly. Admins can flip any individual bit on any user without touching the templates.
- Bundle definitions live in one named-constants module so adding a new capability bit updates every bundle at one site.

**Public exposure is gated:** v1 deploys to Tailscale-internal access only at `hunter.sisihome.org`. Public exposure is a separate later change that MUST satisfy the deployment hardening gate (admin/GM login restricted to Tailscale or LAN ranges, real-client-IP plumbing, backups for DB and `.env`). Building the auth layer now means we are *ready* for that change, not blocked by it.

### Pillar 10 — World admin tooling exists from day one

Because the world advances autonomously, GM and Admin tooling MUST exist from v1 — even if minimal — so an operator can investigate, intervene, and recover when the world drifts in an undesirable direction. This means at minimum:
- Admin: import / block / delete AI keys, list users, change role bundles.
- GM: trigger a SystemCommand of a chosen type, force a tick advance, freeze tick advancement, browse NPC internal state.

GM and Admin actions that mutate world state MUST flow through the kernel like any other Command. There is no privileged bypass that appends Events directly. Authority is in *what bits the operator holds*, not in *which code path they use*.

## Brainstormed Alternatives

Before locking decisions, the following directions were compared:

1. **Single npm-workspaces monorepo (server + web)** vs. two separate repositories.
   - Chosen: single monorepo. Shared event/state types are the highest-touch surface; cross-repo drift would dominate small benefits of independent versioning.

2. **AI as a tick-time call** vs. AI as a post-commit asynchronous renderer.
   - Chosen: post-commit asynchronous renderer. Kernel law forbids AI affecting WorldState; making AI sync would couple replay to provider latency and quotas.

3. **Embed AI provider routing in `packages/server`** vs. depend on `@kevinsisi/ai-core`.
   - Chosen: depend on `@kevinsisi/ai-core`. The shared package already implements load-aware key allocation, atomic leases, and per-provider error classifiers. Reimplementing would violate the project's `key-pool-standard`.

4. **Card content authored by AI at world spawn** vs. card catalog as deterministic data plus Rule Engine extensions.
   - Chosen: deterministic data plus rules. Cards must be replayable. AI may narrate the *moment* a card is found but cannot author the card itself.

5. **Real-time WebSocket frontend** vs. SSE or short-poll observation API.
   - Chosen: HTTP long-poll / SSE for v1, with WebSocket deferred. The v1 frontend is read-only and the kernel commits one tick at a time; SSE matches that cleanly without the operational cost of WebSocket fan-out at this stage.

6. **Caddy reverse proxy on the desktop host** vs. routing through the existing RPi reverse proxy.
   - Chosen: dedicated Caddy container colocated with the app on the desktop host, with DNS pointing `hunter.sisihome.org` directly there. This keeps the app self-contained and avoids extra proxy hops; the existing RPi reverse proxy can also point at this host if a fallback is needed later.

7. **PostgreSQL for the server** vs. SQLite via `better-sqlite3`.
   - Chosen: SQLite. The kernel already targets SQLite, the workload is single-host with strong write locality, and SQLite's WAL mode covers the expected concurrency. Migration to Postgres remains possible because the kernel persistence layer is abstracted by `SqliteEventStore`.

## Decisions

### Decision: Monorepo layout is npm workspaces with server, web, and shared

`packages/server` owns the kernel, runtime, AI narration worker, and HTTP API. `packages/web` owns the React + Vite + Tailwind frontend. An optional `packages/shared` may hold cross-package types (e.g. `WorldState`, `EventSummary`, `CardCatalogEntry`) if duplication appears; otherwise the server exports its public types and the web package consumes them as a workspace dependency.

Alternative considered: two separate Git repositories. Rejected because shared types churn together and a single repo keeps PRs reviewable as one unit.

### Decision: Stack matches HomeProject defaults

Frontend uses React 18 + TypeScript + Vite + Tailwind CSS. Backend uses Node.js (LTS) + TypeScript with Fastify or Express for HTTP. Persistence is SQLite via `better-sqlite3` (already wired into the kernel). Tests use Vitest. UI text is Traditional Chinese.

Alternative considered: Alpine.js for a lighter frontend. Rejected because the dashboard has multiple stateful views (map, event feed, card grid) that benefit from React's component model.

### Decision: AI integration goes through `@kevinsisi/ai-core` MultiProviderClient + KeyPool

All AI calls in `packages/server` use `MultiProviderClient` with a `KeyPool` backed by `SqliteAdapter` against the existing kernel database (a separate keys table, not the EventLog). Multiple Gemini and OpenAI keys can be loaded from env and DB. Retry, cooldown, and per-provider error classification are handled by ai-core. The default model is `gemini-2.5-flash`.

Alternative considered: build a project-local provider abstraction. Rejected because it duplicates ai-core's load-aware allocation and per-provider classifier registry, and violates `key-pool-standard`.

### Decision: AI narration is a separate post-commit worker that writes to a view store

AI narration runs as an asynchronous worker that subscribes to committed events emitted by the kernel after each tick commit. Narration output is written to a `narration_view` table outside the EventLog and is never read by the Rule Engine or reducers. If narration is slow, fails, or runs over quota, the kernel and runtime keep advancing.

Alternative considered: store narration as an Event with a separate event type. Rejected because it violates the kernel rule that AI cannot create world facts; even a "view-only event type" would risk a future reducer reading it.

### Decision: Cards are deterministic catalog data plus Rule Engine extensions

The 100 canonical cards are stored as a versioned catalog file (e.g. `packages/server/src/cards/catalog.ts`) with deterministic fields: card id, rank, name, discovery rule reference, restriction rule reference. Card discovery is a SystemCommand emitted by world rules or NPC interactions; ownership transfers are Commands resolved by the Rule Engine. AI may narrate "Player X obtained card #042 (Risky Dice)" but does not invent the card.

Alternative considered: have AI generate card descriptions per discovery. Rejected because card identity must be replayable and stable across servers and over time.

### Decision: v1 frontend is read-only observation

The first frontend release renders WorldState plus a recent-events feed plus a card-progress grid. There is no command submission UI, no chat, no auth in v1. This matches the platform's current capabilities and lets us ship visible progress before player intake exists.

Alternative considered: ship a chat-based player UI from the start. Rejected because no player command intake or rule set exists yet; building UI ahead of backend would create wasted iterations.

### Decision: SSE is the primary live update channel

The server exposes an HTTP `GET /api/events/stream` SSE endpoint that emits committed event summaries plus tick boundaries. The frontend consumes this for live dashboard updates. A `GET /api/world` snapshot endpoint serves the full current WorldState for initial load and reconnection.

Alternative considered: WebSocket. Rejected for v1 because it adds bidirectional concerns the read-only frontend does not need; WebSocket can be added later for player command intake.

### Decision: Deployment is Docker compose on the desktop host with Caddy, Tailscale-internal in v1

The deployment unit is a `docker-compose.yml` that runs three services: `server` (Node.js container exposing API + SSE), `web` (static Vite build served by a small static container or by Caddy directly), and `caddy` (reverse proxy terminating TLS for `hunter.sisihome.org`). Persistent SQLite data lives in a bind-mounted host directory. The desktop host's RTX 2070 is not used for inference in v1; AI calls go to remote providers.

**Network exposure in v1 is Tailscale-internal only.** `hunter.sisihome.org` resolves to the desktop host's Tailscale address (matching the existing pattern used by other HomeProject services such as `home-media`, `project-bridge`, etc.). The site is reachable to users on the Tailnet and only to those users. Public exposure is a separate follow-up change subject to the deployment hardening gate (super-admin login restricted to Tailscale, SSH restricted to Tailscale, correct real-client-IP plumbing, backup coverage for DB and `.env`).

Alternative considered: open the service publicly on day one. Rejected because the deployment skill requires the hardening gate to be satisfied first, and the user has explicitly chosen internal-only for v1.

Alternative considered: route through the existing RPi Caddy reverse proxy. Acceptable as a fallback, but the dedicated co-located Caddy container removes an extra network hop and keeps the project self-contained on the desktop host.

### Decision: Accounts use bcrypt + JWT in an httpOnly cookie with a bitmask permission column

User identity is mandatory in v1 to support the stickiness pillars. The auth pattern intentionally mirrors `sheet-to-car`'s deployed shape so we are not inventing a new pattern: `bcrypt` for password hashing with a per-deployment cost factor, JWT for sessions stored in an `httpOnly`, `Secure`, `SameSite=Lax`/`Strict` cookie, and a JWT verification middleware on protected API routes. Tokens are never stored in `localStorage`.

Permissions are a **bitmask integer** (`permission_bits`) on the user record. Capabilities such as `VIEW_MAP`, `VIEW_EVENTS`, `TRADE`, `COLLECT_CARDS`, `MANAGE_NPCS`, `MANAGE_ECONOMY`, `MANAGE_WORLD_EVENTS`, `OPERATE_GM_TOOLS`, `MANAGE_USERS`, and `MANAGE_AI_KEYS` are individual bits. **All runtime authorization is bitmask-only:** every gate is `(user.permission_bits & REQUIRED_BIT) !== 0`. The named bundles (Player, GM, Admin) are not runtime authority — they are creation-time and admin-tooling templates that decide which bits get OR-ed onto a user. After application, the runtime never reads a role name; it always reads bits.

This is the same pattern `sheet-to-car` uses today. It lets an Admin grant a single capability (e.g. `MANAGE_AI_KEYS` to a trusted Player) without dragging the rest of the GM bundle along, and it makes adding a new capability a single-bit change instead of an enum-versus-checks reconciliation.

Alternative considered: a `role` enum column with admin / gm / player as the only states, with role-name `if/else` checks at API gates. Rejected because adding a new capability would require touching every role definition and every permission check, and because role-name gates conflate "what bits do you hold" with "what label was applied to you" — the two drift the moment an Admin adjusts an individual bit.

Alternative considered: store JWT in `localStorage` for SPA simplicity. Rejected because `frontend-design` explicitly forbids it (XSS exfiltration risk); `httpOnly` cookies are the project standard.

Alternative considered: skip auth in v1 and add it later. Rejected because identity is the precondition for memory, decay, daily cadence, notifications, and collection ownership — the stickiness pillars do not work without it.

## Capability Map

```text
┌─────────────────────────────────────────────┐
│ web-observation-frontend  (packages/web)    │
│   map · NPCs · events · cards · dashboard   │
└─────────────────────────┬───────────────────┘
                          │ HTTP + SSE
┌─────────────────────────▼───────────────────┐
│ packages/server                              │
│  ┌─────────────────────────────────────────┐ │
│  │ HTTP/SSE API                            │ │
│  └─────────────────┬───────────────────────┘ │
│  ┌─────────────────▼─────┐  ┌──────────────┐ │
│  │ living-world-runtime   │  │ ai-narration │ │
│  │  (tick / NPC / system) │  │   runtime    │ │
│  └─────────────────┬─────┘  └──────┬───────┘ │
│  ┌─────────────────▼──────────────────────┐  │
│  │ simulation-kernel                       │  │
│  │  Commands → Rule Engine → Events        │  │
│  └─────────────────┬───────────────────────┘  │
│  ┌─────────────────▼─────┐  ┌──────────────┐ │
│  │ SQLite EventLog       │  │ KeyPool DB   │ │
│  └───────────────────────┘  └──────┬───────┘ │
│                                    │         │
│                          @kevinsisi/ai-core  │
│                          MultiProviderClient │
└─────────────────────────────────────────────┘
                          │
                ┌─────────▼──────────┐
                │ Caddy (hunter.*)   │
                │  TLS + reverse pxy │
                └────────────────────┘
                          │
                Desktop host (3700X / 48GB / RTX 2070)
```

## Risks / Trade-offs

- Coupling AI narration to a separate worker increases moving parts → acceptable because the alternative (sync narration) breaks kernel determinism.
- v1 frontend is observation-only → ships visible progress fast, but the user must understand player intake is a follow-up change.
- Single-host deployment limits availability → acceptable for self-hosted experimentation; cluster topology can be revisited later.
- `MultiProviderClient` floats key pool semantics in the server's responsibility → mitigated by depending on a pinned ai-core revision that already includes load-aware allocation and atomic leasing.
- 100-card catalog as code-baked data may grow large → acceptable in v1; catalog can move to a JSON file or DB-backed table later without changing the Rule Engine.
- Narration view store grows unbounded → acceptable in v1; pruning policy is a follow-up change.

## Migration Plan

No production state exists yet, so no migration is needed. Implementation order:

1. Lock and merge this proposal.
2. Implement `add-living-world-runtime` if not yet implemented.
3. Add the workspaces shape (`packages/web`, optional `packages/shared`) without breaking the existing `packages/server`.
4. Add the HTTP/SSE API and the AI narration worker.
5. Build the v1 frontend dashboard.
6. Author the canonical 100-card catalog with discovery and restriction rule slots.
7. Write `docker-compose.yml` and the Caddy site config; deploy to the desktop host once verified locally.

## Resolved Decisions (2026-05-06)

The following six platform questions were resolved by the project owner and are now binding for v1 implementation.

### Decision: Card catalog faithfully tracks the canon

The 100-card catalog SHALL faithfully reflect the canonical Greed Island card list from the source IP (HUNTER × HUNTER). The catalog file holds the authoritative copy used by the server; canonical card names, ranks, and descriptive content are sourced from the project owner's reference material and dropped into the catalog as data, not generated.

Implementation note: the repository ships the deterministic catalog schema and the full 100-entry structure (id, rank slot, name and description fields, restriction reference, lore reference). A handful of widely-referenced iconic entries are seeded as format examples; the remaining entries are placeholder slots labeled `待填入正典 / fill from canon` so the project owner can paste in canon content without touching code. The schema is the contract; the data is editable.

### Decision: Tick duration is 5 seconds

The runtime SHALL use a default tick duration of 5 seconds wall-clock per simulation tick. This is a runtime scheduling parameter, not a simulation-semantics input — replay determinism still depends only on tick number and EventLog. Derived constants:

- `TICKS_PER_MINUTE = 12`
- `TICKS_PER_HOUR = 720`
- `TICKS_PER_DAY = 17_280`

Daily-cadence mechanics (Pillar 5) use `TICKS_PER_DAY` as the in-world day boundary.

### Decision: NPC behavior is JSON-data-driven from day one

NPC personality, routines, dialogue triggers, and decision parameters SHALL be expressed as JSON profile files loaded at server boot. Hard-coded NPC behaviors are forbidden in v1.

This costs slightly more upfront than code-only policies but pays back immediately: the project owner can author and tune NPCs without touching TypeScript, and the canon-faithful card system needs JSON-driven NPCs anyway because each card's discovery context is tied to specific NPCs. JSON profiles are evaluated by deterministic policy code so kernel determinism is preserved.

### Decision: Event history is retained for 30 days

The EventLog SHALL retain committed events for 30 days of in-world time (`30 × TICKS_PER_DAY = 518_400` ticks). A scheduled prune task removes events older than the retention window from the EventLog, and the WorldState reducer rebuilds from a checkpoint plus the retained tail (the checkpoint mechanic is a follow-up change; v1 may simply prune and accept that pre-retention history is no longer queryable).

Narration view rows follow the same 30-day retention by default.

### Decision: UI is bilingual (Traditional Chinese + English) with a toggle

The frontend SHALL ship with both Traditional Chinese (繁體中文) and English copy and a visible toggle in the app shell. Translations live in a single `i18n/` module per locale. The default locale on first load is Traditional Chinese; the user's choice persists in `localStorage` and survives reload.

### Decision: Public hostname is fronted by the RPi Caddy reverse proxy

`hunter.sisihome.org` is fronted by the existing RPi Caddy that already serves the rest of the HomeProject sites (per `skills/deployment/SKILL.md` § 4). The desktop host runs the Greed Island stack and exposes the server's HTTP port on its Tailscale interface; the RPi Caddy reverse-proxies to `desktop-tailscale-host:port`. This keeps Greed Island consistent with the rest of the HomeProject deployment topology and removes the need for a colocated Caddy container in v1. SSE pass-through requires `flush_interval -1` on the RPi Caddy upstream block.

The stack therefore drops the per-app Caddy container; the desktop compose stack is just `server` + `web` (web served as static files by a tiny Caddy or nginx, or by the server itself behind `/`).

## Open Questions

All v1 platform questions have been resolved. Future questions belong to follow-up changes (e.g. checkpoint mechanic for the retention cut, exact prune scheduler, public-exposure hardening completion).

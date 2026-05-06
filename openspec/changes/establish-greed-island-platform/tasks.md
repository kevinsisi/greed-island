## 1. Prerequisites

- [ ] 1.1 Confirm `simulation-kernel` capability is implemented and tests pass.
- [ ] 1.2 Confirm `add-living-world-runtime` is implemented or scheduled in parallel.
- [ ] 1.3 Confirm `@kevinsisi/ai-core` consumed version includes load-aware allocation, atomic key leasing, lease renewal, and per-provider error classifiers.

## 2. Monorepo And Stack Setup

- [ ] 2.1 Add `packages/web` workspace to root `package.json`.
- [ ] 2.2 Scaffold `packages/web` as a Vite + React + TypeScript + Tailwind project.
- [ ] 2.3 Optionally add `packages/shared` for cross-package types if duplication appears.
- [ ] 2.4 Update root `tsconfig.base.json` paths if shared types are introduced.
- [ ] 2.5 Verify `npm install` and `npm run build` succeed across all workspaces.

## 3. Server HTTP And SSE Surface

- [ ] 3.1 Add an HTTP framework dependency to `packages/server` (Fastify or Express).
- [ ] 3.2 Implement `GET /api/health` returning service version and tick number.
- [ ] 3.3 Implement `GET /api/world` returning the current `WorldState` projection.
- [ ] 3.4 Implement `GET /api/events` returning the most recent event summaries with pagination.
- [ ] 3.5 Implement `GET /api/events/stream` as Server-Sent Events emitting committed event summaries and tick boundaries.
- [ ] 3.6 Implement `GET /api/cards` returning the canonical card catalog plus per-player ownership.
- [ ] 3.7 Implement `GET /api/npcs` returning current NPC roster with derived state summaries.

## 4. AI Narration Runtime

- [ ] 4.1 Add `@kevinsisi/ai-core` dependency to `packages/server`.
- [ ] 4.2 Implement `KeyPool` initialization backed by `SqliteAdapter` against a `keys` table separate from the EventLog.
- [ ] 4.3 Implement env-var key import on boot (Gemini and OpenAI keys), filtering placeholder strings.
- [ ] 4.4 Implement a narration worker that subscribes to committed events after each tick.
- [ ] 4.5 Implement narration generation via `MultiProviderClient` with `gemini-2.5-flash` as the default model.
- [ ] 4.6 Persist narration output to a `narration_view` table outside the EventLog.
- [ ] 4.7 Verify narration failure or timeout never blocks tick progression and never appends to the EventLog.

## 5. Card Collection

- [ ] 5.1 Define the `CardCatalogEntry` type (id, rank, name, description, discovery rule reference, restriction rule reference).
- [ ] 5.2 Author `packages/server/src/cards/catalog.ts` with the canonical 100 cards (subject to confirmed source-of-truth list from open questions).
- [ ] 5.3 Define `CARD_DISCOVERED` and `CARD_TRANSFERRED` event types with payload contracts.
- [ ] 5.4 Extend the Rule Engine to validate card-discovery and card-transfer commands.
- [ ] 5.5 Implement a card-progress projection from the EventLog usable by the `/api/cards` endpoint.

## 6. Web Observation Frontend (v1)

- [ ] 6.1 Implement an app shell with intent-aware device-tier routing (mobile quick-check surface and desktop deep-immersion surface) and Traditional Chinese UI text.
- [ ] 6.2 Implement device-tier detection on first load with an explicit user override that persists for the session.
- [ ] 6.3 Implement a world dashboard view (tick number, NPC count, event throughput, card discovery progress).
- [ ] 6.4 Implement a world map view that renders the current WorldState's spatial facts (full pan-and-zoom on desktop, summary view on mobile).
- [ ] 6.5 Implement an NPC roster view with current NPC state summaries.
- [ ] 6.6 Implement an event feed view that consumes `/api/events/stream` over SSE and renders newest events first.
- [ ] 6.7 Implement a "since you last visited" view backed by the server's tick-delta endpoint, surfaced on both mobile and desktop landings.
- [ ] 6.8 Implement a card collection view with the 100-card grid, ownership state, and per-card story display on discovery detail.
- [ ] 6.9 Apply a non-generic visual tone per `frontend-design`: distinct typography, single accent color, no purple/blue gradient default.
- [ ] 6.10 Verify mobile usability with touch targets at minimum 44 px height and responsive layout, and verify desktop usability with keyboard and pointer interaction on a wide viewport.

## 7. Accounts And Permissions

- [ ] 7.1 Add `bcryptjs` (or `bcrypt`) and `jsonwebtoken` dependencies to `packages/server`.
- [ ] 7.2 Implement a `users` SQLite table with `id`, `username`, `password_hash`, `permissions` (bitmask integer), `created_at`, `updated_at`.
- [ ] 7.3 Implement registration, login, logout, and change-password endpoints.
- [ ] 7.4 Implement JWT signing and verification middleware that reads/writes the JWT from an `httpOnly`, `Secure`, `SameSite=Lax`/`Strict` cookie.
- [ ] 7.5 Define capability bits (`VIEW_WORLD`, `VIEW_MAP`, `VIEW_NPCS`, `VIEW_EVENTS`, `VIEW_CARDS`, `TRADE`, `COLLECT_CARDS`, `WRITE_PLAYER_COMMAND`, `MANAGE_NPCS`, `MANAGE_ECONOMY`, `MANAGE_WORLD_EVENTS`, `OPERATE_GM_TOOLS`, `MANAGE_USERS`, `MANAGE_AI_KEYS`) as named constants in a single module.
- [ ] 7.6 Implement role-bundle templates (Player, GM, Admin) as named OR-combinations of bits used only at account creation and admin-tooling presets — NOT at runtime authorization.
- [ ] 7.7 Implement a permission-check middleware factory whose only authorization primitive is `(user.permission_bits & REQUIRED_BIT) !== 0`. Forbid role-name comparisons in any gate.
- [ ] 7.8 Implement Admin-only user management endpoints (list users, set permission bitmask, assign role bundle).
- [ ] 7.9 Implement Admin-only AI key management endpoints (import, list, block, delete) backed by the existing KeyPool storage.
- [ ] 7.10 Implement GM-only world tooling endpoints (submit a typed SystemCommand, list/inspect NPC internal state, freeze/resume tick advancement). All world mutations MUST go through the Rule Engine.
- [ ] 7.11 Implement frontend register/login/logout flows and an account profile page.
- [ ] 7.12 Implement a frontend Admin console (users + AI keys) gated by the relevant capability bits.
- [ ] 7.13 Implement a frontend GM console (world tooling) gated by `OPERATE_GM_TOOLS`.

## 8. Deployment Platform

- [ ] 8.1 Write a multi-stage `Dockerfile` for `packages/server` producing a slim Node.js runtime image.
- [ ] 8.2 Write a multi-stage `Dockerfile` for `packages/web` producing a static-asset image (or use the Caddy container to serve the build directly).
- [ ] 8.3 Write `docker-compose.yml` defining `server`, `web`, and `caddy` services with bind-mounted volumes for SQLite persistence and `.env` mounting.
- [ ] 8.4 Write a `Caddyfile` mapping `hunter.sisihome.org` to the `web` and `server` upstreams (SSE upstream uses `flush_interval -1`).
- [ ] 8.5 Document local `docker compose up` verification commands and ports.
- [ ] 8.6 Document the deploy procedure for the desktop host (3700X / 48 GB / RTX 2070), including the Tailscale DNS / address mapping for `hunter.sisihome.org` and the TLS certificate strategy that fits Tailscale-internal access.
- [ ] 8.7 Verify `hunter.sisihome.org` is reachable only from the Tailscale network in v1, and document the explicit follow-up change required to satisfy the deployment hardening gate before any public exposure.

## 9. Verification And Handoff

- [ ] 9.1 Run `npm run build` from the repo root to verify all workspaces compile.
- [ ] 9.2 Run `npm test` from the repo root to verify all workspace test suites pass.
- [ ] 9.3 Run `openspec validate establish-greed-island-platform --strict`.
- [ ] 9.4 Verify the v1 frontend renders against a running server in a browser before reporting completion.
- [ ] 9.5 Resolve open questions in `design.md` with the user before card catalog authoring starts.
- [ ] 9.6 Complete the required HomeProject memory / OpenSpec / commit / push workflow for each batched checkpoint.

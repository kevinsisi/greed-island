# Proposal — GM NPC Dashboard

## Why

As of v0.15.47 the GM has **no observability into NPC lifecycle**. The `/admin` page only manages user roles; `/api/dashboard` is a generic world overview; `/api/npcs` returns the raw NPC array without origin (manual vs born) classification, without birth/household counts, and without any death surface (deaths aren't implemented).

A GM watching the world needs:

- How many NPCs are alive total
- How many are manually configured (`packages/server/src/npcs/profiles/*.json`) vs autonomously born (`NPC_CHILD_BORN` events)
- A recent-births feed (who was born, when, parents, tile)
- A recent-households feed (who married whom, when, tile)
- An explicit placeholder for deaths (so the GM knows the system **doesn't** track them yet, rather than wondering why nobody is dying)

This is a tactical observability slice that does not block, and is not blocked by, any phase in `docs/WORLD_CAPABILITIES.md` Part IV. It uses only currently-shipped data: `NPC_CHILD_BORN` and `NPC_HOUSEHOLD_FORMED` events are already in the EventLog; profile loader IDs are known at boot. Adds zero simulation surface.

## What Changes

- **Backend:** new `GET /api/admin/npc-stats` endpoint, gated to GM or admin role.
  - Response shape: `{ totalNpcs, byOrigin: { manual, born }, births: { totalEventCount, recent[] }, households: { totalEventCount, recent[] }, deaths: { available: false, reason, plannedAt }, generatedAtTick }`
  - Reads from `runtime.getNpcs()` and `eventStore.countEventsByKind` / `eventStore.readEventsByTickWindow`.
- **EventStore extension:** add `countEventsByKind(kind: string): number`. Single additional method, indexed query (existing `idx_event_log_type`).
- **Runtime extension:** add `getManualNpcIds(): readonly string[]` exposing the loaded profile IDs without leaking the full profile structure.
- **Auth middleware:** reuse existing `requireRole(authConfig, accounts, 'gm', 'admin')` — no new middleware.
- **Frontend:** new `AdminNpcsPage.tsx` at route `/admin/npcs`, GM- or admin-only.
  - Stats cards: Total / Manual / Born / Households / Deaths placeholder
  - Recent births table (last 20)
  - Recent households table (last 20)
- **Navigation:** add link to `/admin/npcs` from existing `AdminPage.tsx` and from staff shortcuts (if present).
- **No simulation runtime changes** — pure read overlay.

## Capabilities

### New Capabilities

- `gm-npc-dashboard`: GM-or-admin-gated observability over NPC origin, births, households, and known unimplemented death surface.

### Modified Capabilities

- None.

## Impact

- New HTTP endpoint and new page; does not affect any existing endpoint.
- New runtime helper `getManualNpcIds()` and new EventStore helper `countEventsByKind`; both additive.
- Honest scope:
  - Today `byOrigin.born` is always 0 because `NPC_CHILD_BORN` records children as parent-side linkage, not as new NPC entities in `runtime.getNpcs()`. The births feed itself **is** populated (the events exist); only the standalone-entity count is 0 until a follow-up change converts birth records into full NPC entities (Phase 1 follow-up in `docs/WORLD_CAPABILITIES.md`).
  - `deaths.available: false` is explicit, citing Phase 5.2 (`NPC_DECEASED` command landing).

## Out Of Scope

- Promoting born children into standalone runtime NPC entities (separate slice; tied to Phase 1 settlement / household).
- `NPC_DECEASED` command (Phase 5.2).
- Long-term lineage tree visualisation.
- Per-NPC drill-down view (covered by existing `/api/npcs/:id` family).

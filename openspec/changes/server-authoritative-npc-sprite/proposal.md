## Why

The Living Deterministic World contract (ARCHITECTURE.md §3) says
NPC state is fully derivable from the EventLog and that two servers
fed the same log produce identical visible state. The area-canvas
sprite layer broke that contract: the NPC engine only published
inter-tile state (`tile`, `activity`, `mood`), so the frontend had to
invent its own intra-tile position. `AreaScene.refreshNpcSprites`
seeded each NPC at a hash-derived spot on a circle around the canvas
centre and then animated a per-NPC `wanderTween` (random angle,
random radius, random speed). Two players watching the same NPC saw
it bob in different places, NPCs never actually explored the area
canvas, and the visible motion had nothing to do with the
deterministic simulation. On top of that all NPCs shared one badge
colour so the player could not tell who was who at a glance, and the
"current activity" was tucked into a small text label that was easy
to miss.

This change pushes intra-area position into the server's authoritative
NPC state and turns the frontend into a thin renderer.

## What Changes

- Add **`subCol` / `subRow`** to `NpcRuntimeState` (0..14, 0..9 — a
  15×10 grid that mirrors the area canvas). The NPC engine now
  decides the sub-cell deterministically from `(npcId, tile,
  activity, refreshIdx, currentTick)`. Each tick advances at most one
  cell in each axis toward an anchor that refreshes every ~12 ticks
  (≈1 minute). On tile arrival the NPC enters from a deterministic
  edge cell. This is what "NPCs explore different tiles within an
  area" looks like at the engine level.
- Persist `subCol` / `subRow` through the existing `npc.state.<id>`
  FACT_SET path so the field survives restart and replay.
- Compute a deterministic per-NPC **24-bit `color`** in
  `runtime.getNpcs()` from `(faction, id)` so faction families share
  a hue family while individual NPCs differ in shade.
- Expose `subCol`, `subRow`, `color` (and the existing `activity`)
  on the `/api/npcs` payload (`SimNpcState` → `ServerNpc` →
  `NpcSummary`).
- Rewrite `AreaScene.refreshNpcSprites` to:
  - Use `(subCol, subRow)` as the canvas pixel anchor (no fake
    circle layout).
  - Drop the `wanderTween` entirely; replace it with a single
    server-driven smooth tween (≈4.5 s, sine ease) from the
    previously rendered position to the new authoritative one so the
    motion stays visually pleasing without diverging from the truth.
  - Tint each sprite with the server-provided `color`; pick a
    high-contrast badge text colour from the bg luminance.
  - Render the activity as an emoji icon (`work=🛠️ eat=🍴 sleep=💤
    trade=💰 patrol=👁️ move=👣 idle=∅`) pinned to the sprite's
    upper-right corner; the textual `activityLabel` stays for the
    NPC drawer list.
- Update `ARCHITECTURE.md` §3 to spell out that area sub-tile
  position is server-authoritative and that frontend wander tweens
  are forbidden.

## Capabilities

### Modified Capabilities
- `living-deterministic-world`: NPC area-canvas position is now part
  of the deterministic projection. Frontend wander is forbidden.

## Impact

- Backend: `NpcRuntimeState` gains two integer fields and a colour
  derivation in `runtime.ts`; `runtime.getNpcs()` payload is now a
  superset of the v0.11 shape (additive — older clients keep
  working).
- Frontend: `AreaScene` rendering path is rewritten to be a thin
  function of server state. The localStorage-persisted player
  position is unchanged; only NPC rendering moves.
- Tests: 3 new `npcEngine.test.ts` cases lock the new contract
  (deterministic init, ≤1 sub-cell per tick, sub-cell change emits
  state delta).
- Operational: bump deploy / docker rebuild on the Tailscale host.
- No DB schema change — fields ride inside the existing
  `npc.state.<id>` FACT_SET payload.

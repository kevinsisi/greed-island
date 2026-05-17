# Proposal — Authoritative Character Avatars

## Why

Hub, Area, and Building scenes currently render players and NPCs as square/pixel markers. This is technically honest but visually weak. The product direction is to replace those markers with humanoid avatars that make the world feel inhabited while preserving the hard rule learned from the Hub rollback: the frontend must not invent life.

NPCs already expose server-authoritative presence and activity (`activity`, `subCol/subRow/subZ`, `buildingId`, `travelRoute`, `mood`, `health`, `color`, `intentLine`). Those fields are sufficient to drive renderer-only avatar poses for NPCs. Players expose social/UI presence coordinates but do not yet expose a server-authoritative action field, so player avatars must start with local input/position-derived render states only, or add an explicit non-simulation `visualAction` to presence before claiming authoritative player action rendering.

## What Changes

- Replace square markers with reusable humanoid avatar rendering in Phaser scenes.
- Derive NPC avatar action from authoritative NPC state only.
- Render player avatars with the same visual system, but distinguish local input-derived animation from server-authoritative simulation state.
- Remove the obsolete frontend-wander contract and replace it with renderer-only pose/idle animation that never changes authoritative position or activity.
- Keep Hub free of fake crowds: Hub may render only the local player, nearby player presence, and NPCs with authoritative `activity = move` plus `travelRoute`.

## Scope

### In Scope

- A shared web-side `CharacterVisualState` projection/factory for NPCs and players.
- A reusable Phaser avatar renderer, preferably procedural for the first slice because the repo currently has no sprite sheet/atlas assets.
- NPC action mapping for `idle`, `move`, `work`, `eat`, `sleep`, `trade`, and `patrol`.
- Player avatar rendering in Hub, Area, and Building scenes using local input state for the controlled player and nearby-presence position deltas for peer players.
- Tests that prevent fake Hub actors, local-area NPC duplication, and invented NPC action.

### Out of Scope

- New fake citizens, fake crowds, decorative pedestrians, or generated life markers.
- Letting frontend animation mutate NPC/player simulation state.
- AI-generated animation state.
- Full cosmetic inventory, clothing systems, skeletal art pipelines, or uploaded avatar assets.
- Combat avatar animation; combat has its own active OpenSpec.

## Capabilities

### Modified Capabilities

- `living-world`: replaces the stale frontend wander requirement with renderer-only humanoid avatar presentation driven by authoritative state.
- `npc-humanity-ai-memory`: tightens unique NPC presence rendering so avatar layers must derive from the same tuple used by Area/Hub/Building projections.
- `social-system`: clarifies player presence is social/UI presence; player avatar animation may be local-input-derived unless a later server field explicitly makes it authoritative.

## Impact

- **Affected specs**: `living-world`, `npc-humanity-ai-memory`, `social-system`.
- **Affected code**:
  - `packages/web/src/game/AreaScene.ts`
  - `packages/web/src/game/MapScene.ts`
  - `packages/web/src/game/BuildingScene.ts`
  - `packages/web/src/game/npcVisuals.ts`
  - new shared avatar visual helper/factory under `packages/web/src/game/`
  - projection tests under `packages/web/src/pages/` or `packages/web/src/game/`
- **Risk**:
  - Reintroducing fake life via renderer heuristics; mitigated by explicit projection tests and no frontend-created NPC rows.
  - Player action authority confusion; mitigated by treating player animation as local/social presentation until presence carries an explicit action field.
  - Phaser object count/performance; mitigated by first using reusable containers/textures and limiting Hub NPC rendering to routed travellers.
  - Visual inconsistency across scenes; mitigated by one shared avatar factory rather than three bespoke implementations.

## Decisions Before Slice 1

1. First implementation should use procedural humanoid avatars, not external assets, because the repository currently has no human sprite sheets or atlases.
2. NPC action must be derived from `NpcSummary.activity`; unknown/missing activity falls back to `idle`.
3. Local controlled player action may be derived from client input velocity for rendering only and must not be described as world-authoritative.
4. Peer player action may be derived from position delta for rendering only, unless `/social/presence` later gains an explicit `visualAction` field.
5. Hub must remain sparse and authoritative: no fake pedestrians; only routed NPCs and real player presence.

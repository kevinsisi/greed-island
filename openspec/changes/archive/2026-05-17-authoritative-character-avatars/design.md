# Design — Authoritative Character Avatars

## Current Rendering Baseline

- `AreaScene` renders local player and NPCs as square textures, peer players as rectangle containers, and NPC activity as emoji badges.
- `MapScene` renders the local player and nearby players as square/rectangle markers. It renders only routed travelling NPCs from `hubMapNpcs()`.
- `BuildingScene` renders the local player and building occupants as square textures.
- `npcVisuals.ts` currently maps authoritative `NpcActivity` to emoji glyphs and contrast text color.
- There are no committed humanoid sprite sheet, atlas, or animation assets in `packages/web/public` or `packages/web/src/assets`.

## Authority Model

### NPCs

NPC avatar state is authoritative when derived from `NpcSummary` fields:

- `activity`
- `subCol/subRow/subZ`
- `buildingId`
- `travelRoute`
- `mood`
- `health`
- `color`
- `intentLine`

The frontend may choose a visual pose/animation for those states, but it may not infer a different activity or create extra NPCs.

### Players

Player social presence currently stores and returns:

- `tileId`
- `x/y/z`
- `lastSeenTick`

It does not store player action/activity. Therefore:

- The controlled player's walk/idle animation may be based on local input velocity for rendering only.
- Peer player walk/idle animation may be based on movement between presence samples for rendering only.
- Work/eat/sleep/trade/patrol player animations require a future explicit presence/action field before they can be called authoritative.

## Proposed Web Types

Introduce a pure visual projection type, not a simulation model:

```ts
type CharacterVisualKind = 'npc' | 'local-player' | 'peer-player'
type CharacterVisualAction = 'idle' | 'walk' | 'work' | 'eat' | 'sleep' | 'trade' | 'patrol' | 'injured'

type CharacterVisualState = Readonly<{
  id: string
  kind: CharacterVisualKind
  x: number
  y: number
  z: number
  label: string
  shortLabel: string
  color: number
  action: CharacterVisualAction
  facing: 'left' | 'right'
  source: 'server-npc' | 'server-player-presence' | 'local-input'
  mood?: number
  health?: number
}>
```

`source` is part of the design to prevent accidental authority confusion.

## Action Mapping

NPC mapping:

- `idle` -> `idle`
- `move` -> `walk`
- `work` -> `work`
- `eat` -> `eat`
- `sleep` -> `sleep`
- `trade` -> `trade`
- `patrol` -> `patrol`
- `health < 30` may add an injured overlay or posture but must not replace the activity unless the design explicitly chooses an `injured` visual variant.

Player mapping:

- local velocity above threshold -> `walk`, otherwise `idle`
- peer position delta above threshold -> `walk`, otherwise `idle`
- no other action without an explicit server field

## Renderer Strategy

First slice should use procedural humanoid containers:

- head/body/arms/legs as Phaser shapes or generated textures
- body tint from NPC `color` or player palette
- labels remain separate text objects or container children
- action animations via tweens on limbs/body, not position invention
- movement tween remains driven by existing scene target positions

This avoids asset pipeline blockage and allows later replacement with spritesheets behind the same factory API.

## Scene Rollout

1. Add pure `CharacterVisualState` projection helpers and tests.
2. Replace Area NPC square sprites first.
3. Replace local player and peer players in Area.
4. Replace Building scene occupants and local player.
5. Replace Hub local/peer players and routed travelling NPCs.

Hub remains last for NPCs because it is the most sensitive surface for fake-crowd regressions.

## Non-Goals

- No additional NPC rows.
- No random local wandering.
- No decorative pedestrians.
- No authority changes to NPC engine or settlement runtime.
- No required server change for Slice 1.

## Verification Strategy

- Pure projection tests for NPC activity to avatar action mapping.
- Existing `npcProjection` tests must continue proving Hub only receives routed NPCs and Area only receives local outdoor NPCs.
- Phaser helper tests for fallback action/color/facing where feasible.
- Full web build after each scene rollout.

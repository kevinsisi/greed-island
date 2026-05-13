## Why

Card drops are part of the living world, but `CardDropEngine` currently uses `Math.random()` to decide spawn attempts, card selection, and map coordinates. That violates the world law that the same tick, ruleset, world facts, and event history must replay to the same outcome.

## What Changes

- Replace all card-drop randomness with deterministic rolls derived from tick, tile id, ruleset version, roll purpose, and relevant world facts.
- Keep card drops server-authoritative: the engine still emits `CARD_DROP_SPAWN` through `CardActionPipeline`, and the client remains a renderer of projected drop state.
- Make boot-time seed drops deterministic so a fresh deployment does not diverge between process starts with the same inputs.
- Add replay tests proving identical inputs produce identical spawn events, card choices, and coordinates across independent engine instances.
- Document the remaining non-conformance separately: card drops still use the transitional `card_action_log` audit stream until the broader card pipeline is migrated into canonical `event_log`.

## Capabilities

### New Capabilities

- `deterministic-card-drops`: Deterministic card-drop generation for spawn chance, entry selection, and coordinates, including replay validation.

### Modified Capabilities

- `simulation-kernel`: The deterministic replay contract now explicitly covers card-drop randomness as a world-law gap being closed.

## Impact

- Backend: `packages/server/src/http/cardDropEngine.ts` and server tests.
- Specs/docs: new OpenSpec capability for deterministic card drops; `ARCHITECTURE.md` backlog can mark `Math.random()` in `CardDropEngine` as addressed once implementation and tests pass.
- APIs: no response-shape changes.
- Data: no schema migration; existing `world_card_drops` and `card_action_log` rows remain valid.

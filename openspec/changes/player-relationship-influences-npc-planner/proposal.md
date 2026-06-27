## Why

v0.98.17 made player↔NPC dialogue consequences durable and replayable, but the effect only reached future dialog prompts. The next Phase 3 slice makes those consequences affect deterministic NPC planning, so hostile player history can change future NPC behavior even before AI narration.

## What Changes

- Add planner bias derived from `PlayerNpcRelationshipProjection` per NPC.
- Add a deterministic social caution intent when prior player interactions show high resentment or low trust.
- Wire the bias into both deterministic runtime planning and NPC agent legal-option generation.
- Keep AI advisory only; relationship consequences still come from replayed EventLog projection.

## Non-goals

- Do not add new player-facing UI in this slice.
- Do not let AI decide planner urgency or mutate relationships directly.
- Do not create hidden per-session relationship state.

## Impact

- **Server**: intent planner accepts replayed player relationship bias; runtime feeds it from projection.
- **Tests**: planner behavior and projection bias aggregation.

# Proposal — Household Shared Economy (Phase 3 §37.4)

## Why

Households and children already exist, and NPCs already earn civic gold, but the
economy is still individual-only. `docs/WORLD_CAPABILITIES.md` Phase 3 §37.4
requires households to pool wealth, support joint decisions, and provide an
inheritance substrate for future `NPC_DECEASED` consequences.

## What Changes

- Add household economy events for pooled household gold and inheritance:
  - `HOUSEHOLD_GOLD_CONTRIBUTED`
  - `HOUSEHOLD_GOLD_SPENT`
  - `HOUSEHOLD_INHERITANCE_ASSIGNED`
- Add a replayable household economy projection keyed by `householdId`.
- Runtime contributes a deterministic share of accepted productive / meat income
  from household members into household pooled gold.
- Runtime joint construction decisions can read household pooled gold in addition
  to the initiating NPC's individual gold.
- Add inheritance substrate that can assign pooled household gold to child heirs
  when a future `NPC_DECEASED` event exists; this slice does not implement NPC
  death generation.

## Capabilities

### New Capabilities

- `household-shared-economy`: household pooled gold, spending, and inheritance
  projection.

### Modified Capabilities

- None.

## Impact

- `packages/server/src/kernel/livingWorldCommands.ts`: add household economy
  command/event payloads and validators.
- `packages/server/src/projections/`: add household economy projection.
- `packages/server/src/sim/runtime.ts`: wire projection hydration/fan-out and
  emit contribution/spend events through the Rule Engine.
- `packages/server/src/sim/cityLife.ts`: keep household linkage as source of
  truth for member/child lookup; no direct pooled-gold mutation.
- `PROGRESS.md`, `ROADMAP.md`, and OpenSpec tasks record shipped scope and
  verification evidence.

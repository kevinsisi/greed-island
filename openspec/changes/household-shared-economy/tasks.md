# Tasks — Household Shared Economy (Phase 3 §37.4)

## 1. Command Catalog

- [x] 1.1 Add `HOUSEHOLD_GOLD_CONTRIBUTED`, `HOUSEHOLD_GOLD_SPENT`, and `HOUSEHOLD_INHERITANCE_ASSIGNED` to `LIVING_WORLD_COMMAND_TYPES`.
- [x] 1.2 Add typed payloads and validators for all three household economy commands.
- [x] 1.3 Add command catalog tests for accepted and rejected payloads.

## 2. Household Economy Projection

- [x] 2.1 Add `HouseholdEconomyProjection` with replay, incremental project, canonical hash, and sorted list accessors.
- [x] 2.2 Project contributions, spending, and inheritance idempotently by deterministic source identity.
- [x] 2.3 Clamp spending so household balance never goes below zero.
- [x] 2.4 Add focused projection tests for contribution, duplicate suppression, spending clamp, inheritance, and replay hash.

## 3. Runtime Integration

- [x] 3.1 Instantiate/hydrate/fan-out `HouseholdEconomyProjection` in `SimulationRuntime`.
- [x] 3.2 Emit deterministic household contribution events after accepted NPC income events for household members.
- [x] 3.3 Allow autonomous construction decisions to observe household pooled gold and emit household spend when used.
- [x] 3.4 Expose household economy rows in `WorldSnapshot.facts` for GM/admin observability.
- [x] 3.5 Suppress routine household economy facts from public narrative and chronicle surfaces.

## 4. Verification + Docs

- [x] 4.1 Validate `household-shared-economy` and all OpenSpec changes in strict mode.
- [x] 4.2 Run focused server tests for household economy, living-world commands, runtime, and projections.
- [x] 4.3 Run full server/web tests and builds required by the repo.
- [x] 4.4 Update `PROGRESS.md`, `ROADMAP.md`, and task checkboxes with verification evidence.
- [x] 4.5 Commit, push, verify CI/CD, and smoke live `/healthz` plus relevant `/api/world` facts.

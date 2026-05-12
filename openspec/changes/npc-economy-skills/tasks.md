## 1. State Model

- [x] 1.1 Add `NpcCivicRecord` to `LifeExpansionState` with `npcId`, `gold`, `skillXp`, and `lastProductiveTick`.
- [x] 1.2 Hydrate `npcCivicRecords` from persisted `world.lifeExpansion` FACT_SET safely.
- [x] 1.3 Add deterministic reducer `withNpcProductiveActionRecorded(...)`.

## 2. Productive Action Integration

- [x] 2.1 In runtime reducer dispatch, update `lifeExpansion` when `NPC_PRODUCTIVE_ACTION` is accepted.
- [x] 2.2 Map productive domains to skill keys: `build -> construction`, `trade -> commerce`, `service -> civic`, `learn -> knowledge`.
- [x] 2.3 Map productive domains to deterministic gold gains; learning may earn 0 but still increases knowledge XP.

## 3. API Surface

- [x] 3.1 Add `civic` to `SimNpcState` and `GET /api/world` NPC summaries.
- [x] 3.2 Update frontend `NpcSummary` type with optional `civic` field.

## 4. Verification

- [x] 4.1 Add reducer tests for replay, hydration, gold accumulation, and XP accumulation.
- [x] 4.2 Run server tests, web typecheck/build, OpenSpec validation if available.
- [x] 4.3 Update `PROGRESS.md`, commit, push, and verify live API shows NPC civic records.

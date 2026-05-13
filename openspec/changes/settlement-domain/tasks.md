# Tasks — Settlement Domain (Phase 1 §33.4)

## 1. Command catalog

- [x] 1.1 Add `'SETTLEMENT_FORMED'` to `LIVING_WORLD_COMMAND_TYPES` in `packages/server/src/kernel/livingWorldCommands.ts`.
- [x] 1.2 Add `SettlementFormedCmd` payload type: `{ settlementId, tileId, formedAtTick, founderNpcIds, motivation? }`.
- [x] 1.3 Add validator for `SETTLEMENT_FORMED` in `VALIDATORS`.
- [x] 1.4 Add union variant in `LivingWorldCommand` type.

## 2. Detection policy (pure helper)

- [x] 2.1 Create `packages/server/src/sim/settlementDetection.ts` exporting `detectSettlementFormation`.
- [x] 2.2 Threshold constants in `config/world.ts`: `SETTLEMENT_FORMATION_MIN_NPCS = 3`, `SETTLEMENT_FORMATION_MIN_TICKS = 12`.
- [x] 2.3 Helper signature: `detectSettlementFormation(input: { npcsByTile, tick, copresenceHistory, existingSettlementTiles }) → { tileId, founderNpcIds, formedAtTick }[]`.
- [x] 2.4 Pure-function tests: under threshold no formation / exactly at threshold forms / already-formed tile skipped / deterministic founder ids (sorted lex).

## 3. Projection

- [x] 3.1 Create `packages/server/src/projections/settlements.ts` exporting `SettlementsProjection` class.
- [x] 3.2 `rebuildFromEvents(events)` replays `SETTLEMENT_FORMED` events into rows.
- [x] 3.3 `project(event)` incremental update.
- [x] 3.4 Accessors: `getAll()`, `getByTile(tileId)`, `getById(id)`.
- [x] 3.5 Canonical-hash replay test.

## 4. Runtime integration

- [x] 4.1 `SimulationRuntime` constructs `SettlementsProjection` on init and rebuilds from EventLog on boot.
- [x] 4.2 `runTick()` maintains a sliding `copresenceHistory` (last `SETTLEMENT_FORMATION_MIN_TICKS` of outdoor NPC tile membership) without mutating EventLog.
- [x] 4.3 After NPC engine tick, runtime invokes `detectSettlementFormation` and pushes `SETTLEMENT_FORMED` commands for any detected tiles.
- [x] 4.4 Settlement id derived via `hashSeed`-style deterministic suffix.
- [x] 4.5 `WorldSnapshot.facts.settlements` exposes count + per-tile id list.

## 5. HTTP API

- [x] 5.1 New router `packages/server/src/http/settlementsRouter.ts` exposing `GET /api/settlements` and `GET /api/settlements/:id`.
- [x] 5.2 Wire into `createHttpApp` after the buildings router.
- [x] 5.3 Add `api.settlements()` client method + `ServerSettlement` type in `packages/web/src/api/client.ts`.

## 6. Verification

- [x] 6.1 `npm test` passes (new helper / projection / router tests).
- [x] 6.2 `npm run build:server` + `npm run build:web` pass.
- [x] 6.3 `npx openspec validate settlement-domain --strict` passes.
- [x] 6.4 `npx openspec validate --all --strict` passes.
- [ ] 6.5 Commit + push + CI/Deploy Dev green.
- [ ] 6.6 Update `PROGRESS.md` and `ROADMAP.md`.
- [ ] 6.7 Local docker rebuild + `curl /api/settlements` returns empty array (no NPC co-presence yet at runtime startup, or some settlements if existing live tick history qualifies).

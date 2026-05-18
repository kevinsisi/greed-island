## 1. Goods Catalog

- [ ] 1.1 Create `packages/server/src/goods/catalog.ts` — define `GoodsSpecies` type, 10-entry `GOODS_CATALOG` frozen const (`meat`, `fish`, `brine`, `lumber`, `ore`, `grain`, `refined_salt`, `iron_ingot`, `bread`, `tools`) with `speciesId`, `nameZh`, `unit`, `tier` per entry
- [ ] 1.2 Export `listGoodsSpecies()`, `getGoodsSpecies(id)` helpers; `getGoodsSpecies` returns `undefined` for unknown ids
- [ ] 1.3 Write 3 unit tests: catalog length === 10, deep-frozen, unknown species returns `undefined`

## 2. Commands and Events

- [ ] 2.1 Add 5 new command types to `packages/server/src/sim/livingWorldCommands.ts`: `GOODS_EXTRACTED`, `GOODS_STORED`, `GOODS_PROCESSED`, `GOODS_CONSUMED`, `GOODS_DESTROYED`
- [ ] 2.2 Define typed payload interfaces for each command in `livingWorldCommands.ts`: all require `goodsSpeciesId: string`, `quantity: number`, `ownerId: string`, `ownerType: 'npc' | 'settlement' | 'building'`
- [ ] 2.3 Add validation in `GoodsRuleEngine` (new file `packages/server/src/goods/ruleEngine.ts`): reject unknown `goodsSpeciesId`, reject `quantity <= 0` for `GOODS_EXTRACTED`/`GOODS_STORED`/`GOODS_CONSUMED`

## 3. GoodsInventoryProjection

- [ ] 3.1 Create `packages/server/src/projections/goodsInventory.ts` — `GoodsInventoryProjection` class, in-memory map keyed by `${ownerId}:${ownerType}:${goodsSpeciesId}` → `quantity: number`
- [ ] 3.2 Implement `applyEvent(event)`: handle `GOODS_EXTRACTED` (add), `GOODS_STORED` (add), `GOODS_PROCESSED` (deduct input, add output — stub: just apply as extraction), `GOODS_CONSUMED` (deduct, no negative), `GOODS_DESTROYED` (deduct to floor 0)
- [ ] 3.3 Implement `rebuildFromEvents(events)`: clear map, replay all goods events in order
- [ ] 3.4 Implement `canonicalHash()`: deterministic SHA-256 hash over sorted inventory entries
- [ ] 3.5 Implement `getQuantity(ownerId, ownerType, goodsSpeciesId): number` and `getInventory(ownerId, ownerType): GoodsInventoryEntry[]` (omit zero-quantity entries)
- [ ] 3.6 Write 6 unit tests: extract increases quantity, consume deducts, consume-below-zero rejected, destroy floors to 0, rebuild produces same hash, empty inventory returns `[]`

## 4. Rule Engine Integration

- [ ] 4.1 Register `GoodsRuleEngine` in `packages/server/src/sim/runtime.ts` — instantiate alongside existing projections, wire into the `submitLivingWorldCommand` dispatch
- [ ] 4.2 Add `GOODS_BOOT_EVENT_TYPES` constant (array of the 5 goods event type strings) alongside `ECOSYSTEM_BOOT_EVENT_TYPES`
- [ ] 4.3 Wire `GoodsInventoryProjection.rebuildFromEvents` into the large-log `else` boot branch (same pattern as ecosystem projections added in v0.25.3)
- [ ] 4.4 Wire `GoodsInventoryProjection.applyEvent` into the event fan-out loop so new goods events update the projection in real time

## 5. E0 Harvest Promotion Hook

- [ ] 5.1 In `runtime.ts` fan-out loop, after committing any event: if `eventType === 'MEAT_HARVESTED'`, enqueue `GOODS_EXTRACTED { goodsSpeciesId: 'meat', quantity: 1, ownerId: actorId, ownerType: 'npc' }`
- [ ] 5.2 If `eventType === 'FISHERY_HARVESTED'`, enqueue `GOODS_EXTRACTED { goodsSpeciesId: 'fish', quantity: 1, ownerId: actorId, ownerType: 'npc' }`
- [ ] 5.3 Write 2 integration tests: `MEAT_HARVESTED` → `GOODS_EXTRACTED:meat` in same tick, `FISHERY_HARVESTED` → `GOODS_EXTRACTED:fish` in same tick

## 6. NPC Productive-Action Hook

- [ ] 6.1 In `runtime.ts` fan-out loop: if `eventType === 'NPC_PRODUCTIVE_ACTION_ACCEPTED'` and `payload.actionType === 'hunt'`, enqueue `GOODS_EXTRACTED:meat`
- [ ] 6.2 If `actionType === 'mine'`, enqueue `GOODS_EXTRACTED:ore`
- [ ] 6.3 If `actionType === 'fish'`, enqueue `GOODS_EXTRACTED:fish`
- [ ] 6.4 Write 3 unit tests: hunt → meat, mine → ore, fish → fish; verify craft → no goods enqueued

## 7. HTTP Endpoint

- [ ] 7.1 Create `packages/server/src/http/goodsRouter.ts` — `GET /api/goods/inventory/:ownerId` reads from `GoodsInventoryProjection`, returns array of `{ goodsSpeciesId, quantity, nameZh, unit }` omitting zero-quantity entries
- [ ] 7.2 Register `goodsRouter` in `packages/server/src/http/router.ts`
- [ ] 7.3 Write 2 tests: endpoint returns only non-zero entries, unknown ownerId returns `[]`

## 8. Verify and Finalise

- [ ] 8.1 Run `npm run build:server` — must compile with no TypeScript errors
- [ ] 8.2 Run full test suite — all existing + new tests must pass (target: ≥ 590 server tests)
- [ ] 8.3 Run `npx openspec validate --all --strict` — must pass
- [ ] 8.4 Update `PROGRESS.md` with v0.26.0 entry
- [ ] 8.5 Bump `APP_VERSION` to `0.26.0` in `version.ts` and all `package.json` files
- [ ] 8.6 Commit and push

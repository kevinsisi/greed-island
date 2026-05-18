## Why

Phase E0 shipped animal spawning, NPC hunting, and fishery density — but those events terminate at the ecosystem layer. No goods entity exists yet: hunted meat, caught fish, and mined ore have no persistent representation that NPCs can store, trade, or consume. `economy` is still a scalar. Phase 2 begins by making goods real: typed entities that flow through Commands → EventLog → projection, replacing the fake scalar metabolism.

## What Changes

- **New `GoodsItem` typed entity** (speciesId + quantity + quality) tracked in a `goods_inventory` projection keyed by `(ownerId, ownerType, goodsSpeciesId)`.
- **10-species goods catalog** (`meat`, `fish`, `brine`, `lumber`, `ore`, `grain`, `refined_salt`, `iron_ingot`, `bread`, `tools`) as a frozen const in `packages/server/src/goods/catalog.ts`.
- **5 new Commands/Events**: `GOODS_EXTRACTED`, `GOODS_STORED`, `GOODS_PROCESSED`, `GOODS_CONSUMED`, `GOODS_DESTROYED` — all typed, all flowing through Rule Engine → EventLog → projection.
- **E0 promotion hook**: existing `MEAT_HARVESTED` and `FISHERY_HARVESTED` ecosystem events trigger `GOODS_EXTRACTED:meat` / `GOODS_EXTRACTED:fish` respectively, wiring E0 output into the goods layer.
- **NPC productive-action hook**: forest hunters on accepted hunt produce `GOODS_EXTRACTED:meat`; mountain miners on accepted mine produce `GOODS_EXTRACTED:ore`; salt-marsh fishers produce `GOODS_EXTRACTED:fish`.
- **Hunger/consumption hook**: NPCs with `civic.gold < threshold` emit `GOODS_CONSUMED:food` from their inventory when available (stub for Phase 2 full metabolism).
- **`goods_inventory` projection** with `rebuildFromEvents` + `canonicalHash` tests (satisfies ARCHITECTURE.md §11.7 rebuild contract).

## Capabilities

### New Capabilities

- `goods-primitives`: Goods species catalog, GoodsItem entity, 5 core Commands/Events (`GOODS_EXTRACTED`, `_STORED`, `_PROCESSED`, `_CONSUMED`, `_DESTROYED`), `goods_inventory` projection per `(ownerId, ownerType, goodsSpeciesId)`, E0 promotion hook, NPC productive-action integration.

### Modified Capabilities

- `living-world`: NPC productive actions (hunt/mine/fish) now emit `GOODS_EXTRACTED` after the ecosystem event is accepted — a new output requirement on the world tick rule engine.
- `ecosystem-runtime`: `MEAT_HARVESTED` and `FISHERY_HARVESTED` events must trigger a `GOODS_EXTRACTED` follow-on event — requirement extension, not breakage.

## Impact

- **New file**: `packages/server/src/goods/catalog.ts` (goods species catalog, frozen const).
- **New file**: `packages/server/src/goods/commands.ts` (5 typed commands + validation).
- **New file**: `packages/server/src/projections/goodsInventory.ts` (projection + rebuild + hash).
- **Modified**: `packages/server/src/sim/runtime.ts` — NPC productive-action fan-out, E0 event hook.
- **Modified**: `packages/server/src/sim/livingWorldCommands.ts` — add 5 new command types.
- **No client changes** — goods state exposed via new `GET /api/goods/inventory/:ownerId` endpoint only; no Phaser overlay this slice.
- **No breaking changes** to existing event shapes or API contracts.

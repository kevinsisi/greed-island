## Context

v0.25.3 shipped ecosystem E0 (animal spawning, hunting, fishery density, predation). Ecosystem events now terminate correctly at the projection layer (`AnimalPopulationProjection`, `FisheryDensityProjection`), but there is no persistent goods layer: hunted meat, caught fish, and mined ore vanish after the event is committed — they never become entities an NPC can store, consume, or offer at a market. `economy` is still a single scalar on each tile. This design introduces the minimum viable goods substrate to close that gap and make Phase 2 metabolism honest.

Current state of ecosystem hooks:
- `MEAT_HARVESTED` / `FISHERY_HARVESTED` are emitted when NPC hunters/fishers succeed
- `ANIMAL_KILLED` reduces `AnimalPopulationProjection`
- There is no `GOODS_EXTRACTED` event and no `goods_inventory` projection

## Goals / Non-Goals

**Goals:**
- Define a frozen 10-species goods catalog (`catalog.ts`)
- Introduce 5 typed Commands: `GOODS_EXTRACTED`, `GOODS_STORED`, `GOODS_PROCESSED`, `GOODS_CONSUMED`, `GOODS_DESTROYED`
- Build `GoodsInventoryProjection` keyed by `(ownerId, ownerType, goodsSpeciesId)` with `rebuildFromEvents` + `canonicalHash`
- Wire E0 output to goods layer: when `MEAT_HARVESTED` / `FISHERY_HARVESTED` events are committed, emit a follow-on `GOODS_EXTRACTED` event
- Wire NPC productive actions: forest hunter / mountain miner / salt-marsh fisher emit `GOODS_EXTRACTED` on accepted productive actions
- Expose a read endpoint: `GET /api/goods/inventory/:ownerId`
- No client Phaser overlay this slice (Phase 2 logistics / market will add UI)

**Non-Goals:**
- Logistics (GOODS_TRANSPORT, warehouses, carrier NPCs) — Phase 2.2
- Production chains (GOODS_PROCESSED being consumed and transformed) — Phase 2.3
- Market formation / prices — Phase 2.4
- Player-initiated goods interactions — Phase 6
- Goods feeding NPC hunger fully — stub only (Phase 2.2 closes the loop)

## Decisions

**D1: Goods catalog as frozen const, not DB table**

Options: DB table (runtime-configurable), frozen const (schema-locked).
Decision: frozen const in `packages/server/src/goods/catalog.ts`. Reason: goods species are world-constitution material (Part I §6). Runtime mutation would allow `economy` to diverge between replays; a frozen const is deterministically hashable and trivially testable. Same pattern as `cards/catalog.ts`.

**D2: `goods_inventory` projection key = `(ownerId, ownerType, goodsSpeciesId)`**

`ownerId` alone is ambiguous when both NPCs and settlements share an ID space. `ownerType` = `'npc' | 'settlement' | 'building'` disambiguates without requiring separate projection classes per owner type. The projection stores quantity as an integer (no fractional goods this slice).

**D3: E0 hook via event fan-out in `runtime.ts`, not in ecosystem event handlers**

Options:
- A) Inside the ecosystem rule engine, emit `GOODS_EXTRACTED` as a side-effect of `MEAT_HARVESTED`
- B) In `runtime.ts` fan-out, after committing an ecosystem event, check type and emit a follow-on goods command

Decision: B. Reason: Rule Engine must be pure (ARCHITECTURE.md §2.3 — no side-channels). The fan-out in `runtime.ts` is the authorized cross-domain bridge. Same pattern as how `COMBAT_INITIATE` spawns sub-tick loops. The follow-on `GOODS_EXTRACTED` command passes through the normal `submitLivingWorldCommand → Rule Engine → Event → Projection` pipeline.

**D4: `GOODS_EXTRACTED` is a Command, not an automatic event promotion**

When the fan-out detects `MEAT_HARVESTED`, it calls `submitLivingWorldCommand({ type: 'GOODS_EXTRACTED', actorId: event.actorId, payload: { goodsSpeciesId: 'meat', quantity: 1, ownerId, ownerType: 'npc' } })`. The rule engine validates and emits the event. This keeps the Command-first discipline intact.

**D5: `quantity` is an integer, not a float**

Goods quantities are integers this slice. Fractional amounts introduce rounding-divergence risk in deterministic replay. Phase 2.3 (production chains) can introduce weight/volume if needed, but integer quantity is sufficient for E0 → Phase 2 bridge.

## Risks / Trade-offs

- **Fan-out ordering**: `GOODS_EXTRACTED` is emitted in the same tick as `MEAT_HARVESTED`. If the tick already hit budget, it gets queued to the next tick. Acceptable: goods are eventually consistent with ecosystem events, not same-tick-required.
- **NPC hunger stub**: `GOODS_CONSUMED` is emitted from a stub hunger check (gold < threshold → consume food from inventory if available). This is not full metabolism — it just prevents goods from accumulating forever. Full metabolism lands in Phase 2.2.
- **No client visibility**: animals/fishery are already visible via ecology overlay. Goods inventory has no Phaser overlay this slice. Players won't see "NPC carrying meat" until Phase 2.2 introduces carrier NPCs and logistics UI.
- **`ownerType: 'building'` unused this slice**: Included in the key schema for Phase 2.3 warehouse support, but no building will own goods yet. Unused key values are acceptable in a frozen projection schema.

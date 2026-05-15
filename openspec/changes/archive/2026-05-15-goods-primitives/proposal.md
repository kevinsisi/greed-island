# Proposal — Goods Primitives (Phase 2 §35.1)

## Why

`docs/WORLD_CAPABILITIES.md` §35.1 requires Phase 2 to start with goods that
originate from ecosystem events. E0.3/E0.4 now produce real meat and fishery
harvest events, but those outputs still do not become trackable goods. That
makes GM observability stop at ecological pressure instead of showing what NPCs
actually carry forward into civilization metabolism.

## What Changes

- Add Phase 2 goods command/event primitives:
  - `GOODS_EXTRACTED`
  - `GOODS_STORED`
  - `GOODS_PROCESSED`
  - `GOODS_CONSUMED`
  - `GOODS_DESTROYED`
- Add a replayable `GoodsInventoryProjection` keyed by `(holderType, holderId,
  goodsId)`.
- Promote accepted `MEAT_HARVESTED` and `FISHERY_HARVESTED` work into
  `GOODS_EXTRACTED` followed by `GOODS_STORED` on the acting NPC.
- Expose `WorldSnapshot.facts.goodsInventory` and render it on the GM world
  observer page.

## Out Of Scope

- NPC-to-NPC purchasing, market prices, logistics carriers, production building
  recipes, cooking, meal consumption, spoilage, and settlement demand curves.
- Player inventory integration.

## Impact

- Adds the first concrete Layer 3 goods inventory projection sourced from Layer
  2.5 ecosystem outputs.
- Creates the required substrate for later production/cooking/market slices.

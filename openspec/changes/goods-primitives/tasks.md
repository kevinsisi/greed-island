# Tasks — Goods Primitives (Phase 2 §35.1)

## 1. Command Catalog

- [x] 1.1 Add goods command/event types to living-world catalog.
- [x] 1.2 Add typed payloads and validators for extraction, storage, processing, consumption, and destruction.
- [x] 1.3 Add command catalog tests.

## 2. Projection

- [x] 2.1 Add `GoodsInventoryProjection` keyed by holder type, holder id, and goods id.
- [x] 2.2 Support replay/canonical hash.
- [x] 2.3 Apply `GOODS_STORED`, `GOODS_PROCESSED`, `GOODS_CONSUMED`, and `GOODS_DESTROYED` without negative quantities.

## 3. Runtime Integration

- [x] 3.1 Accepted `MEAT_HARVESTED` plans `GOODS_EXTRACTED:meat` and `GOODS_STORED:meat` for the hunter NPC.
- [x] 3.2 Accepted `FISHERY_HARVESTED` plans `GOODS_EXTRACTED:fish` and `GOODS_STORED:fish` for the fisher NPC.
- [x] 3.3 Runtime fans accepted goods events into the projection and rebuilds it on boot.
- [x] 3.4 `WorldSnapshot.facts.goodsInventory` exposes current rows.

## 4. GM Visibility

- [x] 4.1 `/admin/world` renders goods inventory rows.
- [x] 4.2 The GM UI makes clear this is inventory substrate, not market/cooking yet.

## 5. Verification

- [x] 5.1 Focused server tests pass: `npm run test -w @greed-island/server -- projections/goodsInventory kernel/livingWorld sim/runtimeGoodsInventory kernel/chronicleRenderer` (57 tests).
- [x] 5.2 Web build/test passes: `npm run build:web`; `npm run test -w @greed-island/web` (34 tests).
- [x] 5.3 `npx openspec validate goods-primitives --strict` passes.
- [x] 5.4 `npx openspec validate --all --strict` passes (24 passed, 0 failed).
- [ ] 5.5 Commit, push, verify CI + Deploy Dev, and update handoff docs.

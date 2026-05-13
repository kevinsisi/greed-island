# Tasks — Market Formation (Phase 2 §35.4)

## 1. Command Catalog

- [x] 1.1 Add `MARKET_PRICE_DISCOVERED` command/event type.
- [x] 1.2 Add typed payload and validator.
- [x] 1.3 Add command catalog tests.

## 2. Market Policy + Projection

- [x] 2.1 Add deterministic baseline demand and base price metadata for tracked goods.
- [x] 2.2 Add pure price calculation from settlement supply/demand.
- [x] 2.3 Add replayable market price projection keyed by settlement and goods.

## 3. Runtime Integration

- [x] 3.1 Runtime emits `MARKET_PRICE_DISCOVERED` through the Rule Engine when supply changes price.
- [x] 3.2 Runtime exposes `WorldSnapshot.facts.marketPrices`.
- [x] 3.3 Routine market price events do not flood public narrative surfaces.

## 4. GM Visibility

- [x] 4.1 `/admin/world` renders market price rows.
- [x] 4.2 UI labels market prices as Phase 2 §35.4 projection, not NPC purchases.

## 5. Verification

- [x] 5.1 Focused server tests pass.
- [x] 5.2 Web build/test passes.
- [x] 5.3 `npx openspec validate market-formation --strict` passes.
- [x] 5.4 `npx openspec validate --all --strict` passes.
- [ ] 5.5 Commit, push, verify CI + Deploy Dev, and update handoff docs.

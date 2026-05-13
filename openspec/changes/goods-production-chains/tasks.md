# Tasks — Goods Production Chains (Phase 2 §35.3)

## 1. Production Policy

- [x] 1.1 Add deterministic production recipe metadata for `salt_marsh_brine -> refined_salt`.
- [x] 1.2 Select eligible production holder/building/settlement state without AI authority.
- [x] 1.3 Prevent processing when input inventory is unavailable.

## 2. Runtime Integration

- [x] 2.1 Accepted production planning emits `GOODS_PROCESSED` through the Rule Engine.
- [x] 2.2 Processing consumes input inventory and stores output inventory via `GoodsInventoryProjection`.
- [x] 2.3 Runtime exposes production-chain facts on `WorldSnapshot.facts`.

## 3. GM Visibility

- [x] 3.1 `/admin/world` renders production recipes/capacity or recent processing rows.
- [x] 3.2 UI labels production as Phase 2 §35.3 and not market price formation.

## 4. Verification

- [x] 4.1 Focused server tests pass.
- [x] 4.2 Web build/test passes if GM UI changes are included.
- [x] 4.3 `npx openspec validate goods-production-chains --strict` passes.
- [x] 4.4 `npx openspec validate --all --strict` passes.
- [x] 4.5 Commit, push, verify CI + Deploy Dev, and update handoff docs.

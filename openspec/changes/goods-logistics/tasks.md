# Tasks — Goods Logistics (Phase 2 §35.2)

## 1. Command Catalog

- [x] 1.1 Add trade route and goods transport command/event types.
- [x] 1.2 Add typed payloads and validators.
- [x] 1.3 Add command catalog tests.

## 2. Projection

- [x] 2.1 Add logistics projection for trade routes and transport rows.
- [x] 2.2 Support replay/canonical hash.
- [x] 2.3 Track transport status as started/arrived/lost without duplicates.

## 3. Runtime Integration

- [x] 3.1 Accepted source `GOODS_STORED` outside `t_central` plans route + transport commands.
- [x] 3.2 Transport loading consumes source inventory.
- [x] 3.3 Transport arrival stores goods on central settlement inventory.
- [x] 3.4 Active storm world events make planned transport emit `GOODS_TRANSPORT_LOST` instead of arrival/storage.
- [x] 3.5 Runtime exposes `WorldSnapshot.facts.logistics`.

## 4. GM Visibility

- [x] 4.1 `/admin/world` renders open trade routes.
- [x] 4.2 `/admin/world` renders recent goods transport rows.
- [x] 4.3 UI labels logistics as abstract first slice, not risk/pathfinding yet.

## 5. Verification

- [x] 5.1 Focused server tests pass.
- [x] 5.2 Web build/test passes.
- [x] 5.3 `npx openspec validate goods-logistics --strict` passes.
- [x] 5.4 `npx openspec validate --all --strict` passes.
- [x] 5.5 Commit, push, verify CI + Deploy Dev, and update handoff docs.

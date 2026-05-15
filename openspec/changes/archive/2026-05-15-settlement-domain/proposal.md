# Proposal — Settlement Domain (Phase 1 §33.4)

## Why

`docs/WORLD_CAPABILITIES.md` Part I §5.1 declares Settlement the real core unit of civilization — "Settlement 不等於 tile label". `ARCHITECTURE.md` §12.4 carves Layer 3 Civilization Runtime around settlements, goods, logistics, markets. Today Layer 3 is empty of settlement entities: the codebase has only `cityLife.ts` construction projects and `areaStateEngine.ts` faction/resource scalars. NPCs cluster on tiles every tick but the world has no concept of "聚落 forming here".

Phase 1 §33.4 introduces the **first Layer 3 civilization entity**: an emergent Settlement that NPCs self-form by sustained co-presence. This is the foundation that Phase 2 (Goods/Logistics/Market) and Phase E0 (Ecosystem) will hang off — both need a noun for "where civilization is happening".

The substrate is now safe to build on: Phase 0 formalized the 6-layer architecture, Phase 1 budget gate (slices 1+2+3a) added per-tick command-count enforcement and NPC partitioning observability, so adding a new domain won't blow through the 5000-soft / 8000-hard cap.

## What Changes

Single slice covering the scaffold + minimum viable detection policy. Hub map UI overlay is **out of scope** for this slice and lands in a follow-up (`settlement-domain-ui`).

### Domain entity

- New `Settlement` type — `{ id, tileId, formedAtTick, founderNpcIds, currentMemberNpcIds }`. Population / storage / economy / faction / territory / production / stability / trade routes are deferred to follow-up slices per `docs/WORLD_CAPABILITIES.md` §28.1 / §30.1; this slice is identity + founding only.

### Command + Event

- New `SETTLEMENT_FORMED` Command in `livingWorldCommands.ts`. Payload: `{ settlementId, tileId, formedAtTick, founderNpcIds, motivation? }`.
- Rule Engine validator + commit path (currently a single ADDED Command, no MODIFIED or REMOVED).

### Detection policy

- New pure helper `detectSettlementFormation(npcsByTile, tick, history)` returning `{ tileId, founderNpcIds }[]` for any tile that has had `≥ SETTLEMENT_FORMATION_MIN_NPCS` (default `3`) outdoor NPCs co-located for `≥ SETTLEMENT_FORMATION_MIN_TICKS` (default `12`, ≈ 1 in-world minute) consecutive ticks, where no settlement currently exists.
- Detection runs every tick on the same data shape NpcEngine already exposes (no second NPC scan).
- Settlement id is deterministic: `settlement.{tileId}.{tickHashSuffix}` where suffix is `hashSeed(tileId, formedAtTick, sortedFounderNpcIds)`.

### Projection

- New `SettlementsProjection` (`packages/server/src/projections/settlements.ts`) with `rebuildFromEvents(events)`, canonical-hash test, and `getAll() / getByTile() / getById()` accessors.

### API

- New `GET /api/settlements` returning current settlement list. GET `/api/settlements/:id` for detail.
- `WorldSnapshot.facts.settlements` exposes settlement count + ids per tile for the GM dashboard.

### Tests

- Pure-helper tests for formation detection (no formation under threshold; formation at threshold; founderNpcIds deterministic; no double formation on already-formed tile).
- Projection rebuild + canonical-hash test.
- Integration: 1-tick replay with seeded co-presence emits SETTLEMENT_FORMED; projection visible via API.

## Capabilities

### New Capabilities

- `civilization-runtime`: first Layer 3 capability spec. Introduces the Settlement domain object, formation command, projection contract, and detection policy invariants.

## Impact

- New domain — first concrete Layer 3 entity. Goods / logistics / market / territory will reference `settlementId` once they land.
- Salt-marsh stops being a special legacy fixed project: once formed by NPCs it becomes a real settlement. The existing `lifeExpansion.unlockedTileIds` mechanism stays as the **terrain unlock** marker; settlement formation is the orthogonal **civilization claim** marker on top.
- No code path mutates settlement state outside the Command → Rule Engine → Event → Projection pipeline.
- Detection policy is deterministic per `(npcsByTile snapshot, tick, history)` so replay reproduces formation timing exactly.

## Out Of Scope

- Settlement population / decline / split / migration / takeover (§28.1 — follow-up slices).
- Hub map UI overlay (`settlement-domain-ui`).
- Settlement-aware NPC behaviour (e.g. NPCs preferring their settlement of origin) — Phase 3 humanity work.
- Settlement-driven goods / logistics — Phase 2.

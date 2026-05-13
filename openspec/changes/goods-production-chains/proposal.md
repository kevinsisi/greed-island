# Proposal — Goods Production Chains (Phase 2 §35.3)

## Why

`docs/WORLD_CAPABILITIES.md` §35.3 requires production buildings to consume
input goods and emit `GOODS_PROCESSED` before market formation. Phase 2 §35.1
created inventory, and §35.2 moves ecosystem goods through logistics, but goods
still do not transform into intermediate or finished goods. Without a production
chain, later market prices would still be attached to raw goods only.

## What Changes

- Add a deterministic production-chain policy that can plan `GOODS_PROCESSED`
  from accepted runtime state rather than UI narration.
- Introduce the first production recipe for salt-marsh supply:
  `salt_marsh_brine -> refined_salt`.
- Let eligible production/storage holders process input inventory into output
  inventory through the existing `GOODS_PROCESSED` event.
- Expose production-chain facts to GM observers so production capacity and
  recent processing are visible without raw EventLog inspection.

## Out Of Scope

- Market price discovery, settlement demand curves, NPC purchases, meals,
  spoilage, warehouses with capacity limits, player crafting, and multi-step
  manufacturing graphs beyond the first deterministic recipe.
- City/building damage from storms. Storms may disrupt logistics from §35.2 but
  do not alter production buildings in this slice.

## Impact

- Establishes the first true raw-to-processed goods transformation in Layer 3.
- Gives Phase 2 §35.4 market formation a processed goods supply to price later.

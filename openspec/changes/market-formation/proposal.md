# Proposal — Market Formation (Phase 2 §35.4)

## Why

`docs/WORLD_CAPABILITIES.md` §35.4 requires local supply/demand per goods
species per settlement and a `MARKET_PRICE_DISCOVERED` Command/Event. Phase 2
now has goods inventory, logistics, and the first production chain, but prices
are still nonexistent. Without a replayable market projection, later NPC buying,
meals, shortages, and migration would still rely on scalar economy or narration.

## What Changes

- Add `MARKET_PRICE_DISCOVERED` as a typed living-world command/event.
- Add deterministic market pricing policy for central settlement goods using
  projected settlement inventory as supply and fixed per-goods demand metadata.
- Add a replayable `MarketPricesProjection` keyed by `(settlementId, goodsId)`.
- Runtime emits price discovery through the Rule Engine when projected supply
  implies a changed settlement price.
- Expose market prices on `WorldSnapshot.facts.marketPrices` and the GM world
  observer page.

## Out Of Scope

- NPC purchase transactions, household budgets, player buy/sell UI, market
  orders, arbitrage, taxes, spoilage, and price manipulation.
- Dynamic demand from population, festivals, cooking, or faction policy; this
  first slice uses deterministic baseline demand so price formation has a stable
  replay substrate.

## Impact

- Completes the first Phase 2 goods/logistics/production/market loop at the
  projection level.
- Shortage can now be observed as higher price instead of only as missing goods.

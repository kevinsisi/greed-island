## Context

`CardDropEngine` runs inside the server tick subscription and already routes accepted spawns and expirations through `CardActionPipeline`. The remaining gap is that spawn chance, card selection, and coordinates are decided with process-local `Math.random()`, so two servers with the same tick, catalog, map, weather, rare-window state, and ruleset can diverge before any command is emitted.

The implementation must keep the current card pipeline shape and avoid client involvement. It must also be honest about scope: this closes random roll nondeterminism in `CardDropEngine`, but it does not migrate `card_action_log` into the canonical simulation `event_log`.

## Goals / Non-Goals

**Goals:**

- Make every card-drop roll reproducible from deterministic input material.
- Use separate roll purposes for spawn chance, rank choice, entry choice, and coordinates so adding one roll does not silently shift another roll.
- Include ruleset version and relevant world facts in the seed material.
- Add replay tests that compare independent engine instances rather than mocking `Math.random()`.

**Non-Goals:**

- Migrate card events from `card_action_log` to canonical `event_log`.
- Change public card APIs, card catalog balance, or existence caps.
- Make the frontend predict drops locally.

## Decisions

- Use stateless hash-derived rolls instead of a mutable PRNG instance. Rationale: a hash roll keyed by `{ tick, tileId, purpose, rulesetVersion, weather, rareOpen }` is order-independent, making future code changes less likely to shift unrelated outcomes. Alternative considered: seeded PRNG per tick; rejected because insertion/removal of a draw changes later draws.
- Keep the deterministic helper private to `CardDropEngine` unless another subsystem needs it. Rationale: this change is narrow and should not introduce a shared RNG abstraction prematurely. Alternative considered: add `kernel/deterministicRandom.ts`; deferred until multiple runtimes share the need.
- Derive integer coordinates with inclusive deterministic integer rolls. Rationale: current behavior uses inclusive `randInt(min, max)`, so only the entropy source changes.
- Keep spawn cap behavior unchanged. Rationale: cap rejection is already handled by `CardWorldStore.spawnDrop` and remains a rule/projection concern, not a randomness concern.

## Risks / Trade-offs

- [Risk] Hash output mistakes can bias drops if converted poorly → Mitigation: convert the first 52 bits of the canonical hash to a bounded fraction that fits safely in JavaScript's integer precision and test stability/replay identity rather than exact distribution.
- [Risk] Including too many facts in seeds can make harmless projection metadata affect drops → Mitigation: include only tick, tile id, roll purpose, ruleset version, weather, rare-window state, and engine phase (`tick` or `seed`).
- [Risk] Existing deployed databases already contain nondeterministic historical drops → Mitigation: preserve existing rows; deterministic behavior applies to new ticks after deployment.

## Migration Plan

- Deploy as a patch release with no schema migration.
- Existing `world_card_drops` and `card_action_log` rows remain authoritative historical facts.
- Rollback is safe by reverting the server code; no data shape changes are introduced.

## Open Questions

- None for this scope. The larger `card_action_log` to canonical `event_log` migration remains in the architecture backlog.

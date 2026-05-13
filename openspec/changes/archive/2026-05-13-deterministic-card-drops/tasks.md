## 1. Deterministic Roll Source

- [x] 1.1 Add stateless deterministic roll helpers in `CardDropEngine` keyed by tick, tile id, roll purpose, ruleset version, weather, rare-window state, and engine phase.
- [x] 1.2 Replace `Math.random()` spawn chance checks with deterministic fractional rolls.
- [x] 1.3 Replace rank, entry, and fallback list selection with deterministic weighted rolls.
- [x] 1.4 Replace coordinate generation with deterministic inclusive integer rolls.

## 2. Seed Drops

- [x] 2.1 Make `seedInitialDrops` use deterministic spawn, entry, and coordinate rolls.
- [x] 2.2 Keep seed-drop commands routed through `CardActionPipeline.spawnDrop` with unchanged payload shape.

## 3. Replay Tests

- [x] 3.1 Add tests that two independent engines produce equivalent normal tick spawn event payloads from identical inputs.
- [x] 3.2 Add tests that two independent fresh stores produce equivalent boot-time seed drop payloads from identical inputs.
- [x] 3.3 Assert replay comparisons ignore non-authoritative audit metadata such as autoincrement ids and wall-clock timestamps.

## 4. Documentation And Verification

- [x] 4.1 Update `ARCHITECTURE.md` backlog to mark `CardDropEngine` `Math.random()` as addressed while keeping `card_action_log` migration open.
- [x] 4.2 Bump patch version for the product runtime change.
- [x] 4.3 Run `npm run build:web`, `npm run build:server`, `npm run test -w @greed-island/server`, and `git diff --check`.
- [x] 4.4 Run a reviewer pass focused on deterministic replay and avoiding renderer/client authority.

# Tasks

- [x] Add typed player-world events, event-only projection, and indexed EventLog reads.
- [x] Add server geometry, graph-gated crossing, strict intents, deterministic rules, and atomic/idempotent service.
- [x] Integrate the service and read-only snapshot into the canonical SimulationRuntime.
- [ ] Verify forged inputs, movement/collision/portal rules, dynamic graph, transaction rollback, concurrent retries, same-region peers/NPCs, and file-backed restart.
- [ ] Record small synthetic persistence benchmark and honest verification/deployment limits.

Local pure coverage is complete (126 focused pure/protocol tests). Native SQLite/runtime/benchmark tests are written but cannot pass locally without the missing native binding; exact Node22 feature CI and browser transport acceptance are outstanding. Supplemental SQL-only benchmark was recorded separately.

- [x] Add ONE-session canonical HTTP/SSE adapter, flush-time authorization, safe optional display names, presence revision, and bounded transport cleanup/tests.

- [x] Extend one converter across all 8 existing base regions plus 1 unlock-gated Salt Marsh, preserve exact authored water masks, and test walkable spawn/reachable reciprocal graph crossings.
- [x] Enforce expected-account context before enqueue and at flush, with stale tab A/current cookie B no-mutation coverage.

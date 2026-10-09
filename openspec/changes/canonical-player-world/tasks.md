## 1. Canonical player world

- [x] 1.1 Add typed player-world events, an event-only position projection, and indexed EventLog reads.
- [x] 1.2 Add server geometry, graph-gated crossings, strict intents, deterministic rules, and an atomic idempotent service.
- [x] 1.3 Integrate the service and read-only snapshots with SimulationRuntime.
- [x] 1.4 Add the authenticated HTTP/SSE adapter with flush-time authorization and bounded transport cleanup.
- [x] 1.5 Add terrain-source parity and supported-region crossing tests.

## 2. Admission and public chat

- [x] 2.1 Enforce live admission at enqueue and commit; count multiple tabs as one admitted account.
- [x] 2.2 Declare a 50-account online cap and add a file-backed 50-account batch, fanout, and reopen test.
- [x] 2.3 Add one durable public chat stream with server-derived identity, a bounded history, rate limit, and retry handling.
- [x] 2.4 Keep private NPC dialogue out of public chat and verify chat/position rollback together.

## 3. Verification and integration

- [x] 3.1 Run focused pure/protocol tests locally.
- [ ] 3.2 Pass the exact Node 22 feature CI, including native SQLite, web build, browser E2E, and OpenSpec validation.
- [ ] 3.3 Integrate one account provider and preserve existing gameplay routes before main merge.
- [ ] 3.4 Verify the complete browser flow against the disposable unified fixture.
- [ ] 3.5 Complete owner-reviewed data preservation and actual L390 acceptance before any production cutover.
## 1. Config Constants

- [ ] 1.1 Add `INHERITANCE_GOLD_FRACTION = 0.25` and `INHERITANCE_SKILL_FRACTION = 0.10` exports to `packages/server/src/config/world.ts` with a short comment pointing to this change for tuning context

## 2. Command Type + Validator (Kernel)

- [ ] 2.1 In `packages/server/src/kernel/livingWorldCommands.ts`: add `'NPC_INHERITANCE_GRANTED'` to the `LivingWorldCommandType` union and the matching `LivingWorldEventPayload` shape (with the seven fields from the spec)
- [ ] 2.2 Add the validator entry in the validator object covering all field-level checks from the spec
- [ ] 2.3 Add `NPC_INHERITANCE_GRANTED` to `BORN_NPC_BOOT_EVENT_TYPES` in `packages/server/src/projections/bornNpcs.ts` if needed for boot rebuild
- [ ] 2.4 Write `packages/server/src/kernel/livingWorldCommands.test.ts` cases for the four validator scenarios from the spec (well-formed accept, empty parents reject, negative gold reject, non-integer tick reject)

## 3. Planner (Pure)

- [ ] 3.1 Create `packages/server/src/sim/maturationInheritancePlanner.ts` exporting `planMaturationInheritance(input): InheritanceGrant | null` with the signature from the spec
- [ ] 3.2 Implement mean computation + `Math.floor(... * fraction)` for `gold` and the four `skillXp` keys; return null when `parentsWithRecord` is empty OR when the resulting grant has all zeros
- [ ] 3.3 Write `maturationInheritancePlanner.test.ts` covering all four spec scenarios (two-alive-with-records, both-lacking-records, mixed-alive-deceased-with-records, all-zero-floor)
- [ ] 3.4 Add a determinism test: 1000 invocations with identical inputs MUST produce byte-identical outputs

## 4. Cross-Event Correlation in Rule Engine

- [ ] 4.1 Inspect existing `pendingCombatInitiates`-style correlation pattern in runtime (referenced in design Decision 6)
- [ ] 4.2 Implement a similar tick-scoped `pendingMaturedNpcIds: Set<string>` populated when `NPC_MATURED` is emitted and consulted when `NPC_INHERITANCE_GRANTED` is evaluated
- [ ] 4.3 Add the orphan-inheritance rejection scenario as a runtime test

## 5. Projection — Civic Record Seeding

- [ ] 5.1 In `packages/server/src/sim/cityLife.ts`: add `seedNpcCivicRecord(state, { npcId, gold, skillXp, tick })` returning a new `LifeExpansionState`; throw if `npcCivicRecords[npcId]` already exists
- [ ] 5.2 In `packages/server/src/sim/runtime.ts`: add an `NPC_INHERITANCE_GRANTED` branch to the lifeExpansion event-projection block that calls `seedNpcCivicRecord`
- [ ] 5.3 Verify the new event type is included in whichever boot event lists rebuild `lifeExpansion` (audit runtime.ts boot path — both small-log and large-log branches)
- [ ] 5.4 Write `cityLife.test.ts` cases for "seeds a previously-absent civic record" and "double-grant throws"

## 6. Runtime Wiring — Tick-Pair Emission

- [ ] 6.1 In `runtime.ts` where `MaturationIntent` → `NPC_MATURED` is built, call `planMaturationInheritance` immediately after with the just-built civic projection snapshot
- [ ] 6.2 Emit the `NPC_INHERITANCE_GRANTED` command at sequence > the paired `NPC_MATURED` in the same tick block
- [ ] 6.3 Write `runtimeMaturationInheritance.test.ts` covering "both events emitted in order" and "no inheritance event when planner returns null"

## 7. Boot Replay / Canonical Hash

- [ ] 7.1 Write a replay test: synthesize an EventLog with `NPC_CHILD_BORN`, `NPC_MATURED`, `NPC_INHERITANCE_GRANTED` for one npc; boot from log; assert `lifeExpansion.npcCivicRecords[npcId]` matches expected
- [ ] 7.2 Confirm canonical hash of the lifeExpansion projection stays stable across the live-run-then-boot-replay cycle

## 8. Admin API + UI

- [ ] 8.1 In `packages/server/src/http/adminNpcsRouter.ts`: extend the `/api/admin/npc-stats` handler to query the EventLog for `NPC_INHERITANCE_GRANTED` events, sort by `grantedAtTick` desc, take 10, transform to the response shape from the spec
- [ ] 8.2 Add an `InheritanceProjection` (or extend `BornNpcsProjection`) if a recent-events index is needed for performance; otherwise an EventLog query is fine since the volume is small
- [ ] 8.3 Update `AdminNpcsPage` in `packages/web/src/admin/...` to render an "近期繼承" panel mirroring the "近期成長" pattern from v0.86.0
- [ ] 8.4 Write a router test for "empty world returns empty array" and "15 events returns 10 newest-first"

## 9. Chronicle Renderer (Optional Polish)

- [ ] 9.1 In `packages/server/src/kernel/chronicleRenderer.ts`: add a renderer for `NPC_INHERITANCE_GRANTED` so chronicle/AI dialog can narrate "X 從 P1 與 P2 處繼承了 N 金幣的家業" (Layer 5 read-only consumption)
- [ ] 9.2 If chronicle arcs index inheritance events, add a chronicle-arc test

## 10. Documentation + Memory

- [ ] 10.1 Update `PROGRESS.md` with v0.88.0 handoff snapshot covering: what shipped, files touched, verification evidence, deferred items removed (Phase D)
- [ ] 10.2 Update `ROADMAP.md` with the v0.88.0 entry summarizing the inheritance change
- [ ] 10.3 Update `docs/WORLD_CAPABILITIES.md` Part II baseline section if appropriate (the matured-child inheritance is now part of household shared economy reality, not deferred)
- [ ] 10.4 Save an auto-memory `project_matured_child_inheritance_v088.md` under `C:\Users\h1114\.claude\projects\D--Projects--HomeProject-greed-island\memory\` + index it in `MEMORY.md`

## 11. Verification + Ship

- [ ] 11.1 `npm --workspace packages/server exec vitest run` — all server tests pass; new tests included
- [ ] 11.2 `npm run build` — server + web build clean
- [ ] 11.3 `npx openspec validate --all --strict` — pass
- [ ] 11.4 Run the world locally, hit `POST /api/admin/sim/advance { ticks: 50000 }` twice from an admin session, then `GET /api/admin/npc-stats` and confirm `inheritedRecent` is non-empty with sensible values
- [ ] 11.5 Bump version in root `package.json` to `0.88.0`; commit each task group as it lands; push the final version-bump commit when verification is green

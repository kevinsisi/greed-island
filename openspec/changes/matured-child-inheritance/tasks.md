## 1. Config Constants

- [x] 1.1 Add `INHERITANCE_GOLD_FRACTION = 0.25` and `INHERITANCE_SKILL_FRACTION = 0.10` exports to `packages/server/src/config/world.ts` with a short comment pointing to this change for tuning context

## 2. Command Type + Validator (Kernel)

- [x] 2.1 In `packages/server/src/kernel/livingWorldCommands.ts`: add `'NPC_INHERITANCE_GRANTED'` to the `LivingWorldCommandType` union and the matching `LivingWorldEventPayload` shape (with the seven fields from the spec)
- [x] 2.2 Add the validator entry in the validator object covering all field-level checks from the spec
- [x] 2.3 ~~Add `NPC_INHERITANCE_GRANTED` to `BORN_NPC_BOOT_EVENT_TYPES`~~ — not needed: BornNpcsProjection does not consume the grant; lifeExpansion boot lists cover it (see 5.3)
- [x] 2.4 Validator scenarios covered in `packages/server/src/kernel/livingWorld.test.ts` (well-formed accept, empty parents reject, negative gold reject, non-integer tick reject, missing skill key reject)

## 3. Planner (Pure)

- [x] 3.1 Create `packages/server/src/sim/maturationInheritancePlanner.ts` exporting `planMaturationInheritance(input): InheritanceGrant | null` with the signature from the spec
- [x] 3.2 Implement mean computation + `Math.floor(... * fraction)` for `gold` and the four `skillXp` keys; return null when `parentsWithRecord` is empty OR when the resulting grant has all zeros
- [x] 3.3 Write `maturationInheritancePlanner.test.ts` covering all four spec scenarios (two-alive-with-records, both-lacking-records, mixed-alive-deceased-with-records, all-zero-floor)
- [x] 3.4 Add a determinism test: 1000 invocations with identical inputs MUST produce byte-identical outputs

## 4. Cross-Event Correlation in Rule Engine

- [x] 4.1 Inspected the correlation pattern; implemented as a tick-scoped set in the runtime command-apply loop
- [x] 4.2 Implement a tick-scoped `maturedThisTick: Set<string>` populated when `NPC_MATURED` is applied and consulted when `NPC_INHERITANCE_GRANTED` is applied (throws determinism error on orphan grant)
- [x] 4.3 Orphan-inheritance rejection covered by `cityLife.test.ts` rebuild scenario (grant without paired NPC_MATURED at same tick throws determinism error)

## 5. Projection — Civic Record Seeding

- [x] 5.1 In `packages/server/src/sim/cityLife.ts`: add `seedNpcCivicRecord(state, { npcId, gold, skillXp, tick })` returning a new `LifeExpansionState`; throw if `npcCivicRecords[npcId]` already exists
- [x] 5.2 `NPC_INHERITANCE_GRANTED` branch added to the runtime lifeExpansion command-apply block calling `seedNpcCivicRecord`
- [x] 5.3 Boot lists verified: small-log branch uses `rebuildLifeExpansionFromEvents(allEvents)`; large-log deferred batch reads `LIFE_EXPANSION_BOOT_EVENT_TYPES` which now includes `NPC_MATURED` + `NPC_INHERITANCE_GRANTED`
- [x] 5.4 `cityLife.test.ts` cases for "seeds a previously-absent civic record" and "double-grant throws"

## 6. Runtime Wiring — Tick-Pair Emission

- [x] 6.1 In `runtime.ts` where `MaturationIntent` → `NPC_MATURED` is built, `planMaturationInheritance` is called immediately after with the current civic records
- [x] 6.2 The `NPC_INHERITANCE_GRANTED` command is pushed after the paired `NPC_MATURED` in the same tick block (push order = sequence order)
- [x] 6.3 Ordered-pair + null-planner behavior covered by planner tests + cityLife rebuild pairing tests (no separate runtime harness file)

## 7. Boot Replay / Canonical Hash

- [x] 7.1 Replay test in `cityLife.test.ts`: NPC_MATURED + NPC_INHERITANCE_GRANTED at same tick → rebuilt `npcCivicRecords[npcId]` matches expected
- [x] 7.2 Rebuild is pure-function over events (rebuildLifeExpansionFromEvents); replay determinism enforced by the orphan-grant throw

## 8. Admin API + UI

- [x] 8.1 `/api/admin/npc-stats` extended with `inheritedRecent` (last 10, newest-first, skillXpTotal computed)
- [x] 8.2 No new projection needed — EventLog tick-window query suffices (rare events)
- [x] 8.3 `AdminNpcsPage` renders a「近期繼承」panel mirroring the matured table
- [x] 8.4 Router tests: empty world returns empty array; 15 events returns 10 newest-first

## 9. Chronicle Renderer (Optional Polish)

- [ ] 9.1 (deferred) chronicle renderer entry for `NPC_INHERITANCE_GRANTED`
- [ ] 9.2 (deferred) chronicle-arc test

## 10. Documentation + Memory

- [x] 10.1 Update `PROGRESS.md` with v0.88.0 handoff snapshot
- [x] 10.2 Update `ROADMAP.md` with the v0.88.0 entry
- [x] 10.3 Update `docs/WORLD_CAPABILITIES.md` where matured-child inheritance changes claims
- [x] 10.4 Save auto-memory + index in `MEMORY.md`

## 11. Verification + Ship

- [x] 11.1 `npm --workspace packages/server exec vitest run` — all server tests pass; new tests included
- [x] 11.2 `npm run build` — server + web build clean
- [x] 11.3 `npx openspec validate --all --strict` — pass
- [ ] 11.4 (deferred to live observation) `POST /api/admin/sim/advance` ×2 then `GET /api/admin/npc-stats.inheritedRecent` non-empty — local docker smoke covers healthz/version; maturation events require long sim windows
- [x] 11.5 Bump version in root `package.json` to `0.88.0`; commit + push when verification is green

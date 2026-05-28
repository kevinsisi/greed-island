## 1. Schema Migration & Type Definitions

- [x] 1.1 Add `dimensions_json TEXT NOT NULL DEFAULT '...'` and `direction TEXT NOT NULL DEFAULT 'a_to_b'` columns to `npc_relationships` schema in `initializeNpcRelationshipsSchema`
- [x] 1.2 Update primary key/unique index to include `direction` (one row per `(npcA, npcB, direction)`)
- [x] 1.3 Define `RelationshipDimensions` TypeScript type with all 8 fields
- [x] 1.4 Define default vector constant `DEFAULT_DIMENSIONS = { trust:50, fear:50, respect:50, attraction:50, loyalty:50, resentment:50, dependency:50, familiarity:0 }`
- [x] 1.5 Extend `RelationshipType` union: add `'lover' | 'mentor' | 'apprentice' | 'feared'`
- [x] 1.6 Update `RelationshipRow` type to include `dimensions: RelationshipDimensions` and `direction: 'a_to_b' | 'b_to_a'`

## 2. Event Type Registry

- [x] 2.1 Add `NPC_RELATIONSHIP_DIMENSION_ADJUSTED` to event type literal union in `livingWorldCommands.ts`
- [x] 2.2 Define `NpcRelationshipDimensionAdjustedCmd` payload: `{ from, to, dimension, delta, reason, tick }`
- [x] 2.3 Add validator (delta is finite, dimension is one of 8 strings, from/to non-empty)
- [x] 2.4 Add to `LivingWorldCommandPayload` union

## 3. Projection Core — Multi-Dim Logic

- [x] 3.1 Refactor `SqliteNpcRelationshipsStore.project(event)` into multiple per-event-type handlers
- [x] 3.2 Implement `applyDelta(from, to, dimension, delta)` — clamped 0..100 — used by all sources
- [x] 3.3 Implement `NPC_INTERACT` handler: dispatch to both directions; chat → `{ trust:+1, familiarity:+1, resentment:-1 }`; argue → `{ trust:-2, resentment:+2, familiarity:+1 }`
- [x] 3.4 Implement `NPC_HOUSEHOLD_FORMED` handler: both directions → `{ attraction:+30, dependency:+20, familiarity:+20, trust:+5 }`
- [x] 3.5 Implement `NPC_MENTORSHIP_COMPLETED` handler: apprentice→mentor `{ respect:+20, loyalty:+15, familiarity:+10 }`, mentor→apprentice `{ attraction:+10, respect:+5, familiarity:+10 }`
- [x] 3.6 Implement `NPC_DECEASED` handler: read affected NPCs; for each `w` where `dims(w→victim).respect ≥ 60`, apply `{ respect:+10, fear:-20 }`
- [x] 3.7 Implement `COMBAT_RESOLVE` handler: requires reading `COMBAT_WITNESS_RECORDED` for the same tile + tick window; each witness → winner: `fear:+20`; loser-side witness → winner: `resentment:+10`
- [x] 3.8 Implement `FACTION_TILE_SEIZED` handler: scan known relationship rows; for `(defenderFaction → seizerFaction)` named pairs: `fear:+15, resentment:+20`; for `(seizerFaction → seizerFaction)` cohorts: `respect:+10, loyalty:+10`
- [x] 3.9 Implement `NPC_RELATIONSHIP_DIMENSION_ADJUSTED` handler: apply the single-dimension delta from event payload
- [x] 3.10 Implement `rebuildFromEvents`: drop rows, replay all events in tick order
- [x] 3.11 After every delta application, re-evaluate `resolveRelationshipType` and update the `relationship_type` column

## 4. Composite Type Resolver

- [x] 4.1 Create `packages/server/src/kernel/relationshipTypeResolver.ts` exporting `resolveRelationshipType(from, to, dims, isMentorOf, isApprenticeOf): RelationshipType`
- [x] 4.2 Implement precedence ladder per spec
- [x] 4.3 Unit tests: each scenario in `relationship-type-derivation/spec.md`

## 5. Familiarity Drift From Co-Presence (cadence-gated)

- [ ] 5.1 Create `packages/server/src/sim/familiarityDriftPlanner.ts` with `planFamiliarityDrift({currentTick, npcs, runtime})`
- [ ] 5.2 Logic: cadence-gated every `TICKS_PER_HOUR`; for each pair of NPCs on the same tile, emit `NPC_RELATIONSHIP_DIMENSION_ADJUSTED dimension=familiarity delta=+1` (bidirectional) up to a per-tick budget cap
- [ ] 5.3 Unit tests: two co-located NPCs drift familiarity by 1; isolated NPCs do not drift

## 6. Runtime Integration

- [ ] 6.1 Wire `familiarityDriftPlanner` into `computeNextTick`
- [ ] 6.2 Verify all events listed in §3 are reachable in the projection fan-out (some, like `COMBAT_RESOLVE`, may need a new subscriber path)
- [ ] 6.3 Update boot hydration: ensure `npc_relationships.rebuildFromEvents` is called with the expanded event-type set (now includes faction/combat/mortality events)

## 7. AI Dialog Grounding

- [ ] 7.1 Extend `AiDialogContext` type with `relationshipDirectives: Record<targetNpcId, string[]>`
- [ ] 7.2 In `aiSnapshot.ts`, populate directives by reading `dimensions(self→target)` for every known target and applying the threshold rules per spec
- [ ] 7.3 Extend `formatRelationshipContext` to render the directive section into the system prompt
- [ ] 7.4 Update `chronicleRenderer.ts` to suppress raw `NPC_RELATIONSHIP_DIMENSION_ADJUSTED` events from public chronicle (internal accounting)
- [ ] 7.5 Adjust anti-hallucination guard to accept emotion words that are factually grounded by the directive vector
- [ ] 7.6 Tests: directive emission per scenario; prompt rendering shape; guard accept/reject cases

## 8. Pair-Bond Attraction Gate

- [x] 8.1 In `planHouseholdCommands`, after the existing co-location/threshold/lifeGoal filter, add `dimensions(a→b).attraction ≥ 50 AND dimensions(b→a).attraction ≥ 50` check
- [x] 8.2 If no pair clears, return without emitting `NPC_HOUSEHOLD_FORMED`
- [x] 8.3 Tests: low-attraction pair blocked; high-attraction pair forms household; existing household event semantics unchanged

## 9. Frontend Types & UI

- [ ] 9.1 Update shared `RelationshipType` union in `packages/web/src/api/client.ts` and `packages/web/src/state/types.ts`
- [ ] 9.2 Add localized labels for `'lover'`, `'mentor'`, `'apprentice'`, `'feared'` in zh.ts / en.ts / types.ts
- [ ] 9.3 (Optional / Stretch) Build `/admin/npc-relationships/:id` page showing the 8-axis dimensions for an NPC's known pairs

## 10. Verification

- [x] 10.1 `npm run build` clean
- [ ] 10.2 `npm test` — all existing tests pass; new tests cover every delta source and the type resolver
- [ ] 10.3 Canonical-hash regression test: project a representative mixed event sequence and snapshot the resulting `npc_relationships` rows
- [ ] 10.4 Manual integration: confirm two NPCs who have chatted 30+ times have higher familiarity than two unrelated NPCs
- [ ] 10.5 Manual integration: a witnessed combat victim's victor has `fear ≥ 70` from witnesses on the same tile
- [ ] 10.6 Update `docs/WORLD_CAPABILITIES.md` §19 row "relationships" annotation to reflect multi-dim
- [ ] 10.7 Update `PROGRESS.md` + `ROADMAP.md` for the version that lands this change
- [ ] 10.8 Commit + push

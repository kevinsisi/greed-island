## Context

Three different failures sit behind the downgraded `WORLD_CAPABILITIES.md` claims.

- Matured born NPCs already carry `parentNpcIds` in `BornNpcsProjection`, but runtime lineage lookup, `findProfile`, household-member resolution, memory filtering, and AI dialog prompt construction do not consistently treat them as first-class household descendants.
- Roads exist as a projection and runtime movement modifier, but construction always emits `roadType: 'road'`, there is no authoritative server-side edge type for bridges, and faction collapse closes logistics without destroying the road network.
- Large-log boot was changed to restore HTTP availability by skipping many projection rebuilds in the constructor. This keeps the service alive, but several read models remain unhydrated unless the process restarts on a small log. `buildingStateProjection` is also missing from both sync boot branches.

The design must preserve the core laws: all canonical truth comes from EventLog, AI stays read-only, and startup changes cannot reintroduce the 14M-row boot stall that caused live 502s.

## Goals / Non-Goals

**Goals:**
- Make matured-born descendants able to reference real parents/deceased household members through grounded dialog context without leaking unrelated world death memories.
- Keep matured-born NPCs first-class in household/profile lookups.
- Add explicit road-edge metadata so runtime can deterministically build either roads or bridges.
- Emit `ROAD_DESTROYED` during faction-collapse consequences using deterministic road-network state.
- Preserve availability-first large-log startup while guaranteeing deferred completion of omitted projection hydration.
- Verify the shipped version through local Docker rebuild/smoke.

**Non-Goals:**
- No schema migration or retroactive EventLog rewrite.
- No new AI-generated state; all ancestor memory remains projection-derived.
- No redesign of the whole map/pathfinding system beyond adding explicit edge descriptors.
- No synchronous full large-log replay before HTTP listen.

## Decisions

### Decision 1 — Descendant memory stays projection-derived, but retrieval becomes household-scoped

`NPC_DECEASED` already stores `householdId` in its memory content. Instead of inventing a new event type, the runtime will reuse that fact and teach memory retrieval to include only the relevant deceased rows for the querying NPC's household or parent lineage.

Why this path:
- Preserves EventLog immutability.
- Reuses existing stored data.
- Fixes the current over-broad `npc_id = 'world'` leak without requiring backfill.

Alternatives considered:
- Emitting per-descendant synthetic memory rows on death: rejected because it fan-outs irreversible rows for descendants that may not even be runtime NPCs yet.
- Letting AI infer parents from name similarity: rejected by the anti-hallucination law.

### Decision 2 — Runtime lookup paths must resolve dynamic born NPC profiles directly

The runtime will stop using `this.profiles.find(...)` for household/name resolution where dynamic born NPCs must work. Instead, those paths will resolve through `NpcEngine.listProfiles()` / born projection helpers so matured descendants appear in household blocks, parent blocks, and general profile lookup.

### Decision 3 — Parent/ancestor grounding is an explicit prompt block, not an implicit side-effect of memory text

`AiDialogContext` will gain explicit parent/ancestor context. The system prompt will render a dedicated lineage block before anti-hallucination instructions so the model has a factual allowlist for parents/deceased household ancestors.

Why:
- Memory bullets alone are too lossy and can be omitted by decay rules.
- Parent identity is structural lineage truth, not just recent episodic memory.

### Decision 4 — Bridge construction requires explicit server-side edge metadata

`mapGraph.ts` will define edge descriptors (`land` vs `water-crossing`) for known adjacencies. `planRoadConstruction()` will choose `road` for land edges and `bridge` for water-crossing edges.

Why:
- Current tile biome alone is too coarse to classify an edge.
- Explicit edge metadata is deterministic, reviewable, and small enough for the current map.

Alternatives considered:
- Infer bridge from tile biome pairs at runtime: rejected as ambiguous and brittle.

### Decision 5 — Faction collapse destroys all currently built roads/bridges connected to the collapsed logistics graph

The collapse block in `runtime.ts` already emits `TRADE_ROUTE_CLOSED` for every open route. In the same tick block it will also emit `ROAD_DESTROYED` for each currently projected road segment so infrastructure collapse is observable, replayable, and deterministic.

Why:
- Current road rows have no faction owner metadata.
- Destroying the built network on collapse makes the `WORLD_CAPABILITIES` criterion honest now, without inventing ownership semantics.

Trade-off:
- This is coarse-grained. A future change can narrow the destruction scope once roads carry ownership/maintenance metadata.

### Decision 6 — Large-log full hydration becomes deferred post-listen work

The constructor keeps the minimal availability-first boot. After HTTP listen, runtime starts deferred hydration jobs in deterministic projection groups, yielding between groups so the process stays responsive.

Why:
- Solves the live 502 problem without leaving projections permanently partial.
- Reuses existing `readEventsByTypes(...)` selective boot lists.
- Keeps implementation smaller than a new materialized-snapshot subsystem.

Key detail:
- `buildingStateProjection` is added to boot hydration for the first time.
- Deferred hydration status will be tracked in runtime so tests and health checks can observe completion.

## Risks / Trade-offs

- **[Risk]** Household-scoped deceased memory may hide historically relevant non-household deaths. → Mitigation: keep world-scoped ecological/civilizational memories global; scope only `npc.deceased` lineage memories.
- **[Risk]** Dynamic-profile lookup changes can affect existing admin/UI paths. → Mitigation: reuse `getNpcsIncludingDeceased()`/`NpcEngine.listProfiles()` semantics and add focused tests.
- **[Risk]** Destroying all built roads on faction collapse may feel harsher than future design intent. → Mitigation: document the coarse policy and keep it isolated in the collapse block/planner.
- **[Risk]** Deferred hydration can race with reads. → Mitigation: hydrate projections in self-contained groups, expose status, and add boot regression tests around pre/post completion behavior.

## Migration Plan

- No data migration.
- Deploy code normally.
- Boot path:
  - small logs still replay synchronously.
  - large logs boot minimal state, listen, then run deferred hydration to completion.
- Local verification:
  - rebuild Docker with `DOCKER_BUILDKIT=0`
  - confirm `/healthz` and `/api/version`
  - inspect logs for deferred hydration completion
  - smoke `/api/npcs`, `/api/world`, and one lineage/dialog path.

## Open Questions

- Whether deferred hydration completion should be exposed directly in `/healthz` or only via logs/runtime snapshot.
- Whether future road ownership metadata should replace the coarse “destroy all built segments” collapse policy.

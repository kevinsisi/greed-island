## Why

`docs/WORLD_CAPABILITIES.md` was recently corrected to stop overstating the current runtime. The underlying problem is not documentation quality alone: several acceptance-critical behaviors are only partially implemented, especially descendant ancestor-memory grounding, road/bridge consequences around faction collapse, and large-log startup hydration.

This change closes those gaps so the world-capability claims become true again in code, not only in prose. It also restores confidence that local and live boots eventually converge on the same replayed world instead of serving a permanently partial runtime after availability-first startup.

## What Changes

- Extend matured-born NPC lineage handling so descendants receive household-scoped deceased-parent memory context and factual parent identity grounding in AI dialog.
- Fix runtime lineage/profile lookup paths so matured born NPCs behave as first-class household members across dialog grounding and read models.
- Add road-network consequences for faction collapse, including automatic `ROAD_DESTROYED` emission and bridge-vs-road construction driven by explicit server-side edge metadata instead of placeholder `roadType: 'road'` everywhere.
- Add deferred large-log boot hydration so startup remains HTTP-available while omitted projections are fully rebuilt from EventLog after listen, including currently-missed `buildingStateProjection`.
- Surface the hydration/road/lineage changes in tests, docs, and local Docker verification.

## Capabilities

### New Capabilities
- `road-network-consequences`: server-side edge metadata, bridge-vs-road construction, and deterministic road destruction when faction collapse severs logistics infrastructure.

### Modified Capabilities
- `npc-humanity-ai-memory`: add descendant household-scoped deceased memory retrieval plus matured-born parent/ancestor dialog grounding requirements.
- `simulation-kernel`: add startup requirements for deferred completion of large-log projection hydration and explicit boot coverage for missing projections.

## Impact

- **Code**:
  - `packages/server/src/sim/runtime.ts`
  - `packages/server/src/server.ts`
  - `packages/server/src/kernel/npcMemory.ts`
  - `packages/server/src/http/npc.ts`
  - `packages/server/src/npcs/aiDialog.ts`
  - `packages/server/src/projections/{bornNpcs,npcLineage,roadNetwork,buildingState}.ts`
  - `packages/server/src/sim/{mapGraph,roadConstructionPlanner}.ts`
- **Tests**:
  - dialog grounding / memory / runtime hydration / road-network regression coverage
- **Deployment**:
  - local Docker rebuild and smoke verification on `deploy/docker-compose.yml`

## 1. OpenSpec + lineage groundwork

- [x] 1.1 Add delta specs for `npc-humanity-ai-memory`, `simulation-kernel`, and new `road-network-consequences`
- [x] 1.2 Update born/lineage runtime paths so matured born NPCs resolve as first-class household members and profiles

## 2. Descendant memory and dialog grounding

- [x] 2.1 Scope deceased-memory retrieval to relevant household/parent lineage instead of leaking all world death memories
- [x] 2.2 Add explicit parent/ancestor dialog context and prompt rendering for matured born NPCs
- [x] 2.3 Update dialog/router/runtime tests covering parent allowlists, deceased ancestor grounding, and matured-profile lookup

## 3. Road and bridge consequences

- [x] 3.1 Add explicit server-side map edge metadata for road-vs-bridge classification
- [x] 3.2 Update road construction planner/runtime to emit `bridge` on water-crossing edges
- [x] 3.3 Emit `ROAD_DESTROYED` during faction-collapse infrastructure failure and add regression tests

## 4. Large-log hydration completion

- [x] 4.1 Split runtime boot into minimal sync hydration plus deferred post-listen completion for large logs
- [x] 4.2 Add missing boot coverage for omitted projections, including `buildingStateProjection`
- [x] 4.3 Add runtime boot tests covering immediate availability and eventual full hydration completion

## 5. Verification and ship

- [x] 5.1 Run targeted server tests for lineage/dialog/roads/hydration
- [x] 5.2 Run `npm run build` and `git diff --check`
- [x] 5.3 Update `WORLD_CAPABILITIES.md` / `PROGRESS.md` to reflect the completed runtime state
- [x] 5.4 Rebuild local Docker with the workstation-specific compose flow and smoke the new version
- [ ] 5.5 Commit and push the completed change

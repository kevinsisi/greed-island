## 1. Planner Spec And Wiring

- [x] 1.1 Add deterministic `npcAutonomousPlanner` module with input/output types and pure plan selection.
- [x] 1.2 Wire runtime cadence to submit planner output as `NPC_AGENT_DECISION` commands through the Rule Engine.
- [x] 1.3 Reuse existing `applyAgentDecisionEvent` and intent override path for accepted planner decisions.

## 2. Tests

- [x] 2.1 Add pure planner tests for deterministic output, pressure/intent priority, and follow-schedule fallback.
- [x] 2.2 Add runtime tests proving planner decisions are committed and steer movement through normal events.
- [x] 2.3 Add regression coverage that planner works without AI agent/provider configuration.

## 3. Version, Docs, Verification

- [x] 3.1 Bump minor version and sync server/web version metadata.
- [x] 3.2 Update `PROGRESS.md` and `ROADMAP.md` with the planner MVP scope and evidence.
- [x] 3.3 Run targeted server tests, build, and OpenSpec validation.
- [ ] 3.4 Commit/push and track CI/CD/live smoke.

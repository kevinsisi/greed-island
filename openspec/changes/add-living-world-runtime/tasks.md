## 1. Prerequisites

- [ ] 1.1 Confirm `add-deterministic-simulation-kernel` has been implemented and verified.
- [ ] 1.2 Confirm the Event contract supports tick metadata and ruleset-version metadata needed by the runtime.
- [ ] 1.3 Confirm kernel replay tests pass before adding tick-driven behavior.

## 2. Tick Runtime Contracts

- [ ] 2.1 Define Tick contract with tick number as simulation time and wall-clock fields as audit-only metadata.
- [ ] 2.2 Define actor command variants for player, NPC, and system command sources.
- [ ] 2.3 Define tick observation snapshot as frozen `WorldState(t-1)`.
- [ ] 2.4 Define tick result output with accepted events, rejections, final WorldState, and AI snapshot input.

## 3. Command Intake And Tick Assignment

- [ ] 3.1 Implement stable pending player command collection for each tick.
- [ ] 3.2 Ensure commands arriving during tick resolution are deferred to a later tick.
- [ ] 3.3 Add deterministic command identity and sort key handling for player commands.

## 4. World And NPC Command Generation

- [ ] 4.1 Implement WorldRule interface that evaluates `WorldState(t-1)` and emits SystemCommands only.
- [ ] 4.2 Implement a minimal deterministic world rule for runtime validation without defining full gameplay.
- [ ] 4.3 Implement NPC policy interface that evaluates `WorldState(t-1)` and emits NPCCommands only.
- [ ] 4.4 Implement minimal deterministic NPC policy behavior using derived NPC state only.
- [ ] 4.5 Ensure world rules and NPC policies cannot directly append Events.

## 5. Tick Resolution

- [ ] 5.1 Implement deterministic command batch construction with system, NPC, then player phase order.
- [ ] 5.2 Implement stable within-phase ordering by actor identity and deterministic command key.
- [ ] 5.3 Implement pure batch resolution through the Rule Engine.
- [ ] 5.4 Implement deterministic conflict handling using an internal resolution ledger that is not visible as WorldState.
- [ ] 5.5 Append accepted tick events atomically with global sequence and tick metadata.
- [ ] 5.6 Ensure failed ticks do not publish partial WorldState as authoritative truth.

## 6. AI Snapshot Pipeline

- [ ] 6.1 Emit AI snapshot input only after tick commit.
- [ ] 6.2 Run AI narration asynchronously so AI latency or failure cannot block future ticks.
- [ ] 6.3 Store any narration output outside the simulation EventLog or as an explicitly ignored view artifact.

## 7. Runtime Tests

- [ ] 7.1 Add tests proving all actors observe only `WorldState(t-1)`.
- [ ] 7.2 Add tests proving NPCs cannot observe same-tick NPC/player/system commands or events.
- [ ] 7.3 Add tests proving world rules and NPCs generate Commands, not Events.
- [ ] 7.4 Add tests proving system commands do not bypass the Rule Engine.
- [ ] 7.5 Add tests proving late player commands are deferred to a later tick.
- [ ] 7.6 Add tests proving same-resource conflicts resolve deterministically.
- [ ] 7.7 Add tests proving identical `AdvanceTick` input produces identical events, rejections, WorldState, and AI snapshot input.
- [ ] 7.8 Add tests proving empty player input can still advance world state through system and NPC commands.
- [ ] 7.9 Add tests proving AI lag or failure does not block tick progression.

## 8. Verification And Handoff

- [ ] 8.1 Run the concrete build command for the project.
- [ ] 8.2 Run the concrete test command for kernel and runtime test suites.
- [ ] 8.3 Run OpenSpec status/verification for this change.
- [ ] 8.4 Complete the required HomeProject review and completion workflow before commit.

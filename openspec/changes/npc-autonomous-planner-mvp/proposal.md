## Why

NPCs currently move, work, interact, and can receive AI/freeform proposals, but they still feel like schedule runners because there is no always-on deterministic planning layer that records what each NPC is trying to accomplish next. This change adds a first Cognitive Runtime slice so NPC action has a visible, replayable purpose without letting AI mutate world state.

## What Changes

- Add a deterministic NPC autonomous planner that derives a short-horizon plan from profile, current presence, needs, beliefs, memory/life-goal boosts, and existing intent stack.
- Commit planner choices as `NPC_AGENT_DECISION` commands/events through the Rule Engine before steering NPC presence with the existing intent override path.
- Expose planner reasons through committed narration/motivation so Timeline/debug surfaces can show why an NPC changed direction or followed schedule.
- Keep freeform AI proposals additive and non-authoritative; AI may narrate or propose, but deterministic planning remains server-owned.

## Capabilities

### New Capabilities
- `npc-autonomous-planner`: deterministic short-horizon NPC planning, committed as Rule Engine-validated decision facts and executed through existing movement/action paths.

### Modified Capabilities
- `npc-humanity-ai-memory`: NPC agent state now includes deterministic autonomous-planner decisions as a first-class source of active task/last decision metadata.
- `npc-life-goals-and-expansion`: NPC life goals and pressure now feed a committed short-horizon planning layer rather than only influencing background intent weights.

## Impact

- Affected server code: `packages/server/src/sim/runtime.ts`, new planner module under `packages/server/src/sim/`, targeted runtime/planner tests, and existing command validation for `NPC_AGENT_DECISION`.
- Affected specs/docs: new OpenSpec change, `PROGRESS.md`, `ROADMAP.md`, and version metadata.
- No external dependencies, no new AI provider calls, and no direct database migration are expected in the MVP.

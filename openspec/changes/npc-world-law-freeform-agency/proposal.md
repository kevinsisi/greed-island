## Why

NPC events still look too much like scheduler output: many residents converge on the same tile with the same generic intent label, then the Chronicle renders repetitive lines such as “decided to go X for livelihood/resources”. That is not a living world.

The world needs an explicit middle layer between low-level pressure scoring and EventLog presentation: a deterministic **world-law agency planner**. NPCs should respond to world constraints, personal needs, memory, cognitive bias, life goals, role, and location by proposing concrete bounded actions. The Rule Engine still owns legality and EventLog writes; the new layer changes the default non-AI fallback from fixed intent menu events into grounded freeform proposals.

## What Changes

- Add a deterministic world-law freeform action planner that turns needs, life goals, cognitive profile, memory context, tile scores, and current intent override into `NPC_FREEFORM_ACTION_PROPOSED` command payloads.
- Prefer the new freeform proposal event over generic `NPC_AGENT_DECISION` when pressure crosses the world-law threshold.
- Keep `NPC_AGENT_DECISION` only as fallback when no meaningful world-law action exists.
- Produce concrete action summaries such as work, build, travel for safety, social scene, ecosystem inspection, or continuation of an existing plan.
- Preserve generated tile display names in summaries/narration instead of leaking raw tile ids.

## Non-Goals

- No direct AI state mutation.
- No unbounded arbitrary event catalog.
- No removal of the existing AI freeform agent path; this slice improves deterministic fallback and default runtime behavior.
- No Chronicle UI rewrite in this slice.

## Impact

- **Code**: `packages/server/src/sim/npcWorldLawActionPlanner.ts`, `runtime.ts`.
- **Tests**: world-law action planner tests plus runtime intent-resolution tests.
- **Architecture**: still Command → Rule Engine → EventLog → Projection. The new planner proposes richer command payloads; Rule Engine remains authority.

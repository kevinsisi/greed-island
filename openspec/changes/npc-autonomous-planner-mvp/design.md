## Context

Greed Island already has schedule-based NPC movement, deterministic intent overrides, productive/social events, and an optional AI freeform proposal runner. The missing layer is an always-on Cognitive Runtime planner that makes every NPC select and commit a short-horizon purpose before movement/action execution. Architecture rules require all state changes to remain Command -> Rule Engine -> Event -> Projection, and AI must remain read-only/non-authoritative.

## Goals / Non-Goals

**Goals:**
- Add a deterministic planner that periodically selects one plan per eligible NPC.
- Commit each selected plan as `NPC_AGENT_DECISION` through the existing Rule Engine validator.
- Reuse existing `intentOverride` and `NPC_INTENT_RESOLVED` flow for travel/execution instead of inventing a parallel movement system.
- Make planner output inspectable through event narration/motivation and agent `lastDecision` state.
- Preserve deterministic replay by using only tick, profile/state, projections, and stable ordering.

**Non-Goals:**
- Full multi-day life simulation, deep memory reasoning, or complete human-like career/family planning.
- Letting AI choose authoritative plans, create events, grant items, change relationships, or mutate state.
- New frontend UI beyond existing event/API surfaces in this slice.
- Replacing the existing freeform AI runner; it remains additive.

## Decisions

1. Deterministic planner module instead of AI planner.
   - Chosen because the world constitution requires replayability and AI read-only behavior.
   - Alternative considered: ask the existing AI agent for plans. Rejected for MVP because provider timing/failures would make planning non-deterministic and hard to verify.

2. Commit `NPC_AGENT_DECISION` before applying effects.
   - Chosen because this event type already exists, validates chosen intent/target/urgency, and `applyAgentDecisionEvent` already steers via `intentOverride`.
   - Alternative considered: directly call `npcEngine.setIntentOverride`. Rejected because it would make planner purpose less visible and less auditable.

3. Short-horizon plan categories map to existing intent kinds.
   - MVP choices are `survival`, `economic`, `social`, `ecosystem`, or `follow_schedule`.
   - This keeps execution inside existing movement/productive/social paths and avoids introducing unvalidated action kinds.

4. Planner cadence is staggered by NPC id/order.
   - The runtime should avoid all NPCs replanning on the same tick and keep command counts bounded.

## Risks / Trade-offs

- Risk: Planner becomes another invisible system if events are filtered from public surfaces. Mitigation: include explicit narration/motivation and verify raw events plus existing projections.
- Risk: Too many decision events increase event volume. Mitigation: use a cadence and existing command budget/cap enforcement.
- Risk: Follow-schedule decisions could feel like noise. Mitigation: only commit at cadence and use them as observable intent, not every tick.
- Risk: Planner duplicates freeform AI behavior. Mitigation: deterministic planner owns authoritative direction; freeform AI stays optional/freeform and server-resolved.

## Migration Plan

- Add planner module and tests.
- Wire runtime cadence to emit `NPC_AGENT_DECISION` commands through Rule Engine.
- Reuse `applyAgentDecisionEvent` and existing intent resolution behavior.
- Bump minor version and deploy normally.
- Rollback is safe by disabling/removing planner cadence; committed decision events are observational and do not require schema migration.

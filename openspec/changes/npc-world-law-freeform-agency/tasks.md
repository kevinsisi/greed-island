## 1. Spec

- [x] 1.1 Define deterministic world-law freeform agency proposal.
- [x] 1.2 Specify pressure-to-action routing and safety boundaries.

## 2. Implementation

- [x] 2.1 Add `npcWorldLawActionPlanner` to convert needs/goals/memory/cognition/tile scores into freeform command payloads.
- [x] 2.2 Wire runtime autonomous tick to prefer `NPC_FREEFORM_ACTION_PROPOSED` over generic `NPC_AGENT_DECISION` when pressure is meaningful.
- [x] 2.3 Preserve existing fallback planner when no world-law action is warranted.

## 3. Verification

- [x] 3.1 Unit tests for concrete action selection, personality variation, and no-pressure silence.
- [x] 3.2 Runtime tests for committed world-law freeform events and generated tile names.
- [x] 3.3 Run targeted server tests.
- [x] 3.4 Run build and OpenSpec validation.

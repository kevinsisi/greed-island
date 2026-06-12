## 1. OpenSpec

- [x] 1.1 Proposal/design/spec/tasks for freeform NPC agent actions.

## 2. Server Agent Model

- [x] 2.1 Extend NPC agent prompt to request freeform structured action proposals and include a persona sheet.
- [x] 2.2 Add parser/resolver for freeform proposals into bounded action kinds.
- [x] 2.3 Preserve existing choice-menu agent path only as fallback if needed.

## 3. Rule Engine + Runtime

- [x] 3.1 Add `NPC_FREEFORM_ACTION_PROPOSED` command/event payload and validator.
- [x] 3.2 Update `NpcAgentRunner` to submit freeform proposal commands.
- [x] 3.3 Apply accepted freeform proposals through existing intent override/narration paths; rejected proposals do not mutate runtime state.

## 4. Verification

- [x] 4.1 Unit tests for proposal parsing/resolution.
- [x] 4.2 Rule-engine validator tests for accepted/rejected freeform proposals.
- [x] 4.3 Runtime/runner tests for accepted proposal submission and invalid proposal safety.
- [x] 4.4 Run server tests, build, and OpenSpec validation.

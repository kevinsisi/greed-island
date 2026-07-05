## Why

Live Chronicle still showed many NPCs proposing the same `build` / public-space cleanup action, which made the city feel fake even though the planner had needs, goals, cognition, and freeform action events.

## What Changes

- Add explicit replayable freeform action kinds for mundane living-world behavior: `buy_goods`, `learn`, and `invent`.
- Teach the deterministic world-law action planner to map food pressure into shopping/procurement, learning goals into study/apprenticeship, and patient knowledge-heavy NPCs into experiment/prototype ideas.
- Allow AI freeform proposals and validated events to use the new kinds.
- Keep work/build/rest/social/relationship paths intact.

## Verification

- RED planner tests first showed food/learning/invention still collapsed into `work`/`build`.
- GREEN implementation updates kernel validation, AI proposal vocabulary, runtime steering, and planner narration.

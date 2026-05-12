## 1. Life Pressure

- [x] 1.1 Define NPC needs and life goal fact shapes.
- [x] 1.2 Derive deterministic needs from tick/activity/context without AI.
- [x] 1.3 Select life goals from needs, personality, housing, safety, resources,
  and relationship state.
- [x] 1.4 Expose current goal/pressure through `/api/npcs` for UI display.

## 2. Households

- [x] 2.1 Add household/commitment/child command and event payloads.
- [x] 2.2 Form committed relationships only when deterministic relationship and
  stability conditions are met.
- [x] 2.3 Represent children as household dependents, not full NPC actors.
- [x] 2.4 Project household facts through replay and catch-up summary paths.

## 3. Expansion

- [x] 3.1 Define deterministic construction project fact shapes.
- [x] 3.2 Advance construction projects from committed `NPC_PRODUCTIVE_ACTION`
  events in build/service/trade/learn domains.
- [x] 3.3 Complete projects through Rule Engine events, not direct projection
  mutation.
- [x] 3.4 Make completed building projects appear in `/api/buildings` and Area maps.
- [x] 3.5 Make completed map projects appear in `/api/map` and Hub navigation.

## 4. Verification And Release

- [x] 4.1 Add replay tests for needs/goals/households/expansion facts.
- [x] 4.2 Add projection tests for constructed buildings and unlocked map tiles.
- [x] 4.3 Run server/web tests, builds, OpenSpec validation, diff check, and staged
  review.
- [x] 4.4 Commit, push, watch CI/CD, verify live evidence, and update docs.

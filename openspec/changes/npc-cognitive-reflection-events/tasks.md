## 1. Kernel event contract

- [x] Add `NPC_REFLECTION_COMMITTED` to the living-world command catalog.
- [x] Add a typed reflection commit payload.
- [x] Validate memory evidence, personality bounds, life-goal whitelist, relationship bounds, summaries, and narration.

## 2. Projection

- [x] Add `rebuildNpcCognitiveProjection()` for deterministic EventLog replay.
- [x] Accumulate reflection count and personality deltas by `npcId`.
- [x] Track latest life-goal override, reflection summary, evidence fragments, and relationship reflection trace.

## 3. Verification

- [x] Add failing tests first for accepted commits, rejected evidence-free commits, and replay rebuild.
- [x] Run targeted server tests.
- [x] Run OpenSpec check.
- [x] Run build/test checks before commit.

## 4. Handoff

- [x] Update ROADMAP / PROGRESS.
- [ ] Commit and push.

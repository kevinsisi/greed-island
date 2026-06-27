## Why

v0.98.18 correctly made hostile player history affect NPC planning, but human relationships are not only resentment. NPCs need deterministic positive and mixed relationship pressures too: trust, affinity, familiarity, and reciprocity.

## What Changes

- Extend player↔NPC relationship arcs with affinity and interaction polarity counts.
- Positive trust deltas now cool resentment and increase affinity; negative deltas increase resentment and reduce affinity.
- Planner bias now includes trust, affinity, familiarity, positive/negative counts, and repeated trade counts.
- Planner can emit multiple relationship-driven intents:
  - `player_relationship_caution` → social caution for resentment/distrust.
  - `player_relationship_affinity` → social approach/attachment for trusted familiar players.
  - `player_relationship_reciprocity` → economic reciprocity for repeated trusted trade.

## Non-goals

- No AI-authored hidden relationship state.
- No UI changes in this slice.
- No new IntentKind enum yet; this maps complex relationship pressure onto existing social/economic planner channels.

## Impact

- **Server**: richer relationship projection and deterministic planner responses.
- **Tests**: planner covers hostile, trusted/familiar, and trusted trade histories.

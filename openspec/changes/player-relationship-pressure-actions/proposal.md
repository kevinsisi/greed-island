## Why

v0.98.19 made player↔NPC relationship pressure visible to deterministic intent planning, but the world-law action layer still mostly converted pressure into generic work/social movement. This slice turns relationship pressure into concrete accepted freeform actions so NPC behavior visibly changes in the world.

## What Changes

- Feed intent stack entries into `planNpcWorldLawAction()`.
- Convert relationship planner reasons into concrete world-law actions:
  - `player_relationship_caution` → `spread_rumor` warning / keep-distance action.
  - `player_relationship_affinity` → `custom_social_scene` approach / check-in action.
  - `player_relationship_reciprocity` → `work` action that reserves a useful trade/work opportunity for a familiar player.
- Keep actions deterministic and event-routed through existing `NPC_FREEFORM_ACTION_PROPOSED` flow.

## Non-goals

- No new hidden relationship state.
- No direct AI mutation of relationships, money, inventory, or NPC facts.
- No UI changes in this slice.

## Impact

- **Server**: runtime passes relationship-flavored intent entries into world-law action planning.
- **Tests**: world-law planner verifies caution, affinity, and reciprocity become concrete actions.

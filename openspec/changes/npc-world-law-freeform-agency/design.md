## Overview

This slice makes NPC autonomy visible at the world-law layer. The existing freeform agent command/event already provides a safe bounded event shape. The missing piece is a deterministic, always-available source of concrete proposals that is not a tiny `survival/economic/social/ecosystem` menu.

## World-law agency model

Input signals:

- NPC identity: id, localized name, role, default/current tile.
- Needs: food, rest, money, housing, safety.
- Life goal pressure and narration.
- Current intent override, if the NPC is already pursuing a plan.
- Adjacent/legal tiles and per-tile safety/economy/ecosystem scores.
- Cognitive profile: dominant trait, bias weights, and thought line.
- Memory context from the local runtime.

Output:

- `NPC_FREEFORM_ACTION_PROPOSED` payload accepted by the existing Rule Engine path.
- Concrete action taxonomy: travel, work, build, custom_social_scene, etc.
- Human-readable summary and narration grounded in tile display names.

## Decision rules

1. If an NPC has an unfinished intent override toward another tile, continue it as a concrete travel action.
2. If no pressure crosses the threshold, emit nothing and allow the old fallback path.
3. Survival/safety-biased NPCs prioritize a safe tile.
4. Build-city or housing pressure becomes a build-oriented proposal.
5. Social/form-family pressure becomes a local social scene.
6. Ecosystem bias becomes environmental inspection/work.
7. Otherwise economic/food/money pressure becomes role-specific work at the strongest economy tile.

## Safety

The planner never mutates world state directly. It only emits a bounded command payload that must pass the same living-world Rule Engine validation as AI freeform proposals.

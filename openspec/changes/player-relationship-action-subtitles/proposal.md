## Why

v0.98.22 exposed relationship actions as typed NPC API state, but the nearby subtitle/timeline surface still only showed raw speech events or `recentUtterance`. If a relationship action was available only through the server projection, the badge could update while the nearby transcript stayed silent.

## What Changed

- Extend ambient nearby subtitle derivation to read `npc.relationshipAction`.
- Prefer actual `relationshipAction.utteranceZh`; fall back to `detailZh` when the action has no direct speech line.
- Keep `recentUtterance` higher priority so committed dialogue/freeform speech remains the first source.
- Preserve subtitle dedupe and social availability filtering.

## Impact

- Relationship caution / affinity / reciprocity actions now show up in the nearby subtitle feed when no fresher live speech event is present.
- Players can see relationship-driven NPC action as both a badge and a transcript line.

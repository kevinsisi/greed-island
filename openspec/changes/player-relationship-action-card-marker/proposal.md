## Why

Players can now see relationship actions in badges and subtitles, but the NPC drawer still collapses most of that context into a single behavior badge. A player scanning nearby NPC cards should immediately see who is warning others, approaching them, or reserving trade opportunities.

## What Changed

- Add `npcRelationshipActionMarker()` for compact NPC-card relationship action summaries.
- Prefer the action utterance as marker detail, falling back to typed relationship action detail.
- Render the marker in the NPC drawer under the behavior badge.

## Impact

Relationship consequences are visible in three surfaces: map behavior badges, subtitle timeline, and NPC list/card details.

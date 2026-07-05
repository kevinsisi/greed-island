## Why

Relationship action context is visible on cards and subtitles, but it disappears when the player opens direct conversation. The dialog should preserve the same context so the player understands why the NPC is cautious, friendly, or reserving an opportunity while talking to them.

## What Changed

- Reuse `npcRelationshipActionMarker()` in `NpcDialog`.
- Render the marker in the dialog header below relationship score/tier.
- Keep the same utterance-first/detail-fallback behavior as NPC cards.

## Impact

Direct conversations now expose current relationship-driven world action context before the player sends a reply.

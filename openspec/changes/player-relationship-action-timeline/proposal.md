## Why

v0.98.23 allowed projected relationship actions to appear as ambient subtitle fallback. However, AreaPage still used ambient lines only when there were no live subtitles, so relationship action speech could disappear whenever player/NPC dialogue or NPC interaction events were present in the same area.

## What Changed

- Add dedicated `relationshipActionSubtitleLines()` for server-projected relationship actions.
- Generate stable timeline ids from `npcId + relationshipAction.sequence`.
- Keep recent utterance as the higher-priority speech source for an NPC.
- Mix live subtitles, relationship-action subtitles, and optimistic player lines in one feed.
- Keep ambient chatter as true fallback only when neither live nor relationship subtitles exist.

## Impact

Relationship-driven NPC action speech now survives alongside live dialogue/social events instead of being hidden by the ambient fallback branch.

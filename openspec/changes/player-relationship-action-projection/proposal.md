## Why

v0.98.21 made relationship-driven NPC actions visible in area badges, but the frontend still had to infer those badges from raw `NPC_FREEFORM_ACTION_PROPOSED` text. That couples UI to prose and makes replayed state fragile.

## What Changed

- Add a typed `PlayerRelationshipActionProjection` over accepted `NPC_FREEFORM_ACTION_PROPOSED` events.
- Classify relationship-driven actions as `caution`, `affinity`, or `reciprocity` with server-authored Zh labels/details.
- Expose the projection on each NPC snapshot as `relationshipAction`.
- Rebuild the projection from EventLog during small-log boot and deferred large-log hydration.
- Update web NPC behavior badges to prefer the server projection and keep raw-event parsing only as backward-compatible fallback.

## Impact

- Relationship action visibility is now event-sourced and server-authoritative.
- Frontend no longer needs to parse freeform prose when the API provides `relationshipAction`.
- Existing raw-event badge behavior remains compatible for older server payloads.

## Architecture Direction

### Presence Authority

The immediate bug is duplicate NPC presence across interior and exterior scenes.
The fix is to make building occupants a derived view of the same authoritative
NPC state used by `/api/npcs`:

- NPC state remains server-authoritative.
- `buildingId` is part of the visible presence tuple.
- Area rendering uses `buildingId === null`.
- Building rendering uses `buildingId === building.id`.
- Building occupant API responses are derived from the same tuple and may add
  contextual flags such as `isOwner` and `shift`.

This avoids frontend-only masking and removes divergent state as the root cause.

### Duty-Weighted Freedom

The old role-lock rule solved one symptom but over-constrained NPC humanity.
The replacement model should treat duty as a weight:

- A priest is likely to be at the temple during ritual duties, but can leave for
  food, social obligations, errands, danger, or story events.
- A merchant is likely to trade at the shop, but can visit suppliers, competitors,
  friends, markets, or rest areas.
- A guard is likely to patrol routes, not remain fixed to one tile.

Movement remains deterministic and EventLog-backed. AI may propose future intent,
but Rule Engine validation remains authoritative.

### AI Chronicle And Memory

AI chronicle rendering should not replace events. The event stream remains the
source of truth, and AI renders natural text from a bounded snapshot:

- Event type and payload.
- Present NPC names and roles.
- Present building/location names.
- Relevant memory snippets and relationship facts.
- Explicit anti-hallucination constraints.

If AI fails, the event remains valid and the UI may show a deterministic fallback
with observable source metadata. Fallback text should be treated as degraded
rendering, not as the desired final quality.

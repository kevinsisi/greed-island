## Why

Phase 3 needs player speech to become durable NPC state, not only an immediate reply. `PLAYER_NPC_DIALOGUE` already enters EventLog, but there was no dedicated replayable projection that summarizes a player's long-term relationship arc with an NPC for future dialog/planning context.

## What Changes

- Add a deterministic `PlayerNpcRelationshipProjection` built from `PLAYER_NPC_DIALOGUE` events.
- Track trust, resentment, familiarity, interaction count, last player message, and last intent per `(playerAccountId, npcId)`.
- Rebuild the projection from EventLog on small-log boot and in deferred large-log hydration.
- Inject the replayed relationship context into AI dialog prompts so future responses reflect accumulated consequences.

## Non-goals

- Do not let AI directly mutate relationship dimensions.
- Do not replace the existing per-user `player_npc_relations` table in this slice.
- Do not add frontend UI for relationship arcs yet.

## Impact

- **Server**: new in-memory projection, runtime boot/fanout wiring, dialog prompt injection.
- **Tests**: projection replay and malformed-event guard.

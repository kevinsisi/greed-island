# npc-humanity-ai-memory Delta

## ADDED Requirements

### Requirement: Matured born NPCs SHALL participate fully in AI dialog grounding

Once an NPC enters runtime via `NPC_MATURED`, that NPC MUST be a first-class subject for `AiDialogContext` — including (but not limited to) `BeliefProjection` rows, `IntentProjection` rows, `npc_memory` entries, `npc_relationships` trust pairs, alias memory, and social history. AI dialog code MUST NOT filter, exclude, or special-case matured born NPCs versus config-loaded NPCs. The same `formatBeliefContext` / `formatMemoryContext` / `formatReflectionContext` / `formatRelationshipContext` paths apply.

#### Scenario: Matured NPC's beliefs are surfaced in dialog context

- **GIVEN** an NPC matured via `NPC_MATURED` for `'household.a.b.child.1'`
- **AND** a subsequent `ANIMAL_ATTACKED_NPC` event near that NPC's current tile
- **WHEN** `AiDialogContext` is built for that NPC
- **THEN** `beliefContext.tile_safety` for the affected tile MUST be populated
- **AND** the rendered dialog system prompt MUST include the hedge-language block per existing belief grounding rules

#### Scenario: Matured NPC can be referenced by name in another NPC's dialog

- **GIVEN** a matured born NPC `'household.a.b.child.1'` with derived `nameZh = '潮安'`
- **AND** an interaction recorded between that NPC and another `'config_npc_X'` (e.g., `NPC_INTERACT`)
- **WHEN** `AiDialogContext` is built for `'config_npc_X'`
- **THEN** the matured NPC's `name.zh` MUST appear in the `knownPeople` / `relationships` block
- **AND** anti-hallucination rules MUST permit referencing `'潮安'` in the AI's response

### Requirement: AI dialog rendering for a matured NPC SHALL ground their parent identities

The NPC system prompt for a matured born NPC MUST include factual `parentNpcIds` derived from `BornNpcsProjection.getProfile(npcId).parentNpcIds`. The AI MUST be permitted to reference these parent names; the AI MUST NOT invent parents not in this list.

#### Scenario: Matured NPC's dialog references real parents
- **GIVEN** `NPC_MATURED` payload with `parentNpcIds = ['alice', 'bob']`
- **WHEN** AI dialog is generated for that NPC
- **THEN** the system prompt SHALL contain a line equivalent to `"你的父母是 alice, bob"` (or localized equivalent)
- **AND** the AI MUST NOT produce dialog mentioning parents whose ids are not in this list

#### Scenario: Matured NPC's deceased parent triggers grief-adjacent context
- **GIVEN** a matured born NPC whose parent has subsequently been recorded via `NPC_DECEASED`
- **WHEN** AI dialog is generated for that NPC
- **THEN** the dialog system prompt MUST inject the deceased parent's memory entry via the existing `consultsEventTypes` pipeline

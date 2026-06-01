## ADDED Requirements

### Requirement: Household-scoped deceased lineage memories SHALL ground descendant dialog
When `NPC_DECEASED` is projected into `npc_memory`, the runtime SHALL make that memory available to living NPC dialog only when the querying NPC is in the same household lineage or names that deceased NPC as a factual parent from `BornNpcsProjection`. Unrelated NPCs MUST NOT receive the deceased-person memory in their dialog context merely because it is stored under a world-scoped row.

#### Scenario: Matured descendant receives deceased parent memory
- **WHEN** a matured born NPC has `parentNpcIds = ['alice', 'bob']`
- **AND** `NPC_DECEASED` later exists for `alice`
- **THEN** the descendant's formatted memory context MUST include the deceased-parent memory entry

#### Scenario: Unrelated NPC does not receive household death memory
- **WHEN** an NPC outside the deceased NPC's household lineage builds dialog context
- **THEN** the formatted memory context MUST NOT include that deceased-person memory entry

### Requirement: Matured born NPC dialog SHALL include factual parent and ancestor allowlists
The AI dialog context for a matured born NPC SHALL include explicit lineage grounding derived from `BornNpcsProjection` and runtime profile lookup. The system prompt MUST name the NPC's factual parents and MAY include deceased-parent status when recorded, and the anti-hallucination allowlist MUST permit those referenced names even when the parent is deceased.

#### Scenario: Parent identities appear in system prompt
- **WHEN** AI dialog context is built for a matured born NPC with factual parents `alice` and `bob`
- **THEN** the prompt MUST contain an explicit lineage block naming `alice` and `bob`

#### Scenario: Deceased parent name remains allowlisted
- **WHEN** one factual parent has already been recorded via `NPC_DECEASED`
- **THEN** that parent's factual name MUST still be available to the anti-hallucination allowlist for the descendant's dialog

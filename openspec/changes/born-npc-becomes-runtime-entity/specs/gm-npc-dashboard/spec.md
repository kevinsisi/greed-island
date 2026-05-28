# gm-npc-dashboard Delta

## MODIFIED Requirements

### Requirement: NPC stats endpoint SHALL aggregate origin + lifecycle counts

The server SHALL expose `GET /api/admin/npc-stats` returning a JSON response describing total NPC count, origin breakdown (config-loaded vs autonomously-born and matured), event-driven birth and household counts, and an active deaths feed (the `NPC_DECEASED` command was implemented in v0.32.0; the placeholder previously documented here is removed).

#### Scenario: Response shape

- **WHEN** an authorised GM or admin requests `GET /api/admin/npc-stats`
- **THEN** the response body MUST contain the keys `totalNpcs`, `byOrigin`, `births`, `households`, `deaths`, `generatedAtTick`
- **AND** `byOrigin` MUST contain `manual` and `born`
- **AND** `births` MUST contain `totalEventCount` and `recent`
- **AND** `households` MUST contain `totalEventCount` and `recent`
- **AND** `deaths` MUST contain `totalEventCount` and `recent` (with `recent` listing NPC death records — not a placeholder)

#### Scenario: Manual-vs-born classification counts matured born NPCs

- **GIVEN** the runtime was bootstrapped from N NPC profile JSON files
- **AND** K `NPC_MATURED` events have been committed (born children who have entered the runtime)
- **WHEN** the endpoint is called
- **THEN** `byOrigin.manual` MUST equal N (the count of config-loaded NPCs still living)
- **AND** `byOrigin.born` MUST equal K (the count of matured born NPCs still living)
- **AND** `totalNpcs` MUST equal `byOrigin.manual + byOrigin.born`

## REMOVED Requirements

### Requirement: Deaths surface SHALL be present but explicitly unavailable

**Reason**: Obsolete — `NPC_DECEASED` shipped in v0.32.0 and the deaths feed has been wired to real event data (see `gm-npc-dashboard` delta in the implementation of this change). The placeholder semantics (`deaths.available`, `deaths.reason`, `deaths.plannedAt`) are removed from the API response shape.

**Migration**: API consumers SHOULD read `deaths.totalEventCount` (number) and `deaths.recent` (array of death records). Any client code branching on `deaths.available === false` MUST be updated to check `deaths.totalEventCount === 0` instead. The frontend `AdminNpcsPage.tsx` has already been updated.

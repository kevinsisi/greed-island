# event-motivation-chronicle Delta Specification (ecosystem-mythic-ecology)

## ADDED Requirements

### Requirement: Chronicle SHALL narrate world event spawn and resolution in Chinese
`chronicleRenderer.ts` MUST produce a Chinese narration string for `WORLD_EVENT_SPAWNED` and `WORLD_EVENT_RESOLVED` events. The narration MUST include the creature's species name, the tile region, and the event kind. It MUST NOT reference any NPC names not present in the event payload.

#### Scenario: Leviathan spawn produces Chinese narration
- **WHEN** `WORLD_EVENT_SPAWNED` is committed for `white_marsh_leviathan` on tile `t_salt_marsh_1`
- **THEN** `readNarrativeFromAnyEvent` MUST return a non-empty Chinese string describing the legendary creature's appearance

#### Scenario: World event resolution produces Chinese narration
- **WHEN** `WORLD_EVENT_RESOLVED` is committed for a legendary creature
- **THEN** `readNarrativeFromAnyEvent` MUST return a Chinese string describing the resolution

### Requirement: Chronicle SHALL narrate legendary hunt concluded in Chinese
`chronicleRenderer.ts` MUST produce a Chinese narration string for `LEGENDARY_HUNT_CONCLUDED`. The narration MUST include the species name, tile, outcome (killed/migrated/starved), and the number of hunters involved (derivable from `hunterNpcIds` in the corresponding `LEGENDARY_HUNT_STARTED` payload).

#### Scenario: Hunt concluded narration mentions species and outcome
- **WHEN** `LEGENDARY_HUNT_CONCLUDED` is committed with `outcome: 'killed'`
- **THEN** `readNarrativeFromAnyEvent` MUST return a Chinese narration string that includes both the species identifier and the kill outcome

### Requirement: Chronicle SHALL narrate faction ecology commands in Chinese
`chronicleRenderer.ts` MUST produce a Chinese narration string for all four faction ecology command types: `FOREST_CLEARCUT_ORDERED`, `FISHING_QUOTA_ENFORCED`, `INDUSTRIAL_SITE_SABOTAGED`, and `RITUAL_ECOSYSTEM_MANIPULATION`. Each narration MUST identify the faction and the ecological action taken.

#### Scenario: Guild clearcut order produces Chinese narration
- **WHEN** `FOREST_CLEARCUT_ORDERED` is committed for the guild faction
- **THEN** `readNarrativeFromAnyEvent` MUST return a non-empty Chinese narration string for that event

#### Scenario: Hidden overseer ritual produces Chinese narration
- **WHEN** `RITUAL_ECOSYSTEM_MANIPULATION` is committed for the hidden_overseer faction
- **THEN** `readNarrativeFromAnyEvent` MUST return a non-empty Chinese narration string

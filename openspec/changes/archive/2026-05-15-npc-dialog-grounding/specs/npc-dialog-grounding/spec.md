## ADDED Requirements

### Requirement: Known-person context block injected into AI prompt
The system SHALL query `NpcMemoryStore` for `interact`-type memory rows belonging to the NPC, extract the unique `otherNpcId` values, resolve their display names via the loaded NPC profiles, and pass the resulting list into the AI system prompt as a known-person block. The list SHALL be capped at 10 most-recently-heard unique names.

#### Scenario: NPC with interactions receives known-person list
- **WHEN** `buildSystemPrompt()` is called for an NPC who has 3 distinct `interact`-type memory entries with other NPCs
- **THEN** the assembled prompt includes a section listing those 3 NPC display names

#### Scenario: NPC with no interactions receives empty known-person list
- **WHEN** `buildSystemPrompt()` is called for an NPC who has zero `interact`-type memories
- **THEN** the known-person block is omitted from the prompt

### Requirement: Anti-hallucination constraint block enforced in prompt
The system prompt SHALL include a hard constraint section that explicitly lists the only person names the model is permitted to reference (the known-person list plus the NPC's own name), and the only species names (derived from the ecological context block). The constraint SHALL use unambiguous directive language ("你只能提及以下人物名稱，禁止虛構任何不在此列表中的人名").

#### Scenario: constraint block appears before conversation history
- **WHEN** the system prompt is assembled
- **THEN** the anti-hallucination constraint block appears before the dialog history section

#### Scenario: empty ecology produces species-free constraint
- **WHEN** `buildSystemPrompt()` is called for a tile with no animal population data
- **THEN** the constraint block states no species are known and the model must not name any

### Requirement: Ecological awareness block injected into AI prompt
The system SHALL query animal population rows for the NPC's current tile (via `SimulationRuntime.getAnimalPopulationOnTile`) and fishery density for the tile (via `SimulationRuntime.getFisheryDensityOnTile`), format them as a concise ecology summary, and include the block in the system prompt. The block SHALL be omitted entirely when both sources return empty/null.

#### Scenario: tile with animals produces ecology block
- **WHEN** the NPC's tile has 3 fog_wolf and 5 forest_deer in the population projection
- **THEN** the prompt ecology block mentions fog_wolf (3) and forest_deer (5)

#### Scenario: tile with no animals or fishery data omits ecology block
- **WHEN** both `getAnimalPopulationOnTile` and `getFisheryDensityOnTile` return empty
- **THEN** no ecology block appears in the prompt

### Requirement: Recent local events block injected into AI prompt
The system SHALL pull the last 5 non-suppressed narrative events from the EventLog whose `payload.data.tileId` matches the NPC's current tile, format each as a one-line summary, and include the block in the system prompt. The block SHALL be omitted when no matching events are found.

#### Scenario: tile with recent events includes event summary block
- **WHEN** 3 narrative events with matching tileId exist in recent EventLog
- **THEN** the prompt includes a recent-events block with those 3 summaries

#### Scenario: no matching tile events omits the block
- **WHEN** no recent events match the NPC's tileId
- **THEN** no recent-events block appears in the prompt

### Requirement: Runtime exposes tile-scoped ecology accessors
`SimulationRuntime` SHALL expose `getAnimalPopulationOnTile(tileId: string)` returning `Array<{ speciesId: string; count: number }>` (empty array when none) and `getFisheryDensityOnTile(tileId: string)` returning `{ speciesId: string; density: string } | null`. Both MUST delegate to existing projections and MUST NOT introduce new state.

#### Scenario: getAnimalPopulationOnTile returns rows for known tile
- **WHEN** the animal population projection has 2 species on tile `t_forest`
- **THEN** `getAnimalPopulationOnTile('t_forest')` returns an array with 2 entries

#### Scenario: getFisheryDensityOnTile returns null for non-fishery tile
- **WHEN** tile `t_forest` has no fishery density rows
- **THEN** `getFisheryDensityOnTile('t_forest')` returns `null`

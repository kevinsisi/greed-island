# event-motivation-chronicle Specification

## Purpose
TBD - created by archiving change event-motivation-chronicle. Update Purpose after archive.
## Requirements
### Requirement: Public events expose deterministic motivation

Public chronicle events SHALL expose why the event happened using deterministic,
replayable context. Motivation MAY come from explicit event payload fields or from
client/server derivation over committed payload data. AI MUST NOT invent or mutate
event motivation.

#### Scenario: Player reads a public event

- **WHEN** a Timeline row represents a public event
- **THEN** the row SHOULD show a visible motivation, pressure, purpose, or trigger
  separate from raw payload JSON
- **AND** the motivation MUST be derived from committed data such as event type,
  event payload, NPC life goals, project purpose, area pressure, or world cycle

#### Scenario: Existing event lacks explicit motivation

- **WHEN** an older event lacks an explicit motivation payload
- **THEN** the UI MAY derive a deterministic fallback motivation from the existing
  committed event type and payload
- **AND** it MUST NOT ask AI to invent missing reasons

### Requirement: Construction events carry authoritative project motivation

Construction progress and unlock events SHALL carry why the project exists using
deterministic, replayable data derived from committed simulation state such as NPC
life goals, needs, area pressure, and project purpose.

#### Scenario: Productive work advances a project

- **WHEN** a committed productive action advances a construction project
- **THEN** the resulting construction progress event MUST include a motivation
  object with a project purpose, primary pressure, pressure score, and explanation
- **AND** the public narration SHOULD mention the reason in human-readable form

#### Scenario: Project unlocks map or building

- **WHEN** a construction project unlocks a tile or building
- **THEN** the unlock event MUST carry the same project motivation
- **AND** clients SHOULD be able to show why the expansion happened without
  parsing unrelated historical events

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

### Requirement: All chronicle fallback narrations SHALL be machine-readable English, never hardcoded Chinese
`eventToChronicleEvent` MUST NOT contain any hardcoded Chinese strings. The `narration` field on `ChronicleEvent` is a fallback used only when Gemini is unavailable; it MUST be a structured English summary of the form `"[EVENT_TYPE] key1=val1 key2=val2"`. All existing hardcoded Chinese fallback strings (LIVESTOCK_SLAUGHTERED, MOUNT_ASSIGNED, SPECIES_EXTINCT, SPECIES_RECOVERED, and all E4 event types) MUST be replaced with this format.

#### Scenario: Gemini unavailable produces machine-readable fallback
- **WHEN** no Gemini API keys are active
- **THEN** every chronicle event that reaches `renderFallbackChronicle` MUST have a `narration` matching the pattern `"[EVENT_TYPE] ..."` — no Chinese characters

#### Scenario: No hardcoded Chinese in chronicle renderer source
- **WHEN** `chronicleRenderer.ts` is inspected
- **THEN** it MUST contain zero Chinese characters in any string literal in `eventToChronicleEvent`

### Requirement: Player civilization events SHALL pass through to the AI chronicle pipeline
`eventToChronicleEvent` in `chronicleRenderer.ts` MUST NOT suppress (return null for) any player civilization event type. All 14 player civilization command types MUST return a `ChronicleEvent` with `actorId = playerAccountId` so the Gemini AI narrative pipeline receives them as context. A minimal generic fallback narration (`"玩家{playerAccountId}執行了{eventType}"`) MUST be provided and used only when AI generation is unavailable.

The chronicle AI (Gemini) is the system that produces the actual player-visible narrative — hardcoded per-event Chinese strings MUST NOT be used.

#### Scenario: Player traded goods appears in AI chronicle context
- **WHEN** `PLAYER_TRADED_GOODS` is committed to EventLog
- **THEN** `buildChronicleContext()` MUST include the event in the context passed to Gemini
- **AND** the event MUST NOT be filtered out by the null-return path in `eventToChronicleEvent`

#### Scenario: AI generates narrative incorporating player actions
- **WHEN** Gemini is available and the chronicle window includes player civilization events
- **THEN** `renderChronicle()` MUST produce an AI-generated narrative that MAY reference the player's actions
- **AND** the narrative MUST only cite names from `allowedNames` (anti-hallucination rule)

#### Scenario: Fallback narrative used when Gemini unavailable
- **WHEN** no Gemini API keys are active
- **THEN** player civilization events MUST produce a machine-readable English fallback string in the form `"[EVENT_TYPE] actor=X tile=Y"` — no hardcoded Chinese strings


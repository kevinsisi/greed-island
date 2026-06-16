## ADDED Requirements

### Requirement: NpcActivity type SHALL include role-specific values
The `NpcActivity` union type (server + client mirror) SHALL be extended to include:
`read`, `perform`, `craft`, `study`, `pray`, `write`, `guard`
in addition to the existing 7 values (`idle`, `move`, `work`, `eat`, `sleep`, `trade`, `patrol`).
Existing values MUST NOT be removed or renamed.

#### Scenario: New type values are valid
- **WHEN** the NPC engine assigns `activity = 'read'` to an NPC
- **THEN** the value is accepted by the NpcActivity type, serialized through the API, and received by the client without error

#### Scenario: Existing values are unchanged
- **WHEN** an NPC has `activity = 'work'` under the new type definition
- **THEN** all existing consumers that handle `'work'` continue to work correctly

### Requirement: Schedule label pattern matching SHALL map fine-grained labels to specific activity types
The NPC engine SHALL match schedule slot labels against refined patterns and assign the most specific activity type available:
- Labels containing `library|shelving|catalogue|inscription|reading|books` → `read`
- Labels containing `busking|gig|gigs|rehearsal|performing|stage|concert` → `perform`
- Labels containing `forge|craft|carving|woodwork|weaving|pottery|smithing` → `craft`
- Labels containing `study|lecture|lectures|class|research|lab` → `study`
- Labels containing `prayer|prayers|ritual|ceremony|shrine|altar|blessing` → `pray`
- Labels containing `ledger|bookkeeping|tally|inscription|writing|records|document` → `write`
- Labels containing `guard|sentry|watch|checkpoint|gate` → `guard`
- All other labels that previously matched `LABEL_WORK_PATTERN` → `work` (unchanged fallback)

#### Scenario: Librarian schedule slot assigned correct activity
- **WHEN** an NPC schedule slot has label "library work" or "shelving"
- **THEN** `activity` is set to `'read'`, not `'work'`

#### Scenario: Busker schedule slot assigned correct activity
- **WHEN** an NPC schedule slot has label "busking" or "gig"
- **THEN** `activity` is set to `'perform'`, not `'work'`

#### Scenario: Generic work label falls back correctly
- **WHEN** an NPC schedule slot has label "office work" or "desk"
- **THEN** `activity` is set to `'work'` (existing behavior unchanged)

### Requirement: Each new activity type SHALL have a distinct character animation pose
The client `characterAvatar.ts` SHALL implement a named animation pose for each new activity type:
- `read`: seated or standing scroll-reading; subtle page-turn motion; no leg movement
- `perform`: upper-body rhythm sway with arm gesture; slight bounce
- `craft`: two-handed forward-reach cycle (distinct from `work`'s single-arm hammer swing)
- `study`: leaned-forward seated pose; slight head-bob
- `pray`: hands-together forward tilt; slow rise-and-fall cycle
- `write`: forward lean; one arm sweeping left-to-right
- `guard`: upright stance; slow left-right scan; minimal body movement

#### Scenario: Read activity shows reading pose
- **WHEN** an NPC has `activity = 'read'` and their sprite is rendered in AreaScene
- **THEN** the character animation shows a reading/scroll pose, distinct from the hammer-swing `work` pose

#### Scenario: Guard activity shows vigilant stance
- **WHEN** an NPC has `activity = 'guard'`
- **THEN** the character animation shows an upright scan stance, distinct from the walking `patrol` pose

### Requirement: Each new activity type SHALL have a distinct emoji glyph
`npcVisuals.ts` ACTIVITY_GLYPH map SHALL include entries for all new activity types:
- `read`: `📖`
- `perform`: `🎵`
- `craft`: `⚒️`
- `study`: `🔬`
- `pray`: `🙏`
- `write`: `✍️`
- `guard`: `🛡️`

#### Scenario: Read activity glyph displayed
- **WHEN** an NPC has `activity = 'read'` and is rendered in any scene
- **THEN** a `📖` glyph is displayed above their sprite

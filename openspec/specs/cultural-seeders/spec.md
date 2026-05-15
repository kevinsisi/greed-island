# cultural-seeders Specification

## Purpose
TBD - created by archiving change npc-culture-festivals. Update Purpose after archive.
## Requirements
### Requirement: Festival seeder emits CULTURAL_FESTIVAL_FORMED at threshold

After `RARE_WINDOW_OPEN` is accepted, the festival seeder SHALL increment the occurrence counter for that `windowId` in `CulturalElementProjection`. When the counter reaches `CULTURAL_FESTIVAL_THRESHOLD` (= 3) and no festival row yet exists for that `windowId`, the seeder SHALL enqueue `CULTURAL_FESTIVAL_FORMED`. The seeder SHALL NOT re-emit if a festival row already exists.

#### Scenario: festival emitted on Nth rare window opening

- **GIVEN** `RARE_WINDOW_OPEN` for `tide_festival` has been projected twice already (counter = 2)
- **WHEN** a third `RARE_WINDOW_OPEN` is accepted
- **THEN** the festival seeder enqueues `CULTURAL_FESTIVAL_FORMED` with `windowId='tide_festival'`, `tileId='t_dock'`, `occurrenceCount=3`

#### Scenario: festival not re-emitted after it already exists

- **GIVEN** `CULTURAL_FESTIVAL_FORMED` row already exists for `tide_festival`
- **WHEN** a subsequent `RARE_WINDOW_OPEN` is accepted
- **THEN** no `CULTURAL_FESTIVAL_FORMED` command is enqueued

#### Scenario: festival not emitted before threshold

- **GIVEN** only 2 `RARE_WINDOW_OPEN` events projected so far
- **WHEN** no new rare window opens
- **THEN** no `CULTURAL_FESTIVAL_FORMED` is emitted

### Requirement: Ritual seeder emits CULTURAL_RITUAL_PERFORMED on qualifying building entry

After `BUILDING_ENTER` is accepted, the ritual seeder SHALL check: (1) the entered building has tag `ritual_site`; (2) the NPC's `factionLean` is in `RITUAL_FACTION_LEANS` (`['monastic', 'temple']`); (3) the runtime's `rareWindowOpen` is true. If all three hold, enqueue `CULTURAL_RITUAL_PERFORMED`.

#### Scenario: ritual emitted for qualifying NPC during rare window

- **GIVEN** a `monastic` NPC enters building `b_mountain_monastery` (tagged `ritual_site`) while `rareWindowOpen = true`
- **WHEN** the ritual seeder processes the accepted BUILDING_ENTER event
- **THEN** `CULTURAL_RITUAL_PERFORMED` is enqueued with the NPC's id, building id, and tile id

#### Scenario: ritual not emitted when rare window is closed

- **GIVEN** `rareWindowOpen = false`
- **WHEN** a `monastic` NPC enters a `ritual_site` building
- **THEN** no `CULTURAL_RITUAL_PERFORMED` is enqueued

#### Scenario: ritual not emitted for non-ritual building

- **GIVEN** `rareWindowOpen = true`
- **WHEN** a `monastic` NPC enters a shop building (no `ritual_site` tag)
- **THEN** no `CULTURAL_RITUAL_PERFORMED` is enqueued

### Requirement: Norm seeder emits CULTURAL_NORM_ESTABLISHED when tile skill density crosses threshold

After skill observation events are committed, the norm seeder SHALL scan tiles where new `NPC_OBSERVED_SKILL` events landed this tick. For each `(tileId, skillId)` pair, count distinct NPCs present on that tile with `level ≥ 1` in that skill. If count ≥ `CULTURAL_NORM_NPC_THRESHOLD` (= 3) and no norm row yet exists for `(tileId, skillId)`, enqueue `CULTURAL_NORM_ESTABLISHED`.

#### Scenario: norm emitted when enough skilled NPCs share a tile

- **GIVEN** tile `t_salt_marsh` has 3 NPCs each with `fishing` level ≥ 1
- **WHEN** the norm seeder checks this tile
- **THEN** `CULTURAL_NORM_ESTABLISHED` is enqueued with `tileId='t_salt_marsh'`, `skillId='fishing'`

#### Scenario: norm not re-emitted after it already exists

- **GIVEN** a `CULTURAL_NORM_ESTABLISHED` row for `(t_salt_marsh, fishing)` already exists
- **WHEN** the norm seeder runs again for that tile
- **THEN** no new command is enqueued


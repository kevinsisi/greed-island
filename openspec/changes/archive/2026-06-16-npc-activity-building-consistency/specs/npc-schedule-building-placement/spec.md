## ADDED Requirements

### Requirement: ScheduleSlot SHALL support an optional buildingId field
The `ScheduleSlot` interface SHALL include `buildingId?: string | null`. When present and non-null, the NPC engine SHALL place the NPC inside that building for the duration of the slot.

#### Scenario: NPC placed in building from schedule slot
- **WHEN** an NPC's active schedule slot has `buildingId: 'b_central_library'`
- **THEN** the NPC's runtime `buildingId` is set to `'b_central_library'` while that slot is active

#### Scenario: NPC leaves building when slot changes
- **WHEN** the NPC's active slot changes to one without a `buildingId`
- **THEN** the NPC's runtime `buildingId` is set to `null`

### Requirement: Schedule-assigned building SHALL be validated against catalog at startup
On boot, the NPC engine SHALL verify that every `buildingId` referenced in NPC profile schedule slots exists in the building catalog for the correct tile. Mismatches SHALL be logged as warnings; the engine SHALL continue operating with `buildingId` ignored for unmatched slots (graceful degradation).

#### Scenario: Valid building reference
- **WHEN** a schedule slot references `buildingId: 'b_central_library'` and `b_central_library` exists in the catalog at tile `t_central`
- **THEN** no warning is logged and the NPC is placed in the building normally

#### Scenario: Invalid building reference
- **WHEN** a schedule slot references `buildingId: 'b_nonexistent'` and no such building exists in the catalog
- **THEN** a warning is logged at boot, the slot's `buildingId` is ignored, and the NPC remains at tile level (existing behavior)

### Requirement: Missing buildings SHALL be added to the catalog for role-assigned NPCs
For every NPC whose role implies a building type (librarian → library, priest → shrine, blacksmith → forge), a matching building SHALL exist in their home tile's catalog. Where it does not exist today, it SHALL be added.

The following buildings SHALL be added:
- `b_central_library` (type: `library`, tileId: `t_central`) — primary workplace for `central.librarian.lin_pei_rou`

#### Scenario: Librarian is in library during work hours
- **WHEN** `central.librarian.lin_pei_rou`'s schedule slot is active with `buildingId: 'b_central_library'`
- **THEN** the API response for this NPC includes `"buildingId": "b_central_library"` and the building exists at `/api/buildings?tileId=t_central`

### Requirement: AI dialog context SHALL include building name when NPC is inside a building
When generating NPC dialog, if the NPC has a non-null `buildingId`, the dialog context SHALL include a line identifying the building by its localized name. This ensures AI-generated intentLine and speech do not contradict the NPC's physical location.

#### Scenario: Dialog context includes building name
- **WHEN** an NPC with `buildingId: 'b_central_library'` has dialog generated
- **THEN** the AI prompt includes a line such as "Location: inside 夜潮文庫 (library)" alongside the existing belief/intent context

#### Scenario: Dialog context omits building when NPC is outdoors
- **WHEN** an NPC has `buildingId: null`
- **THEN** the AI prompt does not include a building-location line (no change from current behavior)

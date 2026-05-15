# Spec — npc-dialog-grounding delta (animals in ecology block)

Extends the v0.17.0 `npc-dialog-grounding` capability so the ecology
block in the NPC AI prompt carries structured per-species counts
instead of an opaque animal-count number.

## ADDED Requirements

### Requirement: Ecology block SHALL list animals deterministically

`buildEcologyBlock()` in `aiDialog.ts` MUST emit one prompt line per
animal species present on the current tile, ordered by `count` desc with
`speciesId` ascending as the lex tiebreak. The anti-hallucination guard
from v0.17.0 §37.1 MUST still prohibit the AI from referencing species
not in the provided list.

#### Scenario: Animal lines are deterministically ordered

- **GIVEN** the current tile carries
  `animals = [{marsh_heron,1},{forest_deer,4},{fog_wolf,4}]`
- **WHEN** the NPC dialog prompt is built
- **THEN** the ecology block MUST contain three animal lines
- **AND** the line mentioning `fog_wolf` MUST appear before the line
  mentioning `forest_deer`
- **AND** the line mentioning `forest_deer` MUST appear before the line
  mentioning `marsh_heron`

#### Scenario: Anti-hallucination guard still holds

- **GIVEN** the supplied animals list does not contain `dragon`
- **WHEN** the AI rendering pipeline runs
- **THEN** the prompt MUST instruct the model not to invent species
  outside the supplied list, preserving the existing v0.17.0 constraint
  block verbatim

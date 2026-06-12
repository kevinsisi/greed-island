## ADDED Requirements

### Requirement: Combat hand SHALL be derived from owned technique cards

The combat hand MUST consist of the basic cards (`TIDE_STRIKE`, `MEND`) plus one combat-card class per owned combat-type technique card (1001..1007), labeled with the technique's name. `/combat/initiate`, `/combat/initiate-animal`, `/combat/active`, and `/combat/:id` MUST return the player's `hand` and the combat's `usedCardClasses`.

#### Scenario: No purchases means basic hand only

- **GIVEN** a player who owns no technique cards
- **WHEN** they initiate combat
- **THEN** the hand MUST be exactly TIDE_STRIKE + MEND

#### Scenario: Owning 織絲縛魂 unlocks NO_ESCAPE

- **GIVEN** a player owning technique 1003
- **WHEN** the hand is computed
- **THEN** it MUST include NO_ESCAPE labeled 「織絲縛魂」

### Requirement: Technique cards SHALL compile into round effects, once per combat

`POST /combat/:id/action` MUST accept an optional `cardClass`. The server MUST reject classes the player has not unlocked (403 CARD_NOT_OWNED) and classes already used in this combat (409 CARD_ALREADY_USED, judged from the combat_log projection). Accepted cards MUST compile deterministically into the round: bonus damage (FIRE_LASH/TIDE_STRIKE/NO_ESCAPE), heal (MEND), halved incoming (SHIELD), fully avoided incoming (PHASE_SHIFT), NPC skips action (STUN), NPC cannot defend (NO_ESCAPE), reflected damage (COUNTERSPELL), double strike (HASTE) — emitting `COMBAT_CARD_USED` and the corresponding damage/heal events.

#### Scenario: Same input replays identically

- **GIVEN** identical round inputs with a card class
- **WHEN** the round is evaluated twice
- **THEN** the event sequences MUST be byte-identical

#### Scenario: Second use of the same card is rejected

- **GIVEN** a combat where FIRE_LASH was already played
- **WHEN** the player submits another action with FIRE_LASH
- **THEN** the server MUST respond 409 CARD_ALREADY_USED

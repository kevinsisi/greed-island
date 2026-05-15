# Spec — npc-defense-coordination capability

First slice of the `npc-defense-coordination` capability. Closes the
"civilization side of ecological pressure" gap noted in Part I §6.2 +
§5.1 — when an animal attacks an NPC and other NPCs are nearby, the
neighbours organise a counter-attack and put the predator down.

## ADDED Requirements

### Requirement: A defense party SHALL form when 2+ NPCs witness a recent attack

The runtime MUST emit `NPC_DEFENSE_PARTY_FORMED` when a recently-
committed `ANIMAL_ATTACKED_NPC` event satisfies all of: (a) the
attacking animal is still alive in `animal_population`, (b) the tile
holds at least `DEFENSE_PARTY_MIN_MEMBERS` outdoor NPCs other than the
victim, (c) no prior `NPC_DEFENSE_PARTY_FORMED` event references the
same `attackId`. The party MUST then push a coordinated
`ANIMAL_HUNT_STARTED` / `ANIMAL_HUNT_RESOLVED` (`success`) /
`ANIMAL_KILLED` / `CARCASS_CREATED` chain against the attacker.

#### Scenario: Two neighbours form a defense party and kill the wolf

- **GIVEN** `ANIMAL_ATTACKED_NPC` committed at tick `100` against
  `npc_yuna` by `a_wolf_001` on tile `t_forest`
- **AND** `a_wolf_001` is still in `animal_population` on `t_forest`
- **AND** `npc_anton` and `npc_kai` are also on `t_forest` at tick `101`
- **WHEN** the runtime evaluates defense reactions at tick `101`
- **THEN** the runtime MUST emit `NPC_DEFENSE_PARTY_FORMED` with
  `memberNpcIds = ['npc_anton', 'npc_kai']` (lex-sorted, excluding
  `npc_yuna`)
- **AND** the runtime MUST emit the coordinated hunt chain that
  removes `a_wolf_001` from `animal_population`

#### Scenario: A single bystander does not form a party

- **GIVEN** `ANIMAL_ATTACKED_NPC` committed against `npc_yuna` by
  `a_wolf_001` on `t_forest`
- **AND** only `npc_anton` is otherwise on `t_forest`
- **WHEN** the runtime evaluates defense reactions
- **THEN** the runtime MUST NOT emit `NPC_DEFENSE_PARTY_FORMED`

#### Scenario: Same attack does not trigger two parties

- **GIVEN** a `NPC_DEFENSE_PARTY_FORMED` event already references
  attack `attackId='attack.a_wolf_001.t_forest.100'`
- **WHEN** the runtime evaluates defense reactions on the same tile
  next tick
- **THEN** the runtime MUST NOT emit a second
  `NPC_DEFENSE_PARTY_FORMED` for that `attackId`

### Requirement: Party hunts SHALL skip the retaliation roll

The coordinated hunt produced by a defense party MUST NOT invoke
`planAnimalRetaliation`. The numerical advantage absorbs the dying
animal's last-bite risk, so members do not take retaliation damage.

#### Scenario: Defense kill produces no retaliation event

- **GIVEN** a defense party has formed against a high-aggression
  species (e.g. `fog_wolf` with `aggression = 60`)
- **WHEN** the runtime emits the party's hunt chain
- **THEN** no `ANIMAL_RETALIATED` event MUST be appended for that
  hunt

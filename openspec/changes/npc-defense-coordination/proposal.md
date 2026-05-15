# Proposal — NPC Defense Coordination (Sprint 2C)

## Why

Sprint 2B (`animal-aggression`, v0.20.0) gave starving predators agency
over NPCs and gave hunted prey a retaliation blow. The world can now
bite. The natural follow-up is the **civilization side** of that loop:
villagers do not stand by while one of their own gets bitten. When an
animal attacks an NPC on a tile that has additional NPCs nearby, those
NPCs should organize a counter-attack and put the predator down.

This closes the smallest possible "human civilization pressure on
ecosystem" mechanic that goes through Command → Rule Engine → Event
per `ARCHITECTURE.md` §0. It also delivers the visible "村民組隊獵狼"
narration the user explicitly asked for.

Player-driven defense (the player avatar joining a party) and faction-
level rivalry / militia structures remain out of scope.

## What Changes

### New event type
- `NPC_DEFENSE_PARTY_FORMED { partyId, targetAnimalId, targetSpeciesId,
  tileId, memberNpcIds: string[], reactionToAttackId: string,
  formedAtTick, narration }` — a deterministic group action emitted
  once per (animalId, tileId, formedAtTick) triplet.

### Trigger
- After the predation step in `runtime.ts`, the runtime inspects
  recently-committed `ANIMAL_ATTACKED_NPC` events from the same tile
  within `DEFENSE_REACTION_WINDOW_TICKS` (default `2` ticks). For each
  qualifying attack the runtime checks:
  1. The attacking animal is still alive on the tile (population row
     contains its `animalId`).
  2. The tile carries at least
     `DEFENSE_PARTY_MIN_MEMBERS = 2` outdoor NPCs OTHER than the
     victim.
  3. No prior `NPC_DEFENSE_PARTY_FORMED` event has been recorded for
     the same `(attackId, animalId)` pair (idempotency).
- If all three hold, the runtime emits `NPC_DEFENSE_PARTY_FORMED` and
  then pushes a coordinated `ANIMAL_HUNT_STARTED` / `ANIMAL_HUNT_RESOLVED`
  / `ANIMAL_KILLED` / `CARCASS_CREATED` chain against the attacker,
  attributed to the party leader (the lex-min member id).

### Party kill semantics
- The kill is **certain** (no retaliation roll bypass) because the
  whole point of a party is the numerical advantage. The party hunt
  ignores the retaliation planner so a defense action cannot itself
  trigger a counter-bite — the party already absorbed that risk.
- The kill `motivation.projectPurpose` is set to `"defense"` so the
  chronicle can distinguish it from a routine subsistence hunt.

### Out Of Scope

- Per-party member damage (members do not individually take animal
  retaliation hits in this slice).
- Faction-coloured parties / militia structures.
- Player avatar joining a party.
- Animals fighting back as a pack (different problem; goes with a
  later "pack predator" slice).
- Mood / rumor side-effects beyond the existing rumor projection — the
  attack itself already seeds rumors via Sprint 3 §37.1 mechanics.

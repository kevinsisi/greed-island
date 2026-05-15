# Proposal — Animal Aggression (Sprint 2B)

## Why

`docs/WORLD_CAPABILITIES.md` Part I §6.2 declares ecosystem autonomy as
a core principle: the wildlife layer must push back on the civilization
layer. Today the ecology already starves predators when they fail to
hunt prey, but no predator has ever tried to attack the NPCs who walk
the same tile — the ecosystem is alive but it cannot bite. Conversely,
when an NPC hunts prey, the prey has no agency to fight back, even if
its species data carries a non-zero `aggression` trait.

This slice closes both loops with the smallest possible mechanic that
goes through the Command → Rule Engine → Event pipeline (per
`ARCHITECTURE.md` §0) and surfaces through the existing chronicle /
narrative pipeline.

Player-targeted attacks and organized NPC hunting parties are **out of
scope** here. They are tracked separately as Sprint 2C
`npc-defense-coordination` (NPC retaliation party) and a later combat
sub-runtime extension (`combat-system` Sprint 5).

## What Changes

### New commands / events
- `ANIMAL_TARGETED_NPC` — predator declares intent to attack a specific
  NPC on its tile. Idempotency-safe; one targeting per (animalId, npcId)
  pair per tick.
- `ANIMAL_ATTACKED_NPC` — actual attack lands. Carries damage to NPC
  mood + health.
- `ANIMAL_FLED` — animal moves to an adjacent tile after a successful
  attack (or after being injured). Tracks `(animalId, fromTileId,
  toTileId, reason)`.
- `ANIMAL_RETALIATED` — when an `ANIMAL_HUNT_STARTED` lands on a target
  with a non-zero retaliation score (species.aggression), the target
  injures the hunter before being killed.

### New deterministic planner
- `packages/server/src/ecosystem/aggression.ts` exposes
  `planAnimalAggression(input)` and `planAnimalRetaliation(input)`.
- Aggression input: tick, animal population, NPC presence per tile,
  predator hunger rows, species traits, an RNG seed derived from
  `(tick, tileId)`. Output: optional `AnimalAggressionPlan`.
- Retaliation input: the in-flight `ANIMAL_HUNT_STARTED` plan + species
  aggression score. Output: optional `AnimalRetaliationPlan`.
- Both planners are pure functions, replay-safe, and produce
  deterministic identifiers (`attackId`, `retaliationId`,
  `fleeRouteId`) via `hashSeed`.

### Runtime integration
- Inside the predation step in `runtime.ts`, after `planPredation`
  returns `'starvation'` (no prey on tile), inspect the NPC presence
  on the same tile. If at least one NPC is present and the predator's
  `species.aggression > 0`, swap the starvation event chain for an
  aggression chain: `ANIMAL_TARGETED_NPC` → `ANIMAL_ATTACKED_NPC` →
  optional `ANIMAL_FLED` (when `species.fear` clears the post-attack
  threshold).
- Inside the simple hunt path, after each accepted
  `ANIMAL_HUNT_STARTED`, invoke `planAnimalRetaliation` and, if a plan
  exists, push `ANIMAL_RETALIATED` BEFORE the hunt's
  `ANIMAL_HUNT_RESOLVED` so the prey can land its retaliation blow
  before being killed.

### NPC injury reflection
- `ANIMAL_ATTACKED_NPC` and `ANIMAL_RETALIATED` carry `damage.mood` and
  `damage.health` deltas. The runtime applies them by re-emitting an
  `NPC_STATE_RECORDED` event with the post-damage state, reusing the
  existing NpcStateProjection contract — no new health/mood projection
  is introduced.

### Chronicle / narrative surface
- All four event types are added to the chronicle suppression list ONLY
  when triggered by `system` actors in routine routes; player-visible
  aggression goes through the existing narrative event surface so it
  shows up on `/api/events` and (eventually) the Hub timeline.

### Out Of Scope

- Player-targeted attacks (predator attacking the player avatar). This
  needs the combat sub-runtime UX path and is deferred.
- NPC organized retaliation party (Sprint 2C `npc-defense-coordination`).
- Hub / AreaScene visual blood splatter / damage flashes. The events
  show up in the chronicle, but no extra Phaser VFX in this slice.
- Player-driven "scare animal away" command. Out of scope.
- Carcass / loot drop from animals that die to retaliation — reuse the
  existing `ANIMAL_KILLED` carcass path unchanged.

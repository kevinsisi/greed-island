# Design — Animal Aggression (Sprint 2B)

## Principle alignment

- **Part I §6.2 Ecosystem Autonomy**: the ecology must push back on the
  civilization layer; this slice gives starving predators agency over
  human NPCs and gives hunted prey agency over their hunters.
- **ARCHITECTURE.md §0 Command/Event/Rule Engine**: every new state
  change goes Command → validator → Rule Engine → typed Event →
  projection.
- **ARCHITECTURE.md §11.4** (combat consequences): persistent injury
  state will eventually be a projection, but for this slice the existing
  NPC state record path is sufficient.

## Architecture

```
SimulationRuntime.runTick()
   │
   ├── plan ecosystem predation
   │       ├── if kill   → ANIMAL_HUNT_*  → ANIMAL_KILLED  (existing)
   │       └── if starvation w/ NPC on tile →
   │             planAnimalAggression(...)
   │                ↓ deterministic AnimalAggressionPlan?
   │             ┌──────────────────────────────────────────────┐
   │             │ ANIMAL_TARGETED_NPC                          │
   │             │ ANIMAL_ATTACKED_NPC  (damage payload)        │
   │             │ NPC_STATE_RECORDED   (post-damage state)     │
   │             │ ANIMAL_FLED          (if fear > threshold)   │
   │             └──────────────────────────────────────────────┘
   │
   ├── plan simple hunting (NPC initiates)
   │       └── after ANIMAL_HUNT_STARTED →
   │             planAnimalRetaliation(...)
   │                ↓ deterministic AnimalRetaliationPlan?
   │             ┌──────────────────────────────────────────────┐
   │             │ ANIMAL_RETALIATED    (damage payload)        │
   │             │ NPC_STATE_RECORDED   (post-damage state)     │
   │             └──────────────────────────────────────────────┘
   │             then ANIMAL_HUNT_RESOLVED  (existing)
```

## Decision log

### D1 — Aggression replaces starvation on tiles with NPC presence
**Chose**: on tiles where the predator would normally starve, if an NPC
is present and `species.aggression > 0`, swap the starvation chain for
an aggression chain. The predator resets its hunger counter on a
successful attack (counts as a "feed").

**Why**: prevents the unnatural "wolf starves while a farmer stands ten
feet away" outcome. Re-using the existing hunger-reset hook keeps the
predator alive after a successful attack and lets the next tick decide
whether it flees or stays.

### D2 — Damage = simple integer delta, not a combat sub-runtime
**Chose**: `ANIMAL_ATTACKED_NPC.damage = { mood: -10, health: -10 }` as
defaults; species-specific override possible but not required this slice.

**Why**: combat sub-runtime is Sprint 5/6 work. We do not want to gate
the basic ecology mechanic on the sub-runtime. The existing NPC state
projection already tracks mood + health; a one-shot damage event is
enough to make the world feel alive.

### D3 — Retaliation fires before the hunt resolution
**Chose**: `ANIMAL_RETALIATED` is pushed BEFORE `ANIMAL_HUNT_RESOLVED`
in the same tick's command batch.

**Why**: a dying animal still gets its last bite. The hunt resolution
removes the animal from `animal_population`, so the retaliation must
land first. Per `ARCHITECTURE.md` event ordering is deterministic by
sequence number, so ordering inside `commands.push(...)` is the source
of truth.

### D4 — Flee uses ANIMAL_FLED, not a piggyback on ANIMAL_MIGRATED
**Chose**: dedicated `ANIMAL_FLED` event with `(animalId, fromTileId,
toTileId, reason: 'attacked' | 'injured')`.

**Why**: migration is a planned bulk movement with a wave id; flee is a
single panicked relocation. Separating them avoids polluting the
`migration_routes` projection and makes the chronicle narration honest
("狼攻擊村民後逃離 t_forest" reads better than "wolf migration wave w_…
started").

### D5 — Aggression / retaliation eligibility uses existing Species data
**Chose**: `Species.aggression: number` already exists in
`species.ts`. Aggression chance is `aggression / 100` (clamped 0–1) and
fear-flee chance is `fear / 100`.

**Why**: no new species traits, no new config. Honest scope.

## Determinism notes

- All RNG comes from `hashSeed(speciesId, tileId, tick, salt)`. Salts:
  `'aggression-trigger'`, `'aggression-target-pick'`, `'flee-dir'`,
  `'retaliation-trigger'`. Different salts prevent the same hash from
  driving multiple decisions on the same tick.
- Re-running the runtime against the same EventLog must produce the
  same aggression / retaliation / flee plans. The planners are pure
  functions over `(animalPopulation, npcsByTile, predatorHunger,
  speciesCatalog, tick, hashSeed)`.

## Failure modes & guards

- **NPC has zero or negative mood/health after damage**: clamp to 0.
  Death is a separate concern (`NPC_DECEASED` already exists but is not
  invoked by aggression in this slice; the NPC is left at health 0 mood
  0 until the next tick decides).
- **No NPC on tile**: aggression planner returns `null`; starvation
  chain runs unchanged.
- **No adjacent ecosystem tile for flee**: planner skips `ANIMAL_FLED`
  emission. The animal remains on the source tile.
- **Multiple eligible NPCs**: target selection is `npcs.sort(by id) →
  pick at hashSeed-derived index`. Deterministic + replay-safe.

## Testing strategy

- Unit-test `planAnimalAggression` with fixture predator hunger + NPC
  presence: returns null when no NPC, returns plan when 1+ NPC,
  deterministic target pick with multiple NPCs.
- Unit-test `planAnimalRetaliation` with fixture hunt: returns null for
  zero-aggression species, returns plan otherwise.
- Integration test on `runtime` confirms that the predation step
  produces the aggression chain when applicable, and that
  `NPC_STATE_RECORDED` mood/health drops show up in `NpcStateProjection`.
- Replay test: rebuild aggression + retaliation events from the same
  EventLog and confirm canonical hash on `NpcStateProjection`.

## Rollout

- Version bump v0.19.0 → v0.20.0.
- No data migration; existing EventLog unchanged.
- Backward compatible: legacy clients without aggression-aware UI still
  see the events flow through `/api/events` text narration.

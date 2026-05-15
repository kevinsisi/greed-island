# Design — NPC Defense Coordination (Sprint 2C)

## Principle alignment

- **Part I §6.2 + §5.1**: Civilization is a real entity that responds
  to ecological pressure. A single NPC being attacked is enough signal
  for neighbours to organise.
- **ARCHITECTURE.md §0**: every state change goes Command → Rule Engine
  → Event. The defense party is one new event type plus existing
  hunt chain.
- No new projection. Recency is read from the existing EventLog via
  `getRecentEvents(window)`.

## Architecture

```
SimulationRuntime.runTick()
   │
   ├── plan ecosystem predation
   │       └── (Sprint 2B) ANIMAL_ATTACKED_NPC ...
   │
   ├── (NEW) plan defense parties:
   │       getRecentEvents(window: 2 ticks)
   │          .filter(eventType === 'ANIMAL_ATTACKED_NPC')
   │          .filter(animal still on tile)
   │          .filter(no prior NPC_DEFENSE_PARTY_FORMED for this attackId)
   │          .filter(tile has ≥ 2 NPCs other than the victim)
   │             ↓
   │          NPC_DEFENSE_PARTY_FORMED + ANIMAL_HUNT_STARTED / RESOLVED / KILLED / CARCASS_CREATED
   │
   ├── (existing) plan NPC hunts / construction / ...
```

## Decision log

### D1 — Recency check, no new projection
**Chose**: walk `getRecentEvents(K)` where K = `DEFENSE_REACTION_WINDOW_TICKS = 2`.

**Why**: no new state to keep in sync; replay safety is preserved
because the EventLog is the authoritative source. K=2 is the natural
window — same-tick reactions would race with the attack chain itself.

### D2 — Members = outdoor NPCs on the tile, excluding the victim
**Chose**: read `NpcStateProjection.getAll().filter(state.tile === tile && npcId !== victim)`.

**Why**: matches the existing definition the predation step uses for
"NPCs on the tile". Indoor NPCs are not eligible because they are
inside a building (busy). Lex-sorted member list keeps the party id
deterministic.

### D3 — Party id derived from (attackId, formedAtTick)
**Chose**: `partyId = 'defense.' + hashSeed(attackId, formedAtTick, 'defense-party').toString(16)`.

**Why**: ties the party to the triggering attack and the tick it
formed, so replays produce identical ids.

### D4 — Party hunt skips retaliation
**Chose**: the coordinated hunt path bypasses `planAnimalRetaliation`.

**Why**: numerical advantage means a party kill is clean. Future
faction work can add weighted retaliation by party size, but for the
first slice the "clean kill" model matches the narrative.

### D5 — One party per (attackId, animalId) pair
**Chose**: idempotency guard inside the planner — scan
`getRecentEvents(window)` for any existing
`NPC_DEFENSE_PARTY_FORMED` with the same `reactionToAttackId` /
`targetAnimalId` and skip if already formed.

**Why**: prevents the party from re-forming on every tick within the
reaction window while the prior hunt is in flight.

### D6 — Party leader = lex-min member id
**Chose**: the `ANIMAL_HUNT_STARTED` actor is the lex-min member id.

**Why**: deterministic, replay-safe, and consistent with how
`settlementDetection` picks founder ids (sorted lex).

## Determinism notes

- All RNG is `hashSeed(attackId, formedAtTick, 'defense-party')`.
- Member list is the lex-sorted list of eligible NPC ids on the tile;
  no randomness.
- Replay correctness verified by canonical hash on `NpcStateProjection`
  (no new projection added).

## Failure modes & guards

- **Attacking animal already dead**: planner returns no plan; chronicle
  ends with the previous attack event.
- **Only 1 NPC on tile (besides victim)**: planner returns no plan;
  the victim recovers (or doesn't) without a defense response.
- **Multiple eligible attacks on the same tile**: each `attackId` gets
  its own party check; idempotency guards prevent double-firing.
- **Attack happened 3+ ticks ago**: outside the window; ignored.

## Testing strategy

- Pure planner unit tests with fixture inputs:
  - No attack in window → null
  - Attack present, only victim on tile → null
  - Attack present, 2+ others on tile, animal alive → plan emitted
  - Attack present, animal already killed → null
  - Attack present, prior party formed → null (idempotency)
- Integration test on `runtime.ts`: simulate `ANIMAL_ATTACKED_NPC`
  via the EventLog and confirm the next tick produces the expected
  party + hunt chain.

## Rollout

- Version bump v0.20.0 → v0.21.0.
- No data migration.
- Backward compatible.

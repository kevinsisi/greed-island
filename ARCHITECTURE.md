# Architecture — Greed Island Living Deterministic World

This file is the canonical architecture reference for the simulation
engine. Code, OpenSpec changes, and PR reviews must conform to it. If a
rule here conflicts with a comment, JSDoc, or older design note, the
rule here wins — update the other surface to match.

The system is a **deterministic, event-sourced, append-only simulation
of a populated world** that advances on a fixed tick. Players, NPCs,
and world rules are all *actors* that submit *Commands* (intent). The
**Rule Engine is the only authority** that compiles Commands into
*Events* (committed facts). **WorldState is a projection** of the
EventLog. AI is a read-only renderer over committed events.

Two servers fed the same EventLog + same ruleset version + same world
config produce the same WorldState — including NPC memory and NPC
relationships — every time.

---

## 1. Core Laws

These laws are non-negotiable. Any code path that breaks one of them
is a bug.

### 1.1 Command-Event-State separation
- **Command** = expressed *intent* of an actor (player, NPC, world
  rule). Commands have no world effect on their own.
- **Event** = an *immutable fact* committed to the EventLog with a
  globally ordered sequence number, a tick number, and a deterministic
  key.
- **WorldState** = a *pure projection* derived by reducing the
  EventLog. It is not stored as the source of truth; it is recomputed.
- **Rule Engine** = the only valid compiler from Command to Event. It
  validates a Command against `WorldState(t-1)` and returns either
  accepted Events or a rejection. It cannot mutate WorldState directly.

### 1.2 EventLog is the only source of truth
Every authoritative simulation fact lives in `event_log`. NPC memory,
NPC relationships, player positions, faction control, weather — all
must be derivable from the EventLog by replay. SQLite tables outside
of `event_log` are *projections* (caches), not the truth.

A projection that disagrees with the EventLog is wrong by definition.
Any projection MUST expose a `rebuildFromEvents(events)` method that
drops its rows and recomputes from the log.

### 1.3 Determinism
- Event ordering uses sequence-first total order. Wall-clock time is
  audit metadata only and MUST NOT influence rule outcomes, ordering,
  command generation, or replay.
- The deterministic key for an Event is hashed from
  `(commandType, actorId, actorType, tick, payload, rulesetVersion,
   eventVersion)` — never from `Date.now()`, runtime arrival order,
  process scheduling, randomness, or external IO.
- The `commandId` is hashed from `(commandType, actorId, actorType,
  tick, payload)` for the same reason.
- Audit fields like `occurredAt` MAY appear on Events but MUST NOT be
  part of the deterministic key.

### 1.4 Causality
For tick `t`, every actor observes only `WorldState(t-1)`. Actors
MUST NOT see same-tick partial events, same-tick command results, or
in-progress tick resolution. NPC B's command at tick `t` cannot
depend on NPC A's command at tick `t`.

### 1.5 Tick atomicity
A tick produces **one** committed transition from `WorldState(t-1)`
to `WorldState(t)`. There is no observable partial WorldState within
a tick. If tick resolution fails before commit, no part of that tick
becomes authoritative truth.

### 1.6 AI is read-only
AI never produces Events, never mutates WorldState, and never
influences Rule Engine decisions. AI consumes a deterministic
EventLog snapshot and returns narration text. AI failure or latency
MUST NOT block tick progression.

---

## 2. The 10-Step Tick Runtime Flow

This is the **one and only** sequence by which the runtime advances
the world. Every code change to `SimulationRuntime.runTick` must
preserve these steps in this order.

For each tick `N`:

1. **Reduce EventLog → `WorldState(N-1)`**
   Read the entire EventLog up to the last committed sequence and
   reduce it to a frozen observation snapshot. This is the only
   ground truth any actor in tick `N` may see.

2. **Generate SystemCommands from WorldRules**
   World rules (weather cycle, season cycle, rare windows, world
   events, area pressure rules) consult `WorldState(N-1)` and emit
   typed `SystemCommand`s. World rules NEVER append Events directly.

3. **Generate NPCCommands from NPC policies**
   NPC policies consult `WorldState(N-1)` (including projected NPC
   state, recent NPC memories, relationship rows, area state) and
   emit typed `NPCCommand`s. Policies NEVER read same-tick state and
   NEVER append Events directly. NPC internal state used for
   decisioning is fully derivable from the EventLog.

4. **Collect PlayerCommands assigned to tick `N`**
   Player commands that arrived before the tick cutoff are gathered
   into a stable set. Late commands are deferred to a later tick.

5. **Build deterministic command batch**
   The three buckets (system, NPC, player) are merged into one
   ordered batch using a fixed phase order (system → NPC → player)
   and stable within-phase sort keys (`actorId`, then deterministic
   command key). Runtime arrival order is irrelevant.

6. **Resolve Commands through Rule Engine**
   Each Command in batch order is evaluated by the Rule Engine
   against `WorldState(N-1)`. Conflicts (e.g. two commands consuming
   the same unique resource) are resolved by deterministic rule
   logic — never by wall-clock or process scheduling.

7. **Append accepted Events with global sequence**
   Accepted Events from `RuleResult.events` are appended to
   `event_log` in batch order. Each Event carries `tick = N`, a
   deterministic key, the command id that produced it, and the
   ruleset version. Append is a single SQLite transaction so partial
   failure does not publish partial truth.

8. **Reject invalid Commands**
   Rejected Commands produce no Events and do not affect WorldState.
   Rejections are written to a separate audit log
   (`rejected_command_log`) that is explicitly excluded from
   WorldState reduction.

9. **Reduce EventLog → `WorldState(N)`**
   With tick `N` events committed, the projection that the next tick
   will observe is `WorldState(N)`. The runtime updates its derived
   caches (NPC memory rows, NPC relationship rows, in-memory
   activity-level snapshots) by projecting only the *new* events
   from this tick.

10. **Emit AI snapshot asynchronously**
    An `AiSnapshotInput` is produced from the committed events of
    tick `N`. Any AI narration is fired-and-forgotten on a background
    promise. AI output never re-enters the EventLog as a world Event;
    if it surfaces in the UI, it does so as a separate
    `WORLD_EVENT_AI_NARRATION` view artifact that is explicitly
    ignored by the reducer.

---

## 3. NPC State Is A Projection

NPC tile, activity, mood, health, faction lean, target tile,
last-acted-tick, **area sub-tile (subCol, subRow, subZ)**, building
presence (`buildingId` or outdoor), and any other
state an NPC policy needs MUST be derivable from the EventLog. There
is no hidden mutable runtime memory that survives a process restart
without being represented in the log.

### 3.1 Area sub-tile is server-authoritative

Within an area canvas (15×10 cells), each NPC's position is decided
by the NPC engine and stored as `subCol` / `subRow` / `subZ` in
`npc.state.<id>`. The frontend MUST render NPCs at those exact
coordinates. Frontend-side wander tweens, randomised drift, or any
visual jitter that does not come from the server are forbidden — they
break determinism and the "what every player sees" contract.
Visual smoothing (e.g. tweening between two consecutive
server-authoritative positions) is permitted as long as the displayed
position converges to the server's value before the next tick.
`subZ` is part of the authoritative position even when the current UI
renders a flat map; interaction rules MUST still compare it so future
floors / height differences do not retroactively break event facts.

NPC sprite display attributes derived from server state:
- `subCol`, `subRow`, `subZ` → canvas/world position
- `buildingId` → exclusive indoor/outdoor presence; a single NPC MUST
  NOT be rendered both inside a building and outdoors
- `faction` + `id` → deterministic 24-bit `color`
- `activity` enum → activity icon (work / eat / sleep / trade /
  patrol / move / idle)

NPC-to-NPC world interactions are valid only when both participants are
outdoors, on the same tile, and within the configured 3D proximity
threshold. When an `NPC_INTERACT` event is committed, its payload should
retain both participants' `subCol` / `subRow` / `subZ` at the decision
tick so the event carries evidence for the observed interaction.

The current NPC engine keeps an in-memory `Map<npcId, NpcRuntimeState>`
for performance. That map is a *cache*. On boot the runtime calls
`hydrateFromEventLog` which reduces the entire EventLog and rebuilds
the cache from `npc.state.<id>` FACT_SET facts. Replaying the same
EventLog twice produces the same cache.

When a future implementation drops the legacy FACT_SET path entirely,
NPC state MUST become a typed projection of `NPC_MOVE`,
`NPC_ACTIVITY_CHANGE`, etc., events — exactly the same way
`npc_memory` and `npc_relationships` are projections today.

Same rule applies to area state, building occupants, weather, season,
rare windows, and active world events.

---

## 4. Rule Engine Law

The Rule Engine is the only valid path from Command to Event. This
applies to **every** actor:

- Players → `PlayerCommand` → Rule Engine → Event
- NPCs → `NPCCommand` → Rule Engine → Event
- World rules (weather/season/area pressure/world events/rare windows)
  → `SystemCommand` → Rule Engine → Event
- Internal projections that need to record a new fact (e.g. tick
  advance, state-snapshot facts) → `Command` → Rule Engine → Event

`SimulationRuntime.runTick` MUST NOT call
`eventStore.appendEvents(...)` outside of the Rule Engine output
path. The only legitimate `appendEvents` call site is the one
immediately after `RuleEngine.evaluate(...)` returns accepted Events.

If a runtime component needs to persist a derived value (an area
state snapshot, a weather change), it does so by submitting a
Command that the Rule Engine accepts and turns into an Event. The
projector then derives the snapshot from that Event.

---

## 5. Causality Law

Implementations MUST satisfy:

- An NPC policy executing for tick `N` may read only
  `WorldState(N-1)`, the static world config, the ruleset version,
  and the NPC's own derived state.
- A world rule executing for tick `N` may read only the same set.
- A player command validated in tick `N` is rejected or accepted
  against `WorldState(N-1)`, even if a system rule also produces
  commands in tick `N`.

Concretely: when computing tick `N`, the runtime takes a snapshot of
the EventLog *before* generating any commands for tick `N`. That
snapshot is the observation surface for the entire tick. No actor
sees an event that another actor produced in the same tick.

The runtime does keep an internal *resolution ledger* during step 6
(conflict resolution). That ledger is not WorldState; it is not
visible to actors and is discarded after tick commit.

---

## 6. Tick Atomicity

Each tick produces one committed transition. The runtime achieves
this by:

- Holding all Event drafts in memory until step 7.
- Writing them in a single SQLite transaction.
- Treating the post-commit `lastSequence` as the new tick's authority.
- Refusing to expose `WorldState(N)` to actors or clients before
  step 9 completes.

If step 7 fails, no Event is committed. The runtime logs the failure
and the next tick re-uses `WorldState(N-1)` as its observation
surface — there is no partial `WorldState(N)`.

---

## 7. Simulation Budget

The world will have hundreds of NPCs, dozens of areas, and thousands
of accumulating events. The runtime MUST stay within a per-tick
budget so the loop can keep its 5-second cadence on a single Node
process. The applicable knobs:

### 7.1 Command limits per tick
- **Hard cap** on commands per tick (e.g. 2,000) to prevent runaway
  growth in degenerate cases.
- Commands above the cap are deferred to later ticks; rejection
  reasons are logged.
- A practical sub-budget: NPC commands per tick should not exceed
  the active-NPC count.

### 7.2 NPC partitioning
- NPCs are partitioned into "active" and "background" sets per tick.
- Active NPCs run the full policy and may submit movement /
  interaction commands.
- Background NPCs run a cheaper policy: schedule lookup +
  mood/health drift only, with no interactions.
- The partition is recomputed each tick based on player presence,
  area pressure, and a deterministic round-robin to ensure every
  NPC gets a full update on a bounded cadence (e.g. once per minute
  even if nothing else triggers them).

### 7.3 Regional activation
- An area is *active* if any player has been near it in the last K
  ticks OR if a world rule has flagged it (faction conflict, rare
  window, world event scope).
- Inactive areas only run a low-frequency drift step (e.g. every
  10th tick) for resources and faction control.
- This keeps the per-tick work proportional to "places where
  something is happening", not to the static world size.

### 7.4 Projection batch size
- NPC memory and NPC relationship projections write rows in the
  same SQLite transaction as the Event append. A single tick's
  projection update is bounded by the accepted-event count, which
  is bounded by the command cap.

These budgets are NOT enforced by the current code; they are the
target the code must move toward as the world grows. New code MUST
NOT introduce unbounded per-tick work.

---

## 8. Persistent Facts vs. In-Memory Caches

Persistent facts (must survive restart, must replay deterministically):
- Tick number → FACT_SET `world.tick`
- Weather → FACT_SET `world.weather` + typed `WEATHER_CHANGE` event
- Season → FACT_SET `world.season` + typed `SEASON_CHANGE` event
- Rare window state → FACT_SET `world.rareWindow.*` + typed
  `RARE_WINDOW_OPEN/CLOSE` events
- Active world events → FACT_SET `world.activeEvents` + typed
  `WORLD_EVENT_SPAWN/END` events
- NPC state per NPC → FACT_SET `npc.state.<id>` (today; will become
  typed-event projection later). Includes area sub-tile
  (`subCol`, `subRow`) so the area-canvas rendering is fully
  determined by the server.
- Area state per tile (faction control + resources + recent local
  events) → FACT_SET `area.state.<tileId>` + typed `AREA_PRESSURE`
  events
- Building occupants → FACT_SET `world.buildingOccupants` + typed
  `BUILDING_ENTER/LEAVE` events
- NPC memory rows → projection table `npc_memory` derived from
  typed events
- NPC relationship rows → projection table `npc_relationships`
  derived from typed events
- Player accounts, password resets, friend graph, messages,
  alliances, player codex, card drops, card trades, player jobs,
  player wallet, settings → orthogonal stores; not part of the
  simulation EventLog but each independently durable.
- Player last-seen tick → `accounts.last_seen_tick` column,
  updated on the explicit "since last visit" call.

In-memory only:
- The runtime's `recentEvents` ring buffer (rebuilt from EventLog
  on boot).
- The NPC interaction cooldown map `lastInteractTickByPair` (not a
  fact; only affects future random rolls; deterministic from
  `(tick, npcA, npcB)` so pure replay reproduces it).
- Ambient narrator's per-tile cache (rebuilt on demand; pure cache).
- Conflict resolution ledger during a single tick (cleared after
  commit).

---

## 9. AI Boundary

AI consumers (Gemini-driven NPC dialog, ambient narrator):

- Receive a deterministic `AiSnapshotInput` containing only
  committed Events and the WorldState projection at a known tick.
- Return narration text only. They MAY suggest categorical fields
  (e.g. dialog `intent`) but those suggestions are advisory.
- MUST NOT influence trust changes, faction control, NPC state,
  player wallet, or any other simulation fact. Server-side
  deterministic rules compute the actual delta. The AI's
  `trustDelta` is treated as a hint at most; the canonical delta is
  produced by `staticTrustDelta` based on the resolved intent +
  cooldowns + interaction history.
- May be called asynchronously off the tick loop. A failed or slow
  AI call must not block the tick.

---

## 10. Conformance Checklist (PR review)

When reviewing a runtime / kernel / NPC / world-rule change, verify:

- [ ] Every new state change goes through the Rule Engine
- [ ] No new `appendEvents` call outside the Rule Engine output path
- [ ] No `Date.now()`, `Math.random()`, or external IO inside the
      deterministic-key seed of any Command or Event
- [ ] Any new projection has a `rebuildFromEvents` method and a
      `canonicalHash`-style replay assertion in tests
- [ ] Actor decisioning reads only `WorldState(t-1)` (not in-progress
      tick state)
- [ ] Tick advance commits in a single SQLite transaction
- [ ] No unbounded per-tick work (NPC count × area count × event
      count loops without a cap)
- [ ] AI calls are off-path and AI output is treated as advisory

If any box is unchecked, the change does not match this architecture
and must be revised before merging.

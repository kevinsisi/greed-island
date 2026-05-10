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

## 0. Living Deterministic World Contract

This section is the product contract for the world. It is intentionally
stronger than the current implementation in a few areas; those gaps are
listed in [Section 11](#11-current-non-conformance-backlog). Do not
claim full world-law compliance until every gap is closed.

### 0.1 World Essence

The world MUST be:
- Autonomous — it advances without player input.
- Deterministic — equal inputs produce equal outputs.
- Persistent — committed consequences survive restarts.
- Event-defined — committed Events are the only world facts.
- Continuously evolving — pressure and history continue while players
  are offline.

The world is not for the player. The player is one actor inside the
world.

### 0.2 Reality Rule

Only a committed Event is real. Anything that has not been validated by
the Rule Engine and written to EventLog is not a world fact.

### 0.3 Time Rule

World logic MUST use Simulation Tick. Deterministic logic may depend
only on:
- `tick`
- EventLog
- `rulesetVersion`
- `WorldConfig`

Deterministic logic MUST NOT depend on:
- `Date.now()`
- wall-clock time
- FPS
- network latency
- AI response timing
- runtime scheduling timing

Wall-clock fields are allowed only as audit metadata outside
deterministic seeds and rule decisions.

### 0.4 Command Rule

Every input is a Command: intent, not fact, not State, not Reality. A
Command can succeed, fail, or be rejected. Rejected Commands produce no
world Events.

### 0.5 Rule Engine Rule

The Rule Engine is the only compiler from intent to world fact:

```text
Command
↓
Rule Engine
↓
Event or Rejection
```

Only the Rule Engine may validate behavior, resolve conflicts, and
produce Events. No system may bypass it.

### 0.6 Actor Rule

All actors emit Commands only:
- players
- NPCs
- world systems
- weather systems
- card systems
- faction systems
- combat systems

Runtime components MUST NOT directly mutate WorldState, directly append
world Events, or bypass EventLog. All world changes flow through:

```text
Command → Rule Engine → Event
```

### 0.7 Event Rule

Events MUST be immutable, append-only, globally ordered, replayable,
and deterministic. EventLog is the only source of world truth.

### 0.8 WorldState And Reducer Rule

`WorldState = Reduce(EventLog)`.

WorldState is a projection: rebuildable, non-authoritative, and not a
permanent truth store. Reducers MUST be pure deterministic functions
with no side effects. Reducers may depend only on previous State and
committed Events. Reducers MUST NOT depend on real time, random values,
AI output, or network timing.

### 0.9 Tick Atomicity And Causality

Every tick is atomic. During tick execution, no actor or client may see
intermediate State, partial results, same-tick Events, same-tick
Commands, or an unfinished tick. Actors observe only `WorldState(t-1)`.

### 0.10 World Evolution And Offline Continuity

The world MUST continue evolving even when there are no players,
clients, rendering, or AI narration. World pressure systems should keep
producing changes such as faction expansion, economy shifts, resource
decay, weather hazards, social instability, and territorial conflict.

Players returning after absence should see historical continuity through
`lastSeenTick`, world summaries, historical recaps, and persistent map /
NPC / faction / economy changes.

### 0.11 NPC Rule

NPCs are autonomous deterministic agents. They must have schedules,
goals, world reactions, and continued participation in world evolution.
NPCs emit Commands only; they never produce Events directly. NPC state
must be derived from EventLog and must not live only in hidden mutable
runtime memory.

NPC presence is globally unique. At any tick an NPC may have only one
authoritative visible presence tuple: tile, optional building,
sub-position, activity, optional travel route, and future intent.
Interior building views, area scenes, and hub map views must derive from
that same tuple; no projection may render a second copy of the same NPC
in another place. A moving NPC is represented by `activity = move` plus a
`travelRoute` segment and is not a local outdoor Area occupant until the
route clears on arrival.

NPC duty is a movement weight, not a permanent identity prison. Priests,
merchants, craftsmen, guards, and civic NPCs may cross districts for
errands, food, rest, patrols, social visits, events, or memory-driven
intent unless a specific story rule declares that actor immobile.

### 0.12 Card And Combat Rule

Cards are World Rule Operators. Playing, spawning, storing, trading, or
materializing a card must produce Commands and resolve deterministically
through the Rule Engine. Cards must not directly modify State or append
Events.

Combat is deterministic world interaction, not an isolated minigame.
Combat actions are Commands; combat results are Events; combat resolves
through tick/rule evaluation and leaves persistent world history.

### 0.13 AI Boundary Rule

AI is an Observer, Narrator, and Atmosphere Generator. AI may describe
committed events, generate dialog, summarize history, and render scene
atmosphere. AI MUST NOT modify State, produce Events, influence rules,
or affect determinism. AI is never simulation authority.

### 0.14 Replay And Advance Determinism

Replay determinism guarantee:
- Same EventLog
- Same tick sequence
- Same `rulesetVersion`
- Same `WorldConfig`
- Therefore exactly the same WorldState

Advance determinism guarantee:
- Same EventLog
- Same pending Commands
- Same tick
- Same `rulesetVersion`
- Same `WorldConfig`
- Therefore exactly the same next Events

### 0.15 Simulation Budget Rule

Simulation MUST be limitable via NPC partitioning, regional activation,
event density controls, command rate limits, and tick scalability.
Budget controls are part of correctness: an exploding simulation loop is
not a living world; it is a failure mode.

### 0.16 Rendering Separation Rule

Rendering is a projection. FPS drops, rendering stalls, and client
disconnects MUST NOT affect simulation correctness. Graphics never own
truth.

### 0.17 Civilization Evolution Rule

The long-term world target is Autonomous Civilization Evolution. NPCs
are not decorative residents; they are producers, builders, learners,
explorers, and social participants. The world MUST be able to evolve
without developer-placed scripts as the only driver.

Civilization evolution MUST flow through the same kernel law:

```text
Command → Rule Engine → Civilization Events → WorldState Projection
```

The world map is a Civilization Projection, not a static scene. Future
systems MUST model construction, expansion, resource cycles, production,
settlement growth/decline, faction conflict, culture, skills, and
emergent history as committed Events and replayable projections.

Persistent world objects such as buildings, roads, bridges, farms,
markets, defenses, settlements, and cities MUST be buildable,
upgradeable, damageable, abandonable, repairable, and capturable through
world Events. Static catalog placement is acceptable only as bootstrap
world config, not as the sole source of future history.

NPC society MUST eventually include groups, settlements, factions,
commerce, households, cooperation, rivalry, and remembered relationships.
NPC skills MUST derive from accumulated work, training, observation,
exploration, and social interaction history, not from arbitrary mutable
scalars.

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
- The world's canonical display timezone is `GMT+8`. Timezone labels
  are presentation/config metadata; deterministic simulation authority
  remains the integer tick plus EventLog order.

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

---

## 11. Current Non-Conformance Backlog

Do not claim the current implementation fully guarantees the Living
Deterministic World Contract until this backlog is empty. These are
known gaps discovered during the v0.15.4 audit.

### 11.1 Card Drop Randomness — Addressed In v0.15.5

`packages/server/src/http/cardDropEngine.ts` no longer uses
`Math.random()` for spawn checks, card selection, or spawn coordinates.
Card-drop rolls are deterministic hash-based rolls seeded by tick, tile
id, roll purpose, ruleset version, catalog version, weather, rare-window
state, and engine phase. Replay tests cover normal tick drops and
boot-time seed drops. This item is no longer a current non-conformance,
but card state remains transitional under §11.2 until it is unified with
canonical `event_log` or formally specified as an equivalent sub-log.

### 11.2 Card State Has A Separate Event Log

The card pipeline writes to `card_action_log` and mutates
`world_card_drops` / codex tables in the same transaction. It is durable
and command-shaped, but it is not yet unified with the canonical
simulation `event_log`, so card state is not fully covered by
`WorldState = Reduce(EventLog)`. Either fold card events into the
canonical EventLog or explicitly model card_action_log as a replayed
sub-event-log with equivalent guarantees and tests.

### 11.3 Jobs And Wallet Are Direct Projection Mutations

Building work/rest, technique purchases, and combat defeat energy
effects mutate `PlayerJobsStore` / wallet rows directly. These are
currently durable gameplay projections, not committed world Events.
Player jobs, wages, energy loss/restoration, and purchases must become
Commands that resolve into Events before the world can claim full
Reality Rule compliance.

### 11.4 Combat Store Side Effects Are Not Fully Event-Sourced

Combat initiate/action/resolve submit living-world Commands, but the
combat session/log store and some defeat side effects are still updated
directly. Combat state and persistent consequences need to be fully
replayable from committed combat/world Events.

### 11.5 FACT_SET Snapshot Path Is Transitional

The runtime still commits `FACT_SET` state snapshots for NPC state,
area state, building occupants, weather, season, rare windows, and
active events. These snapshots are routed through a kernel command and
are replayable, but the target architecture is typed domain Events with
pure reducers. New features should prefer typed Events and should not
add additional long-lived `FACT_SET` domains.

### 11.6 Simulation Budget Is Specified But Not Enforced

Section 7 defines command caps, NPC partitioning, regional activation,
and event-density controls, but the current runtime does not enforce all
of them. Full autonomy at larger scale requires bounded per-tick work.

### 11.7 Projection Rebuild Contract Is Incomplete

The architecture requires projections to expose rebuild-from-events
paths. Some projection-like stores are still operational tables without
formal rebuild tests. Add rebuild and canonical-hash assertions for each
world-facing projection before treating it as guaranteed.

### 11.8 Civilization Evolution Is Not Implemented Yet

Section 0.17 defines the intended civilization target, but the current
implementation does not yet have Commands/Events/reducers for
construction, production chains, resource transport, settlement
formation, map mutation, faction war, household formation, or skill
learning. These must be implemented as incremental OpenSpec changes with
deterministic replay tests before claiming autonomous civilization
evolution.

### 11.9 NPC Personal Dialog Is Not Fully Grounded In Memory

NPC memory and relationship projections exist for living-world events,
but private player dialog is still only partially grounded. NPC replies
do not yet query a full known-person graph, alias memory, household
state, faction knowledge, or long-term social history before answering.
Until that grounding exists, AI dialog must be guarded by deterministic
anti-hallucination checks and must avoid inventing unknown people,
relationships, or world facts.

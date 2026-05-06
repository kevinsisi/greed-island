## Context

The simulation kernel defines Commands as intent, Events as truth, WorldState as projection, and AI as a read-only renderer. The next layer is a living deterministic runtime where the world advances by simulation ticks and autonomous actors produce commands even when players are idle.

This change depends on the `simulation-kernel` capability. It must preserve the kernel law that only the Rule Engine can compile intent into facts.

## Goals / Non-Goals

**Goals:**
- Define Tick as simulation time rather than wall-clock time.
- Define causal continuity so every actor observes only `WorldState(t-1)` while producing commands for tick `t`.
- Define tick atomicity so same-tick partial state is never visible to actors.
- Define NPCs as deterministic command generators with derived internal state.
- Define world rules as deterministic system-command generators.
- Define deterministic command batch construction and resolution.
- Define tick closure as one final committed world transition per tick.
- Ensure AI snapshot generation is asynchronous, read-only, and non-authoritative.

**Non-Goals:**
- No full card system or complete gameplay mechanics.
- No full multiplayer UX, client interaction design, or WebSocket topology.
- No horizontal scaling or distributed sequencer.
- No production scheduling infrastructure beyond the deterministic tick contract.
- No advanced Gemini prompt-injection sandboxing beyond the read-only boundary.

## Decisions

### Decision: Tick number is simulation time

Real time may wake the runtime, but rules must only use tick number, EventLog, WorldState projection, world config, and ruleset version. Runtime latency and wall-clock timestamps must not affect simulation outcomes.

Alternative considered: use wall-clock time to drive rules directly. This was rejected because replay would differ by server timing and latency.

### Decision: Every tick observes a frozen base state

At tick `t`, the runtime first derives `WorldState(t-1)` and freezes it as the observation snapshot for all world rules, NPCs, and player commands assigned to the tick. Same-tick commands and events are not visible to any actor during command generation.

Alternative considered: allow actors to react to earlier same-tick actions. This was rejected because it creates causality leaks and implicit ordering bias.

### Decision: Tick resolution may use a deterministic conflict ledger

Actors cannot observe partial tick results, but the batch resolver still needs deterministic conflict handling. The Rule Engine may resolve an ordered command batch as a pure function over `WorldState(t-1)` plus prior accepted commands/events inside that same resolution call. That internal ledger is not WorldState and is not visible to actors.

Alternative considered: validate every command only against `WorldState(t-1)` with no conflict ledger. This was rejected because conflicting same-tick commands could all succeed incorrectly.

### Decision: NPCs generate commands, not events

NPC policy execution observes the frozen base state and produces NPCCommands. NPCs never bypass the Rule Engine and never append Events directly.

Alternative considered: allow NPCs to emit Events as autonomous agents. This was rejected because it creates a second truth compiler outside Rule Engine authority.

### Decision: World rules generate system commands, not events

World autonomy is represented as deterministic SystemCommands generated from world rules. SystemCommands pass through the same Rule Engine as player and NPC commands.

Alternative considered: allow WorldRule to directly emit Events. This was rejected because it grants system rules a privileged bypass path.

### Decision: Stable pending command set per tick

Player commands assigned to tick `t` must be captured before tick resolution begins. Player commands arriving during tick resolution are assigned to a later tick and cannot affect the in-progress tick.

Alternative considered: include late commands while a tick is resolving. This was rejected because it makes results depend on runtime latency and scheduler timing.

### Decision: Deterministic phase and command ordering

Command generation and resolution use fixed actor classes and deterministic sort keys. The default phase order is system, NPC, then player. Within each phase, ordering must use stable deterministic keys such as actor identity and command deterministic key.

Alternative considered: process commands by arrival order. This was rejected because arrival order is not reproducible across environments.

### Decision: AI snapshot is produced after tick commit

AI observes only the committed result of a tick through a read-only snapshot. AI narration runs asynchronously and cannot block or influence future ticks.

Alternative considered: generate AI narration during tick resolution. This was rejected because AI latency and failure would become part of simulation behavior.

## Runtime Flow

```text
TICK t
│
├─ 1. Reduce EventLog → WorldState(t-1)
├─ 2. Freeze WorldState(t-1) as tick observation snapshot
├─ 3. Generate SystemCommands from world rules
├─ 4. Generate NPCCommands from NPC policies
├─ 5. Collect PlayerCommands assigned before tick cutoff
├─ 6. Build deterministic command batch
├─ 7. Resolve batch through Rule Engine
├─ 8. Append accepted Events with global sequence and tick metadata
├─ 9. Record rejections outside EventLog when audit is enabled
├─ 10. Reduce EventLog → WorldState(t)
└─ 11. Emit read-only AI snapshot asynchronously
```

## Risks / Trade-offs

- Same-tick effects are delayed until the next tick for actor observation → preserves causality and removes partial-state leaks.
- Phase order creates explicit initiative bias → acceptable only because it is documented and deterministic.
- Conflict handling inside batch resolution can look like mutation → keep it as a pure internal resolution ledger, never as visible WorldState.
- Long-running AI narration may lag behind world ticks → narration is a view layer and must not block simulation.
- NPC behavior can become complex quickly → first runtime should keep NPC policy interfaces deterministic and testable before adding rich behavior.

## Migration Plan

No production migration is expected. This change should be implemented only after the simulation kernel artifacts and deterministic replay tests exist.

## Open Questions

- What default tick duration should the prototype use for local runtime, knowing it must not affect simulation semantics?
- Should NPC policies be implemented as code-only deterministic policies first, or data-driven rule tables from the start?
- Should player command tick assignment happen at HTTP intake, command queue intake, or inside the tick runner for the first prototype?

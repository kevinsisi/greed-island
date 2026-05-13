# Proposal — Simulation Budget Enforcement

## Why

`ARCHITECTURE.md` §7 specifies a simulation budget (command cap, NPC partitioning, regional activation, projection batch limits) but **none of it is enforced today** (§11.6). The runtime currently runs `runTick()` over all 50 NPCs every 5 s without any ceiling. Once Layer 3 settlement + Layer 2.5 ecosystem grow population to hundreds of NPCs and thousands of animals, per-tick work will explode and the loop will miss its 5 s cadence.

`docs/WORLD_CAPABILITIES.md` §33.1 (Phase 1 budget gate) is the prerequisite for every subsequent phase — without bounded per-tick work, every new layer compounds the load.

## What Changes

Umbrella change covering four sub-deliverables. Each ships as a separate release-sized slice; this change stays open across the slices and archives only when all four are done.

1. **Command cap observability + warning** (this slice) — track per-tick command count, expose on `/api/dashboard`, warn (no rejection yet) if over a soft cap.
2. **Command cap enforcement** — deterministic overflow handling (sort by canonical key, slice first N, log overflow to `rejected_command_log` with reason `COMMAND_CAP_EXCEEDED`).
3. **NPC partitioning** — active set vs background set per tick; background NPCs run cheap policy only.
4. **Regional activation** — tiles with no player presence and no flagged world rule run low-frequency drift only.

Closes `ARCHITECTURE.md` §11.6.

## Capabilities

### Modified Capabilities

- `simulation-kernel`: gains per-tick budget tracking, soft cap, and (in later sub-deliverables) hard cap + partitioning + regional activation rules.

## Impact

- Pure additive observability in slice 1.
- Slices 2–4 may move some NPC work into a cheaper policy path; deterministic replay still must hold (every command and every event is still reproducible from EventLog).
- No new HTTP endpoint; the new fields land on existing `/api/dashboard`.
- `/api/world` snapshot gains `tickCommandStats` field (optional, additive).

## Out Of Scope

- Replacing the tick loop with a different scheduler (still `setInterval` 5 s).
- Moving NPC engine into a worker thread.
- Distributed sequencer.

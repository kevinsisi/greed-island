## Why

The world must not wait for players; it must advance as a deterministic artificial-life simulation with ticks, autonomous actors, and world-generated intent. This change builds on the simulation kernel to make world time, causality, and actor isolation explicit before any runtime prototype is implemented.

## What Changes

- Define Tick as simulation time, separate from wall-clock time and runtime latency.
- Define atomic tick execution where all actors observe only `WorldState(t-1)`.
- Introduce causal continuity constraints that prevent actors from seeing same-tick partial results.
- Define NPCs as deterministic command generators, not chatbots and not direct event emitters.
- Define world rules as deterministic system-command generators, not direct event emitters.
- Require player, NPC, and system commands to pass uniformly through the Rule Engine.
- Define deterministic tick phase ordering and command batch ordering.
- Require AI snapshot generation to be read-only, asynchronous, and non-authoritative.
- Add advance-determinism validation for tick execution.

## Capabilities

### New Capabilities
- `living-world-runtime`: Deterministic tick runtime, causal continuity, NPC/system command generation, atomic tick closure, and advance-determinism guarantees.

### Modified Capabilities
- None.

## Impact

- Depends on the `simulation-kernel` capability from `add-deterministic-simulation-kernel`.
- Affects future backend runtime orchestration, tick scheduling, NPC policy execution, world-rule evaluation, command batching, and AI snapshot pipeline.
- Does not include full card mechanics, full multiplayer UX, horizontal scaling, distributed sequencer, production WebSocket topology, or advanced Gemini prompt hardening beyond the read-only boundary.

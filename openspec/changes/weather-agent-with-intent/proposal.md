## Why

Weather currently behaves like a deterministic background cycle: it changes the world fact, but it does not feel like a living actor with pressure, preference, memory, or mood. The user explicitly wants weather to be an agent with its own thoughts while preserving Greed Island's event-sourced, deterministic world laws.

## What Changes

- Introduce a weather-agent actor that observes committed world state and forms bounded weather intent before weather changes are resolved.
- Add weather thought/intent records so players can perceive why the sky is shifting without making AI or renderer text authoritative.
- Route weather outcomes through typed Commands, Rule Engine validation, committed Events, and projection updates.
- Keep weather deterministic and replayable: the same EventLog, tick, ruleset, and world config must produce the same weather-agent intent and accepted weather outcome.
- Allow weather intent to influence existing weather, world-event, ecosystem, and civilization pressure only through server-defined action kinds and validators.
- Surface weather mood/thoughts in chronicle/timeline/world APIs as projection data derived from committed Events.

## Capabilities

### New Capabilities

- `weather-agent-intent`: Defines weather as a bounded system actor with identity, thoughts, intent commands, validated outcomes, and projected player-visible mood.

### Modified Capabilities

- `living-deterministic-world`: Weather remains part of the living-world command catalog, but the weather source changes from a simple cadence-only runtime choice to a weather-agent intent path that is still deterministic and Rule Engine mediated.

## Impact

- **Server kernel**: living-world command/event catalog, Rule Engine payload validation, reducer/projection for weather thoughts and accepted weather intent.
- **Simulation runtime**: replace or wrap cadence-only weather selection with a deterministic weather-agent policy that emits Commands, not Events.
- **Chronicle/timeline/API**: expose committed weather thought/outcome history without letting narration invent weather facts.
- **Tests**: deterministic replay, command validation, projection rebuild, and chronicle/API surfacing tests.
- **No breaking changes**: existing weather strings and `/api/world` weather field remain available; new weather-agent fields are additive.

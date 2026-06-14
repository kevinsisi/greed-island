## Context

Greed Island already treats weather as a living-world fact projected from committed events. The current runtime cadence can change weather, and other systems can read weather for card drops, ecology, civilization pressure, and UI VFX. What is missing is agency: weather has no persistent identity, no bounded intent, and no explainable mood beyond the final weather string.

The design must preserve the project laws: weather is an actor that emits Commands; the Rule Engine is the only compiler from intent to Events; WorldState remains a projection; AI narration is read-only and cannot decide weather facts.

## Goals / Non-Goals

**Goals:**

- Model weather as a deterministic system actor with identity, mood, pressure, and recent thought history.
- Produce weather intent before weather outcomes, so the world can expose why weather is shifting.
- Keep all weather outcomes replayable from EventLog, tick, ruleset version, and world config.
- Make weather intent affect existing systems only through bounded, validated command payloads.
- Add player-visible weather thoughts to chronicle/timeline/world surfaces as committed projection data.

**Non-Goals:**

- No LLM decides or commits weather outcomes.
- No hidden mutable weather memory outside EventLog-derived projection.
- No breaking change to the existing `weather` field in `/api/world`.
- No new weather simulation model that replaces ecology/civilization pressure systems in this change.

## Decisions

1. Weather agent is a system actor, not an NPC.

   Rationale: weather has identity and intent, but not location, inventory, HP, household, or dialogue permissions. It should use `actorType: 'system'` and stable actor id `weather.agent` rather than being forced into NPC projection tables.

   Alternative considered: create an invisible NPC. Rejected because it would pollute NPC lifecycle rules, death filters, relationship projections, and UI lists.

2. Weather thoughts are committed events, not renderer-only text.

   Rationale: the user wants weather to have its own thoughts. If thoughts are only generated in the client or chronicle renderer, they are not world history and cannot be replayed or cited consistently. A `WEATHER_INTENT_PROPOSED` event records the deterministic thought, mood, pressure source, desired weather, and reason.

   Alternative considered: let chronicle infer weather thoughts from `WEATHER_CHANGE`. Rejected because that would make thoughts non-authoritative narration rather than committed world history.

3. Weather outcomes use existing `WEATHER_CHANGE` where possible.

   Rationale: downstream systems already project weather from `WEATHER_CHANGE`. The new intent event should explain and steer, while the accepted outcome remains compatible with existing reducers and APIs.

   Alternative considered: replace `WEATHER_CHANGE` with a new outcome event. Rejected for v0.92 scope because it would increase migration and UI surface risk without adding needed behavior.

4. Policy is deterministic and bounded.

   Rationale: the same EventLog must replay to the same weather thoughts and outcomes. The policy should derive mood/intent from prior weather, season, recent area/ecology/civilization pressure, active world events, tick, ruleset version, and stable config. Any randomization must use existing deterministic seed material.

   Alternative considered: ask the AI provider for weather intent. Rejected because provider latency/content would affect simulation authority. AI may later render the committed thought in richer prose, but cannot choose the weather.

5. Weather intent can be rejected.

   Rationale: treating intent as a Command means invalid weather ids, too-frequent changes, unsafe pressure escalation, or incompatible active world events can be rejected without state mutation. Rejections should still be observable in debug/admin evidence when useful, but only accepted Events affect player-visible weather.

## Risks / Trade-offs

- [Risk] Weather thoughts become repetitive deterministic flavor text. -> Mitigation: derive thought templates from mood, pressure source, prior weather, and active world events; add tests for varied seeded output across distinct contexts.
- [Risk] Weather agency accidentally becomes hidden mutable state. -> Mitigation: rebuild the weather-agent projection entirely from `WEATHER_INTENT_PROPOSED` and `WEATHER_CHANGE` events.
- [Risk] Weather intent increases tick event volume. -> Mitigation: keep intent cadence bounded and avoid emitting no-op thoughts every tick unless state changed or cadence elapsed.
- [Risk] Downstream systems start trusting uncommitted intent. -> Mitigation: only committed `WEATHER_CHANGE` affects weather-sensitive systems; intent is explanatory unless a validator accepts a resulting outcome.

## Migration Plan

- Add command/event payload types and reducer support behind additive fields.
- Introduce the weather-agent projection with default mood/thoughts derived from existing weather when no intent events exist.
- Wrap the existing cadence logic so it submits weather-agent intent commands before `WEATHER_CHANGE` commands.
- Keep `/api/world.weather` unchanged and add weather-agent metadata as optional projection data.
- Rollback by disabling the weather-agent policy path and falling back to existing cadence-based `WEATHER_CHANGE` emission; existing intent events remain harmless historical records.

## Open Questions

- Should player cards eventually be able to influence weather-agent mood through validated world-rule operators?
- How much of the weather-agent thought should be public versus admin/debug-only when the thought reveals hidden pressure sources?

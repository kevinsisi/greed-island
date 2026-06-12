## Context

The current NPC agent is safe but thin. `buildAgentOptions()` converts deterministic intent stack entries into a numbered menu. The prompt contains needs and context, but the only durable result is `NPC_AGENT_DECISION`, which sets or clears an intent override. The result looks like smarter movement, not human agency.

The desired model is:

```text
NPC persona + needs + memories + world context
        -> AI freeform action proposal
        -> server resolver: classify + validate + normalize
        -> Rule Engine command/event
        -> runtime applies only legal deterministic consequences
```

## Decisions

### Decision 1 — AI proposes; server resolves

The AI response may be creative, but the server stores both raw proposal and normalized resolution. The normalized action is the only part runtime may act on.

### Decision 2 — Start with a bounded action taxonomy

Supported actions in this slice:

- `travel`: go to a valid tile.
- `work`: pursue local productive work on a valid tile.
- `rest`: seek rest/safety on a valid tile.
- `socialize`: seek a living target NPC or social tile.
- `buy_card`: go to the market/dock commerce route to pursue a card purchase.
- `challenge_combat`: challenge a living target NPC or prepare for combat on a valid tile.
- `spread_rumor`: voice a rumor-like social action as narration only.
- `custom_social_scene`: record a creative but non-mutating social intention as narration.

Anything outside this set is rejected as an invalid proposal, not executed.

### Decision 3 — Rejections are first-class but safe

Rejected proposals may be appended as `NPC_FREEFORM_ACTION_PROPOSED` with `accepted=false` for observability. They do not set movement overrides or mutate world state. This lets us inspect what agents wanted without trusting them.

### Decision 4 — First implementation uses existing runtime steering

Accepted proposals initially steer NPCs through `NpcEngine.setIntentOverride()` and narration. This keeps the change small and prevents inventing many new world mutation paths at once. Later changes can map action kinds to richer task-specific commands.

### Decision 5 — Prompt must expose persona difference

The prompt must include a compact persona sheet: role, faction, personality weights, needs, life goal, beliefs, reflections, current tile, and known constraints. The AI should be told to act from that personhood, not to optimize the simulation.

## Risks

- **Event volume**: rejected proposals still write events. Mitigation: cadence remains staggered and no proposal is requested when the NPC lacks useful context; future task can add a per-minute global agent budget.
- **Prompt injection / invalid JSON**: parser accepts only strict JSON object after extraction and resolver whitelists action kinds/targets.
- **AI hallucinated names/tiles**: resolver rejects unknown tile IDs and unknown/deceased NPC targets.
- **Meaningful action depth**: first slice records intention and steering, not full multi-step execution. This is deliberate to keep architecture safe.

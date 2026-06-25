# NPC Cognitive Runtime Design

## Model

Each NPC runs the same bounded cognitive pipeline:

```text
Observe committed events/projections
→ recall memory + beliefs + life pressures
→ derive cognitive profile from personality
→ score candidate intents
→ submit NPC_AGENT_DECISION command
→ Rule Engine commits event or rejects
→ projection/API exposes current thought
```

The cognitive runtime is not a god-mode LLM. It is deterministic TypeScript over committed projections. Optional AI reflection may produce prose or candidate preference changes later, but validators must convert those into typed events before they affect the world.

## Cognitive Profile

`deriveNpcCognitiveProfile` reads:

- `profile.personality`: greed, patience, safetyWeight, economyWeight, factionLoyalty, talkativeness, archetype, etc.
- top memories from `SqliteNpcMemoryStore` context / urgency boost.
- belief count / emotional tags from `BeliefProjection`.
- current life needs and life goal.

It outputs bounded, deterministic multipliers:

- `survivalBias`
- `economicBias`
- `socialBias`
- `ecosystemBias`
- `patienceBias`
- `dominantTrait`
- `thoughtZh` / `thoughtEn`

These are used only to score candidate intents and produce observable reasoning strings.

## Planning Integration

`planNpcAutonomousDecision` accepts optional `cognitive` input. It uses the biases to adjust candidate urgency before ranking. The selected decision includes a cognitive trace in `reason`/`narration` and can be exposed as `cognitiveLine` in `/api/npcs`.

## Determinism

The same profile, memories, beliefs, life state, tile scores, tick, and ruleset must produce byte-identical decisions. No wall clock, random, network, or AI provider result may influence deterministic planning.

## Public Surface

`ServerNpc.cognitiveLine` is additive:

```ts
cognitiveLine?: { zh: string; en: string }
```

Area/Hub UI may show it alongside current intent/speech. Existing clients ignore it safely.

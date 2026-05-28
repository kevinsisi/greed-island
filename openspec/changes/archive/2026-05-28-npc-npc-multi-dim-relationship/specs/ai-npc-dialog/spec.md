# ai-npc-dialog Delta

## ADDED Requirements

### Requirement: AiDialogContext SHALL include relationship dimension directives per known NPC
For each NPC `target` the speaking NPC `self` has a row with in `npc_relationships`, the dialog context MUST include a `relationshipDirectives` field: an ordered list of natural-language directives derived from the `dimensions(self→target)` vector. Directives are added only when a dimension is at an extreme (≥70 or ≤30) following these rules:

| Dimension | Extreme | Directive (zh / en) |
|---|---|---|
| `fear ≥ 70` | high | `你恐懼他/她` / `you fear them` |
| `respect ≥ 70` | high | `你欽佩他/她` / `you admire them` |
| `attraction ≥ 70` | high | `你深受他/她吸引` / `you are drawn to them` |
| `loyalty ≥ 70` | high | `你忠於他/她` / `you are loyal to them` |
| `resentment ≥ 60` | high | `你怨恨他/她` / `you resent them` |
| `dependency ≥ 70` | high | `你依賴他/她` / `you depend on them` |
| `familiarity ≥ 70` | high | `你和他/她很熟` / `you know them well` |
| `familiarity ≤ 20` | low | `你和他/她不熟` / `you barely know them` |

#### Scenario: High fear emits fear directive
- **GIVEN** `dimensions(alice→bob).fear = 75`
- **WHEN** AiDialogContext for `alice` is built and `bob` is in scope
- **THEN** `relationshipDirectives['bob']` MUST contain the string `'你恐懼他/她'` (or `'you fear them'` for English locale)

#### Scenario: No directives when all dimensions are mid-range
- **GIVEN** `dimensions(alice→bob)` at defaults (50 everywhere, familiarity=40)
- **WHEN** AiDialogContext is built
- **THEN** `relationshipDirectives['bob']` MUST be either omitted or be an empty array

### Requirement: formatRelationshipContext SHALL emit directives into the rendered system prompt

`formatRelationshipContext(context: AiDialogContext): string` MUST render a section like:

```
你對 {targetName} 的關係 ({relationshipType}):
- {directive 1}
- {directive 2}
...
```

— one block per known target with at least one directive or with a non-`neutral` relationship type. Targets with `neutral` type and no extreme dimensions MAY be omitted to keep prompt size bounded.

#### Scenario: Rendered prompt includes the directive block for non-neutral targets
- **GIVEN** `relationship_type = 'feared'` and directives `['你恐懼他']`
- **WHEN** `formatRelationshipContext` runs
- **THEN** the output MUST contain `'你對 {name} 的關係 (feared)'` (or localized equivalent) followed by `'- 你恐懼他'`

#### Scenario: Neutral target with no directives is omitted
- **WHEN** a target has type `'neutral'` and no extreme dimensions
- **THEN** that target SHOULD NOT appear in the rendered output (size optimization)

### Requirement: Anti-hallucination guard SHALL permit AI to mention any of the directive emotions
The dialog guardrail MUST NOT reject AI output that uses words like 「恐懼」「欽佩」「怨恨」「依賴」when those emotions are present in the speaking NPC's `relationshipDirectives`. The guardrail MUST continue to reject:

- emotions toward a target not in the NPC's known-relationship graph (hallucinated relationships)
- emotions whose intensity contradicts the dimension vector (e.g., the NPC says "I deeply love them" when attraction is 30)

#### Scenario: AI may say "I fear them" when fear ≥ 70
- **GIVEN** `dimensions(alice→bob).fear = 80`
- **WHEN** AI generates a reply for alice containing 「我害怕他」or 「我有點怕他」
- **THEN** the guardrail MUST accept the reply

#### Scenario: AI may not invent fear toward unknown NPC
- **GIVEN** no relationship row exists between alice and an unknown id `charlie`
- **WHEN** AI generates a reply for alice mentioning 「我恐懼 charlie」
- **THEN** the guardrail MUST reject the reply

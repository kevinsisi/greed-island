## ADDED Requirements

### Requirement: AiDialogContext accepts optional skillLevels field

`AiDialogContext` SHALL include an optional field `skillLevels?: readonly { skillId: string; level: number }[]`. When present, `buildSystemPrompt()` SHALL inject a skill block before the conversation history section listing the NPC's known skills. When absent or empty, no skill block is injected.

#### Scenario: skill block appears when skillLevels is populated

- **WHEN** `buildSystemPrompt()` is called with `skillLevels = [{ skillId: 'hunting', level: 2 }]`
- **THEN** the returned prompt lines include a section naming `hunting` and level `2`

#### Scenario: no skill block when skillLevels is absent

- **WHEN** `buildSystemPrompt()` is called without `skillLevels`
- **THEN** no skill-related lines are injected into the prompt

### Requirement: buildSkillBlock is exported from aiDialog.ts

`buildSkillBlock(skills: readonly { skillId: string; level: number }[] | undefined): string[]` SHALL be exported. It SHALL return `[]` when passed `undefined` or an empty array.

#### Scenario: returns non-empty lines for valid skill list

- **WHEN** `buildSkillBlock([{ skillId: 'fishing', level: 1 }])` is called
- **THEN** the result is a non-empty string array containing `'fishing'` and `'1'`

#### Scenario: returns empty array for undefined input

- **WHEN** `buildSkillBlock(undefined)` is called
- **THEN** the result is `[]`

### Requirement: npc.ts handler assembles skillLevels before generateAiReply

The NPC interact handler SHALL call `getNpcSkills(npcId)` on the runtime, map the result to `{ skillId, level }` pairs, and populate `dialogCtx.skillLevels` only when the array is non-empty.

#### Scenario: skillLevels populated for NPC with skill history

- **GIVEN** the runtime returns skill rows for the target NPC
- **WHEN** the handler assembles `AiDialogContext`
- **THEN** `dialogCtx.skillLevels` contains the same skills with their levels

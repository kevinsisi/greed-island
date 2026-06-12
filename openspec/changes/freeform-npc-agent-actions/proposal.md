## Why

v0.89.0 made every NPC an AI agent, but the shipped agent can only choose from a tiny deterministic intent menu (`follow_schedule`, `survival`, `economic`, `social`, `ecosystem`). This preserves safety, but it does not satisfy the desired fantasy: NPCs should be able to invent personal, surprising, human actions based on personality, needs, memory, relationships, cards, and the current world.

The goal is not to let AI mutate state directly. The goal is to let AI freely propose any action, then force that proposal through server-side parsing, legality checks, Rule Engine validation, and append-only events.

## What Changes

- Replace choice-index-only NPC agent output with a freeform structured proposal: intent, action, target, reason, risk posture, expected outcome, fallback utterance.
- Add a server resolver that maps freeform proposals into typed, bounded action kinds: travel, work, rest, socialize, buy_card, challenge_combat, spread_rumor, and custom_social_scene.
- Add `NPC_FREEFORM_ACTION_PROPOSED` as a first-class living-world command/event. The event records the AI's raw proposal, the server-resolved action, accepted/rejected status, and validation reason.
- Runtime applies accepted proposals through existing deterministic state paths: movement intent overrides for travel/social/work/rest/buy-card targets, narration for social scenes/rumors, and no world mutation for rejected proposals.
- Prompt includes an explicit persona sheet derived from profile personality, faction, role, needs, life goal, beliefs, reflections, and current holdings context where available.

## Non-Goals

- No direct AI state mutation: AI cannot grant items, move NPCs, change HP, alter money, or resolve combat.
- No Postgres migration in this change. DB pressure is real, but storage migration should follow write-hygiene and event-shape fixes.
- No unbounded new command catalog. Freeform proposals are accepted only through a small resolver-supported action set.
- No full multi-step task planner yet; this change records one proposed action at a time and maps it to the current runtime steering layer.

## Impact

- **Code**: `packages/server/src/npcs/npcAgent.ts`, `npcAgentRunner.ts`, `kernel/livingWorldCommands.ts`, `sim/runtime.ts`, tests.
- **Tests**: parser/resolver accepts creative valid proposals, rejects invalid targets/actions, and runtime applies accepted travel/social proposals without trusting AI-provided world mutations.
- **Architecture**: Still Command -> Rule Engine -> Event -> Projection. AI is a proposal generator; server remains authority.

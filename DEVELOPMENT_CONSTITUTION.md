# Greed Island Development Constitution

This is the first handoff document for every AI or human developer who
continues Greed Island. Read this before implementation, then read
`ARCHITECTURE.md`, `ROADMAP.md`, and `PROGRESS.md`.

## Prime Directive

Greed Island is not a static game map with AI flavor text. It is a
deterministic living-world simulation whose long-term target is
Autonomous Civilization Evolution.

Every feature must preserve these laws:

- Command is intent.
- Event is fact.
- EventLog is the only source of truth.
- WorldState is projection.
- Rule Engine is compiler.
- AI is a read-only renderer and narrator.
- Rendering is never simulation authority.

## Required Reading Order

Before non-trivial changes, read in this order:

1. `DEVELOPMENT_CONSTITUTION.md` — how to continue the project.
2. `ARCHITECTURE.md` — world laws, current guarantees, and gaps.
3. `ROADMAP.md` — release history and planned versions.
4. `PROGRESS.md` — current handoff state and active blockers.
5. Matching OpenSpec change under `openspec/changes/<id>/` if one exists.
6. Code paths being modified.

Do not rely on chat memory alone. If a rule must survive handoff, write
it into one of these files or an OpenSpec artifact.

## Development Protocol

- For bugs, trace the actual cause before patching symptoms.
- For new systems or non-trivial changes, create or update OpenSpec
  before implementation.
- Prefer the smallest correct implementation slice that improves the
  world law guarantee.
- Every state-changing path must be Command → Rule Engine → Event →
  Projection, or it must be explicitly listed as a non-conformance.
- Every completed code segment must update docs/spec/progress, run the
  concrete build/tests, pass reviewer, commit, push, and track CI/CD.
- Do not claim full living-world compliance while `ARCHITECTURE.md`
  Section 11 has open backlog items.

## Civilization Evolution Constitution

The world must eventually be able to form civilization without players
or developers manually placing every result.

NPCs are:

- Producers.
- Builders.
- Learners.
- Explorers.
- Social participants.

The world must support autonomous:

- Construction.
- Expansion and land use change.
- Settlement formation and decline.
- Resource generation, scarcity, transport, and production chains.
- Market formation and supply chains.
- Faction growth, competition, war, and takeover.
- Skill learning from history.
- Culture, household, cooperation, rivalry, and remembered social ties.
- Emergent history from NPC behavior, world events, resources, factions,
  and player intervention.

All of the above must use deterministic Commands and Events. AI may
describe civilization history, but AI must not invent or commit it.

## NPC Humanity Rule

NPC humanity is not just better prose. It requires grounded projections:

- Memory: what the NPC experienced or heard.
- Relationships: who they know, trust, fear, rival, owe, or love.
- Social context: household, faction, workplace, settlement, and trade
  ties.
- Skills: learned through repeated work, training, conflict, and
  observation.
- Knowledge boundaries: what they do not know must remain unknown.

NPC dialog must query grounded memory/relationship/known-person context
before answering factual questions. Unknown names, aliases, or claims
must produce uncertainty or clarification, never invented facts.

## Handoff Requirements

Before ending a session after code/spec changes:

- Update `PROGRESS.md` with what changed, what passed, what failed, and
  what remains blocked.
- Update `ROADMAP.md` when a version ships or a planned milestone changes.
- Update `ARCHITECTURE.md` when a durable world law or non-conformance
  changes.
- Commit and push unless the user explicitly says not to.
- Record CI/CD run IDs and deployment status in the final handoff.

# Design — Household Shared Economy (Phase 3 §37.4)

## Context

`LifeExpansionState` already tracks households, children, and per-NPC civic gold.
Existing productive and hunting paths credit individual NPC gold. Construction
initiation currently checks only individual gold. The smallest correct next step
is to introduce household-level pooled gold as a projection over typed EventLog
facts, then let selected runtime decisions observe that pool.

## Goals / Non-Goals

**Goals:**

- Track household pooled gold in a replayable projection.
- Contribute deterministic income from household members into the pool.
- Spend household gold through typed events, not direct mutation.
- Provide inheritance event/projection semantics for future `NPC_DECEASED`.

**Non-Goals:**

- Generating NPC death events.
- Full household budgeting, taxes, loans, shops, food consumption, or player UI.
- Replacing individual civic gold; household gold supplements it.
- Complex joint-decision AI. Runtime uses deterministic policy only.

## Decisions

- Keep pooled gold out of `LifeExpansionState` and model it as a dedicated
  projection. Household membership already lives in `LifeExpansionState`; money
  movements become typed EventLog facts.
- Emit contribution events after accepted income events. The source event type
  and source id make causal provenance explicit.
- Start with a named contribution share constant. This avoids magic numbers and
  lets later household policy tune it without changing event semantics.
- Add `HOUSEHOLD_GOLD_SPENT` now even if only a narrow construction path uses it,
  because spending must be auditable before broader joint decisions can exist.
- Add inheritance assignment event now, but do not generate `NPC_DECEASED`. Future
  combat/persistent-consequence slices can emit death, then reuse this projection
  and event shape.

## Risks / Trade-offs

- [Risk] Pooling income may reduce visible individual wealth if modeled as a
  transfer. → First slice records household contribution without subtracting from
  individual civic gold, preserving existing behavior while adding household
  accounting.
- [Risk] Household spend can race with individual spend. → Projection clamps
  spent amount to available household balance and runtime checks available pool
  before emitting spending commands.
- [Risk] Inheritance without death generation looks incomplete. → This is a
  deliberate substrate; OpenSpec marks death generation out of scope.

## Why

v0.98.20 made player↔NPC relationship pressure produce concrete world-law actions, but players still needed those consequences to be visible as live area state, not only as raw event history.

## What Changes

- Detect relationship-driven `NPC_FREEFORM_ACTION_PROPOSED` events in area behavior projection.
- Surface NPC badges for relationship consequences:
  - caution → `⚠️ 戒備玩家`
  - affinity → `🤝 想找玩家聊天`
  - reciprocity → `💰 保留交易機會`
- Reuse existing area map / NPC drawer behavior badge plumbing so the visibility is player-facing without adding hidden state.

## Non-goals

- No new relationship mutation rules.
- No backend schema change.
- No redesign of AreaPage layout.

## Impact

- **Web**: area NPC badges now reflect recent relationship-driven actions.
- **Tests**: area behavior regression tests cover caution, affinity, and reciprocity badges.

## Why

v0.98.27 added new concrete NPC life action kinds (`buy_goods`, `learn`, `invent`), but the player-facing Timeline and area NPC badges did not fully map those kinds. That meant the backend behavior was more specific than the visible UI.

## What Changes

- Timeline motivation labels now translate `buy_goods`, `learn`, and `invent` instead of exposing raw action ids.
- Area NPC behavior badges derive recent freeform life actions from committed `NPC_FREEFORM_ACTION_PROPOSED` events.
- Shopping, learning, invention, rest, work, and build actions now produce matching NPC badges instead of falling back to idle.

## Verification

- RED UI tests first proved raw labels / idle badges.
- GREEN implementation updates Timeline labels and area behavior badges.

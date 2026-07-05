## Why

NPC life actions (`buy_goods`, `learn`, `invent`) were visible, but still too shallow: the Chronicle and badges showed intent while durable world projections did not always gain concrete inventory, skill, or technology consequences from those committed freeform actions.

## What Changes

- Accepted `buy_goods` freeform actions now project into NPC `daily_supplies` inventory.
- Accepted `learn` freeform actions now project into NPC learning XP.
- Accepted `invent` freeform actions now project into world technology evidence.
- Fast/deferred boot projection event filters include freeform actions so consequences survive restart and replay.

## Verification

- RED projection tests first showed no inventory/XP/technology consequence.
- GREEN implementation derives consequences only from accepted committed `NPC_FREEFORM_ACTION_PROPOSED` events.

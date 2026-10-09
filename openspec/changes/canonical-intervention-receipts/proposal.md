# Canonical intervention receipt replies

Correct a source-reproduced mismatch where an identical same-tick intervention
reuses its deterministic receipt but reports a newly computed, uncommitted trust
increment. Preserve one canonical account/world authority and one atomic EventLog
transaction. This supports World Capabilities Part I's command/fact and persistent
NPC relationship laws; it does not expand supported gameplay or claim UI acceptance.

The server persists bounded intervention result fields with new typed receipts.
Matching retries return the original result plus a separately named current relation
snapshot. Historical receipts without a recorded original result remain explicitly
unavailable. Only the server-owned PLAYER_INTERVENE result field is excluded from
duplicate intent comparison; every other field and command retains conflict checks.

Scope is the existing same-tick identical typed intent. IDs already include world
tick, server classification and narration. Cross-tick/differently classified network
retries remain new commands; this proposal adds no client request-ID API.

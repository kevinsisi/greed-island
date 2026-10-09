# One canonical startup

Replace the active server entrypoint with one cookie-auth boundary and one
SimulationRuntime over one explicitly selected canonical SQLite database.
This serves WORLD_CAPABILITIES Part I §§2.1–2.3 and Part IV Phase 0: canonical
events, deterministic projections and one persistent world.

Normal startup must not create a database, initialize identity schema, import
legacy fixtures, promote users, issue credentials or seed provider keys. An
existing unmigrated database must fail its read-only readiness check before
WAL/schema writes. A separate explicit localhost-only job fixture may create
its own fresh temporary database and synthetic identities.

Expose health/version, one unified auth router, one canonical world router
and an authenticated safe map projection. All other legacy APIs stay closed
until a field/privacy/authentication review and adapter are complete.

L390 source configuration remains a candidate. It reuses two existing
containers and the existing loopback web port, requires an owner-selected
existing canonical volume and leaves the legacy multiplayer volume intact.
No live cutover, migration, owner bootstrap or deployment is authorized here.

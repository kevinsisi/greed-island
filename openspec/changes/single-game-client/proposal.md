# Single canonical game client

Replace the existing local-room frontend in place with one canonical account/world client. All entry URLs lead to that client. This is a feature-branch candidate; no production startup, database, migration or deployment is changed here.

This serves WORLD_CAPABILITIES Part I §2 Event Reality and Actor/Command boundaries and the player-civilization integration phase. The renderer receives only committed canonical world snapshots. It never changes positions, resources or account identity itself. Click routes are direction intents and remain subject to the server's geometry and rule engine.

One HttpOnly cookie authenticates /api/auth and /api/world. Authentication responses expose only the profile, never session tokens. Preserve legacy source files and data until the coherent cutover review. No reset or invented resource value represents migration.

World map availability and geometry support are independent. Known locked or unsupported regions stay visible with explicit status. Only supported available region crossings can send transition intents; no claim that all regions or gameplay systems are complete.

# Preserved world/catalog read projections

## Exact active contracts

This source delta restores original public reads `/api/world`, `/npcs`, `/events`, `/cards`, `/world-events`, `/dashboard`, `/events/stream` and `/stream`. Original public access is retained; the previously reviewed session requirement on `/api/map` remains. No account-private data is silently overlaid merely because a browser has a cookie.

- `world`: real tick/lastSequence/eventCount/npcCount/generatedAt, actual worldConfig and command/partition counters. `facts` includes explicit weather/season/rare-window fields, registry-owned active events, public area resource/faction values, committed unlocks/construction and global civilization. Arbitrary facts, provider/NPC-agent diagnostics, NPC rumors, private holder inventories, households, NPC cognitive/life plans and memory are not copied. Other domain detail belongs to its reviewed domain/role router.
- `map`: real width/height, tiles{id,name,x,y,biome,npcIds}, regions{id,name,x,y,biome,available,generated}, current adjacency and edges{fromTileId,toTileId,crossingType,available}. No raw future map fields or private NPC details. Geography does not require an expected account header to synchronize, but it still requires a live cookie session.
- `npcs`: living public display/physical state: id/name/role/location, profile-seed relationshipScore, lastActedTick, activity/mood/health/faction, subCol/subRow/subZ/buildingId/current travelRoute/color/greetLine/deceased. `internalState:{}` is explicit privacy redaction for legacy DTO compatibility. Target plans, intent/cognitive/life/evolution state, account relationship actions and AI utterances are excluded. A supplied expected-account header makes this a private context read: missing cookie401, stale A→B409. It adds ONLY that cookie actor's persisted trust/count/last-interaction. Missing relationship schema is `relationshipProgressReady:false`, with no invented interaction counters.
- `dashboard`: public world/catalog/feed/rare-window/active-event values plus nullable actor-specific fields. Without an asserted actor, cardsOwned/ticksSinceLastVisit/wallet/accountContext are null. With an asserted actor, the same canonical DB supplies that actor's actual codex count, stored last_seen_tick difference and existing wallet. Exact names: cardsOwned:number|null, cardsOwnedReady:boolean, ticksSinceLastVisit:number|null, wallet:{accountId,gold,energy,updatedAt}|null, walletInitialized:boolean, accountContext:number|null. No GET initializes wallet/codex/visit state. Schema absence remains explicit unavailable.
- `cards`: exact authored catalog fields and rule-operator definitions, plus only an existing validated file-backed `imageUrl`. No arbitrary runtime/catalog URL or filesystem path is returned.
- `worldCivilization`: public goal progress/title/domain/id/ticks/completion and technology id/title/domain/ticks/unlocks. Goal rationale and raw evidence event IDs are omitted. `technology.evidenceCount` is the actual persisted evidenceEventIds.length; it is not a guessed zero or reconstructed private list.
- `facts.lifeExpansion.constructionProjects.builderNpcIds`: current committed crew from the same runtime's public construction facade, restricted to known current NPC IDs. No private planning record is substituted.

## Narrative privacy and history

`publicReadModels.ts` owns a literal event-type/field allowlist. The initial reviewed types cover weather/season, rare windows, registry world-event spawn/end, public map/building changes, faction territorial changes and global civilization goals/technology. Numeric/player account actors, private NPC/player dialogue, movement/chat transport records, arbitrary FACT_SET values, unreviewed types and AI-enhanced narration are excluded as whole events. Payloads are reconstructed from named scalar fields; motivations, account authority, private messages and provider keys are never spread or returned. Narration is retained only for reviewed type-owned world generators, not any event merely containing a string.

REST history queries the SAME SqliteEventStore using the positive type filter **before** LIMIT, so high-frequency movement/private events cannot evict relevant public history. SSE emits those same safe persisted initial events, then the same public serializer for runtime event callbacks and world-tick snapshots. It has no world timer: only transport heartbeat, bounded global connections/frame size, slow-client disconnect and idempotent unsubscribe/close. The lifecycle closes this stream with world/Social streams before the DB.

Historical private or unclassified event types remain preserved in the canonical store/archive. They require individual field/role review before becoming a read model; their omission is not deletion, migration or a claim that those feature families are complete.

## Safe public art

`findCardArt(dataDir,id,extension?,includeBytes?)` is read-only, IDs1–100, existing direct `card-images` files only, supported PNG/JPEG/WebP signatures, at most5MiB. It rejects symlink base/directories/files and outside paths. The HTTP reader serves bytes from the already verified NOFOLLOW descriptor, never a later reopened sendFile path. The lookup creates no directories, exposes no arbitrary URL or filesystem path, and never exposes management archives.

The canonical selected DB's parent is the dataDir. The edge whitelist permits only exact known-ID art filenames; unknown IDs/extensions/private/archive filenames remain404. Existing image management is a separate GM/admin router, with bounded reversible archives and a locally authorized parser, not a blanket static filesystem mount.

## Mounted acceptance evidence

- Real Express/AuthService + same-DB EventStore tests verify public values, injected nested privacy canaries, private A→B/revoked/missing-cookie reads, own relationship/codex/last-seen values and unchanged total_changes on GET.
-220 later private/high-frequency records do not crowd out the earlier valid public world event.
- Public SSE uses the same allowlist, excludes injected private callback events and releases runtime subscriptions.
- Known validated art decoration/bytes work; wrong signature, symlink file/base/directory, unknown ID/extension/name/traversal are rejected.
- Normal canonical bootstrap tests exercise these real mounts, same authority/service, import readiness, beacon policy and shutdown.

Local supplemental SQLite-adapter tests and emitting TypeScript checks are source evidence only. Native Node22/better-sqlite3, exact combined browser, Caddy/Docker and L390 host acceptance remain separate required gates. Routing tests use a synthetic Caddy backend and say so; they are proxy/whitelist evidence, not authentication or actual application data. Caddy normalizes/decodes path matchers, so routing fixtures now forward only normalized aliases of reviewed public endpoints while unreviewed private/raw namespaces remain blocked (official reference: https://caddyserver.com/docs/caddyfile/matchers#path). The real Node application may reject a noncanonical raw URI; no public alias is an alternate authentication boundary.

## Separate operator overview

`GET /api/admin/world` is a private GM/admin read. It requires the SAME cookie service and positive safe `X-Greed-Account-Id`: missing cookie401, missing/malformed assertion400, mismatched current actor409, player/agent403. It never changes authority or reads a requested user's state from query/body. Public `/world`, dashboard public-world values and public SSE do not acquire this role-scoped data.

The actual AdminWorldPage consumer list, rather than arbitrary raw facts, is represented by literal typed schemas in the same projection module:

| Fact | Named row fields |
|---|---|
| fisheryDensity | tileId,density,harvestedTotal,collapsed,lastUpdatedTick,lastSequence |
| goodsInventory | goodsId,holderType,holderId,tileId,quantity,lastUpdatedTick,lastSequence; only npc/building/settlement holders |
| logistics.routes | routeId,fromTileId,toTileId,goodsId,open,openedAtTick,closedAtTick,lastSequence |
| logistics.transports | transportId,routeId,goodsId,quantity,carrierNpcId,from/to holder type/id/tile,status,startedAtTick,resolvedAtTick,lossReason,lastSequence; player endpoints excluded |
| productionChains.recipes | recipeId,input/output goodsId/quantity,holderType,holderId,tileId |
| productionChains.processed | recipeId,input/output goodsId/quantityTotal,holderType,holderId,tileId,lastProcessedTick,lastSequence |
| marketPrices | marketId,settlementId,goodsId,supplyQuantity,demandQuantity,priceGold,lastDiscoveredTick,lastSequence |
| settlements | id,tileId,formedAtTick,founderNpcIds,populationNpcIds,storage[{goodsId,quantity}],pressure{food,safety,economy,logistics},stability,status,updatedAtTick |
| migrationRoutes | waveId,speciesId,from/toTileId,migrationType,startedAtTick,count |
| predatorHunger | predatorSpeciesId,tileId,lastKillAtTick |
| animalPopulation | speciesId,tileId,biomeRegion,count,animalIds,lastSpawnedAtTick,lastKilledAtTick |
| extinctionWarnings | speciesId,status,warningTileIds,extinctSince,lastWarningTick |
| ecosystemRegions | tileId,pressureLevel,pollutionLevel,lastPressureRaisedTick,lastRecoveredTick |
| livestockRegistry | animalId,speciesId,role,mountedBy,settlementId,acquiredAtTick |
| activeWorldEvents | worldEventId,eventKind,tileId,linkedAnimalId,speciesId,severity,spawnedAtTick,huntStartedEmitted |
| factionEcologyStances | factionId,ecologyStance |

No NPC cognitive/private dialogue/household/civic/provider diagnostics are needed by this specific page, and none are added. Unknown keys are never spread. Primitive/nullable/enum/string-array shapes are validated. Missing or malformed projections are null, with top-level `operatorOverviewReady:{[factName]:boolean}`; a genuine existing empty array is ready, an absent projection is not. The client must show unavailable for false readiness, rather than converting a public-world absence into zero operator counters.

Actual HTTP tests cover GM access, player403, missing-cookie/context, stale A→B409, current-role demotion, revoked session, source-values/nested-canary whitelist, and explicit absence. The operator client fetch/render contract is a separate local frontend integration delta; it must fetch this endpoint with the displayed current actor, clear stale data on actor/role/revoke changes, and not merge public SSE into private overview state.

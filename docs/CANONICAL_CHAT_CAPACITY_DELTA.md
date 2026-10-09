# Canonical chat and admitted capacity follow-on

This isolated delta follows frozen world candidate0372bca. It changes no frozen source, live database, credentials, production routing, or deployment. It is source/test work pending exact Node22 native CI and coherent root integration.

## Admission and declared capacity

PlayerWorldService.connect enforces50 unique online accounts through per-account connection tokens. Multiple tabs count as one account; closing one tab does not release the account while another remains. The HTTP adapter independently caps4 streams/account and200 total streams.

Actual HTTP uses the queued service facade. Move, transition, and chat require an admitted live world connection both when queued and at the actual100ms flush. Entry remains possible before stream setup. A disconnected caller receives409 WORLD_CONNECTION_REQUIRED; client pauses intents and reconnects while keeping the authenticated profile. A valid cookie alone no longer bypasses gameplay admission.

Other bounds remain unchanged:4 pending commands/account,1,000 globally,100 commands/transaction;4KiB body,128KiB snapshot frame,one newest pending frame while a socket drains,5-second drain deadline. These are source limits, not a claim of measured production capacity or network latency.

The new50-account tests create51 synthetic principal IDs, admit50, reject the51st, accept50 queued movement steps in one transaction, deliver one coalesced publication with50 personalized snapshots, validate extra-tab reference counts/disconnect/reconnect, and reopen a file-backed canonical database without losing any positions or duplicate receipts. The native test measures event/transaction/fanout/serialized bytes with real better-sqlite3 WAL/FULL. It performs no external or production network load; it is not50-browser acceptance. The pure event-fixture companion verifies the declared service behavior locally.

## One public world channel

The user-facing label is「世界聊天」. It is one public world channel across regions, preserving the old single-room audience; each message carries the server-derived canonical sender tile so UI can show its region label. There are no separate room/channel modes.

Intent: `{commandId,type:'chat',payload:{text}}`. The body cannot provide account,tile,display name,position,or resources. Existing expected-account header, Origin, cookie principal, flush authorization, and live admission apply. Text is1–240 characters after trimming, with legacy control-character restrictions. Store and render it as plain escaped text; do not insert HTML.

The typed canonical Event is PLAYER_WORLD_CHAT_POSTED, compiled through LivingWorldRuleEngine and persisted in the same EventLog/transaction as other accepted player intents. Its data is accountId,tileId,text,optional public displayName,postedAtMovementStep,clientCommandId,intentDigest. Display name comes from the same account repository’s public resolver; it is not email or a client claim. Chat never creates a fake movement/position event.

Snapshot adds `messages`, the last100 public world messages: id,accountId,tileId,text,optional displayName,sequence,worldTick,postedAtMovementStep. The separate chat projection restores visible history through typed-before-LIMIT reads and restores each sender’s cooldown from latest-per-actor chat events. The server sub-clock resumes above both movement and chat receipts. The legacy5-sub-step posting limit survives restart, while identical retries return the original ACK without duplicate messages.

Chat and movement facts remain fully durable and are excluded from unrelated NPC cooldown/civilization/narrative history windows before LIMIT. Historical private PLAYER_NPC_DIALOGUE data is never read into public chat. Root startup receives the same AuthService/runtime; there is no second store or identity.

## Exact legacy-state inventory

- Existing canonical accounts, original numeric IDs, NPC relationships, wallets, inventory, personal events and world EventLog remain unchanged.
- Old MP chat is a shared-room public mechanic and is restored as a canonical public-world mechanic. Its historical MP_CHAT rows and source room projection still require reviewed staged import; they are not silently re-emitted into a different audience or mixed with private NPC dialogue.
- Old beacon participation/contributors, collection deadline, completion, awarded player IDs, per-player supplies/rewards, source positions and all raw MP events are explicitly unmapped legacy gameplay semantics. No zeros, gold/items/quests, or NPC mappings are invented. The source-only staged-import task preserves them exactly as private archival records and reports the activation/mapping gates.
- No live source read/transfer, source volume mutation, automatic username-based admin, live privilege grant, or production activation is performed here.

## Verification

Local supplemental Node24/Vitest4 pure/protocol suites are run against this delta; native SQLite/reopen tests must pass exact Node22 CI. Full local typecheck remains blocked by missing existing bcryptjs/jsonwebtoken/types and existing Vitest4 runtimeBudget typing; no authored-file diagnostic is treated as acceptable. No production capacity or latency claim is made from small synthetic timing.

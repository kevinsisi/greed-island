# Canonical NPC/player/combat adapters

Normal composition must mount these exports, with ONE existing runtime, DB-backed
stores, canonical account view, and HttpAuthorization from the existing AuthService:

- createUnifiedNpcRouter({runtime,store,settings,accounts,authConfig,...})
- createUnifiedPlayerSurvivalRouter({runtime,jobs,authConfig})
- createUnifiedPlayerCivilizationRouter({runtime,authConfig})
- createUnifiedCombatRouter({runtime,store,jobs,techniques,db,authConfig})
  Return value has closeStreams(); include it in normal shutdown cleanup.

The older create*Router helper signatures remain available for existing isolated
rule fixtures only. They are not a second startup or an account/session authority.
Do not mount those helpers directly in normal composition.

## NPC preservation and authority

Preserved routes: dialog-hold, local-shout, interact, intervene, greet, personal
history, intent and beliefs. Deterministic identity replies, static fallback,
server-derived trust/cooldown/clamps, personal account-owned transcripts, replayable
world dialog and memory remain. AI-suggested trust is discarded. Diagnostic errors
are generic in canonical responses, without provider details.

Exterior proximity is the existing AreaMapSvg INTERACT_CELLS=2 Chebyshev rule in
authored grid coordinates, through runtime.getPlayerWorldGridPose(). It never
uses client tile/grid coordinates or legacy SocialStore location. Inside a
building, actual NPC occupancy must match the explicit canonical interior identity;
BuildingSvg exposes actual occupants without authored player coordinates/floors.
NPC intervention retains the original outdoors-only two-NPC rule. Personal history
can be read remotely, including deceased NPC history. Greet/intent/beliefs require
nearby living context and are pure reads.

Local-shout ignores body tileId/candidateNpcIds/actor IDs and derives eligible
responders server-side. Dead, transit, other-region, other-building, and out-of-range
NPCs cannot be targeted. Reads and writes require canonical cookie/expected-account
context; writes require Origin. Async property/AI completion reauthorizes before any
subsequent cost/write and rechecks position/NPC life/context and unchanged relation.
One pending NPC mutation/account, 50 globally, 4KiB bodies and 800-character dialogue
keep the adapter bounded. No live AI calls were made during this work.

NPC personal relation/history/memory and the world dialog/intervention fact now use
submitAuthorizedPlayerCommand(), with reauthorization INSIDE the existing EventLog
DB transaction. Wallet cost and PLAYER_ATE use the same seam. A deterministic
existing receipt skips side effects, so duplicate events cannot double-charge.
All participating stores must be constructed with the same DB at composition.
Projections and publication occur only after the real outer transaction commits.

### Intervention retry response contract

`POST /npc/intervene` keeps the original exact-intent deterministic command ID.
The established ID includes the world tick, server-classified `intentClass`, and
generated narration along with the player/NPC pair, region and message. This fixes
same-tick identical typed-intent duplicates only. The API still has no client
request ID: retrying in another tick, or receiving a different AI classification,
can create a new command and apply another intervention. This is not a general
network-retry idempotency guarantee, and the correction does not expand the API.
New `PLAYER_INTERVENE` facts include the server-derived `effects` result in the
committed receipt. Only this typed receipt may differ in its proposed result fields
on retry; account, NPC pair, mode/message, region, narration, tick, command ID and
ruleset still have to match. Caller-supplied `effects` are never used. Every retry
still requires the exact live cookie/account/Origin and canonical NPC context.

- `duplicate` is true when the original receipt was reused and no private effects
  or transcript rows were written again.
- `effectsStatus: "committed-receipt"` means `effects` is the original committed
  command result, including the actual clamped personal trust delta. Repeated calls
  must not display it as a newly applied increment.
- `currentRelations` is a separately labeled current persisted snapshot. Later
  commands may change it without changing the original receipt result. A missing
  persisted relation has `persisted:false` and null numeric values.
- Historical receipts without original result fields return `effects:null` and
  `effectsStatus:"legacy-result-unavailable"`; current relations must never be
  substituted for the unknown original result.

Consumers must handle nullable `effects` and distinguish original result from the
current snapshot. This source-only correction is not normal-UI verification.

## Player needs/actions

GET /player/needs is pure reconciliation, with no seed/collapse/event writes.
POST /player/needs/reconcile explicitly persists lazy seed/reconcile/collapse.
POST /player/eat retains the existing ration price and rules, requires live admitted
context, reads peekWallet without seeding on rejection, and atomically commits cost
with its event. No body actor, target wallet, result state or location is accepted.

GET /world/player-state retains own canonical state. POST /world/player-action
accepts ONLY requests whose existing authoritative projections can verify:

- PLAYER_DISMISSED_NPC: npcId must belong to this player's hiredNpcIds
- PLAYER_LEFT_FACTION: factionId must belong to this player's factionIds
- PLAYER_DEPOSIT_GOODS: exact {goodsId,quantity,settlementId}; positive finite quantity
  must be owned locally by this player; settlement must actually exist on the
  canonical tile; player and tile/tick are server-derived. Event projection conserves
  the owned quantity and adds it to that settlement.

These old outcome types currently have no sufficient dedicated server rule in the
legacy generic endpoint and are rejected with PLAYER_ACTION_NOT_SERVER_VERIFIED:
PLAYER_PICKED_UP_GOODS, PLAYER_TRADED_GOODS, PLAYER_HUNTED_ANIMAL, PLAYER_FISHED,
PLAYER_DOMESTICATED_ANIMAL, PLAYER_PROTECTED_REGION, PLAYER_HIRED_NPC,
PLAYER_SPONSORED_CONSTRUCTION, PLAYER_FOUNDED_SETTLEMENT, PLAYER_CLAIMED_TERRITORY,
PLAYER_JOINED_FACTION, PLAYER_LED_FACTION, PLAYER_PLAYED_CARD. Dedicated owned-card,
technique, building and NPC/combat routes remain independently owned adapters.
This is a feature gap, not permission to invent goods, leadership, territory,
construction or card ownership through arbitrary facts.

## Combat preservation

Preserved private active/session/log/hand/snapshot reads, nearby NPC initiation,
canonical same-tile aggressive animal initiation with original extinction/energy
protection, round actions, owned card plays, cancellation, and private combat SSE.
Initiating NPC combat also requires bounded NPC context; body actors/locations are
ignored. Card targets must be actual actors in the owned combat. Flee remains
available to end one's owned active combat after the opponent disappears/moves.
Cancellation can only remove a queued command owned by the same combat/player.

Phase-C queued plays carry a trusted EPHEMERAL authorizer, never session data in
EventLog. At the actual sub-tick DB transaction the captured cookie account,
expected actor, live admission, combat state/spatial context and card ownership
are revalidated. Expired/revoked/context-changed plays produce a replayable
COMBAT_CARD_PLAY_REJECTED with authorization_expired before damage. A reopened
unexecuted numeric player play lacks a live authorizer and fails closed; NPC
simulation actions retain their existing server-owned semantics. Queue is bounded
at 4/combat and 1000 globally, and fences are cleared on cancellation/resolution/stop.

Combat SSE uses strict cookie + expectedAccountId query, own combat identity,
current token/account/role/status checks at every frame/heartbeat, token-sensitive
revocation, session.invalidated, bounded 4/account and 200/global, 128KiB frames,
slow-client disconnect and closeStreams() cleanup. It is not a world presence store.

## Dependencies, verification and remaining gates

Base is reviewed9a6899b, including cookie01e44ef, world/beacon6de6279+c3b3b39,
staging045ee9b and c1 spatial facades. Exact peekWallet dependency is the approved
property-read candidate's PlayerJobsStore; it is excluded from this owned patch.
No normal mounts, account credentials, remote accounts, live AI, data import,
publication or deployment were changed.

- 139/139 tests passed across 12 native-free pure/source HTTP fixture suites.
  HTTP fixtures explicitly substitute the established authorization seam and AI;
  they are not proof of a real cookie or native SQLite integration.
- Scoped source+test noEmit passes with a validation-only bcryptjs declaration
  and exclusion of the pre-existing runtimeBudget implicit-any test.
- Exact full noEmit is BLOCKED by missing local bcryptjs (3 errors) and pre-existing
  runtimeBudget.test.ts implicit-any from local Vitest dependency drift.
- Two new actual SQLite commit/reopen/rollback tests are present but BLOCKED by
  missing better-sqlite3 native binding. No native assertion was executed here.
- Native SQLite reopen/rollback, real-cookie integration, complete normal-UI E2E,
  and live/deployed behavior remain release gates. Full feature parity is not claimed.

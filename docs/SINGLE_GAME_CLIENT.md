> Superseded routing note: the initial reduced wildcard is not mergeable. See SINGLE_GAME_VIEW_PRESERVATION.md for explicit existing-feature routes under the sole cookie provider.

# Single canonical game client candidate

The existing multiplayer client is replaced in place, with one `/game` entrypoint. Root, old preview/multiplayer URLs and other URLs redirect there. Legacy application source files and all stored account/world data remain untouched. This routing patch must not be enabled in production until the coherent auth/world adapter, migration, preserved-progress and functionality review passes.

## Exact transport

- `/api/auth/me`, `/login`, `/register`: `{ profile }`, with a numeric `accountId`, nullable username/email, own display name and role. Login body `{ identifier, password }`; registration body `{ username, password }`. Logout response `{ ok: true }`.
- Requests use `credentials: include`; SSE uses `withCredentials: true`. No token JSON, Authorization header, localStorage account store or local player position exists in the new client. World commands and logout send X-Greed-Account-Id from the validated displayed profile, as an assertion checked against the authenticating cookie, never as actor authority.
- `/api/world/snapshot`: version 1 canonical snapshot; `/stream` publishes `snapshot` events; `/command` accepts only command ID plus typed enter/move/transition/chat/contribute intent. Contribution has an empty payload.
- Explicit `409 WORLD_ENTRY_REQUIRED` alone permits an enter intent. A concurrent tab's `ALREADY_IN_WORLD` resumes its existing snapshot. Auth, network and unsupported-geometry failures never reset position or create another account.
- Individual ACKs never update state. Global EventLog revision, ephemeral presence revision, movement step and world tick order snapshots. Only reconnect permits sub-clock reset; delayed crossing GET responses cannot roll back a newer stream.

## UI and renderer

The topology map shows known regions, land/water edges, current region and separate unavailable/unsupported status. The renderer rebuilds from server region geometry and cancels old navigation. Players and living outdoor NPCs come from the same-region canonical snapshot. Peer display names are rendered as plain React text, with numeric account fallback; no peer email/role is exposed.

Click routes remain direction impulses validated by the server. Camera, WASD/arrow controls, pointer drag-vs-click, mobile stick, focus/typing guards, blur/visibility cancellation and serialized newest-intent queue are preserved. Crossing pauses and clears queued moves, waits for an in-flight move, and restores only from a fresh snapshot. Obsolete transitions cannot inhibit a reconnected generation.

World chat and the original harbor supplies/rewards/beacon now use canonical server projections. Harbor progress is a required discriminated union: confirmed counters are displayed exactly, while unresolved legacy account associations stay null and explicitly disable contribution. No wallet/item conversion, local counter award, or assumed legacy import is made. The dock beacon visual and same-game contribution panel use the server point/radius, participant list and beacon tick clock. See SINGLE_GAME_BEACON_CLIENT.md for this isolated follow-on delta. Existing API families, complete gameplay parity and migration remain release gates.

## Verification at this checkpoint

- Focused client/protocol/navigation/intent-queue tests pass.
- Strict pure-client TypeScript passes.
- 50 focused tests passed at the current client checkpoint.
- Additional local cross-candidate tests passed using the actual server snapshot constructor, actual eight base regions plus unlocked salt-marsh geometry and all 12 known/locked/frontier map definitions. They are local validation evidence, not a portable repository test.
- Full web/server build and normal browser UI have not been verified in this scoped source environment. Babylon and the actual React Router 6 dependency set are absent. Reused dependencies are Vitest 4.1.1; repository CI pins its own supported dependency versions.
- Independent review and unified fixture browser CI are required before publication. Cross-tab ACCOUNT_CHANGED and missing/invalid ACCOUNT_CONTEXT_REQUIRED failures cancel the old stream/queue/profile and refetch the shared session. A token-free BroadcastChannel also invalidates peer tabs promptly; the server expected-identity check remains the race guard.

## Proposed normal-UI browser gate

Publisher owns the existing E2E harness. Replace legacy room assertions only after the reviewed disposable unified fixture executable is ready, preserving Chrome's enabled sandbox and filtering unsafe SwiftShader defaults.

Use fresh random synthetic signup through the normal form at `/game`; verify original credentials login after logout, one profile/account ID, no `/mp-api` requests, no client credential/position stores, and no leaked tokens. Open two independent browser contexts and verify same-region peers and actual canonical NPC list from snapshots.

Exercise real canvas pointer navigation, obstacle-safe bounded authoritative steps, newest-click retargeting, keyboard cancellation, chat/typing or login input focus protection, pointer cancellation, tab blur and logout/disconnect interruption. Use several reachable ground-click waypoints toward the dock portal, then the map's regular crossing button to t_central; assert the server tile/geometry/NPC projection changes and stale routes are canceled. Return through the ordinary dock crossing. Selecting locked or unsupported regions must not send transition commands. Two tabs sharing one cookie must deduplicate presence; switching account in one must prevent the other from mutating its stale identity.

Proposed fixture startup: `node scripts/unified-browser-fixture.mjs`, loopback port 4179, explicit `UNIFIED_FIXTURE_ALLOWED_ORIGINS=http://127.0.0.1:4178`, `/healthz` ready with unified mode. The fixture uses fresh temporary storage, real canonical services/runtime/catalogs and no pre-entered player or test mutation endpoint. This executable contract is owned by the startup worker and remains pending approval until frozen.

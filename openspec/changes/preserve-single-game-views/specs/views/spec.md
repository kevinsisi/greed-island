## ADDED Requirements

### Requirement: Canonical identity across views
The client SHALL satisfy the following contract:
- One cookie AuthProvider/profile/player stream under all `/game` views; no JWT, auth localStorage or second account store.
- Numeric displayed account context guards mutations, while the cookie/current-role service remains authentication authority.
- Nullable email/username profiles must be represented honestly, without fabricated email addresses.

#### Scenario: A signed-in user opens another game view
- WHEN a signed-in user opens another game view
- THEN the same cookie profile and player stream SHALL remain authoritative, mutations SHALL assert the displayed numeric account, and nullable profile fields SHALL remain nullable

### Requirement: Preserved routes and protected account changes
The client SHALL satisfy the following contract:
- Every historical route maps to its corresponding `/game` view, not a wildcard collapse. Unknown paths remain explicit.
- Profile nickname/avatar/password, role/status management and manual recovery use approved canonical DTOs and server safeguards.
- Accepted password/role changes and identity mismatches invalidate stale sessions/queues/private view caches.

#### Scenario: A user follows a historical route or completes an accepted password or role change
- WHEN a user follows a historical route or completes an accepted password or role change
- THEN the client SHALL resolve the corresponding game view, use canonical safeguarded account DTOs, and invalidate stale sessions, queues and private caches after identity changes

### Requirement: Honest views and server-owned movement
The client SHALL satisfy the following contract:
- Existing read models require reviewed same-runtime data; unavailable families fail visibly without fixtures or fake progress.
- Active detailed maps render server positions and submit bounded direction intents only. They never restore/store player positions or publish client coordinates.

#### Scenario: A detailed map or existing read-model family loads
- WHEN a detailed map or existing read-model family loads
- THEN the view SHALL use reviewed same-runtime data and server positions, fail visibly when unavailable, and submit only bounded direction intents

### Requirement: Public chat and admission loss
The client SHALL satisfy the following contract:
- World chat is one public channel across known regions, bounded to 100 messages/240 characters, rendered as escaped text with canonical sender-region labels; private NPC dialogue never enters it.
- Loss of admission pauses/clears intents and reconnects while retaining the valid account profile.

#### Scenario: A player sends world chat and later loses world admission
- WHEN a player sends world chat and later loses world admission
- THEN chat SHALL remain one bounded escaped public channel with canonical region labels, private NPC dialogue SHALL remain private, and admission loss SHALL clear intents and reconnects while retaining the valid profile

## Release verification
- Pure cookie/route/protocol/navigation/projection regressions, plus existing frontend tests.
- Final exact repository build/typecheck/test and independent review.
- Disposable normal-UI browser gate with enabled sandbox: signup/login, peers/NPCs, chat/focus, same-account dedup, arrival/retarget/cancel, locked regions, crossing, account switch.
- Per-family backend whitelist and real profile/admin/NPC/card/building/social/combat/settings workflow checks before claiming existing functions preserved or merging the reduced route replacement.

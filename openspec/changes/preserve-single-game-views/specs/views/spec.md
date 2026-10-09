## Requirements
- One cookie AuthProvider/profile/player stream under all `/game` views; no JWT, auth localStorage or second account store.
- Numeric displayed account context guards mutations, while the cookie/current-role service remains authentication authority.
- Nullable email/username profiles must be represented honestly, without fabricated email addresses.
- Every historical route maps to its corresponding `/game` view, not a wildcard collapse. Unknown paths remain explicit.
- Profile nickname/avatar/password, role/status management and manual recovery use approved canonical DTOs and server safeguards.
- Accepted password/role changes and identity mismatches invalidate stale sessions/queues/private view caches.
- Existing read models require reviewed same-runtime data; unavailable families fail visibly without fixtures or fake progress.
- Active detailed maps render server positions and submit bounded direction intents only. They never restore/store player positions or publish client coordinates.
- World chat is one public channel across known regions, bounded to 100 messages/240 characters, rendered as escaped text with canonical sender-region labels; private NPC dialogue never enters it.
- Loss of admission pauses/clears intents and reconnects while retaining the valid account profile.

## Release verification
- Pure cookie/route/protocol/navigation/projection regressions, plus existing frontend tests.
- Final exact repository build/typecheck/test and independent review.
- Disposable normal-UI browser gate with enabled sandbox: signup/login, peers/NPCs, chat/focus, same-account dedup, arrival/retarget/cancel, locked regions, crossing, account switch.
- Per-family backend whitelist and real profile/admin/NPC/card/building/social/combat/settings workflow checks before claiming existing functions preserved or merging the reduced route replacement.

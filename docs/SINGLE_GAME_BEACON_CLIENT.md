# Original harbor feature in the sole canonical client

This is an isolated frontend delta against preservation commit 8512dd03 plus the four independently reviewed password-policy/session-epoch/navigation/Social correction patches. The local composed baseline 3848e5b is hydration evidence, never a publication layer. The original patch bytes and review fixes remain unchanged.

## Frozen server contract

Verified against beacon server commit 6de62799b905eaecaa4e8db8f5ec57812f8fa538, playerWorld/snapshot.ts, types.ts and harborBeacon.ts:

Whole-snapshot phase/counter coherence also follows the independently reviewed server validation delta c3b3b39: gathering remains below required participants; collecting has no awards and stays within its opening/cutoff interval; completion is at/after cutoff with all contributors awarded. Impossible archives remain private for manual review. The wire API is unchanged.

- Required snapshot.beacon identifies harbor-beacon-1 in t_dock, with x/z/radius, required participants, participationWindowTicks, tick, tickMs 100, nullable closesAtTick, numeric contributors/awardedAccountIds, completed and gathering/collecting/completed phase.
- Required own harborProgress and each same-region player's harborProgress are either ready with actual nonnegative supplies/rewards, or legacy-review-required with both counters null.
- Contribution is commandId plus type contribute and empty payload through the existing /api/world/command, cookie and displayed-self X-Greed-Account-Id assertion. The server checks current identity/admission/proximity/receipts and owns all resource changes.

## UI behavior

The /game page includes an expandable 港口共同點燈 panel, own preserved counters and same-region public counters/contribution markers. Unresolved progress says 舊港口進度待核實, with disabled contribution and no fabricated zeros. Countdown is derived only from (beacon.closesAtTick-beacon.tick)*tickMs, rounded up to seconds; it does not run a browser timer or use NPC worldTick/movementStep.

The original crystal/radius/contribution lamps/complete light render only when the canonical current region is t_dock. Geometry remains the sole collision source. At most 32 decorative lamps render; the panel always shows exact server participant/required counts.

Contribution cancels pending navigation, clears movement impulses and waits for the in-flight move. It validates current canonical eligibility and submits once. Repeated pending clicks and ACK-before-SSE clicks do not spend again. ACK never changes counters or completed state; the authoritative stream supplies all results. Late callbacks after unmount/logout/account replacement/reconnect are suppressed by their captured owner epoch. Missing world admission pauses/reconnects while keeping the authenticated profile; context mismatch clears stale identity as before. No contribution is automatically retried.

## Verification and remaining gates

- Available cached frontend suite: 53 files/469 tests passed, including 12 new contribution/protocol/render regressions; strict affected TypeScript passed.
- Local actual-producer compatibility: 10 tests passed using the frozen server snapshot constructor, all 9 supported region geometries, the exact two-account contribution opening, every 300-step countdown/reward transition and restart. Cross-candidate validation imports are local evidence and excluded from the publication patch.
- git diff --check passed. All four reviewed correction patches still reverse-check against the composed base; the new delta modifies no profile policy, AuthProvider, navigation or Social file.
- Cached tools are Node 24.19.0/Vitest 4.1.1/TypeScript 5.9.3. Exact pinned build/native/browser CI remains required. Full app TypeScript remains blocked by missing Babylon/Phaser/Leaflet package declarations and renderer cascades. No browser execution, push, live read/mutation, recovery proof, migration or deployment occurred.

Normal UI browser follow-on must open the panel, navigate two independent synthetic accounts to the server beacon, contribute from both, observe the same collection cutoff and server-awarded counters, and verify repeated clicks/reconnect/cross-region visibility. Publisher owns the harness and fixture; no shared E2E files are changed by this delta. Unknown legacy association remains a data-review gate, never evidence of migrated progress.

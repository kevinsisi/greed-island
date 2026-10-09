# Provider option handoff correction

This isolated correction depends on frozen956067a6, which in turn depends on the
independent hydration correctionbc44035. Neither prior freeze was modified.

Independent review reproduced two omissions in956067a6: the router captured the
original signal locally but forwarded the caller's mutable options to Gemini after
OpenCode fallback; the Gemini pool likewise forwarded mutable options to later key
attempts. Deleting/replacing the caller's signal let a child operation outlive the
parent's cancellation, causing closed-settings key writes or a surviving15-second
deadline. The first freeze remains blocked and is not a publication approval.

Each provider entry boundary now captures the original signal separately, takes an
owned frozen shallow snapshot of all other option values, and binds that original
signal into the snapshot used for every provider/key handoff. Signal identity is
retained, so actual abort still works; signal property mutation on the caller's
object cannot remove or replace it. Non-enumerable signal properties are captured
explicitly. OpenCode also snapshots prompts/options before awaiting session
creation, and the private Gemini per-key boundary snapshots its input.

The correction changes only aiProvider.ts, geminiClient.ts, openCodeClient.ts,
focused regression tests and this document. Runtime generations, bounded drain,
SQLite disposal, hydration, proxy, authentication and frozen feature-CI source are
unchanged. No credentials, live AI calls, publication or deployment were used.

101/101 source/pure tests passed across12 suites: the original88 lifecycle,
hydration and gameplay regressions, plus13 option-snapshot tests. The new suite
preserves the six independent review reproductions/edge checks and adds deleted
and replaced signals across both handoff paths, non-enumerable signal capture, and
unchanged prompt/model/configuration values after caller mutation. All fetches are
inert synthetic mocks; this is not native SQLite/real provider acceptance.

Scoped source+test noEmit passes with the same temporary declaration-only bcryptjs
validation aid and exclusion of the existing runtimeBudget implicit-any test.
Actual native composition-close tests remain blocked at collection by missing
bcryptjs, with the native better-sqlite3 binding also unavailable. Supported-Node
native/full CI and independent re-review remain gates. Do not publish this delta
until that re-review clears the corrected handoff contract.

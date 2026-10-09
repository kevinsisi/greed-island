# NPC/background lifecycle cancellation

This is an isolated source-only delta on reviewed mounted source9acf190 plus
independently owned hydration correctionbc44035. It does not modify any frozen
feature-CI source, hydration implementation, proxy, credentials or deployed data.
Apply the bc44035 hydration dependency first; this patch contains only the NPC,
ambient/provider and additional normal-close cancellation changes.

## Lifecycle contract

- NpcAgentRunner and AmbientNarrator have reusable stop()/start() generations.
  stop aborts old attempts, cancels retry sleeps, and prevents new provider work.
  start resumes scheduling with a fresh signal. A late old generation cannot commit,
  cache/publish narration, increment failure diagnostics, or erase a fresh request's
  in-flight ticket. NPC diagnostics retain last known provider configuration while
  paused without reading a closed settings DB.
- Runtime stop pauses both background consumers before disposing timers/combat
  loops. It retains the independently fixed deferred-hydration generation contract.
  Runtime start resumes them; late world-event narration also has a runtime
  generation fence before publication. No signals or authentication/session data
  are serialized into EventLog.
- generateWithProviders, Gemini key rotation and OpenCode requests accept an
  optional AbortSignal captured once for the operation. Cancellation is checked
  before/after awaits, fallback attempts and key metadata changes. Abort is not
  treated as a failed/disabled key. Mock providers/fetches that ignore abort are
  raced and fenced, so their late success/rejection cannot continue DB work.
- Fetch deadlines, body reads and retry delays remove timers/listeners on abort.
  Ordinary OpenCode cleanup remains best-effort and is now awaited with a deadline
  of at most1000ms within the endpoint budget. Cancellation does not start a new
  cleanup request. A remote service may ignore abort or retain an abandoned session;
  this code does not claim to force termination of that remote computation.
- waitForBackgroundWork(timeoutMs=1000) drains only existing local continuations,
  never starts new work. The normal server closes streams/listener and stops the
  runtime immediately, then includes bounded background settlement alongside the
  existing hydration drain before disposing SQLite. Closing remains idempotent.
  On a bounded timeout, the already-established generation/abort fences still
  prevent late DB access; the drain's boolean is diagnostic, not new authority.

## Evidence

88/88 tests passed across11 native-free/source suites:
-15 provider cancellation/deadline/key-fallback/cleanup tests with inert fetch
-4 NPC pause/retry/restart/late-provider tests
-3 ambient generation/cache/narration tests
-3 runtime reproductions, including the independently reported stop-then-late-commit
-18 existing NPC/ambient tests
-19 existing hydration shutdown/large-log regressions
-26 existing interior/player-command/combat-coordinator regressions

These distinguish source/runtime fixtures from actual native SQLite acceptance.
Two new actual normal-composition SQLite-close tests are included, but local
collection is BLOCKED by missing bcryptjs; the environment also lacks the native
better-sqlite3 binding. No native assertion executed. No live AI calls occurred.

Scoped source+test noEmit passes with a temporary, validation-only bcryptjs
module declaration and exclusion of the existing runtimeBudget implicit-any test.
Exact full noEmit is BLOCKED by missing bcryptjs (3 errors) and that pre-existing
Vitest dependency-drift implicit-any. These validation aids are not in the patch.

Independent review, supported-Node native/full CI and normal close acceptance remain
gates. This delta has no publication or deployment authorization and must stay out
of the already frozen feature-CI batch until separately approved.

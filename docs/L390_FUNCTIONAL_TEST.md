# Operator-gated L390 functional test

`test-l390-functional.mjs` is separately invoked after a reviewed deployment. It is not called by `deploy-l390.yml` or `deploy-l390.ps1`, and deployment never creates test accounts. No live test has been performed by adding this source.

## Approval and preflight

- Verify the dedicated non-administrator L390 runner/Docker access and exact approved successful-main-CI SHA. The script checks `/healthz` mode/buildSha before sending credentials, and checks the SHA again after gameplay.
- The production destination is fixed to the previously verified `https://greed.sisihome.org`. Other URLs are refused, except an explicitly selected HTTP loopback job fixture (`--local-fixture`). HTTPS validation remains enabled. No extra public port/service is created.
- Existing mode requires `--approved-existing-accounts`, two operator-selected synthetic player credentials, and both expected numeric account IDs. A mismatched ID or elevated profile fails before movement, and the newly issued test session is logged out. Existing positions are resumed; an existing player is never forced through entry/signup again.
- Optional new signup requires `--approved-register-synthetic-accounts`, operator-supplied distinct `l390-smoke-...` usernames (total maximum 32 characters), and passwords meeting the canonical 12–200 policy. It uses normal `/api/auth/register`, requires player role, never promotes or creates an admin, and never generates or saves production credentials. A collision fails rather than changing an account or silently falling back to login.
- `--approved-public-chat` is also required. One clearly identified public smoke message remains in canonical history. No chat/EventLog deletion or history repair occurs.

The approval flags represent an operator's recorded approval; they are not a substitute for obtaining approval or the required secure credential handoff. Do not place credentials in workflow YAML, command arguments, logs, Git, `.env` files, CI artifacts, or backup reports. An owner supplies them only for this bounded local process using the approved secure input flow.

## Inputs and invocation contract

Run the reviewed script with the exact SHA-tagged server image whose OCI revision was verified by the deployment flow. Bind-mount only the source script read-only as `/app/l390-functional.mjs`; its collision planner imports that image's `/app/dist/playerWorld/geometry.js`. Use an existing Docker network and the private HTTPS route. Supply these process environment names without logging their values:

- `GREED_L390_TEST_USER_ONE`, `GREED_L390_TEST_PASSWORD_ONE`
- `GREED_L390_TEST_USER_TWO`, `GREED_L390_TEST_PASSWORD_TWO`
- Existing mode only: `GREED_L390_TEST_ACCOUNT_ID_ONE`, `GREED_L390_TEST_ACCOUNT_ID_TWO`

The container command is `node /app/l390-functional.mjs --expected-sha <exact40hexSHA> --approved-existing-accounts --approved-public-chat`. Optional signup substitutes `--approved-register-synthetic-accounts`; the two modes are mutually exclusive. There is no default approved account, password, ID, registration mode, admin reset, or fallback deployment path.

If the current private route is unreachable from that existing Docker network, the script fails. Establish the verified route within existing approved networking before testing; never open another public port or bypass TLS to make the test pass.

## Functional evidence and cleanup

The script uses normal same-origin cookie login/signup and public APIs. It checks unauthenticated world access is 401; two distinct live SSE peers; authoritative movement observed by the other peer; public chat observed by the other peer; actual authored dock-to-central crossing; NPC display projection presence; cookie reconnect resumes persisted position; reciprocal region return; and autonomous canonical world clock advancement.

Each move is a normal numeric intent planned against the server snapshot geometry and checked against its authoritative result. Region travel follows available supported map edges and reciprocal portals. It never sends a position-setting/debug request, changes runtime time, reads/migrates SQLite, touches source volumes, or invents progress/currency mappings.

Tests have a two-minute functional deadline and a separate one-minute bounded cleanup deadline. Existing test poses are restored using normal moves/portals (including a fractional final move), then test streams close and only those new test cookie sessions log out. A cleanup failure is reported as requiring operator review; no destructive restore is attempted. Other sessions for the same account are not revoked. Use synthetic accounts without concurrent manual movement; a position disagreement causes failure rather than claiming success.

New signup accounts, their durable positions, and the public smoke message are retained and identified by numeric created-account IDs in the redacted success summary. They are recoverable through the already preserved unified administrator account/status/reset workflow if the owner approves follow-up cleanup. No permanent account or EventLog deletion is implemented. Partial signup may retain the operator-supplied approved username; review it through normal admin UI rather than rerunning with guessed credentials.

Beacon contribution/rewards/supplies are intentionally outside this script's current asserted coverage. They need the separately reviewed canonical beacon/typed legacy-progress contract and explicit permission for persistent test progress changes. A successful report does not claim those semantics or a live migration passed.

## Source verification

Four Node built-in tests cover approval/destination/SHA/ID gates, optional-signup policy, collision-respecting bounded intent planning, and available-region routing. A cloud ephemeral real-HTTP/SSE run using a supplemental Node24 SQLite adapter verifies the actual normal gameplay flow. This is not native Node22, Docker/Caddy, browser, or L390 evidence; those exact host/build gates remain required. No live credentials, source volume, or data has been read during source development.

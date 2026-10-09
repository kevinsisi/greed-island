# L390 unified server candidate

This is a source/configuration candidate, not a deployed stack. Do not run a
rebuild/recreate or reload the live Caddy configuration until the owner approves
the exact backup, dry-run identity mapping, active-admin verification and
progress-preservation plan. Feature-branch CI/browser/routing acceptance must
also pass on the complete bundle first.

## One active topology

The current private route is retained:
Browser → https://greed.sisihome.org → existing GB10 Caddy → existing L390
tailscale serve → 127.0.0.1:28100 web → existing multiplayer:4179 container.
That backend now runs dist/server.js, the one unified canonical server. It is
not an additional service, account store or world. Port 4179 is internal only;
web remains loopback-bound. No GB10, tailscale, DNS or public exposure change is
part of this candidate.

Caddy serves /game and redirects /multiplayer-3d and /prototype-3d once to
/game. It proxies only reviewed exact auth/world/profile/map/version endpoints.
Unreviewed /api paths, /mp-api and card-image paths are denied. Health proxies
the actual unified application. Auth and world keep the same cookie principal;
Origin is forwarded unchanged.

## Database selection and preserved sources

GREED_L390_CANONICAL_VOLUME has no default and must name an already existing,
owner-reviewed volume containing greed-island.sqlite. The container opens that
file with fileMustExist. The read-only identity/EventLog/foreign-key/active-admin
preflight happens before WAL or schema constructors. No startup migration,
fresh world, first-signup admin, admin claim file or credential generation is
allowed.

The former greed-l390-mp-data volume is not mounted, copied, renamed or deleted.
Its room.sqlite/accounts.json/fixture credentials and progress remain a
preservation source until the explicit reviewed import is approved. Do not
point the canonical volume at it merely to bypass the required decision.
Canonical account IDs, source aliases, original password verifiers and stored
progress require an exact dry-run import report and rollback backup. Logging
in successfully alone does not establish progress preservation.

## Configuration review

.env.example contains the exact HTTPS allowed origin and existing host port.
GREED_L390_CANONICAL_VOLUME intentionally stays blank. Do not copy former
MULTIPLAYER_* / MP_ADMIN_CLAIM_FILE configuration into the new startup. No
JWT secret is used by the unified cookie-session boundary.

The source configuration does not contain an import command or an automatic
owner-bootstrap flow. Immutable CI images use GREED_L390_IMAGE_TAG=<exactSHA>;
GREED_L390_BUILD_SHA carries matching health metadata. Main deployment is
source-defined in Deploy L390; the former desktop workflow is manual-only. Selecting the canonical data source, preserving all
existing multiplayer/prototype progress, and the guarded admin recovery/last
admin adapter remain deployment gates. Existing social/card/NPC/commerce
mutators cannot be exposed before their identity, authority and privacy review.

## Verification and rollback

python3 scripts/test-l390-routing.py runs real Caddy containers on an isolated
internal Docker network with synthetic static files/backend. It proves route
matching, proxy header forwarding, /game's terminating redirect and denied
legacy endpoints. Its stub 401 is not application authentication evidence.
Node22 native tests and the disposable unified browser fixture prove the
actual auth/world paths separately.

For a later authorized cutover, preserve both current images, versioned Caddy
configuration, both source data backups and the prior compose/environment
settings before changing anything. Verify existing owner login/recovery and
progress against the reviewed dry-run report, then new-player signup, two
peers, cross-region/NPC visibility, reconnect/restart, private reachability and
actual unified health. Rollback restores the prior image/configuration and
separate source databases; no destructive volume operations belong here.

## First-cutover review receipt

The deployer refuses the first old-room→canonical cutover without the local
deploy/l390/unified-cutover-review.json review record. Its fields are reviewed,
canonicalVolume, legacyVolumes, mappingDigest and progressPreservationDigest.
This record belongs to the completed owner-reviewed dry-run/import process;
setting a flag does not supply a mapping or migrate data. No sample with
reviewed:true is checked in. Both source and ready staged DB stay backed up
locally. Source volume and staged canonical volume are distinct.

The CI package contains code images only. Local AppData backups and diagnostics
are never uploaded. Source/data readiness failure occurs before stopping any
old container. A partial-stop failure enters the same protected rollback path;
rollback uses a validated captured resolved Compose model and exact prior image
IDs rather than assuming a mutable .env still describes the previous stack.

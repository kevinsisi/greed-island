## Same-account recovery UI delta — 2026-10-08

- Added manual `/reset-password` proof redemption and same-game admin issuance UI against the approved AuthService DTOs, with no URL tokens/storage/logging/email claims or live actions.
- Added proof validation, target-only picker projection, expected-admin guard, matching-target response validation, repeated-submit protection and disposed-response suppression.
- Locally verified 59 focused tests, strict pure implementation/test TypeScript and whitespace. Full TSX/browser remains unverified here.
- The original reduced wildcard client checkpoint is explicitly not mergeable until the working legacy profile/admin/gameplay features are preserved under the sole cookie provider and `/game/*` routes. No reduced-slice completion claim is made.

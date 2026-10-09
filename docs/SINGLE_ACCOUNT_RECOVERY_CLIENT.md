# Same-account recovery UI delta

This delta layers on the frozen canonical client checkpoint. It does not authorize merging that checkpoint's reduced wildcard route before the existing-feature preservation work is complete.

`/reset-password` is a manual proof-entry utility for the same AuthService and HttpOnly cookie. It never reads a proof from a URL, logs it, saves it to browser storage or claims email delivery. The form requires the full 64-character lowercase-hex proof and a confirmed 12–200-character new password, clears fields after a request/cancel, and returns to `/game` only after validating `{profile}`. No world entry/stream is started before proof redemption. Repeated pending submissions are blocked; failed/expired attempts are not automatically retried.

The sole game's admin-only recovery modal lists canonical targets and explicitly issues one proof through `/api/admin/users/:accountId/reset-password`. Cookie authentication and X-Greed-Account-Id assert the displayed administrator, not the target. The response must match the selected active target and fixed token-free `/reset-password` path. The proof is held only in the open component's memory, masked initially, never automatically copied, and discarded on dismissal or identity/role change. The server independently enforces active-admin/context authorization.

This is implementation-only evidence. No live proof/account action, email, credential or database operation was performed. Focused protocol/client tests and strict pure TypeScript passed; full TSX/browser verification is still a coherent-branch CI gate. Profile/password/admin and other existing gameplay views are separate preservation work; this delta must not be described as all-functions complete.

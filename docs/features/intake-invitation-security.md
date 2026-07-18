# Intake invitation security

Staff-triggered client intake magic links carry an opaque `intakeToken` instead of serialized intake data. The raw 256-bit token appears only in the magic-link callback and is stored server-side only as a SHA-256 hash on the intake. Issuing a new link invalidates the previous token.

The token carries no independent lifetime of its own; it is a locator into the intake, and access is gated by Better Auth's magic-link expiry, the authenticated session, and email binding. `GET /api/practice-client-intakes/invitation-prefill?token=...` requires authentication, disables response caching, and resolves current intake and practice data only when the authenticated email matches the invited email. Unknown, incomplete, and superseded tokens do not expose stored payload data.

Intake-to-matter conversion locks the intake row with `FOR UPDATE`. Tenant authorization, conversion status, triage eligibility, metadata validation, existing-matter detection, matter creation, and the final `converted` update all run inside one unit-of-work transaction. A concurrent conversion waits for the lock and then returns the already-created matter instead of creating another one.

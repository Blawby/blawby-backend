# KrabiClaw OAuth client — runbook

Covers the single fixed `client_credentials` OAuth client that lets KrabiClaw
call the Blawby legal-facade API (`urn:blawby:legal-api` audience,
`legal:practice legal:connect legal:intakes legal:engagements` scopes).
Established in Unit 1 of `docs/plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md`.

## One-time provisioning (per environment)

Run once per environment (local, staging, production) by a Blawby staff
member who already has the `super_admin` role
(`pnpm run staff:grant --email <you> --role super_admin` if you don't):

```bash
pnpm run krabiclaw:provision-oauth-client -- create \
  --email <your-staff-email> --password '<your password>' \
  --redirect-uri <this environment's real KrabiClaw callback URL>
```

The `client_secret` is shown exactly once. Capture both values immediately:

- `client_id` → set as `KRABICLAW_OAUTH_CLIENT_ID` in **Blawby's** config for
  this environment (used from Unit 4 onward to pin the accepted `azp`).
- `client_id` + `client_secret` → hand to KrabiClaw for **their** config in
  this environment (they use it to request tokens).

Store both in the environment's secrets manager, not in any repo, ticket, or
chat message that outlives the handoff.

**`create` refuses to run a second time.** Per R2 (exactly one fixed
KrabiClaw client), the script checks `config.krabiclaw.oauthClientId` before
creating anything: if `KRABICLAW_OAUTH_CLIENT_ID` is already set for this
environment, `create` exits with an error telling you to use `rotate`
instead. This only guards against running the script again in an environment
that already has `KRABICLAW_OAUTH_CLIENT_ID` configured — it can't stop a
second client from being created in an environment where that variable
hasn't been set yet (e.g. skipping step 1 above after a prior `create`). Set
`KRABICLAW_OAUTH_CLIENT_ID` immediately after every successful `create`,
before anyone can run the script again.

## Rotation

Rotate on a schedule or immediately after any suspected exposure:

```bash
pnpm run krabiclaw:provision-oauth-client -- rotate \
  --email <your-staff-email> --password '<your password>' \
  --client-id <the environment's existing client_id>
```

The previous secret stops working the instant rotation completes. Any
super_admin can rotate — it doesn't have to be whoever originally
provisioned it (verified in Task 6 of the U1 plan). Update KrabiClaw's
config with the new secret before or immediately after rotating, since
there is no overlap window with the old secret.

**`--client-id` must match `KRABICLAW_OAUTH_CLIENT_ID`.** `rotate` refuses to
run if `KRABICLAW_OAUTH_CLIENT_ID` isn't configured for this environment
(nothing to rotate), and refuses if the `--client-id` you passed doesn't
match it — this exists so a typo or a stale value from another environment
can't silently rotate the wrong client.

## Emergency revocation

If the client must be cut off immediately (suspected compromise) rather
than rotated:

1. Rotate the secret first (above) — this alone stops any caller using the
   old secret, with zero propagation delay.
2. If the client itself must be disabled outright, a staff `super_admin`
   can call `auth.api.updateOAuthClient({ headers, body: { client_id,
   update: { disabled: true } } })` from a Node REPL against the target
   environment's database. There is no scripted command for this yet —
   add one if this path is used more than once.
3. Notify whoever owns the KrabiClaw side of the integration; existing
   tokens already issued remain valid until they naturally expire (at most
   1 hour, per `m2mAccessTokenExpiresIn`) even after the client is
   disabled or rotated, since Better Auth does not revoke already-issued
   JWTs on rotation/disable — only introspection and new token requests
   are affected.

## Audit ownership

The client is created with no individual `user_id` owner (it resolves to
the shared `krabiclaw:legal-facade` reference — see
`KRABICLAW_OAUTH_CLIENT_REFERENCE` in `src/shared/auth/krabiclaw-oauth.ts`)
so that provisioning and rotation are not tied to one person's account
staying active. Anyone with `super_admin` can manage it. Treat
`pnpm run staff:grant` grants of `super_admin` as the actual access-control
boundary for this credential, and audit that list when reviewing who can
touch it.

## Review

Per the master plan's R48: review this integration within 90 days of
enabling live traffic, and quarterly afterward.

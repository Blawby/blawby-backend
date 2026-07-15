# Authentication and Organizations

Status: Implemented with active evolution
Last verified: 2026-07-13

## Purpose

Authentication identifies users, establishes sessions, controls access to Blawby applications, and scopes practice data through organizations. Organization membership is the primary tenant boundary for practice-facing functionality.

## Actors

- Anonymous visitor
- Client
- Practice member
- Practice owner or administrator
- Blawby operations staff
- OAuth/MCP client

## Core behavior

Blawby uses Better Auth for user authentication, sessions, organization membership, invitations, and OAuth-provider behavior. Protected application routes resolve the authenticated user and active organization before business logic executes.

Dashboard authentication is restricted to accounts carrying an authorized staff role. The dedicated dashboard email sign-in endpoint returns the same invalid-credentials response for missing, non-staff, and invalid accounts to avoid disclosing account classification.

## Organization model

- A practice is represented by an organization.
- Practice data must be scoped to the active organization or an explicitly authorized organization identifier.
- Membership alone does not imply every action is permitted; route and service authorization must also evaluate role or ability rules.
- Client membership must not grant access to staff-only practice data.
- Operations staff access is global and must be handled through operations-specific authorization rather than ordinary practice membership.

## Main workflows

### Practice user sign-in

1. User submits credentials or uses a configured identity provider.
2. Better Auth validates identity.
3. The backend resolves the user and session.
4. The active organization is validated against current membership.
5. Protected routes evaluate abilities and resource ownership.

### Dashboard staff sign-in

1. User submits email credentials to the dashboard sign-in endpoint.
2. Backend resolves the stored user role.
3. Non-staff and missing users receive a generic unauthorized response.
4. Authorized staff requests are forwarded to the normal Better Auth email sign-in handler.

### Invitation onboarding

1. An authorized organization member creates or triggers an invitation.
2. The recipient accepts using the invitation flow.
3. Better Auth creates or links the user and organization membership.
4. Application-specific client or practice records are associated with the authenticated identity.
5. Environment-specific email-verification rules are applied.

### Anonymous-user linking

Where anonymous activity is supported, later authentication may migrate or associate anonymous records with the authenticated user. Linking must be idempotent and must not merge one authenticated user into another.

## Permissions

Authorization is layered:

1. Authentication: a valid user or bearer token exists.
2. Tenant scope: the user may access the organization.
3. Ability or role: the user may perform the requested action.
4. Resource ownership: the specific record belongs to the permitted tenant or user.

Global operations roles and practice roles are separate concepts. Staff-role strings may contain multiple role values and must be parsed consistently.

## Security rules

- Do not reveal whether an email belongs to a staff or non-staff account during dashboard sign-in.
- Never trust an organization identifier without verifying membership or staff authority.
- Refresh security-sensitive user information from the database when stale session claims could grant incorrect access.
- Authentication middleware must execute before protected route handlers.
- Client-facing routes must enforce both organization and client-record ownership.
- OAuth and MCP tokens must validate issuer, audience, signature, and scopes.

## Failure behavior

- Missing or invalid session: `401 Unauthorized`.
- Authenticated but forbidden action: `403 Forbidden`.
- Invalid active organization: clear or reject the invalid organization context before continuing.
- Missing resource within an authorized tenant: `404 Not Found`.
- Dashboard account not eligible for staff access: generic invalid-email-or-password response.

## Side effects

- Session creation and revocation
- Organization and membership creation
- Invitation emails
- Anonymous-record migration
- Audit or security logs
- OAuth token issuance and metadata discovery

## Known limitations

- Exact role-to-ability mappings remain code-owned and must be reviewed when roles change.
- Invitation and verification behavior may differ by environment.
- Cross-organization administration should occur only through explicitly documented operations routes.

## Acceptance criteria

- A user cannot access an organization without valid membership or operations authority.
- A client cannot access another client's records.
- A non-staff user cannot authenticate through the dashboard-specific endpoint.
- Invalid and unauthorized dashboard accounts receive indistinguishable credential errors.
- Stale or invalid active-organization context cannot bypass tenant checks.
- Invitation acceptance creates the intended membership without duplicating users.

## Code ownership

Primary areas:

- `src/shared/auth/`
- `src/schema/better-auth-schema.ts`
- authentication and organization middleware
- ability and staff-role definitions
- invitation hooks and migration logic
- `src/modules/ops/` for global staff access

API contracts are exposed through generated OpenAPI documentation and Better Auth routes.
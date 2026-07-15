# Clients

Status: Implemented
Last verified: 2026-07-13

## Purpose

Client management connects a legal-service recipient to a practice, authenticated user identity, intake history, matters, engagements, invoices, files, conversations, and internal staff records.

## Actors

- Practice owner, attorney, or staff member
- Client
- Invited but not yet authenticated client
- Operations staff through separate support tooling

## Core behavior

Implemented capabilities include client profiles, Better Auth-linked accounts, invitation-based onboarding, client workspace access, client memos, conflict-related checks, matter access, files, and conversations.

A client record and an authenticated user are related but not interchangeable. A person may exist as a prospective client before accepting an invitation, and identity linking must avoid duplicates.

## Main workflows

### Create or identify client

1. Staff creates a client directly or accepts an intake.
2. Backend searches or validates existing identity relationships where applicable.
3. Client record is created within the practice.
4. Contact and source information are stored.

### Invite client

1. Authorized staff or an accepted-intake workflow creates an invitation.
2. Client accepts and authenticates.
3. Backend links the authenticated user to the intended practice client record.
4. Client workspace access becomes available according to permissions.

### Client portal access

1. Client authenticates.
2. Backend resolves authorized client relationships.
3. Client may access permitted matters, engagements, invoices, files, and conversations.
4. Internal-only fields and staff notes remain excluded.

### Client memo

Authorized staff may create internal client-level notes or memos. These are not client-visible unless explicitly designed and marked for client visibility.

## Business rules

- Client records are practice-scoped.
- An authenticated user must not be linked to the wrong client record.
- Duplicate invitations and acceptance retries must not create duplicate clients or memberships.
- Client-visible APIs must use explicit serializers or schemas that omit internal data.
- Conflict checks are decision-support records, not automatic legal conclusions.
- Deactivating a client must not delete financial, matter, engagement, or audit history.
- Email matching alone must not override an existing authenticated identity relationship without validation.

## Permissions

Staff permissions should distinguish viewing, creating, editing, inviting, linking identity, adding internal memos, and accessing sensitive financial or matter information.

Clients can view only records associated with their authorized client relationship. They cannot access staff memos, other clients, practice administration, or internal audit information.

## Data ownership

Client-related data includes:

- Practice-scoped client profile
- User identity link
- Organization membership or invitation
- Intake history
- Engagements and matters
- Invoices and trust balances
- Files and conversations
- Internal memos and conflict-check records

## Side effects

- Invitation email
- Organization membership creation
- Workspace activation
- Identity-link audit record
- Notifications related to matters, invoices, or engagements

## Failure behavior

- Duplicate invitation: return or reuse an active invitation when safe.
- Existing user linked to a different client: reject and require explicit resolution.
- Cross-practice client access: forbidden or not found.
- Identity-link race: enforce uniqueness and retry safely.
- Missing client serializer boundary: fail closed rather than returning staff data.

## Security and privacy

- Treat contact details, legal information, files, and financial data as sensitive.
- Internal memos must never appear in client responses by default.
- Operations access must be audited and separate from ordinary practice membership.
- Account linking should require authenticated or token-backed proof.

## Known limitations

- A dedicated client mobile application is not implemented.
- Duplicate-person resolution across practices is intentionally separate because practices are tenant-isolated.
- Data-retention and client-deletion policies require a formal compliance policy.

## Acceptance criteria

- A client can access only their own authorized practice records.
- Invitation retries do not duplicate identities, clients, or memberships.
- Internal memos never appear in client-facing responses.
- Staff can maintain client information within their authorized practice.
- Historical matter and financial records survive client deactivation.

## Code ownership

Primary areas:

- `src/modules/clients/`
- Better Auth invitation and organization integrations
- client-specific matter, invoice, engagement, file, and conversation routes
- intake conversion logic
- conflict-check and memo services
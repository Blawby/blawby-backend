# Operations Console

Status: Implemented with evolving resource coverage
Last verified: 2026-07-13

## Purpose

The operations feature provides authorized Blawby staff with cross-tenant support and administrative visibility that ordinary practice users must not have.

## Actors

- Support staff
- Operations administrator
- Super administrator
- Audited internal service

## Core behavior

The operations module exposes protected resource-management APIs for supported internal resources such as users and practices. List operations support pagination and search. Resource detail operations return normalized internal representations.

Operations access depends on global staff roles, not ordinary practice membership. Dashboard sign-in is separately restricted to staff-eligible accounts.

## Main workflows

### Staff authentication

1. Staff submits credentials through the dashboard-specific sign-in endpoint.
2. Backend verifies the account has at least one recognized global staff role.
3. Ineligible and missing accounts receive a generic unauthorized response.
4. Better Auth establishes the session for eligible staff.

### List resources

1. Authenticated staff requests a supported resource collection.
2. Backend evaluates the required staff permission.
3. Query, limit, and offset are validated.
4. Backend returns serialized rows and total count.

### View resource

1. Staff requests a specific resource.
2. Backend evaluates resource-specific permission.
3. Resource is returned through an operations serializer.
4. Access is logged where required.

### Mutating operations

Any create, update, role-grant, impersonation, or destructive action must define separate permissions, audit requirements, and confirmation behavior. Read access does not imply mutation access.

## Business rules

- Global staff roles must be parsed consistently, including multi-role values.
- Operations authorization must not depend on joining customer organizations.
- Staff permissions must follow least privilege.
- Search and pagination must be deterministic and return accurate totals.
- Internal serializers must avoid returning secrets, credential material, or unnecessary sensitive data.
- Cross-tenant access must be attributable to the staff actor.
- Role changes must take effect from current database state rather than stale session data where security requires it.
- Customer data mutations require explicit product and operational policy.

## Permissions

Permissions should distinguish:

- Dashboard sign-in eligibility
- List users
- View user
- List practices
- View practice
- Grant or revoke staff roles
- Perform customer-data support actions
- Access financial or trust information
- Execute destructive actions

Super-admin status should not be assumed by every staff account.

## Side effects

- Security and audit logs
- Staff-role changes
- Support-case references where integrated
- Notifications for sensitive changes where policy requires
- Session invalidation after privilege changes where appropriate

## Failure behavior

- Non-staff dashboard login: generic unauthorized response.
- Authenticated non-staff operations request: forbidden.
- Missing resource: not found.
- Invalid pagination or resource type: validation error.
- Stale elevated role: refresh from database and deny if no longer authorized.
- Sensitive mutation without required confirmation or permission: reject.

## Security and privacy

- Apply least privilege and explicit permission checks per resource and action.
- Audit cross-tenant reads and all mutations involving customer data.
- Do not expose password hashes, tokens, secrets, full payment credentials, or unnecessary legal records.
- Avoid impersonation unless a dedicated, audited, time-limited workflow is implemented.
- Use generic authentication errors to prevent staff-account enumeration.
- Require stronger controls for financial, trust, and role-management actions.

## Known limitations

- Resource coverage is still evolving.
- A complete support-case and approval workflow is not confirmed.
- Impersonation is not documented as an implemented feature.
- Audit retention and staff-access review policies require organizational policy outside the codebase.

## Acceptance criteria

- Non-staff users cannot authenticate through the operations dashboard endpoint.
- Ordinary practice membership cannot grant operations access.
- Staff can access only resources and actions permitted by their global role.
- Resource listings return deterministic pagination and accurate totals.
- Sensitive fields are excluded from operations responses unless explicitly required.
- Cross-tenant mutations are attributable and auditable.

## Code ownership

Primary areas:

- `src/modules/ops/`
- global staff-role and ability definitions
- `src/shared/auth/dashboard-sign-in-guard.ts`
- Better Auth dashboard sign-in route
- fresh-user middleware and authorization tests
- audit and logging infrastructure
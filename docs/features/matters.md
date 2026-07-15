# Matters

Status: Implemented with partial automation
Last verified: 2026-07-13

## Purpose

A matter is the operational record for legal work performed for a client. It groups participants, tasks, milestones, notes, activity, files, time entries, expenses, and billing context.

## Actors

- Practice owner or administrator
- Attorney or staff member
- Assigned team member
- Client with authorized portal access
- Operations staff through separate support tooling

## Preconditions

- The practice and client records exist.
- The requesting user is authenticated.
- The user has access to the practice and permission for the requested action.
- Matter creation inputs satisfy required ownership and status rules.

## Core behavior

A matter belongs to one practice and normally one client. It may be created manually or as a side effect of an accepted engagement. Related records must inherit and enforce the same practice boundary.

Implemented capabilities include matter CRUD, status tracking, team assignments, tasks, milestones, notes, activities, files, time entries, expenses, audit history, unbilled-work aggregation, and client-specific matter queries. Activity, note, and task listings support pagination and total counts.

## Lifecycle

The exact status enum is code-owned. Product behavior must distinguish at minimum:

- Open or active work
- Inactive, closed, or completed work
- Records unavailable because they were removed or the user lacks access

Status changes must not silently delete financial, audit, or trust records.

## Main workflows

### Create matter

1. Authorized staff selects or creates a client.
2. Staff provides matter metadata and initial status.
3. Backend validates practice and client ownership.
4. Matter is persisted.
5. Initial activity or audit records are written when applicable.

### Engagement-created matter

1. Client accepts an eligible engagement.
2. Backend records acceptance.
3. Backend creates the matter exactly once.
4. The matter is linked to the engagement, client, and practice.

### Work management

1. Staff assigns team members.
2. Staff creates tasks and milestones.
3. Users add notes, files, time entries, expenses, and activity.
4. List endpoints return stable pagination metadata.
5. Unbilled financial entries become available to invoice workflows.

### Client access

Clients may retrieve only matters and matter detail explicitly associated with their client identity. Client responses may be narrower than staff responses and must not expose internal-only fields.

## Business rules

- Every child record must belong to the same practice as the matter.
- Client-facing access requires both authenticated identity and client ownership.
- Assignments must reference valid practice members.
- Time and expense records must preserve billing and audit history after invoicing.
- Accepted engagements must not create duplicate matters when acceptance is retried.
- Pagination must use deterministic ordering and return total count where promised.
- Deleting or closing a matter must not corrupt invoice, payment, trust, or audit history.

## Permissions

Permissions should distinguish:

- View matter
- Create or update matter
- Close or archive matter
- Manage assignments
- Manage tasks and milestones
- Add internal notes
- Add billable time and expenses
- Access client-visible content
- Access internal activity and audit information

## Data ownership

Matter-owned or matter-related data includes:

- Client and practice references
- Team assignments
- Tasks and milestones
- Notes and activity entries
- Files and upload references
- Time entries and expenses
- Engagement relationship
- Invoice-line or unbilled-work relationships
- Audit records

## Side effects

- Audit or activity records
- Notifications when implemented
- Unbilled-work aggregation
- Invoice eligibility
- Client portal visibility
- Background jobs for files or messaging where configured

## Failure behavior

- Invalid practice, client, or assignment reference: validation error or not found.
- Cross-practice reference: forbidden or not found without leaking existence.
- Unauthorized client access: forbidden or not found.
- Duplicate engagement acceptance: return the existing result or otherwise avoid duplicate matter creation.
- Invalid pagination: validation error.

## Known limitations

- Automated deadline reminders are not complete.
- AI-generated matter roadmaps and assignment suggestions are planned or partial.
- Matter deletion and archival semantics should be treated as code-owned until a formal retention policy is adopted.

## Acceptance criteria

- Staff can create and maintain matters within an authorized practice.
- Clients can access only their own permitted matter data.
- Tasks, notes, activities, time, and expenses cannot cross practice boundaries.
- Paginated lists return deterministic results and accurate totals.
- Accepted-engagement retries do not create duplicate matters.
- Historical financial and audit records remain intact when a matter closes.

## Code ownership

Primary areas:

- `src/modules/matters/`
- matter query modules and client-matter routes
- time-entry, expense, task, milestone, note, activity, and assignment services
- invoice and engagement integrations
- upload and audit infrastructure
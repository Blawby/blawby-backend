# Matters Module

Legal case management module for Blawby.

## Overview

A **Matter** represents a legal case, file, or engagement that a law firm handles for a client. This is the core entity around which all legal practice management revolves.

## Architecture

The matters module is organized into two tiers:

### Core Matter Operations

Full CRUD operations for managing matters themselves. These routes handle the matter's metadata:

- Name and description
- Status and type
- Client relationships
- Assignees
- Practice area

**Security:** Each core route performs access checks in the service layer using `verifyMatterAccess()` which validates:

- Matter exists
- Matter belongs to the user's organization
- User has appropriate CASL ability for the operation

### Matter Sub-Resources

Matters have several related entities that are managed through nested routes under `/{practice_id}/matters/:id/`. All sub-resource routes use a sub-router with `requireMatterAccess()` middleware, which automatically verifies the user can access the parent matter before allowing any operation on sub-resources.

## Sub-Resources

### Activity

**Path:** `/{practice_id}/matters/:id/activity`

| Aspect       | Description                                           |
| ------------ | ----------------------------------------------------- |
| **Purpose**  | Audit trail and activity log for the matter           |
| **Tracks**   | All changes, updates, and actions taken on the matter |
| **Use Case** | Compliance, matter history, "what happened when"      |

---

### Notes

**Path:** `/{practice_id}/matters/:id/notes`

| Aspect         | Description                                              |
| -------------- | -------------------------------------------------------- |
| **Purpose**    | Free-form notes and annotations on the matter            |
| **Operations** | List, Create, Update, Delete                             |
| **Use Case**   | Lawyer memos, case observations, internal communications |

**Endpoints:**

- `GET /{practice_id}/matters/:id/notes` - List all notes
- `POST /{practice_id}/matters/:id/notes` - Create a new note
- `PUT /{practice_id}/matters/:id/notes/:note_id` - Update a note
- `DELETE /{practice_id}/matters/:id/notes/:note_id` - Delete a note

---

### Time Entries

**Path:** `/{practice_id}/matters/:id/time-entries`

| Aspect         | Description                                                             |
| -------------- | ----------------------------------------------------------------------- |
| **Purpose**    | Track billable and non-billable time spent on the matter                |
| **Operations** | List, Create, Update, Delete, Get Stats                                 |
| **Fields**     | Duration, description, hourly rate, billable flag, user who logged time |
| **Use Case**   | Client billing, productivity tracking, matter profitability analysis    |

**Endpoints:**

- `GET /{practice_id}/matters/:id/time-entries` - List time entries
- `POST /{practice_id}/matters/:id/time-entries` - Create a time entry
- `PUT /{practice_id}/matters/:id/time-entries/:entry_id` - Update a time entry
- `DELETE /{practice_id}/matters/:id/time-entries/:entry_id` - Delete a time entry
- `GET /{practice_id}/matters/:id/time-stats` - Get time entry statistics

---

### Expenses

**Path:** `/{practice_id}/matters/:id/expenses`

| Aspect         | Description                                            |
| -------------- | ------------------------------------------------------ |
| **Purpose**    | Track out-of-pocket expenses incurred for the matter   |
| **Operations** | List, Create, Update, Delete                           |
| **Fields**     | Amount, description, category, billable flag           |
| **Use Case**   | Client reimbursement, matter cost tracking, accounting |

**Endpoints:**

- `GET /{practice_id}/matters/:id/expenses` - List expenses
- `POST /{practice_id}/matters/:id/expenses` - Create an expense
- `PUT /{practice_id}/matters/:id/expenses/:expense_id` - Update an expense
- `DELETE /{practice_id}/matters/:id/expenses/:expense_id` - Delete an expense

---

### Milestones

**Path:** `/{practice_id}/matters/:id/milestones`

| Aspect         | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| **Purpose**    | Key dates, deadlines, and case progression markers                        |
| **Operations** | List, Create, Update, Delete, Reorder                                     |
| **Fields**     | Description, due date, amount (if milestone-based billing), status, order |
| **Use Case**   | Case timeline management, deadline tracking, milestone billing            |

**Endpoints:**

- `GET /{practice_id}/matters/:id/milestones` - List milestones
- `POST /{practice_id}/matters/:id/milestones` - Create a milestone
- `PUT /{practice_id}/matters/:id/milestones/:milestone_id` - Update a milestone
- `DELETE /{practice_id}/matters/:id/milestones/:milestone_id` - Delete a milestone
- `POST /{practice_id}/matters/:id/milestones/reorder` - Reorder milestones

---

### Tasks

**Path:** `/{practice_id}/matters/:id/tasks`

| Aspect      | Description                                            |
| ----------- | ------------------------------------------------------ |
| **Purpose** | Action items and to-dos related to the matter          |
| **Status**  | ⚠️ Not yet implemented (returns 501)                   |
| **Planned** | Assign tasks, track completion, due dates, assignments |

---

### Unbilled

**Path:** `/{practice_id}/matters/:id/unbilled`

| Aspect       | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| **Purpose**  | Aggregate view of all unbilled items for invoice generation   |
| **Returns**  | Unbilled time entries + unbilled expenses + unpaid milestones |
| **Use Case** | Pre-invoice review, matter revenue analysis                   |

**Endpoints:**

- `GET /{practice_id}/matters/:id/unbilled` - Get all unbilled items

---

## API Reference

### Core Routes

| Method   | Path                         | Description                              |
| -------- | ---------------------------- | ---------------------------------------- |
| `POST`   | `/{practice_id}/matters`     | Create a new matter                      |
| `GET`    | `/{practice_id}/matters`     | List matters (with pagination/filtering) |
| `PUT`    | `/{practice_id}/matters/:id` | Update a matter                          |
| `DELETE` | `/{practice_id}/matters/:id` | Delete a matter                          |

### Sub-Resource Routes

All sub-resource routes are nested under `/{practice_id}/matters/:id/`:

| Resource           | GET             | POST                  | PUT                         | DELETE                      |
| ------------------ | --------------- | --------------------- | --------------------------- | --------------------------- |
| Activity           | `/activity`     | —                     | —                           | —                           |
| Notes              | `/notes`        | `/notes`              | `/notes/:note_id`           | `/notes/:note_id`           |
| Time Entries       | `/time-entries` | `/time-entries`       | `/time-entries/:entry_id`   | `/time-entries/:entry_id`   |
| Time Stats         | `/time-stats`   | —                     | —                           | —                           |
| Expenses           | `/expenses`     | `/expenses`           | `/expenses/:expense_id`     | `/expenses/:expense_id`     |
| Milestones         | `/milestones`   | `/milestones`         | `/milestones/:milestone_id` | `/milestones/:milestone_id` |
| Milestones Reorder | —               | `/milestones/reorder` | —                           | —                           |
| Tasks              | `/tasks`        | —                     | —                           | —                           |
| Unbilled           | `/unbilled`     | —                     | —                           | —                           |

---

## Security Model

### Authentication

All routes require authentication via the `injectAbility` middleware, which:

- Validates the user's session
- Determines the user's role within the organization
- Injects CASL ability into the request context

### Authorization

**Core Routes:** Each service method performs its own access check using `verifyMatterAccess()`.

**Sub-Resource Routes:** Automatic access verification via the `requireMatterAccess()` middleware applied to the sub-router at `/:id/*`.

The access check validates:

1. **Existence** - The matter exists in the database
2. **Organization Ownership** - The matter belongs to the user's organization
3. **CASL Ability** - The user has the appropriate permission (e.g., `read` Matter)

This ensures users cannot access sub-resources of matters they don't have permission to view, even if they know the matter ID.

---

## Module Structure

```
src/modules/matters/
├── http.ts                 # Route registration & middleware setup
├── handlers.ts             # Request handlers
├── routes/
│   ├── index.ts            # Route exports
│   ├── core.routes.ts      # Core CRUD routes
│   ├── activity.routes.ts  # Activity log routes
│   ├── notes.routes.ts     # Note routes
│   ├── time-entries.routes.ts
│   ├── expenses.routes.ts
│   ├── milestones.routes.ts
│   ├── tasks.routes.ts
│   └── unbilled.routes.ts
├── services/
│   ├── matters.service.ts              # Core matter business logic
│   ├── matter-activity.service.ts      # Activity log logic
│   ├── matter-notes.service.ts         # Notes logic
│   ├── matter-time-entries.service.ts  # Time tracking logic
│   ├── matter-expenses.service.ts      # Expenses logic
│   └── matter-milestones.service.ts    # Milestones logic
├── database/
│   ├── schema/             # Drizzle ORM table definitions
│   └── queries/            # Database query repositories
├── types/                  # TypeScript types and Zod schemas
└── validations/            # Request validation schemas
```

---

## Related Modules

- **Clients** - Matter clients are managed in the client intake module
- **Invoices** - Unbilled items are converted to invoices
- **Billing** - Time entries and expenses feed into billing workflows
- **Trust** - Trust accounting may be linked to matters
- **Documents** - Document management is matter-scoped

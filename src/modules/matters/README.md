# Matters Module

## Purpose

Provides **legal matter/case management** workflows with:
- **Matter tracking** with billing types (hourly, fixed, contingency)
- **Time entries** for billable hours tracking
- **Expenses** tracking (billable and non-billable)
- **Milestones** for fixed-fee and milestone-based billing
- **Notes** for matter documentation
- **Activity log** for audit trail
- **Practice areas** for matter categorization
- **Assignees** for team member assignment

This module follows the pattern used by other modules (`http.ts` + services + queries + validations).

## Data Model

### Tables

| Table | Description |
|-------|-------------|
| `practice_areas` | Legal practice area definitions (e.g., Family Law, Criminal Defense) |
| `matters` | Core matter/case records with billing configuration |
| `matter_assignees` | Many-to-many pivot table for matter team members |
| `matter_notes` | Notes and comments on matters |
| `matter_time_entries` | Time tracking with duration calculation |
| `matter_expenses` | Expense records with billable flag |
| `matter_milestones` | Payment milestones for fixed-fee billing |
| `matter_activity_log` | Audit trail of all matter activities |

### Schema Files
- `src/modules/matters/database/schema/practice-areas.schema.ts`
- `src/modules/matters/database/schema/matters.schema.ts`
- `src/modules/matters/database/schema/matter-assignees.schema.ts`
- `src/modules/matters/database/schema/matter-notes.schema.ts`
- `src/modules/matters/database/schema/matter-time-entries.schema.ts`
- `src/modules/matters/database/schema/matter-expenses.schema.ts`
- `src/modules/matters/database/schema/matter-milestones.schema.ts`
- `src/modules/matters/database/schema/matter-activity-log.schema.ts`

### Matter Billing Types

| Type | Fields Used |
|------|-------------|
| `hourly` | `adminHourlyRate`, `attorneyHourlyRate` |
| `fixed` | `totalFixedPrice`, `paymentFrequency` (project/milestone) |
| `contingency` | `contingencyPercentage`, `settlementAmount` |

### Matter Status
- `draft` - Matter is being set up
- `active` - Matter is active and billable

## API

All routes are mounted under `/api/organizations/:organizationId/...`

### Practice Areas
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/practice-areas` | List practice areas |
| `POST` | `/practice-areas` | Create practice area |
| `PUT` | `/practice-areas/:id` | Update practice area |
| `DELETE` | `/practice-areas/:id` | Delete practice area |

### Matters
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/matters` | List matters (with filters) |
| `POST` | `/matters` | Create matter |
| `GET` | `/matters/:uuid` | Get matter by ID |
| `PUT` | `/matters/:uuid` | Update matter |
| `DELETE` | `/matters/:uuid` | Soft delete matter |
| `GET` | `/matters/:uuid/activity` | Get activity log |
| `GET` | `/matters/counts` | Get counts by status |

#### Query Parameters for List
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `status` - Filter by status (draft/active)
- `practiceAreaId` - Filter by practice area
- `customerId` - Filter by customer
- `assigneeId` - Filter by assignee
- `search` - Search by title

### Assignees
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/matters/:uuid/assignees` | List assignees |
| `POST` | `/matters/:uuid/assignees` | Add assignee |
| `DELETE` | `/matters/:uuid/assignees/:userId` | Remove assignee |

### Notes
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/matters/:uuid/notes` | List notes |
| `POST` | `/matters/:uuid/notes` | Create note |
| `PUT` | `/matters/:uuid/notes/:noteId` | Update note |
| `DELETE` | `/matters/:uuid/notes/:noteId` | Delete note |

### Time Entries
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/matters/:uuid/time-entries` | List time entries |
| `POST` | `/matters/:uuid/time-entries` | Create time entry |
| `PUT` | `/matters/:uuid/time-entries/:entryId` | Update time entry |
| `DELETE` | `/matters/:uuid/time-entries/:entryId` | Delete time entry |
| `GET` | `/matters/:uuid/time-entries/stats` | Get time statistics |

### Expenses
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/matters/:uuid/expenses` | List expenses |
| `POST` | `/matters/:uuid/expenses` | Create expense |
| `PUT` | `/matters/:uuid/expenses/:expenseId` | Update expense |
| `DELETE` | `/matters/:uuid/expenses/:expenseId` | Delete expense |
| `GET` | `/matters/:uuid/expenses/stats` | Get expense statistics |

### Milestones
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/matters/:uuid/milestones` | List milestones |
| `POST` | `/matters/:uuid/milestones` | Create milestone |
| `PUT` | `/matters/:uuid/milestones/:milestoneId` | Update milestone |
| `DELETE` | `/matters/:uuid/milestones/:milestoneId` | Delete milestone |
| `POST` | `/matters/:uuid/milestones/reorder` | Reorder milestones |
| `GET` | `/matters/:uuid/milestones/stats` | Get milestone statistics |

## Services

| Service | File | Description |
|---------|------|-------------|
| Practice Areas | `practice-areas.service.ts` | CRUD for practice areas |
| Matters | `matters.service.ts` | Core matter operations |
| Notes | `matter-notes.service.ts` | Note management |
| Time Entries | `matter-time-entries.service.ts` | Time tracking with auto duration |
| Expenses | `matter-expenses.service.ts` | Expense management |
| Milestones | `matter-milestones.service.ts` | Milestone management |
| Activity | `matter-activity.service.ts` | Activity logging |

## Activity Logging

All matter operations are logged to `matter_activity_log` with:
- `action` - Type of action (e.g., `matter_created`, `time_entry_added`)
- `description` - Human-readable description
- `userId` - Who performed the action
- `metadata` - Additional context (JSON)

### Activity Actions
```typescript
ActivityAction = {
  MATTER_CREATED, MATTER_UPDATED, MATTER_DELETED, MATTER_STATUS_CHANGED,
  NOTE_ADDED, NOTE_UPDATED, NOTE_DELETED,
  TIME_ENTRY_ADDED, TIME_ENTRY_UPDATED, TIME_ENTRY_DELETED,
  EXPENSE_ADDED, EXPENSE_UPDATED, EXPENSE_DELETED,
  MILESTONE_CREATED, MILESTONE_UPDATED, MILESTONE_DELETED, MILESTONE_COMPLETED,
  ASSIGNEE_ADDED, ASSIGNEE_REMOVED,
}
```

## Integration with Other Modules

### Uploads Module
The uploads module already supports `matterId` field for file attachments:
- Documents can be linked to matters via `matter_id`
- Use `upload_context: "matter"` when uploading

### Organizations
- Matters belong to organizations via `organizationId`
- Authorization checks verify user has access to the organization

### Users
- Matters can have a `customerId` (client user)
- Assignees are linked to users
- Time entries track which user logged time

## Setup

### 1. Generate Database Migration
```bash
pnpm run db:generate
```

### 2. Run Migration
```bash
pnpm run db:migrate
```

### 3. Register Module (if not already done)
In your main app file:
```typescript
import mattersApp from '@/modules/matters';

app.route('/api', mattersApp);
```

## File Structure

```
src/modules/matters/
├── database/
│   ├── queries/
│   │   ├── matters.queries.ts
│   │   ├── matter-notes.queries.ts
│   │   ├── matter-time-entries.queries.ts
│   │   ├── matter-expenses.queries.ts
│   │   ├── matter-milestones.queries.ts
│   │   └── practice-areas.queries.ts
│   └── schema/
│       ├── matters.schema.ts
│       ├── matter-assignees.schema.ts
│       ├── matter-notes.schema.ts
│       ├── matter-time-entries.schema.ts
│       ├── matter-expenses.schema.ts
│       ├── matter-milestones.schema.ts
│       ├── matter-activity-log.schema.ts
│       ├── practice-areas.schema.ts
│       └── index.ts
├── services/
│   ├── matters.service.ts
│   ├── matter-notes.service.ts
│   ├── matter-time-entries.service.ts
│   ├── matter-expenses.service.ts
│   ├── matter-milestones.service.ts
│   ├── matter-activity.service.ts
│   └── practice-areas.service.ts
├── validations/
│   ├── matters.validation.ts
│   ├── matter-notes.validation.ts
│   ├── matter-time-entries.validation.ts
│   ├── matter-expenses.validation.ts
│   ├── matter-milestones.validation.ts
│   └── practice-areas.validation.ts
├── types/
│   └── matter.types.ts
├── http.ts
├── index.ts
└── README.md
```

## Notes / Follow-ups

- **Soft delete**: Matters use soft delete with `deletedAt` and `deletedBy` fields
- **Time calculation**: Duration is automatically calculated from start/end times in seconds
- **Milestone reordering**: Supports drag-and-drop reorder via `order` field
- **Statistics endpoints**: Return totals for billable time, expenses, and milestone completion
